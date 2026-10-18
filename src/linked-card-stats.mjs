// A residence survives control transfer, but not leaving and re-entering.
import {activeBorrowed,borrowedProgram} from './borrowed-state.mjs';
export function moveLinkedResidence(u,from,to){
 if(from?.zone!=='field'&&to==='field')u.linkedResidence=(u.linkedResidence||0)+1;
 if(from?.zone==='field'&&to!=='field'){delete u.copperLink;delete u.immortalProtection;}
}
export function copperTarget(r,host){
 if(!r||!host)return null;
 const p=r.players.find(p=>p.integration===host.id);if(!p)return null;
 const sources=p.field.filter(Boolean).map(id=>r.units[id]).filter(u=>{
  const link=u?.copperLink,target=link&&r.units[link.id];
  return u?.cardId==='COC-06-006'&&!u.effectsNegated&&target&&(u.linkedResidence||0)===link.sourceResidence&&r.players.some(p=>p.field.includes(target.id))&&(target.linkedResidence||0)===link.residence;
 }).sort((a,b)=>b.copperLink.sequence-a.copperLink.sequence||a.id.localeCompare(b.id));
 const who=r.players.indexOf(p),copies=activeBorrowed(r,who).filter(g=>g.cardId==='COC-06-006'&&g.link&&r.players.some(p=>p.field.includes(g.link.id))&&(r.units[g.link.id]?.linkedResidence||0)===g.link.residence);
 return [...sources.map(u=>({id:u.copperLink.id,sequence:u.copperLink.sequence})),...copies.map(g=>({id:g.link.id,sequence:g.sequence}))].sort((a,b)=>b.sequence-a.sequence)[0]?.id||null;
}
export function immortalBattleProtected(r,id){
 const target=r.units[id];if(!target||!r.players.some(p=>p.field.includes(id)))return false;
 return (target.immortalProtection||[]).some(g=>{
  if((target.linkedResidence||0)!==g.targetResidence)return false;
  const source=r.units[g.sourceId];
  if(g.borrowedKey){const who=r.players.findIndex(p=>p.integration===g.sourceId);return who>=0&&!!borrowedProgram(r,who,g.borrowedKey)&&(source.integrationRevision||0)===g.residence;}
  return source?.cardId==='COC-12-015'&&!source.effectsNegated&&r.players.some(p=>p.field.includes(source.id))&&(source.linkedResidence||0)===g.residence;
 });
}
