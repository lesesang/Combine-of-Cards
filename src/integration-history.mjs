// Persistent facts, not log parsing: old saves begin recording from now.
// These requirements are use conditions, so effect negation does not waive them.
const WANDERERS=Object.freeze(['COC-10-001','COC-10-003','COC-10-004']);
function monsterOnField(r,who,cards){
 return r.players[who].field.some(id=>{
  const u=id&&r.units[id];if(!u)return false;
  const type=cards.get(u.cardId)?.type||u.tokenCard?.type||'';
  return type.includes('몬스터')||Number.isFinite(u.hp);
 });
}
export function recordWandererDeath(r,{cardId,originalOwner}){
 if(!WANDERERS.includes(cardId)||!r.players[originalOwner])return;
 const seen=r.players[originalOwner].wandererDeaths??=[];
 if(!seen.includes(cardId))seen.push(cardId);
}
export const allWanderersDied=(r,who)=>WANDERERS.every(id=>r.players[who].wandererDeaths?.includes(id));
export function observeFieldOccupancy(r,cards){
 if(r.status!=='active')return;
 const occupied=r.players.map((_,who)=>monsterOnField(r,who,cards));
 // A partially observed restored turn cannot prove a whole empty turn.
 if(r.fieldOccupancy?.turnNumber!==r.turnNumber)
  r.fieldOccupancy={turnNumber:r.turnNumber,occupied:[true,true],complete:false};
 occupied.forEach((present,who)=>{
  if(!present)return;
  r.fieldOccupancy.occupied[who]=true;
  r.players[who].emptyFieldTurns=0;
 });
}
export function beginFieldHistoryTurn(r,cards){
 if(r.fieldOccupancy?.turnNumber===r.turnNumber)return;
 r.fieldOccupancy={turnNumber:r.turnNumber,occupied:[false,false],complete:true};
 observeFieldOccupancy(r,cards);
}
export function finishFieldHistoryTurn(r,cards){
 observeFieldOccupancy(r,cards);
 const history=r.fieldOccupancy;
 if(!history||history.counted)return;
 history.counted=true;
 r.players.forEach((p,who)=>{
  p.emptyFieldTurns=history.complete&&!history.occupied[who]?Math.min(3,(p.emptyFieldTurns||0)+1):0;
 });
}
export function enemyFieldEmptyThreeTurns(r,who,cards){
 return (r.players[1-who].emptyFieldTurns||0)>=3&&!monsterOnField(r,1-who,cards);
}
