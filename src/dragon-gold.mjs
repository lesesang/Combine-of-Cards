import {gainUnitStats,gainPlayerStats} from './stat-gains.mjs';
import {
  registerPersistent, endPersistent
} from './effect-runtime.mjs';

// A single dragon subsystem owns the created cards and their persistent counter.
// Token conversion, the Fafnir summon, and the ring's higher resolution priority
// must agree even when a reaction/destroy event is triggered by another deck.
export const DRAGON_CARDS = Object.freeze({
  fafnir: 'COC-11-007',
  gold: 'COC-11-008',
  ring: 'COC-11-009'
});

export function dragonGoldEffects(room) {
  return (room.persistentEffects || []).filter(item => item.kind === 'dragon-gold' && !item.closing);
}

function addTreasure(room, gold, n, { log } = {}) {
  if (!Number.isInteger(n) || n < 1) return;
  gold.counters += n;
  const active = room.players[gold.owner].field.find(
    id => id && id === gold.anchorId && room.units[id]?.cardId === DRAGON_CARDS.fafnir
  );
  if (active) {
    if(!room.units[active].effectsNegated)gainUnitStats(room,active,{atk:10*n,hp:10*n});
  }
  log?.(room, 'effect', `라인의 황금: 보물 ${n}개 추가 (총 ${gold.counters}개)`);
}

function findFafnir(room, who) {
  const p = room.players[who];
  return [...p.hand, ...p.deck].find(id => room.units[id]?.cardId === DRAGON_CARDS.fafnir);
}

export function createDragonTreasures(room,who,anchorId,H){
 const goldId=H.instantiate(room,DRAGON_CARDS.gold,who),ringId=H.instantiate(room,DRAGON_CARDS.ring,who);
 H.move(room,goldId,'hand',who);H.move(room,ringId,'hand',who);
 // Gold's original automatic use remains immediate; its ATTACK trigger and
 // Ring's later death trigger now use the common response engine.
 H.move(room,goldId,'grave',who);
 registerPersistent(room,{kind:'dragon-gold',owner:who,sourceId:goldId,anchorId,expires:'anchor-destroyed',counters:0,data:{ringId}});
 H.log(room,'effect',`${room.players[who].label}: 라인의 황금 자동 발동, 니벨룽겐의 반지 생성`);
}

/**
 * Called after a token is successfully created on the field.
 * 1) Fafnir auto-summon; 2) create both cards and activate Gold immediately;
 * 3) convert the created token to treasure instead of retaining it on field.
 */
export function onTokenCreation(room, tokenId, controller, H) {
  if (!room.units[tokenId] || !room.units[tokenId].created) return;
  onTokenActivity(room, '생성', controller, H, tokenId);
}

// Creation/summon is one successful placement action. Independent uses and
// releases create new events; never re-trigger release on treasure conversion.
export function onTokenActivity(room, eventType, controller, H, tokenId=null) {
  if (!['생성','소환','사용','릴리스'].includes(eventType)) return;
  if (!Number.isInteger(controller) || controller < 0 || controller > 1) return;
  const active = room.turn === 0 || room.turn === 1 ? room.turn : controller;
  const order = [active, 1 - active];
  for (const who of order) {
    if (dragonGoldEffects(room).some(e => e.owner === who)) continue;
    const candidate = findFafnir(room, who);
    if (!candidate || !room.players[who].field.includes(null)) continue;
    H.move(room, candidate, 'field', who);
    H.log(room, 'summon', `${room.players[who].label}: 토큰 ${eventType}으로 파프니르 자동 소환`);
    createDragonTreasures(room,who,candidate,H);
  }
  const golds = dragonGoldEffects(room);
  if (!golds.length) return;
  // One token event can count for only one Gold. Controller wins ties.
  const receiver = golds.find(gold => gold.owner === controller) || golds[0];
  addTreasure(room, receiver, 1, H);
  // A released/used token has already left the field. Never convert it again.
  if (eventType !== '생성' && eventType !== '소환') return;
  const where = tokenId && H.zone(room, tokenId);
  if (where?.zone === 'field') {
    H.move(room, tokenId, 'banished', controller);
    H.log(room, 'effect', '생성된 토큰을 보물로 전환했습니다.');
  }
}

