import {COUNTER_IDS,availableCounters,declareCardCounter} from './counter-effects.mjs';
export const SPELL_COUNTER_IDS=COUNTER_IDS;
export const spellResponsePlayer=room=>room.pendingSpell?(room.pendingSpell.awaiting??1-room.pendingSpell.who):null;
export function legalSpellCounters(room,who){return availableCounters(room,who,room.pendingSpell,'spell');}
export function declareSpellCounter(room,who,sourceId){return declareCardCounter(room,who,sourceId,room.pendingSpell,'spell');}
