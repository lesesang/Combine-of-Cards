import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
// Rule names are identities, not copied abilities, types, or printed data.
export const ELEMENTAL_DRAGON_FORMS=Object.freeze({
 'COC-32-011':'COC-32-001',
 'COC-32-012':'COC-32-002',
 'COC-32-013':'COC-32-003',
 'COC-32-014':'COC-32-004'
});
export const elementalFormId=id=>ELEMENTAL_DRAGON_FORMS[id]||id;
export function hasElementalForm(room,ids,formId){
 return ids.some(id=>id&&elementalFormId(room.units[id]?.cardId)===formId);
}

// Count actual controlled turn starts, not elapsed global turns or original
// owner turns. A control transfer preserves residence; leaving resets it.
export function moveDragonResidence(unit,from,to){
 if(unit.cardId!=='COC-32-014')return;
 if(to!=='field'){delete unit.dragonResidence;return;}
 if(from?.zone!=='field')unit.dragonResidence={ownTurnStarts:0,lastTurnNumber:null};
}
export function beginDragonTurn(room,who){
 for(const id of room.players[who].field.filter(Boolean)){
  const u=room.units[id];if(u.cardId!=='COC-32-014')continue;
  // Legacy saves cannot prove unrecorded residence. Start counting now.
  u.dragonResidence??={ownTurnStarts:0,lastTurnNumber:null};
  if(u.dragonResidence.lastTurnNumber===room.turnNumber)continue;
  u.dragonResidence.ownTurnStarts++;
  u.dragonResidence.lastTurnNumber=room.turnNumber;
 }
}
export const terraReady=unit=>(unit?.dragonResidence?.ownTurnStarts||0)>=2;

export function grantElementalBattleAttack(room,sourceId,{destroyed,sourceAttack,targetAttack},H){
 const u=room.units[sourceId],z=H.zone(room,sourceId);
 if(!u||u.effectsNegated||z?.zone!=='field'||z.player!==room.turn||effectUsedThisTurn(room,room.turn,sourceId,2))return false;
 if(!(u.cardId==='COC-32-001'&&sourceAttack>targetAttack)&&!(u.cardId==='COC-32-011'&&destroyed))return false;
 markEffectUsed(room,room.turn,sourceId,2);
 if(u.bonusAttackTurn!==room.turnNumber){u.bonusAttackTurn=room.turnNumber;u.bonusAttackCount=0;}
 u.bonusAttackCount++;
 H.log(room,'effect',`${H.name(room,sourceId)}: 이 턴 추가 공격 기회 1회 획득`);
 return true;
}
