import {applySharedUnitEffect} from './shared-unit-effects.mjs';
import {gainUnitStats,gainPlayerStats,scaledStatGain} from './stat-gains.mjs';
// Draft demon effects. Grants are JSON data, independent of the granting card.
export function actionLocked(r,id){
 const u=r.units[id];
 return !!u?.succubusLocks?.some(lock=>lock.revision===(u.fieldRevision||0));
}
export function expireSuccubusAttack(r,who){
 for(const u of Object.values(r.units))u.succubusLocks=(u.succubusLocks||[]).filter(lock=>lock.owner!==who||lock.appliedTurn>=r.turnNumber);
}
export function applySuccubus(r,who,sourceId,targetId,H){
 const source=r.units[sourceId],face=H.roll(2);
 applySharedUnitEffect(r,[targetId],H,(id,u)=>{
  if(face===1)(u.succubusLocks??=[]).push({owner:who,appliedTurn:r.turnNumber,revision:u.fieldRevision||0});
  else u.succubusLure={sourceId,sourceRevision:source.fieldRevision||0,sourceController:who,revision:u.fieldRevision||0};
 });
 H.log(r,'dice',`몽마: 1d2 = ${face} · ${face===1?'다음 자신의 어택 종료까지 공격·효과 발동 금지':'다음 공격/단일 대상 효과 유도'}`);
}
export function lureTarget(r,id,H){
 const u=r.units[id],lure=u?.succubusLure,z=H.zone(r,id);
 if(!lure||z?.zone!=='field'||lure.revision!==(u.fieldRevision||0))return null;
 const source=r.units[lure.sourceId],sz=H.zone(r,lure.sourceId);
 if(!source||sz?.zone!=='field'||sz.player!==lure.sourceController||source.fieldRevision!==lure.sourceRevision)return null;
 return {type:'unit',id:lure.sourceId};
}
// Only the next actual declaration consumes a lure. Preflight/AI never mutate it.
export function consumeLure(r,id){if(r.units[id])delete r.units[id].succubusLure;}
export function nobleTarget(r,who,target,H){
 if(target?.type==='player'&&target.player===who)return {type:'player',player:who};
 const z=target?.type==='unit'&&H.zone(r,target.id);
 if(z?.zone==='field'&&z.player===who&&Number.isFinite(r.units[target.id].hp))return {type:'unit',id:target.id};
 H.fail(409,'귀족의 강화 대상은 자신의 플레이어 또는 필드 몬스터입니다.');
}
export function grantNoble(r,who,target,H){
 target=nobleTarget(r,who,target,H);
 if(target.type==='player'){
  gainPlayerStats(r,who,{atk:30,hp:30});
 }else{
  applySharedUnitEffect(r,[target.id],H,(id,u)=>{
   const applied=gainUnitStats(r,id,{atk:30,hp:30});u.noblePermanentGains??={atk:0,hp:0};
   u.noblePermanentGains.atk+=applied.atk;u.noblePermanentGains.hp+=applied.hp;
  });
 }
 H.log(r,'effect','나락의 귀족: 아군 1명에게 게임 종료까지 공격력·체력 +30');
}
// Called after printed-stat restoration, including the grave-specific reset.
// This modifies the physical card, so new copies of its printed card do not inherit it.
export function restoreNobleStats(u){
 // Legacy scalar grants and new resolved gains both restore exactly once.
 const n=u.noblePermanent||0,atk=n+(u.noblePermanentGains?.atk||0),hp=n+(u.noblePermanentGains?.hp||0);
 u.atk+=atk;if(Number.isFinite(u.hp))u.hp+=hp;
}
export function demonAura(r,u){
 if(!u?.demonAttribute)return 0;
 const onBoard=r.players.some(p=>p.integration===u.id||p.field.includes(u.id));
 if(!onBoard)return 0;
 // The printed text has no allied restriction: both sides' demons benefit.
 return r.players.reduce((n,p)=>n+p.field.filter(id=>id&&r.units[id]?.cardId==='COC-21-012'&&!r.units[id].effectsNegated).length*scaledStatGain(r,{id:u.id},30),0);
}
export function refreshDemonAttributes(r,cards){
 for(const u of Object.values(r.units))u.demonAttribute=Boolean((cards.get(u.cardId)||u.tokenCard)?.attribute?.includes('악마'));
}
export function recordCurseDestruction(r,victimId,{sourceId,sourcePlayer,sourceCardId},H){
 const victim=r.units[victimId],z=H.zone(r,victimId);
 if(z?.zone!=='field'||!Number.isFinite(victim?.hp))return;
 const source=H.cards.get(sourceCardId||r.units[sourceId]?.cardId),who=sourcePlayer??H.zone(r,sourceId)?.player;
 if(![0,1].includes(who)||!source?.attribute?.includes('저주')||!(source.type==='주문'||source.type.includes('몬스터')))return;
 const p=r.players[who];p.curseDestructions=(p.curseDestructions||0)+1;
}
