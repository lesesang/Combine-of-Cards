import {swordActualAttack} from './life-eating-sword.mjs';
import {cardUseForbidden} from './card-game-history.mjs';
import {queueCardRevival} from './death-revival.mjs';
function values(r,id,H){
 const u=r.units[id],n=swordActualAttack(r,id,{getZone:H.zone});
 return u.cardId==='COC-22-015'&&!u.effectsNegated?[n,250]:[n];
}
function candidates(r,who,sourceId,attacks,H){
 const p=r.players[who];return [...p.deck,...p.extra].filter(id=>{
  const u=r.units[id],c=u&&H.cards.get(u.cardId);
  return id!==sourceId&&c?.type.includes('몬스터')&&c.name.startsWith('블랙 메탈')&&!cardUseForbidden(r,who,c)&&values(r,id,H).some(n=>attacks.includes(n));
 });
}
export function prepareBlackMetal(r,who,body,H){
 const id=body.target?.id,u=id&&r.units[id],c=u&&H.cards.get(u.cardId);
 if(!r.players[who].field.includes(id)||!c?.type.includes('몬스터')||!c.name.startsWith('블랙 메탈'))H.fail(409,'되돌릴 자신의 블랙 메탈 몬스터가 필요합니다.');
 if(body.blackMetalRevision!==undefined&&(u.fieldRevision||0)!==body.blackMetalRevision)H.fail(409,'블랙 메탈 체인지 대상이 필드를 떠났다가 재진입했습니다.');
 if(!candidates(r,who,id,values(r,id,H),H).length)H.fail(409,'덱·엑스트라에 공격력이 맞는 다른 블랙 메탈 몬스터가 없습니다.');
 return {...body,blackMetalRevision:u.fieldRevision||0};
}
export function beginBlackMetal(r,who,body,H){
 const id=body.target.id,u=r.units[id];if(!r.players[who].field.includes(id)||(u.fieldRevision||0)!==body.blackMetalRevision)return;
 const attacks=values(r,id,H),choices=candidates(r,who,id,attacks,H);
 if(!choices.length)return;
 const origins=Object.fromEntries(choices.map(id=>[id,{zone:H.zone(r,id).zone,revision:r.units[id].zoneRevision||0}]));
 H.move(r,id,H.cards.get(u.cardId).zone==='extra'?'extra':'deck',u.owner);
 r.pendingDeckSearch={who,cardId:'COC-22-007',blackMetal:true,sourceId:id,attacks,choices,origins};
}
export function blackMetalChoices(r,p,cards){
 return p.choices.filter(id=>{
  const u=r.units[id],origin=p.origins[id];return !!u&&r.players[p.who][origin.zone].includes(id)&&(u.zoneRevision||0)===origin.revision&&!cardUseForbidden(r,p.who,cards.get(u.cardId));
 });
}
export function chooseBlackMetal(r,who,id,H){
 const p=r.pendingDeckSearch;if(!p?.blackMetal||p.who!==who)H.fail(403,'블랙 메탈 체인지의 선택권자가 아닙니다.');
 const legal=blackMetalChoices(r,p,H.cards);
 if(!legal.length||!r.players[who].field.includes(null)){r.pendingDeckSearch=null;return;}
 if(!legal.includes(id))H.fail(409,'공격력이 일치하는 블랙 메탈 몬스터를 선택하세요.');
 const originZone=p.origins[id].zone;r.pendingDeckSearch=null;
 queueCardRevival(r,who,id,H,{kind:'black-metal-change',originZone});
}
