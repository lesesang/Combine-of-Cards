import {queueCardRevival} from './death-revival.mjs';
import {cardUseForbidden} from './card-game-history.mjs';
// A full observed empty turn is required; old saves cannot invent that history.
export function clayRevivalReady(r,who){
 return (r.players[who].emptyFieldTurns||0)>=1&&!r.players[who].field.some(Boolean);
}
export function clayCopyCandidates(r,who,cards){
 return r.players[who].grave.filter(id=>{
  const u=r.units[id],c=u&&cards.get(u.cardId);
  return u?.owner===who&&!u.created&&u.wasFieldDestroyed&&c?.type==='몬스터'&&
   c.zone==='main'&&c.deckId===r.players[who].deckId&&!cardUseForbidden(r,who,c);
 });
}
export function beginClayCopies(r,who,H){
 const choices=clayCopyCandidates(r,who,H.cards);
 if(!choices.length||!r.players[who].field.includes(null)){H.log(r,'effect','노지귀: 복사할 파괴 몬스터 또는 빈 칸이 없어 종료');return;}
 r.pendingDeckSearch={who,cardId:'COC-19-007',clayCopies:true,choices,
  revisions:Object.fromEntries(choices.map(id=>[id,r.units[id].zoneRevision||0]))};
}
export function legalClayCopies(r,p,cards){
 return clayCopyCandidates(r,p.who,cards).filter(id=>p.choices.includes(id)&&(r.units[id].zoneRevision||0)===p.revisions[id]);
}
export function chooseClayCopies(r,who,id,H){
 const p=r.pendingDeckSearch;
 if(r.status!=='active'||!p?.clayCopies||p.who!==who)H.fail(403,'복사할 몬스터의 선택권자가 아닙니다.');
 const legal=legalClayCopies(r,p,H.cards),count=Math.min(3,r.players[who].field.filter(id=>id===null).length);
 if(!legal.length||!count){r.pendingDeckSearch=null;H.log(r,'effect','노지귀: 후보 또는 빈 칸 소실로 종료');return;}
 if(!legal.includes(id))H.fail(409,'파괴되어 묘지에 남아 있는 자신의 몬스터를 선택하세요.');
 const cardId=r.units[id].cardId;r.pendingDeckSearch=null;
 H.graveActivation?.(r,{cardId:'COC-19-007'});
 for(let i=0;i<count;i++){
  const copy=H.instantiate(r,cardId,who);H.move(r,copy,'grave',who);
  queueCardRevival(r,who,copy,H,{kind:'clay-copy'});
 }
 H.log(r,'effect',`노지귀: ${H.name(r,id)} 기본 상태 복사본 ${count}장 부활 예약, 원본은 묘지 유지`);
}
