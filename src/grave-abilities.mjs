import {FUSION_UP_ID,requireUnusedEffect,markEffectUsed} from './effect-usage.mjs';
import {declareEffect} from './effect-runtime.mjs';
export const GRAVE_ABILITY_IDS=Object.freeze([FUSION_UP_ID]);

// Pure preflight is shared by player actions, UI options and AI decisions.
export function planGraveAbility(r,who,{sourceUnitId,costUnitId},H){
 const p=r.players[who];
 if(r.status!=='active'||r.turn!==who||r.phase!=='MAIN'||['pendingAttack','pendingManual','pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers','pendingTriggerOrder','pendingDeckSearch','pendingTriggerTargetChoice','pendingSummonBatch','pendingElementalChoice','pendingRecruitChoice','pendingInfinityChoice'].some(key=>r[key])||r.effectStack?.length)
  H.fail(409,'자신의 메인 페이즈에만 묘지 효과를 사용할 수 있습니다.');
 if(!p?.grave.includes(sourceUnitId)||r.units[sourceUnitId]?.cardId!==FUSION_UP_ID)
  H.fail(409,'자신의 묘지에 있는 블랙 메탈 퓨전 업을 선택해야 합니다.');
 if((p.spellForbiddenUntil||0)>0&&p.spellForbiddenUntil>=p.turnsTaken)H.fail(409,'주문 사용 금지 중에는 묘지 주문 효과를 발동할 수 없습니다.');
 requireUnusedEffect(r,who,sourceUnitId,2);
 const unit=r.units[costUnitId];
 if(!p.field.includes(costUnitId)||!unit||!H.type(r,costUnitId)?.includes('몬스터')||!H.name(r,costUnitId).startsWith('블랙 메탈'))
  H.fail(409,'자신 필드의 블랙 메탈 몬스터를 비용으로 선택해야 합니다.');
 if(!H.attackAvailable(unit,r.turnNumber))
  H.fail(409,'비용으로 소모할 공격 기회가 없습니다.');
 return {sourceUnitId,costUnitId};
}
export function applyGraveAbility(r,who,body,H){
 const {sourceUnitId,costUnitId}=planGraveAbility(r,who,body,H);
 const unit=r.units[costUnitId];
 if(unit.attackCountTurn!==r.turnNumber){unit.attackCountTurn=r.turnNumber;unit.attackCount=0}
 unit.attackCount=(unit.attackCount||0)+1;
 markEffectUsed(r,who,sourceUnitId,2);
 const effect=declareEffect(r,{effectId:'grave-ability-resolution',owner:who,sourceId:sourceUnitId,sourceZone:'grave',exception:'graveyard',payload:{cardId:FUSION_UP_ID,sourceRevision:r.units[sourceUnitId].zoneRevision||0}});
 r.pendingAbility={who,sourceId:sourceUnitId,cardId:FUSION_UP_ID,sequence:effect.sequence,stage:'response',kind:'grave',effectNumber:2};
 H.graveActivation?.(r,{eventKey:`grave-ability-${effect.sequence}`,cardId:FUSION_UP_ID});
 H.log(r,'effect',`${r.players[who].label}: ${H.name(r,costUnitId)}의 공격 기회 1회 지불, 퓨전 업 묘지 회수 대응 대기`);
}
export function resolveGraveAbility(r,e,H){
 const u=r.units[e.sourceId],p=r.players[e.owner];
 if(!u||u.cardId!==FUSION_UP_ID||!p.grave.includes(e.sourceId)||(u.zoneRevision||0)!==e.payload.sourceRevision){H.log(r,'effect','퓨전 업 회수: 원본의 묘지 이탈/재진입으로 불발 (비용 미환불)');return;}
 H.move(r,e.sourceId,'hand',u.owner);H.log(r,'effect','블랙 메탈 퓨전 업: 묘지에서 패로 회수');
}
export function legalGraveAbilities(r,who,H){
 const p=r.players[who];if(!p)return [];
 const choices=[];
 for(const sourceUnitId of p.grave){
  if(r.units[sourceUnitId]?.cardId!==FUSION_UP_ID)continue;
  for(const costUnitId of p.field.filter(Boolean)){
   try{choices.push(planGraveAbility(r,who,{sourceUnitId,costUnitId},H))}
   catch(error){if(error.status!==409)throw error}
  }
 }
 return choices;
}
