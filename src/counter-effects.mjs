import {declareEffect} from './effect-runtime.mjs';

export const COUNTER_RULES=Object.freeze({
 'COC-14-001':{zone:'integration',kinds:['spell','summon']},
 'COC-12-001':{zone:'field',kinds:['spell']},
 'COC-12-002':{zone:'field',kinds:['spell','counter']},
 'COC-24-005':{zone:'field',kinds:['spell']}
});
export const COUNTER_IDS=Object.freeze(Object.keys(COUNTER_RULES));
export const counterEffectIds=new Set(['storm-spell-counter','storm-summon-counter','card-counter']);
export function currentCounterTarget(room,pending,kind){
 if(pending.counter)return room.effectStack?.find(e=>e.sequence===pending.counter.sequence);
 if(kind==='spell')return room.effectStack?.find(e=>e.effectId==='auto-spell-resolution'&&e.sourceId===pending.sourceId&&e.owner===pending.who);
 return room.effectStack?.find(e=>e.sequence===pending.sequence&&e.effectId==='extra-summon-resolution')||{owner:pending.who,effectId:'extra-summon-resolution'};
}
function targetKind(effect){return effect?.effectId==='auto-spell-resolution'?'spell':effect?.effectId==='extra-summon-resolution'?'summon':counterEffectIds.has(effect?.effectId)?'counter':null;}
export function availableCounters(room,who,pending,kind){
 if(room.status!=='active'||!pending||(pending.awaiting??1-pending.who)!==who)return [];
 const target=currentCounterTarget(room,pending,kind),type=targetKind(target);
 if(!target||target.owner===who)return [];
 const p=room.players[who];
 return [p.integration,...p.field].filter(id=>{
  const u=room.units[id],rule=u&&COUNTER_RULES[u.cardId];
  return rule&&rule.kinds.includes(type)&&!u.effectsNegated&&!(rule.zone==='field'?u.counterUsedThisStay:u.spellCounterGameUsed)&&
   (rule.zone==='integration'?p.integration===id:p.field.includes(id));
 });
}
export function declareCardCounter(room,who,sourceId,pending,kind){
 if(!availableCounters(room,who,pending,kind).includes(sourceId))throw Object.assign(new Error('사용 가능한 무효화 카드가 아닙니다.'),{status:409});
 const target=currentCounterTarget(room,pending,kind);
 if(!target?.sequence)throw new Error('counter target is missing from stack');
 const u=room.units[sourceId],zone=COUNTER_RULES[u.cardId].zone;
 const effect=declareEffect(room,{effectId:u.cardId==='COC-14-001'?(kind==='spell'?'storm-spell-counter':'storm-summon-counter'):'card-counter',owner:who,
  sourceId,sourceZone:zone,payload:{targetSequence:target.sequence,cardId:u.cardId,sourceRevision:zone==='field'?(u.fieldRevision||0):(u.integrationRevision||0)}});
 if(zone==='field')u.counterUsedThisStay=true;else u.spellCounterGameUsed=true;
 const previous=pending.counter;
 pending.counter={who,sourceId,sequence:effect.sequence};
 pending.countersDeclared??=previous?[previous]:[];pending.countersDeclared.push(pending.counter);
 pending.awaiting=1-who;
 return effect;
}
export function resolveCardCounter(room,pending,effect,H){
 const declared=(pending.countersDeclared||[pending.counter]).find(c=>c?.sequence===effect.sequence);
 if(!declared||declared.sourceId!==effect.sourceId||declared.who!==effect.owner)throw new Error('unexpected card counter');
 const u=room.units[effect.sourceId],cardId=effect.payload.cardId||'COC-14-001',rule=COUNTER_RULES[cardId];
 const p=room.players[effect.owner],inZone=rule?.zone==='field'?p.field.includes(effect.sourceId):p.integration===effect.sourceId;
 const revision=rule?.zone==='field'?(u?.fieldRevision||0):(u?.integrationRevision||0);
 // Old persisted Storm entries may predate sourceRevision or use integrationRevision.
 const expected=effect.payload.sourceRevision??effect.payload.integrationRevision;
 if(!u||u.cardId!==cardId||u.effectsNegated||!inZone||(expected!==undefined&&revision!==expected)){
  H.log(room,'effect','무효화 카드 소스 이탈/상태 변경으로 불발');return;
 }
 const target=room.effectStack.find(e=>e.sequence===effect.payload.targetSequence);
 if(!target||target.owner===effect.owner||!rule.kinds.includes(targetKind(target)))throw new Error('invalid card counter target');
 target.negatedBy=effect.sequence;
 H.log(room,'effect',`${H.name(room,effect.sourceId)}: 상대 ${targetKind(target)==='summon'?'소환':'효과'} 무효화`);
}

export function resetFieldCounterOnSummon(unit,from,to){
 if(to==='field'&&from?.zone!=='field'&&COUNTER_RULES[unit.cardId]?.zone==='field')delete unit.counterUsedThisStay;
}
export function counterLimitLabel(cardId){return COUNTER_RULES[cardId]?.zone==='field'?'재소환 전 1회':'주문/소환 합계 게임당 1회';}