// These entries join the same ordering/response group as King and Orochi.
export function dragonAttackTriggers(room,who){
 return dragonGoldEffects(room).filter(g=>g.owner===who).map(g=>({
  key:`gold-attack-${g.id}-${room.turnNumber}`,effectId:'monster-trigger-resolution',owner:who,
  sourceId:g.sourceId,sourceZone:'grave',exception:'independent',priority:0,
  title:'라인의 황금 · 보물 5개',payload:{cardId:DRAGON_CARDS.gold,goldEffectId:g.id,eventTurn:room.turnNumber}
 }));
}
export function pendingDragonDeath(room){
 return (room.persistentEffects||[]).some(g=>g.kind==='dragon-gold'&&g.closing);
}
function expireGold(room,gold,H){
 endPersistent(room,item=>item.id===gold.id);
 if(H.zone(room,gold.sourceId))H.move(room,gold.sourceId,'banished',room.units[gold.sourceId].owner);
 H.log(room,'effect','라인의 황금: 반지 처리 종료 후 지속 효과 종료');
}
/** Save the death event; never drain the caller's spell/counter stack here. */
export function onFafnirDestroyed(room,fafnirId,controller,H){
 for(const gold of dragonGoldEffects(room).filter(g=>g.anchorId===fafnirId)){
  gold.closing=true;
  const ringId=gold.data?.ringId,ring=room.units[ringId],z=ring&&H.zone(room,ringId);
  const owner=room.players[gold.owner],spellForbidden=owner.turnsTaken>0&&(owner.spellForbiddenUntil||0)>=owner.turnsTaken;
  if(!ring||ring.cardId!==DRAGON_CARDS.ring||z?.zone!=='hand'||z.player!==gold.owner||spellForbidden){expireGold(room,gold,H);continue;}
  // Ordinary automatic spell use: reveal/move before responding. A negated
  // Ring remains in the grave; only successful resolution banishes the Ring.
  H.move(room,ringId,'grave',ring.owner);
  H.recordUse?.(room,gold.owner,ringId);
  (room.deferredMonsterTriggers??=[]).push({
   key:`ring-death-${gold.id}`,effectId:'monster-trigger-resolution',owner:gold.owner,
   sourceId:ringId,sourceZone:'grave',exception:'destroy-trigger',priority:0,
   title:'니벨룽겐의 반지 · 파괴 보상',payload:{cardId:DRAGON_CARDS.ring,goldEffectId:gold.id,
    treasureCount:Math.max(0,Math.floor(gold.counters)),sourceRevision:ring.zoneRevision||0,eventTurn:room.turnNumber}
  });
  H.log(room,'effect',`니벨룽겐의 반지: 보물 ${gold.counters}개 기록, 현재 체인 후 자동 주문 대응`);
 }
}
export function resolveDragonTrigger(room,e,H){
 const p=e.payload;
 if(p.cardId!==DRAGON_CARDS.gold&&p.cardId!==DRAGON_CARDS.ring)return false;
 const gold=(room.persistentEffects||[]).find(g=>g.kind==='dragon-gold'&&g.id===p.goldEffectId);
 if(p.cardId===DRAGON_CARDS.gold){
  if(gold&&!gold.closing&&gold.owner===e.owner&&room.turn===e.owner&&room.phase==='ATTACK'&&room.turnNumber===p.eventTurn)addTreasure(room,gold,5,H);
  return true;
 }
 const ring=room.units[e.sourceId],z=ring&&H.zone(room,e.sourceId);
 if(!gold?.closing||!ring||ring.cardId!==DRAGON_CARDS.ring||z?.zone!=='grave'||z.player!==ring.owner||(ring.zoneRevision||0)!==p.sourceRevision){
  H.log(room,'effect','니벨룽겐의 반지: 사용한 원본의 묘지 이탈/재진입으로 강화 불발');return true;
 }
 const base=p.treasureCount*10,gained=gainPlayerStats(room,e.owner,{atk:base,hp:base});
 H.move(room,ring.id,'banished',ring.owner);
 H.log(room,'effect',`니벨룽겐의 반지: 보물 ${p.treasureCount}개 × 10 = ${base} 기본 강화 (적용 ATK+${gained.atk}/HP+${gained.hp})`);
 return true;
}
export function settleDragonTrigger(room,e,H){
 if(e.payload?.cardId!==DRAGON_CARDS.ring)return;
 const gold=(room.persistentEffects||[]).find(g=>g.id===e.payload.goldEffectId&&g.kind==='dragon-gold');
 // Cleanup also runs when the Ring is countered or its physical source moved.
 if(gold?.closing)expireGold(room,gold,H);
}
