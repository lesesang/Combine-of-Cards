import {declareEffect} from './effect-runtime.mjs';

export const SPELL_COUNTER_IDS = Object.freeze(['COC-14-001']);
export const spellResponsePlayer = room => room.pendingSpell
  ? (room.pendingSpell.awaiting ?? 1-room.pendingSpell.who) : null;

// Only the printed spell clause is connected. Summon negation is not yet
// implemented; it must share this same physical card's once-per-game usage.
export function legalSpellCounters(room, who) {
  const pending=room.pendingSpell;
  if(room.status!=='active'||!pending||pending.counter||pending.who===who||
      spellResponsePlayer(room)!==who)return [];
  const id=room.players[who]?.integration, unit=room.units[id];
  return unit&&SPELL_COUNTER_IDS.includes(unit.cardId)&&!unit.effectsNegated&&
    !unit.spellCounterGameUsed ? [id] : [];
}

export function declareSpellCounter(room, who, sourceId) {
  if(!legalSpellCounters(room,who).includes(sourceId)) {
    throw Object.assign(new Error('사용 가능한 주문 무효화 카드가 아닙니다.'),{status:409});
  }
  const pending=room.pendingSpell;
  const target=room.effectStack?.find(e=>e.effectId==='auto-spell-resolution'&&
    e.sourceId===pending.sourceId&&e.owner===pending.who&&e.payload.cardId===pending.cardId);
  if(!target)throw new Error('counter target is missing from spell stack');
  const effect=declareEffect(room,{effectId:'storm-spell-counter',owner:who,
    sourceId,sourceZone:'integration',payload:{targetSequence:target.sequence}});
  // Consume usage at declaration even if this source later leaves play.
  room.units[sourceId].spellCounterGameUsed=true;
  pending.counter={who,sourceId,sequence:effect.sequence};
  pending.awaiting=pending.who;
  return effect;
}
