import {recordCopyHistory} from './copy-history.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {continuousApplies} from './shared-state.mjs';

export const CARTOON_IDS=Object.freeze({demonDragon:'COC-05-001',land:'COC-05-002',guide:'COC-05-008'});
export const hasCartoonLand=(r,who)=>r.players[who].field.some(id=>id&&r.units[id]?.cardId===CARTOON_IDS.land);
export const hasCartoonWork=r=>!!(r.cartoonDeathEvents?.length||r.cartoonSummonQueue?.length);
export function clearCartoonWork(r){r.cartoonDeathEvents=[];r.cartoonSummonQueue=[];}
export function isCartoonField(r,id,H){
 const u=r.units[id],z=u&&H.zone(r,id);
 return z?.zone==='field'&&!!(u.treatedAsToon||H.name(r,id).includes('카툰')||
  r.players.some(p=>p.field.some(uid=>uid&&r.units[uid]?.cardId===CARTOON_IDS.land&&!r.units[uid].effectsNegated)&&continuousApplies(r,id,p.field.filter(Boolean))));
}
// Called only after an actual field destruction. No stack execution, summons,
// or recursive restoration is allowed in this hook (including paid costs).
export function onCartoonLandDestroyed(r,landId,controller,H){
 const land=r.units[landId],z=land&&H.zone(r,landId);if(land?.cardId!==CARTOON_IDS.land||z?.zone!=='grave')return;
 (r.cartoonDeathEvents??=[]).push({landId,controller,graveOwner:z.player,graveRevision:land.zoneRevision||0,
  key:`cartoon-death-${landId}-${land.zoneRevision||0}`,
  dragons:r.players[controller].field.filter(id=>id&&r.units[id]?.cardId===CARTOON_IDS.demonDragon)
   .map(id=>({id,revision:r.units[id].fieldRevision||0})),
  guides:r.players[controller].deck.filter(id=>r.units[id]?.cardId===CARTOON_IDS.guide).sort()
   .map(id=>({id,revision:r.units[id].zoneRevision||0}))});
}
export function enforceCartoonConditions(r,H){
 if(r.status!=='active')return;
 // This is a printed maintenance condition, not an activated destruction
 // effect. Negation or destruction immunity does not supply the missing Land.
 for(const [who,p] of r.players.entries())if(!hasCartoonLand(r,who))for(const id of [...p.field]){
  if(id&&r.units[id]?.cardId===CARTOON_IDS.demonDragon){
   H.destroy(r,id,{cause:'condition'});H.log(r,'effect','카툰 데몬즈 드래곤: 자기 필드에 카툰 랜드가 없어 유지 조건으로 파괴');
  }
 }
}
export function resumeCartoonDeaths(r,H){
 if(r.status!=='active'){clearCartoonWork(r);return;}
 while(r.cartoonDeathEvents?.length){
  const event=r.cartoonDeathEvents.shift(),who=event.controller,p=r.players[who];
  // Fixed confirmed order: the dragons from that destroyed Land's side die
  // before Guide is even used, including when another Land still exists.
  for(const d of event.dragons){
   const u=r.units[d.id],z=u&&H.zone(r,d.id);
   if(u?.cardId===CARTOON_IDS.demonDragon&&z?.zone==='field'&&z.player===who&&(u.fieldRevision||0)===d.revision){
    H.destroy(r,d.id,{cause:'condition'});H.log(r,'effect','카툰 랜드 파괴 연쇄: 카툰 데몬즈 드래곤 파괴 먼저 처리');
   }
  }
  if(p.turnsTaken>0&&(p.spellForbiddenUntil||0)>=p.turnsTaken)continue;
  const candidate=event.guides.find(g=>r.units[g.id]?.cardId===CARTOON_IDS.guide&&p.deck.includes(g.id)&&
   (r.units[g.id].zoneRevision||0)===g.revision&&!effectUsedThisTurn(r,who,g.id,1));
  if(!candidate)continue;
  // One physical Guide per Land death. Stable UID order does not reveal or
  // reshuffle deck positions; the cost and once-per-card use are paid now.
  const id=candidate.id;markEffectUsed(r,who,id,1);H.move(r,id,'grave',r.units[id].owner);H.recordUse?.(r,who,id);
  recordCopyHistory(r,'play',{who});p.roundPlays=(p.roundPlays||0)+1;p.spellsThisTurn=(p.spellsThisTurn||0)+1;
  (r.deferredMonsterTriggers??=[]).push({key:event.key,effectId:'monster-trigger-resolution',owner:who,sourceId:id,sourceZone:'grave',
   exception:'destroy-trigger',priority:0,title:'카툰 월드 가이드 · 랜드 복구',
   payload:{cardId:CARTOON_IDS.guide,eventTurn:r.turnNumber,sourceRevision:r.units[id].zoneRevision||0,cartoonEvent:event.key,
    landId:event.landId,landOwner:event.graveOwner,landRevision:event.graveRevision}});
  H.log(r,'effect','카툰 월드 가이드: 덱에서 공개하여 사용, 주문 대응 대기');
 }
 enforceCartoonConditions(r,H);
}
export function recordCartoonKill(r,{sourceId,victimId,victimController,victimType,cause,victimAttack,victimRevision},H){
 const u=r.units[sourceId],z=u&&H.zone(r,sourceId);
 if(u?.cardId!==CARTOON_IDS.demonDragon||u.effectsNegated||z?.zone!=='field'||z.player===victimController||
  cause==='cost'||cause==='condition'||sourceId===victimId||!victimType?.includes('몬스터'))return;
 const key=`cartoon-kill-${sourceId}-${victimId}-${victimRevision}`;
 if((r.deferredMonsterTriggers||[]).some(e=>e.key===key))return;
 (r.deferredMonsterTriggers??=[]).push({key,effectId:'monster-trigger-resolution',owner:z.player,sourceId,sourceZone:'field',priority:0,
  payload:{cardId:CARTOON_IDS.demonDragon,eventTurn:r.turnNumber,sourceRevision:u.fieldRevision||0,amount:Math.floor(Math.max(0,victimAttack||0)/2)}});
}
export function queueCartoonLandSummon(r,who,id,H,hp){
 const u=r.units[id],z=u&&H.zone(r,id);if(u?.cardId!==CARTOON_IDS.land||z?.zone!=='grave')return;
 (r.cartoonSummonQueue??=[]).push({who,extraUnitId:id,originPlayer:z.player,originRevision:u.zoneRevision||0,landHp:hp,
  responseDepth:r.suspendedResponses?.length||0,recipe:{method:'cartoon-land',materials:[]},turnNumber:r.turnNumber});
}
export function resolveCartoonTrigger(r,e,H){
 const p=e.payload,u=r.units[e.sourceId],z=u&&H.zone(r,e.sourceId);
 if(p.cardId===CARTOON_IDS.demonDragon){
  if(u?.cardId===p.cardId&&!u.effectsNegated&&z?.zone==='field'&&z.player===e.owner&&(u.fieldRevision||0)===p.sourceRevision){
   damagePlayer(r,1-e.owner,p.amount);H.log(r,'effect',`카툰 데몬즈 드래곤: 파괴 직전 실제 공격력의 절반 ${p.amount} 피해`);H.outcome(r);
  }
  return true;
 }
 if(p.cardId!==CARTOON_IDS.guide)return false;
 const land=r.units[p.landId],lz=land&&H.zone(r,p.landId);
 if(u?.cardId!==p.cardId||z?.zone!=='grave'||z.player!==u.owner||(u.zoneRevision||0)!==p.sourceRevision||
  land?.cardId!==CARTOON_IDS.land||lz?.zone!=='grave'||lz.player!==p.landOwner||(land.zoneRevision||0)!==p.landRevision){
  H.log(r,'effect','카툰 월드 가이드: 사용 원본/파괴된 랜드의 묘지 이탈·재진입으로 복구 불발');return true;
 }
 queueCartoonLandSummon(r,e.owner,p.landId,H,50);return true;
}
function landSummonEligible(r,p,H){
 const u=r.units[p.extraUnitId],z=u&&H.zone(r,u.id);
 return u?.cardId===CARTOON_IDS.land&&z?.zone==='grave'&&z.player===p.originPlayer&&
  (u.zoneRevision||0)===p.originRevision&&r.players[p.who].field.includes(null);
}
export function cartoonSummonBeforeParent(r){
 const depth=r.suspendedResponses?.length||0;
 return (r.cartoonSummonQueue||[]).some(p=>p.responseDepth>=depth);
}
// A Guide's raw summon is a child of that resolved spell. Hold lower
// automatic responses until that summon completes, as for token children.
export function beginCartoonSummons(r){
 if(r.status!=='active'||r.pendingExtraSummon?.recipe.method==='cartoon-land'||!cartoonSummonBeforeParent(r)||
  ['pendingTriggerOrder','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingRecruitChoice','pendingElementalChoice','pendingManual'].some(k=>r[k]))return;
 const keys=['pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers'];
 if(!keys.some(k=>r[k])&&!r.effectStack?.length)return;
 const depth=r.suspendedResponses?.length||0;
 if(depth>=32)throw new Error('nested response safety budget reached');
 const frame={effectStack:r.effectStack||[]};
 for(const k of keys){frame[k]=r[k]||null;r[k]=null;}
 r.effectStack=[];(r.suspendedResponses??=[]).push(frame);
 for(const p of r.cartoonSummonQueue)if(p.responseDepth>=depth)p.responseDepth++;
}
export function resumeCartoonSummons(r,H){
 if(r.status!=='active'){clearCartoonWork(r);return;}
 if(r.effectStack?.length||r.deferredMonsterTriggers?.length||r.destroyHealGroups?.length||
  ['pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers','pendingTriggerOrder','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingRecruitChoice','pendingElementalChoice','pendingManual'].some(k=>r[k]))return;
 const depth=r.suspendedResponses?.length||0;
 let i;
 while((i=(r.cartoonSummonQueue||[]).findIndex(p=>p.responseDepth>=depth))>=0){
  const p=r.cartoonSummonQueue.splice(i,1)[0];
  if(!landSummonEligible(r,p,H)){H.log(r,'summon','카툰 랜드: 원래 묘지 체류 또는 빈 필드 소실로 소환 불발');continue;}
  H.queueEffectSummon(r,p);return;
 }
}
export function finishCartoonLandSummon(r,p,H){
 if(!landSummonEligible(r,p,H)){H.log(r,'summon','카툰 랜드: 소환 대응 중 대상/빈 칸 소실로 불발');return;}
 const u=r.units[p.extraUnitId];
 Object.assign(u,{atk:0,baseAtk:0,hp:p.landHp,cannotAttack:true});H.move(r,u.id,'field',p.who);
 // Ruling fixes current HP at 50 (initial use 1), not a healing operation.
 // Establish continuous layers first, then set the stated current value.
 u.hp=p.landHp;H.onSummon(r,p.who,u.id);
 H.log(r,'summon',`카툰 랜드: 현재 체력 ${p.landHp}으로 소환 완료`);H.outcome(r);return u.id;
}
