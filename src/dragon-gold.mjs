import {gainUnitStats,gainPlayerStats} from './stat-gains.mjs';
import {
  declareAutomaticGroup, resolveEffectStack, registerPersistent, endPersistent
} from './effect-runtime.mjs';

// A single dragon subsystem owns the created cards and their persistent counter.
// Token conversion, the Fafnir summon, and the ring's higher resolution priority
// must agree even when a reaction/destroy event is triggered by another deck.
export const DRAGON_CARDS = Object.freeze({
  fafnir: 'COC-11-007',
  gold: 'COC-11-008',
  ring: 'COC-11-009'
});

const hasDragon = (room, controller, id) =>
  room.players[controller]?.field.some(unitId => room.units[unitId]?.cardId === id);

export function dragonGoldEffects(room) {
  return (room.persistentEffects || []).filter(item => item.kind === 'dragon-gold');
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
    const goldId = H.instantiate(room, DRAGON_CARDS.gold, who);
    const ringId = H.instantiate(room, DRAGON_CARDS.ring, who);
    H.move(room, goldId, 'hand', who);
    H.move(room, ringId, 'hand', who);
    // Gold is cast automatically on arrival; the independent effect survives
    // the spell's move to graveyard.
    H.move(room, goldId, 'grave', who);
    registerPersistent(room, {
      kind:'dragon-gold', owner:who, sourceId:goldId,
      anchorId:candidate, expires:'anchor-destroyed',
      counters:0, data:{ringId}
    });
    H.log(room, 'effect', `${room.players[who].label}: 라인의 황금 자동 발동, 니벨룽겐의 반지 생성`);
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

export function onDragonAttackPhase(room, who, H) {
  for (const gold of dragonGoldEffects(room)) {
    if (gold.owner === who) addTreasure(room, gold, 5, H);
  }
}

/** Resolves Ring ahead of Gold expiration, always using saved treasure count. */
export function onFafnirDestroyed(room, fafnirId, controller, H) {
  const golds = dragonGoldEffects(room).filter(e => e.anchorId === fafnirId && e.owner === controller);
  if (!golds.length) return;
  const gold = golds[0];
  const ringId = gold.data?.ringId;
  const ringZone = ringId ? H.zone(room, ringId) : null;
  const actions = [{
    key:'expire-gold', effectId:'dragon-gold-expire',
    owner:controller, sourceId:gold.sourceId,
    priority:0, exception:'independent',
    payload:{goldEffectId:gold.id}
  }];
  if (ringZone) actions.push({
    key:'ring', effectId:'dragon-ring',
    owner:controller, sourceId:ringId,
    priority:10, exception:'destroy-trigger',
    payload:{goldEffectId:gold.id, treasureCount:gold.counters}
  });
  declareAutomaticGroup(room, actions, room.turn === 0 || room.turn === 1 ? room.turn : controller);
  resolveEffectStack(room, {
    getZone:id => H.zone(room, id),
    execute:e => {
      if (e.effectId === 'dragon-ring') {
        const n = Math.max(0,Math.floor(e.payload.treasureCount)) * 10;
        const gained=gainPlayerStats(room,controller,{atk:n,hp:n});
        if (H.zone(room, ringId)) H.move(room, ringId, 'banished', controller);
        H.log(room,'effect',`니벨룽겐의 반지: 보물 ${e.payload.treasureCount}개 × 10 = ${n} 기본 강화 (적용 ATK+${gained.atk}/HP+${gained.hp})`);
      }
      if (e.effectId === 'dragon-gold-expire') {
        endPersistent(room, item => item.id === e.payload.goldEffectId);
        if (H.zone(room, gold.sourceId)) H.move(room, gold.sourceId, 'banished', controller);
        H.log(room,'effect','라인의 황금 지속 효과가 종료되었습니다.');
      }
    }
  });
}
