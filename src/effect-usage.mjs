// Limits belong to a physical card UID and its individual effect, never to a
// card name, effect text, or every card with the same catalog ID.
export const FUSION_UP_ID='COC-22-008';
const key=(unit,effectNumber)=>`${unit.cardId}:${effectNumber}`;
export function effectUsedThisTurn(room,who,sourceUnitId,effectNumber){
 const unit=room.units[sourceUnitId];
 return !!unit&&unit.effectUsage?.[key(unit,effectNumber)]===room.turnNumber;
}
export function requireUnusedEffect(room,who,sourceUnitId,effectNumber){
 if(effectUsedThisTurn(room,who,sourceUnitId,effectNumber)){
  const error=new Error('이 카드의 효과는 이번 턴에 이미 사용했습니다.');error.status=409;throw error;
 }
}
export function markEffectUsed(room,who,sourceUnitId,effectNumber){
 const unit=room.units[sourceUnitId];if(!unit)throw new Error('effect usage source is missing');
 unit.effectUsage??={};unit.effectUsage[key(unit,effectNumber)]=room.turnNumber;
}
// Old saves only recorded a catalog ID. Attribute those records only when a
// single physical source is identifiable. Keep ambiguous history for audit;
// never copy one old use onto every distinct card. Runs once when loading.
export function migrateLegacyEffectUsage(room){
 for(const [who,p] of (room.players||[]).entries()){
  const controlled=new Set(['field','hand','deck','grave','banished','extra'].flatMap(z=>p[z]||[]));controlled.add(p.integration);
  const records=[...Object.entries(p.abilityUsed||{}).map(([cid,turn])=>[`${cid}:1`,turn]),...Object.entries(p.effectUsage||{})];
  for(const [effectKey,turn] of records){
   const cid=effectKey.split(':')[0];
   const candidates=Object.entries(room.units||{}).filter(([id,u])=>(u.cardId===cid||u.originalCardId===cid)&&(u.owner===who||controlled.has(id)));
   const pending=room.pendingAbility;
   const identified=pending?.who===who&&pending.cardId===cid&&room.turnNumber===turn?room.units[pending.sourceId]:candidates.length===1?candidates[0][1]:null;
   if(identified){identified.effectUsage??={};identified.effectUsage[effectKey]=Math.max(identified.effectUsage[effectKey]??-1,turn);}
   else if(turn===room.turnNumber){room.legacyEffectUsageUnresolved??=[];room.legacyEffectUsageUnresolved.push({who,effectKey,turn});}
  }
  delete p.abilityUsed;delete p.effectUsage;
 }
}
