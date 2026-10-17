import {scaledStatGain} from './stat-gains.mjs';
import {swordActualAttack,swordMultiplierCount} from './life-eating-sword.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {applySharedUnitEffect,hurtSharedUnits,destroySharedUnits} from './shared-unit-effects.mjs';
export const REMAINING_FIELD_IDS=Object.freeze(['COC-06-006','COC-12-015','COC-20-002','COC-27-011','COC-27-014']);
const invalid=(H,message)=>H.fail(409,message);
export function immortalCostChoices(r,who,H){
 if(!r.players[who]?.field.some(id=>id&&r.units[id].cardId==='COC-12-015'&&!r.units[id].effectsNegated))return [];
 return r.players[who].deck.map(id=>({id,card:H.cards.get(r.units[id].cardId)})).sort((a,b)=>a.card.id.localeCompare(b.card.id)||a.id.localeCompare(b.id));
}
export function prepareRemainingField(r,who,body,plan,H){
 const c=plan.cardId,p=r.players[who];
 if(c==='COC-20-002'){
  if(!Number.isInteger(body.attackGain)||body.attackGain<1||body.attackGain>300)invalid(H,'기본 강화량을 1~300 중 정수로 선택하세요.');
  if(swordActualAttack(r,plan.sourceId,{getZone:H.zone})>=300)invalid(H,'현재 실제 공격력이 300 미만이어야 합니다.');
  return {...plan,attackGain:body.attackGain};
 }
 if(c==='COC-27-011'&&p.field.some(id=>id&&id!==plan.sourceId))invalid(H,'자기 필드에 이 카드만 있어야 합니다.');
 if(c==='COC-27-014'){
  if(!Number.isInteger(body.discardCount)||body.discardCount<1||body.discardCount>Math.min(3,p.deck.length))invalid(H,'덱 위에서 보낼 매수를 1~3장 중 선택하세요.');
  plan={...plan,discardCount:body.discardCount};
  if(body.target?.type==='player'){
   const player=body.target.player??1-who;if(![0,1].includes(player))invalid(H,'피해를 받을 플레이어를 선택하세요.');
   return {...plan,damagePlayer:player};
  }
 }
 const targetId=body.target?.id,u=r.units[targetId],z=u&&H.zone(r,targetId);
 if(z?.zone!=='field')invalid(H,'필드 몬스터를 지정하세요.');
 if(c==='COC-27-011'&&z.player===who)invalid(H,'상대 필드 몬스터만 파괴할 수 있습니다.');
 if(c==='COC-12-015'){
  if(z.player!==who)invalid(H,'보호할 자기 필드 몬스터를 선택하세요.');
  if(!p.deck.includes(body.costDeckId))invalid(H,'비용으로 묘지에 보낼 자기 덱 카드 1장을 선택하세요.');
  plan={...plan,costDeckId:body.costDeckId};
 }
 return {...plan,targetId,targetController:z.player,targetRevision:u.fieldRevision||0};
}
export function payRemainingField(r,who,plan,H){
 if(plan.cardId==='COC-12-015')H.move(r,plan.costDeckId,'grave',r.units[plan.costDeckId].owner);
 // Powerarmored's declared mill is its cost; every actually paid top card is
 // recorded before responses, even when the subsequent damage is negated.
 if(plan.cardId==='COC-27-014')H.mill(r,who,plan.discardCount);
}
export function resolveRemainingField(r,who,plan,H){
 const c=plan.cardId,u=r.units[plan.sourceId],p=r.players[who],t=plan.targetId;
 if(c==='COC-06-006'){
  r.linkedEffectSequence=(r.linkedEffectSequence||0)+1;
  u.copperLink={id:t,residence:r.units[t].linkedResidence||0,sourceResidence:u.linkedResidence||0,sequence:r.linkedEffectSequence};
  H.log(r,'effect','쿠퍼 타이거: 지정 몬스터의 실제 공격력 절반을 현재 조종자의 일체화 공격력에 지속 적용');
 }else if(c==='COC-12-015'){
  // One chosen protection per physical Immortal; a later successful selection
  // replaces its earlier grant. Other Immortals' grants remain independent.
  for(const target of Object.values(r.units))if(target.immortalProtection)target.immortalProtection=target.immortalProtection.filter(g=>g.sourceId!==u.id);
  applySharedUnitEffect(r,[t],H,(id,target)=>{
   target.immortalProtection??=[];
   if(!target.immortalProtection.some(g=>g.sourceId===u.id&&g.residence===(u.linkedResidence||0)&&g.targetResidence===(target.linkedResidence||0)))target.immortalProtection.push({sourceId:u.id,residence:u.linkedResidence||0,targetResidence:target.linkedResidence||0});
  });
  H.log(r,'effect','버디 더 이모탈: 소스 체류·유효 상태에 연결된 전투 파괴 방지 부여');
 }else if(c==='COC-20-002'){
  const before=swordActualAttack(r,u.id,{getZone:H.zone}),multiplier=2**Math.min(52,swordMultiplierCount(r,u.id,{getZone:H.zone}));
  const amount=Math.min(scaledStatGain(r,{id:u.id},plan.attackGain),Math.max(0,Math.floor((300-before)/multiplier)));
  if(!amount){H.log(r,'effect','버닝 비스트: 현재 공격력/배율 변경으로 올릴 수 있는 수치 없음');return true;}
  u.atk+=amount;const increase=swordActualAttack(r,u.id,{getZone:H.zone})-before;
  damagePlayer(r,who,Math.ceil(increase/2));
  H.log(r,'effect',`버닝 비스트: 실제 ATK +${increase}, 자기 플레이어 피해 ${Math.ceil(increase/2)}`);H.outcome(r);
 }else if(c==='COC-27-011'){
  if(p.field.some(id=>id&&id!==u.id)){H.log(r,'effect','드레고닉 파이터: 다른 자기 필드 카드가 생겨 불발');return false;}
  destroySharedUnits(r,[t],H,{sourceId:u.id});
 }else if(c==='COC-27-014'){
  const amount=plan.discardCount*50;
  if(plan.damagePlayer!==undefined)damagePlayer(r,plan.damagePlayer,amount);
  else hurtSharedUnits(r,[t],amount,H,{sourceId:u.id});
  H.log(r,'effect',`파워아머드 파이터: 지불한 덱 위 ${plan.discardCount}장 × 50 = ${amount} 피해`);H.outcome(r);
 }
 return true;
}
export function recordEffectDraw(r,who){
 if(r.status!=='active')return;
 for(const id of r.players[1-who].field.filter(Boolean)){
  const u=r.units[id];if(u.cardId!=='COC-07-005'||u.effectsNegated)continue;
  const pending=r.deferredMonsterTriggers??=[];
  const existing=pending.find(e=>e.payload.drawEvent&&e.sourceId===id&&e.payload.sourceRevision===(u.fieldRevision||0)&&e.payload.drawPlayer===who&&e.payload.actionVersion===(r.version??0));
  if(existing){existing.payload.count++;continue;}
  r.drawEventSequence=(r.drawEventSequence||0)+1;
  pending.push({key:`effect-draw-${r.drawEventSequence}-${id}`,effectId:'monster-trigger-resolution',owner:1-who,sourceId:id,sourceZone:'field',priority:0,
   payload:{cardId:u.cardId,eventTurn:r.turnNumber,sourceRevision:u.fieldRevision||0,drawEvent:true,drawPlayer:who,actionVersion:r.version??0,count:1}});
 }
}
