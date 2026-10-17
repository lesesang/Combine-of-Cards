import {scaledStatGain} from './stat-gains.mjs';
const FAFNIR='COC-11-007';
const inField=(r,id)=>r.players.some(p=>p.field.includes(id));
function growthState(u){
 if(!u.fafnirGrowth){
  // Old saves mixed growth into base/buffs. Never infer that missing ledger
  // from Gold's total, which includes other residences and skipped gains.
  u.fafnirResidence??=1;
  u.fafnirGrowth={treasures:0,hpApplied:0,legacyUntracked:true};
 }
 return u.fafnirGrowth;
}
export function moveFafnirResidence(u,from,to){
 if(u.cardId!==FAFNIR)return;
 if(from?.zone==='field'&&to!=='field'){
  if(Number.isFinite(u.hp))u.hp-=u.fafnirGrowth?.hpApplied||0;
  delete u.fafnirGrowth;
 }
 if(to==='field'){
  if(from?.zone!=='field'){
   u.fafnirResidence=(u.fafnirResidence||0)+1;
   u.fafnirGrowth={treasures:0,hpApplied:0,legacyUntracked:false};
  }else growthState(u); // Control transfer is not a new field residence.
 }
}
export function fafnirResidence(u){
 if(u?.cardId!==FAFNIR)return null;
 growthState(u);return u.fafnirResidence;
}
export function fafnirGrowthBonus(r,u){
 if(u?.cardId!==FAFNIR||!inField(r,u.id)||u.effectsNegated)return 0;
 return scaledStatGain(r,{id:u.id},Math.max(0,u.fafnirGrowth?.treasures||0)*10);
}
export function refreshFafnirGrowth(r){
 for(const p of r.players)for(const id of p.field.filter(Boolean)){
  const u=r.units[id];if(u?.cardId!==FAFNIR)continue;
  const state=growthState(u),next=fafnirGrowthBonus(r,u);
  if(Number.isFinite(u.hp))u.hp+=next-state.hpApplied;
  state.hpApplied=next;
 }
}
export function recordFafnirTreasure(r,anchorId,n){
 const u=r.units[anchorId];
 if(u?.cardId!==FAFNIR||!inField(r,anchorId))return;
 // Gold owns the treasure; the actual field Fafnir owns its growth history,
 // even under another controller or while its printed effect is negated.
 growthState(u).treasures+=n;
 refreshFafnirGrowth(r);
}
export function fafnirGrowthView(r,id){
 const u=r.units[id];if(u?.cardId!==FAFNIR||!inField(r,id))return null;
 return {treasures:u.fafnirGrowth?.treasures||0,bonus:fafnirGrowthBonus(r,u),legacyUntracked:u.fafnirGrowth?.legacyUntracked??true};
}
