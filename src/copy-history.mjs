// Per-copy past snapshots followed by independent observations in the copier's
// world. Never rebuild missing history from public logs or today's zones.
export function initializeCopyHistory(plan){
 const past=plan.snapshot.past,origin=plan.snapshot.controller;
 const destroyed={};
 // Map the original's preceding own-turn history onto the copier's own-turn
 // timeline; opposing controllers' turn numbers have different parity.
 const offset=origin===plan.copyOwner?0:-1;
 for(const e of past.destructionHistory||[])if(e.activePlayer===origin&&e.controller===1-origin){
  const turn=e.turnNumber+offset;destroyed[turn]=(destroyed[turn]||0)+1;
 }
 return {destroyed,enemyRound:past.opponentRoundPlays||0,enemyLastRound:past.opponentLastRoundPlays||0,
  elements:past.roundElementUses||0,mills:structuredClone(past.topToGraveCounts||{}),
  losses:structuredClone(past.recentMonsterLosses||[])};
}
export function recordCopyHistory(r,event,data){
 for(const [who,p] of r.players.entries())for(const copy of Object.values(p.originalSinCopies||{})){
  const h=copy.history;if(!h)continue;
  if(event==='turn-start'){
   if(data.who===who)h.elements=0;
   else {h.enemyLastRound=h.enemyRound;h.enemyRound=0;}
   for(const key of Object.keys(h.destroyed))if(Number(key)<r.turnNumber-2)delete h.destroyed[key];
   for(const key of Object.keys(h.mills))if(Number(key)<r.turnNumber-1)delete h.mills[key];
  }
  if(event==='play'){
   if(data.who!==who)h.enemyRound++;
   else if(data.element)h.elements++;
  }
  if(event==='destroy'&&r.turn===who&&data.who!==who)
   h.destroyed[r.turnNumber]=(h.destroyed[r.turnNumber]||0)+1;
  if(event==='mill')h.mills[r.turnNumber]=(h.mills[r.turnNumber]||0)+1;
  if(event==='loss'&&data.who===who)h.losses=[...h.losses,structuredClone(data.entry)].slice(-3);
 }
}
export function copyRecentMills(h,r){return (h?.mills?.[r.turnNumber]||0)+(h?.mills?.[r.turnNumber-1]||0);}
