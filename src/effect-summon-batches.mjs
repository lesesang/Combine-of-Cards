import {cardUseForbidden,isRideMachine} from './card-game-history.mjs';

// Chosen physical cards only. No fabricated copies, no access to exile/extra.
export const SUMMON_BATCH_RULES=Object.freeze({
 'COC-08-011':{zones:['grave'],count:3,noAttack:true,family:'tsukumogami',destroyed:true},
 'COC-20-010':{zones:['hand','deck','grave'],count:2,family:'burning',leftField:true},
 'COC-23-010':{zones:['hand','deck','grave'],count:3,family:'ride'},
 'COC-24-007':{zones:['grave'],count:3,family:'monster',destroyed:true}
});
export function batchSummonChoices(r,who,cardId,H){
 const rule=SUMMON_BATCH_RULES[cardId];if(!rule)return [];
 return rule.zones.flatMap(zone=>r.players[who][zone].map(id=>({id,zone}))).filter(({id})=>{
  const u=r.units[id],c=u&&H.cards.get(u.cardId);
  if(!c||u.owner!==who||!c.type.includes('몬스터')||cardUseForbidden(r,who,c))return false;
  if(rule.destroyed&&!u.wasFieldDestroyed)return false;
  if(rule.leftField&&!u.hasLeftField)return false;
  return rule.family==='monster'||rule.family==='tsukumogami'&&c.name.includes('츠쿠모가미')||rule.family==='burning'&&/버닝\s*데몬즈/.test(c.name)||rule.family==='ride'&&isRideMachine(c);
 }).sort((a,b)=>r.units[a.id].cardId.localeCompare(r.units[b.id].cardId)||a.id.localeCompare(b.id));
}
export function batchSummonCount(r,who,cardId,H){
 return Math.min(SUMMON_BATCH_RULES[cardId]?.count||0,r.players[who].field.filter(id=>id===null).length,batchSummonChoices(r,who,cardId,H).length);
}
export function beginSummonBatch(r,who,cardId,H){
 if(!batchSummonCount(r,who,cardId,H)){H.log(r,'effect','효과 소환: 후보 또는 빈 필드가 없어 종료');return false;}
 if(r.pendingSummonBatch)throw new Error('summon batch already pending');
 r.pendingSummonBatch={who,cardId,stage:'choice',queue:[],turnNumber:r.turnNumber};return true;
}
export function summonBatchView(r,viewer,H){
 const p=r.pendingSummonBatch;if(!p)return null;
 return {who:p.who,cardId:p.cardId,name:H.cards.get(p.cardId)?.name,stage:p.stage,
  ...(viewer===p.who&&p.stage==='choice'?{count:batchSummonCount(r,p.who,p.cardId,H),choices:batchSummonChoices(r,p.who,p.cardId,H).map(c=>({...c,card:H.cards.get(r.units[c.id].cardId)}))}:{})};
}
export function chooseSummonBatch(r,who,ids,H){
 const p=r.pendingSummonBatch;
 if(r.status!=='active'||p?.stage!=='choice'||p.who!==who)H.fail(409,'효과 소환 선택권자가 아닙니다.');
 const choices=batchSummonChoices(r,who,p.cardId,H),count=batchSummonCount(r,who,p.cardId,H);
 if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count||ids.some(id=>!choices.some(c=>c.id===id)))H.fail(409,`서로 다른 소환 후보 ${count}장을 선택하세요.`);
 p.queue=ids.map(id=>choices.find(c=>c.id===id));p.stage='summoning';
 if(['COC-20-010','COC-23-010'].includes(p.cardId)&&p.queue.some(c=>c.zone==='grave'))H.graveActivation?.(r,{cardId:p.cardId});
}
export function resumeSummonBatch(r,H){
 const p=r.pendingSummonBatch;if(!p||p.stage==='choice')return;
 if(r.status!=='active'){r.pendingSummonBatch=null;return;}
 if(r.pendingExtraSummon||r.pendingAbility||r.pendingSpell||r.pendingTriggerOrder||r.pendingMonsterTriggers||r.pendingTriggerTargetChoice||r.pendingInfinityChoice||r.pendingDeckSearch||r.pendingRecruitChoice||r.pendingElementalChoice||r.effectStack?.length)return;
 while(p.queue.length){
  const next=p.queue.shift();
  if(!r.players[p.who].field.includes(null)){p.queue=[];break;}
  if(!batchSummonChoices(r,p.who,p.cardId,H).some(c=>c.id===next.id&&c.zone===next.zone)){
   H.log(r,'summon','효과 소환 후보의 영역 또는 사용 가능 상태 변경으로 건너뜀');continue;
  }
  H.queueEffectSummon(r,{who:p.who,extraUnitId:next.id,originZone:next.zone,
   batchCardId:p.cardId,noAttack:!!SUMMON_BATCH_RULES[p.cardId].noAttack,
   recipe:{method:'batch',materials:[]},turnNumber:r.turnNumber});return;
 }
 r.pendingSummonBatch=null;
}
