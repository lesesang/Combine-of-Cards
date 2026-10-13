/**
 * Serialized effect scheduler (v1.3).
 *
 * Declarations are data, never closures, so an open reaction window can be saved
 * with the room and resumed after a network reconnect.
 */
const EXCEPTIONS = new Set(['destroy-trigger', 'graveyard', 'self-cost', 'independent']);
const SAFE_ZONES = new Set(['field', 'integration']);

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(label + ' must be a plain object');
  }
}
function validOwner(value) { return Number.isInteger(value) && (value === 0 || value === 1); }
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128; }

export function declareEffect(room, effect) {
  requireRecord(room, 'room');
  requireRecord(effect, 'effect');
  if (!validOwner(effect.owner)) throw new TypeError('invalid effect owner');
  if (!validId(effect.effectId)) throw new TypeError('effectId required');
  if (effect.sourceId !== null && effect.sourceId !== undefined && !validId(effect.sourceId)) {
    throw new TypeError('invalid sourceId');
  }
  if (effect.exception !== undefined && !EXCEPTIONS.has(effect.exception)) {
    throw new TypeError('unknown resolution exception');
  }
  if (effect.priority !== undefined &&
      (!Number.isInteger(effect.priority) || Math.abs(effect.priority) > 1000)) {
    throw new TypeError('invalid priority');
  }
  room.effectStack ??= [];
  if (room.effectStack.length >= 256) throw new Error('effect stack exceeds safe limit');
  room.effectSequence = (room.effectSequence || 0) + 1;
  if (!Number.isSafeInteger(room.effectSequence)) throw new Error('effect sequence overflow');
  const entry = {
    sequence: room.effectSequence,
    key: effect.key ?? null,
    effectId: effect.effectId,
    owner: effect.owner,
    sourceId: effect.sourceId ?? null,
    sourceZone: effect.sourceZone || 'field',
    exception: effect.exception || null,
    priority: effect.priority || 0,
    payload: structuredClone(effect.payload ?? {}),
    declaredAtTurn: room.turnNumber || 0
  };
  room.effectStack.push(entry);
  return entry;
}

export function declareAutomaticGroup(room, effects, activePlayer, orderedIds = null) {
  if (!Array.isArray(effects)) throw new TypeError('effects must be an array');
  if (!validOwner(activePlayer)) throw new TypeError('invalid active player');
  if (orderedIds !== null) {
    if (!Array.isArray(orderedIds) || orderedIds.length !== effects.length ||
        new Set(orderedIds).size !== effects.length) throw new Error('invalid trigger ordering');
    const supplied = new Set(effects.map(e => e.key));
    if (!effects.every(e => validId(e.key)) || supplied.size !== effects.length ||
        orderedIds.some(key => !supplied.has(key))) throw new Error('ordering must name each trigger once');
  }
  // Higher explicit priority is declared later so it resolves earlier by LIFO.
  // Within a priority, the active player declares first; opponent second.
  const rank = orderedIds ? new Map(orderedIds.map((key, index) => [key, index])) : null;
  const ordered = [...effects].sort((a, b) =>
    ((a.priority || 0) - (b.priority || 0)) ||
    (Number(a.owner !== activePlayer) - Number(b.owner !== activePlayer)) ||
    (rank ? rank.get(a.key) - rank.get(b.key) : 0)
  );
  return ordered.map(effect => declareEffect(room, effect));
}


/**
 * R02: collect one simultaneous trigger event in persistent, JSON-only state.
 * For equal-priority triggers, each player who controls multiple triggers
 * chooses that player's declaration order. Active player chooses first.
 * Higher explicit priorities still override player-selected ordering.
 */
export function beginAutomaticTriggerOrder(room, effects, activePlayer) {
  requireRecord(room, 'room');
  if (!validOwner(activePlayer)) throw new TypeError('invalid active player');
  if (!Array.isArray(effects) || effects.length < 1 || effects.length > 256) {
    throw new TypeError('invalid automatic trigger group');
  }
  if (room.pendingTriggerOrder || room.effectStack?.length) {
    throw new Error('cannot open another trigger order while a stack or choice is pending');
  }
  const keys = new Set();
  for (const effect of effects) {
    requireRecord(effect, 'effect');
    if (!validId(effect.key) || keys.has(effect.key) || !validOwner(effect.owner) ||
        !validId(effect.effectId) || (effect.priority !== undefined &&
        (!Number.isInteger(effect.priority) || Math.abs(effect.priority) > 1000))) {
      throw new Error('invalid simultaneous trigger identity');
    }
    keys.add(effect.key);
  }
  const snapshot = structuredClone(effects);
  // One trigger per owner per priority requires no user-supplied ordering.
  const needsChoice = [activePlayer,1-activePlayer].filter(who => {
    const counts = new Map();
    for (const e of snapshot) if (e.owner === who) {
      const priority = e.priority || 0;
      counts.set(priority,(counts.get(priority)||0)+1);
    }
    return [...counts.values()].some(count => count > 1);
  });
  if (!needsChoice.length) {
    declareAutomaticGroup(room,snapshot,activePlayer);
    return {pending:false,awaiting:null};
  }
  room.pendingTriggerOrder = {
    activePlayer,
    effects:snapshot,
    awaiting:needsChoice,
    selected:{},
    createdAtTurn:room.turnNumber || 0
  };
  return {pending:true,awaiting:needsChoice[0]};
}

