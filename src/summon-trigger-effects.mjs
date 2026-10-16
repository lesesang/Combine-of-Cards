import {queueCardRevival} from './death-revival.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {beginDeckSearch} from './deck-search.mjs';
import {balanceValues as B} from './balance-values.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';

// These handlers resolve only after the summon and its separate monster-effect
// response window. Printed summon costs belong to activation-rules instead.
export const SUMMON_TRIGGER_RULES=Object.freeze({
 'COC-10-007':{action:'twins-copy'},
 'COC-17-001':{action:'pharaoh-buff',sourceZone:'integration',event:'integration-enter'},
 'COC-19-006':{action:'restore-battlefield',sourceZone:'integration',event:'integration-enter'},
 'COC-20-009':{action:'search'},
 'COC-30-010':{action:'yurika-heal',sourceZone:'integration',event:'integration-enter'},
 'COC-05-010':{action:'both-draw'},
 'COC-07-002':{action:'enemy-mill'},
 'COC-10-001':{action:'create-remnant'},
 'COC-10-003':{action:'share-excess-hp'},
 'COC-10-004':{action:'freeze-enemy-turn'},
 'COC-12-003':{action:'search'},
 'COC-12-004':{action:'draw-two'},
 'COC-12-010':{action:'return-other-field'},
 'COC-12-012':{target:'destroy-lower-printed'},
 'COC-22-015':{action:'search',effectNumber:3},
 'COC-23-003':{action:'heal'},
 'COC-23-004':{action:'search'},
 'COC-24-002':{action:'search'},
 'COC-26-002':{action:'search'},
 'COC-27-001':{action:'both-draw'},
 'COC-27-003':{action:'mill-for-stats'},
 'COC-27-004':{action:'destroy-other-monsters'},
 'COC-31-001':{action:'coin-draw'},
 'COC-31-002':{target:'coin-weaken-enemy'},
 'COC-31-003':{action:'coin-damage'}
});

