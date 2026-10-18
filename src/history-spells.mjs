import {recordCopyHistory} from './copy-history.mjs';
import {hurtSharedUnits} from './shared-unit-effects.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
// Keep rule history in state, never infer it from the capped public log.
export function recordTopToGrave(r,who){
 recordCopyHistory(r,'mill',{who});
 const key=String(r.turnNumber);r.topToGraveCounts??={};
 r.topToGraveCounts[key]=(r.topToGraveCounts[key]||0)+1;
 for(const turn of Object.keys(r.topToGraveCounts))if(Number(turn)<r.turnNumber-1)delete r.topToGraveCounts[turn];
}
export function recentMillCount(r){return (r.topToGraveCounts?.[r.turnNumber]||0)+(r.topToGraveCounts?.[r.turnNumber-1]||0);}
export function refreshPeakAttack(r,H){
 for(const p of r.players)for(const id of p.field.filter(Boolean)){
  const u=r.units[id];u.peakAttack=Math.max(u.peakAttack||0,swordActualAttack(r,id,{getZone:H.zone}));
 }
}
export function recordMonsterLoss(r,id,{sourceId=null,sourcePlayer=null,kind='destroy'}={},H){
 const u=r.units[id],z=u&&H.zone(r,id);if(!u||z?.zone!=='field'||!Number.isFinite(u.hp))return;
 const killer=sourceId?H.zone(r,sourceId):null;
 const entry={id,cardId:u.cardId,turn:r.turnNumber,kind,peakAttack:Math.max(u.peakAttack||0,swordActualAttack(r,id,{getZone:H.zone})),
  sourceId,sourcePlayer:sourcePlayer??(killer?.zone==='integration'?killer.player:null),sourceRevision:sourceId?(r.units[sourceId]?.fieldRevision||0):null};
 recordCopyHistory(r,'loss',{who:z.player,entry});
 const p=r.players[z.player];p.recentMonsterLosses??=[];p.recentMonsterLosses.push(entry);p.recentMonsterLosses=p.recentMonsterLosses.slice(-3);
 // Eligibility is historical, unlike the damage's most-recent-three window.
 p.monsterLossCount=(p.monsterLossCount||0)+1;
 p.monsterKillers??={players:[],units:{}};
 if(entry.sourcePlayer!==null&&!p.monsterKillers.players.includes(entry.sourcePlayer))p.monsterKillers.players.push(entry.sourcePlayer);
 if(sourceId)p.monsterKillers.units[sourceId]=true;
}
export function validWrathTarget(r,who,target,H){
 const p=r.players[who];if((p.monsterLossCount||0)<3||(p.recentMonsterLosses||[]).length<3)return false;
 if(target?.type==='player')return [0,1].includes(target.player)&&(p.monsterKillers?.players||[]).includes(target.player);
 return target?.type==='unit'&&H.zone(r,target.id)?.zone==='field'&&!!p.monsterKillers?.units?.[target.id];
}
export function resolveWrath(ctx){
 const {r,who,body,H}=ctx;if(!validWrathTarget(r,who,body.target,H))return;
 const amount=Math.floor(r.players[who].recentMonsterLosses.reduce((n,e)=>n+e.peakAttack,0)/3);
 if(body.target.type==='unit')hurtSharedUnits(r,[body.target.id],amount,H);else damagePlayer(r,body.target.player,amount);
 H.outcome(r);
}
export function resolvePredatorJudgment(ctx){
 const {r,body,H}=ctx;let amount=0;
 for(let i=0;i<recentMillCount(r);i++)amount+=ctx.rollValue(100);
 if(body.target.type==='unit')hurtSharedUnits(r,[body.target.id],amount,H);else damagePlayer(r,body.target.player,amount);
 H.outcome(r);
}
export function cartoonChoices(r,p,cards){
 return p.choices.filter(id=>r.players[p.who].deck.includes(id)&&(r.units[id]?.zoneRevision||0)===p.revisions[id]&&cards.get(r.units[id]?.cardId)?.name.includes('카툰'));
}
export function beginCartoonSchedule(r,who,H){
 const choices=r.players[who].deck.filter(id=>H.cards.get(r.units[id]?.cardId)?.name.includes('카툰'));
 if(!choices.length){H.endTurn(r,who);return;}
 r.pendingDeckSearch={who,cardId:'COC-05-005',cartoonSchedule:true,choices,revisions:Object.fromEntries(choices.map(id=>[id,r.units[id].zoneRevision||0])),remaining:Math.min(2,choices.length)};
}
export function chooseCartoonSchedule(r,who,id,H){
 const p=r.pendingDeckSearch;if(!p?.cartoonSchedule||p.who!==who)H.fail(403,'일정표의 검색 선택권자가 아닙니다.');
 const legal=cartoonChoices(r,p,H.cards);
 if(legal.length){
  if(!legal.includes(id))H.fail(409,'덱에서 카툰 카드 한 장을 선택하세요.');
  H.move(r,id,'hand',who);p.remaining--;p.choices=p.choices.filter(uid=>uid!==id);
  H.log(r,'search',`카툰 방영 일정표: ${H.name(r,id)} 공개 후 패로 이동`);
 }
 if(!p.remaining||!cartoonChoices(r,p,H.cards).length){r.pendingDeckSearch=null;H.endTurn(r,who);}
}
