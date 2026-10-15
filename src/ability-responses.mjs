import {declareEffect,resolveEffectStack} from './effect-runtime.mjs';
import {FIELD_EFFECT_RULES,prepareFieldEffect,payFieldEffect,resolveFieldEffect} from './field-ability-effects.mjs';
import {availableCounters,declareCardCounter,resolveCardCounter,counterEffectIds} from './counter-effects.mjs';
export const abilityResponsePlayer=r=>r.pendingAbility&&r.pendingAbility.stage!=='cost-triggers'?(r.pendingAbility.awaiting??1-r.pendingAbility.who):null;
export const legalAbilityCounters=(r,who)=>r.pendingAbility?.stage==='cost-triggers'?[]:availableCounters(r,who,r.pendingAbility,'ability');
export const declareAbilityCounter=(r,who,id)=>declareCardCounter(r,who,id,r.pendingAbility,'ability');
function atomic(r,fn){const before=structuredClone(r);try{return fn();}catch(e){for(const key of Object.keys(r))delete r[key];Object.assign(r,before);throw e;}}
export function queueFieldAbility(r,who,body,H){
 if(r.effectStack?.length||r.pendingTriggerOrder||r.pendingAbility||r.pendingSpell||r.pendingExtraSummon)H.fail(409,'다른 효과 체인이 해결되기 전에는 발동할 수 없습니다.');
 const plan=prepareFieldEffect(r,who,body,H);
 return atomic(r,()=>{
  if(FIELD_EFFECT_RULES[plan.cardId].selfCost||FIELD_EFFECT_RULES[plan.cardId].costTriggers){
   payFieldEffect(r,who,plan,H);
   r.pendingAbility={who,sourceId:plan.sourceId,cardId:plan.cardId,stage:'cost-triggers',plan};
   resumeFieldAbility(r,H);
  }else{
   const effect=declareEffect(r,{effectId:'field-ability-resolution',owner:who,sourceId:plan.sourceId,sourceZone:plan.sourceZone,payload:plan});
   payFieldEffect(r,who,plan,H);
   r.pendingAbility={who,sourceId:plan.sourceId,cardId:plan.cardId,sequence:effect.sequence,stage:'response'};
  }
  H.log(r,'effect',`${H.name(r,plan.sourceId)}: 필드 효과 선언 및 대응 대기`);
 });
}
export function resumeFieldAbility(r,H){
 const p=r.pendingAbility;if(p?.stage!=='cost-triggers'||r.pendingTriggerOrder)return;
 if(r.status!=='active'){r.pendingAbility=null;return;}
 const effect=declareEffect(r,{effectId:'field-ability-resolution',owner:p.who,sourceId:p.sourceId,sourceZone:p.plan.sourceZone,...(FIELD_EFFECT_RULES[p.cardId].selfCost?{exception:'self-cost'}:{}),payload:p.plan});
 p.sequence=effect.sequence;p.stage='response';delete p.plan;
}
export function finishFieldAbility(r,H){
 if(!r.pendingAbility)H.fail(409,'해결할 필드 효과가 없습니다.');
 return atomic(r,()=>{
  const pending=r.pendingAbility;r.pendingAbility=null;
  const results=resolveEffectStack(r,{getZone:id=>H.zone(r,id),execute:effect=>{
   if(counterEffectIds.has(effect.effectId)){resolveCardCounter(r,pending,effect,H);return;}
   if(effect.effectId!=='field-ability-resolution'||effect.sequence!==pending.sequence||effect.owner!==pending.who||effect.sourceId!==pending.sourceId||effect.payload.cardId!==pending.cardId)throw new Error('unexpected field ability effect');
   if(resolveFieldEffect(r,effect.owner,effect.payload,H))H.log(r,'effect',`${H.name(r,effect.sourceId)}: 필드 효과 해결`);
  },onResult:result=>{
   if(result.status==='negated-by-effect')H.log(r,'effect','필드/대응 효과 무효화 (비용 반환 없음)');
   if(result.status==='negated-source-moved')H.log(r,'effect','필드/대응 효과 소스 이탈로 불발 (비용 반환 없음)');
  }});
  if(!results.length)throw new Error('queued field ability had no stack entry');
  H.outcome(r);return results;
 });
}