export function resolveSummonTrigger(r,e,H){
 const rule=SUMMON_TRIGGER_RULES[e.payload.cardId];if(!rule?.action)return false;
 const who=e.owner,p=r.players[who],foe=r.players[1-who],u=r.units[e.sourceId];
 switch(rule.action){
 case 'twins-copy':{
  if(u.twinsOffspring||!p.field.includes(null))break;
  const id=H.instantiate(r,u.cardId,who);r.units[id].twinsOffspring=true;
  H.move(r,id,'hand',who);
  queueCardRevival(r,who,id,H,{kind:'twins',originZone:'hand'});
  H.log(r,'effect','골과 몰: 기본 상태의 복사본을 패에 생성하고 소환 예약 (복사본의 증식 효과는 발동하지 않음)');break;
 }
 case 'pharaoh-buff':
  for(const id of r.players.flatMap(pp=>pp.field.filter(Boolean))){r.units[id].atk+=50;r.units[id].hp=(r.units[id].hp??0)+50;}break;
 case 'yurika-heal':p.hp+=B.yurikaHeal;break;
 case 'restore-battlefield':{
  const targets=[r.turn,1-r.turn].flatMap(controller=>r.players[controller].field.filter(Boolean).map(id=>({id,controller,revision:r.units[id].zoneRevision||0})));
  H.destroyBatch(r,targets.map(t=>t.id),{sourceId:e.sourceId});
  let revived=0;
  for(const t of targets){
   const unit=r.units[t.id],zone=unit&&H.zone(r,t.id);
   // Only monsters actually destroyed by this effect are eligible. Tokens
   // cease to exist; immunity, prior movement and an old grave are excluded.
   if(zone?.zone!=='grave'||(unit.zoneRevision||0)!==t.revision+1)continue;
   unit.cannotAttackUntil=r.turnNumber;
   queueCardRevival(r,t.controller,t.id,H,{kind:'sherulong',cannotAttackUntil:r.turnNumber});revived++;
  }
  if(revived)H.graveActivation?.(r,{cardId:e.payload.cardId});
  H.log(r,'effect','셔우롱: 파괴된 실물 몬스터의 기본 상태 부활 예약, 각 소환에 별도 대응');break;
 }

 case 'search':beginDeckSearch(r,who,e.payload.cardId,H.cards,H,{sourceId:e.sourceId,sourceZone:'field',sourceRevision:e.payload.sourceRevision});break;
 case 'both-draw':H.draw(r,who);if(r.status==='active')H.draw(r,1-who);break;
 case 'draw-two':for(let i=0;i<2&&r.status==='active;i++)H.draw(r,who);break;
 case 'enemy-mill':H.mill(r,1-who,2);break;
 case 'heal':p.hp+=B.rideWaterHeal;break;
 case 'create-remnant':{
  // This is the catalog's generated card, not an invented source record.
  const id=H.instantiate(r,'COC-10-002',who);
  r.units[id].atk=swordActualAttack(r,e.sourceId,{getZone:(room,uid)=>H.zone(room,uid)});
  r.units[id].hp=u.hp;p.hand.push(id);
  H.log(r,'effect','디트리히: 현재 공격력·체력을 복사한 찌꺼기를 패에 생성');break;
 }
 case 'share-excess-hp':{
  const loss=Math.max(0,p.hp-500);damagePlayer(r,who,loss);damagePlayer(r,1-who,loss);
  H.log(r,'effect',`프란츠: 양쪽 플레이어에게 ${loss} 피해`);break;
 }
 case 'freeze-enemy-turn':foe.noAttackUntil=(foe.turnsTaken||0)+(r.turn===who?1:0);break;
 case 'return-other-field':{
  const ids=r.players.flatMap(pp=>[...pp.field,pp.integration].filter(id=>id&&id!==e.sourceId));
  for(const id of ids)if(H.zone(r,id))H.move(r,id,'deck',r.units[id].owner);break;
 }
 case 'destroy-other-monsters':H.destroyBatch(r,r.players.flatMap(pp=>pp.field.filter(id=>id&&id!==e.sourceId)),{sourceId:e.sourceId});break;
 case 'mill-for-stats':{
  let count=0;
  while(count<2&&p.deck.length){
   const id=p.deck[0],card=H.cards.get(r.units[id].cardId),isToken=!!r.units[id].created;
   H.move(r,id,'grave',r.units[id].owner);count++;
   if(count===1&&(!card?.type.includes('몬스터')||isToken))break;
  }
  u.atk+=count*50;u.hp=(u.hp??0)+count*50;
  H.log(r,'effect',`분쇄차 티라노: 덱 위 ${count}장 묘지 이동, 공격력·체력 +${count*50}`);break;
 }
 case 'coin-draw':{
  const face=H.roll(2);H.log(r,'dice',`크로와: 코인 ${face}`);H.draw(r,face===1?who:1-who);break;
 }
 case 'coin-damage':{
  const faces=Array.from({length:5},()=>H.roll(2)),damage=faces.filter(x=>x===1).length*100;
  damagePlayer(r,1-who,damage);H.log(r,'dice',`베이플: 코인 ${faces.join(', ')} → 상대 ${damage} 피해`);break;
 }
 default:throw new Error('unknown summon trigger action');
 }
 H.outcome(r);return true;
}

export function settleSummonTrigger(r,e,H){
 // Tyranno's printed HP is unspecified because this trigger supplies it.
 // A negated/empty-deck effect must not leave an immortal null-HP monster.
 if(e.payload?.cardId!=='COC-27-003')return;
 const u=r.units[e.sourceId],z=H.zone(r,e.sourceId);
 if(u&&z?.zone==='field'&&z.player===e.owner&&(u.fieldRevision||0)===e.payload.sourceRevision&&!(u.hp>0)){
  u.hp=0;H.destroy(r,e.sourceId,{cause:'lethal',sourceId:e.sourceId});
 }
}
