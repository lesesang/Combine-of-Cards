// Printed attack modes and granted temporary modifiers are separate from the
// mutable base, permanent gains and the independent Life-Eating Sword layer.
export const BLACK_METAL_MODES=Object.freeze({
 'COC-22-001':[50,2],'COC-22-002':[50,2],'COC-22-003':[50,2],
 'COC-22-004':[50,2],'COC-22-005':[50,2],'COC-22-011':[100,5],
 'COC-22-012':[100,3],'COC-22-013':[100,3],'COC-22-014':[50,5]
});
export const BLACK_METAL_ACTIVE_IDS=Object.freeze(Object.keys(BLACK_METAL_MODES));
export const BLACK_METAL_UTILITY_IDS=Object.freeze(['COC-22-001','COC-22-002','COC-22-003','COC-22-004','COC-22-005','COC-22-012','COC-22-013']);
export function blackMetalAttackModifier(r,u){
 if(!u)return 0;
 const turn=r?.turnNumber;
 const mode=u.blackMetalMode;
 const modeAmount=mode&&mode.turn===(turn??mode.turn)?mode.amount:0;
 return modeAmount+(u.blackMetalStatGrants||[]).filter(g=>turn===undefined||turn<g.expiresBeforeTurn).reduce((n,g)=>n+g.amount,0);
}
export function blackMetalAttackLimit(u,turn){
 if(u?.cardId==='COC-22-015'&&!u.effectsNegated)return Math.max(0,u.blackMetalCounterLimit||0);
 return u?.blackMetalMode?.turn===turn?u.blackMetalMode.attacks:null;
}
export function refreshBlackMetalState(r){
 const counters=r.players.reduce((n,p)=>n+Math.max(0,p.blackMetalCounters||0),0);
 for(const u of Object.values(r.units)){
  if(u.cardId==='COC-22-015')u.blackMetalCounterLimit=counters;
  if(u.blackMetalMode?.turn!==r.turnNumber)delete u.blackMetalMode;
  if(u.blackMetalStatGrants)u.blackMetalStatGrants=u.blackMetalStatGrants.filter(g=>r.turnNumber<g.expiresBeforeTurn);
 }
}
export function leaveBlackMetalField(u){
 delete u.blackMetalMode;delete u.blackMetalStatGrants;
 delete u.blackMetalSoldierUsed;delete u.blackMetalAttacked;
 // Gardener's physical game use and Knight's per-victim turn reservation
 // survive a leave/re-entry; control transfer never calls this helper.
}
export function blackMetalDestructionProtected(r,id){
 const u=r.units[id];
 return u?.cardId==='COC-22-011'&&!u.effectsNegated&&r.players.some(p=>p.field.includes(id)&&p.integration);
}
