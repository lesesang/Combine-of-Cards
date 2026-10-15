import {declareEffect,resolveEffectStack} from './effect-runtime.mjs';
import {availableCounters,declareCardCounter,resolveCardCounter,counterEffectIds} from './counter-effects.mjs';

export const extraResponsePlayer=room=>room.pendingExtraSummon&&room.pendingExtraSummon.stage!=='cost-triggers'
 ?(room.pendingExtraSummon.awaiting??1-room.pendingExtraSummon.who):null;
export function legalSummonCounters(room,who){
 if(room.pendingExtraSummon?.stage==='cost-triggers')return [];
 return availableCounters(room,who,room.pendingExtraSummon,'summon');
}
export function queueSummonEffect(room,pending){
 if(room.pendingTriggerOrder){pending.stage='cost-triggers';return;}
 if(room.effectStack?.length)throw new Error('another effect stack is pending');
 const effect=declareEffect(room,{effectId:'extra-summon-resolution',owner:pending.who,
  sourceId:null,payload:{extraUnitId:pending.extraUnitId}});
 pending.sequence=effect.sequence;
 pending.stage='response';
}
export function resumeSummonDeclaration(room){
 const pending=room.pendingExtraSummon;
 if(room.status==='active'&&pending?.stage==='cost-triggers'&&!room.pendingTriggerOrder)queueSummonEffect(room,pending);
}
export function declareSummonCounter(room,who,sourceId){
 if(!legalSummonCounters(room,who).includes(sourceId))throw Object.assign(new Error('사용 가능한 소환 무효화 카드가 아닙니다.'),{status:409});
 const pending=room.pendingExtraSummon;
 // Older persisted pass-only windows have no stack entry yet.
 if(!pending.sequence)queueSummonEffect(room,pending);
 return declareCardCounter(room,who,sourceId,pending,'summon');
}
export function resolveSummonResponse(room,H){
 const pending=room.pendingExtraSummon;
 if(!pending)throw new Error('no pending summon');
 if(!pending.sequence)queueSummonEffect(room,pending);
 resolveEffectStack(room,{getZone:id=>H.zone(room,id),execute:effect=>{
  if(counterEffectIds.has(effect.effectId)){resolveCardCounter(room,pending,effect,H);return;}
  if(effect.effectId!=='extra-summon-resolution'||effect.sequence!==pending.sequence||effect.payload.extraUnitId!==pending.extraUnitId)throw new Error('unexpected summon effect');
  H.summon(room,pending);
 },onResult:(result,effect)=>{
  if(effect.effectId==='extra-summon-resolution'&&result.status==='negated-by-effect')H.negate(room,pending);
 }});
 room.pendingExtraSummon=null;
}
