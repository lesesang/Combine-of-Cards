// Shuu's effect ignores Croix's printed summon condition, not game-wide bans.
// Choice is made by the effect controller after the integration effect resolves.
export function recruitChoices(r,who){
 return ['hand','deck','grave'].flatMap(zone=>r.players[who][zone]
  .filter(id=>r.units[id]?.cardId==='COC-31-001').map(id=>({id,zone})))
  .sort((a,b)=>a.id.localeCompare(b.id)); // never expose deck order
}
export function beginRecruitChoice(r,who,H){
 if(!r.players[who].field.includes(null)||!recruitChoices(r,who).length){H.log(r,'effect','슈의 소환 불발: 대상 또는 빈 자리 소실');return false;}
 r.pendingRecruitChoice={who};return true;
}
export function recruitChoiceView(r,viewer,H){
 const p=r.pendingRecruitChoice;if(!p)return null;
 return {who:p.who,...(viewer===p.who?{choices:recruitChoices(r,p.who).map(c=>({...c,card:H.cards.get(r.units[c.id].cardId)}))}:{})};
}
export function chooseRecruit(r,who,id,H){
 const p=r.pendingRecruitChoice;
 if(r.status!=='active'||!p||p.who!==who)H.fail(409,'소환 선택권자가 아닙니다.');
 const choices=recruitChoices(r,who);
 if(!choices.length||!r.players[who].field.includes(null)){r.pendingRecruitChoice=null;H.log(r,'effect','슈의 소환 대상 또는 빈 자리 소실');return;}
 const c=choices.find(c=>c.id===id);if(!c)H.fail(409,'자신의 패·덱·묘지에서 크로와를 선택하세요.');
 H.queueEffectSummon(r,{who,extraUnitId:id,originZone:c.zone,recipe:{method:'recruit',materials:[]},turnNumber:r.turnNumber});
 r.pendingRecruitChoice=null;
}
