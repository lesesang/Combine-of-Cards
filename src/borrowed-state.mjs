// A copied clause has its own program and event history. It never changes the
// physical host's card identity or installs a fictitious monster in a field.
const profiles={};
const add=(ids,number,rule)=>{for(const id of ids.split(' '))profiles[`${id}:${number}`]=Object.freeze({...rule});};
add('COC-09-002',1,{trait:'damage-one'});
add('COC-09-003',1,{trait:'double-attack'});
add('COC-08-002 COC-09-004 COC-12-007 COC-21-010',1,{trait:'aggro'});
add('COC-12-014',2,{trait:'aggro'});
add('COC-10-006',1,{trait:'drain',divisor:1});
add('COC-21-007',1,{trait:'drain',divisor:2});
add('COC-12-008',1,{trait:'pierce'});
add('COC-12-013',2,{trait:'pierce'});
add('COC-32-003',2,{trait:'direct-die',amount:40});
add('COC-32-013',2,{trait:'direct-die',amount:60});
add('COC-26-011',1,{trait:'battle-survival'});
add('COC-11-005',1,{trait:'gain-suppressor'});
add('COC-12-006',1,{trait:'hero-battle',amount:50});
add('COC-17-008',1,{trait:'allied-attack',amount:50});
add('COC-17-009',1,{trait:'horus',amount:100});
add('COC-21-012',2,{trait:'demon-attack',amount:30});
add('COC-17-007',1,{trait:'sphinx'});
add('COC-22-015',2,{trait:'counter-attacks'});
add('COC-12-001 COC-24-005',1,{trait:'counter',kinds:['spell']});
add('COC-12-002',1,{trait:'counter',kinds:['monster-effect']});
add('COC-07-005',1,{event:'enemy-effect-draw',action:'mill-event',repeat:true});
add('COC-11-006',1,{event:'own-attack-start',action:'orochi'});
add('COC-12-011',1,{event:'enemy-destroyed',action:'victim-attack',repeat:true});
add('COC-05-001',1,{trait:'no-direct',event:'enemy-destroyed',action:'victim-half',repeat:true});
add('COC-22-011',2,{event:'end',action:'chimera'});
add('COC-22-014',2,{event:'battle',action:'knight',repeat:true});
add('COC-32-001',2,{event:'battle',action:'flame'});
add('COC-32-011',2,{event:'enemy-destroyed',action:'extra-attack'});
add('COC-32-004',2,{event:'own-turn-start',action:'land',oneStay:true});
add('COC-05-010 COC-27-001',1,{event:'own-summon',action:'both-draw'});
add('COC-07-002',1,{event:'own-summon',action:'mill-two'});
add('COC-07-009',1,{event:'own-summon',action:'mill-history'});
add('COC-12-004',1,{event:'own-summon',action:'draw-two'});
add('COC-23-003',1,{event:'own-summon',action:'heal',amount:130});
add('COC-31-001',1,{event:'own-summon',action:'coin-draw'});
add('COC-31-003',1,{event:'own-summon',action:'coin-damage'});
add('COC-10-003',1,{event:'own-summon',action:'franz'});
add('COC-10-004',1,{event:'own-summon',action:'freeze'});
add('COC-12-003 COC-23-004 COC-24-002 COC-26-002 COC-26-005 COC-20-009',1,{event:'own-summon',action:'search'});
add('COC-22-015',3,{event:'own-summon',action:'search'});
add('COC-08-001',1,{event:'own-summon',action:'return',target:'field'});
add('COC-23-005 COC-24-004',1,{event:'own-summon',action:'banish',target:'enemy'});
add('COC-08-008',1,{event:'own-summon',action:'capture',target:'enemy'});
add('COC-12-012',1,{event:'own-summon',action:'destroy-lower',target:'lower'});
add('COC-31-002',1,{event:'own-summon',action:'coin-weaken',target:'enemy'});
add('COC-27-004',1,{event:'own-summon',action:'destroy-others'});
add('COC-12-010',1,{event:'own-summon',action:'return-others'});
add('COC-27-012',1,{event:'own-summon',action:'oracle',repeat:true});
add('COC-06-006',1,{action:'copper',target:'field'});
add('COC-20-002',1,{action:'beast'});
add('COC-27-011',1,{action:'solo-destroy',target:'enemy'});
add('COC-27-014',1,{action:'mill-damage',target:'any'});
add('COC-32-012',2,{action:'ocean',target:'high-hp'});
add('COC-32-014',2,{action:'terra'});
add('COC-12-014',1,{action:'half-damage',target:'any',trait:'no-attack'});
add('COC-27-013',1,{action:'half-die',target:'any',trait:'no-attack'});
for(const [ids,attack,attacks] of [['COC-22-001 COC-22-002 COC-22-003 COC-22-004 COC-22-005',50,2],['COC-22-011',100,5],['COC-22-012 COC-22-013',100,3],['COC-22-014',50,5]])add(ids,1,{action:'bm-mode',attack,attacks});
add('COC-22-001 COC-22-003',2,{action:'bm-search',attackCost:true});
add('COC-22-004',2,{action:'bm-search',attackCost:true,limit:'stay'});
add('COC-22-005',2,{action:'bm-protect',attackCost:true,limit:'game',target:'black-metal'});
add('COC-22-002',2,{action:'bm-heal',attackCost:true,target:'any'});
add('COC-22-012',2,{action:'bm-weaken',attackCost:true,target:'enemy'});
add('COC-22-013',2,{action:'bm-gain',attackCost:true,target:'field'});
add('COC-22-011',3,{trait:'destruction-protection'});
add('COC-12-015',1,{action:'immortal',target:'own'});
add('COC-27-007',1,{event:'natural-draw',action:'prophet'});
add('COC-32-002',2,{event:'targeted',action:'water'});
add('COC-32-015',1,{event:'attack-declared',action:'infinity'});
add('COC-03-002',1,{action:'beria-search'});
add('COC-03-005',1,{event:'own-summon',action:'wraith'});
add('COC-10-001',1,{event:'own-summon',action:'remnant'});
add('COC-14-005',1,{event:'own-summon',action:'storm-token'});
add('COC-23-002',1,{action:'ride-gain',limit:'game'});
add('COC-23-008',1,{event:'own-summon',action:'another'});
add('COC-27-003',1,{event:'own-summon',action:'tyranno'});
add('COC-19-001',1,{trait:'clay-growth'});
add('COC-22-015',1,{action:'magician-base',trait:'treated-250'});
add('COC-26-012',1,{trait:'no-attack'});
add('COC-26-012',2,{event:'turn-start',action:'death-writer',target:'any'});
add('COC-13-003',1,{action:'seafood',target:'enemy'});
add('COC-13-004',1,{action:'donkey',target:'enemy'});
add('COC-14-004',1,{event:'own-summon',action:'storm-one'});
add('COC-14-004',2,{event:'own-summon',action:'storm-half',target:'field'});
export const BORROWED_PROFILES=Object.freeze(profiles);
export const borrowedProfile=(cid,n)=>BORROWED_PROFILES[`${cid}:${n}`];
export function activeBorrowed(r,who,{includeNegated=false}={}){
 const p=r.players[who],u=p?.integration&&r.units[p.integration];
 if(!u||u.cardId!=='COC-21-001'||u.effectsNegated&&!includeNegated)return [];
 return (p.borrowedPrograms||[]).filter(g=>g.hostId===u.id&&g.hostRevision===(u.integrationRevision||0)&&borrowedProfile(g.cardId,g.number));
}
export function borrowedTraits(r,who,trait){return activeBorrowed(r,who).filter(g=>borrowedProfile(g.cardId,g.number).trait===trait);}
export function unitBorrowedTraits(r,id,trait){const who=r.players.findIndex(p=>p.integration===id);return who<0?[]:borrowedTraits(r,who,trait);}
export function installBorrowed(r,who,plan){
 const p=r.players[who],old=(p.borrowedPrograms||[]).find(g=>g.key===plan.key),u=r.units[plan.sourceId];
 const original=plan.snapshot.unit,rule=borrowedProfile(plan.cardId,plan.effectNumber);
 // Refreshing the same original clause does not reset game/turn/event history.
 const g=old||{key:plan.key,cardId:plan.cardId,number:plan.effectNumber,
  history:{attacks:plan.snapshot.unit.orochiAttacks||0,ownStarts:plan.snapshot.unit.dragonResidence?.ownTurnStarts||0,targets:[],usedTurns:{},materialCount:plan.snapshot.unit.stormMaterialCount||0,clayIds:Object.keys(plan.snapshot.past.claySummonedCards||{}).filter(id=>id!==plan.originalId)}};
 if(!old){
  g.counterUsed=!!original.counterUsedThisStay;
  g.sphinxBlockedTurn=original.sphinxBlockedTurn;
  g.history.landUsed=!!original.dragonResidence?.landTriggered;
  if(original.blackMetalAttacked){g.history.attackTurn=original.blackMetalAttacked.turn;g.history.targets=[...original.blackMetalAttacked.ids];}
  if(original.blackMetalCounterTargets){g.history.knightTurn=original.blackMetalCounterTargets.turn;g.history.knightTargets=[...original.blackMetalCounterTargets.ids];}
  if(rule.event&&!rule.repeat&&original.effectUsage?.[`${plan.cardId}:${plan.effectNumber}`]===r.turnNumber)
   g.history.usedTurns[rule.event]=r.turnNumber;
 }else if(g.hostId!==u.id||g.hostRevision!==(u.integrationRevision||0)){
  g.counterUsed=false;g.history.ownStarts=0;g.history.landUsed=false;
  g.history.attacks=0;g.history.targets=[];delete g.history.attackTurn;
  delete g.link;
 }
 g.hostId=u.id;g.hostRevision=u.integrationRevision||0;g.installedTurn=r.turnNumber;
 if(!old)(p.borrowedPrograms??=[]).push(g);
 return g;
}
export function borrowedProgram(r,who,key){return activeBorrowed(r,who).find(g=>g.key===key);}
