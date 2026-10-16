import {swordActualAttack} from './life-eating-sword.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
export function prepareTrade(r,who,body,H){
 const id=body.target?.id,u=id&&r.units[id],z=u&&H.zone(r,id);
 if(z?.zone!=='field'||z.player!==who)H.fail(409,'상대에게 넘길 자신의 필드 몬스터를 선택하세요.');
 const others=r.players[1-who].field.filter(Boolean);
 if(!others.length)H.fail(409,'상대에게서 교환받을 기존 몬스터가 필요합니다.');
 if(body.tradeSourceRevision!==undefined&&(u.fieldRevision||0)!==body.tradeSourceRevision)H.fail(409,'교환할 몬스터가 이탈하거나 재진입했습니다.');
 return {...body,tradeSourceRevision:u.fieldRevision||0,tradeCandidates:body.tradeCandidates||others.map(id=>({id,revision:r.units[id].fieldRevision||0}))};
}
export function tradeChoices(r,p){
 return p.choices.filter(id=>r.players[p.who].field.includes(id)&&(r.units[id]?.fieldRevision||0)===p.revisions[id]);
}
export function beginTrade(r,who,body,H){
 const id=body.target.id,u=r.units[id];
 if(!r.players[who].field.includes(id)||(u.fieldRevision||0)!==body.tradeSourceRevision)return;
 const choices=body.tradeCandidates.filter(c=>r.players[1-who].field.includes(c.id)&&(r.units[c.id]?.fieldRevision||0)===c.revision);
 if(!choices.length)return;
 // The two transfers are committed together after the opponent chooses.
 // A temporarily fourth field card is never exposed or used for triggers.
 r.pendingDeckSearch={who:1-who,cardId:'COC-14-007',trade:true,giver:who,sourceId:id,sourceRevision:body.tradeSourceRevision,
  choices:choices.map(c=>c.id),revisions:Object.fromEntries(choices.map(c=>[c.id,c.revision]))};
}
export function chooseTrade(r,who,id,H){
 const p=r.pendingDeckSearch;if(!p?.trade||p.who!==who)H.fail(403,'트레이드의 선택권자가 아닙니다.');
 const u=r.units[p.sourceId];
 if(!r.players[p.giver].field.includes(p.sourceId)||(u?.fieldRevision||0)!==p.sourceRevision||!tradeChoices(r,p).length){r.pendingDeckSearch=null;return;}
 if(!tradeChoices(r,p).includes(id))H.fail(409,'교환 전에 자신의 필드에 있던 몬스터를 선택하세요.');
 H.transferField(r,[{id:p.sourceId,from:p.giver,to:who},{id,from:who,to:p.giver}],{sourcePlayer:p.giver});
 const units=[{id:p.sourceId,from:who,to:p.giver},{id,from:p.giver,to:who}].filter(c=>r.units[c.id]&&r.players[c.from].field.includes(c.id)).map(c=>({...c,revision:r.units[c.id].fieldRevision||0}));
 (r.tradeReturns??=[]).push({player:p.giver,turn:r.turnNumber,units});
 r.pendingDeckSearch=null;H.log(r,'effect','트레이드: 선택한 두 몬스터의 조종권 맞교환');
}
export function returnTrades(r,who,H){
 for(const e of [...(r.tradeReturns||[])]){
  if(e.player!==who||e.turn>=r.turnNumber)continue;
  r.tradeReturns.splice(r.tradeReturns.indexOf(e),1);
  const valid=e.units.filter(c=>r.players[c.from].field.includes(c.id)&&(r.units[c.id]?.fieldRevision||0)===c.revision);
  const allowed=valid.filter(c=>r.players[c.to].field.includes(null)||valid.some(other=>other.from===c.to));
  if(allowed.length)H.transferField(r,allowed);
  H.log(r,'effect',`트레이드: 필드에 남은 교환 몬스터 ${allowed.length}장 반환`);
 }
}
export function resolveSeparation(r,H){
 // Snapshot both attack rolls before damage, then detach both hosts. This
 // recoil uses attack dice but creates no attack opportunity or new phase.
 const entries=r.players.flatMap((p,who)=>{
  const id=p.integration,u=id&&r.units[id];if(!u)return [];
  const atk=swordActualAttack(r,id,{getZone:H.zone}),max=Math.min(atk,u.diceMax??atk);
  return [{id,who,amount:max>0?H.roll(max,u.diceMin??1):0}];
 });
 for(const e of entries)damagePlayer(r,e.who,e.amount);
 for(const e of entries){
  H.move(r,e.id,'grave',r.units[e.id].owner);
  H.log(r,'effect',`강제 분리: 플레이어 ${e.who+1}에게 공격 판정 ${e.amount} 피해 후 일체화·장착 해제`);
 }
 H.outcome(r);
}
