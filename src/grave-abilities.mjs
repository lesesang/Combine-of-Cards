import {FUSION_UP_ID,requireUnusedEffect,markEffectUsed} from './effect-usage.mjs';
export const GRAVE_ABILITY_IDS=Object.freeze([FUSION_UP_ID]);

// Pure preflight is shared by player actions, UI options and AI decisions.
export function planGraveAbility(r,who,{sourceUnitId,costUnitId},H){
 const p=r.players[who];
 if(r.status!=='active'||r.turn!==who||r.phase!=='MAIN'||r.pendingAttack||r.pendingManual)
  H.fail(409,'자신의 메인 페이즈에만 묘지 효과를 사용할 수 있습니다.');
 if(!p?.grave.includes(sourceUnitId)||r.units[sourceUnitId]?.cardId!==FUSION_UP_ID)
  H.fail(409,'자신의 묘지에 있는 블랙 메탈 퓨전 업을 선택해야 합니다.');
 requireUnusedEffect(r,who,FUSION_UP_ID,2);
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
 markEffectUsed(r,who,FUSION_UP_ID,2);
 H.move(r,sourceUnitId,'hand',who);
 H.log(r,'effect',`${r.players[who].label}: ${H.name(r,costUnitId)}의 공격 기회 1회를 소모하고 블랙 메탈 퓨전 업을 묘지에서 패로 회수`);
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