export function chooseAutomaticTriggerOrder(room, owner, keys) {
  requireRecord(room, 'room');
  const pending = room.pendingTriggerOrder;
  if (!pending || !Array.isArray(pending.awaiting) || pending.awaiting[0] !== owner) {
    throw new Error('not the current trigger-order controller');
  }
  const owned = pending.effects.filter(e => e.owner === owner).map(e => e.key);
  if (!Array.isArray(keys) || keys.length !== owned.length ||
      new Set(keys).size !== keys.length || keys.some(k => !owned.includes(k))) {
    throw new Error('ordering must select every owned trigger exactly once');
  }
  // Do not mutate the live room until declaration succeeds: malformed
  // restored state or a full stack must not consume either player's choice.
  const next = structuredClone(pending);
  next.selected[String(owner)] = [...keys];
  next.awaiting.shift();
  if (next.awaiting.length) {
    room.pendingTriggerOrder = next;
    return {pending:true,awaiting:next.awaiting[0]};
  }
  const allKeys = [next.activePlayer,1-next.activePlayer].flatMap(who =>
    next.selected[String(who)] ||
    next.effects.filter(e => e.owner === who).map(e => e.key)
  );
  // Only clear the pending choice after successfully declaring the stack.
  declareAutomaticGroup(room,next.effects,next.activePlayer,allKeys);
  room.pendingTriggerOrder = null;
  return {pending:false,awaiting:null};
}

export function resolveEffectStack(room, { getZone, execute, onResult, fingerprint } = {}) {
  requireRecord(room, 'room');
  if (typeof getZone !== 'function' || typeof execute !== 'function') {
    throw new TypeError('getZone and execute callbacks required');
  }
  room.effectStack ??= [];
  if (fingerprint !== undefined && typeof fingerprint !== 'function') {
    throw new TypeError('fingerprint must be a function');
  }
  const results = [];
  const seen = new Set();
  let steps = 0;
  while (room.effectStack.length) {
    // R26: never mistake a finite repeated action for a deadlocked chain.
    // The caller supplies a stable signature of *meaningful game state*.
    // A repeated stack and repeated game state means no observable progress.
    if (fingerprint) {
      const signature = fingerprint(room);
      if (typeof signature !== 'string' || signature.length > 500_000) {
        throw new TypeError('fingerprint must return a bounded string');
      }
      const stackKey = JSON.stringify(room.effectStack.map(e=>[
        e.effectId,e.owner,e.sourceId,e.exception,e.priority,e.payload
      ]));
      const key = signature + '\\n' + stackKey;
      if (seen.has(key)) {
        const error = new Error('effect cycle detected with no game-state progress');
        error.code = 'EFFECT_CYCLE';
        error.steps = steps;
        throw error;
      }
      seen.add(key);
    }
    if (++steps > 256) {
      const error = new Error('effect resolution safety budget reached; no winner assigned');
      error.code = 'EFFECT_SAFETY_LIMIT';
      throw error;
    }
    const effect = room.effectStack.pop();
    const zone = effect.sourceId ? getZone(effect.sourceId) : null;
    const protectedEffect = EXCEPTIONS.has(effect.exception);
    const validSource = !effect.sourceId || protectedEffect ||
      (zone && SAFE_ZONES.has(zone.zone) && (!validOwner(zone.player) || zone.player === effect.owner));
    if (!validSource) {
      const result = { effectId: effect.effectId, sequence: effect.sequence, status: 'negated-source-moved' };
      results.push(result);
      onResult?.(result, effect);
      continue;
    }
    execute(effect);
    const result = { effectId: effect.effectId, sequence: effect.sequence, status: 'resolved' };
    results.push(result);
    onResult?.(result, effect);
  }
  return results;
}

export function registerPersistent(room, item) {
  requireRecord(room, 'room');
  requireRecord(item, 'item');
  if (!validId(item.kind) || !validOwner(item.owner) || !validId(item.sourceId)) {
    throw new TypeError('persistent effect requires kind, owner and sourceId');
  }
  room.persistentEffects ??= [];
  const duplicate = room.persistentEffects.find(e => e.sourceId === item.sourceId && e.kind === item.kind);
  if (duplicate) return duplicate;
  if (room.persistentEffects.length >= 256) throw new Error('persistent effect limit exceeded');
  room.persistentSequence = (room.persistentSequence || 0) + 1;
  const entry = {
    id: 'continuous-' + room.persistentSequence,
    owner: item.owner,
    kind: item.kind,
    sourceId: item.sourceId,
    anchorId: item.anchorId ?? null,
    counters: Math.max(0, Math.floor(item.counters || 0)),
    data: structuredClone(item.data ?? {}),
    expires: item.expires || 'manual',
    createdAtTurn: room.turnNumber || 0
  };
  room.persistentEffects.push(entry);
  return entry;
}

export function endPersistent(room, predicate) {
  requireRecord(room, 'room');
  if (typeof predicate !== 'function') throw new TypeError('predicate required');
  room.persistentEffects ??= [];
  const old = room.persistentEffects.length;
  room.persistentEffects = room.persistentEffects.filter(item => !predicate(item));
  return old - room.persistentEffects.length;
}

export function tickPersistent(room, event) {
  requireRecord(event, 'event');
  return endPersistent(room, item =>
    (item.expires === 'anchor-destroyed' && event.type === 'destroyed' && event.unitId === item.anchorId) ||
    (item.expires === 'source-left-field' && event.type === 'zone-changed' && event.unitId === item.sourceId &&
      event.to !== 'field' && event.to !== 'integration') ||
    (item.expires === 'turn-end' && event.type === 'turn-ended' && event.turnNumber >= item.createdAtTurn &&
      event.activePlayer === item.owner)
  );
}
