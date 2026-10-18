// Read-only one-hop expansion. Usable by continuous stat/damage queries without
// importing any effect executor or depending on previously cached aura totals.
export function sharedRecipient(r,id){
 const u=r.units[id],link=u?.strawLink;
 if(u?.cardId!=='COC-21-008'||u.effectsNegated||!link||
  !r.players[link.sourceController]?.field.includes(id)||(u.fieldRevision||0)!==link.sourceRevision)return null;
 const target=r.units[link.id];
 return target&&r.players[link.targetController]?.field.includes(link.id)&&
  (target.fieldRevision||0)===link.targetRevision?link.id:null;
}
export function expandSharedRecipients(r,ids){
 const originals=[...new Set(ids.filter(Boolean))];
 return [...new Set([...originals,...originals.map(id=>sharedRecipient(r,id)).filter(Boolean)])];
}
export function continuousApplies(r,id,directIds){return expandSharedRecipients(r,directIds).includes(id);}

// Commit as many additional shared transfers as fit, retaining both original
// trade legs. Enumerating at most six field cards avoids asymmetric capacity
// guesses when both full fields simultaneously release their selected cards.
export function feasibleTransfers(r,required,optional=[]){
 const seen=new Set(required.map(t=>t.id));
 optional=optional.filter(t=>!seen.has(t.id)&&seen.add(t.id));
 const fits=items=>r.players.every((p,who)=>p.field.filter(Boolean).length-
  items.filter(t=>t.from===who).length+items.filter(t=>t.to===who).length<=3);
 let best=null;
 for(let mask=0;mask<2**optional.length;mask++){
  const group=[...required,...optional.filter((_,i)=>mask&(2**i))];
  if(fits(group)&&(!best||group.length>best.length))best=group;
 }
 return best||[];
}
