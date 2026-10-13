// Serializable, independent per-player/card/effect turn limits.
export const FUSION_UP_ID='COC-22-008';
export function effectUsedThisTurn(room,who,cardId,effectNumber){
 return room.players[who].effectUsage?.[`${cardId}:${effectNumber}`]===room.turnNumber;
}
export function requireUnusedEffect(room,who,cardId,effectNumber){
 if(effectUsedThisTurn(room,who,cardId,effectNumber)){
  const error=new Error('이 효과는 이번 턴에 이미 사용했습니다.');error.status=409;throw error;
 }
}
export function markEffectUsed(room,who,cardId,effectNumber){
 room.players[who].effectUsage??={};
 room.players[who].effectUsage[`${cardId}:${effectNumber}`]=room.turnNumber;
}
