import {BLACK_METAL_MODES,BLACK_METAL_UTILITY_IDS} from './black-metal-state.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {scaledStatGain,gainPlayerStats} from './stat-gains.mjs';
import {applySharedUnitEffect} from './shared-unit-effects.mjs';
import {beginDeckSearch,eligibleSearchIds} from './deck-search.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';
const fail=(H,msg)=>H.fail(409,msg);
export function blackMetalAbilityView(r,who,id,H){
 const u=r.units[id];if(!u||!BLACK_METAL_MODES[u.cardId])return null;
 const [attack,attacks]=BLACK_METAL_MODES[u.cardId];
 const options=[{effectNumber:1,label:`기본 ATK ${attack} · 공격 기회 총 ${attacks}회`,remaining:effectUsedThisTurn(r,who,id,1)?0:1}];
 if(BLACK_METAL_UTILITY_IDS.includes(u.cardId)){
  const exhausted=u.cardId==='COC-22-004'&&u.blackMetalSoldierUsed||u.cardId==='COC-22-005'&&u.blackMetalGardenerUsed;
  options.push({effectNumber:2,label:({'COC-22-001':'체인지 검색','COC-22-002':'HP 50 회복','COC-22-003':'퓨전업 검색','COC-22-004':'묘지 회수 · 소환 후 1회','COC-22-005':'효과 파괴 보호 · 게임 1회','COC-22-012':'상대 ATK -100','COC-22-013':'몬스터 ATK +50'})[u.cardId]+' · 공격 기회 1회 비용',remaining:exhausted||!H.attackAvailable(u,r.turnNumber)?0:null});
 }
 return options;
}
export function prepareBlackMetalEffect(r,who,body,plan,H){
 const u=r.units[plan.sourceId],effectNumber=body.effectNumber??1;
 if(![1,2].includes(effectNumber)||effectNumber===2&&!BLACK_METAL_UTILITY_IDS.includes(u.cardId))fail(H,'지원하는 블랙 메탈 효과 번호를 선택하세요.');
 plan={...plan,effectNumber};
 if(effectNumber===1){
  if(effectUsedThisTurn(r,who,u.id,1))fail(H,'이 실제 카드의 다회 공격 전환은 이번 턴에 사용했습니다.');
  return plan;
 }
 if(!H.attackAvailable(u,r.turnNumber))fail(H,'비용으로 지불할 공격 기회가 없습니다.');
 if(u.cardId==='COC-22-004'&&u.blackMetalSoldierUsed)fail(H,'솔저는 이번 필드 체류의 회수를 이미 사용했습니다.');
 if(u.cardId==='COC-22-005'&&u.blackMetalGardenerUsed)fail(H,'가드너의 실제 카드 기준 게임 1회를 이미 사용했습니다.');
 if(['COC-22-001','COC-22-003','COC-22-004'].includes(u.cardId)){
  if(!eligibleSearchIds(r,who,u.cardId,H.cards).length)fail(H,'검색/회수할 카드가 없습니다.');
  return {...plan,graveActivation:u.cardId==='COC-22-004'};
 }
 if(u.cardId==='COC-22-002'&&body.target?.type==='player'){
  const player=body.target.player??who;if(![0,1].includes(player))fail(H,'회복할 플레이어를 선택하세요.');
  return {...plan,healPlayer:player};
 }
 const targetId=body.target?.id,t=r.units[targetId],z=t&&H.zone(r,targetId);
 if(z?.zone!=='field')fail(H,'대상 필드 몬스터를 선택하세요.');
 if(u.cardId==='COC-22-002'&&!Number.isFinite(t.hp))fail(H,'회복할 현재 체력이 필요합니다.');
 if(u.cardId==='COC-22-012'&&z.player===who)fail(H,'상대 필드 몬스터만 약화할 수 있습니다.');
 if(u.cardId==='COC-22-005'&&!H.name(r,targetId).startsWith('블랙 메탈'))fail(H,'보호할 블랙 메탈 몬스터를 선택하세요.');
 return {...plan,targetId,targetController:z.player,targetRevision:t.fieldRevision||0};
}
export function payBlackMetalEffect(r,who,plan,H){
 const u=r.units[plan.sourceId];
 markEffectUsed(r,who,u.id,plan.effectNumber);
 if(plan.effectNumber===1)return;
 if(u.attackCountTurn!==r.turnNumber){u.attackCountTurn=r.turnNumber;u.attackCount=0;}
 u.attackCount=(u.attackCount||0)+1;
 if(u.cardId==='COC-22-004')u.blackMetalSoldierUsed=true;
 if(u.cardId==='COC-22-005')u.blackMetalGardenerUsed=true;
 H.log(r,'cost',`${H.name(r,u.id)}: 효과 2 공격 기회 1회 지불 (무효화되어도 반환 없음)`);
}
export function resolveBlackMetalEffect(r,who,plan,H){
 const u=r.units[plan.sourceId],c=plan.cardId;
 if(plan.effectNumber===1){
  const [attack,attacks]=BLACK_METAL_MODES[c];
  u.blackMetalMode={turn:r.turnNumber,amount:attack-(u.baseAtk??Number(H.cards.get(c).atk)),attacks};
  H.log(r,'effect',`${H.name(r,u.id)}: 이 턴 기본 ATK ${attack}, 기본 공격 기회 총 ${attacks}회 (이미 지불한 횟수 유지)`);
  return true;
 }
 if(['COC-22-001','COC-22-003','COC-22-004'].includes(c)){
  beginDeckSearch(r,who,c,H.cards,H,{sourceId:u.id,sourceZone:'field',sourceRevision:plan.sourceRevision});return true;
 }
 if(c==='COC-22-002'){
  if(plan.healPlayer!==undefined)gainPlayerStats(r,plan.healPlayer,{hp:50});
  else applySharedUnitEffect(r,[plan.targetId],H,id=>H.healUnit(r,id,50));
 }else if(c==='COC-22-005')applySharedUnitEffect(r,[plan.targetId],H,(id,target)=>{target.effectDestructionImmune=true;});
 else if(c==='COC-22-012'||c==='COC-22-013'){
  applySharedUnitEffect(r,[plan.targetId],H,(id,target)=>{
   const before=swordActualAttack(r,id,{getZone:H.zone});
   (target.blackMetalStatGrants??=[]).push({sourceId:u.id,amount:c==='COC-22-012'?-100:scaledStatGain(r,{id},50),expiresBeforeTurn:r.turnNumber+(c==='COC-22-012'?2:1)});
   if(c==='COC-22-012'&&before>0&&swordActualAttack(r,id,{getZone:H.zone})===0)H.destroy(r,id,{cause:'lethal',sourceId:u.id});
  });
 }
 H.log(r,'effect',`${H.name(r,u.id)}: 공격 기회 비용 효과 해결`);return true;
}
function event(r,who,u,payload){
 return {key:`black-metal-${r.turnNumber}-${u.id}-${payload.targetId||'end'}`,effectId:'monster-trigger-resolution',owner:who,sourceId:u.id,sourceZone:'field',priority:0,title:`${u.cardId} · 효과 2`,payload:{cardId:u.cardId,eventTurn:r.turnNumber,sourceRevision:u.fieldRevision||0,...payload}};
}
export function recordBlackMetalAttack(r,id,target,H){
 const u=r.units[id],z=u&&H.zone(r,id),t=target?.type==='unit'&&r.units[target.id],tz=t&&H.zone(r,t.id);
 if(z?.zone!=='field'||tz?.zone!=='field')return;
 if(u.cardId==='COC-22-011'){
  if(u.blackMetalAttacked?.turn!==r.turnNumber)u.blackMetalAttacked={turn:r.turnNumber,ids:[]};
  if(!u.blackMetalAttacked.ids.includes(t.id))u.blackMetalAttacked.ids.push(t.id);
 }
 if(u.cardId!=='COC-22-014'||u.effectsNegated)return;
 if(u.blackMetalCounterTargets?.turn!==r.turnNumber)u.blackMetalCounterTargets={turn:r.turnNumber,ids:[]};
 if(u.blackMetalCounterTargets.ids.includes(t.id))return;
 // Each physical Knight reserves once per physical victim per turn, even if
 // its response is negated. Different Knights do not share an activation cap.
 // The field keeps an earned counter after the attacked monster leaves.
 u.blackMetalCounterTargets.ids.push(t.id);
 (r.deferredMonsterTriggers??=[]).push(event(r,z.player,u,{targetId:t.id,counterPlayer:tz.player}));
}
export function blackMetalEndTriggers(r){
 const result=[];
 for(const [who,p] of r.players.entries())for(const id of p.field.filter(Boolean)){
  const u=r.units[id],record=u.blackMetalAttacked;
  if(u.cardId==='COC-22-011'&&!u.effectsNegated&&record?.turn===r.turnNumber&&record.ids.length&&!effectUsedThisTurn(r,who,id,2))result.push(event(r,who,u,{amount:record.ids.length*100}));
 }
 return result;
}
