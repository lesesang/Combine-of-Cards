// Selection opens only after the effect survives the opponent response.
export const deckSearchSpellIds=Object.freeze(['COC-07-004','COC-19-004','COC-20-003','COC-24-008','COC-26-008']);
const SEARCH_NAMES=Object.freeze({
 'COC-12-003':['F=HERO'],
 'COC-22-015':['퓨전업','블랙메탈퓨전업'],
 'COC-23-004':['라이드위저드'],
 'COC-24-002':['베스트지니어스'],
 'COC-26-002':['베스트지니어스'],
 'COC-26-005':['퓨전업']
});
const sourceZone=cardId=>cardId==='COC-06-001'?'grave':'deck';
export function eligibleSearchIds(room,who,cardId,cards){
 if(!deckSearchSpellIds.includes(cardId)&&!SEARCH_NAMES[cardId]&&cardId!=='COC-06-001')return [];
 return room.players[who][sourceZone(cardId)].filter(id=>{
  const c=cards.get(room.units[id]?.cardId);if(!c)return false;
  if(cardId==='COC-06-001')return c.type==='주문'&&room.units[id].owner===who&&room.players[who].usedCardsGame?.[id]?.cardId===c.id;
  const names=SEARCH_NAMES[cardId];
  if(names){const name=c.name.replace(/\s/g,'');return cardId==='COC-12-003'?name.includes(names[0]):names.includes(name);}
  if(cardId==='COC-07-004')return ['포식자알리자','포식의맹약'].includes(c.name.replace(/\s/g,''));
  if(cardId==='COC-20-003')return c.name.replace(/\s/g,'').includes('버닝데몬즈');
  return c.type==='몬스터';
 }).sort((a,b)=>room.units[a].cardId.localeCompare(room.units[b].cardId)||a.localeCompare(b));
}
export function beginDeckSearch(room,who,cardId,cards,H,source={}){
 const ids=eligibleSearchIds(room,who,cardId,cards);
 if(!ids.length){H.log(room,'search','검색 조건에 맞는 카드가 없어 효과 종료');return;}
 room.pendingDeckSearch={who,cardId,choices:ids,...source};
 H.log(room,'search',`${room.players[who].label}: ${sourceZone(cardId)==='grave'?'묘지':'덱'}에서 가져올 카드 선택 대기`);
}
export function deckSearchView(room,viewer,cards){
 const p=room.pendingDeckSearch;if(!p)return null;
 return {who:p.who,cardId:p.cardId,zone:sourceZone(p.cardId),...(viewer===p.who?{choices:p.choices.filter(id=>eligibleSearchIds(room,p.who,p.cardId,cards).includes(id)).map(id=>({id,card:cards.get(room.units[id].cardId)}))}:{})};
}
export function finishDeckSearch(room,who,id,cards,H){
 const p=room.pendingDeckSearch;
 if(room.status!=='active'||!p||p.who!==who)H.fail(403,'카드 검색 효과의 선택권자가 아닙니다.');
 if(p.sourceId){
  const u=room.units[p.sourceId],z=H.zone(room,p.sourceId),revision=p.sourceZone==='integration'?u?.integrationRevision:u?.fieldRevision;
  if(!u||u.cardId!==p.cardId||u.effectsNegated||z?.zone!==p.sourceZone||z.player!==who||(revision||0)!==p.sourceRevision){
   room.pendingDeckSearch=null;H.log(room,'search','검색 소스 이탈/무효 상태로 불발');return;
  }
 }
 const legal=eligibleSearchIds(room,who,p.cardId,cards).filter(uid=>p.choices.includes(uid));
 if(!legal.length){room.pendingDeckSearch=null;H.log(room,'search','선택 가능한 카드가 없어 검색 종료');return;}
 if(typeof id!=='string'||!legal.includes(id))H.fail(409,'검색 조건에 맞는 카드를 선택해야 합니다.');
 H.move(room,id,'hand',room.units[id].owner);
 room.pendingDeckSearch=null;
 H.log(room,'search',`${room.players[who].label}: ${cards.get(room.units[id].cardId).name} 공개 후 패로 가져옴`);
}
