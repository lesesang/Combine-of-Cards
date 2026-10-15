import {ELEMENTAL_MAGICIAN_IDS,effectUsedThisTurn} from './effect-usage.mjs';
import {planActivation} from './activation-rules.mjs';
export const isElemental=id=>ELEMENTAL_MAGICIAN_IDS.includes(id);
const deny=(H,message)=>H.fail(409,message);
export function elementalChoices(r,who,H){
 return ['hand','deck','grave'].flatMap(zone=>r.players[who][zone].filter(id=>isElemental(r.units[id]?.cardId)).map(id=>({id,zone})))
 .filter(({id})=>{try{planActivation({room:r,who,unitId:id,cards:H.cards});return true;}catch(e){if(e.status===409)return false;throw e;}})
 .sort((a,b)=>r.units[a.id].cardId.localeCompare(r.units[b.id].cardId)||a.id.localeCompare(b.id));
}
export function prepareElemental(r,who,sourceId,H){
 const u=r.units[sourceId];
 if(u.effectDestructionImmune)deny(H,'자신을 파괴할 수 없어 교체 소환 비용을 지불할 수 없습니다.');
 // All four candidates have the same printed hand-spell condition. The source
 // itself becomes a legal graveyard candidate after paying its destruction.
 const candidates=elementalChoices(r,who,H);
 if(!candidates.length){
  if(u.owner!==who)deny(H,'자신의 패·덱·묘지에 소환할 원소의 마법사가 없습니다.');
  planActivation({room:r,who,unitId:sourceId,cards:H.cards});
 }
}
export function legalElementalAbilities(r,who,H){
 if(r.status!=='active'||r.pendingManual||r.pendingAbility||r.pendingElementalChoice||r.pendingRecruitChoice||r.pendingInfinityChoice||r.pendingMonsterTriggers||r.pendingTriggerOrder||r.pendingSpell||r.pendingDeckSearch||r.pendingExtraSummon||r.effectStack?.length)return [];
 if(r.turn===who&&(r.phase!=='MAIN'||r.pendingAttack))return [];
 if(r.pendingAttack&&r.pendingAttack.stage!=='response')return [];
 return r.players[who].field.filter(id=>id&&isElemental(r.units[id].cardId)&&!r.units[id].effectsNegated&&!effectUsedThisTurn(r,who,id,1)).filter(id=>{
  try{prepareElemental(r,who,id,H);return true;}catch(e){if(e.status===409)return false;throw e;}
 });
}
export function beginElementalChoice(r,who,sourceId,H){
 if(!r.players[who].field.includes(null)||!elementalChoices(r,who,H).length){H.log(r,'effect','원소 교체 소환 불발: 소환 조건 또는 빈 자리 소실 (비용 반환 없음)');return false;}
 r.pendingElementalChoice={who,sourceId};return true;
}
export function elementalChoiceView(r,viewer,H){
 const p=r.pendingElementalChoice;if(!p)return null;
 return {who:p.who,...(viewer===p.who?{choices:elementalChoices(r,p.who,H).map(c=>({...c,card:H.cards.get(r.units[c.id].cardId)}))}:{})};
}
export function chooseElemental(r,who,id,H){
 const p=r.pendingElementalChoice;
 if(r.status!=='active'||!p||p.who!==who)deny(H,'교체 소환 선택권자가 아닙니다.');
 const choices=elementalChoices(r,who,H);
 if(!choices.length||!r.players[who].field.includes(null)){r.pendingElementalChoice=null;H.log(r,'effect','교체 소환 대상 또는 빈 자리 소실 (비용 반환 없음)');return;}
 const choice=choices.find(c=>c.id===id);if(!choice)deny(H,'자신의 패·덱·묘지에서 소환 가능한 원소의 마법사를 선택하세요.');
 H.queueEffectSummon(r,{who,extraUnitId:id,originZone:choice.zone,recipe:{method:'elemental',materials:[]},turnNumber:r.turnNumber});
 r.pendingElementalChoice=null;
}
