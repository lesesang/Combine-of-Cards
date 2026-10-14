// Source/target IDs from the committed runtime catalog. New base-stat and
// hand/deck/grave restoration rules confirmed by the user on 2026-10-14.
export const evolutionRules=Object.freeze({
 'COC-03-003':{source:null,target:'COC-03-004'},
 'COC-08-010':{source:'COC-08-004',target:'COC-08-011'},
 'COC-20-007':{source:'COC-20-006',target:'COC-20-008'},
 'COC-23-006':{source:'COC-23-001',target:'COC-23-007'},
 'COC-24-009':{source:'COC-24-001',target:'COC-24-010'},
 'COC-26-009':{source:'COC-26-001',target:'COC-26-010'},
 'COC-30-009':{source:'COC-30-008',target:'COC-30-010'}
});
export const evolutionSpellIds=Object.freeze(Object.keys(evolutionRules));
const fail=message=>{const e=new Error(message);e.status=409;throw e;};
export function validateEvolution(room,who,cardId,cards){
 const rule=evolutionRules[cardId],id=room.players[who].integration,u=room.units[id];
 if(!rule||!u||rule.source&&u.cardId!==rule.source)fail('진화에 필요한 일체화 카드가 없습니다.');
 if(cardId==='COC-20-007'&&room.players[who].hp>500)fail('체력이 500 이하여야 합니다.');
 const target=cards.get(rule.target);
 if(!target||target.deckId!==room.players[who].deckId||target.type!=='일체화')fail('같은 덱의 진화 카드가 데이터에 없습니다.');
 return {evolutionSourceId:id,evolutionSourceCardId:u.cardId,evolutionRevision:u.integrationRevision||0};
}
export function natureEvolutionCosts(room,who,sourceId,cards){
 if(!room.players[who].hand.includes(sourceId)||room.units[sourceId]?.cardId!=='COC-30-009')fail('패의 숲속의 맹약만 비용을 선택할 수 있습니다.');
 validateEvolution(room,who,'COC-30-009',cards);
 const ids=room.players[who].deck.filter(id=>cards.get(room.units[id]?.cardId)?.attribute==='자연')
  .sort((a,b)=>room.units[a].cardId.localeCompare(room.units[b].cardId)||a.localeCompare(b));
 if(ids.length<2)fail('덱에 비용으로 버릴 자연 속성 카드가 2장 필요합니다.');
 return ids;
}
export function evolutionStillValid(room,who,cardId,body){
 if(!evolutionRules[cardId])return true;
 const id=room.players[who].integration,u=room.units[id];
 return Boolean(u&&id===body.evolutionSourceId&&u.cardId===body.evolutionSourceCardId&&
  (u.integrationRevision||0)===body.evolutionRevision);
}
export function evolveIntegration(room,who,cardId,body,cards,H){
 if(!evolutionStillValid(room,who,cardId,body))return;
 const u=room.units[body.evolutionSourceId],next=cards.get(evolutionRules[cardId].target);
 const oldBase=Number.isFinite(u.baseAtk)?u.baseAtk:Math.max(0,Number(cards.get(u.cardId)?.atk)||0);
 const newBase=Math.max(0,Number(next.atk)||0),previous=u.cardId;
 u.evolutionOriginalCardId??=previous;
 u.cardId=next.id;u.atk=Math.max(0,newBase+u.atk-oldBase);u.baseAtk=newBase;
 // HP is the player's HP for integrations. Never turn a null unit HP into 0.
 H.log(room,'evolve',`${cards.get(previous).name} → ${next.name}`);
 H.onIntegrationEnter(room,who,u.id);
}
export function restoreEvolutionCard(unit,to){
 if(unit.evolutionOriginalCardId&&['hand','deck','grave'].includes(to)){
  unit.cardId=unit.evolutionOriginalCardId;delete unit.evolutionOriginalCardId;
 }
}
