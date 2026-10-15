import {recruitChoices,recruitChoiceView,chooseRecruit} from './src/recruit-summons.mjs';
import {balanceValues as B,BALANCE_REVISION} from './src/balance-values.mjs';
import {isElemental,legalElementalAbilities,elementalChoices,elementalChoiceView,chooseElemental} from './src/elemental-replacement.mjs';
import {FIELD_RESPONSE_IDS,prepareFieldEffect} from './src/field-ability-effects.mjs';
import {queueFieldAbility,resumeFieldAbility,finishFieldAbility,abilityResponsePlayer,legalAbilityCounters,declareAbilityCounter} from './src/ability-responses.mjs';
import {resolveCardCounter,counterEffectIds,resetFieldCounterOnSummon,counterLimitLabel} from './src/counter-effects.mjs';
import {extraResponsePlayer,legalSummonCounters,queueSummonEffect,declareSummonCounter,resolveSummonResponse} from './src/summon-counters.mjs';
import {evolutionRules,validateEvolution,natureEvolutionCosts,evolutionStillValid,evolveIntegration,restoreEvolutionCard} from './src/evolution.mjs';
import {beginDeckSearch,deckSearchView,finishDeckSearch} from './src/deck-search.mjs';
import {isNonToonField} from './src/spell-choice-batch.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { castAutomatedSpell, hasAutoSpell, spellHandlerIds, validateLifeEatingSwordTarget } from './src/automated-effects.mjs';
import {automationStatus} from './src/automation-status.mjs';
import {responseSpellIds} from './src/spell-response-registry.mjs';
import {prepareResponseTargets,responseTargetStillValid,responseTargetChoices} from './src/spell-response-targets.mjs';
import {legalSpellCounters,declareSpellCounter,spellResponsePlayer} from './src/spell-counters.mjs';
import {planActivation,commitActivationCosts} from './src/activation-rules.mjs';
import {validateExtraSummon, EXTRA_RECIPES} from './src/extra-summons.mjs';
import {applyFieldAbility,FIELD_ABILITY_IDS} from './src/field-abilities.mjs';
import {onTokenCreation,onTokenActivity,onDragonAttackPhase,onFafnirDestroyed} from './src/dragon-gold.mjs';
import {onCartoonLandDestroyed} from './src/cartoon-land.mjs';
import {applyGraveAbility,legalGraveAbilities,GRAVE_ABILITY_IDS} from './src/grave-abilities.mjs';
import {FUSION_UP_ID,markEffectUsed,effectUsedThisTurn,migrateLegacyEffectUsage} from './src/effect-usage.mjs';
import {declareEffect,beginAutomaticTriggerOrder,chooseAutomaticTriggerOrder,resolveEffectStack} from './src/effect-runtime.mjs';
import {actualAttack,treatedAttackForCondition} from './src/combat-stats.mjs';
import {recordSwordKill,beginSwordTurn,endSwordTurn,processSwordAttackPhase,swordMultiplierCount,swordActualAttack} from './src/life-eating-sword.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,'public');
const DATA_DIR=process.env.DATA_DIR || path.join(ROOT,'.data');
const STORAGE=path.join(DATA_DIR,'rooms.json');
const RULES='1.3-ai-beta.12';
// Add a spell only after auditing declaration-time conditions, target choices,
// costs and retention. This shared registry also drives coverage reporting.
const REACTIVE_SPELL_IDS=new Set(responseSpellIds);
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
for(const room of Object.values(rooms))migrateLegacyEffectUsage(room);
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
function setOutcome(r){if(r.pendingTriggerOrder)return;const lost=r.players.map(p=>p.hp<=0);if(lost[0]||lost[1]){r.status='finished';r.winner=lost[0]&&lost[1]?'draw':lost[0]?1:0;r.pendingAttack=null;r.pendingManual=null;r.pendingExtraSummon=null;r.pendingSpell=null;r.pendingAbility=null;r.pendingDeckSearch=null;r.pendingElementalChoice=null;r.pendingRecruitChoice=null;r.effectStack=[];log(r,'result',r.winner==='draw'?'두 플레이어가 동시에 패배하여 무승부입니다.':`${r.players[r.winner].label} 승리`);}}
function instantiate(r,cardId,owner){const c=cards.get(cardId);if(!c)fail(400,'존재하지 않는 카드입니다.');const id=uid();r.units[id]={id,cardId,owner,atk:Number.isFinite(+c.atk)?Math.max(0,Math.floor(+c.atk)):0,hp:Number.isFinite(+c.hp)?Math.floor(+c.hp):null,attackTurn:-1,created:false,baseAtk:Number.isFinite(+c.atk)?Math.max(0,Math.floor(+c.atk)):0};return id}
function createPlayer(r,deckId,label,auth){const d=decks.get(deckId);if(!d)fail(400,'유효하지 않은 덱입니다.');const i=r.players.length;const p={label:requireStr(label??'',24)||`플레이어 ${i+1}`,authHash:hash(auth),deckId,hp:1000,reloads:0,deck:[],hand:[],grave:[],banished:[],extra:[],field:[null,null,null],integration:null,turnsTaken:0,roundPlays:0,lastRoundPlays:0,roundElementUses:0,naturalStreak:0,metalElementUsedGame:0,natureSpellsUsedGame:0,elementSpellPlaysThisTurn:0,spellsThisTurn:0};r.players.push(p);for(const id of d.main)p.deck.push(instantiate(r,id,i));for(const id of d.extra)p.extra.push(instantiate(r,id,i));return p}
function draw(r,who){const p=r.players[who];if(!p.deck.length){const feedback=100+50*p.reloads;p.reloads++;if(p.grave.length){p.deck.push(...p.grave.splice(0));shuffle(p.deck)}p.hp-=feedback;log(r,'reload',`${p.label}: 리로드 피해 ${feedback}, 덱 ${p.deck.length}장`);setOutcome(r);if(r.status==='finished')return;if(!p.deck.length){log(r,'draw',`${p.label}: 드로우 실패 (덱과 묘지에 카드 없음)`);
if(r.players[1-who].integration&&r.units[r.players[1-who].integration]?.cardId==='COC-07-007'){p.hp=0;log(r,'effect','포식자 알리자 라팍스: 상대의 드로우 실패로 패배');setOutcome(r)}return;}}const id=p.deck.shift();p.hand.push(id);log(r,'draw',`${p.label}가 카드를 1장 뽑았습니다.`)}
function unlinkPhysical(r,id){for(const p of r.players){for(let i=0;i<p.field.length;i++)if(p.field[i]===id)p.field[i]=null;if(p.integration===id)p.integration=null;for(const area of ['deck','hand','grave','banished','extra'])p[area]=p[area].filter(x=>x!==id)}}
function attachOverlayMaterials(r,hostId,materialIds){
 const host=r.units[hostId],loc=zoneOwner(r,hostId);
 if(!host||!loc||!['field','integration'].includes(loc.zone))fail(409,'필드의 얼라이즈 몬스터에만 소재를 겹칠 수 있습니다.');
 if(!Array.isArray(materialIds)||!materialIds.length||new Set(materialIds).size!==materialIds.length||hostId&&materialIds.includes(hostId))fail(409,'얼라이즈 소재 지정이 잘못되었습니다.');
 const old=host.overlayMaterials||[];
 for(const id of materialIds){const card=r.units[id],z=zoneOwner(r,id);if(!card||card.created||card.overlayHostId||!z||!['field','hand','grave'].includes(z.zone)||id===hostId||old.includes(id))fail(409,'얼라이즈 소재의 실제 위치가 유효하지 않습니다.');}
 for(const id of materialIds){unlinkPhysical(r,id);r.units[id].overlayHostId=hostId;}
 host.overlayMaterials=[...old,...materialIds];
}
function attachCard(r,cardId,hostId){
 const card=r.units[cardId],host=r.units[hostId];
 const origin=card&&zoneOwner(r,cardId),target=host&&zoneOwner(r,hostId);
 if(!card||!host||cardId===hostId||card.created||card.attachmentHostId||card.overlayHostId||
  card.overlayMaterials?.length||card.attachments?.length||
  !origin||!['hand','field'].includes(origin.zone)||
  !target||!['field','integration'].includes(target.zone))
  fail(409,'장착할 카드 또는 대상의 영역이 유효하지 않습니다.');
 unlinkPhysical(r,cardId);
 card.attachmentHostId=hostId;
 host.attachments??=[];
 host.attachments.push(cardId);
}
/**
 * Remove one linked attachment without moving its host. Call only from an
 * explicitly validated card effect; this is not a free player action.
 * The attachment returns to its original owner's requested destination.
 */
