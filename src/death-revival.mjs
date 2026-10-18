import {cardUseForbidden} from './card-game-history.mjs';
// Declared death effects wait for their own response, then declare a separate
// summon. The actual grave UID stays in place if the summon is negated.
export function queueDeathRevival(r,e,H){
 const u=r.units[e.sourceId],z=u&&H.zone(r,e.sourceId);
 if(!u||z?.zone!=='grave'||(u.zoneRevision||0)!==e.payload.graveRevision){H.log(r,'revive','부활 소스가 묘지를 떠나거나 재진입하여 불발');return;}
 queueCardRevival(r,e.owner,u.id,H,{kind:'wilhelm'});
}
export function queueCardRevival(r,who,id,H,{kind,originZone='grave',cannotAttackUntil=null}={}){
 const u=r.units[id],z=u&&H.zone(r,id);if(!u||z?.zone!==originZone)return;
 (r.revivalQueue??=[]).push({who,extraUnitId:id,originZone,originPlayer:z.player,
  originRevision:u.zoneRevision||0,revivalKind:kind||'wilhelm',cannotAttackUntil,
  recipe:{method:'revival',materials:[]},turnNumber:r.turnNumber});
}
function eligible(r,p,H){
 const u=r.units[p.extraUnitId],z=u&&H.zone(r,u.id);
 return !!u&&['grave','hand','deck','extra'].includes(p.originZone)&&z?.zone===p.originZone&&z.player===p.originPlayer&&
  (u.zoneRevision||0)===p.originRevision&&r.players[p.who].field.includes(null)&&
  !cardUseForbidden(r,p.who,H.cards.get(u.cardId));
}
export function resumeDeathRevivals(r,H){
 if(r.status!=='active'){r.revivalQueue=[];return;}
 if(!r.revivalQueue?.length||r.suspendedResponses?.length||r.deferredMonsterTriggers?.length||r.effectStack?.length||
  ['pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers','pendingTriggerOrder','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingSummonBatch','pendingRecruitChoice','pendingElementalChoice'].some(key=>r[key]))return;
 while(r.revivalQueue.length){
  const next=r.revivalQueue.shift();
  if(!eligible(r,next,H)){
   H.log(r,'revive','부활 후보 또는 빈 필드 소실로 종료');continue;
  }
  H.queueEffectSummon(r,next);return;
 }
}
export function finishDeathRevival(r,p,H){
 const kind=p.revivalKind||'wilhelm',u=r.units[p.extraUnitId];
 if(!eligible(r,p,H)||(kind==='wilhelm'&&u.cardId!=='COC-10-011')||(kind==='wyvern'&&u.cardId!=='COC-11-004')){H.log(r,'revive','부활 대상/빈 자리/사용 금지 변경으로 불발');return;}
 H.move(r,u.id,'field',p.who);
 H.prepareMonsterizedUnit?.(r,p,H);
 if(kind==='wilhelm')u.revivedOnce=true;
 if(kind==='borrowed-donkey')u.effectsNegated=true;
 if(p.cannotAttackUntil!==null&&p.cannotAttackUntil!==undefined)u.cannotAttackUntil=p.cannotAttackUntil;
 H.onSummon(r,p.who,u.id);
 H.log(r,'revive',`${H.name(r,u.id)}: 효과 소환 완료`);
}
