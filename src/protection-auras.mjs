// Independent spell grants are serialized separately from printed abilities.
// HP payment, absorption, HP setting and reload never call this damage guard.
export function damageProtected(r,target){
 const bearer=target.type==='player'?r.players[target.player]:r.units[target.id];
 return (bearer?.protectionGrants||[]).some(g=>g.kind==='peace'||g.kind==='spirit'&&r.turnNumber<=g.endTurn);
}
export function destructionProtected(r,id){
 return (r.units[id]?.protectionGrants||[]).some(g=>g.kind==='peace');
}
export function grantSpirit(r,who,sourceId){
 const p=r.players[who];p.protectionGrants??=[];
 p.protectionGrants.push({kind:'spirit',sourceId,endTurn:r.turnNumber+1});
}
export function grantPeace(r,who,H){
 for(const [player,p] of r.players.entries()){
  const host=p.integration&&r.units[p.integration];
  p.hp+=100+(host&&/용|드래곤/.test(H.attribute(r,host.id))?100:0);
  (p.protectionGrants??=[]).push({kind:'peace',appliedTurn:r.turnNumber});
  for(const id of p.field.filter(Boolean)){
   H.healUnit(r,id,100+(/용|드래곤/.test(H.attribute(r,id))?100:0));
   (r.units[id].protectionGrants??=[]).push({kind:'peace',appliedTurn:r.turnNumber});
  }
  // The integrated player is the protected bearer; the physical host also
  // receives destruction protection until that player's next ATTACK.
  if(host)(host.protectionGrants??=[]).push({kind:'peace',appliedTurn:r.turnNumber});
 }
 H.log(r,'effect','만파식적: 현재 양측 플레이어·몬스터 회복, 각자 다음 턴 이후 첫 어택 시작까지 보호');
}
export function expireProtectionAttack(r,who){
 const p=r.players[who];
 for(const bearer of [p,...[...p.field,p.integration].filter(Boolean).map(id=>r.units[id])])
  bearer.protectionGrants=(bearer.protectionGrants||[]).filter(g=>g.kind!=='peace'||g.appliedTurn>=r.turnNumber);
}
export function expireProtectionEnd(r){
 for(const p of r.players)p.protectionGrants=(p.protectionGrants||[]).filter(g=>g.kind!=='spirit'||g.endTurn>r.turnNumber);
}
export function grantPyramid(r,who,sourceId,H){
 // Reusing one physical spell refreshes its field grant. Distinct copies
 // stack; a reload cannot manufacture infinitely many grants from one UID.
 const p=r.players[who];p.pyramidSources??={};p.pyramidSources[sourceId]=true;
 refreshContinuousAuras(r,H.cards);
}
export function continuousAttackBonus(r,unit){
 if(!unit)return 0;
 const p=r.players.find(p=>p.integration===unit.id||p.field.includes(unit.id));
 if(!p)return 0;
 let bonus=p.field.filter(id=>id&&r.units[id]?.cardId==='COC-17-008'&&!r.units[id].effectsNegated).length*50;
 if(p.integration===unit.id)for(const id of p.field.filter(Boolean)){
  const u=r.units[id];if(u.effectsNegated)continue;
  if(u.gToolBody&&['COC-01-004','COC-01-005'].includes(u.cardId))bonus+=100;
  if(u.cardId==='COC-01-006')bonus+=300;
 }
 return bonus;
}
export function refreshContinuousAuras(r,cards){
 for(const u of Object.values(r.units)){delete u.continuousAttackBonus;delete u.gatlingDoubleAttack;delete u.gToolDiceMin;}
 for(const p of r.players){
  const hp=Object.keys(p.pyramidSources||{}).length*50;
  for(const id of p.field.filter(Boolean)){
   const u=r.units[id];if(!Number.isFinite(u.hp))continue;
   u.hp+=hp-(u.pyramidHpBonus||0);u.pyramidHpBonus=hp;
  }
  for(const id of [...p.field,p.integration].filter(Boolean))r.units[id].continuousAttackBonus=continuousAttackBonus(r,r.units[id]);
  if(p.integration){
   r.units[p.integration].gatlingDoubleAttack=p.field.some(id=>id&&r.units[id].cardId==='COC-01-007'&&r.units[id].gToolBody&&!r.units[id].effectsNegated);
   if(p.field.some(id=>id&&r.units[id].cardId==='COC-01-004'&&r.units[id].gToolBody&&!r.units[id].effectsNegated))r.units[p.integration].gToolDiceMin=50;
  }
 }
}
