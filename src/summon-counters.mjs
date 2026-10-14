import {declareEffect,resolveEffectStack} from './effect-runtime.mjs';
import {availableStormCounter} from './spell-counters.mjs';

export const extraResponsePlayer=room=>room.pendingExtraSummon
 ?(room.pendingExtraSummon.awaiting??1-room.pendingExtraSummon.who):null;
export function legalSummonCounters(room,who){
 const p=room.pendingExtraSummon;
 if(room.status!=='active'||!p||p.counter||p.who===who||extraResponsePlayer(room)!==who)return [];
 return availableStormCounter(room,who);
}
export function queueSummonEffect(room,pending){
 if(room.effectStack?.length)throw new Error('another effect stack is pending');
 const effect=declareEffect(room,{effectId:'extra-summon-resolution',owner:pending.who,
  sourceId:null,payload:{extraUnitId:pending.extraUnitId}});
 pending.sequence=effect.sequence;
}
export function declareSummonCounter(room,who,sourceId){
 if(!legalSummonCounters(room,who).includes(sourceId))throw Object.assign(new Error('사용 가능한 소환 무효화 카드가 아닙니다.'),{status:409});
 const pending=room.pendingExtraSummon;
 // Older persisted pass-only windows have no stack entry yet.
 if(!pending.sequence)queueSummonEffect(room,pending);
 const target=room.effectStack?.find(e=>e.sequence===pending.sequence&&e.effectId==='extra-summon-resolution'&&e.owner===pending.who&&e.payload.extraUnitId===pending.extraUnitId);
 if(!target)throw new Error('summon counter target is missing');
 const unit=room.units[sourceId];
 const effect=declareEffect(room,{effectId:'storm-summon-counter',owner:who,sourceId,sourceZone:'integration',
  payload:{targetSequence:target.sequence,integrationRevision:unit.integrationRevision||0}});
 unit.spellCounterGameUsed=true;
 pending.counter={who,sourceId,sequence:effect.sequence};pending.awaiting=pending.who;
}
export function resolveSummonResponse(room,H){
 const pending=room.pendingExtraSummon;
 if(!pending)throw new Error('no pending summon');
 if(!pending.sequence)queueSummonEffect(room,pending);
 resolveEffectStack(room,{getZone:id=>H.zone(room,id),execute:effect=>{
  if(effect.effectId==='storm-summon-counter'){
   if(effect.sequence!==pending.counter?.sequence||effect.sourceId!==pending.counter.sourceId||effect.owner!==pending.counter.who)throw new Error('unexpected summon counter');
   const u=room.units[effect.sourceId];
   if(!u||u.cardId!=='COC-14-001'||u.effectsNegated||room.players[effect.owner].integration!==u.id||(u.integrationRevision||0)!==effect.payload.integrationRevision){H.log(room,'effect','스톰블레이거 드래곤: 소스 이탈/무효로 소환 무효화 불발');return;}
   const target=room.effectStack.find(e=>e.sequence===effect.payload.targetSequence&&e.sequence===pending.sequence);
   if(!target)throw new Error('summon counter target is missing');
   target.negatedBy=effect.sequence;return;
  }
  if(effect.effectId!=='extra-summon-resolution'||effect.sequence!==pending.sequence||effect.payload.extraUnitId!==pending.extraUnitId)throw new Error('unexpected summon effect');
  H.summon(room,pending);
 },onResult:(result,effect)=>{
  if(effect.effectId==='extra-summon-resolution'&&result.status==='negated-by-effect')H.negate(room,pending);
 }});
 room.pendingExtraSummon=null;
}
