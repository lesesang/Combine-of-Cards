import {cartoonSummonBeforeParent} from './cartoon-land.mjs';
import {beginAutomaticTriggerOrder} from './effect-runtime.mjs';
import {cardUseForbidden} from './card-game-history.mjs';
import {DRAGON_CARDS,onTokenCreation,declareGoldCast,settleTokenEvent} from './dragon-gold.mjs';

const ROOTS=['pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers'];
const CHOICES=['pendingTriggerOrder','pendingTriggerTargetChoice','pendingInfinityChoice','pendingDeckSearch','pendingElementalChoice','pendingRecruitChoice','pendingManual'];
export const hasTokenWork=r=>!!(r.tokenPipeline||r.tokenWorkQueue?.length||r.goldCastQueue?.length);

export function queueTokenGeneration(r,who,name,atk,hp){
 if(r.status!=='active'||!r.players[who].field.includes(null))return null;
 const id=`token-work-${r.tokenWorkSequence=(r.tokenWorkSequence||0)+1}`;
 (r.tokenWorkQueue??=[]).push({kind:'token',id,who,name,atk,hp});
 return id;
}
export function clearTokenWork(r){
 for(const u of Object.values(r.units||{}))if(u.tokenPending)delete r.units[u.id];
 r.tokenPipeline=null;r.tokenWorkQueue=[];r.goldCastQueue=[];
}
// Paid token costs can create a dragon event before the caller declares its
// own response. Preserve that parent, including lower automatic entries.
export function beginTokenWork(r){
 if(r.status!=='active'){clearTokenWork(r);return;}
 if(r.tokenPipeline||!hasTokenWork(r)||cartoonSummonBeforeParent(r)||CHOICES.some(k=>r[k]))return;
 const frame={tokenPipeline:true,effectStack:r.effectStack||[]};
 if(ROOTS.some(k=>r[k])||frame.effectStack.length){
  r.suspendedResponses??=[];
  if(r.suspendedResponses.length>=32)throw new Error('nested response safety budget reached');
  for(const key of ROOTS){frame[key]=r[key]||null;r[key]=null;}
  r.effectStack=[];r.suspendedResponses.push(frame);
 }
 r.tokenPipeline={active:true};
}
function fafnirEligible(r,c,H){
 const u=r.units[c.extraUnitId],z=u&&H.zone(r,u.id);
 return u?.cardId===DRAGON_CARDS.fafnir&&!u.effectsNegated&&z?.zone===c.originZone&&z.player===c.who&&
  (u.zoneRevision||0)===c.originRevision&&r.players[c.who].field.includes(null)&&!cardUseForbidden(r,c.who,H.cards.get(u.cardId));
}
export function tokenOrderPending(r){
 return !!r.tokenPipeline&&(r.tokenPipeline.goldOrdering||r.tokenWorkQueue?.[0]?.kind==='event'&&r.tokenWorkQueue[0].stage==='ordering');
}
export function resumeTokenWork(r,H){
 if(r.status!=='active'){clearTokenWork(r);return;}
 beginTokenWork(r);
 if(cartoonSummonBeforeParent(r))return;
 if(!r.tokenPipeline||CHOICES.some(k=>r[k])||ROOTS.some(k=>r[k])||r.deferredMonsterTriggers?.length||r.destroyHealGroups?.length)return;
 // Ordinary grave-trigger frames above our parent must resume first.
 if(r.suspendedResponses?.length&&!r.suspendedResponses.at(-1).tokenPipeline)return;
 if(r.tokenPipeline.goldOrdering){
  if(!r.effectStack?.length||r.effectStack.some(e=>e.effectId!=='dragon-gold-order'))throw new Error('invalid Gold trigger order');
  r.tokenPipeline.goldQueue=r.effectStack.splice(0).map(e=>e.payload.job);r.tokenPipeline.goldOrdering=false;
 }else if(tokenOrderPending(r)){
  const event=r.tokenWorkQueue[0];
  if(!r.effectStack?.length||r.effectStack.some(e=>e.effectId!=='token-fafnir-order'||e.payload.eventId!==event.id))throw new Error('invalid token trigger order');
  event.queue=r.effectStack.splice(0).map(e=>e.payload.candidate);event.stage='summons';
 }
 if(r.effectStack?.length)return;
 while(r.status==='active'){
  // Generated or recovered Gold finishes its initial spell response before
  // the event may credit treasure or the next token may occupy a slot.
  if(r.tokenPipeline.goldQueue?.length){
   if(declareGoldCast(r,r.tokenPipeline.goldQueue.pop(),H))return;
   continue;
  }
  if(r.goldCastQueue?.length){
   const jobs=r.goldCastQueue.splice(0).filter(j=>{
    const u=r.units[j.sourceId],z=u&&H.zone(r,u.id);
    return u?.cardId===DRAGON_CARDS.gold&&z?.zone==='hand'&&z.player===j.who&&(u.zoneRevision||0)===j.sourceRevision&&!u.dragonGoldBinding?.ended;
   });
   if(jobs.length>1){
    r.tokenPipeline.goldOrdering=true;
    beginAutomaticTriggerOrder(r,jobs.map((job,i)=>({key:`gold-cast-${job.sourceId}-${job.sourceRevision}`,effectId:'dragon-gold-order',owner:job.who,
     sourceId:job.sourceId,sourceZone:'hand',exception:'independent',priority:0,title:`라인의 황금 자동 사용 ${i+1}`,payload:{job}})),r.turn);
    if(r.pendingTriggerOrder)return;
    r.tokenPipeline.goldQueue=r.effectStack.splice(0).map(e=>e.payload.job);r.tokenPipeline.goldOrdering=false;
   }else r.tokenPipeline.goldQueue=jobs;
   continue;
  }
  const work=r.tokenWorkQueue?.[0];
  if(!work){r.tokenPipeline=null;return;}
  if(work.kind==='token'){
   if(!r.players[work.who].field.includes(null)){
    r.tokenWorkQueue.shift();H.log(r,'token','빈 필드가 없어 남은 토큰 1장 생성 불가');continue;
   }
   const id=H.prepareToken(r,work);
   H.queueEffectSummon(r,{who:work.who,extraUnitId:id,tokenWorkId:work.id,recipe:{method:'token',materials:[]},turnNumber:r.turnNumber});return;
  }
  if(work.stage==='order'){
   const eligible=work.candidates.filter(c=>fafnirEligible(r,c,H));
   work.stage='summons';work.queue=[];
   if(eligible.length){
    work.stage='ordering';
    beginAutomaticTriggerOrder(r,eligible.map((candidate,i)=>({key:`${work.id}-${candidate.extraUnitId}`,effectId:'token-fafnir-order',owner:candidate.who,
     sourceId:candidate.extraUnitId,sourceZone:candidate.originZone,exception:'independent',priority:0,
     title:`파프니르 자동 소환 ${i+1} (${candidate.originZone==='hand'?'패':'덱'})`,payload:{eventId:work.id,candidate}})),r.turn);
    if(r.pendingTriggerOrder)return;
    work.queue=r.effectStack.splice(0).map(e=>e.payload.candidate);work.stage='summons';
   }
  }
  while(work.queue.length){
   const candidate=work.queue.pop();if(!fafnirEligible(r,candidate,H))continue;
   H.queueEffectSummon(r,{...candidate,tokenEventId:work.id,recipe:{method:'fafnir-auto',materials:[]},turnNumber:r.turnNumber});return;
  }
  // Remove before delivering the event, so movement/reconnection cannot
  // accidentally credit this same work item twice.
  r.tokenWorkQueue.shift();settleTokenEvent(r,work,H);
 }
}
function removeGeneration(r,p){
 const queue=r.tokenWorkQueue||[],index=queue.findIndex(j=>j.kind==='token'&&j.id===p.tokenWorkId);
 if(index>=0)queue.splice(index,1);
}
export function negateTokenSummon(r,p,H){
 if(r.units[p.extraUnitId]?.tokenPending)delete r.units[p.extraUnitId];
 removeGeneration(r,p);
 H.log(r,'token','토큰 소환 무효: 필드 진입·생성 사건 없음, 지불 비용 반환 없음');
}
export function finishTokenSummon(r,p,H){
 const u=r.units[p.extraUnitId];
 const work=(r.tokenWorkQueue||[]).find(j=>j.kind==='token'&&j.id===p.tokenWorkId);
 if(!work||!u?.tokenPending||u.owner!==p.who||!r.players[p.who].field.includes(null)){
  negateTokenSummon(r,p,H);return;
 }
 removeGeneration(r,p);
 delete u.tokenPending;H.move(r,u.id,'field',p.who);
 H.log(r,'token',`${r.players[p.who].label}: ${u.tokenCard.name} 토큰 소환 성공`);
 onTokenCreation(r,u.id,p.who,H);
}
export function finishFafnirSummon(r,p,H){
 if(!fafnirEligible(r,p,H)){H.log(r,'summon','파프니르 자동 소환 불발: 원래 영역·체류·빈 자리 변경');return;}
 H.move(r,p.extraUnitId,'field',p.who);H.onSummon(r,p.who,p.extraUnitId);
 H.log(r,'summon',`${r.players[p.who].label}: 토큰 사건으로 파프니르 자동 소환 성공`);
}
