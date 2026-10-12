import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { castAutomatedSpell, hasAutoSpell, spellHandlerIds } from './src/automated-effects.mjs';
import {automationStatus} from './src/automation-status.mjs';
import {validateExtraSummon, EXTRA_RECIPES} from './src/extra-summons.mjs';
import {applyFieldAbility,FIELD_ABILITY_IDS} from './src/field-abilities.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,'public');
const DATA_DIR=process.env.DATA_DIR || path.join(ROOT,'.data');
const STORAGE=path.join(DATA_DIR,'rooms.json');
const RULES='1.3-ai-beta.6';
const CARD_PATH=path.join(PUBLIC,'data','catalog.json.gz.b64');
function loadCatalog(){
 if(fs.existsSync(CARD_PATH))return JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(CARD_PATH,'utf8').trim(),'base64')).toString('utf8'));
 return JSON.parse(fs.readFileSync(path.join(PUBLIC,'data','catalog.json'),'utf8'));
}
const catalog=loadCatalog();
const decks=new Map(catalog.decks.map(d=>[d.id,d]));
const cards=new Map(catalog.cards.map(c=>[c.id,c]));
if(catalog.decks.length!==24 || catalog.cards.length!==254)throw new Error('v1.3 catalog is incomplete');
fs.mkdirSync(DATA_DIR,{recursive:true});
let rooms={};
if(fs.existsSync(STORAGE)){
 try{rooms=JSON.parse(fs.readFileSync(STORAGE,'utf8'));}catch(e){throw new Error('Room persistence corrupted; refusing overwrite: '+e.message)}
}
let sequence=0;
const randomCode=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
const secret=()=>crypto.randomBytes(32).toString('hex');
const unitName=(r,id)=>cards.get(r.units[id]?.cardId)?.name||r.units[id]?.tokenCard?.name||'생성 카드';
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const uid=()=>`u${Date.now().toString(36)}${(++sequence).toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
function save(){const tmp=STORAGE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rooms));fs.renameSync(tmp,STORAGE)}
function fail(status,message){const e=new Error(message);e.status=status;throw e}
function requireStr(s,max=180){if(typeof s!=='string'||s.length>max)fail(400,'문자열 형식이 올바르지 않습니다.');return s.trim()}
function getRoom(code){const r=rooms[requireStr(code,8).toUpperCase()];if(!r)fail(404,'대전방을 찾을 수 없습니다.');return r}
function indexFor(r,token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(401,'플레이어 인증이 필요합니다.');const h=hash(token);const idx=r.players.findIndex(p=>p.authHash&&crypto.timingSafeEqual(Buffer.from(p.authHash,'hex'),Buffer.from(h,'hex')));if(idx<0)fail(403,'이 방에 접근할 권한이 없습니다.');return idx}
function requireTurn(r,p){if(r.status!=='active')fail(409,'진행 중인 대전이 아닙니다.');if(r.turn!==p)fail(403,'상대방의 턴입니다.');}
function log(r,type,text){r.logs.push({id:uid(),at:new Date().toISOString(),turn:r.turnNumber,type,text});if(r.logs.length>500)r.logs.shift()}
function setOutcome(r){const lost=r.players.map(p=>p.hp<=0);if(lost[0]||lost[1]){r.status='finished';r.winner=lost[0]&&lost[1]?'draw':lost[0]?1:0;r.pendingAttack=null;r.pendingManual=null;log(r,'result',r.winner==='draw'?'두 플레이어가 동시에 패배하여 무승부입니다.':`${r.players[r.winner].label} 승리`);}}
function instantiate(r,cardId,owner){const c=cards.get(cardId);if(!c)fail(400,'존재하지 않는 카드입니다.');const id=uid();r.units[id]={id,cardId,owner,atk:Number.isFinite(+c.atk)?Math.max(0,Math.floor(+c.atk)):0,hp:Number.isFinite(+c.hp)?Math.floor(+c.hp):null,attackTurn:-1,created:false,baseAtk:Number.isFinite(+c.atk)?Math.max(0,Math.floor(+c.atk)):0};return id}
function createPlayer(r,deckId,label,auth){const d=decks.get(deckId);if(!d)fail(400,'유효하지 않은 덱입니다.');const i=r.players.length;const p={label:requireStr(label??'',24)||`플레이어 ${i+1}`,authHash:hash(auth),deckId,hp:1000,reloads:0,deck:[],hand:[],grave:[],banished:[],extra:[],field:[null,null,null],integration:null,turnsTaken:0,roundPlays:0,lastRoundPlays:0,roundElementUses:0,naturalStreak:0};r.players.push(p);for(const id of d.main)p.deck.push(instantiate(r,id,i));for(const id of d.extra)p.extra.push(instantiate(r,id,i));return p}
function draw(r,who){const p=r.players[who];if(!p.deck.length){const feedback=100+50*p.reloads;p.reloads++;if(p.grave.length){p.deck.push(...p.grave.splice(0));shuffle(p.deck)}p.hp-=feedback;log(r,'reload',`${p.label}: 리로드 피해 ${feedback}, 덱 ${p.deck.length}장`);setOutcome(r);if(r.status==='finished')return;if(!p.deck.length){log(r,'draw',`${p.label}: 드로우 실패 (덱과 묘지에 카드 없음)`);
if(r.players[1-who].integration&&r.units[r.players[1-who].integration]?.cardId==='COC-07-007'){p.hp=0;log(r,'effect','포식자 알리자 라팍스: 상대의 드로우 실패로 패배');setOutcome(r)}return;}}const id=p.deck.shift();p.hand.push(id);log(r,'draw',`${p.label}가 카드를 1장 뽑았습니다.`)}
function move(r,id,to,owner){const u=r.units[id];if(!u)fail(400,'카드를 찾을 수 없습니다.');if(to==='field'&&!r.players[owner??u.owner].field.includes(null))fail(409,'필드 세 칸이 모두 차 있습니다.');if(to==='integration'&&r.players[owner??u.owner].integration)fail(409,'이미 일체화 중입니다.');for(const p of r.players){for(const zone of ['field']){for(let i=0;i<p[zone].length;i++)if(p[zone][i]===id)p[zone][i]=null;}if(p.integration===id)p.integration=null;for(const zone of ['deck','hand','grave','banished','extra'])p[zone]=p[zone].filter(v=>v!==id)}const p=r.players[owner??u.owner];if(!['field','integration'].includes(to)){u.frozen=false;u.battleInvulnerable=false;u.effectsNegated=false;u.diceMax=undefined;u.diceMin=undefined;u.cannotAttack=false;u.attackTurn=-1;u.attackCount=0;u.attackCountTurn=-1;const original=cards.get(u.cardId);if(original){u.atk=Number.isFinite(+original.atk)?Math.max(0,Math.floor(+original.atk)):0;u.hp=Number.isFinite(+original.hp)?Math.floor(+original.hp):null;u.baseAtk=u.atk;}delete u.temporaryBuff;delete u.buffExpiresAt;}if(u.created&&to!=='field'&&to!=='integration'){delete r.units[id];return}if(to==='field'){const slot=p.field.findIndex(x=>x===null);if(slot<0)fail(409,'필드 세 칸이 모두 차 있습니다.');p.field[slot]=id;u.owner=u.owner??owner;u.attackTurn=-1;}else if(to==='integration'){if(p.integration)fail(409,'이미 일체화 중입니다.');p.integration=id;}else if(to==='banished')p.banished.push(id);else if(to==='deck'){p.deck.unshift(id);}else if(to==='hand')p.hand.push(id);else if(to==='grave'){p.grave.push(id);u.atk=Math.max(0,Number(cards.get(u.cardId)?.atk)||0);u.hp=Number.isFinite(+cards.get(u.cardId)?.hp)?+cards.get(u.cardId).hp:null;u.attackTurn=-1;}else fail(400,'이동 위치가 유효하지 않습니다.');}
function zoneOwner(r,id){for(let i=0;i<r.players.length;i++){const p=r.players[i];for(const z of ['deck','hand','grave','extra','banished'])if(p[z].includes(id))return {player:i,zone:z};if(p.field.includes(id))return {player:i,zone:'field'};if(p.integration===id)return {player:i,zone:'integration'};}return null}
function damageUnit(r,id,value,{battle=false}={}){const u=r.units[id];if(!u||u.hp===null)fail(409,'체력이 없는 카드입니다.');if(value<0&&u.cardId==='COC-09-002')value=Math.max(-1,value);u.preDamageHp=u.hp;u.hp+=value;if(u.hp<=0){if(battle&&u.cardId==='COC-26-011'){u.hp=1;return false}H.destroy(r,id);return true}return false}
function dropFromDeck(r,who,count){
 const p=r.players[who];for(let i=0;i<count&&p.deck.length;i++){const id=p.deck.shift();p.grave.push(id);log(r,'mill',`${p.label}가 덱 맨 위의 카드 1장을 묘지로 보냈습니다.`)}
}
function findCardInDeck(r,who,name){const p=r.players[who];const id=p.deck.find(id=>cards.get(r.units[id].cardId)?.name.includes(name));if(id){move(r,id,'hand',who);log(r,'search',`${p.label}가 덱에서 ${cards.get(r.units[id].cardId).name}를 공개하고 패로 가져왔습니다.`)}return id}
function die(n,min=1){const maximum=Math.min(Math.max(1,Math.floor(n)),100_000_000);const minimum=Math.max(1,Math.min(maximum,Math.floor(min)));return crypto.randomInt(minimum,maximum+1)}
function hurt(r,id,n){damageUnit(r,id,-n)}
function healUnit(r,id,n){damageUnit(r,id,n)}
function evolve(r,id,c){const u=r.units[id];const prev=u.cardId;u.cardId=c.id;u.atk+=Math.max(0,Number(c.atk)||0);u.hp=(u.hp??0)+(Number(c.hp)||0);log(r,'evolve',`${cards.get(prev)?.name} → ${c.name}`)}
function summonToken(r,who,name,atk,hp){
 const p=r.players[who];if(!p.field.includes(null))return null;
 const id=uid(),cardId='TOKEN:'+name;
 r.units[id]={id,cardId,owner:who,atk,hp,baseAtk:atk,attackTurn:-1,created:true,tokenCard:{id:cardId,name,type:'몬스터',zone:'created',attribute:'토큰',atk:String(atk),hp:String(hp),conditions:[],effects:[],notes:[]}};
 p.field[p.field.indexOf(null)]=id;log(r,'token',`${p.label}: ${name} 토큰 소환`);return id
}
function destroyed(r,id){const z=zoneOwner(r,id),u=r.units[id];if(!z||!u)return;const before=Math.max(0,u.hp??0);
 // One-time effects inspect the pre-destruction HP. Current health on lethal damage is already <=0;
 // reliable previous HP is captured by caller below.
 for(const eff of [...(r.effects||[])])if(eff.type==='firstDestroyHeal'&&eff.turn===r.turnNumber){r.players[eff.player].hp+=u.hp<=0?Math.max(0,u.preDamageHp||0):before;r.effects.splice(r.effects.indexOf(eff),1)}
}
const H={
 zone:zoneOwner,move,draw,fail,roll:die,randomInt:n=>crypto.randomInt(n),hurt,healUnit,outcome:setOutcome,shuffle,onSummon:runSummonEffects,
 mill:dropFromDeck,summonToken,search:findCardInDeck,destroy:(r,id)=>{const u=r.units[id];if(u&&zoneOwner(r,id)){
 destroyed(r,id);const z=zoneOwner(r,id),canRevive=u.cardId==='COC-10-011'&&!u.revivedOnce&&z.zone==='field';
 const name=cards.get(u.cardId)?.name||u.tokenCard?.name;move(r,id,'grave',u.owner);log(r,'destroy',`${name} 파괴`);
 if(canRevive&&r.units[id]&&r.players[z.player].field.includes(null)){
  u.revivedOnce=true;move(r,id,'field',z.player);log(r,'revive',`${name}: 파괴 후 효과 없이 1회 부활`)
 }
 }} ,
 name:(r,id)=>cards.get(r.units[id]?.cardId)?.name||'',attribute:(r,id)=>cards.get(r.units[id]?.cardId)?.attribute||'',
 originalOwner:(r,id)=>r.units[id].owner,type:(r,id)=>cards.get(r.units[id].cardId)?.type,capture:(r,who,id)=>move(r,id,'field',who),cardNamed:(r,who,name)=>catalog.cards.find(c=>c.deckId===r.players[who].deckId&&c.name.replace(/\s+/g,'').includes(name.replace(/\s+/g,''))),evolve
};
function runSummonEffects(r,who,id,body={}){const u=r.units[id],p=r.players[who];switch(u.cardId){
 case 'COC-12-003':findCardInDeck(r,who,'F=HERO');break;
 case 'COC-12-004':if(p.hand.length<=1){draw(r,who);if(r.status==='active')draw(r,who)}break;
 case 'COC-27-001':draw(r,who);if(r.status==='active')draw(r,1-who);break;
 case 'COC-23-003':p.hp+=100;break;
 case 'COC-24-002':case 'COC-26-002':findCardInDeck(r,who,'베스트 지니어스');break;
 case 'COC-23-004':findCardInDeck(r,who,'라이드 위저드');break;
 case 'COC-20-009':hurt(r,id,100);findCardInDeck(r,who,'버닝 데몬즈 드래곤');break;
 case 'COC-10-001':{
  const created=catalog.cards.find(c=>c.deckId==='10'&&c.zone==='created'&&c.name.includes('찌꺼기'));
  if(created){const copy=instantiate(r,created.id,who);r.units[copy].atk=u.atk;r.units[copy].hp=u.hp;p.hand.push(copy)}break;
 }
 case 'COC-10-007':if(p.field.includes(null)){const copy=instantiate(r,u.cardId,who);move(r,copy,'field',who)}break;
 case 'COC-05-010':draw(r,who);if(r.status==='active')draw(r,1-who);break;
 case 'COC-07-002':dropFromDeck(r,1-who,2);break;
 case 'COC-08-001':{const mid=body.target?.id;if(!mid||!zoneOwner(r,mid)||zoneOwner(r,mid).zone!=='field')fail(409,'패로 돌릴 필드 몬스터를 지정해 주세요.');move(r,mid,'hand',r.units[mid].owner);break}
 case 'COC-08-008':{const mid=body.target?.id,z=mid&&zoneOwner(r,mid);if(!z||z.player!==1-who||z.zone!=='field')fail(409,'탈취할 상대 몬스터를 지정해 주세요.');move(r,mid,'field',who);break}
 case 'COC-10-003':{if(p.hp>500){const loss=p.hp-500;p.hp=500;r.players[1-who].hp-=loss;setOutcome(r)}break}
 case 'COC-10-004':r.players[1-who].noAttackUntil=(r.players[1-who].turnsTaken||0)+1;break;
 case 'COC-12-010':{const all=r.players.flatMap(pp=>[...pp.field,pp.integration].filter(Boolean));for(const mid of all){if(mid===id)continue;if(zoneOwner(r,mid))move(r,mid,'deck',r.units[mid].owner)}break}
 case 'COC-14-005':summonToken(r,who,'스톰 토큰',0,50);break;
 case 'COC-19-006':{const snapshots=r.players.flatMap((pp,controller)=>pp.field.filter(Boolean).map(mid=>({mid,controller})));for(const {mid} of snapshots)H.destroy(r,mid);for(const {mid,controller} of snapshots){if(r.units[mid]&&zoneOwner(r,mid)?.zone==='grave'&&r.players[controller].field.includes(null)){move(r,mid,'field',controller);r.units[mid].cannotAttackUntil=r.turnNumber;}}break}
 case 'COC-27-003':{let n=0;for(let k=0;k<2;k++){if(!p.deck.length)break;const mid=p.deck.shift();const mc=cards.get(r.units[mid].cardId);p.grave.push(mid);n++;if(k===0&&mc.type!=='몬스터')break}u.atk+=50*n;u.hp=(u.hp??0)+50*n;log(r,'mill',`${p.label}: 분쇄차 티라노 소재 ${n}장 묘지 이동`);break}
 case 'COC-27-004':for(const pp of r.players)for(const mid of [...pp.field].filter(Boolean))H.destroy(r,mid);break;
 case 'COC-31-001':draw(r,die(2)===1?who:1-who);break;
 case 'COC-31-002':{const enemyMonsters=r.players[1-who].field.filter(Boolean),mid=body.target?.id,z=mid&&zoneOwner(r,mid);if(enemyMonsters.length&&(!z||z.player!==1-who||z.zone!=='field'))fail(409,'동전 판정 전에 상대 필드 몬스터를 지정해 주세요.');let h=0;for(let k=0;k<3;k++)if(die(2)===1)h++;if(h===2&&enemyMonsters.length){r.units[mid].atk=Math.max(0,r.units[mid].atk-100);if(r.units[mid].atk===0)H.destroy(r,mid)}break}
 case 'COC-31-003':{let h=0;for(let k=0;k<5;k++)if(die(2)===1)h++;r.players[1-who].hp-=h*100;setOutcome(r);break}
 case 'COC-19-003':break;
 case 'COC-20-001':break;
 default:break;
 }}
function runIntegrationOnEnter(r,who,id){const u=r.units[id],p=r.players[who];switch(u.cardId){
 case 'COC-05-009':p.hp=100;break;
 case 'COC-17-001':for(const mid of p.field.filter(Boolean)){r.units[mid].atk+=50;r.units[mid].hp=(r.units[mid].hp??0)+50}break;
 case 'COC-19-006':runSummonEffects(r,who,id);break;
 case 'COC-30-010':p.hp+=800;break;
 default:break;
 }}
function processStartOfTurn(r){const who=r.turn,p=r.players[who];p.turnsTaken=(p.turnsTaken||0)+1;p.aiRejected=[];p.aiRejectedAbilities=[];for(const u of Object.values(r.units)){if(u.buffExpiresAt&&u.buffExpiresAt<=p.turnsTaken&&u.owner===who){u.atk=Math.max(0,u.atk-(u.temporaryBuff||0));u.temporaryBuff=0;u.buffExpiresAt=0}}p.lastRoundPlays=p.roundPlays||0;p.roundPlays=0;p.roundElementUses=0;
 
 // Passive draw-phase triggers happen before the normal draw action.
 const enemyIntegration=r.players[1-who].integration;
 if(enemyIntegration&&r.units[enemyIntegration]?.cardId==='COC-07-001')dropFromDeck(r,who,2);
 const imugi=p.deck.find(id=>r.units[id]?.cardId==='COC-11-001');
 if(imugi&&!p.field.some(id=>id&&/용|드래곤/.test(cards.get(r.units[id].cardId)?.attribute||''))){move(r,imugi,'hand',who);log(r,'effect',`${p.label}: 낙동강 이무기를 드로우 외 추가로 패에 넣습니다.`)}
 if(p.bonusDrawOnTurn===p.turnsTaken){p.bonusDrawOnTurn=0;draw(r,who)}
 if(r.effects)for(const e of [...r.effects]){
  if(e.type!=='dot')continue;
  if(e.target.id){const z=zoneOwner(r,e.target.id);if(!z||!['field','integration'].includes(z.zone)){r.effects.splice(r.effects.indexOf(e),1);continue}hurt(r,e.target.id,e.damage)}
  else r.players[e.target.player].hp-=e.damage;
 }
 for(const id of [...p.field].filter(Boolean)){
  const u=r.units[id];if(u.cardId==='COC-19-003'){H.destroy(r,id);for(const pp of r.players)for(const mid of [...pp.field].filter(Boolean))move(r,mid,'hand',r.units[mid].owner);}
 }
 setOutcome(r);
}
function processEndOfTurn(r){
 for(const e of [...(r.effects||[])])if(e.type==='returnWakeup'&&e.player===r.turn&&e.turn===r.turnNumber){
  if(zoneOwner(r,e.spellId)?.zone==='grave'){move(r,e.spellId,'hand',e.player);log(r,'effect','웨이크업 드래곤! 엔드 페이즈 패 복귀')}
  r.effects.splice(r.effects.indexOf(e),1);
 }
 const p=r.players[r.turn];for(const id of [...p.field].filter(Boolean))if(r.units[id].cardId==='COC-20-001'){hurt(r,id,150)}
 setOutcome(r);
}
function isAggro(r,id){const c=cards.get(r.units[id]?.cardId);return c?.id==='COC-12-007'||c?.id==='COC-08-002'||c?.id==='COC-09-004'||c?.id==='COC-21-008'}
function maxAttacks(u,turn){const base=u.cardId==='COC-09-003'?2:Math.max(1,u.extraAttacks||1);return base+(u.bonusAttackTurn===turn?(u.bonusAttackCount||0):0)}
function attackAvailable(u,turn){return u.attackCountTurn!==turn||(u.attackCount||0)<maxAttacks(u,turn)}
function validateAggro(r,who,target){const aggro=r.players[1-who].field.filter(id=>id&&isAggro(r,id));if(aggro.length&&(!target||target.type!=='unit'||!aggro.includes(target.id)))fail(409,'공격 대상 강제(어그로): 해당 몬스터 중에서 선택해야 합니다.')}
function isSimpleSummonCard(c){return c.type==='몬스터'&&(!c.conditions.length||c.conditions.every(s=>/공격|이 몬스터|효과|드로우|시작|턴/.test(s)))}
function performExtraSummon(r,who,body){
 const p=r.players[who],extraUnitId=requireStr(body.extraUnitId,100);
 const recipe=validateExtraSummon({room:r,who,extraUnitId,materials:body.materials,spellUnitId:body.spellUnitId,cards});
 if(recipe.spellUnitId&&p.spellForbiddenUntil>0&&p.spellForbiddenUntil>=p.turnsTaken)fail(409,'주문 사용 금지 상태에서는 퓨전 주문을 발동할 수 없습니다.');
 // Validating all preconditions before spending materials or spells.
 if(recipe.spellUnitId)move(r,recipe.spellUnitId,'grave',who);
 for(const id of recipe.materials){if(recipe.method==='wakeup')H.destroy(r,id);else move(r,id,'grave',r.units[id].owner)}
 move(r,extraUnitId,'field',who);
 if(['COC-12-014','COC-26-012','COC-27-013'].includes(r.units[extraUnitId].cardId))r.units[extraUnitId].cannotAttack=true;
 if(recipe.method==='wakeup'){r.effects??=[];r.effects.push({type:'returnWakeup',spellId:recipe.spellUnitId,player:who,turn:r.turnNumber})}
 const c=cards.get(r.units[extraUnitId].cardId);
 log(r,'fusion',`${p.label}: ${c.name} 소환 (소재 ${recipe.materials.length}장, ${recipe.method})`);
 if(c.id==='COC-12-012'){
  const eligible=r.players[1-who].field.filter(Boolean).filter(id=>Math.max(0,Number(cards.get(r.units[id].cardId)?.atk)||0)<r.units[extraUnitId].atk);
  if(eligible.length){if(!eligible.includes(body.target?.id))fail(409,'파괴할 유효한 상대 몬스터를 지정하세요.');H.destroy(r,body.target.id)}
 }
 if(c.id==='COC-22-015')findCardInDeck(r,who,'퓨전업')||findCardInDeck(r,who,'퓨전 업');
 setOutcome(r);
 return recipe;
}
function runManual(r,m){const x=m.payload;const p=r.players;switch(m.kind){
 case 'hp':{if(![0,1].includes(x.player)||!Number.isInteger(x.delta)||Math.abs(x.delta)>1000)fail(400,'체력 변경 범위 오류');p[x.player].hp+=x.delta;setOutcome(r);break}
 case 'unitHp':{if(!r.units[x.unitId]||!zoneOwner(r,x.unitId)||!['field','integration'].includes(zoneOwner(r,x.unitId).zone)||!Number.isInteger(x.delta)||Math.abs(x.delta)>1000)fail(400,'몬스터 변경 오류');damageUnit(r,x.unitId,x.delta);break}
 case 'unitAtk':{if(!r.units[x.unitId]||!zoneOwner(r,x.unitId)||!['field','integration'].includes(zoneOwner(r,x.unitId).zone)||!Number.isInteger(x.delta)||Math.abs(x.delta)>1000)fail(400,'공격력 변경 오류');r.units[x.unitId].atk=Math.max(0,r.units[x.unitId].atk+x.delta);break}
 case 'move':{const z=zoneOwner(r,x.unitId);if(!z||!['field','integration'].includes(z.zone)||!['grave','hand','deck','banished'].includes(x.to))fail(400,'이동 대상 오류');move(r,x.unitId,x.to,r.units[x.unitId].owner);break}
 case 'draw':{if(![0,1].includes(x.player)||!Number.isInteger(x.count)||x.count<1||x.count>5)fail(400,'드로우 수 오류');for(let k=0;k<x.count&&r.status==='active';k++)draw(r,x.player);break}
 case 'extra':{
  if(x.player!==m.by)fail(403,'소환자는 발동자와 일치해야 합니다.');
  if(r.turn!==m.by||r.phase!=='MAIN')fail(409,'엑스트라 소환의 수동 승인도 자신의 메인 페이즈에만 가능합니다.');
  const id=r.players[x.player].extra.find(unit=>r.units[unit].cardId===x.cardId);
  if(!id)fail(409,'해당 엑스트라 카드를 찾을 수 없습니다.');
  performExtraSummon(r,x.player,{extraUnitId:id,materials:x.materials,spellUnitId:x.spellUnitId,target:x.target});
  break;
 }
 case 'note':break;
 default:fail(400,'허용되지 않는 수동 판정 유형');
 }}
function publicState(r,viewer){const mapId=id=>id?{...r.units[id],card:cards.get(r.units[id].cardId)||r.units[id].tokenCard}:null;return {code:r.code,status:r.status,version:r.version,rulesVersion:RULES,mode:r.mode||'pvp',difficulty:r.aiDifficulty||null,aiDeckId:r.mode==='ai'?r.players[1]?.deckId:null,automation:{supportedSpells:spellHandlerIds.length,totalSpells:catalog.cards.filter(c=>c.type==='주문').length,fieldAbilityIds:FIELD_ABILITY_IDS},turn:r.turn,phase:r.phase,turnNumber:r.turnNumber,winner:r.winner,pendingAttack:r.pendingAttack?{...r.pendingAttack,attacker:mapId(r.pendingAttack.attackerId),target:r.pendingAttack.target}:null,pendingManual:r.pendingManual?{...r.pendingManual}:null,logs:r.logs.slice(-80),you:viewer,players:r.players.map((p,i)=>({index:i,label:p.label,deckId:p.deckId,deckName:decks.get(p.deckId)?.name,hp:p.hp,reloads:p.reloads,deckCount:p.deck.length,handCount:p.hand.length,grave:p.grave.map(mapId),banishedCount:p.banished.length,extraCount:p.extra.length,field:p.field.map(mapId),integration:mapId(p.integration),hand:i===viewer?p.hand.map(mapId):null,extra:i===viewer?p.extra.map(mapId):null}))}}
function apply(r,who,type,body){const p=r.players[who];let changed=true;
 switch(type){
 case 'start':{if(r.status!=='lobby'||r.players.length!==2||who!==0)fail(409,'방장만 두 사람이 모인 뒤 시작할 수 있습니다.');r.status='active';r.turn=crypto.randomInt(2);r.turnNumber=1;r.phase='DRAW';for(const pp of r.players)shuffle(pp.deck);
 for(let i=0;i<2;i++){
  const pp=r.players[i];for(const id of [...pp.deck]){
   const card=cards.get(r.units[id].cardId);
   const guaranteed=(card.id==='COC-09-001'&&pp.deck.filter(x=>/무기/.test(cards.get(r.units[x].cardId)?.attribute||'')).length>=3)
    ||(card.id==='COC-01-001'&&pp.deck.filter(x=>cards.get(r.units[x].cardId)?.type==='주문').length>=5);
   if(guaranteed){move(r,id,'hand',i);log(r,'start',`${pp.label}: ${card.name} 시작 손패 보장`)}}
 }
 for(let k=0;k<2;k++)for(let i=0;i<2;i++)if(r.players[i].hand.length<2)draw(r,i);log(r,'start',`코인 토스로 ${r.players[r.turn].label} 선공 결정`);processStartOfTurn(r);break}
 case 'draw':{requireTurn(r,who);if(r.phase!=='DRAW')fail(409,'드로우 페이즈가 아닙니다.');draw(r,who);if(r.status==='active')r.phase='MAIN';break}
 case 'phase':{requireTurn(r,who);if(r.pendingAttack||r.pendingManual)fail(409,'대응·협의 중에는 페이즈를 변경할 수 없습니다.');if(r.phase==='MAIN'){r.phase=body.skipAttack?'END':'ATTACK';}else if(r.phase==='ATTACK'){r.phase='END';}else if(r.phase==='END'){processEndOfTurn(r);if(r.status!=='active')break;r.turn=1-who;r.turnNumber++;r.phase='DRAW';processStartOfTurn(r);}else fail(409,'먼저 드로우해야 합니다.');for(const unit of Object.values(r.units))if(unit.attackTurn<r.turnNumber-2)unit.attackTurn=-1;log(r,'phase',`${r.players[r.turn].label} / ${r.phase}`);break}
 case 'play':{requireTurn(r,who);if(r.phase!=='MAIN')fail(409,'메인 페이즈에서만 사용할 수 있습니다.');if(r.pendingAttack||r.pendingManual)fail(409,'현재 협의 중입니다.');const id=requireStr(body.unitId,100);if(!p.hand.includes(id))fail(403,'패에 없는 카드입니다.');const u=r.units[id],c=cards.get(u.cardId);if(c.type==='몬스터'){move(r,id,'field',who);runSummonEffects(r,who,id,body)}else if(c.type==='일체화'){if(p.integration)fail(409,'이미 일체화했습니다.');move(r,id,'integration',who);runIntegrationOnEnter(r,who,id)}else if(c.type==='주문'){
 if((p.spellForbiddenUntil||0)>=p.turnsTaken)fail(409,'상대의 주문 사용 금지 효과가 적용 중입니다.');
 const automated=hasAutoSpell(c.id);
 if(!automated&&r.mode==='ai')fail(409,'이 주문의 특수 효과는 아직 자동 판정을 지원하지 않습니다. 다른 카드를 사용해 주세요.');
 if(automated){const result=castAutomatedSpell(r,who,c,body,H);if(result.retain==='field'){move(r,id,'field',who);if(result.monsterized){r.units[id].atk=result.atk;r.units[id].hp=result.hp;r.units[id].cannotAttack=true}}else move(r,id,'grave',who);
  log(r,'effect',`${p.label}: ${c.name} 자동 효과 처리`);
 }else{move(r,id,'grave',who);log(r,'manual',`${p.label}: ${c.name} 주문 사용 — 상대 승인 기반 수동 판정 필요`)}
 }else fail(409,'이 카드 종류는 직접 사용할 수 없습니다.');
 p.roundPlays=(p.roundPlays||0)+1;if(/원소|금속/.test(c.attribute))p.roundElementUses=(p.roundElementUses||0)+1;if(c.attribute==='자연'&&c.type==='주문')p.naturalStreak=(p.naturalStreak||0)+1;
 log(r,'play',`${p.label}: ${c.name} 사용`);setOutcome(r);break}
 case 'ability':{requireTurn(r,who);if(r.phase!=='MAIN'||r.pendingAttack||r.pendingManual)fail(409,'지금은 일반 필드 효과를 사용할 수 없습니다.');const result=applyFieldAbility(r,who,body,H);log(r,'effect',`${p.label}: ${cards.get(result.cardId)?.name} 필드 효과 자동 처리`);setOutcome(r);break}
 case 'extraSummon':{
  requireTurn(r,who);
  if(r.phase!=='MAIN'||r.pendingAttack||r.pendingManual)fail(409,'메인 페이즈에서만 특수 소환할 수 있습니다.');
  performExtraSummon(r,who,body);
  break;
 }
 case 'attack':{requireTurn(r,who);if(r.phase!=='ATTACK'||r.pendingAttack||r.pendingManual||((p.noAttackUntil||0)>=p.turnsTaken))fail(409,'현재 공격할 수 없습니다.');const attacker=r.units[requireStr(body.attackerId,100)];const z=attacker&&zoneOwner(r,attacker.id);if(!z||z.player!==who||!['field','integration'].includes(z.zone)||attacker.atk<1||attacker.cannotAttack||attacker.cannotAttackUntil===r.turnNumber||attacker.frozen||!attackAvailable(attacker,r.turnNumber))fail(409,'공격 가능한 카드가 아닙니다.');const target=body.target;if(!target||!['player','unit'].includes(target.type))fail(400,'공격 대상을 지정해 주세요.');if(target.type==='player'&&target.player!==undefined&&target.player!==1-who)fail(409,'상대 플레이어만 공격할 수 있습니다.');if(target.type==='unit'){const zz=zoneOwner(r,target.id);if(!zz||zz.player===who||zz.zone!=='field')fail(409,'공격할 수 없는 대상입니다.');}if(attacker.cardId==='COC-05-001'&&target.type==='player')fail(409,'카툰 데몬즈 드래곤은 플레이어를 직접 공격할 수 없습니다.');validateAggro(r,who,target);r.pendingAttack={attackerId:attacker.id,target:target.type==='player'?{type:'player',player:1-who}:{type:'unit',id:target.id},stage:'response'};log(r,'attack',`${p.label}: ${unitName(r,attacker.id)} 공격 선언`);break}
 case 'defend':{if(r.status!=='active'||!r.pendingAttack||who===r.turn||r.pendingManual)fail(409,'대응할 공격이 없습니다.');const a=r.pendingAttack,src=r.units[a.attackerId],sourceZone=zoneOwner(r,a.attackerId);if(!sourceZone||sourceZone.player!==r.turn){r.pendingAttack=null;log(r,'attack','공격자가 사라져 공격이 무효화되었습니다.');break;}const tz=a.target.type==='unit'?zoneOwner(r,a.target.id):null;if(a.target.type==='unit'&&(!tz||tz.player!==who||tz.zone!=='field')){a.stage='retarget';log(r,'attack','상대 대응으로 대상이 사라져 공격자가 재선택합니다.');break;}const targetName=a.target.type==='unit'?unitName(r,a.target.id):'플레이어';const max=Math.min(src.atk,src.diceMax??src.atk);const dice=die(max,src.diceMin??1);src.attackTurn=r.turnNumber;if(src.attackCountTurn!==r.turnNumber){src.attackCount=0;src.attackCountTurn=r.turnNumber}src.attackCount++;let dealt=dice;
 if(a.target.type==='unit'){
  const partner=r.players[r.turn].field.some(mid=>mid&&r.units[mid].cardId==='COC-12-006');
  if(partner&&cards.get(src.cardId)?.attribute==='영웅')dealt+=100;
  const targetUnit=r.units[a.target.id],prior=Math.max(0,targetUnit.hp??0),targetAtk=targetUnit.atk,invulnerable=targetUnit.battleInvulnerable;
  if(!invulnerable){const destroyed=damageUnit(r,a.target.id,-dealt,{battle:true});if(src.cardId==='COC-12-008'&&destroyed){r.players[who].hp-=Math.max(0,dealt-prior)}if(destroyed&&src.cardId==='COC-12-011'){r.players[who].hp-=Math.max(0,targetAtk);log(r,'effect',`버디 히트토네이도: 파괴한 몬스터의 공격력 ${Math.max(0,targetAtk)}만큼 상대에게 피해`)}if((destroyed&&src.cardId==='COC-32-011')||(src.cardId==='COC-32-001'&&src.atk>targetAtk)){if(src.bonusAttackTurn!==r.turnNumber){src.bonusAttackTurn=r.turnNumber;src.bonusAttackCount=1;log(r,'effect',`${unitName(r,src.id)}: 이 턴 추가 공격 기회 1회 획득`)}}}
  else dealt=0;
  if(src.cardId==='COC-10-006')r.players[r.turn].hp+=Math.min(prior,dealt);
  if(src.cardId==='COC-21-007')r.players[r.turn].hp+=Math.floor(Math.min(prior,dealt)/3);
 }else{if(src.cardId==='COC-32-003'||src.cardId==='COC-32-013'){const multiplier=src.cardId==='COC-32-013'?100:50;const bonus=die(6)*multiplier;dealt+=bonus;log(r,'effect',`${unitName(r,src.id)} 직접 공격: 1d6 × ${multiplier} = ${bonus} 추가 피해`)}r.players[who].hp-=dealt;
  if(src.cardId==='COC-10-006')r.players[r.turn].hp+=dealt;
  if(src.cardId==='COC-21-007')r.players[r.turn].hp+=Math.floor(dealt/3);
 }
 log(r,'damage',`1d${src.atk} = ${dice} / ${targetName}에게 ${dealt} 피해`);r.pendingAttack=null;setOutcome(r);break}
 case 'retarget':{requireTurn(r,who);if(r.pendingAttack?.stage!=='retarget'||r.pendingManual)fail(409,'대상 재선택을 할 수 없습니다.');const target=body.target;if(!target||!['player','unit'].includes(target.type))fail(400,'대상 오류');if(target.type==='player'&&target.player!==undefined&&target.player!==1-who)fail(409,'상대 플레이어만 재선택할 수 있습니다.');if(target.type==='unit'){const z=zoneOwner(r,target.id);if(!z||z.player===who||z.zone!=='field')fail(409,'재선택 대상 오류')}validateAggro(r,who,target);r.pendingAttack.target=target.type==='player'?{type:'player',player:1-who}:{type:'unit',id:target.id};r.pendingAttack.stage='response';log(r,'attack','공격 대상 재선택');break}
 case 'manual':{if(r.mode==='ai')fail(409,'AI 대전에서는 합의 판정을 사용할 수 없습니다.');if(r.status!=='active'||r.pendingManual)fail(409,'지금은 효과 협의를 요청할 수 없습니다.');if(!['hp','unitHp','unitAtk','move','draw','extra','note'].includes(body.kind))fail(400,'효과 유형 오류');const payload=body.payload;if(!payload||typeof payload!=='object'||Array.isArray(payload))fail(400,'효과 입력 오류');const explanation=requireStr(body.explanation,240);if(explanation.length<3)fail(400,'효과 근거를 구체적으로 적어 주세요.');r.pendingManual={by:who,kind:body.kind,payload,explanation};log(r,'manual',`${p.label}: 수동 판정 제안 — ${explanation}`);break}
 case 'manualDecision':{if(r.mode==='ai')fail(409,'AI 대전에서는 합의 판정을 사용할 수 없습니다.');if(r.status!=='active'||!r.pendingManual||r.pendingManual.by===who)fail(403,'상대의 제안만 승인할 수 있습니다.');const m=r.pendingManual;if(body.approve===true){runManual(r,m);log(r,'manual',`${p.label}: 효과 승인 — ${m.explanation}`)}else{log(r,'manual',`${p.label}: 효과 거절 — ${m.explanation}`)}r.pendingManual=null;break}
 case 'concede':{if(r.status!=='active')fail(409,'진행 중인 대전이 아닙니다.');r.status='finished';r.winner=1-who;r.pendingAttack=null;r.pendingManual=null;log(r,'result',`${p.label} 항복`);break}
 default:fail(404,'알 수 없는 행동입니다.');
 }
 if(changed){r.version++;r.updatedAt=Date.now();save();}return publicState(r,who)
}
function chooseAIFieldAbility(r){
 const who=1,p=r.players[who],enemy=0;
 if(r.aiDifficulty==='easy'&&crypto.randomInt(3)===0)return null;
 for(const sourceUnitId of [...p.field,p.integration].filter(Boolean)){
  const u=r.units[sourceUnitId],id=u.cardId;
  if(!FIELD_ABILITY_IDS.includes(id)||p.abilityUsed?.[id]===r.turnNumber||u.abilityGameUsed||p.aiRejectedAbilities?.includes(sourceUnitId))continue;
  const foes=r.players[enemy].field.filter(Boolean);
  const allies=p.field.filter(Boolean);
  const stronger=foes.sort((a,b)=>r.units[b].atk-r.units[a].atk);
  const body={sourceUnitId};
  if(['COC-05-004','COC-13-001','COC-13-002','COC-13-005'].includes(id)){
   if(!stronger.length)continue;
   body.target={type:'unit',id:stronger[0]};
  }
  if(id==='COC-10-005'){
   if(!stronger.length||!allies.length)continue;
   body.target={type:'unit',id:stronger[0]};
   const low=allies.sort((a,b)=>r.units[a].atk-r.units[b].atk)[0];
   body.costTarget={type:'unit',id:low};
  }
  if(id==='COC-08-003'){
   if(!p.hand.length)continue;
   body.costCardId=[...p.hand].sort((a,b)=>(Number(cards.get(r.units[a].cardId)?.atk)||0)-(Number(cards.get(r.units[b].cardId)?.atk)||0))[0];
  }
  if(id==='COC-22-010'){
   const choice=allies.filter(a=>a!==sourceUnitId&&r.units[a].atk>0).sort((a,b)=>r.units[b].atk-r.units[a].atk)[0];
   if(!choice)continue;
   body.target={type:'unit',id:choice};
  }
  if(['COC-24-003','COC-26-003'].includes(id)){
   const choice=allies.filter(a=>Number.isFinite(r.units[a].hp)&&r.units[a].hp>r.units[a].atk).sort((a,b)=>(r.units[b].hp-r.units[b].atk)-(r.units[a].hp-r.units[a].atk))[0];
   if(!choice)continue;
   body.target={type:'unit',id:choice};
  }
  return body;
 }
 return null;
}
function chooseAIExtra(r){
 const who=1,p=r.players[who];
 for(const extraUnitId of p.extra){
  const recipe=EXTRA_RECIPES[r.units[extraUnitId]?.cardId];
  if(!recipe)continue;
  const pool=(recipe.method==='wakeup'||recipe.method==='infinity'?p.field:[...p.field,...p.hand]).filter(Boolean);
  const size=recipe.parts.length;
  if(size>pool.length)continue;
  const spells=recipe.method==='hero'||recipe.method==='infinity'?[null]:p.hand.filter(id=>cards.get(r.units[id]?.cardId)?.type==='주문');
  if(!spells.length)continue;
  let visited=0,choice=null;
  function visit(i,picked){
   if(choice||visited>200)return;
   if(picked.length===size){
    visited++;
    for(const spellUnitId of spells){
     try{validateExtraSummon({room:r,who,extraUnitId,materials:picked,spellUnitId,cards});
      const cardId=r.units[extraUnitId].cardId;
      const target=cardId==='COC-12-012'?r.players[0].field.filter(Boolean).find(id=>(Number(cards.get(r.units[id].cardId)?.atk)||0)<(Number(cards.get(cardId)?.atk)||0)):null;
      choice={extraUnitId,materials:[...picked],spellUnitId,target:target?{type:'unit',id:target}:undefined};return;
     }catch(e){if(e.status!==409)throw e}
    }
    return;
   }
   for(let k=i;k<pool.length;k++)visit(k+1,[...picked,pool[k]]);
  }
  visit(0,[]);
  if(choice)return choice;
 }
 return null;
}
// Server-only AI: never receives or exposes an opponent's hand to the browser.
function chooseAIMove(r){const who=1,p=r.players[who],level=r.aiDifficulty||'medium';
 const candidate=p.hand.filter(id=>{if(p.aiRejected?.includes(id))return false;const c=cards.get(r.units[id].cardId);if(c.type==='주문')return hasAutoSpell(c.id);if(c.type==='일체화')return !p.integration&&!c.conditions.length;if(c.type==='몬스터')return p.field.includes(null)&&isSimpleSummonCard(c);return false});
 if(!candidate.length)return null;
 const attack=(id)=>Math.max(0,Number(cards.get(r.units[id].cardId).atk)||0);
 const score=id=>{const c=cards.get(r.units[id].cardId);if(c.type==='몬스터')return attack(id)+40+(c.effects.length?25:0);if(c.type==='일체화')return 150+attack(id);if(c.id==='COC-30-007'&&p.hp>850)return -100;if(c.type==='주문')return 85;return 0};
 if(level==='easy'){if(crypto.randomInt(4)===0)return null;return candidate[crypto.randomInt(candidate.length)]}
 return [...candidate].sort((a,b)=>score(b)-score(a))[0];
}
function chooseAITarget(r,attacker){const level=r.aiDifficulty,foe=r.players[0],aggro=foe.field.filter(id=>id&&isAggro(r,id));if(aggro.length)return {type:'unit',id:aggro[0]};
 const options=foe.field.filter(Boolean);if(level==='easy')return options.length&&crypto.randomInt(2)===0?{type:'unit',id:options[crypto.randomInt(options.length)]}:{type:'player'};
 const atk=r.units[attacker].atk;const killable=options.filter(id=>r.units[id].hp<=Math.max(1,atk/2));
 if(level==='hard'&&killable.length){killable.sort((a,b)=>r.units[b].atk-r.units[a].atk);return {type:'unit',id:killable[0]}}
 if(level==='medium'&&options.length&&crypto.randomInt(3)===0)return {type:'unit',id:options[0]};
 return {type:'player'};
}
function runAI(r){if(r.mode!=='ai'||r.status!=='active')return;
 let steps=0;while(r.status==='active'&&steps++<70){
  if(r.pendingManual)break;
  if(r.pendingAttack){if(r.turn===0&&r.pendingAttack.stage==='response'){apply(r,1,'defend',{});continue}if(r.turn===1&&r.pendingAttack.stage==='retarget'){apply(r,1,'retarget',{target:chooseAITarget(r,r.pendingAttack.attackerId)});continue}break;}
  if(r.turn!==1)break;
  try{
   if(r.phase==='DRAW'){apply(r,1,'draw',{});continue}
   if(r.phase==='MAIN'){
    const ability=chooseAIFieldAbility(r);if(ability){const snapshot=structuredClone(r);try{apply(r,1,'ability',ability)}catch(e){for(const key of Object.keys(r))delete r[key];Object.assign(r,snapshot);r.players[1].aiRejectedAbilities??=[];r.players[1].aiRejectedAbilities.push(ability.sourceUnitId);log(r,'ai',`AI가 실행 불가능한 필드 효과를 건너뛰었습니다: ${e.message}`)}continue}
    const extra=chooseAIExtra(r);if(extra){apply(r,1,'extraSummon',extra);continue}
    const id=chooseAIMove(r);
    if(id){const c=cards.get(r.units[id].cardId),t=['COC-03-008','COC-17-003','COC-30-007','COC-32-006'].includes(c.id)?{type:'player',player:1}:chooseAITarget(r,id);if(['COC-08-001','COC-08-008','COC-31-002'].includes(c.id)&&r.players[0].field.some(Boolean)){t.type='unit';t.id=r.players[0].field.find(Boolean);delete t.player;}const before=structuredClone(r);try{apply(r,1,'play',{unitId:id,target:t,targets:c.id==='COC-06-004'?[...r.players[0].field,...r.players[1].field].filter(Boolean).slice(0,2):undefined})}catch(e){for(const key of Object.keys(r))delete r[key];Object.assign(r,before);r.players[1].aiRejected??=[];r.players[1].aiRejected.push(id);if(r.players[1].aiRejected.length>20)r.players[1].aiRejected.shift();log(r,'ai',`AI가 사용 불가능한 ${c.name} 카드를 건너뛰었습니다.`)}continue}
    apply(r,1,'phase',{});continue;
   }
   if(r.phase==='ATTACK'){
    const units=r.players[1].noAttackUntil>=r.players[1].turnsTaken?[]:[...r.players[1].field,r.players[1].integration].filter(id=>id&&r.units[id].atk>0&&!r.units[id].cannotAttack&&!r.units[id].frozen&&r.units[id].cannotAttackUntil!==r.turnNumber&&attackAvailable(r.units[id],r.turnNumber));
    if(units.length){const attackerId=r.aiDifficulty==='easy'?units[crypto.randomInt(units.length)]:units.sort((a,b)=>r.units[b].atk-r.units[a].atk)[0];apply(r,1,'attack',{attackerId,target:chooseAITarget(r,attackerId)});continue}
    apply(r,1,'phase',{});continue;
   }
   if(r.phase==='END'){apply(r,1,'phase',{});continue}
   break;
  }catch(e){log(r,'ai',`AI 판정 중단: ${e.message}`);break}
 }
 if(steps>=70){log(r,'ai','AI 반복 행동 방지: 이번 처리에서 70단계를 초과하여 중단했습니다.');save()}
}
function reply(res,status,data){const text=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(text)}
function serveStatic(res,pathname){let f=pathname==='/'?'/index.html':pathname;if(!/^\/[a-zA-Z0-9_./-]+$/.test(f)||f.includes('..')||f.startsWith('/.'))return reply(res,404,{error:'찾을 수 없습니다.'});const real=path.resolve(PUBLIC,'.'+f);if(!real.startsWith(PUBLIC+path.sep))return reply(res,403,{error:'접근 불가'});if(!fs.existsSync(real)||!fs.statSync(real).isFile())return reply(res,404,{error:'찾을 수 없습니다.'});const ext=path.extname(real);const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'}[ext]||'application/octet-stream';res.writeHead(200,{'content-type':mime,'x-content-type-options':'nosniff','cache-control':ext==='.html'?'no-store':'public, max-age=300','content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",'referrer-policy':'no-referrer'});fs.createReadStream(real).pipe(res)}
const rate=new Map();function rateLimit(req){const ip=req.socket.remoteAddress||'unknown',now=Date.now();const v=rate.get(ip)||{n:0,until:now+60000};if(v.until<now){v.n=0;v.until=now+60000;}if(++v.n>(process.env.NODE_ENV==='test'?20000:240))fail(429,'요청이 너무 많습니다.');rate.set(ip,v);if(rate.size>10000)rate.clear()}
async function readBody(req){let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>16000)fail(413,'요청 크기 제한을 초과했습니다.');chunks.push(b)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail(400,'JSON 형식이 아닙니다.')}}
export function createApp(){return http.createServer(async(req,res)=>{try{rateLimit(req);const url=new URL(req.url,'http://localhost');if(req.method==='GET'&&url.pathname==='/api/health')return reply(res,200,{status:'ok',version:RULES});if(req.method==='GET'&&url.pathname==='/api/catalog')return reply(res,200,{...catalog,cards:catalog.cards.map(c=>({...c,automation:automationStatus(c)}))});
 const preview=/^\/api\/rooms\/([A-Z0-9]{6})\/hand-preview$/.exec(url.pathname);
 if(req.method==='GET'&&preview){const r=getRoom(preview[1]);const token=req.headers.authorization?.replace(/^Bearer /,'');const who=indexFor(r,token);
 if(r.status!=='active'||r.turn!==who||r.phase!=='MAIN'||!r.players[who].hand.some(id=>r.units[id].cardId==='COC-13-008'))fail(403,'이 카드를 사용 가능한 상태가 아닙니다.');
 return reply(res,200,{cards:r.players[1-who].hand.map(id=>({id,name:cards.get(r.units[id].cardId).name}))})
 }
if(req.method==='POST'&&url.pathname==='/api/ai'){
 const body=await readBody(req),difficulty=requireStr(body.difficulty||'medium',16);
 if(!['easy','medium','hard'].includes(difficulty))fail(400,'AI 난이도가 올바르지 않습니다.');
 const chosen=body.aiDeckId==='random'||!body.aiDeckId?catalog.decks[crypto.randomInt(catalog.decks.length)].id:body.aiDeckId;
 if(!decks.has(chosen))fail(400,'AI 덱을 찾을 수 없습니다.');
 const token=secret();let code;do{code=randomCode()}while(rooms[code]);
 const r={code,createdAt:Date.now(),updatedAt:Date.now(),status:'lobby',version:1,mode:'ai',aiDifficulty:difficulty,turn:0,turnNumber:0,phase:'',winner:null,pendingAttack:null,pendingManual:null,players:[],units:{},logs:[],effects:[]};
 createPlayer(r,body.deckId,body.label,token);createPlayer(r,chosen,'AI · '+({easy:'하',medium:'중',hard:'상'}[difficulty]),secret());r.players[1].ai=true;
 rooms[code]=r;apply(r,0,'start',{});runAI(r);return reply(res,201,{code,token,state:publicState(r,0)})
 }
 if(req.method==='POST'&&url.pathname==='/api/rooms'){const body=await readBody(req);const token=secret();let code;do{code=randomCode()}while(rooms[code]);const r={code,createdAt:Date.now(),updatedAt:Date.now(),status:'lobby',mode:'pvp',version:1,turn:0,turnNumber:0,phase:'',winner:null,pendingAttack:null,pendingManual:null,players:[],units:{},logs:[]};createPlayer(r,body.deckId,body.label,token);rooms[code]=r;save();return reply(res,201,{code,token,state:publicState(r,0)})}const mt=/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|actions))?$/.exec(url.pathname.replace(/^\/api\/rooms\/([a-z0-9]{6})/,(_,code)=>'/api/rooms/'+code.toUpperCase()));if(url.pathname.startsWith('/api/rooms/')&& !mt)fail(404,'잘못된 방 주소');if(mt){const code=mt[1];const sub=mt[2];const r=getRoom(code);if(req.method==='POST'&&sub==='join'){if(r.mode==='ai'||r.status!=='lobby'||r.players.length>=2)fail(409,'이미 시작했거나 가득 찬 방입니다.');const body=await readBody(req),token=secret();createPlayer(r,body.deckId,body.label,token);r.version++;save();return reply(res,201,{code,token,state:publicState(r,1)})}const token=req.headers.authorization?.replace(/^Bearer /,'');const who=indexFor(r,token);if(req.method==='GET'&&!sub)return reply(res,200,publicState(r,who));if(req.method==='POST'&&sub==='actions'){const body=await readBody(req);if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==r.version)fail(409,'게임 상태가 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.');let result;const snapshot=structuredClone(r);try{result=apply(r,who,body.type,body);if(r.mode==='ai'){runAI(r);result=publicState(r,who)}}catch(e){rooms[code]=snapshot;save();throw e}return reply(res,200,result)}fail(405,'지원하지 않는 요청입니다.')}if(req.method==='GET')return serveStatic(res,url.pathname);fail(405,'지원하지 않는 요청입니다.')}catch(e){reply(res,e.status||500,{error:e.status?e.message:'서버 처리 오류',...(process.env.NODE_ENV==='test'?{details:e.message}:{})})}})}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=createApp(),port=Number(process.env.PORT)||3000;app.listen(port,'0.0.0.0',()=>console.log(`Combine of Cards: http://localhost:${port}`));
}

// Purely programmatic internal test seam. No HTTP route exposes these internals.
export const gameTestInternals={cards,catalog,createPlayer,instantiate,move,draw,runSummonEffects,runIntegrationOnEnter,processStartOfTurn,processEndOfTurn,attackAvailable,damageUnit,H,performExtraSummon,chooseAIExtra,chooseAIFieldAbility,maxAttacks,applyFieldAbility};
