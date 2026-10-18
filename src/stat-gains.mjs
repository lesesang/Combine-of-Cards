// Positive additive gains are different from printed bases, set/copy/swap,
// costs, damage and the confirmed independent Sword x2 multipliers.
import {borrowedTraits} from './borrowed-state.mjs';
import {continuousApplies} from './shared-state.mjs';
export function refreshStatAttributes(r,cards){
 for(const u of Object.values(r.units)){
  u.statAttribute=(cards.get(u.cardId)||u.tokenCard)?.attribute||'';
  u.statAttributeCardId=u.cardId;
 }
}
function recipient(r,target){
 if(target.player===0||target.player===1){
  const p=r.players[target.player];
  return {who:target.player,unit:p.integration?r.units[p.integration]:null};
 }
 const unit=r.units[target.id];
 if(!unit)return {who:null,unit:null};
 // Off-field gains (for example Lantern's drawn monster) still belong to
 // the player holding the card, not a previous battlefield controller.
 const who=r.players.findIndex(p=>p.integration===target.id||
  ['field','hand','deck','grave','extra','banished'].some(area=>p[area]?.includes(target.id)));
 return {who:who<0?unit.owner:who,unit};
}
export function statGainFactor(r,target){
 const {who,unit}=recipient(r,target);
 if(who!==0&&who!==1)return 1;
 const attribute=unit?.statAttributeCardId===unit?.cardId?unit?.statAttribute:unit?.tokenCard?.attribute;
 const dragon=/용|드래곤/.test(attribute||'');
 const kings=dragon?r.players.filter(p=>{
  const u=p.integration&&r.units[p.integration];return u?.cardId==='COC-11-003'&&!u.effectsNegated;
 }).length:0;
 const suppressors=r.players.reduce((n,p,owner)=>{
  const enemy=r.players[1-owner];
  const applies=target.player!==undefined?who!==owner:continuousApplies(r,target.id,[...enemy.field,enemy.integration,...enemy.hand,...enemy.deck,...enemy.grave,...enemy.extra,...(enemy.banished||[])].filter(Boolean));
  return n+(applies?p.field.filter(id=>id&&r.units[id]?.cardId==='COC-11-005'&&!r.units[id].effectsNegated).length+borrowedTraits(r,owner,'gain-suppressor').length:0);
 },0);
 return 1.5**kings*0.5**suppressors;
}
export function scaledStatGain(r,target,amount){
 if(!Number.isFinite(amount)||amount<0)throw new Error('stat gain must be finite and nonnegative');
 return Math.max(0,Math.floor(amount*statGainFactor(r,target)));
}
export function gainUnitStats(r,id,{atk=0,hp=0}){
 const u=r.units[id];if(!u)return {atk:0,hp:0};
 const applied={atk:scaledStatGain(r,{id},atk),hp:Number.isFinite(u.hp)?scaledStatGain(r,{id},hp):0};
 u.atk+=applied.atk;if(Number.isFinite(u.hp))u.hp+=applied.hp;
 return applied;
}
export function gainPlayerStats(r,who,{atk=0,hp=0}){
 const p=r.players[who],applied={atk:scaledStatGain(r,{player:who},atk),hp:scaledStatGain(r,{player:who},hp)};
 p.hp+=applied.hp;
 if(applied.atk){
  p.playerAtkBonus=(p.playerAtkBonus||0)+applied.atk;
  if(p.integration){const u=r.units[p.integration];u.atk+=applied.atk;u.playerAttackBonusApplied=(u.playerAttackBonusApplied||0)+applied.atk;}
 }
 return applied;
}
