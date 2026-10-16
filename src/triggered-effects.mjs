import {gainUnitStats} from './stat-gains.mjs';
import {linkStraw,applySharedUnitEffect,destroySharedUnits,hurtSharedUnits,moveSharedUnits,captureSharedUnits} from './shared-unit-effects.mjs';
import {actionLocked,applySuccubus,lureTarget,consumeLure} from './demon-effects.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {beginAutomaticTriggerOrder} from './effect-runtime.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';
import {SUMMON_TRIGGER_RULES,resolveSummonTrigger,settleSummonTrigger} from './summon-trigger-effects.mjs';
import {beginDeckSearch,eligibleSearchIds} from './deck-search.mjs';
import {WEAPON_MONSTERS,equipWeapon} from './weapon-equipment.mjs';
import {queueDeathRevival} from './death-revival.mjs';

// Draft automation: the user requested implementation batches before testing.
// Automatic monster/integration triggers, not selectable MAIN abilities.
export const TRIGGER_RULES=Object.freeze({
 'COC-21-008':{effectNumber:1,event:'summoned',target:'straw-link'},
 'COC-21-011':{effectNumber:1,event:'summoned',target:'succubus-enemy'},
 'COC-01-005':{effectNumber:2,event:'integration-attacks-monster'},
 'COC-07-001':{effectNumber:1,event:'enemy-turn-start',sourceZone:'integration'},
 'COC-11-001':{effectNumber:1,event:'own-turn-start',sourceZone:'deck',sourceType:'integration'},
 'COC-11-003':{effectNumber:1,event:'own-attack-start',sourceZone:'integration'},
 'COC-11-006':{effectNumber:1,event:'own-attack-start'},
 'COC-19-003':{effectNumber:1,event:'own-turn-start'},
 'COC-09-001':{effectNumber:1,event:'own-monster-destroyed',sourceZone:'integration',repeatPerEvent:true},
 'COC-10-011':{effectNumber:1,event:'destroyed',repeatPerEvent:true},
 ...Object.fromEntries(Object.entries(SUMMON_TRIGGER_RULES).map(([id,rule])=>[id,{effectNumber:1,event:'summoned',...rule}])),
 'COC-06-001':{effectNumber:1,event:'own-turn-start',sourceZone:'integration'},
 'COC-03-001':{effectNumber:1,event:'grave-effect-activation',sourceZone:'integration',repeatPerEvent:true},
 'COC-03-004':{effectNumber:1,event:'grave-effect-activation',sourceZone:'integration',repeatPerEvent:true,target:'optional-destroy-board'},
 'COC-08-001':{effectNumber:1,event:'summoned',target:'return-field'},
 'COC-08-008':{effectNumber:1,event:'summoned',target:'capture-enemy'},
 'COC-23-005':{effectNumber:1,event:'summoned',target:'banish-enemy'},
 'COC-23-008':{effectNumber:1,event:'summoned'},
 'COC-24-004':{effectNumber:1,event:'summoned',target:'banish-enemy'},
 'COC-26-005':{effectNumber:1,event:'summoned'},
 'COC-26-004':{effectNumber:1,event:'destroyed'},
 'COC-32-001':{effectNumber:2,event:'battle-completed'},
 'COC-32-002':{effectNumber:2,event:'attack-target'},
 'COC-32-004':{effectNumber:2,event:'second-turn-start'},
 'COC-32-011':{effectNumber:2,event:'enemy-monster-destroyed'},
 'COC-32-015':{effectNumber:1,event:'attack-declared'}
});
function trigger(r,who,id,extra={}){
 const u=r.units[id],sourceZone=TRIGGER_RULES[u.cardId].sourceZone||'field';
 return {key:`trigger-${r.turnNumber}-${id}`,effectId:'monster-trigger-resolution',owner:who,sourceId:id,sourceZone,priority:0,
  title:`${u.cardId} · 효과 ${TRIGGER_RULES[u.cardId].effectNumber}`,
  payload:{cardId:u.cardId,sourceRevision:(sourceZone==='integration'?u.integrationRevision:sourceZone==='field'?u.fieldRevision:u.zoneRevision)||0,...extra}};
}
export function recordSummonTrigger(r,who,id,H){
 const u=r.units[id],rule=u&&TRIGGER_RULES[u.cardId];
 if(!['summoned','integration-enter'].includes(rule?.event))return false;
 if(u.cardId==='COC-10-007'&&u.twinsOffspring)return true;
 if(u.cardId==='COC-10-003'&&r.players[who].hp<=500)return true;
 if(!u.effectsNegated&&!effectUsedThisTurn(r,who,id,rule.effectNumber)){
  const pending=r.deferredMonsterTriggers??=[];
  if(!pending.some(e=>e.sourceId===id&&e.payload.eventTurn===r.turnNumber))pending.push(trigger(r,who,id,{eventTurn:r.turnNumber}));
 }else settleSummonTrigger(r,trigger(r,who,id),H);
 return true;
}
// Called by an actual effect declaration/committed grave choice, never by the
// generic move helper. Reload, manual movement and discarding are not triggers.
export function recordGraveEffectActivation(r,{eventKey,cardId},H){
 if(r.status!=='active')return;
 r.graveEffectSequence=(r.graveEffectSequence||0)+1;
 const key=eventKey||`grave-event-${r.graveEffectSequence}`;
 r.graveEffectSeen??=[];if(r.graveEffectSeen.includes(key))return;
 r.graveEffectSeen.push(key);if(r.graveEffectSeen.length>256)r.graveEffectSeen.shift();
 for(const [who,p] of r.players.entries()){
  const id=p.integration,u=id&&r.units[id];
  if(!u||u.effectsNegated||!['COC-03-001','COC-03-004'].includes(u.cardId))continue;
  const effect=trigger(r,who,id,{eventTurn:r.turnNumber,graveEvent:key,activatedCardId:cardId||null});
  effect.key=`grave-${r.graveEffectSequence}-${id}`;
  (r.deferredMonsterTriggers??=[]).push(effect);
 }
}
const RESPONSE_FRAME_KEYS=['pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers'];
const responseChoices=r=>['pendingTriggerOrder','pendingTriggerTargetChoice','pendingInfinityChoice','pendingDeckSearch','pendingElementalChoice','pendingRecruitChoice'].some(key=>r[key]);
export function suspendResponseForGraveTriggers(r,H){
 if(r.status!=='active'||responseChoices(r))return;
 const root=r.pendingAbility||r.pendingSpell||r.pendingExtraSummon;
 if(!root||root.stage==='cost-triggers')return;
 const effects=(r.deferredMonsterTriggers||[]).filter(e=>e.payload.graveEvent&&e.payload.eventTurn===r.turnNumber);
 if(!effects.length)return;
 r.suspendedResponses??=[];
 if(r.suspendedResponses.length>=32)throw new Error('nested response safety budget reached');
 const frame={effectStack:r.effectStack||[]};
 for(const key of RESPONSE_FRAME_KEYS){frame[key]=r[key]||null;r[key]=null;}
 r.effectStack=[];r.suspendedResponses.push(frame);
 r.deferredMonsterTriggers=r.deferredMonsterTriggers.filter(e=>!effects.includes(e));
 queueMonsterTriggers(r,effects,H);
}
export function resumeSuspendedResponse(r){
 if(r.status!=='active'){r.suspendedResponses=[];return;}
 if(!r.suspendedResponses?.length||RESPONSE_FRAME_KEYS.some(key=>r[key])||responseChoices(r)||r.effectStack?.length||r.deferredMonsterTriggers?.length)return;
 const frame=r.suspendedResponses.pop();
 for(const key of RESPONSE_FRAME_KEYS)r[key]=frame[key];
 r.effectStack=frame.effectStack;
}
export function recordDestroyedTrigger(r,id,{sourceId,sourcePlayer},H){
 const u=r.units[id],z=H.zone(r,id);
 if(u?.cardId==='COC-10-011'&&z?.zone==='field'&&!u.effectsNegated&&!u.revivedOnce){
  u.revivedOnce=true;
  const effect=trigger(r,z.player,id,{eventTurn:r.turnNumber,graveRevision:(u.zoneRevision||0)+1});
  effect.exception='destroy-trigger';effect.key=`revive-${id}-${u.zoneRevision||0}`;
  (r.deferredMonsterTriggers??=[]).push(effect);
 }
 if(u&&z?.zone==='field'&&!u.created&&WEAPON_MONSTERS.includes(u.cardId)&&u.owner===z.player&&r.players[z.player].usedCardsGame?.[id]){
  const hostId=r.players[z.player].integration,host=hostId&&r.units[hostId];
  if(host?.cardId==='COC-09-001'&&!host.effectsNegated){
   const effect=trigger(r,z.player,hostId,{eventTurn:r.turnNumber,victimId:id,victimRevision:(u.zoneRevision||0)+1,
    victimAttack:swordActualAttack(r,id,{getZone:(room,uid)=>H.zone(room,uid)})});
   effect.key=`smith-${id}-${u.zoneRevision||0}`;
   if(!(r.deferredMonsterTriggers||[]).some(e=>e.key===effect.key))(r.deferredMonsterTriggers??=[]).push(effect);
  }
 }
 if(u?.cardId!=='COC-26-004'||u.effectsNegated||z?.zone!=='field'||effectUsedThisTurn(r,z.player,id,1))return;
 const killer=sourceId&&r.units[sourceId],kz=killer&&H.zone(r,sourceId);
 let target;
 if(kz?.zone==='field'&&Number.isFinite(killer.hp))target={id:sourceId,controller:kz.player,revision:killer.fieldRevision||0};
 else if(kz?.zone==='integration')target={player:kz.player};
 else if(sourcePlayer===0||sourcePlayer===1)target={player:sourcePlayer};
 if(!target||(r.deferredMonsterTriggers||[]).some(e=>e.sourceId===id&&e.payload.eventTurn===r.turnNumber))return;
 const effect=trigger(r,z.player,id,{eventTurn:r.turnNumber,target,amount:swordActualAttack(r,id,{getZone:(room,uid)=>H.zone(room,uid)})});
 effect.exception='destroy-trigger';
 (r.deferredMonsterTriggers??=[]).push(effect);
}
function baseTriggerTargetChoices(r,p,H){
 const kind=TRIGGER_RULES[p.cardId]?.target;
 if(kind==='straw-link')return r.players.flatMap(pp=>pp.field.filter(id=>id&&id!==p.sourceId));
 if(kind==='optional-destroy-board')return r.players.flatMap(pp=>[...pp.field,pp.integration].filter(Boolean));
 if(kind==='capture-enemy'&&!r.players[p.who].field.includes(null))return [];
 if(kind==='destroy-lower-printed'){
  const attack=swordActualAttack(r,p.sourceId,{getZone:(room,id)=>H.zone(room,id)});
  return r.players.flatMap(pp=>pp.field.filter(Boolean)).filter(id=>{
   const printed=H.cards.get(r.units[id].cardId)||r.units[id].tokenCard;
   return printed&&Number.isFinite(Number(printed.atk))&&Math.max(0,Number(printed.atk))<attack;
  });
 }
 return r.players.flatMap((pp,who)=>kind==='return-field'||who!==p.who?pp.field.filter(Boolean):[]);
}
function triggerTargetChoices(r,p,H){
 const choices=baseTriggerTargetChoices(r,p,H);
 return p.lureTargetId&&choices.includes(p.lureTargetId)?[p.lureTargetId]:choices;
}
export function triggerTargetView(r,viewer,H){
 const p=r.pendingTriggerTargetChoice;if(!p)return null;
 return {who:p.who,kind:TRIGGER_RULES[p.cardId]?.target,name:H.cards.get(p.cardId)?.name,optional:TRIGGER_RULES[p.cardId]?.target==='optional-destroy-board',...(viewer===p.who?{choices:triggerTargetChoices(r,p,H).map(id=>({id,controller:H.zone(r,id)?.player,card:H.cards.get(r.units[id].cardId)||r.units[id].tokenCard}))}:{})};
}
export function chooseTriggerTarget(r,who,id,H){
 const p=r.pendingTriggerTargetChoice;
 if(r.status!=='active'||!p||p.who!==who)H.fail(409,'유발 효과의 대상 선택권자가 아닙니다.');
 if(id===null&&TRIGGER_RULES[p.cardId]?.target==='optional-destroy-board'){r.pendingTriggerTargetChoice=null;H.log(r,'effect','스트로베리아: 선택 파괴를 사용하지 않음');return;}
 const choices=triggerTargetChoices(r,p,H);
 if(!choices.length){r.pendingTriggerTargetChoice=null;return;}
 if(!choices.includes(id))H.fail(409,'현재 선택 가능한 필드 카드를 지정하세요.');
 const u=r.units[p.sourceId],z=H.zone(r,p.sourceId);
 r.pendingTriggerTargetChoice=null;
 const sourceZone=TRIGGER_RULES[p.cardId].sourceZone||'field';
 if(!u||u.cardId!==p.cardId||u.effectsNegated||z?.zone!==sourceZone||z.player!==who||((sourceZone==='integration'?u.integrationRevision:sourceZone==='field'?u.fieldRevision:u.zoneRevision)||0)!==p.sourceRevision){H.log(r,'effect','유발 효과의 소스 상태 변경으로 불발');return;}
 const kind=TRIGGER_RULES[p.cardId].target;
 if(kind==='straw-link'){linkStraw(r,p.sourceId,id,H);return;}
 if(kind==='succubus-enemy'){applySuccubus(r,who,p.sourceId,id,H);return;}
 if(kind==='optional-destroy-board'){destroySharedUnits(r,[id],H,{sourceId:p.sourceId});H.outcome(r);return;}
 if(kind==='destroy-lower-printed'){destroySharedUnits(r,[id],H,{sourceId:p.sourceId});H.outcome(r);return;}
 if(kind==='coin-weaken-enemy'){
  // Choose before rolling; neither client nor AI may see the outcome first.
  const faces=Array.from({length:3},()=>H.roll(2));
  H.log(r,'dice',`카스테: 코인 ${faces.join(', ')}`);
  if(faces.filter(x=>x===1).length===2)applySharedUnitEffect(r,[id],H,(uid,u)=>{u.atk=Math.max(0,u.atk-100);if(u.atk===0)H.destroy(r,uid,{sourceId:p.sourceId});});
  H.outcome(r);return;
 }
 if(kind==='capture-enemy')captureSharedUnits(r,[id],who,H);
 else moveSharedUnits(r,[id],kind==='return-field'?'hand':'banished',H,{sourceId:p.sourceId});
 H.log(r,'effect',`${H.cards.get(p.cardId).name}: 선택한 몬스터 ${kind==='return-field'?'패 복귀':kind==='capture-enemy'?'조종권 획득':'제외'}`);
}
function deferAttackBonus(r,id,H,extra){
 const u=r.units[id],z=H.zone(r,id);
 if(r.status!=='active'||!u||u.effectsNegated||z?.zone!=='field'||z.player!==r.turn||effectUsedThisTurn(r,z.player,id,2))return;
 const pending=r.deferredMonsterTriggers??=[];
 // Batch destruction is one opportunity, not one bonus for every victim.
 // Reserve by physical UID/effect/turn, independently of elemental effect 1.
 if(pending.some(e=>e.sourceId===id&&e.payload.eventTurn===r.turnNumber))return;
 pending.push(trigger(r,z.player,id,{eventTurn:r.turnNumber,...extra}));
}
export function recordElementalBattle(r,sourceId,{sourceAttack,targetAttack},H){
 if(r.units[sourceId]?.cardId==='COC-32-001'&&sourceAttack>targetAttack)
  deferAttackBonus(r,sourceId,H,{event:'battle-completed',sourceAttack,targetAttack});
}
export function recordMonsterDestruction(r,{sourceId,victimId,victimController,victimType,cause},H){
 const z=sourceId&&H.zone(r,sourceId);
 if(r.units[sourceId]?.cardId!=='COC-32-011'||cause==='cost'||sourceId===victimId||z?.player===victimController||!victimType?.includes('몬스터'))return;
 deferAttackBonus(r,sourceId,H,{event:'enemy-monster-destroyed',victimId});
}
export function drainDeferredMonsterTriggers(r,H){
 if(r.status!=='active'){r.deferredMonsterTriggers=[];return;}
 // Destruction can occur within a spell, paid cost, summon, or heal group.
 // Collect there, declare only after that complete chain and its choices.
 if(r.pendingMonsterTriggers||r.pendingAbility||r.pendingSpell||r.pendingExtraSummon||r.pendingTriggerOrder||r.pendingTriggerTargetChoice||r.pendingInfinityChoice||r.pendingElementalChoice||r.pendingRecruitChoice||r.pendingDeckSearch||r.effectStack?.length)return;
 const effects=(r.deferredMonsterTriggers||[]).filter(e=>r.units[e.sourceId]?.cardId===e.payload.cardId&&e.payload.eventTurn===r.turnNumber&&(TRIGGER_RULES[e.payload.cardId].repeatPerEvent||!effectUsedThisTurn(r,e.owner,e.sourceId,TRIGGER_RULES[e.payload.cardId].effectNumber)));
 r.deferredMonsterTriggers=[];
 if(effects.length)queueMonsterTriggers(r,effects,H);
}
export function attackDeclarationTriggers(r,attackerId,target,H,{retarget=false}={}){
 const source=r.units[attackerId],who=r.turn,group=[];
 if(!source)return group;
 if(!retarget&&r.players[who].integration===attackerId&&target.type==='unit')for(const id of r.players[who].field.filter(Boolean)){
  const tool=r.units[id];if(tool.cardId==='COC-01-005'&&tool.gToolBody&&!tool.effectsNegated&&!effectUsedThisTurn(r,who,id,2))group.push(trigger(r,who,id,{targetId:target.id,targetRevision:r.units[target.id].fieldRevision||0,targetController:1-who}));
 }
 if(!retarget&&source.cardId==='COC-32-015'&&!source.effectsNegated&&!effectUsedThisTurn(r,who,attackerId,1))group.push(trigger(r,who,attackerId));
 const defender=target.type==='unit'&&r.units[target.id];
 if(defender?.cardId==='COC-32-002'&&!defender.effectsNegated&&((H.type(r,attackerId)||source.tokenCard?.type||'').includes('몬스터')||Number.isFinite(source.hp))&&!effectUsedThisTurn(r,1-who,target.id,2)){
  group.push(trigger(r,1-who,target.id,{attackerId,attackerController:who,attackerRevision:source.fieldRevision||0}));
 }
 return group;
}
export function landTurnTriggers(r,who){
 const group=[];
 for(const id of r.players[who].field.filter(Boolean)){
  const u=r.units[id],stay=u.dragonResidence;
  if(u.cardId!=='COC-32-004'||!stay||stay.ownTurnStarts!==2||stay.landTriggered)continue;
  // The one event is missed while negated, not replayed on a later turn.
  stay.landTriggered=true;
  if(!u.effectsNegated)group.push(trigger(r,who,id));
 }
 return group;
}
export function integrationTurnTriggers(r,who,H){
 const group=[],p=r.players[who];
 const add=(owner,id,extra={})=>{
  const u=id&&r.units[id];if(!u||u.effectsNegated||effectUsedThisTurn(r,owner,id,1))return;
  group.push({...trigger(r,owner,id,{eventTurn:r.turnNumber}),...extra});
 };
 const own=p.integration;
 if(r.units[own]?.cardId==='COC-06-001'&&eligibleSearchIds(r,who,'COC-06-001',H.cards).length)add(who,own);
 const enemy=r.players[1-who].integration;
 if(r.units[enemy]?.cardId==='COC-07-001')add(1-who,enemy);
 for(const id of p.field.filter(Boolean))if(r.units[id].cardId==='COC-19-003')add(who,id,{exception:'destroy-trigger'});
 if(!p.field.some(id=>id&&/용|드래곤/.test(H.attribute(r,id)))){
  for(const id of p.deck)if(r.units[id].cardId==='COC-11-001')add(who,id,{exception:'independent'});
 }
 return group;
}
export function attackPhaseTriggers(r,who){
 const p=r.players[who],group=[];
 for(const id of [p.integration,...p.field].filter(Boolean)){
  const u=r.units[id],king=p.integration===id&&u.cardId==='COC-11-003';
  const orochi=p.field.includes(id)&&u.cardId==='COC-11-006';
  if((!king&&!orochi)||u.effectsNegated||effectUsedThisTurn(r,who,id,1))continue;
  group.push(trigger(r,who,id,{eventTurn:r.turnNumber,amount:king?50:(u.orochiAttacks||0)*80,attackCount:king?null:(u.orochiAttacks||0)}));
 }
 return group;
}
export function recordDragonAttack(r,id){
 const u=r.units[id];
 // Record an executed attack, even when its damage is zero or prevented.
 // A cancelled declaration/retarget does not reach this point.
 if(u?.cardId==='COC-11-006'&&r.players.some(p=>p.field.includes(id)))
  u.orochiAttacks=(u.orochiAttacks||0)+1;
}
export function queueMonsterTriggers(r,effects,H){
 effects=effects.filter(e=>!actionLocked(r,e.sourceId));
 if(!effects.length)return;
 if(r.pendingMonsterTriggers||r.pendingAbility||r.pendingSpell||r.pendingExtraSummon)throw new Error('another response chain is pending');
 effects=effects.map(e=>{
  if(!TRIGGER_RULES[e.payload.cardId].target)return e;
  const forced=lureTarget(r,e.sourceId,H),choices=baseTriggerTargetChoices(r,{...e.payload,who:e.owner,sourceId:e.sourceId},H);
  return {...e,payload:{...e.payload,lureTargetId:forced&&choices.includes(forced.id)?forced.id:null}};
 });
 beginAutomaticTriggerOrder(r,effects.map(e=>({...e,title:`${H.name(r,e.sourceId)} · 효과 ${TRIGGER_RULES[e.payload.cardId].effectNumber}`})),r.turn);
 for(const e of effects){
  if(TRIGGER_RULES[e.payload.cardId].target)consumeLure(r,e.sourceId);
  if(!TRIGGER_RULES[e.payload.cardId].repeatPerEvent)markEffectUsed(r,e.owner,e.sourceId,TRIGGER_RULES[e.payload.cardId].effectNumber);
  if(['COC-06-001','COC-09-001','COC-10-011'].includes(e.payload.cardId)||e.payload.cardId==='COC-32-015'&&r.players[1-e.owner].grave.length)
   H.graveActivation?.(r,{eventKey:`trigger-grave-${e.key}`,cardId:e.payload.cardId});
 }
 r.pendingMonsterTriggers={stage:'ordering',queue:[]};
 resumeMonsterTriggers(r,H);
}
export function resumeMonsterTriggers(r,H){
 const pending=r.pendingMonsterTriggers;
 if(!pending||r.pendingTriggerOrder||r.pendingAbility||r.pendingInfinityChoice||r.pendingTriggerTargetChoice||r.pendingDeckSearch)return;
 if(r.status!=='active'){r.pendingMonsterTriggers=null;return;}
 if(pending.stage==='ordering'){
  if(!r.effectStack?.length||r.effectStack.some(e=>e.effectId!=='monster-trigger-resolution'))throw new Error('invalid ordered monster trigger stack');
  // Hold the already-declared lower entries while each upper entry receives
  // its own counter chain. Order and source snapshots stay serialized.
  pending.queue=r.effectStack.splice(0);pending.stage='responses';
 }
 if(r.effectStack?.length)return;
 const next=pending.queue.pop();
 if(!next){r.pendingMonsterTriggers=null;return;}
 r.effectStack.push(next);
 r.pendingAbility={who:next.owner,sourceId:next.sourceId,cardId:next.payload.cardId,sequence:next.sequence,stage:'response',kind:'trigger',effectNumber:TRIGGER_RULES[next.payload.cardId].effectNumber};
 H.log(r,'effect',`${H.name(r,next.sourceId)}: 자동 유발 효과 선언, 상대 대응 대기`);
}
export function resolveMonsterTrigger(r,e,H){
 const u=r.units[e.sourceId],z=H.zone(r,e.sourceId),p=e.payload;
 if(p.cardId==='COC-19-003'){
  // Printed source-leave exception: the declared return survives destruction.
  if(z?.zone==='field'&&z.player===e.owner&&(u.fieldRevision||0)===p.sourceRevision){
   if(u.effectsNegated)return;
   H.destroy(r,e.sourceId,{sourceId:e.sourceId});
  }
  moveSharedUnits(r,r.players.flatMap(pp=>pp.field.filter(Boolean)),'hand',H,{sourceId:e.sourceId});
  H.log(r,'effect','감독관: 필드의 모든 몬스터를 원래 소유자의 패로 반환');return;
 }
 if(p.cardId==='COC-10-011'){queueDeathRevival(r,e,H);return;}
 if(p.cardId==='COC-26-004'){
  // This declared destruction trigger deliberately survives its own death.
  const t=p.target;
  if(t.id){const target=r.units[t.id],tz=H.zone(r,t.id);if(target&&tz?.zone==='field'&&tz.player===t.controller&&(target.fieldRevision||0)===t.revision)hurtSharedUnits(r,[t.id],p.amount,H,{sourceId:e.sourceId});}
  else damagePlayer(r,t.player,p.amount);
  H.log(r,'effect',`저지먼트 매치: 파괴 직전 공격력 ${p.amount} 반사 피해`);H.outcome(r);return;
 }
 const sourceZone=TRIGGER_RULES[p.cardId].sourceZone||'field';
 if(!u||u.cardId!==p.cardId||u.effectsNegated||z?.zone!==sourceZone||z.player!==e.owner||((sourceZone==='integration'?u.integrationRevision:sourceZone==='field'?u.fieldRevision:u.zoneRevision)||0)!==p.sourceRevision){H.log(r,'effect','유발 소스 이탈/재진입·조종권/무효 상태로 불발');return;}
 if(p.cardId==='COC-11-003'||p.cardId==='COC-11-006'){
  if(p.eventTurn!==r.turnNumber||r.turn!==e.owner||r.phase!=='ATTACK')return;
  const enemy=1-e.owner;
  damagePlayer(r,enemy,p.amount);
  if(p.amount>0)hurtSharedUnits(r,r.players[enemy].field.filter(Boolean),p.amount,H,{sourceId:e.sourceId});
  H.log(r,'effect',`${H.name(r,e.sourceId)}: 어택 시작, 상대 전체에게 ${p.amount} 피해${p.attackCount===null?'':` (실행한 공격 ${p.attackCount}회 × 80)`}`);
  H.outcome(r);return;
 }
 if(p.cardId==='COC-07-001'){H.mill(r,1-e.owner,2);return;}
 if(p.cardId==='COC-01-005'){
  const target=r.units[p.targetId],tz=target&&H.zone(r,p.targetId);
  if(u.gToolBody&&tz?.zone==='field'&&tz.player===p.targetController&&(target.fieldRevision||0)===p.targetRevision)moveSharedUnits(r,[p.targetId],'deck',H,{sourceId:e.sourceId});
  return;
 }
 if(p.cardId==='COC-11-001'){
  if(!r.players[e.owner].field.some(id=>id&&/용|드래곤/.test(H.attribute(r,id)))){
   H.move(r,e.sourceId,'hand',e.owner);H.log(r,'search','낙동강 이무기 공개 후 드로우와 별개로 패에 넣음');
  }
  return;
 }
 if(p.cardId==='COC-06-001'){
  beginDeckSearch(r,e.owner,p.cardId,H.cards,H,{sourceId:e.sourceId,sourceZone,sourceRevision:p.sourceRevision});return;
 }
 if(p.cardId==='COC-09-001'){
  const victim=r.units[p.victimId],vz=victim&&H.zone(r,p.victimId);
  if(vz?.zone==='grave'&&vz.player===e.owner&&(victim.zoneRevision||0)===p.victimRevision)
   equipWeapon(r,e.owner,p.victimId,e.sourceId,p.victimAttack,H);
  else H.log(r,'equipment','파괴된 무기의 묘지 이탈/재진입으로 장착 불발');
  return;
 }
 if(p.cardId==='COC-03-001'){gainUnitStats(r,u.id,{atk:50});H.log(r,'effect','베리아: 묘지 이동 효과의 발동으로 공격력 +50');return;}
 if(TRIGGER_RULES[p.cardId].target){
  const choice={who:e.owner,sourceId:e.sourceId,cardId:p.cardId,sourceRevision:p.sourceRevision,lureTargetId:p.lureTargetId||null};
  if(triggerTargetChoices(r,choice,H).length)r.pendingTriggerTargetChoice=choice;
  else H.log(r,'effect','소환 효과: 유효한 대상 또는 빈 필드 소실');
  return;
 }
 if(resolveSummonTrigger(r,e,H))return;
 if(p.cardId==='COC-23-008'){
  gainUnitStats(r,u.id,{atk:55});
  const integration=r.players[e.owner].integration;if(integration)gainUnitStats(r,integration,{atk:55});
  r.players[e.owner].rideMachineLock=true;
  H.log(r,'effect','어나더: 자신과 일체화 공격력 +55, 이 게임의 다른 라이드머신 사용 금지');
  return;
 }
 if(p.cardId==='COC-26-005'){
  beginDeckSearch(r,e.owner,p.cardId,H.cards,H,{sourceId:e.sourceId,sourceZone,sourceRevision:p.sourceRevision});return;
 }
 if(p.cardId==='COC-32-001'||p.cardId==='COC-32-011'){
  if(r.turn!==e.owner||p.eventTurn!==r.turnNumber)return;
  if(u.bonusAttackTurn!==r.turnNumber){u.bonusAttackTurn=r.turnNumber;u.bonusAttackCount=0;}
  u.bonusAttackCount=(u.bonusAttackCount||0)+1;
  H.log(r,'effect',`${H.name(r,e.sourceId)}: 이 턴 추가 공격 기회 1회 획득`);
 }else if(p.cardId==='COC-32-002'){
  const a=r.units[p.attackerId],az=H.zone(r,p.attackerId);
  if(!a||az?.zone!=='field'||az.player!==p.attackerController||(a.fieldRevision||0)!==p.attackerRevision)return;
  if(swordActualAttack(r,p.attackerId,{getZone:(room,id)=>H.zone(room,id)})>u.hp){
   destroySharedUnits(r,[p.attackerId],H,{sourceId:e.sourceId});
   // A destroyed then revived attacker is a different field stay too.
   const after=H.zone(r,p.attackerId);
   if(after?.zone!=='field'||after.player!==p.attackerController||(r.units[p.attackerId]?.fieldRevision||0)!==p.attackerRevision){r.pendingAttack=null;H.log(r,'attack','워터의 반격으로 공격자가 이탈하여 공격 종료');}
  }
 }else if(p.cardId==='COC-32-004'){
  if(!Number.isFinite(u.hp)||u.hp<=0)return;
  // Exchange mutable stats; independent Sword multipliers remain layered.
  const attack=Math.max(0,Math.floor(u.atk));u.atk=Math.max(0,Math.floor(u.hp));u.hp=attack;
  if(u.hp<=0)H.destroy(r,e.sourceId,{cause:'lethal',sourceId:e.sourceId});
  H.log(r,'effect','랜드: 현재 공격력·체력 교환 (독립 배율 유지)');
 }else if(p.cardId==='COC-32-015'){
  const enemy=1-e.owner,foe=r.players[enemy];
  const handCount=Math.min(2,foe.hand.length),deckCount=Math.min(2,foe.deck.length);
  for(let i=0;i<handCount;i++){const id=foe.hand[H.randomInt(foe.hand.length)];H.move(r,id,'banished',r.units[id].owner);}
  for(let i=0;i<deckCount;i++){const id=foe.deck[0];H.move(r,id,'banished',r.units[id].owner);}
  H.log(r,'effect',`인피니티: 상대 패 ${handCount}장과 덱 위 ${deckCount}장 제외`);
  const candidates=[...foe.grave];
  if(candidates.length)r.pendingInfinityChoice={who:enemy,sourceId:e.sourceId,candidates,count:Math.min(2,candidates.length)};
 }
 H.outcome(r);
}
export function infinityChoiceView(r,viewer,H){
 const p=r.pendingInfinityChoice;if(!p)return null;
 const eligible=p.candidates.filter(id=>r.players[p.who].grave.includes(id));
 return {who:p.who,count:Math.min(p.count,eligible.length),...(viewer===p.who?{choices:eligible.map(id=>({id,card:H.cards.get(r.units[id].cardId)}))}:{})};
}
export function chooseInfinityGrave(r,who,ids,H){
 const p=r.pendingInfinityChoice;
 if(r.status!=='active'||!p||who!==p.who)H.fail(409,'제외할 묘지 카드를 선택할 플레이어가 아닙니다.');
 const eligible=p.candidates.filter(id=>r.players[who].grave.includes(id));
 const count=Math.min(p.count,eligible.length);
 if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count||ids.some(id=>!eligible.includes(id)))H.fail(409,`자신의 묘지에서 서로 다른 카드 ${count}장을 선택하세요.`);
 for(const id of ids)H.move(r,id,'banished',r.units[id].owner);
 r.pendingInfinityChoice=null;H.log(r,'effect',`인피니티: 상대가 선택한 묘지 ${count}장 제외`);
}