function detachCard(r,cardId,to='grave',{cause}={}){
 // R15 confirmed: unequipping is never a voluntary player action.
 // A card-specific, server-verified effect must explicitly supply its cause.
 if(cause!=='card-effect'&&cause!=='host-effect')
  fail(409,'장착 해제는 임의로 할 수 없습니다. 카드 효과로만 처리합니다.');
 const card=r.units[cardId],hostId=card?.attachmentHostId,host=hostId&&r.units[hostId];
 const hostLocation=hostId&&zoneOwner(r,hostId);
 if(!card||!host||!hostLocation||!['field','integration'].includes(hostLocation.zone)||
  !Array.isArray(host.attachments)||host.attachments.filter(id=>id===cardId).length!==1||
  !['grave','hand','deck','banished'].includes(to))
  fail(409,'장착 해제할 카드 또는 이동 영역이 유효하지 않습니다.');
 // Check before altering the physical link. This avoids a failed unlink if
 // the destination is not supported or the host relationship is corrupt.
 const index=host.attachments.indexOf(cardId);
 host.attachments.splice(index,1);
 if(host.attachments.length===0)delete host.attachments;
 delete card.attachmentHostId;
 move(r,cardId,to,card.owner,{attachmentRelease:true});
 return cardId;
}
// R15/R16: validate the entire host/material graph before moving even one
// physical card. Reconnected rooms must not lose a host if a link is corrupt.
function validateLeavingLinks(r,hostId){
 const host=r.units[hostId];
 const kinds=[
  ['attachments','attachmentHostId','장착 카드 연결 정보가 손상되었습니다.'],
  ['overlayMaterials','overlayHostId','얼라이즈 소재 연결 정보가 손상되었습니다.']
 ];
 const all=new Set([hostId]);
 for(const [property,reverse,error] of kinds){
  if(host[property]===undefined)continue;
  if(!Array.isArray(host[property]))fail(409,error);
  for(const childId of host[property]){
   const child=r.units[childId];
   if(typeof childId!=='string'||all.has(childId)||!child||
    child[reverse]!==hostId||!Number.isInteger(child.owner)||
    !r.players[child.owner]||child.attachments?.length||child.overlayMaterials?.length)
    fail(409,error);
   // Linked cards cannot simultaneously occupy a regular physical zone.
   for(const player of r.players){
    if(player.integration===childId||player.field.includes(childId)||
      ['deck','hand','grave','banished','extra'].some(area=>player[area].includes(childId)))
      fail(409,error);
   }
   all.add(childId);
  }
 }
}
function move(r,id,to,owner,options={}){const u=r.units[id];if(!u)fail(400,'카드를 찾을 수 없습니다.');
 // Preflight the entire destination before unlinkPhysical or deleting a token.
 // Invalid zone/recipient input must never orphan physical cards or overlays.
 if(!['field','integration','grave','hand','deck','banished'].includes(to))
  fail(400,'이동 위치가 유효하지 않습니다.');
 const recipient=owner??u.owner;
 if(!Number.isInteger(recipient)||![0,1].includes(recipient)||!r.players[recipient])
  fail(400,'이동할 카드의 소유자 또는 조종자가 유효하지 않습니다.');
 if(u.overlayHostId&&!options.overlayRelease)fail(409,'겹쳐진 얼라이즈 소재는 독립적으로 이동할 수 없습니다.');
 if(u.attachmentHostId&&!options.attachmentRelease)fail(409,'장착 중인 카드는 관계 해제 없이 독립 이동할 수 없습니다.');
 const attached=Array.isArray(u.overlayMaterials)&&!['field','integration'].includes(to)?[...u.overlayMaterials]:[];
 const equipped=Array.isArray(u.attachments)&&!['field','integration'].includes(to)?[...u.attachments]:[];
 if(!['field','integration'].includes(to))validateLeavingLinks(r,id);
const previousZone=options.tokenAction&&u.created?zoneOwner(r,id):null;if(to==='field'&&!r.players[owner??u.owner].field.includes(null))fail(409,'필드 세 칸이 모두 차 있습니다.');if(to==='integration'&&r.players[owner??u.owner].integration)fail(409,'이미 일체화 중입니다.');resetFieldCounterOnSummon(u,zoneOwner(r,id),to);if(to==='field'||zoneOwner(r,id)?.zone==='field')u.fieldRevision=(u.fieldRevision||0)+1;if(to==='integration'||zoneOwner(r,id)?.zone==='integration')u.integrationRevision=(u.integrationRevision||0)+1;unlinkPhysical(r,id);
 restoreEvolutionCard(u,to);
 // Enchantments granted to a specific monster cease when its physical UID
 // leaves the battlefield; the spell itself remains in its owner's grave.
 if(!['field','integration'].includes(to)&&r.effects?.length)
  r.effects=r.effects.filter(e=>e.type!=='lifeEatingSword'||e.target?.kind!=='unit'||e.target.id!==id);
 const p=r.players[owner??u.owner];if(!['field','integration'].includes(to)){u.frozen=false;u.battleInvulnerable=false;u.effectsNegated=false;u.diceMax=undefined;u.diceMin=undefined;u.cannotAttack=false;u.attackTurn=-1;u.attackCount=0;u.attackCountTurn=-1;const original=cards.get(u.cardId);if(original){u.atk=Number.isFinite(+original.atk)?Math.max(0,Math.floor(+original.atk)):0;u.hp=Number.isFinite(+original.hp)?Math.floor(+original.hp):null;u.baseAtk=u.atk;}delete u.selfDevourBuffToken;delete u.temporaryBuff;delete u.buffExpiresAt;delete u.treatedAsToon;delete u.superiorClaw;delete u.effectDestructionImmune;delete u.damageInvulnerable;delete u.playerAttackBonusApplied;}if(u.created&&to!=='field'&&to!=='integration'){delete r.units[id];if(previousZone?.zone==='field'&&['사용','릴리스'].includes(options.tokenAction))onTokenActivity(r,options.tokenAction,previousZone.player,{zone:zoneOwner,move,instantiate,log});return}if(to==='field'){const slot=p.field.findIndex(x=>x===null);if(slot<0)fail(409,'필드 세 칸이 모두 차 있습니다.');p.field[slot]=id;u.owner=u.owner??owner;u.attackTurn=-1;}else if(to==='integration'){if(p.integration)fail(409,'이미 일체화 중입니다.');p.integration=id;const bonus=Math.max(0,(p.playerAtkBonus||0)-(u.playerAttackBonusApplied||0));if(bonus){u.atk+=bonus;u.playerAttackBonusApplied=(u.playerAttackBonusApplied||0)+bonus;}}else if(to==='banished')p.banished.push(id);else if(to==='deck'){p.deck.splice(crypto.randomInt(p.deck.length+1),0,id);}else if(to==='hand')p.hand.push(id);else if(to==='grave'){p.grave.push(id);u.atk=Math.max(0,Number(cards.get(u.cardId)?.atk)||0);u.hp=Number.isFinite(+cards.get(u.cardId)?.hp)?+cards.get(u.cardId).hp:null;u.attackTurn=-1;}else fail(400,'이동 위치가 유효하지 않습니다.');
 if(equipped.length){
  delete u.attachments;
  for(const equippedId of equipped){
   const equipment=r.units[equippedId];
   if(!equipment||equipment.attachmentHostId!==id)fail(409,'장착 카드 연결 정보가 손상되었습니다.');
   delete equipment.attachmentHostId;
   move(r,equippedId,to,equipment.owner,{attachmentRelease:true});
  }
 }
 if(attached.length){
  // The whole attached stack leaves the field in one move transaction.
  // Each printed card returns to its original owner's matching destination.
  delete u.overlayMaterials;
  for(const materialId of attached){const material=r.units[materialId];if(!material||material.overlayHostId!==id)fail(409,'얼라이즈 소재 연결 정보가 손상되었습니다.');delete material.overlayHostId;move(r,materialId,to,material.owner,{overlayRelease:true});}
 }
}
function zoneOwner(r,id){if(r.units[id]?.attachmentHostId){const hostId=r.units[id].attachmentHostId,z=zoneOwner(r,hostId);return z?{player:z.player,zone:'attachment',hostId}:null;}if(r.units[id]?.overlayHostId){const hostId=r.units[id].overlayHostId,z=zoneOwner(r,hostId);return z?{player:z.player,zone:'overlay',hostId}:null;}for(let i=0;i<r.players.length;i++){const p=r.players[i];for(const z of ['deck','hand','grave','extra','banished'])if(p[z].includes(id))return {player:i,zone:z};if(p.field.includes(id))return {player:i,zone:'field'};if(p.integration===id)return {player:i,zone:'integration'};}return null}
function damageUnit(r,id,value,{battle=false,sourceId=null,sourcePlayer=null}={}){const u=r.units[id];if(!u||u.hp===null)fail(409,'체력이 없는 카드입니다.');if(value<0&&u.damageInvulnerable){log(r,'effect',`${unitName(r,id)}: 피해 면역으로 피해를 받지 않음`);return false;}if(value<0&&u.cardId==='COC-09-002')value=Math.max(-1,value);u.preDamageHp=u.hp;u.hp+=value;if(u.hp<=0){if(battle&&(u.cardId==='COC-26-011'||u.cardId==='COC-05-002')){u.hp=1;return false}H.destroy(r,id,{cause:'lethal',sourceId,sourcePlayer});return true}return false}
function dropFromDeck(r,who,count){
 const p=r.players[who];for(let i=0;i<count&&p.deck.length;i++){const id=p.deck.shift();p.grave.push(id);log(r,'mill',`${p.label}가 덱 맨 위의 카드 1장을 묘지로 보냈습니다.`)}
}
function findCardInDeck(r,who,name){const p=r.players[who];const id=p.deck.find(id=>cards.get(r.units[id].cardId)?.name.includes(name));if(id){move(r,id,'hand',who);log(r,'search',`${p.label}가 덱에서 ${cards.get(r.units[id].cardId).name}를 공개하고 패로 가져왔습니다.`)}return id}
function die(n,min=1){const maximum=Math.min(Math.max(1,Math.floor(n)),100_000_000);const minimum=Math.max(1,Math.min(maximum,Math.floor(min)));return crypto.randomInt(minimum,maximum+1)}
function hurt(r,id,n,attribution={}){return damageUnit(r,id,-n,attribution)}
function healUnit(r,id,n){damageUnit(r,id,n)}
function summonToken(r,who,name,atk,hp){
 const p=r.players[who];if(!p.field.includes(null))return null;
 const id=uid(),cardId='TOKEN:'+name;
 r.units[id]={id,cardId,owner:who,atk,hp,baseAtk:atk,attackTurn:-1,created:true,tokenCard:{id:cardId,name,type:'몬스터',zone:'created',attribute:'토큰',atk:String(atk),hp:String(hp),conditions:[],effects:[],notes:[]}};
 p.field[p.field.indexOf(null)]=id;log(r,'token',`${p.label}: ${name} 토큰 소환`);onTokenCreation(r,id,who,{zone:zoneOwner,move,instantiate,log});return id
}
function resolveQueuedDestroyHeals(r){
 if(r.pendingTriggerOrder)return;
 const results=resolveEffectStack(r,{
  getZone:id=>zoneOwner(r,id),
  // Ignore log entries and monotonically increasing effect sequence numbers.
  // A legal repeat can run as long as the actual board and counters progress.
  fingerprint:room=>JSON.stringify({
   hp:room.players.map(p=>p.hp),
   places:room.players.map(p=>[p.field,p.integration,p.hand,p.grave,p.deck,p.banished]),
   stats:Object.values(room.units).map(u=>[u.id,u.hp,u.atk]),
   counters:room.persistentEffects?.map(e=>[e.id,e.counters])||[]
  }),
  execute:e=>{
   if(e.effectId!=='batch-first-destroy-heal')throw new Error('unsupported trigger on destruction stack');
   r.players[e.owner].hp+=e.payload.amount;
   log(r,'effect',`첫 파괴 회복 효과 ${e.key}: ${e.payload.amount} HP 회복`);
  }
 });
 if(results.length)setOutcome(r);
 return results;
}
function destroyed(r,id){
 const z=zoneOwner(r,id),u=r.units[id];if(!z||!u)return null;
 // A field/integration destruction is not the same event as destroying a hand card.
 if(!['field','integration'].includes(z.zone))return null;
 const before=Math.max(0,u.hp??0);
 const amount=u.hp<=0?Math.max(0,u.preDamageHp||0):before;
 const triggered=(r.effects||[]).filter(e=>e.type==='firstDestroyHeal'&&e.turn===r.turnNumber);
 for(const e of triggered)r.effects.splice(r.effects.indexOf(e),1);
 return triggered.length?{triggered,amount}:null;
}
function scheduleSingleDestroyHeals(r,heals){
 if(!heals)return;
 const group=heals.triggered.map((e,i)=>({
  key:`single-heal-${r.turnNumber}-${i}`,effectId:'batch-first-destroy-heal',
  owner:e.player,sourceId:null,exception:'independent',priority:0,
  title:`첫 파괴 회복 (플레이어 ${e.player+1} / 효과 ${i+1})`,
  payload:{amount:heals.amount}
 }));
 beginAutomaticTriggerOrder(r,group,r.turn);
 if(!r.pendingTriggerOrder)resolveQueuedDestroyHeals(r);
}

