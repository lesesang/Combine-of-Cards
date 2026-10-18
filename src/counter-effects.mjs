import {actionLocked,consumeLure} from './demon-effects.mjs';
import {FIELD_EFFECT_RULES} from './field-ability-effects.mjs';
import {declareEffect} from './effect-runtime.mjs';
import {TRIGGER_RULES} from './triggered-effects.mjs';
import {borrowedTraits,borrowedProfile,borrowedProgram} from './borrowed-state.mjs';

export const COUNTER_RULES=Object.freeze({
 'COC-14-001':{zone:'integration',kinds:['spell','summon']},
 'COC-12-001':{zone:'field',sourceType:'monster',kinds:['spell']},
 'COC-12-002':{zone:'field',sourceType:'monster',kinds:['monster-effect']},
 'COC-24-005':{zone:'field',sourceType:'monster',kinds:['spell']}
});
export const COUNTER_IDS=Object.freeze(Object.keys(COUNTER_RULES));
export const counterEffectIds=new Set(['storm-spell-counter','storm-summon-counter','card-counter']);
export function currentCounterTarget(room,pending,kind){
 if(pending.counter)return room.effectStack?.find(e=>e.sequence===pending.counter.sequence);
 if(kind==='ability')return room.effectStack?.find(e=>e.sequence===pending.sequence&&['field-ability-resolution','monster-trigger-resolution','spell-reuse-resolution','grave-ability-resolution','original-sin-resolution','zone-ability-resolution','dragon-gold-cast-resolution'].includes(e.effectId));
 if(kind==='spell')return room.effectStack?.find(e=>e.effectId==='auto-spell-resolution'&&e.sourceId===pending.sourceId&&e.owner===pending.who);
 return room.effectStack?.find(e=>e.sequence===pending.sequence&&e.effectId==='extra-summon-resolution')||{owner:pending.who,effectId:'extra-summon-resolution'};
}
function targetKind(effect){
 if(effect?.payload?.borrowedKey&&effect.effectId==='card-counter')return 'integration-effect';
 if(effect?.effectId==='monster-trigger-resolution'&&effect.payload?.borrowedKey)return 'integration-effect';
 if(effect?.effectId==='dragon-gold-cast-resolution')return 'spell';
 if(effect?.effectId==='zone-ability-resolution'&&['COC-11-004','COC-12-005'].includes(effect.payload?.cardId))return 'monster-effect';
 if(effect?.effectId==='monster-trigger-resolution'&&TRIGGER_RULES[effect.payload?.cardId]?.sourceType==='spell')return 'spell';
 if(effect?.effectId==='original-sin-resolution')return 'integration-effect';
 if(effect?.effectId==='grave-ability-resolution'&&effect.payload?.cardId==='COC-22-008')return 'spell';
 if(effect?.effectId==='spell-reuse-resolution')return effect.payload?.originCardId==='COC-26-006'?'spell':'integration-effect';
 if(effect?.effectId==='auto-spell-resolution')return 'spell';
 if(effect?.effectId==='extra-summon-resolution')return 'summon';
 if(effect?.effectId==='monster-trigger-resolution'&&TRIGGER_RULES[effect.payload?.cardId])return (TRIGGER_RULES[effect.payload.cardId].sourceZone==='integration'||TRIGGER_RULES[effect.payload.cardId].sourceType==='integration')?'integration-effect':'monster-effect';
 if(effect?.effectId==='field-ability-resolution')return FIELD_EFFECT_RULES[effect.payload?.cardId]?.sourceType==='monster'?'monster-effect':'integration-effect';
 // Classify the declared source snapshot, not its current zone or a generic counter ID.
 // Only registered monster effects are supported; other monster triggers need integration.
 if(effect?.effectId==='card-counter'&&COUNTER_RULES[effect.payload?.cardId]?.sourceType==='monster')return 'monster-effect';
 return counterEffectIds.has(effect?.effectId)?'counter':null;
}
export function availableCounters(room,who,pending,kind){
 if(room.status!=='active'||!pending||(pending.awaiting??1-pending.who)!==who)return [];
 const target=currentCounterTarget(room,pending,kind),type=targetKind(target);
 if(!target||target.owner===who||target.preventedBy)return [];
 const p=room.players[who];
 return [p.integration,...p.field].filter(id=>{
  const u=room.units[id],rule=u&&COUNTER_RULES[u.cardId];
  if(id===p.integration&&u&&!actionLocked(room,id)&&borrowedTraits(room,who,'counter').some(g=>!g.counterUsed&&borrowedProfile(g.cardId,g.number).kinds.includes(type)))return true;
  return rule&&rule.kinds.includes(type)&&!u.effectsNegated&&!actionLocked(room,id)&&!(rule.zone==='field'?u.counterUsedThisStay:u.spellCounterGameUsed)&&
   (rule.zone==='integration'?p.integration===id:p.field.includes(id));
 });
}
export function declareCardCounter(room,who,sourceId,pending,kind){
 if(!availableCounters(room,who,pending,kind).includes(sourceId))throw Object.assign(new Error('사용 가능한 무효화 카드가 아닙니다.'),{status:409});
 const target=currentCounterTarget(room,pending,kind);
 if(!target?.sequence)throw new Error('counter target is missing from stack');
 const u=room.units[sourceId],borrowed=sourceId===room.players[who].integration&&borrowedTraits(room,who,'counter').find(g=>!g.counterUsed&&borrowedProfile(g.cardId,g.number).kinds.includes(targetKind(target)));
 const zone=borrowed?'integration':COUNTER_RULES[u.cardId].zone;
 const effect=declareEffect(room,{effectId:u.cardId==='COC-14-001'?(targetKind(target)==='spell'?'storm-spell-counter':'storm-summon-counter'):'card-counter',owner:who,
  sourceId,sourceZone:zone,payload:{targetSequence:target.sequence,cardId:u.cardId,sourceRevision:zone==='field'?(u.fieldRevision||0):(u.integrationRevision||0),...(borrowed?{borrowedKey:borrowed.key}:{})}});
 if(borrowed)borrowed.counterUsed=true;else if(zone==='field')u.counterUsedThisStay=true;else u.spellCounterGameUsed=true;
 consumeLure(room,sourceId);
 const previous=pending.counter;
 pending.counter={who,sourceId,sequence:effect.sequence};
 pending.countersDeclared??=previous?[previous]:[];pending.countersDeclared.push(pending.counter);
 pending.awaiting=1-who;
 return effect;
}
export function resolveCardCounter(room,pending,effect,H){
 const declared=(pending.countersDeclared||[pending.counter]).find(c=>c?.sequence===effect.sequence);
 if(!declared||declared.sourceId!==effect.sourceId||declared.who!==effect.owner)throw new Error('unexpected card counter');
 const u=room.units[effect.sourceId],cardId=effect.payload.cardId||'COC-14-001',borrowed=effect.payload.borrowedKey&&borrowedProgram(room,effect.owner,effect.payload.borrowedKey),rule=borrowed?{zone:'integration',kinds:borrowedProfile(borrowed.cardId,borrowed.number).kinds}:COUNTER_RULES[cardId];
 const p=room.players[effect.owner],inZone=rule?.zone==='field'?p.field.includes(effect.sourceId):p.integration===effect.sourceId;
 const revision=rule?.zone==='field'?(u?.fieldRevision||0):(u?.integrationRevision||0);
 // Old persisted Storm entries may predate sourceRevision or use integrationRevision.
 const expected=effect.payload.sourceRevision??effect.payload.integrationRevision;
 if(!rule||!u||u.cardId!==cardId||u.effectsNegated||!inZone||(expected!==undefined&&revision!==expected)){
  H.log(room,'effect','무효화 카드 소스 이탈/상태 변경으로 불발');return;
 }
 const target=room.effectStack.find(e=>e.sequence===effect.payload.targetSequence);
 if(!target||target.owner===effect.owner)throw new Error('invalid card counter target');
 if(!rule.kinds.includes(targetKind(target))){
  // Pre-correction saves may contain Wind Girl responses to spells or Storm.
  // Resolve those as a fizzle, retaining the already spent use and root effect.
  if(cardId==='COC-12-002'){H.log(room,'effect','라이징 윈드 걸: 상대 몬스터 효과가 아니므로 불발');return;}
  throw new Error('invalid card counter target');
 }
 target.negatedBy=effect.sequence;
 H.log(room,'effect',`${H.name(room,effect.sourceId)}: 상대 ${targetKind(target)==='summon'?'소환':'효과'} 무효화`);
}

export function resetFieldCounterOnSummon(unit,from,to){
 if(to==='field'&&from?.zone!=='field'&&COUNTER_RULES[unit.cardId]?.zone==='field')delete unit.counterUsedThisStay;
}
export function counterLimitLabel(cardId){return cardId==='COC-21-001'?'복사한 원본 조항별 일체화 체류 1회':COUNTER_RULES[cardId]?.zone==='field'?'재소환 전 1회':'주문/소환 합계 게임당 1회';}
