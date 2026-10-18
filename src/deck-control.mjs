import {effectUsedThisTurn} from './effect-usage.mjs';
import {actionLocked} from './demon-effects.mjs';
import {activeBorrowed,borrowedProfile} from './borrowed-state.mjs';
const PROPHET='COC-27-007',ORACLE='COC-27-012';
const snapshot=(r,ids)=>ids.map(id=>({id,revision:r.units[id].zoneRevision||0}));
const legal=(r,who,items)=>items.filter(t=>r.players[who].deck.includes(t.id)&&(r.units[t.id]?.zoneRevision||0)===t.revision).map(t=>t.id);
function sourceValid(r,p,H){
 const u=r.units[p.sourceId],z=u&&H.zone(r,u.id);
 const area=p.sourceZone||'field';
 return u?.cardId===(p.sourceCardId||p.cardId)&&!u.effectsNegated&&z?.zone===area&&z.player===p.sourceOwner&&((area==='integration'?u.integrationRevision:u.fieldRevision)||0)===p.sourceRevision;
}
export function beginNaturalDraw(r,who,H){
 const sourceId=r.players[who].field.find(id=>id&&r.units[id].cardId===PROPHET&&!r.units[id].effectsNegated&&!actionLocked(r,id)&&!effectUsedThisTurn(r,who,id,1));
 if(!sourceId){
  const g=activeBorrowed(r,who).find(g=>borrowedProfile(g.cardId,g.number).action==='prophet'&&g.history.usedTurns['natural-draw']!==r.turnNumber);
  if(g&&!actionLocked(r,r.players[who].integration)){
   const id=r.players[who].integration;g.history.usedTurns['natural-draw']=r.turnNumber;
   r.pendingNaturalDraw={who,turn:r.turnNumber,sourceId:id,stage:'response'};
   H.queueTriggers(r,[{key:`copied-prophet-${r.turnNumber}-${id}`,effectId:'monster-trigger-resolution',owner:who,sourceId:id,sourceZone:'integration',priority:0,
    payload:{cardId:'COC-21-001',eventTurn:r.turnNumber,sourceRevision:r.units[id].integrationRevision||0,borrowedKey:g.key,borrowedCardId:g.cardId,borrowedNumber:g.number,eventData:{}}}]);return;
  }
  H.draw(r,who,{kind:'natural'});if(r.status==='active')r.phase='MAIN';return;
 }
 r.pendingNaturalDraw={who,turn:r.turnNumber,sourceId,stage:'response'};
 H.queueTriggers(r,[{key:`prophet-${r.turnNumber}-${sourceId}`,effectId:'monster-trigger-resolution',owner:who,sourceId,sourceZone:'field',priority:0,
  payload:{cardId:PROPHET,eventTurn:r.turnNumber,sourceRevision:r.units[sourceId].fieldRevision||0}}]);
}
export function resolveProphet(r,e,H){
 const pending=r.pendingNaturalDraw;
 if(!pending||pending.sourceId!==e.sourceId||pending.who!==e.owner||pending.turn!==r.turnNumber)return;
 const p=r.players[e.owner];
 if(!p.deck.length)H.reload(r,e.owner);
 if(r.status!=='active')return;
 if(!p.deck.length){H.drawFailure(r,e.owner);r.pendingNaturalDraw=null;if(r.status==='active')r.phase='MAIN';return;}
 pending.stage='choice';
 r.pendingDeckSearch={deckControl:'crystal',cardId:PROPHET,who:e.owner,sourceOwner:e.owner,sourceId:e.sourceId,sourceRevision:e.payload.sourceRevision,choices:snapshot(r,p.deck.slice(0,3)),sourceCardId:r.units[e.sourceId].cardId,sourceZone:H.zone(r,e.sourceId).zone};
 H.log(r,'search','수정 예언자: 덱 위 최대 3장 중 일반 드로우할 1장 선택');
}
export function settleProphet(r,e,H){
 const p=r.pendingNaturalDraw;
 if(e.payload?.cardId!==PROPHET&&e.payload?.borrowedCardId!==PROPHET||!p||p.sourceId!==e.sourceId||p.stage!=='response')return;
 r.pendingNaturalDraw=null;
 if(r.status==='active'&&r.turn===p.who&&r.turnNumber===p.turn){
  H.draw(r,p.who,{kind:'natural'});if(r.status==='active')r.phase='MAIN';
  H.log(r,'draw','수정 예언자 대체 효과 불발/무효: 일반 드로우 1장 처리');
 }
}
export function beginOracle(r,e,H){
 const order=[e.owner,1-e.owner],choicesByPlayer=Object.fromEntries(order.map(who=>[who,snapshot(r,r.players[who].deck)]));
 const awaiting=order.filter(who=>choicesByPlayer[who].length);
 if(!awaiting.length)return;
 r.pendingDeckSearch={deckControl:'oracle',cardId:ORACLE,who:awaiting[0],awaiting,choicesByPlayer,sourceOwner:e.owner,sourceId:e.sourceId,sourceRevision:e.payload.sourceRevision,
  sourceCardId:r.units[e.sourceId].cardId,sourceZone:H.zone(r,e.sourceId).zone};
 H.log(r,'search','오라클: 각 플레이어가 자기 덱에서 맨 위로 올릴 카드 비공개 선택');
}
export function deckControlView(r,viewer,cards){
 const p=r.pendingDeckSearch;
 const choices=legal(r,p.who,p.deckControl==='crystal'?p.choices:p.choicesByPlayer[p.who]);
 return {who:p.who,cardId:p.cardId,zone:'deck',deckControl:p.deckControl,
  ...(viewer===p.who?{choices:choices.map(id=>({id,card:cards.get(r.units[id].cardId)})).sort((a,b)=>a.card.id.localeCompare(b.card.id)||a.id.localeCompare(b.id))}:{})};
}
export function chooseDeckControl(r,who,id,H){
 const p=r.pendingDeckSearch;if(!p?.deckControl||p.who!==who)H.fail(403,'이 덱 선택의 선택권자가 아닙니다.');
 const fallback=()=>{
  r.pendingDeckSearch=null;
  if(p.deckControl==='crystal'){
   const pending=r.pendingNaturalDraw;r.pendingNaturalDraw=null;
   if(pending&&r.status==='active'){H.draw(r,who,{kind:'natural'});if(r.status==='active')r.phase='MAIN';}
  }
 };
 if(!sourceValid(r,p,H)){fallback();H.log(r,'search','덱 조작 소스 이탈/재진입·무효로 선택 종료');return;}
 const choices=legal(r,who,p.deckControl==='crystal'?p.choices:p.choicesByPlayer[who]);
 if(!choices.length){
  if(p.deckControl==='crystal'){fallback();return;}
 }else{
  if(!choices.includes(id))H.fail(409,'현재 허용된 자기 덱 후보 중에서 선택하세요.');
  if(p.deckControl==='crystal'){
   H.takeDraw(r,who,id,{kind:'natural'});H.shuffle(r.players[who].deck);
   r.pendingNaturalDraw=null;r.pendingDeckSearch=null;if(r.status==='active')r.phase='MAIN';
   H.log(r,'draw','수정 예언자: 선택한 1장 드로우 후 남은 덱 전체를 섞음');return;
  }
  const deck=r.players[who].deck;deck.splice(deck.indexOf(id),1);deck.unshift(id);
  H.log(r,'search',`${r.players[who].label}: 비공개로 선택한 덱 카드 1장을 맨 위로 이동`);
 }
 p.awaiting.shift();while(p.awaiting.length&&!legal(r,p.awaiting[0],p.choicesByPlayer[p.awaiting[0]]).length)p.awaiting.shift();
 if(p.awaiting.length)p.who=p.awaiting[0];else r.pendingDeckSearch=null;
}
