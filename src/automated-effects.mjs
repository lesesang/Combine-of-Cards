import {balanceValues as B} from './balance-values.mjs';
import {evolutionSpellIds} from './evolution.mjs';
import {isNonToonField} from './spell-choice-batch.mjs';
import {beginSummonBatch} from './effect-summon-batches.mjs';
import {beginWeaponSelection,damagePlayer} from './weapon-equipment.mjs';
// Audited, deterministic card-effect handlers. No free-form text execution.
// A handler must be backed by a particular v1.3 card wording.
const aliases={};
const register=(ids,handler)=>{for(const id of ids.split(' '))aliases[id]=handler;};
register('COC-09-005 COC-09-006',ctx=>beginWeaponSelection(ctx.r,ctx.who,ctx.c.id,ctx.H));
register('COC-20-010 COC-23-010 COC-24-007',ctx=>{beginSummonBatch(ctx.r,ctx.who,ctx.c.id,ctx.H);});
register('COC-08-009',ctx=>{
 for(const id of ctx.r.players[ctx.who].field.filter(Boolean))if(ctx.H.attribute(ctx.r,id)==='요괴')ctx.r.units[id].atk+=50;
});
function checkSpellPlayerTarget(ctx,player){
 if(player===ctx.who)return;
 const protectedUntil=ctx.r.players[player]?.spellProtectionUntilOpponentTurn||0;
 const currentTurn=ctx.r.players[ctx.who]?.turnsTaken||0;
 if(protectedUntil>0&&protectedUntil>=currentTurn)
  ctx.H.fail(409,'보호막 효과로 해당 플레이어를 주문의 대상으로 지정할 수 없습니다.');
}
const getTarget=(ctx,kind='enemy')=>{
 const {r,who,body,H}=ctx;
 const target=body.target;
 if(target?.type==='unit'&&typeof target.id==='string'){
  const z=H.zone(r,target.id);
  if(z&&['field','integration'].includes(z.zone)&&(kind==='any'||z.player===(kind==='own'?who:1-who)))return {id:target.id,player:z.player};
  H.fail(409,'선택할 수 없는 카드입니다.');
 }
 if(target?.type==='player'){if(![0,1].includes(target.player)||!(kind==='any'||target.player===(kind==='own'?who:1-who)))H.fail(409,'선택할 수 없는 플레이어입니다.');checkSpellPlayerTarget(ctx,target.player);return {player:target.player};}
 const enemy=1-who,p=r.players[kind==='own'?who:enemy];
 
 const candidate=p.field.find(Boolean);
 if(!candidate)checkSpellPlayerTarget(ctx,kind==='own'?who:enemy);
 return candidate?{id:candidate,player:kind==='own'?who:enemy}:{player:kind==='own'?who:enemy};
};
// Production engine uses destroyBatch; minimal test doubles can provide destroy alone.
const destroyTogether=(ctx,ids)=>{
 if(typeof ctx.H.destroyBatch==='function')return ctx.H.destroyBatch(ctx.r,ids);
 for(const id of [...new Set(ids)])ctx.H.destroy(ctx.r,id);
};
const hit=(ctx,target,amount)=>{if(!Number.isFinite(amount))throw Error('잘못된 피해 수치');amount=Math.max(0,Math.floor(amount));if(target.id)return ctx.H.hurt(ctx.r,target.id,amount);else{damagePlayer(ctx.r,target.player,amount);ctx.H.outcome(ctx.r)}};
const heal=(ctx,target,amount)=>{amount=Math.max(0,Math.floor(amount));if(target.id)ctx.H.healUnit(ctx.r,target.id,amount);else ctx.r.players[target.player].hp+=amount;};
const charge=(ctx,amount)=>{const p=ctx.r.players[ctx.who];if(p.hp<=amount)ctx.H.fail(409,'필요한 체력을 지불할 수 없습니다.');p.hp-=amount;};
const enemy=(ctx)=>getTarget(ctx,'enemy');
const own=(ctx)=>getTarget(ctx,'own');
function fieldHas(ctx,phrase){return ctx.r.players[ctx.who].field.some(id=>id&&ctx.H.name(ctx.r,id).includes(phrase));}
function requireField(ctx,phrase,anyController=false){const present=anyController?ctx.r.players.some(p=>p.field.some(id=>id&&ctx.H.name(ctx.r,id).includes(phrase))):fieldHas(ctx,phrase);if(!ctx.activationValidated&&!present)ctx.H.fail(409,`${phrase} 카드가 필드에 있어야 합니다.`)}
function addCurse(ctx,id){ctx.r.players[ctx.who].effects??=[];ctx.r.players[ctx.who].effects.push({type:'burn',id,amount:50,ownerTurn:true});}
// COC-21-002 is a spell granting an independent effect, NOT equipment.
// Target is selected at activation (never silently chosen by default).
export function validateLifeEatingSwordTarget(room, body, H, caster=null){
 const target=body?.target;
 if(target?.type==='unit' && typeof target.id==='string'){
  const z=H.zone(room,target.id);
  if(!z||z.zone!=='field'||!room.units[target.id]||room.units[target.id].hp===null)
   H.fail(409,'생명을 먹는 마검은 필드의 몬스터를 지정해야 합니다.');
  return {kind:'unit',id:target.id};
 }
 if(target?.type==='player' && (target.player===0||target.player===1)){
  if(!room.players[target.player]?.integration)
   H.fail(409,'생명을 먹는 마검은 일체화 플레이어에게만 부여할 수 있습니다.');
  if((caster===0||caster===1)&&caster!==target.player){
   const until=room.players[target.player].spellProtectionUntilOpponentTurn||0;
   if(until>0&&until>=(room.players[caster]?.turnsTaken||0))
    H.fail(409,'보호막 효과로 해당 플레이어를 주문의 대상으로 지정할 수 없습니다.');
  }
  return {kind:'player',player:target.player};
 }
 H.fail(409,'생명을 먹는 마검의 몬스터 또는 일체화 플레이어 대상을 선택해야 합니다.');
}
register('COC-21-002',ctx=>{
 const target=validateLifeEatingSwordTarget(ctx.r,ctx.body,ctx.H,ctx.who);
 ctx.r.effects??=[];
 ctx.r.effects.push({
  type:'lifeEatingSword',sourceCardId:ctx.c.id,
  caster:ctx.who,sourceSpellUnitId:ctx.body.unitId??null,
  target, appliedAtTurn:ctx.r.turnNumber
 });
});
// spell handlers: return { retain?: 'field', spent?: boolean }.
register('COC-03-007',ctx=>{const n=ctx.r.players[1-ctx.who].grave.length;hit(ctx,getTarget(ctx,'any'),Array.from({length:n},()=>ctx.rollValue(100)).reduce((a,b)=>a+b,0));});
register('COC-03-008',ctx=>{const n=ctx.r.players[ctx.who].grave.length;heal(ctx,getTarget(ctx,'any'),Array.from({length:n},()=>ctx.rollValue(100)).reduce((a,b)=>a+b,0));});
register('COC-05-002',ctx=>{if(!ctx.activationValidated)charge(ctx,100);if(!ctx.r.players[ctx.who].field.includes(null))ctx.H.fail(409,'몬스터 슬롯이 없습니다.');return {retain:'field',monsterized:true,hp:1,atk:0}});
register('COC-06-003',ctx=>{const n=Math.max(0,ctx.r.players[ctx.who].roundElementUses||0)+( ['금속','원소'].includes(ctx.c.attribute)?1:0);for(let i=0;i<n;i++){const choices=[...ctx.r.players.flatMap((p,j)=>[{player:j},...p.field.filter(Boolean).map(id=>({player:j,id}))])];hit(ctx,choices[ctx.H.randomInt(choices.length)],50)}});
register('COC-06-004',ctx=>{const targets=ctx.r.players.flatMap((p,i)=>p.field.filter(Boolean).map(id=>({id,player:i})));if(!targets.length)ctx.H.fail(409,'필드에 몬스터가 없습니다.');if((ctx.r.players[ctx.who].roundElementUses||0)+1>=3){const selected=ctx.body.targets;if(!Array.isArray(selected)||selected.length!==2||new Set(selected).size!==2)ctx.H.fail(409,'파괴할 몬스터 두 장을 각각 선택해야 합니다.');for(const id of selected){if(!targets.some(t=>t.id===id))ctx.H.fail(409,'선택한 몬스터가 필드에 없습니다.')}destroyTogether(ctx,selected)}else{const t=getTarget(ctx,'any');if(!t.id)ctx.H.fail(409,'몬스터 대상이 필요합니다.');hit(ctx,t,100)}});
register('COC-06-007',ctx=>{if(!ctx.activationValidated&&(ctx.r.players[ctx.who].roundPlays||0)<5)ctx.H.fail(409,'이번 턴 카드 사용이 5회 이상이어야 합니다.');hit(ctx,getTarget(ctx,'any'),300)});
register('COC-07-003',ctx=>{if(!ctx.activationValidated)ctx.H.draw(ctx.r,1-ctx.who);if(ctx.r.status!=='finished')ctx.H.mill(ctx.r,1-ctx.who,3)});
register('COC-07-010',ctx=>{if(!ctx.activationValidated)ctx.H.draw(ctx.r,1-ctx.who);if(ctx.r.status!=='finished')ctx.H.mill(ctx.r,1-ctx.who,ctx.r.players[1-ctx.who].lastRoundPlays||0)});
register('COC-08-005',ctx=>{const target=enemy(ctx);ctx.r.effects??=[];ctx.r.effects.push({type:'dot',target,damage:50,origin:ctx.who});});
register('COC-08-006',ctx=>{if(!ctx.activationValidated&&ctx.r.players[ctx.who].field.filter(id=>id&&ctx.H.attribute(ctx.r,id)==='요괴').length!==2)ctx.H.fail(409,'요괴 2장이 필요합니다.');const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'파괴할 몬스터가 없습니다.');ctx.H.destroy(ctx.r,t.id)});
register('COC-08-007',ctx=>{const n=ctx.r.players[ctx.who].field.filter(id=>id&&ctx.H.attribute(ctx.r,id)==='요괴').length;heal(ctx,{player:ctx.who},n*100)});
register('COC-10-009',ctx=>{ctx.r.effects??=[];ctx.r.effects.push({type:'firstDestroyHeal',player:ctx.who,turn:ctx.r.turnNumber});});
register('COC-13-007',ctx=>{const p=ctx.r.players[1-ctx.who],n=Math.floor(p.hp/10);p.hp-=n;ctx.r.players[ctx.who].hp+=n;ctx.H.outcome(ctx.r)});
register('COC-13-008',ctx=>{const op=ctx.r.players[1-ctx.who];if(!op.hand.length)return;const picked=(ctx.body.target?.id&&op.hand.includes(ctx.body.target.id))?ctx.body.target.id:null;if(!picked)ctx.H.fail(409,'상대 손패 중 버릴 카드를 직접 선택해 주세요.');ctx.H.move(ctx.r,picked,'grave',1-ctx.who)});
register('COC-14-003',ctx=>{if(!ctx.activationValidated&&!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');const t=getTarget(ctx,'any');if(!t.id)ctx.H.fail(409,'제거할 몬스터가 없습니다.');ctx.H.move(ctx.r,t.id,'banished',ctx.H.originalOwner(ctx.r,t.id));});
register('COC-14-006',ctx=>{if(!ctx.activationValidated&&!ctx.r.players[1-ctx.who].field.some(id=>id&&ctx.r.units[id].atk>=350))ctx.H.fail(409,'공격력 350 이상인 상대 몬스터가 필요합니다.');ctx.r.players[1-ctx.who].noAttackUntil=(ctx.r.players[1-ctx.who].turnsTaken||0)+1;});
register('COC-17-003',ctx=>{const p=ctx.r.players[ctx.who];p.hp+=150;for(const id of p.field.filter(Boolean))heal(ctx,{id},150)});
register('COC-17-005',ctx=>{if(!ctx.activationValidated&&!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');hit(ctx,enemy(ctx),ctx.rollValue(400))});
register('COC-17-006',ctx=>{if(!ctx.activationValidated&&!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');const n=ctx.rollValue(200);hit(ctx,{player:1-ctx.who},n);for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))hit(ctx,{id},n)});
register('COC-20-005',ctx=>{const n=ctx.rollValue(200);damagePlayer(ctx.r,0,n);damagePlayer(ctx.r,1,n);ctx.H.outcome(ctx.r)});
register('COC-21-005',ctx=>{const t=own(ctx);if(!t.id)ctx.H.fail(409,'자신의 몬스터를 선택하세요.');const hp=ctx.r.units[t.id].hp||0;ctx.H.destroy(ctx.r,t.id,{bypassEffectImmunity:true});ctx.r.players[ctx.who].hp+=hp});
register('COC-27-006',ctx=>{hit(ctx,getTarget(ctx,'any'),100)});
register('COC-30-001',ctx=>{destroyTogether(ctx,ctx.r.players[1-ctx.who].field.filter(id=>id&&ctx.r.units[id].atk<=100))});
register('COC-30-003',ctx=>{
 const target=enemy(ctx),revision=target.id?(ctx.r.units[target.id].fieldRevision||0):null;
 const rolls=Array.from({length:3},()=>ctx.rollValue(50));
 for(const amount of rolls){
  if(ctx.r.status==='finished')break;
  if(target.id){const z=ctx.H.zone(ctx.r,target.id);if(z?.zone!=='field'||z.player!==target.player||(ctx.r.units[target.id]?.fieldRevision||0)!==revision)break;}
  hit(ctx,target,amount);
 }
});
register('COC-30-006',ctx=>{const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'대상 몬스터가 없습니다.');ctx.r.units[t.id].diceMax=10});
register('COC-30-007',ctx=>{ctx.r.players[ctx.who].hp+=B.forestHeal});
// COC-30-011: prior-two-turn natural spell history is not yet implemented; do not misrepresent as automated.

register('COC-32-005',ctx=>{requireField(ctx,'플레임',true);hit(ctx,{player:1-ctx.who},ctx.rollValue(200))});
register('COC-32-006',ctx=>{requireField(ctx,'워터',true);heal(ctx,{player:ctx.who},100)});
register('COC-32-008',ctx=>{requireField(ctx,'랜드',true);destroyTogether(ctx,ctx.r.players[1-ctx.who].field.filter(Boolean))});
// More precisely scoped automatic spells with explicit prerequisites.
register('COC-06-002',ctx=>{const count=ctx.r.players[ctx.who].roundElementUses||0;const atk=count*50,hp=50+count*50;ctx.H.summonToken(ctx.r,ctx.who,'인조 생물',atk,hp)});
register('COC-07-004',ctx=>{if(!ctx.activationValidated)ctx.H.draw(ctx.r,1-ctx.who);return {deckSearch:true};});
register('COC-07-011',ctx=>{ctx.H.draw(ctx.r,1-ctx.who);if(ctx.r.status==='finished')return;ctx.H.mill(ctx.r,1-ctx.who,3);if(ctx.r.status==='finished')return;ctx.r.players[ctx.who].hp+=B.selfDevourHeal;const id=ctx.r.players[ctx.who].integration;if(id){ctx.r.units[id].atk+=B.selfDevourAttack;const token=ctx.r.units[id].selfDevourBuffToken||`${id}:${ctx.r.selfDevourSequence=(ctx.r.selfDevourSequence||0)+1}`;ctx.r.units[id].selfDevourBuffToken=token;const prior=ctx.r.effects.find(e=>e.type==='selfDevourBuff'&&e.token===token);if(prior)prior.amount+=B.selfDevourAttack;else ctx.r.effects.push({type:'selfDevourBuff',unitId:id,player:ctx.who,turn:ctx.r.turnNumber,token,amount:B.selfDevourAttack})}});
register('COC-14-002',ctx=>{if(!ctx.activationValidated)ctx.H.mill(ctx.r,ctx.who,1);for(let i=0;i<2;i++)ctx.H.summonToken(ctx.r,ctx.who,'스톰 토큰',0,50)});
register('COC-14-009',ctx=>{if(ctx.body.option===2){ctx.H.summonToken(ctx.r,ctx.who,'스톰 토큰',0,50)}else{hit(ctx,{player:1-ctx.who},50);for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))hit(ctx,{id},50)}});
register('COC-17-004',ctx=>{for(let i=0;i<3;i++)if(!ctx.H.summonToken(ctx.r,ctx.who,'미라 병사',B.mummyAttack,B.mummyHp))break});
register('COC-19-004',()=>({deckSearch:true}));
register('COC-19-005',ctx=>{const t=getTarget(ctx,'any');if(!t.id)ctx.H.fail(409,'필드의 몬스터가 필요합니다.');ctx.r.units[t.id].frozen=true;ctx.r.units[t.id].battleInvulnerable=true;ctx.r.units[t.id].damageInvulnerable=true;});
register('COC-20-003',ctx=>{if(!ctx.activationValidated&&ctx.r.players[ctx.who].hp>600)ctx.H.fail(409,'체력 600 이하일 때만 사용 가능합니다.');return {deckSearch:true};});
register('COC-23-009',ctx=>{if(!ctx.activationValidated&&!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');const t=getTarget(ctx,ctx.body.option===1?'enemy':'any');if(ctx.body.option===1){if(!t.id)ctx.H.fail(409,'파괴할 몬스터가 없습니다.');ctx.H.destroy(ctx.r,t.id)}else hit(ctx,t,200)});
register('COC-24-006',ctx=>{const id=ctx.r.players[ctx.who].integration;if(!id)ctx.H.fail(409,'일체화가 필요합니다.');for(const target of [...ctx.r.players[ctx.who].field].filter(Boolean))ctx.H.destroy(ctx.r,target);ctx.r.units[id].atk+=60});
register('COC-24-008 COC-26-008',ctx=>{if(!ctx.activationValidated&&ctx.r.players[ctx.who].field.filter(id=>id&&ctx.H.name(ctx.r,id).includes('매치')).length>1)ctx.H.fail(409,'필드의 매치는 최대 1장이어야 합니다.');return {deckSearch:true};});
register('COC-31-005',ctx=>{ctx.H.draw(ctx.r,ctx.who);if(ctx.H.roll(2)===1){const p=ctx.r.players[1-ctx.who];if(p.hand.length)ctx.H.move(ctx.r,p.hand[ctx.H.randomInt(p.hand.length)],'grave',1-ctx.who)}});
register('COC-31-007',ctx=>{if(!ctx.activationValidated)charge(ctx,B.flashHpCost);const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'탈취할 몬스터가 없습니다.');ctx.H.capture(ctx.r,ctx.who,t.id)});
register('COC-31-009',ctx=>{
 // The chosen discard was validated and paid by activation-rules before
 // opening the response window. Resolution must never charge it again.
 for(const id of ctx.r.players[1-ctx.who].field.filter(Boolean))
  ctx.r.units[id].effectsNegated=true;
});
register('COC-32-007',ctx=>{requireField(ctx,'윈드',true);ctx.r.players[1-ctx.who].spellForbiddenUntil=(ctx.r.players[1-ctx.who].turnsTaken||0)+1});
register('COC-30-005',ctx=>{
 const p=ctx.r.players[ctx.who],turn=(p.turnsTaken||0)+1;
 p.spellDiceBonus=(p.spellDiceBonus||0)+50;
 p.bonusDrawsByOwnTurn??={};p.bonusDrawsByOwnTurn[turn]=(p.bonusDrawsByOwnTurn[turn]||0)+1;
});
// Mixed heads/tails resolve together; each of five coin flips contributes to exactly one count.
register('COC-31-010',ctx=>{const p=ctx.r.players[ctx.who];if(!ctx.activationValidated&&(!p.integration||ctx.r.units[p.integration]?.cardId!=='COC-31-004'))ctx.H.fail(409,'최광의 대마법사 슈와 일체화해야 합니다.');let heads=0,tails=0;for(let i=0;i<5;i++){if(ctx.H.roll(2)===1)heads++;else tails++;}for(const id of p.field.filter(Boolean))ctx.r.units[id].atk+=heads*B.royalAttackPerHead;for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))if(tails>0)ctx.H.hurt(ctx.r,id,tails*B.royalDamagePerTail)});
// G-deck integration attack becomes a two-sided effect, then its present attack becomes zero.
register('COC-01-008',ctx=>{const id=ctx.r.players[ctx.who].integration;if(!id)ctx.H.fail(409,'일체화 중이어야 합니다.');const n=Math.max(0,ctx.r.units[id].atk);const t=enemy(ctx);damagePlayer(ctx.r,ctx.who,n);if(t.id)ctx.H.hurt(ctx.r,t.id,n);else damagePlayer(ctx.r,t.player,n);ctx.r.units[id].atk=0;ctx.H.outcome(ctx.r)});
// Evolution resolves through a declared physical source snapshot in the server.
for(const id of evolutionSpellIds)register(id,()=>({evolution:true}));
// Curse deck: source monster is sacrificed by the audited activation preflight.
register('COC-21-004',ctx=>{
 const id=ctx.body.target?.id,z=id&&ctx.H.zone(ctx.r,id);
 if(!z||z.player===ctx.who||z.zone!=='field')ctx.H.fail(409,'상대 필드의 파괴 대상 몬스터를 지정해야 합니다.');
 ctx.H.destroy(ctx.r,id,{bypassEffectImmunity:true});
});

// Additional v1.3-verified spell effects. Complex secondary/triggered clauses
// are still tracked as partial automation, not complete card certification.
function selectedFieldUnit(ctx,{enemyOnly=false}={}){
 const id=ctx.body.target?.type==='unit'?ctx.body.target.id:null;
 const z=id&&ctx.H.zone(ctx.r,id);
 if(!z||z.zone!=='field'||(enemyOnly&&z.player!==1-ctx.who))
  ctx.H.fail(409,'유효한 필드 몬스터를 효과 대상으로 선택해야 합니다.');
 return {id,controller:z.player,unit:ctx.r.units[id]};
}
// G tool: normal spell effect. Its monsterized/equipment clauses remain unsupported.
register('COC-01-004',ctx=>{
 const {id}=selectedFieldUnit(ctx);
 ctx.H.hurt(ctx.r,id,100);
});
// Deck return plus one draw for the physical card's original owner.
register('COC-01-005',ctx=>{
 const {id}=selectedFieldUnit(ctx);
 const owner=ctx.H.originalOwner(ctx.r,id);
 ctx.H.move(ctx.r,id,'deck',owner);
 ctx.H.draw(ctx.r,owner);
});
// One 1d150 roll is shared by the two selected non-Cartoon monsters.
register('COC-05-006',ctx=>{
 const ids=ctx.body.targets;
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2)
  ctx.H.fail(409,'카툰이 아닌 필드 몬스터 두 장을 선택해야 합니다.');
 for(const id of ids){
  if(!ctx.activationValidated&&!isNonToonField(ctx.r,id,ctx.H))
   ctx.H.fail(409,'카툰 몬스터 또는 필드에 없는 카드는 대상으로 지정할 수 없습니다.');
 }
 const rolled=ctx.rollValue(150);
 for(const id of ids)if(isNonToonField(ctx.r,id,ctx.H))ctx.H.hurt(ctx.r,id,rolled);
});
register('COC-05-007',ctx=>{
 requireField(ctx,'카툰 랜드');
 const {id}=selectedFieldUnit(ctx,{enemyOnly:true});
 if(!ctx.r.players[ctx.who].field.includes(null))
  ctx.H.fail(409,'카드를 가져올 빈 필드 칸이 없습니다.');
 ctx.H.capture(ctx.r,ctx.who,id);
 ctx.r.units[id].treatedAsToon=true;
});
register('COC-31-006',ctx=>{
 const {id,unit}=selectedFieldUnit(ctx);
 if(/마술사|마법사/.test(ctx.H.attribute(ctx.r,id)))
  ctx.H.fail(409,'마술사·마법사 속성은 대상으로 지정할 수 없습니다.');
 let heads=0;for(let i=0;i<3;i++)if(ctx.H.roll(2)===1)heads++;
 const previous=unit.atk;
 unit.atk=Math.max(0,Math.floor(previous-heads*50));
 if(previous>0&&unit.atk===0)ctx.H.destroy(ctx.r,id);
});
register('COC-31-008',ctx=>{
 if(ctx.H.roll(2)!==1)return;
 const targets=ctx.r.players.flatMap(p=>p.field.filter(Boolean));
 destroyTogether(ctx,targets);
});
// Returns to hand only when *this damage* kills the targeted enemy monster.
register('COC-30-004',ctx=>{
 const t=enemy(ctx);
 const destroyed=hit(ctx,t,ctx.rollValue(200));
 if(t.id&&destroyed)return {retain:'hand'};
});


// Persistent destruction ledger allows effects to refer to a *previous own turn*.
register('COC-30-002',ctx=>{
 const previousOwnTurn=ctx.r.turnNumber-2;
 const count=(ctx.r.destructionHistory||[]).filter(e=>
  e.turnNumber===previousOwnTurn&&e.activePlayer===ctx.who&&e.controller===1-ctx.who
 ).length;
 hit(ctx,enemy(ctx),count*100);
});
// The granted combat trigger belongs to the specified Superior Fighter, not this spell.
register('COC-27-010',ctx=>{
 const t=ctx.body.target,id=t?.type==='unit'?t.id:null,z=id&&ctx.H.zone(ctx.r,id);
 if(!z||z.zone!=='field'||z.player!==ctx.who||
    !ctx.H.name(ctx.r,id).includes('슈페리얼 파이터'))
  ctx.H.fail(409,'자신 필드의 슈페리얼 파이터 몬스터를 선택해야 합니다.');
 ctx.r.units[id].superiorClaw=true;
 if(!ctx.activationValidated)ctx.r.players[ctx.who].hp-=200;
 ctx.H.outcome(ctx.r);
});


register('COC-01-009',ctx=>{
 if(!ctx.activationValidated&&!ctx.r.players[ctx.who].integration)
  ctx.H.fail(409,'일체화 중일 때만 사용할 수 있습니다.');
 const other=ctx.r.players[1-ctx.who];
 const nextOppTurn=(other.turnsTaken||0)+1;
 other.noDirectAttackUntil=Math.max(other.noDirectAttackUntil||0,nextOppTurn);
 const self=ctx.r.players[ctx.who];
 self.spellProtectionUntilOpponentTurn=Math.max(self.spellProtectionUntilOpponentTurn||0,nextOppTurn);
});


// Burningdemons Armor: direct destruction immunity lasts until leaving the field.
// Damage causing 0 HP remains a state-based destruction, not direct effect destruction.
register('COC-20-011',ctx=>{
 const id=ctx.body.target?.type==='unit'?ctx.body.target.id:null;
 const z=id&&ctx.H.zone(ctx.r,id);
 const name=id&&ctx.H.name(ctx.r,id)||'';
 if(!z||z.zone!=='field'||!/버닝\s*데몬즈/.test(name))
  ctx.H.fail(409,'필드의 버닝데몬즈 몬스터를 지정해야 합니다.');
 ctx.r.units[id].effectDestructionImmune=true;
});


// Burning Soul: one declared Burningdemons monster gains the exact self-damage roll.
register('COC-20-004',ctx=>{
 const id=ctx.body.target?.type==='unit'?ctx.body.target.id:null;
 const z=id&&ctx.H.zone(ctx.r,id);
 const name=id&&ctx.H.name(ctx.r,id)||'';
 if(!z||z.zone!=='field'||z.player!==ctx.who||!/버닝\s*데몬즈?/.test(name))
  ctx.H.fail(409,'자신 필드의 버닝데몬즈 몬스터를 1장 선택해야 합니다.');
 const bonus=ctx.H.roll(5)*100;
 ctx.r.players[ctx.who].hp-=bonus;
 ctx.r.units[id].atk+=bonus;
 ctx.H.outcome(ctx.r);
});
// Two previous own turns must each contain at least one Nature-attribute spell.
// Current activation never counts toward that prerequisite.
register('COC-30-011',ctx=>{
 const p=ctx.r.players[ctx.who];
 const used=new Set(p.natureSpellTurns||[]);
 if(!ctx.activationValidated&&(!used.has(ctx.r.turnNumber-2)||!used.has(ctx.r.turnNumber-4)))
  ctx.H.fail(409,'지난 자신의 두 턴 모두 자연 속성 주문을 사용했어야 합니다.');
 const selected=ctx.body.target;
 if(selected?.type!=='player'||selected.player!==1-ctx.who)
  ctx.H.fail(409,'상대 플레이어 본체를 대상으로 선택해야 합니다.');
 hit(ctx,enemy(ctx),200);
});

// Dragon Lair: current allied dragons only. Dragon King's multiplier is applied
// here to this explicit stat increase; other Dragon King clauses remain partial.
register('COC-11-011',ctx=>{
 const p=ctx.r.players[ctx.who],king=p.integration&&ctx.r.units[p.integration];
 const scale=king?.cardId==='COC-11-003'&&!king.effectsNegated?1.5:1;
 for(const id of p.field.filter(Boolean)){
  if(!/용|드래곤/.test(ctx.H.attribute(ctx.r,id)))continue;
  const u=ctx.r.units[id];u.atk+=Math.floor(B.dragonLairAttack*scale);u.hp+=Math.floor(B.dragonLairHp*scale);
 }
});

export function hasAutoSpell(cardId){return Object.hasOwn(aliases,cardId)}
export const spellHandlerIds=Object.keys(aliases);
export function castAutomatedSpell(r,who,c,body,H,{activationValidated=false,baseDiceMax=null}={}){
 const f=aliases[c.id];if(!f)return {supported:false};
 // A player applying a spell is its action source. In particular, an
 // independently enchanted integrated player can earn the next-turn sword
 // double by destroying an opposing monster with an effect. Do not attribute
 // a physical unit's kill to unrelated equipped/enhanced monsters.
 const attributedH={...H};
 // Preserve optional helper detection: unit-test/third-party handlers may
 // only implement destroy, without a batch variant.
 if(typeof H.hurt==='function')
  attributedH.hurt=(room,id,n,meta={})=>H.hurt(room,id,n,{...meta,sourcePlayer:who});
 if(typeof H.destroy==='function')
  attributedH.destroy=(room,id,meta={})=>H.destroy(room,id,{...meta,sourcePlayer:who});
 if(typeof H.destroyBatch==='function')
  attributedH.destroyBatch=(room,ids,meta={})=>H.destroyBatch(room,ids,{...meta,sourcePlayer:who});
 const rollValue=(maximum,min=1)=>H.roll(Math.max(1,(baseDiceMax??maximum)+(r.players[who].spellDiceBonus||0)),min);
 const ctx={r,who,c,body,H:attributedH,activationValidated,rollValue};
 const result=f(ctx)||{};
 return {supported:true,...result};
}
