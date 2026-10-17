// Sphinx is a continuous declaration replacement, not an activated counter.
// Classify registered clauses explicitly; damage, costs and ATK/HP state rules
// must never become "destruction effects" by inspecting handler side effects.
const SPELLS=new Set(['COC-08-006','COC-21-004','COC-21-005','COC-24-006','COC-30-001','COC-31-006','COC-31-008','COC-32-008']);
const FIELDS=new Set(['COC-05-009','COC-10-005','COC-12-013','COC-27-011','COC-32-012']);
const TRIGGERS=new Set(['COC-03-004','COC-12-012','COC-19-003','COC-19-006','COC-27-004','COC-31-002','COC-32-002']);
function destructiveSpell(room,owner,id,body){
 if(id==='COC-23-009')return body?.option===1;
 if(id==='COC-06-004')return body?.mercuryEffect===2;
 return SPELLS.has(id);
}
export function isDestructiveDeclaration(room,e){
 const p=e.payload||{};
 if(e.effectId==='auto-spell-resolution')return destructiveSpell(room,e.owner,p.cardId,p.body);
 if(e.effectId==='spell-reuse-resolution')return destructiveSpell(room,e.owner,p.original?.cardId,p.body);
 if(e.effectId==='original-sin-resolution')return p.snapshot?.card?.type==='주문'
  ?destructiveSpell(room,e.owner,p.cardId,p.body):p.cardId==='COC-12-013';
 if(e.effectId==='field-ability-resolution')return FIELDS.has(p.cardId);
 if(e.effectId==='monster-trigger-resolution')return TRIGGERS.has(p.cardId);
 return false;
}
export function preventDestructiveDeclaration(room,e){
 // Scheduler validation uses a stack-only staging room. Apply this exactly
 // once to committed entries on the real room, after the whole group validates.
 if(!room.units||!room.players||e.preventedBy||!isDestructiveDeclaration(room,e))return;
 const who=1-e.owner,turn=room.turnNumber||0;
 const id=room.players[who]?.field?.find(id=>{
  const u=room.units[id];
  return u?.cardId==='COC-17-007'&&!u.effectsNegated&&u.sphinxBlockedTurn!==turn;
 });
 if(!id)return;
 room.units[id].sphinxBlockedTurn=turn;
 e.preventedBy={kind:'sphinx',sourceId:id,owner:who,turn};
}
