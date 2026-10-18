/**
 * R18: actual combat attack and an effect-specific treated attack are distinct.
 * In particular, Black Metal Magician's 250 value is solely a condition value,
 * never the amount rolled for a normal attack.
 */
import {weaponAttackBonus} from './weapon-equipment.mjs';
import {continuousAttackBonus} from './protection-auras.mjs';
import {blackMetalAttackModifier} from './black-metal-state.mjs';
import {copperTarget} from './linked-card-stats.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';
export const BLACK_METAL_MAGICIAN_ID='COC-22-015';

export function actualAttack(unit,{room,getZone}={}) {
 const linked=copperTarget(room,unit);
 if(linked){
  // The target is restricted to a field monster, so this cannot recurse into
  // another integrated player's override. The bearer's Sword is layered later.
  const zone=getZone||((r,id)=>{const player=r.players.findIndex(p=>p.field.includes(id)||p.integration===id);return player<0?null:{player,zone:r.players[player].integration===id?'integration':'field'};});
  return Math.floor(swordActualAttack(room,linked,{getZone:zone})/2);
 }
 // Live yokai contributions now share the source-keyed continuous path;
 // legacy cached fieldAura is only meaningful without a room context.
 const aura=room?0:Number(unit?.fieldAura?.amount||0);
 const equipment=room?weaponAttackBonus(room,unit):Number(unit?.weaponAttackBonus||0);
 const tempering=(unit?.temperingBonuses||[]).filter(b=>!room||b.turn===room.turnNumber).reduce((n,b)=>n+b.amount,0);
 const continuous=room?continuousAttackBonus(room,unit):Number(unit?.continuousAttackBonus||0);
 const raw=blackMetalAttackModifier(room,unit)+tempering+Number(unit?.atk)+(unit?.effectsNegated?0:Number(unit?.historyAttackBonus||0)+Number(unit?.clayAttackBonus||0)+equipment)+aura+continuous;
 return Number.isFinite(raw)?Math.max(0,Math.floor(raw)):0;
}

/** Used ONLY when a card condition explicitly allows "treated as" ATK. */
export function treatedAttackForCondition(unit) {
 const actual=actualAttack(unit);
 if((unit?.cardId===BLACK_METAL_MAGICIAN_ID||unit?.borrowedTreated250)&&!unit.effectsNegated)return Math.max(actual,250);
 return actual;
}