const H={
 cards,queueEffectSummon:(r,pending)=>{queueSummonEffect(r,pending);r.pendingExtraSummon=pending;log(r,'summon',`${r.players[pending.who].label}: ${unitName(r,pending.extraUnitId)} ${pending.recipe.method==='recruit'?'효과':'교체'} 소환 선언 (상대 대응 대기)`);},
 zone:zoneOwner,move,draw,fail,log,attackAvailable,roll:die,randomInt:n=>crypto.randomInt(n),hurt,healUnit,outcome:setOutcome,shuffle,onSummon:runSummonEffects,
 mill:dropFromDeck,summonToken,search:findCardInDeck,destroy:(r,id,{cause='effect',sourceId=null,sourcePlayer=null,bypassEffectImmunity=false}={})=>{const u=r.units[id];if(u&&zoneOwner(r,id)){if((cause==='effect'||cause==='cost')&&u.effectDestructionImmune&&!bypassEffectImmunity){log(r,'effect',`${unitName(r,id)}: 주문·효과에 의한 직접 파괴를 방지했습니다.`);return false;}
 const singleHeals=destroyed(r,id);const z=zoneOwner(r,id);
  if(z.zone==='field'){
   r.destructionHistory??=[];
   r.destructionHistory.push({turnNumber:r.turnNumber,activePlayer:r.turn,controller:z.player,cardId:u.cardId});
   if(r.destructionHistory.length>500)r.destructionHistory.shift();
  }
  const canRevive=u.cardId==='COC-10-011'&&!u.revivedOnce&&z.zone==='field';
 const name=cards.get(u.cardId)?.name||u.tokenCard?.name;move(r,id,'grave',u.owner);log(r,'destroy',`${name} 파괴`);if(z.zone==='field')recordSwordKill(r,{sourceId,sourcePlayer,victimController:z.player},{getZone:zoneOwner,log});if(u.created&&cause==='cost'&&z.zone==='field')onTokenActivity(r,'사용',z.player,{zone:zoneOwner,move,instantiate,log});if(u.cardId==='COC-11-007'&&z.zone==='field')onFafnirDestroyed(r,id,z.player,{zone:zoneOwner,move,log});if(u.cardId==='COC-05-002'&&z.zone==='field')onCartoonLandDestroyed(r,id,z.player,{zone:zoneOwner,move,destroy:H.destroy,log});
 if(singleHeals)scheduleSingleDestroyHeals(r,singleHeals);
 if(canRevive&&r.units[id]&&r.players[z.player].field.includes(null)){
  u.revivedOnce=true;move(r,id,'field',z.player);log(r,'revive',`${name}: 파괴 후 효과 없이 1회 부활`)
 }
 }} ,
 destroyBatch:(r,ids,attribution={})=>{
  // Snapshot all destruction targets before resolving destruction-triggered effects.
  const chosen=[...new Set(ids)].filter(id=>r.units[id]&&zoneOwner(r,id)?.zone==='field'&&!r.units[id].effectDestructionImmune);
  if(!chosen.length)return;
  const firstDestroy=(r.effects||[]).filter(e=>e.type==='firstDestroyHeal'&&e.turn===r.turnNumber);
  if(firstDestroy.length){
   const highest=Math.max(...chosen.map(id=>Math.max(0,Number(r.units[id].hp)||0)));
   const entries=firstDestroy.map((e,i)=>({
    key:`batch-heal-${r.turnNumber}-${i}`,effectId:'batch-first-destroy-heal',
    owner:e.player,sourceId:null,exception:'independent',priority:0,
    title:`첫 파괴 회복 (플레이어 ${e.player+1} / 효과 ${i+1})`,
    payload:{amount:highest}
   }));
   beginAutomaticTriggerOrder(r,entries,r.turn);
   for(const e of firstDestroy)r.effects.splice(r.effects.indexOf(e),1);
  }
  for(const id of chosen)if(zoneOwner(r,id)?.zone==='field')H.destroy(r,id,attribution);
  if(!r.pendingTriggerOrder){
   if(firstDestroy.length)resolveQueuedDestroyHeals(r);
   else setOutcome(r);
  }
 },
 name:(r,id)=>cards.get(r.units[id]?.cardId)?.name||'',attribute:(r,id)=>cards.get(r.units[id]?.cardId)?.attribute||'',
 originalOwner:(r,id)=>r.units[id].owner,type:(r,id)=>cards.get(r.units[id].cardId)?.type,capture:(r,who,id)=>move(r,id,'field',who),cardNamed:(r,who,name)=>catalog.cards.find(c=>c.deckId===r.players[who].deckId&&c.name.replace(/\s+/g,'').includes(name.replace(/\s+/g,''))),onIntegrationEnter:runIntegrationOnEnter
};
function runSummonEffects(r,who,id,body={}){const u=r.units[id],p=r.players[who];switch(u.cardId){
 case 'COC-03-005':{
  // Confirmed base without Beria: 0 ATK / 1 HP. Beria's current ATK
  // determines both values at summon; R30 confirms no later live stat link.
  const beriaId=p.integration;
  const beria=beriaId&&r.units[beriaId]?.cardId==='COC-03-001'?r.units[beriaId]:null;
  const currentAtk=beria?Math.max(0,Math.floor(Number(beria.atk)||0)):0;
  u.atk=currentAtk;
  u.hp=beria?currentAtk:1;
  if(u.hp<=0)H.destroy(r,id,{cause:'lethal'});
  break;
 }
 case 'COC-12-003':findCardInDeck(r,who,'F=HERO');break;
 case 'COC-12-004':if(p.hand.length<=1){draw(r,who);if(r.status==='active')draw(r,who)}break;
 case 'COC-27-001':draw(r,who);if(r.status==='active')draw(r,1-who);break;
 case 'COC-23-003':p.hp+=B.rideWaterHeal;break;
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
 case 'COC-14-004':{
  if(body.costUnitIds.length===1)summonToken(r,who,'스톰 토큰',0,50);
  else{const mid=body.target?.id,z=mid&&zoneOwner(r,mid);if(!z||z.zone!=='field')fail(409,'필드에서 공격력 감소 대상을 선택해 주세요.');const u2=r.units[mid],before=u2.atk;u2.atk=Math.floor(Math.max(0,u2.atk)/2);if(before>0&&u2.atk===0)H.destroy(r,mid)}
  break;
 }
 case 'COC-14-005':{
  if(!p.deck.length)fail(409,'무작위로 버릴 덱 카드가 없습니다.');
  const discarded=p.deck[crypto.randomInt(p.deck.length)];move(r,discarded,'grave',who);
  log(r,'mill',`${p.label}: 스톰 팬니르 소환 비용으로 덱의 무작위 카드 1장을 묘지로 보냈습니다.`);
  summonToken(r,who,'스톰 토큰',0,50);break;
 }
 case 'COC-19-006':{const snapshots=r.players.flatMap((pp,controller)=>pp.field.filter(Boolean).map(mid=>({mid,controller})));H.destroyBatch(r,snapshots.map(x=>x.mid));for(const {mid,controller} of snapshots){if(r.units[mid]&&zoneOwner(r,mid)?.zone==='grave'&&r.players[controller].field.includes(null)){move(r,mid,'field',controller);r.units[mid].cannotAttackUntil=r.turnNumber;}}break}
 case 'COC-27-003':{let n=0;for(let k=0;k<2;k++){if(!p.deck.length)break;const mid=p.deck.shift();const mc=cards.get(r.units[mid].cardId);p.grave.push(mid);n++;if(k===0&&mc.type!=='몬스터')break}u.atk+=50*n;u.hp=(u.hp??0)+50*n;log(r,'mill',`${p.label}: 분쇄차 티라노 소재 ${n}장 묘지 이동`);break}
 case 'COC-27-004':H.destroyBatch(r,r.players.flatMap(pp=>pp.field.filter(mid=>mid&&mid!==id)));break;
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
 case 'COC-30-010':p.hp+=B.yurikaHeal;break;
 default:break;
 }}
