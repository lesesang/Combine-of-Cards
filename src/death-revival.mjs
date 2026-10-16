// Declared death effects wait for their own response, then declare a separate
// summon. The actual grave UID stays in place if the summon is negated.
export function queueDeathRevival(r,e,H){
 const u=r.units[e.sourceId],z=u&&H.zone(r,e.sourceId);
 if(!u||z?.zone!=='grave'||(u.zoneRevision||0)!==e.payload.graveRevision){H.log(r,'revive','부활 소스가 묘지를 떠나거나 재진입하여 불발');return;}
 (r.revivalQueue??=[]).push({who:e.owner,extraUnitId:u.id,originZone:'grave',originPlayer:z.player,
  originRevision:u.zoneRevision||0,recipe:{method:'revival',materials:[]},turnNumber:r.turnNumber});
}
export function resumeDeathRevivals(r,H){
 if(r.status!=='active'){r.revivalQueue=[];return;}
 if(!r.revivalQueue?.length||r.suspendedResponses?.length||r.deferredMonsterTriggers?.length||r.effectStack?.length||
  ['pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers','pendingTriggerOrder','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingSummonBatch','pendingRecruitChoice','pendingElementalChoice'].some(key=>r[key]))return;
 while(r.revivalQueue.length){
  const next=r.revivalQueue.shift(),u=r.units[next.extraUnitId],z=u&&H.zone(r,u.id);
  if(!u||z?.zone!=='grave'||z.player!==next.originPlayer||(u.zoneRevision||0)!==next.originRevision||!r.players[next.who].field.includes(null)){
   H.log(r,'revive','부활 후보 또는 빈 필드 소실로 종료');continue;
  }
  H.queueEffectSummon(r,next);return;
 }
}
export function finishDeathRevival(r,p,H){
 const u=r.units[p.extraUnitId],z=u&&H.zone(r,u.id);
 if(!u||u.cardId!=='COC-10-011'||z?.zone!=='grave'||z.player!==p.originPlayer||
  (u.zoneRevision||0)!==p.originRevision||!r.players[p.who].field.includes(null)){H.log(r,'revive','부활 대상/빈 자리 변경으로 불발');return;}
 H.move(r,u.id,'field',p.who);u.revivedOnce=true;
 H.onSummon(r,p.who,u.id);
 H.log(r,'revive','뒤섞인 백작 빌헬름: 부활 효과를 소모한 상태로 부활');
}
