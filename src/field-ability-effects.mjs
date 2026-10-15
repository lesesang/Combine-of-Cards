import {balanceValues as B} from './balance-values.mjs';
import {ELEMENTAL_MAGICIAN_IDS} from './effect-usage.mjs';
import {isElemental,prepareElemental,beginElementalChoice} from './elemental-replacement.mjs';
import {requireUnusedEffect,markEffectUsed} from './effect-usage.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';

// Audited activated effects only. Monster triggers and the other six legacy
// handlers are not implicitly enrolled in this response window.
export const FIELD_EFFECT_RULES=Object.freeze({
 ...Object.fromEntries(ELEMENTAL_MAGICIAN_IDS.map(id=>[id,{zone:'field',sourceType:'monster',oncePerTurn:true,selfCost:true}])),
 'COC-03-002':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-05-004':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-12-013':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-13-001':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 'COC-13-002':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-13-005':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-22-010':{zone:'integration',sourceType:'integration',oncePerTurn:true}
});
export const FIELD_RESPONSE_IDS=Object.freeze(Object.keys(FIELD_EFFECT_RULES));
const captureIds=new Set(['COC-13-001','COC-13-002','COC-13-005']);
const revision=(unit,zone)=>zone==='field'?(unit.fieldRevision||0):(unit.integrationRevision||0);
const invalid=(H,message)=>H.fail(409,message);
function findSearch(r,who,cardId){
 const p=r.players[who];
 return ['deck','grave','banished','extra','field','integration'].flatMap(z=>z==='integration'?[p.integration]:p[z]).find(id=>id&&r.units[id]?.cardId===cardId);
}
export function prepareFieldEffect(r,who,body,H){
 const sourceId=body.sourceUnitId,u=r.units[sourceId],z=H.zone(r,sourceId),rule=u&&FIELD_EFFECT_RULES[u.cardId],p=r.players[who];
 if(!rule||!z||z.player!==who||z.zone!==rule.zone||u.effectsNegated)invalid(H,'효과가 유효한 자신의 필드 또는 일체화 카드가 필요합니다.');
 if(rule.oncePerTurn)requireUnusedEffect(r,who,sourceId,1);
 const plan={cardId:u.cardId,sourceId,sourceZone:z.zone,sourceRevision:revision(u,z.zone)};
 if(isElemental(u.cardId)){prepareElemental(r,who,sourceId,H);return plan;}
 if(u.cardId==='COC-03-002'){
  plan.searchCardId=p.integration&&r.units[p.integration]?.cardId==='COC-03-001'?'COC-03-003':'COC-03-001';
  if(!findSearch(r,who,plan.searchCardId))invalid(H,'대상 카드가 자신의 영역에 없습니다.');
 }else{
  const targetId=body.target?.id,tz=targetId&&H.zone(r,targetId),own=u.cardId==='COC-22-010';
  if(!tz||tz.zone!=='field'||tz.player!==(own?who:1-who)||targetId===sourceId)invalid(H,'올바른 필드 대상을 선택해야 합니다.');
  Object.assign(plan,{targetId,targetController:tz.player,targetRevision:r.units[targetId].fieldRevision||0});
 }
 if(captureIds.has(u.cardId)&&!p.field.includes(null))invalid(H,'내 필드에 빈 자리가 필요합니다.');
 if(u.cardId==='COC-12-013'){
  if(!p.hand.includes(body.costCardId))invalid(H,'버릴 자신의 패 1장을 선택해야 합니다.');
  plan.costCardId=body.costCardId;
 }
 if(u.cardId==='COC-22-010'&&!H.attackAvailable(u,r.turnNumber))invalid(H,'포기할 공격 기회가 없습니다.');
 return plan;
}
export function payFieldEffect(r,who,plan,H){
 const p=r.players[who],u=r.units[plan.sourceId];
 if(isElemental(plan.cardId)){
  H.destroy(r,plan.sourceId,{cause:'cost',sourceId:plan.sourceId});
  if(H.zone(r,plan.sourceId)?.zone!=='grave')invalid(H,'자기 파괴 비용 지불에 실패했습니다.');
  if(r.turn!==who&&r.pendingAttack?.target?.id===plan.sourceId){r.pendingAttack.stage='retarget';H.log(r,'attack','원소 교체로 공격 대상이 사라져 재선택이 필요합니다.');}
 }
 if(plan.cardId==='COC-12-013'){
  H.move(r,plan.costCardId,'grave',r.units[plan.costCardId].owner);
  H.log(r,'cost',`${p.label}: 크래쉬볼티지 효과 비용으로 ${H.name(r,plan.costCardId)} 1장을 버렸습니다.`);
 }
 if(plan.cardId==='COC-22-010'){
  if(u.attackCountTurn!==r.turnNumber){u.attackCountTurn=r.turnNumber;u.attackCount=0;}
  u.attackCount=(u.attackCount||0)+1;
  H.log(r,'cost',`${p.label}: 블랙 메탈 카이저 공격 기회 1회 지불`);
 }
 if(FIELD_EFFECT_RULES[plan.cardId].oncePerTurn)markEffectUsed(r,who,plan.sourceId,1);
}
export function resolveFieldEffect(r,who,plan,H){
 if(isElemental(plan.cardId))return beginElementalChoice(r,who,plan.sourceId,H);
 const u=r.units[plan.sourceId],z=H.zone(r,plan.sourceId);
 const fizzle=reason=>{H.log(r,'effect',`필드 효과 불발: ${reason} (비용 반환 없음)`);return false;};
 if(!u||u.cardId!==plan.cardId||u.effectsNegated||z?.player!==who||z?.zone!==plan.sourceZone||revision(u,z.zone)!==plan.sourceRevision)return fizzle('소스 이탈/재진입·조종자/상태 변경');
 if(plan.targetId){const tz=H.zone(r,plan.targetId);if(tz?.zone!=='field'||tz.player!==plan.targetController||(r.units[plan.targetId].fieldRevision||0)!==plan.targetRevision)return fizzle('선언 대상 소실/조종권 변경');}
 const p=r.players[who],c=plan.cardId,t=plan.targetId;
 if(captureIds.has(c)&&!p.field.includes(null))return fizzle('필드 빈 자리 소실');
 switch(c){
 case 'COC-03-002':{
  const id=findSearch(r,who,plan.searchCardId);if(!id)return fizzle('검색 카드 소실');H.move(r,id,'hand',who);break;
 }
 case 'COC-05-004':H.move(r,t,'deck',r.units[t].owner);break;
 case 'COC-12-013':H.destroy(r,t,{sourceId:plan.sourceId});break;
 case 'COC-13-001':case 'COC-13-002':case 'COC-13-005':{
  if(c==='COC-13-002'){const result=H.roll(2);H.log(r,'dice',`사랑 도둑: 1d2 = ${result}`);if(result!==1)break;}
  const attack=swordActualAttack(r,t,{getZone:(room,id)=>H.zone(room,id)});
  H.capture(r,who,t);if(c==='COC-13-005'){r.players[1-who].hp-=Math.floor(attack/B.thiefDamageDivisor);H.outcome(r);}break;
 }
 case 'COC-22-010':{
  const target=r.units[t];if(target.bonusAttackTurn!==r.turnNumber){target.bonusAttackTurn=r.turnNumber;target.bonusAttackCount=0;}target.bonusAttackCount++;break;
 }
 default:throw new Error('unregistered field effect');
 }
 return true;
}
