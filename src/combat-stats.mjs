/**
 * R18: actual combat attack and an effect-specific treated attack are distinct.
 * In particular, Black Metal Magician's 250 value is solely a condition value,
 * never the amount rolled for a normal attack.
 */
export const BLACK_METAL_MAGICIAN_ID='COC-22-015';

export function actualAttack(unit) {
 const raw=Number(unit?.atk);
 return Number.isFinite(raw)?Math.max(0,Math.floor(raw)):0;
}

/** Used ONLY when a card condition explicitly allows "treated as" ATK. */
export function treatedAttackForCondition(unit) {
 const actual=actualAttack(unit);
 if(unit?.cardId===BLACK_METAL_MAGICIAN_ID)return Math.max(actual,250);
 return actual;
}
