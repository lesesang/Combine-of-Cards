import {weaponAttackBonus,hasWeaponAbility} from './weapon-equipment.mjs';
import {refreshContinuousAuras} from './protection-auras.mjs';
import {scaledStatGain} from './stat-gains.mjs';
// Physical cards actually used/summoned during this game. Never reconstruct
// missing history from today's grave/field or from a truncated public log.
const EVOLVED_HISTORY=Object.freeze({
 'COC-23-007':{deck:'23',family:'라이드',amount:50},
 'COC-24-010':{deck:'24',family:'매치',amount:55},
 'COC-26-010':{deck:'26',family:'매치',amount:55}
});
export function isRideMachine(card){
 return card?.deckId==='23'&&card.type.includes('몬스터')&&card.name.replace(/\s/g,'').includes('라이드머신');
}
export function cardUseForbidden(r,who,card){
 return !!r.players[who].rideMachineLock&&isRideMachine(card)&&card.id!=='COC-23-008';
}
export function recordCardUse(r,who,id,cards){
 const unit=r.units[id],card=unit&&cards.get(unit.cardId);if(!card)return;
 const p=r.players[who];p.usedCardsGame??={};
 p.lastCardUseTurn=r.turnNumber;
 // A recycled UID is still one card, not a new copy for scaling effects.
 p.usedCardsGame[id]??={cardId:card.id};
 if(['COC-20-006','COC-20-008'].includes(card.id))p.usedBurningIntegration=true;
 refreshHistoryAttack(r,cards);
}
export function recordSummonedCard(r,who,id,cards){
 const u=r.units[id];if(!u||u.cardId!=='COC-19-001')return;
 r.claySummonedCards??={};r.claySummonedCards[id]??={cardId:u.cardId,controller:who};
 refreshHistoryAttack(r,cards);
}
export function refreshHistoryAttack(r,cards){
 refreshContinuousAuras(r,cards);
 const clayIds=Object.keys(r.claySummonedCards||{});
 for(const p of r.players)for(const id of p.field.filter(Boolean)){
  const u=r.units[id];if(u.cardId!=='COC-19-001')continue;
  const bonus=u.effectsNegated?0:scaledStatGain(r,{id},clayIds.filter(uid=>uid!==id).length*50);
  // Change the continuous HP layer only by its delta, preserving damage.
  u.hp+=bonus-(u.clayHpBonus||0);u.clayHpBonus=bonus;u.clayAttackBonus=bonus;
 }

 for(const u of Object.values(r.units)){delete u.historyAttackBonus;delete u.fieldAura;}
 for(const u of Object.values(r.units)){
  delete u.weaponAttackBonus;delete u.weaponDoubleAttack;
 }
 for(const p of r.players){
  const host=p.integration&&r.units[p.integration];
  if(host){host.weaponAttackBonus=weaponAttackBonus(r,host);host.weaponDoubleAttack=hasWeaponAbility(r,host,'COC-09-003');}
  const source=p.integration&&r.units[p.integration];
  if(source?.cardId==='COC-08-004'&&!source.effectsNegated){
   for(const id of p.field.filter(Boolean))if(cards.get(r.units[id].cardId)?.attribute==='요괴')
    r.units[id].fieldAura={sourceId:p.integration,sourceRevision:source.integrationRevision||0,amount:scaledStatGain(r,{id},100)};
  }
  const u=p.integration&&r.units[p.integration],rule=u&&EVOLVED_HISTORY[u.cardId];if(!rule)continue;
  const count=Object.values(p.usedCardsGame||{}).filter(e=>{
   const c=cards.get(e.cardId);
   return c?.deckId===rule.deck&&c.type.includes('몬스터')&&(rule.family==='라이드'?isRideMachine(c):c.name.includes('매치'));
  }).length;
  // A separate continuous layer preserves the user's base-replacement and
  // existing-buffs evolution rule; negation suppresses it in actualAttack.
  u.historyAttackBonus=scaledStatGain(r,{id:u.id},count*rule.amount);
 }
}
