import {restoreNobleStats} from './demon-effects.mjs';
import {queueCardRevival} from './death-revival.mjs';
export const G_TOOLS=Object.freeze(['COC-01-004','COC-01-005','COC-01-007']);
// Existing runtime cards only. These are developer-delegated cost clarifications,
// not a claim that the missing canonical source contains these new numbers.
export const ALTAR_COSTS=Object.freeze({'COC-21-007':180,'COC-21-008':30,'COC-21-009':60,'COC-21-010':150,'COC-21-011':200,'COC-21-012':300});
export function prepareGTool(r,who,body,H){
 const id=body.costCardId,u=r.units[id];
 if(!r.players[who].hand.includes(id)||!G_TOOLS.includes(u?.cardId)||!r.players[who].field.includes(null))H.fail(409,'패의 G-툴과 빈 몬스터 슬롯이 필요합니다.');
 return {toolId:id,toolRevision:u.zoneRevision||0};
}
export function summonGTool(r,who,plan,H){
 const u=r.units[plan.toolId];
 if(!u||!r.players[who].hand.includes(u.id)||(u.zoneRevision||0)!==plan.toolRevision||!r.players[who].field.includes(null))return;
 queueCardRevival(r,who,u.id,H,{kind:'g-tool',originZone:'hand'});
}
export function queueMonsterizedSpell(r,who,id,H){
 queueCardRevival(r,who,id,H,{kind:'altar-body',originZone:'grave'});
}
export function altarChoices(r,who,H){
 const p=r.players[who];if(!p.field.includes(null))return [];
 return Object.entries(ALTAR_COSTS).flatMap(([cardId,cost])=>{
  const c=H.cards.get(cardId);if(!c||p.hp<=cost)return [];
  if(c.zone==='created')return [{cardId,cost,unitId:null,zone:'created'}];
  return ['hand','deck','grave'].flatMap(zone=>p[zone].filter(id=>r.units[id]?.cardId===cardId).map(unitId=>({cardId,cost,unitId,zone})));
 });
}
export function prepareAltar(r,who,body,H){
 const choice=altarChoices(r,who,H).find(c=>c.cardId===body.summonCardId&&(c.unitId===null||c.unitId===body.summonUnitId));
 if(!choice)H.fail(409,'사바스의 재단에서 소환할 몬스터와 지불 가능한 체력이 필요합니다.');
 const c=H.cards.get(choice.cardId),id=choice.unitId;
 return {altarCardId:c.id,altarHpCost:choice.cost,altarUnitId:id,altarOrigin:id?H.zone(r,id).zone:null,altarRevision:id?(r.units[id].zoneRevision||0):null};
}
export function summonAltar(r,who,plan,H){
 if(!r.players[who].field.includes(null))return;
 let id=plan.altarUnitId,originZone=plan.altarOrigin;
 if(id){
  if(H.zone(r,id)?.zone!==originZone||H.zone(r,id)?.player!==who||(r.units[id]?.zoneRevision||0)!==plan.altarRevision)return;
 }else{
  id=H.instantiate(r,plan.altarCardId,who);H.move(r,id,'hand',who);originZone='hand';
  r.units[id].altarGenerated=true;
 }
 queueCardRevival(r,who,id,H,{kind:'altar-recruit',originZone});
 if(originZone==='grave')H.graveActivation?.(r,{cardId:plan.cardId});
}
export function prepareMonsterizedUnit(r,p,H){
 const u=r.units[p.extraUnitId];
 if(p.revivalKind==='altar-body'||p.revivalKind==='g-tool')delete u.pyramidHpBonus;
 if(p.revivalKind==='altar-body'){u.atk=0;u.hp=1;u.cannotAttack=true;u.altarBody=true;}
 if(p.revivalKind==='g-tool'){
  const c=H.cards.get(u.cardId);u.atk=Math.max(0,Number(c.atk)||0);u.hp=Math.max(1,Number(c.hp)||1);u.cannotAttack=['COC-01-004','COC-01-005'].includes(u.cardId);u.gToolBody=true;
 }
 if(p.revivalKind==='altar-body'||p.revivalKind==='g-tool')restoreNobleStats(u);
 if(p.revivalKind==='altar-recruit'){
  u.altarDisposable={controller:p.who};
  if(u.cardId==='COC-21-008')u.cannotAttackThroughTurn=r.turnNumber+1;
 }
 H.refreshStats(r);
}
