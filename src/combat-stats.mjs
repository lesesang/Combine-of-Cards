/**
 * R18: actual combat attack and an effect-specific treated attack are distinct.
 * In particular, Black Metal Magician's 250 value is solely a condition value,
 * never the amount rolled for a normal attack.
 */
import {weaponAttackBonus} from './weapon-equipment.mjs';
export const BLACK_METAL_MAGICIAN_ID='COC-22-015';

export function actualAttack(unit,{room,getZone}={}) {
 let aura=Number(unit?.fieldAura?.amount||0);
 if(aura&&room){
  const source=room.units[unit.fieldAura.sourceId],z=getZone?.(room,unit.id);
  if(!source||source.effectsNegated||source.cardId!=='COC-08-004'||(source.integrationRevision||0)!==unit.fieldAura.sourceRevision||z?.zone!=='field'||room.players[z.player].integration!==source.id)aura=0;
 }
 const equipment=room?weaponAttackBonus(room,unit):Number(unit?.weaponAttackBonus||0);
 const raw=Number(unit?.atk)+(unit?.effectsNegated?0:Number(unit?.historyAttackBonus||0)+Number(unit?.clayAttackBonus||0)+equipment)+aura;
 return Number.isFinite(raw)?Math.max(0,Math.floor(raw)):0;
}

/** Used ONLY when a card condition explicitly allows "treated as" ATK. */
export function treatedAttackForCondition(unit) {
 const actual=actualAttack(unit);
 if(unit?.cardId===BLACK_METAL_MAGICIAN_ID)return Math.max(actual,250);
 return actual;
}