function processStartOfTurn(r){const who=r.turn,p=r.players[who];p.turnsTaken=(p.turnsTaken||0)+1;beginSwordTurn(r,who,{getZone:zoneOwner,log});if(r.status==='finished')return;p.aiRejected=[];p.aiRejectedAbilities=[];for(const u of Object.values(r.units)){if(u.buffExpiresAt&&u.buffExpiresAt<=p.turnsTaken&&u.owner===who){u.atk=Math.max(0,u.atk-(u.temporaryBuff||0));u.temporaryBuff=0;u.buffExpiresAt=0}}p.lastRoundPlays=p.roundPlays||0;p.roundPlays=0;p.roundElementUses=0;p.elementSpellPlaysThisTurn=0;p.spellsThisTurn=0;
 
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
 for(const e of [...(r.effects||[])])if(e.type==='selfDevourBuff'&&e.player===r.turn&&e.turn===r.turnNumber){
  const u=r.units[e.unitId];if(u&&u.selfDevourBuffToken===e.token&&zoneOwner(r,e.unitId)?.zone==='integration')u.atk=Math.max(0,u.atk-e.amount);
  if(u?.selfDevourBuffToken===e.token)delete u.selfDevourBuffToken;
  r.effects.splice(r.effects.indexOf(e),1);
 }

 for(const e of [...(r.effects||[])])if(e.type==='returnWakeup'&&e.player===r.turn&&e.turn===r.turnNumber){
  if(zoneOwner(r,e.spellId)?.zone==='grave'){move(r,e.spellId,'hand',e.player);log(r,'effect','웨이크업 드래곤! 엔드 페이즈 패 복귀')}
  r.effects.splice(r.effects.indexOf(e),1);
 }
 const p=r.players[r.turn];for(const id of [...p.field].filter(Boolean))if(r.units[id].cardId==='COC-20-001'){hurt(r,id,150)}
 endSwordTurn(r,r.turn);
 setOutcome(r);
}
function isAggro(r,id){const u=r.units[id];return u&&!u.effectsNegated&&['COC-12-007','COC-12-014','COC-08-002','COC-09-004','COC-21-010'].includes(u.cardId)}
function maxAttacks(u,turn){const base=u.cardId==='COC-09-003'?2:Math.max(1,u.extraAttacks||1);return base+(u.bonusAttackTurn===turn?(u.bonusAttackCount||0):0)}
function attackAvailable(u,turn){return u.attackCountTurn!==turn||(u.attackCount||0)<maxAttacks(u,turn)}
function validateAggro(r,who,target){const aggro=r.players[1-who].field.filter(id=>id&&isAggro(r,id));if(aggro.length&&(!target||target.type!=='unit'||!aggro.includes(target.id)))fail(409,'공격 대상 강제(어그로): 해당 몬스터 중에서 선택해야 합니다.')}
function isSimpleSummonCard(c){return c.type==='몬스터'&&(!c.conditions.length||c.conditions.every(s=>/공격|이 몬스터|효과|드로우|시작|턴/.test(s)))}
function scheduleWakeupReturn(r,who,spellId){
 r.effects??=[];
 if(!r.effects.some(e=>e.type==='returnWakeup'&&e.spellId===spellId&&e.turn===r.turnNumber))r.effects.push({type:'returnWakeup',spellId,player:who,turn:r.turnNumber});
}
function performExtraSummon(r,who,body,{defer=false}={}){
 if(defer&&(r.effectStack?.length||r.pendingTriggerOrder))fail(409,'다른 효과 체인이 해결되기 전에는 소환을 선언할 수 없습니다.');
 const p=r.players[who],extraUnitId=requireStr(body.extraUnitId,100);
 const recipe=validateExtraSummon({room:r,who,extraUnitId,materials:body.materials,spellUnitId:body.spellUnitId,cards});
 if(recipe.spellUnitId&&p.spellForbiddenUntil>0&&p.spellForbiddenUntil>=p.turnsTaken)fail(409,'주문 사용 금지 상태에서는 퓨전 주문을 발동할 수 없습니다.');
 if(r.units[extraUnitId].cardId==='COC-12-012'){
  const eligible=r.players[1-who].field.filter(Boolean).filter(id=>Math.max(0,Number(cards.get(r.units[id].cardId)?.atk)||0)<r.units[extraUnitId].atk);
  if(eligible.length&&!eligible.includes(body.target?.id))fail(409,'파괴할 유효한 상대 몬스터를 지정하세요.');
 }
 if(recipe.spellUnitId){
  if(r.units[recipe.spellUnitId].cardId===FUSION_UP_ID)markEffectUsed(r,who,recipe.spellUnitId,1);
  move(r,recipe.spellUnitId,'grave',who);
  if(recipe.method==='wakeup')scheduleWakeupReturn(r,who,recipe.spellUnitId);
 }
 for(const id of recipe.materials){if(recipe.method==='wakeup')H.destroy(r,id);else move(r,id,'grave',r.units[id].owner)}
 if(defer){
  r.pendingExtraSummon={who,extraUnitId,recipe,targetId:body.target?.id||null,turnNumber:r.turnNumber};
  queueSummonEffect(r,r.pendingExtraSummon);
  log(r,'summon',`${p.label}: ${unitName(r,extraUnitId)} 특수 소환 선언 (비용 지불, 상대 대응 대기)`);
  setOutcome(r);
  return recipe;
 }
 return finishExtraSummon(r,{who,extraUnitId,recipe,targetId:body.target?.id||null});
}
function negateExtraSummon(r,pending){
 // User confirmed 2026-10-14: the negated monster stays in the extra deck.
 log(r,'summon',`${r.players[pending.who].label}: 소환 무효 (${['elemental','recruit'].includes(pending.recipe.method)?'원래 영역':'엑스트라 덱'} 유지, 비용 반환 없음)`);
 setOutcome(r);
}
function finishExtraSummon(r,pending){
 const {who,extraUnitId,recipe,targetId}=pending,p=r.players[who];
 if(['elemental','recruit'].includes(recipe.method)){
  const valid=(recipe.method==='elemental'?elementalChoices(r,who,H):recruitChoices(r,who)).some(c=>c.id===extraUnitId&&c.zone===pending.originZone);
  if(!valid||!p.field.includes(null)){log(r,'summon','교체 소환 불발: 대상·조건·빈 자리 소실 (비용 반환 없음)');setOutcome(r);return null;}
  move(r,extraUnitId,'field',who);runSummonEffects(r,who,extraUnitId);log(r,'summon',`${p.label}: ${unitName(r,extraUnitId)} ${recipe.method==='recruit'?'효과':'교체'} 소환 완료`);setOutcome(r);return extraUnitId;
 }
 if(!p.extra.includes(extraUnitId)||!p.field.includes(null)){
  log(r,'summon',`${p.label}: 특수 소환 실패 (비용 반환 없음)`);
  setOutcome(r);
  return null;
 }
 move(r,extraUnitId,'field',who);
 if(recipe.method==='infinity'||(cards.get(r.units[extraUnitId].cardId)?.type||'').includes('얼라이즈'))attachOverlayMaterials(r,extraUnitId,recipe.materials);
 if(['COC-12-014','COC-26-012','COC-27-013'].includes(r.units[extraUnitId].cardId))r.units[extraUnitId].cannotAttack=true;
 if(recipe.method==='wakeup')scheduleWakeupReturn(r,who,recipe.spellUnitId);
 const c=cards.get(r.units[extraUnitId].cardId);
 log(r,'fusion',`${p.label}: ${c.name} 소환 (소재 ${recipe.materials.length}장, ${recipe.method})`);
 if(c.id==='COC-12-012'){
  const eligible=r.players[1-who].field.filter(Boolean).filter(id=>Math.max(0,Number(cards.get(r.units[id].cardId)?.atk)||0)<r.units[extraUnitId].atk);
  if(eligible.includes(targetId))H.destroy(r,targetId);
  else if(eligible.length)log(r,'effect','소환 효과의 원래 대상 소실로 파괴 처리에 실패했습니다.');
 }
 if(c.id==='COC-22-015')findCardInDeck(r,who,'퓨전업')||findCardInDeck(r,who,'퓨전 업');
 setOutcome(r);
 return recipe;
}
function queueAutomatedSpell(r,who,id,c,body){
 if(r.effectStack?.length||r.pendingTriggerOrder||r.pendingSpell)fail(409,'다른 효과 체인이 해결되기 전에는 주문을 발동할 수 없습니다.');
 // The spell card moves to grave as the usage cost, but the declared effect
 // survives by the already-approved independent/self-cost exception.
 move(r,id,'grave',who);
 declareEffect(r,{effectId:'auto-spell-resolution',owner:who,sourceId:id,
  exception:'self-cost',payload:{cardId:c.id,body:structuredClone(body)}});
 r.pendingSpell={who,sourceId:id,cardId:c.id,turnNumber:r.turnNumber,stage:'response'};
 log(r,'spell',`${r.players[who].label}: ${c.name} 주문 선언 및 대응 대기`);
}
function finishAutomatedSpell(r){
 if(!r.pendingSpell)fail(409,'해결할 주문이 없습니다.');
 const pending=r.pendingSpell;
 r.pendingSpell=null;
 const outcomes=resolveEffectStack(r,{
  getZone:id=>zoneOwner(r,id),
  execute:effect=>{
   if(counterEffectIds.has(effect.effectId)){resolveCardCounter(r,pending,effect,{log,name:unitName});return;}
   if(effect.effectId!=='auto-spell-resolution'||effect.owner!==pending.who||
      effect.sourceId!==pending.sourceId||effect.payload.cardId!==pending.cardId)
    throw new Error('unexpected spell effect in response stack');
   const card=cards.get(effect.payload.cardId);
   if(!card||!REACTIVE_SPELL_IDS.has(card.id))throw new Error('unregistered queued spell effect');
   if(!evolutionStillValid(r,effect.owner,card.id,effect.payload.body)||!responseTargetStillValid(r,effect.owner,card.id,effect.payload.body,H)){
    log(r,'effect',`${card.name}: 선언한 대상 소실/대상 조건 변경으로 불발 (비용 반환 없음)`);
    return;
   }
   const result=castAutomatedSpell(r,effect.owner,card,effect.payload.body,H,{activationValidated:true});
   if(result?.evolution)evolveIntegration(r,effect.owner,card.id,effect.payload.body,cards,H);
   if(result?.deckSearch&&r.status==='active')beginDeckSearch(r,effect.owner,card.id,cards,H);
   if(result?.retain){
    const z=zoneOwner(r,effect.sourceId);
    if(z?.zone==='grave'&&z.player===r.units[effect.sourceId].owner){
     if(result.retain==='hand')move(r,effect.sourceId,'hand',r.units[effect.sourceId].owner);
     else if(result.retain==='field'&&card.id==='COC-05-002'){
      move(r,effect.sourceId,'field',effect.owner);
      Object.assign(r.units[effect.sourceId],{atk:result.atk,hp:result.hp,cannotAttack:true});
     }else throw new Error('unsupported queued retention zone');
    }else log(r,'effect','주문 원본이 묘지에서 이동하여 회수/몬스터화 불가');
   }
   log(r,'effect',`${r.players[effect.owner].label}: ${card.name} 주문 효과 해결`);
  },
  onResult:(result,effect)=>{
   if(result.status==='negated-by-effect')log(r,'effect',`${cards.get(effect.payload.cardId)?.name||unitName(r,effect.sourceId)||'효과'}: 무효화되어 해결하지 않음 (비용 반환 없음)`);
   if(result.status==='negated-source-moved')log(r,'effect','대응 효과 소스 이탈/조종권 변경으로 무효');
  }
 });
 if(!outcomes.length)throw new Error('queued spell had no stack entry');
 setOutcome(r);
 return outcomes;
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
function publicState(r,viewer){const mapId=id=>id?{...r.units[id],atk:swordActualAttack(r,id,{getZone:zoneOwner}),swordDoubleStacks:swordMultiplierCount(r,id,{getZone:zoneOwner}),card:cards.get(r.units[id].cardId)||r.units[id].tokenCard}:null;return {code:r.code,status:r.status,version:r.version,rulesVersion:RULES,balanceRevision:BALANCE_REVISION,mode:r.mode||'pvp',difficulty:r.aiDifficulty||null,aiDeckId:r.mode==='ai'?r.players[1]?.deckId:null,automation:{supportedSpells:spellHandlerIds.length,totalSpells:catalog.cards.filter(c=>c.type==='주문').length,fieldAbilityIds:FIELD_ABILITY_IDS,graveAbilityIds:GRAVE_ABILITY_IDS},graveAbilities:legalGraveAbilities(r,viewer,H),turn:r.turn,phase:r.phase,turnNumber:r.turnNumber,winner:r.winner,pendingAttack:r.pendingAttack?{...r.pendingAttack,attacker:mapId(r.pendingAttack.attackerId),target:r.pendingAttack.target}:null,pendingTriggerOrder:r.pendingTriggerOrder?{
 awaiting:r.pendingTriggerOrder.awaiting[0],
 count:r.pendingTriggerOrder.effects.length,
 options:r.pendingTriggerOrder.effects.filter(e=>e.owner===viewer&&r.pendingTriggerOrder.awaiting[0]===viewer)
  .map(e=>({key:e.key,title:e.title||e.effectId,priority:e.priority||0}))
 }:null,elementalAbilities:legalElementalAbilities(r,viewer,H),pendingElementalChoice:elementalChoiceView(r,viewer,H),pendingRecruitChoice:recruitChoiceView(r,viewer,H),pendingDeckSearch:deckSearchView(r,viewer,cards),pendingAbility:r.pendingAbility?{who:r.pendingAbility.who,card:{id:r.pendingAbility.cardId,name:cards.get(r.pendingAbility.cardId)?.name},stage:r.pendingAbility.stage||'response',awaiting:abilityResponsePlayer(r),counter:r.pendingAbility.counter?{who:r.pendingAbility.counter.who,name:unitName(r,r.pendingAbility.counter.sourceId)}:null,counters:legalAbilityCounters(r,viewer).map(id=>({sourceUnitId:id,name:unitName(r,id),limitText:counterLimitLabel(r.units[id].cardId)}))}:null,pendingSpell:r.pendingSpell?{who:r.pendingSpell.who,card:{id:r.pendingSpell.cardId,name:cards.get(r.pendingSpell.cardId)?.name},stage:'response',awaiting:spellResponsePlayer(r),counter:r.pendingSpell.counter?{who:r.pendingSpell.counter.who,name:unitName(r,r.pendingSpell.counter.sourceId)}:null,counters:legalSpellCounters(r,viewer).map(id=>({sourceUnitId:id,name:unitName(r,id),limitText:counterLimitLabel(r.units[id].cardId)}))}:null,pendingExtraSummon:r.pendingExtraSummon?{who:r.pendingExtraSummon.who,card:{id:r.units[r.pendingExtraSummon.extraUnitId].cardId,name:unitName(r,r.pendingExtraSummon.extraUnitId)},method:r.pendingExtraSummon.recipe.method,materialCount:r.pendingExtraSummon.recipe.materials.length,stage:'response',awaiting:extraResponsePlayer(r),counter:r.pendingExtraSummon.counter?{who:r.pendingExtraSummon.counter.who,name:unitName(r,r.pendingExtraSummon.counter.sourceId)}:null,counters:legalSummonCounters(r,viewer).map(id=>({sourceUnitId:id,name:unitName(r,id),limitText:counterLimitLabel(r.units[id].cardId)}))}:null,pendingManual:r.pendingManual?{...r.pendingManual}:null,persistentEffects:(r.persistentEffects||[]).map(e=>({kind:e.kind,owner:e.owner,counters:e.counters})),logs:r.logs.slice(-80),you:viewer,players:r.players.map((p,i)=>({index:i,label:p.label,deckId:p.deckId,deckName:decks.get(p.deckId)?.name,hp:p.hp,playerAtkBonus:p.playerAtkBonus||0,reloads:p.reloads,deckCount:p.deck.length,handCount:p.hand.length,grave:p.grave.map(mapId),banishedCount:p.banished.length,extraCount:p.extra.length,field:p.field.map(mapId),integration:mapId(p.integration),hand:i===viewer?p.hand.map(mapId):null,extra:i===viewer?p.extra.map(mapId):null}))}}
function apply(r,who,type,body){const p=r.players[who];let changed=true;
 if(r.pendingRecruitChoice&&!['recruitChoice','concede'].includes(type))fail(409,'소환할 크로와를 선택해야 합니다.');
 if(r.pendingElementalChoice&&!['elementalChoice','concede'].includes(type))fail(409,'교체 소환할 카드를 선택해야 합니다.');
 if(r.pendingAbility&&!(r.pendingAbility.stage==='cost-triggers'?['triggerOrder','concede']:['abilityResponse','concede']).includes(type))fail(409,'필드 효과 대응 중에는 다른 행동을 할 수 없습니다.');
 if(r.pendingDeckSearch&&!['deckSearch','concede'].includes(type))fail(409,'덱 검색 선택을 완료해야 합니다.');
 if(r.pendingExtraSummon&&!['extraResponse','concede'].includes(type))fail(409,'특수 소환 대응 중에는 다른 행동을 할 수 없습니다.');
 if(r.pendingSpell&&!['spellResponse','concede'].includes(type))fail(409,'주문 대응 창이 닫히기 전에는 다른 행동을 할 수 없습니다.');
 if(r.pendingTriggerOrder&&!['triggerOrder','concede'].includes(type))fail(409,'동시 자동 효과 선언 순서를 정하기 전에는 다른 행동을 할 수 없습니다.');
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
 case 'phase':{requireTurn(r,who);if(r.pendingAttack||r.pendingManual)fail(409,'대응·협의 중에는 페이즈를 변경할 수 없습니다.');if(r.phase==='MAIN'){r.phase=body.skipAttack?'END':'ATTACK';if(r.phase==='ATTACK'){processSwordAttackPhase(r,who,{getZone:zoneOwner,destroy:H.destroy,outcome:setOutcome,log});if(r.status==='active')onDragonAttackPhase(r,who,{log});}}else if(r.phase==='ATTACK'){r.phase='END';}else if(r.phase==='END'){processEndOfTurn(r);if(r.status!=='active')break;r.turn=1-who;r.turnNumber++;r.phase='DRAW';processStartOfTurn(r);}else fail(409,'먼저 드로우해야 합니다.');for(const unit of Object.values(r.units))if(unit.attackTurn<r.turnNumber-2)unit.attackTurn=-1;log(r,'phase',`${r.players[r.turn].label} / ${r.phase}`);break}
 case 'play':{requireTurn(r,who);if(r.phase!=='MAIN')fail(409,'메인 페이즈에서만 사용할 수 있습니다.');if(r.pendingAttack||r.pendingManual)fail(409,'현재 협의 중입니다.');const id=requireStr(body.unitId,100);if(!p.hand.includes(id))fail(403,'패에 없는 카드입니다.');const u=r.units[id],c=cards.get(u.cardId);
 if(c.id===FUSION_UP_ID)fail(409,'블랙 메탈 퓨전 업은 엑스트라 특수 소환에서 소재와 함께 사용하세요.');
 if(c.id==='COC-05-008')fail(409,'카툰 월드 가이드는 카툰 랜드 파괴 시 덱에서 자동 발동합니다.');
 if(c.id==='COC-11-007')fail(409,'파프니르는 토큰 사용·생성 시 자동으로만 소환할 수 있습니다.');
 if(c.id==='COC-11-008'||c.id==='COC-11-009')fail(409,'이 생성 주문은 자동 발동 조건으로만 사용할 수 있습니다.');
 // R20: use prohibitions and unsupported AI actions are legality checks, not
 // effects: reject before any paid discard, sacrifice, or token event.
 if(c.type==='주문'&&(p.spellForbiddenUntil||0)>0&&p.spellForbiddenUntil>=p.turnsTaken)
  fail(409,'상대의 주문 사용 금지 효과가 적용 중입니다.');
 if(c.type==='주문'&&r.mode==='ai'&&!hasAutoSpell(c.id))
  fail(409,'이 주문의 특수 효과는 아직 자동 판정을 지원하지 않습니다. 다른 카드를 사용해 주세요.');
 if(c.type==='일체화'&&p.integration)fail(409,'이미 일체화했습니다.');
 if(c.id==='COC-21-002')validateLifeEatingSwordTarget(r,body,H,who);
 if(REACTIVE_SPELL_IDS.has(c.id))body=prepareResponseTargets(r,who,c.id,body,H);
 if(evolutionRules[c.id])body={...body,...validateEvolution(r,who,c.id,cards)};
 const activation=planActivation({room:r,who,unitId:id,cards,body});
 if(c.type==='몬스터'&&!p.field.includes(null)&&
    !activation.costs.some(cost=>p.field.includes(cost.unitId)))
  fail(409,'필드 세 칸이 모두 차 있습니다.');
 commitActivationCosts(r,activation,{draw,move:(room,id,to,owner)=>move(room,id,to,owner,{tokenAction:to==='grave'?'릴리스':to==='banished'?'사용':undefined}),destroy:(room,id)=>H.destroy(room,id,{cause:'cost'})});
 if(c.type==='몬스터'){move(r,id,'field',who);runSummonEffects(r,who,id,body)}else if(c.type==='일체화'){move(r,id,'integration',who);runIntegrationOnEnter(r,who,id)}else if(c.type==='주문'){
 const automated=hasAutoSpell(c.id);
 if(automated&&REACTIVE_SPELL_IDS.has(c.id)){queueAutomatedSpell(r,who,id,c,body)}
 else if(automated){const result=castAutomatedSpell(r,who,c,body,H);if(result.retain==='field'){move(r,id,'field',who);if(result.monsterized){r.units[id].atk=result.atk;r.units[id].hp=result.hp;r.units[id].cannotAttack=true}}else if(result.retain!=='hand')move(r,id,'grave',who);
  log(r,'effect',`${p.label}: ${c.name} 자동 효과 처리`);
 }else{move(r,id,'grave',who);log(r,'manual',`${p.label}: ${c.name} 주문 사용 — 상대 승인 기반 수동 판정 필요`)}
 }else fail(409,'이 카드 종류는 직접 사용할 수 없습니다.');
 p.roundPlays=(p.roundPlays||0)+1;
 if(/원소|금속/.test(c.attribute)){p.roundElementUses=(p.roundElementUses||0)+1;p.metalElementUsedGame=(p.metalElementUsedGame||0)+1;}
 if(c.type==='주문'){p.spellsThisTurn=(p.spellsThisTurn||0)+1;if(c.attribute==='원소')p.elementSpellPlaysThisTurn=(p.elementSpellPlaysThisTurn||0)+1;}
 if(c.attribute==='자연'&&c.type==='주문'){p.naturalStreak=(p.naturalStreak||0)+1;p.natureSpellsUsedGame=(p.natureSpellsUsedGame||0)+1;p.natureSpellTurns??=[];if(!p.natureSpellTurns.includes(r.turnNumber)){p.natureSpellTurns.push(r.turnNumber);if(p.natureSpellTurns.length>10)p.natureSpellTurns.shift();}}
 log(r,'play',`${p.label}: ${c.name} 사용`);setOutcome(r);break}
 case 'recruitChoice':{chooseRecruit(r,who,body.unitId,H);break;}
 case 'elementalChoice':{chooseElemental(r,who,body.unitId,H);break;}
 case 'ability':{if(isElemental(r.units[body.sourceUnitId]?.cardId)){if(!legalElementalAbilities(r,who,H).includes(body.sourceUnitId))fail(409,'지금은 원소 교체 효과를 발동할 수 없습니다.');queueFieldAbility(r,who,body,H);break;}requireTurn(r,who);if(r.phase!=='MAIN'||r.pendingAttack||r.pendingManual)fail(409,'지금은 일반 필드 효과를 사용할 수 없습니다.');if(FIELD_RESPONSE_IDS.includes(r.units[body.sourceUnitId]?.cardId)){queueFieldAbility(r,who,body,H);break;}const result=applyFieldAbility(r,who,body,{...H,destroy:(room,id,options={})=>H.destroy(room,id,{...options,sourceId:body.sourceUnitId}),hurt:(room,id,n,options={})=>hurt(room,id,n,{...options,sourceId:body.sourceUnitId}),destroyBatch:(room,ids,options={})=>H.destroyBatch(room,ids,{...options,sourceId:body.sourceUnitId})});log(r,'effect',`${p.label}: ${cards.get(result.cardId)?.name} 필드 효과 자동 처리`);setOutcome(r);break}
 case 'graveAbility':{requireTurn(r,who);applyGraveAbility(r,who,body,H);setOutcome(r);break}
 case 'extraSummon':{
  requireTurn(r,who);
  if(r.phase!=='MAIN'||r.pendingAttack||r.pendingManual)fail(409,'메인 페이즈에서만 특수 소환할 수 있습니다.');
  performExtraSummon(r,who,body,{defer:true});
  break;
 }
 case 'triggerOrder':{
  if(r.status!=='active'||!r.pendingTriggerOrder)fail(409,'선언 순서를 정할 자동 효과가 없습니다.');
  if(r.pendingTriggerOrder.awaiting[0]!==who)fail(403,'현재 선언 순서를 지정할 플레이어가 아닙니다.');
  try{chooseAutomaticTriggerOrder(r,who,body.orderedKeys)}catch(e){fail(409,e.message)}
  if(!r.pendingTriggerOrder){resolveQueuedDestroyHeals(r);resumeFieldAbility(r,H);}
  break;
 }
 case 'deckSearch':{finishDeckSearch(r,who,body.unitId,cards,H);break;}
 case 'abilityResponse':{
  if(r.status!=='active'||!r.pendingAbility||abilityResponsePlayer(r)!==who)fail(403,'필드 효과의 현재 대응권자만 행동할 수 있습니다.');
  if(body.choice==='counter'){declareAbilityCounter(r,who,body.sourceUnitId);log(r,'response',`${p.label}: ${unitName(r,body.sourceUnitId)} 무효화 선언`);break;}
  if(body.choice!=='pass')fail(409,'지원하지 않는 필드 효과 대응입니다.');
  finishFieldAbility(r,H);break;
 }
 case 'spellResponse':{
  if(r.status!=='active'||!r.pendingSpell||spellResponsePlayer(r)!==who)fail(403,'상대가 선언한 효과의 현재 대응권자만 행동할 수 있습니다.');
  if(body.choice==='counter'){
   declareSpellCounter(r,who,body.sourceUnitId);
   log(r,'response',`${p.label}: ${unitName(r,body.sourceUnitId)} 무효화 선언`);
   break;
  }
  if(body.choice!=='pass')fail(409,'자동화되지 않은 주문 무효화 응답은 사용할 수 없습니다.');
  log(r,'response',`${p.label}: 주문 대응 없음`);
  finishAutomatedSpell(r);
  break;
 }
 case 'extraResponse':{
  if(r.status!=='active'||!r.pendingExtraSummon||extraResponsePlayer(r)!==who)fail(403,'상대의 특수 소환/무효화에 대응하는 현재 대응권자만 행동할 수 있습니다.');
  if(body.choice==='counter'){
   declareSummonCounter(r,who,body.sourceUnitId);
   log(r,'response',`${p.label}: ${unitName(r,body.sourceUnitId)} 무효화 선언`);break;
  }
  if(body.choice!=='pass')fail(409,'이 소환 대응은 아직 지원하지 않습니다.');
  log(r,'response',`${p.label}: 특수 소환 대응 없음`);
  if(r.pendingExtraSummon.recipe.method==='wakeup')scheduleWakeupReturn(r,r.pendingExtraSummon.who,r.pendingExtraSummon.recipe.spellUnitId);
  resolveSummonResponse(r,{zone:zoneOwner,log,name:unitName,summon:finishExtraSummon,negate:negateExtraSummon});
  break;
 }
 case 'attack':{requireTurn(r,who);if(r.phase!=='ATTACK'||r.pendingAttack||r.pendingManual||((p.noAttackUntil||0)>=p.turnsTaken))fail(409,'현재 공격할 수 없습니다.');const attacker=r.units[requireStr(body.attackerId,100)];const z=attacker&&zoneOwner(r,attacker.id);if(!z||z.player!==who||!['field','integration'].includes(z.zone)||attacker.cannotAttack||attacker.cannotAttackUntil===r.turnNumber||attacker.frozen||!attackAvailable(attacker,r.turnNumber))fail(409,'공격 가능한 카드가 아닙니다.');const target=body.target;if(!target||!['player','unit'].includes(target.type))fail(400,'공격 대상을 지정해 주세요.');if(target.type==='player'&&target.player!==undefined&&target.player!==1-who)fail(409,'상대 플레이어만 공격할 수 있습니다.');if(target.type==='unit'){const zz=zoneOwner(r,target.id);if(!zz||zz.player===who||zz.zone!=='field')fail(409,'공격할 수 없는 대상입니다.');}if(target.type==='player'&&(p.noDirectAttackUntil||0)>0&&p.noDirectAttackUntil>=p.turnsTaken)fail(409,'보호막 효과로 이번 턴에는 플레이어 직접 공격이 불가능합니다.');if(attacker.cardId==='COC-05-003'&&!p.field.some(mid=>mid&&unitName(r,mid).includes('카툰 랜드')))fail(409,'카툰 랜드가 없어 공격할 수 없습니다.');
 if(attacker.cardId==='COC-01-006'&&p.integration)fail(409,'일체화 중에는 골드마그마가 공격할 수 없습니다.');
 if(attacker.cardId==='COC-05-001'&&target.type==='player')fail(409,'카툰 데몬즈 드래곤은 플레이어를 직접 공격할 수 없습니다.');validateAggro(r,who,target);attacker.attackTurn=r.turnNumber;if(attacker.attackCountTurn!==r.turnNumber){attacker.attackCount=0;attacker.attackCountTurn=r.turnNumber}attacker.attackCount++;r.pendingAttack={attackerId:attacker.id,target:target.type==='player'?{type:'player',player:1-who}:{type:'unit',id:target.id},stage:'response'};log(r,'attack',`${p.label}: ${unitName(r,attacker.id)} 공격 선언`);break}
 case 'defend':{if(r.status!=='active'||r.pendingAttack?.stage!=='response'||who===r.turn||r.pendingManual)fail(409,'대응할 공격이 없습니다.');const a=r.pendingAttack,src=r.units[a.attackerId],sourceZone=zoneOwner(r,a.attackerId);if(!sourceZone||sourceZone.player!==r.turn){r.pendingAttack=null;log(r,'attack','공격자가 사라져 공격이 무효화되었습니다.');break;}const tz=a.target.type==='unit'?zoneOwner(r,a.target.id):null;if(a.target.type==='unit'&&(!tz||tz.player!==who||tz.zone!=='field')){a.stage='retarget';log(r,'attack','상대 대응으로 대상이 사라져 공격자가 재선택합니다.');break;}const targetName=a.target.type==='unit'?unitName(r,a.target.id):'플레이어';const currentAtk=swordActualAttack(r,src.id,{getZone:zoneOwner});const max=Math.min(currentAtk,src.diceMax??currentAtk);const dice=max>0?die(max,src.diceMin??1):0;let dealt=dice;
 if(a.target.type==='unit'){
  const partner=r.players[r.turn].field.some(mid=>mid&&r.units[mid].cardId==='COC-12-006'&&!r.units[mid].effectsNegated);
  if(partner&&cards.get(src.cardId)?.attribute==='영웅')dealt+=B.heroPartnerDamage;
  const targetUnit=r.units[a.target.id],prior=Math.max(0,targetUnit.hp??0),targetAtk=targetUnit.atk,invulnerable=targetUnit.battleInvulnerable;let inflicted=0;
  if(!invulnerable){const destroyed=dealt>0?damageUnit(r,a.target.id,-dealt,{battle:true,sourceId:src.id}):false;inflicted=Math.max(0,destroyed?prior:prior-(r.units[a.target.id]?.hp??prior));if(['COC-12-008','COC-12-013'].includes(src.cardId)&&!src.effectsNegated&&destroyed){r.players[who].hp-=Math.max(0,dice-prior)}if(destroyed&&src.cardId==='COC-12-011'){r.players[who].hp-=Math.max(0,targetAtk);log(r,'effect',`버디 히트토네이도: 파괴한 몬스터의 공격력 ${Math.max(0,targetAtk)}만큼 상대에게 피해`)}
   if(destroyed&&src.superiorClaw){const bonus=Math.max(0,Math.floor(targetAtk));r.players[who].hp-=bonus;log(r,'effect',`슈페리얼 클로: 전투로 파괴한 몬스터의 공격력 ${bonus}만큼 상대에게 피해`)}if((destroyed&&src.cardId==='COC-32-011')||(src.cardId==='COC-32-001'&&src.atk>targetAtk)){if(src.bonusAttackTurn!==r.turnNumber){src.bonusAttackTurn=r.turnNumber;src.bonusAttackCount=1;log(r,'effect',`${unitName(r,src.id)}: 이 턴 추가 공격 기회 1회 획득`)}}}
  else dealt=0;
  if(src.cardId==='COC-10-006')r.players[r.turn].hp+=Math.min(prior,dealt);
  if(src.cardId==='COC-21-007'&&!src.effectsNegated)r.players[r.turn].hp+=Math.floor(inflicted/B.vampireDrainDivisor);
 }else{if(!src.effectsNegated&&(src.cardId==='COC-32-003'||src.cardId==='COC-32-013')){const multiplier=src.cardId==='COC-32-013'?B.hurricaneDirectPerDie:B.windDirectPerDie;const bonus=die(6)*multiplier;dealt+=bonus;log(r,'effect',`${unitName(r,src.id)} 직접 공격: 1d6 × ${multiplier} = ${bonus} 추가 피해`)}r.players[who].hp-=dealt;
  if(src.cardId==='COC-10-006')r.players[r.turn].hp+=dealt;
  if(src.cardId==='COC-21-007'&&!src.effectsNegated)r.players[r.turn].hp+=Math.floor(dealt/B.vampireDrainDivisor);
 }
 log(r,'damage',`${max>0?`1d${max} = ${dice}`:'공격력 0: 다이스 없음'} / ${targetName}에게 ${dealt} 피해`);r.pendingAttack=null;setOutcome(r);break}
 case 'retarget':{requireTurn(r,who);if(r.pendingAttack?.stage!=='retarget'||r.pendingManual)fail(409,'대상 재선택을 할 수 없습니다.');const target=body.target;if(target===null){const blocked=(p.noDirectAttackUntil||0)>0&&p.noDirectAttackUntil>=p.turnsTaken;if(!blocked||r.players[1-who].field.some(Boolean))fail(409,'선택 가능한 공격 대상이 남아 있습니다.');r.pendingAttack=null;log(r,'attack','합법적인 재선택 대상이 없어 공격이 종료되었습니다.');break;}if(!target||!['player','unit'].includes(target.type))fail(400,'대상 오류');if(target.type==='player'&&target.player!==undefined&&target.player!==1-who)fail(409,'상대 플레이어만 재선택할 수 있습니다.');if(target.type==='player'&&(p.noDirectAttackUntil||0)>0&&p.noDirectAttackUntil>=p.turnsTaken)fail(409,'보호막 효과로 직접 공격 대상을 선택할 수 없습니다.');if(target.type==='unit'){const z=zoneOwner(r,target.id);if(!z||z.player===who||z.zone!=='field')fail(409,'재선택 대상 오류')}validateAggro(r,who,target);r.pendingAttack.target=target.type==='player'?{type:'player',player:1-who}:{type:'unit',id:target.id};r.pendingAttack.stage='response';log(r,'attack','공격 대상 재선택');break}
 case 'manual':{if(r.mode==='ai')fail(409,'AI 대전에서는 합의 판정을 사용할 수 없습니다.');if(r.status!=='active'||r.pendingManual)fail(409,'지금은 효과 협의를 요청할 수 없습니다.');if(!['hp','unitHp','unitAtk','move','draw','extra','note'].includes(body.kind))fail(400,'효과 유형 오류');const payload=body.payload;if(!payload||typeof payload!=='object'||Array.isArray(payload))fail(400,'효과 입력 오류');const explanation=requireStr(body.explanation,240);if(explanation.length<3)fail(400,'효과 근거를 구체적으로 적어 주세요.');r.pendingManual={by:who,kind:body.kind,payload,explanation};log(r,'manual',`${p.label}: 수동 판정 제안 — ${explanation}`);break}
 case 'manualDecision':{if(r.mode==='ai')fail(409,'AI 대전에서는 합의 판정을 사용할 수 없습니다.');if(r.status!=='active'||!r.pendingManual||r.pendingManual.by===who)fail(403,'상대의 제안만 승인할 수 있습니다.');const m=r.pendingManual;if(body.approve===true){runManual(r,m);log(r,'manual',`${p.label}: 효과 승인 — ${m.explanation}`)}else{log(r,'manual',`${p.label}: 효과 거절 — ${m.explanation}`)}r.pendingManual=null;break}
 case 'concede':{if(r.status!=='active')fail(409,'진행 중인 대전이 아닙니다.');r.status='finished';r.winner=1-who;r.pendingAttack=null;r.pendingManual=null;r.pendingExtraSummon=null;r.pendingTriggerOrder=null;r.pendingSpell=null;r.pendingAbility=null;r.pendingDeckSearch=null;r.pendingElementalChoice=null;r.pendingRecruitChoice=null;r.effectStack=[];log(r,'result',`${p.label} 항복`);break}
 default:fail(404,'알 수 없는 행동입니다.');
 }
 if(changed){r.version++;r.updatedAt=Date.now();save();}return publicState(r,who)
}
function chooseAIFieldAbility(r){
 const who=1,p=r.players[who],enemy=0;
 if(r.aiDifficulty==='easy'&&crypto.randomInt(3)===0)return null;
 for(const sourceUnitId of [...p.field,p.integration].filter(Boolean)){
  const u=r.units[sourceUnitId],id=u.cardId;if(isElemental(id))continue;
  if(u.effectsNegated||!FIELD_ABILITY_IDS.includes(id)||effectUsedThisTurn(r,who,sourceUnitId,1)||u.abilityGameUsed||p.aiRejectedAbilities?.includes(sourceUnitId))continue;
  const foes=r.players[enemy].field.filter(Boolean);
  const allies=p.field.filter(Boolean);
  const stronger=foes.sort((a,b)=>r.units[b].atk-r.units[a].atk);
  const body={sourceUnitId};
  if(['COC-05-004','COC-13-001','COC-13-002','COC-13-005'].includes(id)){
   if(!stronger.length)continue;
   body.target={type:'unit',id:stronger[0]};
  }
  if(id==='COC-12-013'){
   if(u.effectsNegated||!p.hand.length)continue;
   const target=stronger.find(mid=>!r.units[mid].effectDestructionImmune);
   if(!target)continue;
   body.target={type:'unit',id:target};
   body.costCardId=[...p.hand].sort((a,b)=>(Number(cards.get(r.units[a].cardId)?.atk)||0)-(Number(cards.get(r.units[b].cardId)?.atk)||0))[0];
  }
  if(id==='COC-10-005'){
   if(!stronger.length||!allies.length)continue;
   body.target={type:'unit',id:stronger[0]};
   const low=allies.filter(id=>!r.units[id].effectDestructionImmune).sort((a,b)=>r.units[a].atk-r.units[b].atk)[0];if(!low)continue;
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
  try{prepareFieldEffect(r,who,body,H);}catch(e){if(e.status===409)continue;throw e;}
  return body;
 }
 return null;
}
function chooseAIGraveAbility(r){
 const choices=legalGraveAbilities(r,1,H);
 return choices.sort((a,b)=>r.units[a.costUnitId].atk-r.units[b.costUnitId].atk)[0]||null;
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
function chooseAISpellCost(r,who,sourceUnitId){
 return r.players[who].hand.filter(id=>id!==sourceUnitId).sort((a,b)=>
  (Number(cards.get(r.units[a]?.cardId)?.atk)||0)-(Number(cards.get(r.units[b]?.cardId)?.atk)||0)
 )[0]||null;
}
function aiChoiceSpellBody(r,who,cardId){
 if(cardId==='COC-21-004'){
  const cost=r.players[who].field.filter(id=>id&&r.units[id].atk+(r.units[id].hp||0)>=B.envySacrificeTotal).sort((a,b)=>(r.units[a].atk+r.units[a].hp)-(r.units[b].atk+r.units[b].hp))[0];
  const target=r.players[1-who].field.find(Boolean);
  return {costUnitIds:cost?[cost]:[],target:target?{type:'unit',id:target}:undefined};
 }

 if(cardId==='COC-30-009'){
  const id=r.players[who].hand.find(uid=>r.units[uid].cardId===cardId);
  try{return {costDeckIds:natureEvolutionCosts(r,who,id,cards).slice(0,2)}}catch(e){if(e.status===409)return {};throw e;}
 }
 if(cardId==='COC-14-009')return {option:r.players[1-who].hp>50&&!r.players[who].field.some(Boolean)?2:1};
 if(cardId==='COC-23-009')return {option:r.players[1-who].field.some(Boolean)?1:2};
 if(cardId==='COC-05-006')return {targets:r.players.flatMap(p=>p.field.filter(Boolean)).filter(id=>isNonToonField(r,id,H)).slice(0,2)};
 return {};
}
function chooseAIMove(r){const who=1,p=r.players[who],level=r.aiDifficulty||'medium';
 const candidate=p.hand.filter(id=>{
  if(p.aiRejected?.includes(id))return false;
  const c=cards.get(r.units[id].cardId);
  // Costful spells must supply the same proposed choice during AI planning
  // as during the eventual action, or valid cards disappear from candidates.
  const body=c.id==='COC-31-009'?{costCardId:chooseAISpellCost(r,who,id)}:aiChoiceSpellBody(r,who,c.id);
  try{planActivation({room:r,who,unitId:id,cards,body})}
  catch(e){if(e.status===409)return false;throw e}
  const targets=responseTargetChoices(r,who,c.id,H,body);
  if(targets&&targets.length===0)return false;
  if(c.id==='COC-05-006'&&body.targets.length!==2)return false;
  if(c.id==='COC-11-011'&&!p.field.some(id=>id&&/용|드래곤/.test(H.attribute(r,id))))return false;
  if(c.id==='COC-21-002'&&!p.integration&&!p.field.some(mid=>mid&&r.units[mid].hp>30))return false;
  if(c.type==='주문')return hasAutoSpell(c.id);
  if(c.type==='일체화')return !p.integration&&!c.conditions.length;
  if(c.type==='몬스터')return p.field.includes(null)&&isSimpleSummonCard(c);
  return false;
 });
 if(!candidate.length)return null;
 const attack=(id)=>Math.max(0,Number(cards.get(r.units[id].cardId).atk)||0);
 const score=id=>{const c=cards.get(r.units[id].cardId);if(c.type==='몬스터')return attack(id)+40+(c.effects.length?25:0);if(c.type==='일체화')return 150+attack(id);if(c.id==='COC-30-007'&&p.hp>850)return -100;if(c.type==='주문')return 85;return 0};
 if(level==='easy'){if(crypto.randomInt(4)===0)return null;return candidate[crypto.randomInt(candidate.length)]}
 return [...candidate].sort((a,b)=>score(b)-score(a))[0];
}
function chooseAITarget(r,attacker,{forAttack=false}={}){const level=r.aiDifficulty,foe=r.players[0],aggro=foe.field.filter(id=>id&&isAggro(r,id));if(aggro.length)return {type:'unit',id:aggro[0]};
 const options=foe.field.filter(Boolean);if(forAttack&&(r.players[1].noDirectAttackUntil||0)>0&&r.players[1].noDirectAttackUntil>=r.players[1].turnsTaken)return options.length?{type:'unit',id:options[0]}:null;if(level==='easy')return options.length&&crypto.randomInt(2)===0?{type:'unit',id:options[crypto.randomInt(options.length)]}:{type:'player'};
 const atk=swordActualAttack(r,attacker,{getZone:zoneOwner});const killable=options.filter(id=>r.units[id].hp<=Math.max(1,atk/2));
 if(level==='hard'&&killable.length){killable.sort((a,b)=>r.units[b].atk-r.units[a].atk);return {type:'unit',id:killable[0]}}
 if(level==='medium'&&options.length&&crypto.randomInt(3)===0)return {type:'unit',id:options[0]};
 return {type:'player'};
}
function chooseAIElemental(r){
 const sources=legalElementalAbilities(r,1,H).filter(id=>!r.players[1].aiRejectedAbilities?.includes(id));if(!sources.length)return null;
 // Defend a declared attack by replacing its target. On our turn prefer a
 // stronger available form or refresh a wounded magician; do not cycle at random.
 if(r.pendingAttack?.stage==='response'&&sources.includes(r.pendingAttack.target?.id))return r.pendingAttack.target.id;
 if(r.turn!==1)return null;
 const best=Math.max(0,...elementalChoices(r,1,H).map(c=>Number(cards.get(r.units[c.id].cardId)?.atk)||0));
 return sources.find(id=>{
  const pairedSpell='COC-32-'+String(Number(r.units[id].cardId.slice(-3))+4).padStart(3,'0');
  if(r.players[1].hand.some(uid=>r.units[uid].cardId===pairedSpell)&&!(r.players[1].spellForbiddenUntil>=r.players[1].turnsTaken))return false;
  return best>r.units[id].atk||r.units[id].hp<Number(cards.get(r.units[id].cardId)?.hp);
 })||null;
}
function runAI(r){if(r.mode!=='ai'||r.status!=='active')return;
 let steps=0;while(r.status==='active'&&steps++<70){
  if(r.pendingManual)break;
  if(r.pendingRecruitChoice){
   if(r.pendingRecruitChoice.who!==1)break;
   const choices=recruitChoices(r,1);const choice=choices.find(c=>c.zone==='grave')||choices[0];
   apply(r,1,'recruitChoice',{unitId:choice?.id});continue;
  }
  if(r.pendingElementalChoice){
   if(r.pendingElementalChoice.who!==1)break;
   const choices=elementalChoices(r,1,H),score=c=>{const card=cards.get(r.units[c.id].cardId);return (Number(card?.atk)||0)+(r.aiDifficulty==='hard'&&r.turn!==1?2*(Number(card?.hp)||0):0);};
   const chosen=r.aiDifficulty==='easy'?choices[crypto.randomInt(Math.max(1,choices.length))]:[...choices].sort((a,b)=>score(b)-score(a))[0];
   apply(r,1,'elementalChoice',{unitId:chosen?.id});continue;
  }
  if(r.pendingDeckSearch){
   if(r.pendingDeckSearch.who!==1)break;
   const choices=deckSearchView(r,1,cards).choices;
   const selected=r.aiDifficulty==='easy'?choices[0]:[...choices].sort((a,b)=>(Number(b.card.atk)||0)-(Number(a.card.atk)||0))[0];
   apply(r,1,'deckSearch',{unitId:selected?.id});continue;
  }
  if(r.pendingAbility&&r.pendingAbility.stage!=='cost-triggers'){if(abilityResponsePlayer(r)===1){const sourceUnitId=legalAbilityCounters(r,1)[0];apply(r,1,'abilityResponse',sourceUnitId?{choice:'counter',sourceUnitId}:{choice:'pass'});continue;}break;}
  if(r.pendingSpell){
   if(spellResponsePlayer(r)===1){
    const sourceUnitId=legalSpellCounters(r,1)[0];
    apply(r,1,'spellResponse',sourceUnitId?{choice:'counter',sourceUnitId}:{choice:'pass'});continue;
   }
   break;
  }
  if(r.pendingTriggerOrder){
   if(r.pendingTriggerOrder.awaiting[0]===1){
    const orderedKeys=r.pendingTriggerOrder.effects.filter(e=>e.owner===1).map(e=>e.key);
    apply(r,1,'triggerOrder',{orderedKeys});continue;
   }
   break;
  }
  if(r.pendingExtraSummon){if(extraResponsePlayer(r)===1){const sourceUnitId=legalSummonCounters(r,1)[0];apply(r,1,'extraResponse',sourceUnitId?{choice:'counter',sourceUnitId}:{choice:'pass'});continue}break;}
  const elementalSource=r.turn===0?chooseAIElemental(r):null;if(elementalSource){apply(r,1,'ability',{sourceUnitId:elementalSource});continue;}
  if(r.pendingAttack){if(r.turn===0&&r.pendingAttack.stage==='response'){apply(r,1,'defend',{});continue}if(r.turn===1&&r.pendingAttack.stage==='retarget'){apply(r,1,'retarget',{target:chooseAITarget(r,r.pendingAttack.attackerId,{forAttack:true})});continue}break;}
  if(r.turn!==1)break;
  try{
   if(r.phase==='DRAW'){apply(r,1,'draw',{});continue}
   if(r.phase==='MAIN'){
    const graveAbility=chooseAIGraveAbility(r);if(graveAbility){apply(r,1,'graveAbility',graveAbility);continue}
    const ability=chooseAIFieldAbility(r);if(ability){const snapshot=structuredClone(r);try{apply(r,1,'ability',ability)}catch(e){for(const key of Object.keys(r))delete r[key];Object.assign(r,snapshot);r.players[1].aiRejectedAbilities??=[];r.players[1].aiRejectedAbilities.push(ability.sourceUnitId);log(r,'ai',`AI가 실행 불가능한 필드 효과를 건너뛰었습니다: ${e.message}`)}continue}
    const extra=chooseAIExtra(r);if(extra){apply(r,1,'extraSummon',extra);continue}
    const elemental=chooseAIElemental(r);if(elemental){apply(r,1,'ability',{sourceUnitId:elemental});continue;}
    const id=chooseAIMove(r);
     if(id){
      const c=cards.get(r.units[id].cardId);
      const t=['COC-03-008','COC-17-003','COC-30-007','COC-32-006'].includes(c.id)?
       {type:'player',player:1}:chooseAITarget(r,id);
      if(c.id==='COC-21-002'){
       if(r.players[1].integration){t.type='player';t.player=1;delete t.id;}
       else{
        const bearer=r.players[1].field.find(mid=>mid&&r.units[mid].hp>30);
        if(bearer){t.type='unit';t.id=bearer;delete t.player;}
       }
      }
      const enemyUnits=r.players[0].field.filter(Boolean);
      const allUnits=r.players.flatMap(p=>p.field.filter(Boolean));
      if(['COC-08-001','COC-08-008','COC-31-002','COC-05-007'].includes(c.id)&&enemyUnits.length){
       t.type='unit';t.id=enemyUnits[0];delete t.player;
      }
      if(['COC-01-004','COC-01-005','COC-31-006'].includes(c.id)){
       const pool=c.id==='COC-31-006'?
        allUnits.filter(mid=>!/마술사|마법사/.test(cards.get(r.units[mid].cardId)?.attribute||'')):allUnits;
       if(pool.length){t.type='unit';t.id=pool[0];delete t.player;}
      }
      if(c.id==='COC-13-008'&&r.players[0].hand.length){
        // AI may evaluate the opponent hand only while using this permitted effect.
        const chosen=[...r.players[0].hand].sort((a,b)=>(Number(cards.get(r.units[b].cardId)?.atk)||0)-(Number(cards.get(r.units[a].cardId)?.atk)||0))[0];
        t.type='unit';t.id=chosen;delete t.player;
       }
       if(c.id==='COC-30-011'){t.type='player';t.player=0;delete t.id;}
       if(c.id==='COC-20-004'){
        const burning=r.players[1].field.find(mid=>mid&&/버닝\s*데몬즈?/.test(unitName(r,mid)));
        if(burning){t.type='unit';t.id=burning;delete t.player;}
       }
       if(c.id==='COC-20-011'){
        const burning=r.players[1].field.find(mid=>mid&&/버닝\s*데몬즈/.test(unitName(r,mid)));
        if(burning){t.type='unit';t.id=burning;delete t.player;}
       }
       if(c.id==='COC-27-010'){
        const fighter=r.players[1].field.find(mid=>mid&&unitName(r,mid).includes('슈페리얼 파이터'));
        if(fighter){t.type='unit';t.id=fighter;delete t.player;}
       }
       if(c.id==='COC-30-004'&&enemyUnits.length){
       t.type='unit';t.id=[...enemyUnits].sort((a,b)=>(r.units[a].hp??1e9)-(r.units[b].hp??1e9))[0];delete t.player;
      }
      let targets=c.id==='COC-06-004'?allUnits.slice(0,2):undefined;
      const choiceBody=aiChoiceSpellBody(r,1,c.id);
      const legalTargets=responseTargetChoices(r,1,c.id,H,choiceBody);
      if(legalTargets){
       if(t.type==='player'&&t.player===undefined)t.player=0;
       if(!responseTargetStillValid(r,1,c.id,{...choiceBody,target:t},H)){
        for(const key of Object.keys(t))delete t[key];
        Object.assign(t,legalTargets[0]);
       }
      }
      const before=structuredClone(r);
      try{apply(r,1,'play',{unitId:id,target:t,targets,...choiceBody,costCardId:c.id==='COC-31-009'?chooseAISpellCost(r,1,id):undefined});}
      catch(e){
       for(const key of Object.keys(r))delete r[key];
       Object.assign(r,before);
       r.players[1].aiRejected??=[];
       r.players[1].aiRejected.push(id);
       if(r.players[1].aiRejected.length>20)r.players[1].aiRejected.shift();
       log(r,'ai',`AI가 사용 불가능한 ${c.name} 카드를 건너뛰었습니다.`);
      }
      continue;
     }
    apply(r,1,'phase',{});continue;
   }
   if(r.phase==='ATTACK'){
    const units=r.players[1].noAttackUntil>=r.players[1].turnsTaken?[]:[...r.players[1].field,r.players[1].integration].filter(id=>id&&!r.units[id].cannotAttack&&!r.units[id].frozen&&r.units[id].cannotAttackUntil!==r.turnNumber&&attackAvailable(r.units[id],r.turnNumber)&&!(r.units[id].cardId==='COC-01-006'&&r.players[1].integration)&&!(r.units[id].cardId==='COC-05-003'&&!r.players[1].field.some(mid=>mid&&unitName(r,mid).includes('카툰 랜드'))));
    if(units.length){const attackerId=r.aiDifficulty==='easy'?units[crypto.randomInt(units.length)]:units.sort((a,b)=>r.units[b].atk-r.units[a].atk)[0];{const chosen=chooseAITarget(r,attackerId,{forAttack:true});if(chosen)apply(r,1,'attack',{attackerId,target:chosen});else apply(r,1,'phase',{})};continue}
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
 const costPreview=/^\/api\/rooms\/([A-Z0-9]{6})\/evolution-costs$/.exec(url.pathname);
 if(req.method==='GET'&&costPreview){
  const r=getRoom(costPreview[1]),who=indexFor(r,req.headers.authorization?.replace(/^Bearer /,''));
  requireTurn(r,who);
  if(r.phase!=='MAIN'||r.pendingElementalChoice||r.pendingRecruitChoice||r.pendingAbility||r.pendingDeckSearch||r.pendingSpell||r.pendingExtraSummon||r.pendingAttack||r.pendingManual||r.pendingTriggerOrder)fail(409,'지금은 진화 비용을 선택할 수 없습니다.');
  const p=r.players[who];if((p.spellForbiddenUntil||0)>0&&p.spellForbiddenUntil>=p.turnsTaken)fail(409,'주문 사용 금지 상태입니다.');
  const ids=natureEvolutionCosts(r,who,url.searchParams.get('unitId'),cards);
  return reply(res,200,{choices:ids.map(id=>({id,card:cards.get(r.units[id].cardId)}))});
 }
 const preview=/^\/api\/rooms\/([A-Z0-9]{6})\/hand-preview$/.exec(url.pathname);
 if(req.method==='GET'&&preview){const r=getRoom(preview[1]);const token=req.headers.authorization?.replace(/^Bearer /,'');const who=indexFor(r,token);
 if(r.status!=='active'||r.turn!==who||r.phase!=='MAIN'||r.pendingElementalChoice||r.pendingRecruitChoice||r.pendingAbility||r.pendingDeckSearch||r.pendingExtraSummon||r.pendingSpell||r.pendingTriggerOrder||r.pendingAttack||r.pendingManual||((r.players[who].spellForbiddenUntil||0)>=r.players[who].turnsTaken&&r.players[who].turnsTaken>0)||!r.players[who].hand.some(id=>r.units[id].cardId==='COC-13-008'))fail(403,'이 카드를 사용 가능한 상태가 아닙니다.');
 return reply(res,200,{cards:r.players[1-who].hand.map(id=>({id,name:cards.get(r.units[id].cardId).name}))})
 }
if(req.method==='POST'&&url.pathname==='/api/ai'){
 const body=await readBody(req),difficulty=requireStr(body.difficulty||'medium',16);
 if(!['easy','medium','hard'].includes(difficulty))fail(400,'AI 난이도가 올바르지 않습니다.');
 const chosen=body.aiDeckId==='random'||!body.aiDeckId?catalog.decks[crypto.randomInt(catalog.decks.length)].id:body.aiDeckId;
 if(!decks.has(chosen))fail(400,'AI 덱을 찾을 수 없습니다.');
 const token=secret();let code;do{code=randomCode()}while(rooms[code]);
 const r={code,createdAt:Date.now(),updatedAt:Date.now(),status:'lobby',version:1,mode:'ai',aiDifficulty:difficulty,turn:0,turnNumber:0,phase:'',winner:null,pendingAttack:null,pendingExtraSummon:null,pendingManual:null,players:[],units:{},logs:[],effects:[]};
 createPlayer(r,body.deckId,body.label,token);createPlayer(r,chosen,'AI · '+({easy:'하',medium:'중',hard:'상'}[difficulty]),secret());r.players[1].ai=true;
 rooms[code]=r;apply(r,0,'start',{});runAI(r);return reply(res,201,{code,token,state:publicState(r,0)})
 }
 if(req.method==='POST'&&url.pathname==='/api/rooms'){const body=await readBody(req);const token=secret();let code;do{code=randomCode()}while(rooms[code]);const r={code,createdAt:Date.now(),updatedAt:Date.now(),status:'lobby',mode:'pvp',version:1,turn:0,turnNumber:0,phase:'',winner:null,pendingAttack:null,pendingExtraSummon:null,pendingManual:null,players:[],units:{},logs:[]};createPlayer(r,body.deckId,body.label,token);rooms[code]=r;save();return reply(res,201,{code,token,state:publicState(r,0)})}const mt=/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|actions))?$/.exec(url.pathname.replace(/^\/api\/rooms\/([a-z0-9]{6})/,(_,code)=>'/api/rooms/'+code.toUpperCase()));if(url.pathname.startsWith('/api/rooms/')&& !mt)fail(404,'잘못된 방 주소');if(mt){const code=mt[1];const sub=mt[2];const r=getRoom(code);if(req.method==='POST'&&sub==='join'){if(r.mode==='ai'||r.status!=='lobby'||r.players.length>=2)fail(409,'이미 시작했거나 가득 찬 방입니다.');const body=await readBody(req),token=secret();createPlayer(r,body.deckId,body.label,token);r.version++;save();return reply(res,201,{code,token,state:publicState(r,1)})}const token=req.headers.authorization?.replace(/^Bearer /,'');const who=indexFor(r,token);if(req.method==='GET'&&!sub)return reply(res,200,publicState(r,who));if(req.method==='POST'&&sub==='actions'){const body=await readBody(req);if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==r.version)fail(409,'게임 상태가 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.');let result;const snapshot=structuredClone(r);try{result=apply(r,who,body.type,body);if(r.mode==='ai'){runAI(r);result=publicState(r,who)}}catch(e){rooms[code]=snapshot;save();throw e}return reply(res,200,result)}fail(405,'지원하지 않는 요청입니다.')}if(req.method==='GET')return serveStatic(res,url.pathname);fail(405,'지원하지 않는 요청입니다.')}catch(e){reply(res,e.status||500,{error:e.status?e.message:'서버 처리 오류',...(process.env.NODE_ENV==='test'?{details:e.message}:{})})}})}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=createApp(),port=Number(process.env.PORT)||3000;app.listen(port,'0.0.0.0',()=>console.log(`Combine of Cards: http://localhost:${port}`));
}

// Purely programmatic internal test seam. No HTTP route exposes these internals.
export const gameTestInternals={cards,catalog,createPlayer,instantiate,move,draw,runSummonEffects,runIntegrationOnEnter,processStartOfTurn,processEndOfTurn,attackAvailable,damageUnit,H,performExtraSummon,finishExtraSummon,queueAutomatedSpell,finishAutomatedSpell,attachOverlayMaterials,attachCard,detachCard,processSwordAttackPhase,beginSwordTurn,recordSwordKill,swordMultiplierCount:(room,id)=>swordMultiplierCount(room,id,{getZone:zoneOwner}),swordActualAttack:(room,id)=>swordActualAttack(room,id,{getZone:zoneOwner}),resolveQueuedDestroyHeals,chooseAIExtra,chooseAIFieldAbility,chooseAIGraveAbility,chooseAISpellCost,runAI,maxAttacks,actualAttack,treatedAttackForCondition,applyFieldAbility,apply,publicState};
