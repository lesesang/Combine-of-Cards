import {actionLocked,nobleTarget,grantNoble,lureTarget,consumeLure} from './demon-effects.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {prepareGTool,summonGTool,prepareAltar,summonAltar} from './monsterized-spells.mjs';
import {destructionProtected} from './protection-auras.mjs';
import {recruitChoices,beginRecruitChoice} from './recruit-summons.mjs';
import {balanceValues as B} from './balance-values.mjs';
import {ELEMENTAL_MAGICIAN_IDS} from './effect-usage.mjs';
import {isElemental,prepareElemental,beginElementalChoice} from './elemental-replacement.mjs';
import {requireUnusedEffect,markEffectUsed} from './effect-usage.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';
import {terraReady} from './elemental-dragons.mjs';
import {batchSummonCount,beginSummonBatch} from './effect-summon-batches.mjs';

// Audited activated effects only; unrelated summon/death triggers remain partial.
export const FIELD_EFFECT_RULES=Object.freeze({
 'COC-01-003':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 'COC-21-012':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-21-003':{zone:'field',sourceType:'monster',oncePerTurn:true,effectNumber:2},
 'COC-08-011':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 'COC-20-008':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 'COC-26-001':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 ...Object.fromEntries(ELEMENTAL_MAGICIAN_IDS.map(id=>[id,{zone:'field',sourceType:'monster',oncePerTurn:true,selfCost:true}])),
 'COC-32-012':{zone:'field',sourceType:'monster',oncePerTurn:true,effectNumber:2},
 'COC-32-014':{zone:'field',sourceType:'monster',oncePerTurn:true,effectNumber:2},
 'COC-08-003':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-10-005':{zone:'integration',sourceType:'integration',oncePerTurn:true,costTriggers:true},
 'COC-23-002':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-24-003':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-26-003':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-31-004':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 'COC-03-002':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-05-004':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-12-013':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-13-001':{zone:'integration',sourceType:'integration',oncePerTurn:true},
 'COC-13-002':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-13-005':{zone:'field',sourceType:'monster',oncePerTurn:true},
 'COC-22-010':{zone:'integration',sourceType:'integration',oncePerTurn:true}
});
export const FIELD_RESPONSE_IDS=Object.freeze(Object.keys(FIELD_EFFECT_RULES));
export const fieldEffectNumber=id=>FIELD_EFFECT_RULES[id]?.effectNumber||1;
const captureIds=new Set(['COC-13-001','COC-13-002','COC-13-005']);
const revision=(unit,zone)=>zone==='field'?(unit.fieldRevision||0):(unit.integrationRevision||0);
const invalid=(H,message)=>H.fail(409,message);
function findSearch(r,who,cardId){
 const p=r.players[who];
 return ['deck','grave','banished','extra','field','integration'].flatMap(z=>z==='integration'?[p.integration]:p[z]).find(id=>id&&r.units[id]?.cardId===cardId);
}
export function prepareFieldEffect(r,who,body,H,checkingLure=false){
 const sourceId=body.sourceUnitId,u=r.units[sourceId],z=H.zone(r,sourceId),rule=u&&FIELD_EFFECT_RULES[u.cardId],p=r.players[who];
 if(!rule||!z||z.player!==who||z.zone!==rule.zone||u.effectsNegated||actionLocked(r,sourceId))invalid(H,'효과가 유효한 자신의 필드 또는 일체화 카드가 필요합니다.');
 if(rule.oncePerTurn)requireUnusedEffect(r,who,sourceId,fieldEffectNumber(u.cardId));
 if(!checkingLure&&body.target){
  const forced=lureTarget(r,sourceId,H);
  if(forced){try{return prepareFieldEffect(r,who,{...body,target:forced},H,true);}catch(error){if(error.status!==409)throw error;}}
 }
 const plan={cardId:u.cardId,sourceId,sourceZone:z.zone,sourceRevision:revision(u,z.zone)};
 if(u.cardId==='COC-21-012'){
  const target=nobleTarget(r,who,body.target,H);
  return {...plan,nobleTarget:target,...(target.type==='unit'?{targetId:target.id,targetController:who,targetRevision:r.units[target.id].fieldRevision||0}:{})};
 }
 if(u.cardId==='COC-01-003')return {...plan,...prepareGTool(r,who,body,H)};
 if(u.cardId==='COC-21-003')return {...plan,...prepareAltar(r,who,body,H)};
 if(isElemental(u.cardId)){prepareElemental(r,who,sourceId,H);return plan;}
 if(u.cardId==='COC-08-011'){
  if(!batchSummonCount(r,who,u.cardId,H))invalid(H,'부활 가능한 파괴된 츠쿠모가미와 빈 필드가 필요합니다.');
  plan.graveActivation=true;return plan;
 }
 if(u.cardId==='COC-20-008'){
  if(!Number.isInteger(body.discardCount)||body.discardCount<1||body.discardCount>Math.min(4,p.deck.length))invalid(H,'덱에서 버릴 카드 수를 1~4장 중 선택하세요.');
  plan.discardCount=body.discardCount;return plan;
 }
 if(u.cardId==='COC-26-001'){
  if(p.hp<=100)invalid(H,'체력100을 지불한 뒤 생존해야 합니다.');
  if(!r.players.some(pp=>pp.field.some(id=>id&&H.name(r,id).includes('매치'))))invalid(H,'필드에 매치 몬스터가 필요합니다.');
  return plan;
 }
 if(u.cardId==='COC-32-014'){
  if(!terraReady(u)||!Number.isFinite(u.hp)||u.hp<=0)invalid(H,'소환 뒤 자신의 턴 시작을 두 번 맞은 체력이 있는 테라가 필요합니다.');
  return plan;
 }
 if(u.cardId==='COC-08-003'){
  if(!p.hand.includes(body.costCardId))invalid(H,'패에서 덱으로 되돌릴 카드를 골라야 합니다.');
  plan.costCardId=body.costCardId;return plan;
 }
 if(u.cardId==='COC-31-004'){
  if(!p.field.includes(null)||!recruitChoices(r,who).length)invalid(H,'빈 필드와 자신의 패·덱·묘지의 크로와가 필요합니다.');
  return plan;
 }
 if(u.cardId==='COC-23-002'){
  if(u.abilityGameUsed)invalid(H,'이 효과의 게임당 사용 횟수를 모두 사용했습니다.');
  if(!p.integration||r.units[p.integration].cardId!=='COC-23-001')invalid(H,'라이드 위저드와 일체화해야 합니다.');
  plan.integrationId=p.integration;plan.integrationRevision=r.units[p.integration].integrationRevision||0;return plan;
 }
 if(u.cardId==='COC-10-005'){
  if((u.abilityGameCount||0)>=3)invalid(H,'이번 게임의 최대 3회 사용 한도를 초과했습니다.');
  const costId=body.costTarget?.id,cz=costId&&H.zone(r,costId);
  if(cz?.zone!=='field'||cz.player!==who||r.units[costId].effectDestructionImmune||destructionProtected(r,costId))invalid(H,'파괴 가능한 자신의 필드 몬스터를 비용으로 선택하세요.');
  plan.costUnitId=costId;
 }
 if(u.cardId==='COC-03-002'){
  plan.searchCardId=p.integration&&r.units[p.integration]?.cardId==='COC-03-001'?'COC-03-003':'COC-03-001';
  const selected=findSearch(r,who,plan.searchCardId);
  if(!selected)invalid(H,'대상 카드가 자신의 영역에 없습니다.');
  plan.graveActivation=H.zone(r,selected)?.zone==='grave';
 }else{
  const targetId=body.target?.id,tz=targetId&&H.zone(r,targetId),own=['COC-22-010','COC-24-003','COC-26-003'].includes(u.cardId);
  if(!tz||tz.zone!=='field'||tz.player!==(own?who:1-who)||(targetId===sourceId&&!['COC-24-003','COC-26-003'].includes(u.cardId)))invalid(H,'올바른 필드 대상을 선택해야 합니다.');
  Object.assign(plan,{targetId,targetController:tz.player,targetRevision:r.units[targetId].fieldRevision||0});
 }
 if(['COC-24-003','COC-26-003'].includes(u.cardId)&&!Number.isFinite(r.units[plan.targetId].hp))invalid(H,'대상에게 현재 체력이 필요합니다.');
 if(u.cardId==='COC-32-012'&&!(r.units[plan.targetId].hp>swordActualAttack(r,sourceId,{getZone:(room,id)=>H.zone(room,id)})))invalid(H,'자신의 현재 실제 공격력보다 현재 체력이 높은 상대 몬스터를 선택하세요.');
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
 if(plan.targetId||plan.nobleTarget)consumeLure(r,plan.sourceId);
 if(plan.cardId==='COC-21-003')p.hp-=plan.altarHpCost;
 if(plan.cardId==='COC-26-001')p.hp-=100;
 if(isElemental(plan.cardId)){
  H.destroy(r,plan.sourceId,{cause:'cost',sourceId:plan.sourceId});
  if(H.zone(r,plan.sourceId)?.zone!=='grave')invalid(H,'자기 파괴 비용 지불에 실패했습니다.');
  if(r.turn!==who&&r.pendingAttack?.target?.id===plan.sourceId){r.pendingAttack.stage='retarget';H.log(r,'attack','원소 교체로 공격 대상이 사라져 재선택이 필요합니다.');}
 }
 if(plan.cardId==='COC-08-003')H.move(r,plan.costCardId,'deck',r.units[plan.costCardId].owner);
 if(plan.cardId==='COC-10-005'){
  H.destroy(r,plan.costUnitId,{cause:'cost',sourceId:plan.sourceId});
  u.abilityGameCount=(u.abilityGameCount||0)+1;
 }
 if(plan.cardId==='COC-23-002')u.abilityGameUsed=true;
 if(plan.cardId==='COC-12-013'){
  H.move(r,plan.costCardId,'grave',r.units[plan.costCardId].owner);
  H.log(r,'cost',`${p.label}: 크래쉬볼티지 효과 비용으로 ${H.name(r,plan.costCardId)} 1장을 버렸습니다.`);
 }
 if(plan.cardId==='COC-22-010'){
  if(u.attackCountTurn!==r.turnNumber){u.attackCountTurn=r.turnNumber;u.attackCount=0;}
  u.attackCount=(u.attackCount||0)+1;
  H.log(r,'cost',`${p.label}: 블랙 메탈 카이저 공격 기회 1회 지불`);
 }
 if(FIELD_EFFECT_RULES[plan.cardId].oncePerTurn)markEffectUsed(r,who,plan.sourceId,fieldEffectNumber(plan.cardId));
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
 case 'COC-21-012':grantNoble(r,who,plan.nobleTarget,H);break;
 case 'COC-01-003':return summonGTool(r,who,plan,H);
 case 'COC-21-003':return summonAltar(r,who,plan,H);
 case 'COC-08-011':return beginSummonBatch(r,who,c,H);
 case 'COC-20-008':{
  const count=Math.min(plan.discardCount,p.deck.length);
  for(let i=0;i<count;i++)H.move(r,p.deck[0],'grave',who);
  u.atk+=count*50;H.log(r,'effect',`워리어 드라고닉: 덱 위 ${count}장 묘지 이동, 공격력 +${count*50}`);break;
 }
 case 'COC-26-001':
  for(const pp of r.players)for(const id of pp.field.filter(Boolean))if(H.name(r,id).includes('매치'))r.units[id].atk+=50;
  break;
 case 'COC-32-012':
  if(!(r.units[t].hp>swordActualAttack(r,plan.sourceId,{getZone:(room,id)=>H.zone(room,id)})))return fizzle('대상 체력이 현재 실제 공격력 이하');
  H.destroy(r,t,{sourceId:plan.sourceId});break;
 case 'COC-32-014':
  if(!terraReady(u)||!Number.isFinite(u.hp)||u.hp<=0)return fizzle('체류 조건 또는 현재 체력 소실');
  damagePlayer(r,1-who,Math.floor(u.hp/2));H.outcome(r);break;
 case 'COC-08-003':H.draw(r,who);break;
 case 'COC-10-005':H.destroy(r,t,{sourceId:plan.sourceId});break;
 case 'COC-23-002':{
  const iz=H.zone(r,plan.integrationId),iu=r.units[plan.integrationId];
  if(iz?.zone!=='integration'||iz.player!==who||iu.cardId!=='COC-23-001'||(iu.integrationRevision||0)!==plan.integrationRevision)return fizzle('라이드 위저드 이탈/진화/재진입');
  iu.atk+=50;break;
 }
 case 'COC-24-003':case 'COC-26-003':{
  const target=r.units[t];if(!Number.isFinite(target.hp))return fizzle('현재 체력 소실');
  target.atk=Math.max(0,Math.floor(target.hp));if(target.atk===0)H.destroy(r,t,{sourceId:plan.sourceId});break;
 }
 case 'COC-31-004':return beginRecruitChoice(r,who,H);

 case 'COC-03-002':{
  const id=findSearch(r,who,plan.searchCardId);if(!id)return fizzle('검색 카드 소실');H.move(r,id,'hand',who);break;
 }
 case 'COC-05-004':H.move(r,t,'deck',r.units[t].owner);break;
 case 'COC-12-013':H.destroy(r,t,{sourceId:plan.sourceId});break;
 case 'COC-13-001':case 'COC-13-002':case 'COC-13-005':{
  if(c==='COC-13-002'){const result=H.roll(2);H.log(r,'dice',`사랑 도둑: 1d2 = ${result}`);if(result!==1)break;}
  const attack=swordActualAttack(r,t,{getZone:(room,id)=>H.zone(room,id)});
  H.capture(r,who,t);if(c==='COC-13-005'){damagePlayer(r,1-who,Math.floor(attack/B.thiefDamageDivisor));H.outcome(r);}break;
 }
 case 'COC-22-010':{
  const target=r.units[t];if(target.bonusAttackTurn!==r.turnNumber){target.bonusAttackTurn=r.turnNumber;target.bonusAttackCount=0;}target.bonusAttackCount++;break;
 }
 default:throw new Error('unregistered field effect');
 }
 return true;
}
