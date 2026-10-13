/**
 * Explicit, audited main-phase card abilities.
 * These handlers do not pretend to implement reactions, copy effects, or the full 254-card catalog.
 */
const REGISTERED=[
 'COC-03-002','COC-05-004','COC-08-003','COC-10-005',
 'COC-13-001','COC-13-002','COC-13-005','COC-22-010',
 'COC-23-002','COC-24-003','COC-26-003','COC-31-004','COC-12-013'
];
export const FIELD_ABILITY_IDS=Object.freeze(REGISTERED);
function invalid(H,message){H.fail(409,message)}
function fieldTarget(r,body,who,H,relation){
 const id=body.target?.id,z=id&&H.zone(r,id);
 if(!z||z.zone!=='field'||z.player!==(relation==='enemy'?1-who:who))invalid(H,'올바른 필드 대상을 선택해야 합니다.');
 return id;
}
function handTarget(r,body,who,H){
 const id=body.costCardId;
 if(!id||!r.players[who].hand.includes(id))invalid(H,'패에서 덱으로 되돌릴 카드를 골라야 합니다.');
 return id;
}
function freeSpace(r,who,H){if(!r.players[who].field.includes(null))invalid(H,'내 필드에 빈 자리가 필요합니다.')}
function searchEverywhere(r,who,cardId,H){
 const p=r.players[who];
 const areas=['deck','grave','banished','extra','field','integration'];
 let id;
 for(const area of areas){
  if(area==='integration'){if(p.integration&&r.units[p.integration]?.cardId===cardId){id=p.integration;break}}
  else if((id=p[area].filter(Boolean).find(u=>r.units[u]?.cardId===cardId)))break;
 }
 if(!id)invalid(H,'대상 카드가 자신의 영역에 없습니다.');
 H.move(r,id,'hand',who);
 return id;
}
export function applyFieldAbility(r,who,body,H){
 const id=body.sourceUnitId,z=id&&H.zone(r,id),unit=id&&r.units[id];
 if(!unit||!z||z.player!==who||!['field','integration'].includes(z.zone))
  invalid(H,'효과 발동 카드는 자신의 필드 또는 일체화 영역에 있어야 합니다.');
 if(!FIELD_ABILITY_IDS.includes(unit.cardId))invalid(H,'이 카드의 필드 효과는 아직 자동 판정을 지원하지 않습니다.');
 const p=r.players[who],c=unit.cardId;
 if(p.abilityUsed?.[c]===r.turnNumber)invalid(H,'이 효과는 이번 턴에 이미 사용했습니다.');
 if(unit.abilityGameUsed)invalid(H,'이 효과의 게임당 사용 횟수를 모두 사용했습니다.');
 switch(c){
 case 'COC-12-013':{
  if(z.zone!=='field'||unit.effectsNegated)invalid(H,'필드에서 효과가 유효한 크래쉬볼티지가 필요합니다.');
  const cost=body.costCardId;
  if(!p.hand.includes(cost))invalid(H,'버릴 자신의 패 1장을 선택해야 합니다.');
  const target=fieldTarget(r,body,who,H,'enemy');
  H.move(r,cost,'grave',r.units[cost].owner);
  H.log(r,'cost',`${p.label}: 크래쉬볼티지 효과 비용으로 ${H.name(r,cost)} 1장을 버렸습니다.`);
  H.destroy(r,target);break;
 }
 case 'COC-03-002':{
  const integrated=p.integration&&r.units[p.integration]?.cardId==='COC-03-001';
  searchEverywhere(r,who,integrated?'COC-03-003':'COC-03-001',H);
  break;
 }
 case 'COC-05-004':{
  const t=fieldTarget(r,body,who,H,'enemy');H.move(r,t,'deck',r.units[t].owner);break;
 }
 case 'COC-08-003':{
  const cost=handTarget(r,body,who,H);H.move(r,cost,'deck',who);H.shuffle(p.deck);H.draw(r,who);break;
 }
 case 'COC-10-005':{
  if((unit.abilityGameCount||0)>=3)invalid(H,'이번 게임의 최대 3회 사용 한도를 초과했습니다.');
  const own=fieldTarget(r,{target:body.costTarget},who,H,'own');
  const enemy=fieldTarget(r,body,who,H,'enemy');
  if(own===enemy)invalid(H,'서로 다른 몬스터를 선택해야 합니다.');
  H.destroy(r,own);H.destroy(r,enemy);unit.abilityGameCount=(unit.abilityGameCount||0)+1;break;
 }
 case 'COC-13-001':
 case 'COC-13-002':
 case 'COC-13-005':{
  freeSpace(r,who,H);const t=fieldTarget(r,body,who,H,'enemy'),attack=Math.max(0,r.units[t].atk);
  if(c!=='COC-13-002'||H.roll(2)===1){H.capture(r,who,t);if(c==='COC-13-005'){r.players[1-who].hp-=attack;H.outcome(r)}}
  break;
 }
 case 'COC-22-010':{
  const t=fieldTarget(r,body,who,H,'own');
  if(t===id)invalid(H,'공격 기회를 줄 다른 몬스터를 선택해야 합니다.');
  if(unit.atk<1||unit.cannotAttack||unit.frozen||unit.attackCountTurn===r.turnNumber&&unit.attackCount>=(unit.extraAttacks||1))invalid(H,'포기할 공격 기회가 없습니다.');
  if(unit.attackCountTurn!==r.turnNumber){unit.attackCountTurn=r.turnNumber;unit.attackCount=0}
  unit.attackCount=(unit.attackCount||0)+1;
  const target=r.units[t];
  if(target.bonusAttackTurn!==r.turnNumber){target.bonusAttackTurn=r.turnNumber;target.bonusAttackCount=0}
  target.bonusAttackCount++;break;
 }
 case 'COC-23-002':{
  if(!p.integration||r.units[p.integration].cardId!=='COC-23-001')invalid(H,'라이드 위저드와 일체화해야 합니다.');
  r.units[p.integration].atk+=50;unit.abilityGameUsed=true;break;
 }
 case 'COC-24-003':
 case 'COC-26-003':{
  const t=fieldTarget(r,body,who,H,'own');
  if(!Number.isFinite(r.units[t].hp))invalid(H,'대상에게 현재 체력이 필요합니다.');
  r.units[t].atk=Math.max(0,Math.floor(r.units[t].hp));if(r.units[t].atk===0)H.destroy(r,t);break;
 }
 case 'COC-31-004':{
  freeSpace(r,who,H);
  const croix=['deck','hand','grave'].flatMap(a=>p[a]).find(i=>r.units[i]?.cardId==='COC-31-001');
  if(!croix)invalid(H,'자신의 덱·패·묘지에서 크로와를 찾을 수 없습니다.');
  H.move(r,croix,'field',who);H.onSummon?.(r,who,croix);break;
 }
 }
 p.abilityUsed??={};p.abilityUsed[c]=r.turnNumber;
 return {supported:true,cardId:c};
}
