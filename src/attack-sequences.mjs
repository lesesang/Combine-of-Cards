// An effect attack uses the ordinary battle resolver but does not spend a
// normal attack opportunity. Targets and field stays are saved, never closures.
const blocked=r=>r.suspendedResponses?.length||r.deferredMonsterTriggers?.length||r.destroyHealGroups?.length||r.effectStack?.length||
 ['pendingAttack','pendingManual','pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers','pendingTriggerOrder','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingSummonBatch','pendingRecruitChoice','pendingElementalChoice'].some(k=>r[k]);
export function beginTempering(r,who,body,H){
 const id=r.players[who].integration,u=id&&r.units[id];
 if(!u||id!==body.temperingSourceId||(u.integrationRevision||0)!==body.temperingRevision){H.log(r,'effect','뜨임질: 선언한 일체화 이탈/재진입으로 불발');return;}
 (u.temperingBonuses??=[]).push({turn:r.turnNumber,amount:100});
 if(r.pendingAttackSequence)throw new Error('effect attack sequence already pending');
 r.pendingAttackSequence={who,sourceId:id,sourceRevision:u.integrationRevision||0,turnNumber:r.turnNumber,stage:'waiting',
  remaining:[...r.players[1-who].field.filter(Boolean).map(id=>({type:'unit',id,revision:r.units[id].fieldRevision||0})),{type:'player',player:1-who}]};
 H.log(r,'effect','뜨임질: 이번 턴 공격력 +100, 현재 적 각각 1회 효과 공격 예약');
}
export function sequenceSourceValid(r,p,H){
 const u=r.units[p.sourceId],z=u&&H.zone(r,p.sourceId),player=r.players[p.who];
 return r.status==='active'&&r.turn===p.who&&r.turnNumber===p.turnNumber&&z?.zone==='integration'&&z.player===p.who&&
  (u.integrationRevision||0)===p.sourceRevision&&!u.frozen&&!u.cannotAttack&&u.cannotAttackUntil!==r.turnNumber&&
  !((player.noAttackUntil||0)>0&&player.noAttackUntil>=player.turnsTaken);
}
export function sequenceChoices(r,H){
 const p=r.pendingAttackSequence;if(!p||!sequenceSourceValid(r,p,H))return [];
 return p.remaining.filter(t=>{
  if(t.type==='unit'){
   const u=r.units[t.id],z=u&&H.zone(r,t.id);
   if(z?.zone!=='field'||z.player!==1-p.who||(u.fieldRevision||0)!==t.revision)return false;
  }
  if(t.type==='player'&&(r.players[p.who].noDirectAttackUntil||0)>0&&r.players[p.who].noDirectAttackUntil>=r.players[p.who].turnsTaken)return false;
  // Preserve the confirmed forced-target rule: surviving aggro can prevent
  // attacks on other enemies; do not silently redirect/repeat a spent target.
  try{H.validateAggro(r,p.who,t);return true;}catch(e){if(e.status===409)return false;throw e;}
 });
}
export function sequenceView(r,viewer,H){
 const p=r.pendingAttackSequence;if(!p)return null;
 return {who:p.who,stage:p.stage,remaining:p.remaining.length,
  ...(p.stage==='choice'&&viewer===p.who?{choices:sequenceChoices(r,H).map(t=>({...t,name:t.type==='player'?r.players[t.player].label:H.name(r,t.id)}))}:{})};
}
export function resumeAttackSequence(r,H){
 const p=r.pendingAttackSequence;if(!p)return;
 if(r.status!=='active'){r.pendingAttackSequence=null;return;}
 if(blocked(r))return;
 if(!sequenceChoices(r,H).length){r.pendingAttackSequence=null;H.log(r,'attack','뜨임질: 남은 합법 공격 대상 또는 공격자 소실로 연속 공격 종료');return;}
 p.stage='choice';
}
export function chooseSequenceTarget(r,who,target,H){
 const p=r.pendingAttackSequence;
 if(!p||p.who!==who||p.stage!=='choice'||blocked(r))H.fail(409,'지금은 전체 공격의 다음 대상을 선택할 수 없습니다.');
 const choices=sequenceChoices(r,H);
 if(!choices.length){r.pendingAttackSequence=null;H.log(r,'attack','뜨임질: 남은 합법 대상 소실로 종료');return;}
 const chosen=choices.find(t=>t.type===target?.type&&(t.type==='player'?target.player===t.player:target.id===t.id));
 if(!chosen)H.fail(409,'남아 있는 합법 공격 대상을 선택하세요.');
 p.remaining=p.remaining.filter(t=>t!==chosen);p.stage='waiting';
 H.openEffectAttack(r,p,chosen);
}
export function expireTempering(r){
 for(const u of Object.values(r.units))if(u.temperingBonuses)u.temperingBonuses=u.temperingBonuses.filter(b=>b.turn!==r.turnNumber);
}
