// Audited normal spell clauses. Other clauses of these cards remain partial.
export const batchResponseTargets=Object.freeze({
 'COC-01-004':'field','COC-01-005':'field','COC-01-009':null,
 'COC-06-007':'any','COC-08-006':'enemy-field','COC-14-003':'field',
 'COC-14-006':null,'COC-17-005':'enemy','COC-17-006':null,
 'COC-19-005':'field','COC-20-004':'own-burning','COC-20-011':'field-burning',
 'COC-27-006':'any','COC-30-001':null,'COC-30-002':'enemy',
 'COC-30-006':'enemy-field','COC-31-006':'non-mage',
 'COC-31-008':null,'COC-31-010':null,
 'COC-32-005':null,'COC-32-006':null,'COC-32-007':null,'COC-32-008':null
});
export const batchResponseSpellIds=Object.freeze(Object.keys(batchResponseTargets));

// Pure preflight: freeze the existing default target at declaration so a
// later missing target can never silently redirect the spell to another unit.
export function prepareResponseTargets(room,who,cardId,body,H){
 const kind=batchResponseTargets[cardId];
 if(!kind)return body;
 let target=body.target;
 if(!target&&(kind==='any'||kind.startsWith('enemy'))){
  const id=room.players[1-who].field.find(Boolean);
  target=id?{type:'unit',id}:{type:'player',player:1-who};
 }
 if(target?.type==='player'&&((kind==='enemy'&&target.player===1-who)||
     (kind==='any'&&[0,1].includes(target.player)))){
  const until=room.players[target.player].spellProtectionUntilOpponentTurn||0;
  if(target.player!==who&&until>0&&until>=(room.players[who].turnsTaken||0))
   H.fail(409,'보호막 효과로 해당 플레이어를 주문의 대상으로 지정할 수 없습니다.');
  return {...body,target:{type:'player',player:target.player}};
 }
 const id=target?.type==='unit'?target.id:null,z=typeof id==='string'&&H.zone(room,id);
 if(!z||z.zone!=='field')
  H.fail(409,'유효한 필드 몬스터 대상을 선택해야 합니다.');
 if(kind.startsWith('enemy')&&z.player!==1-who)
  H.fail(409,'상대 필드 몬스터를 선택해야 합니다.');
 if((kind==='own-burning'&&z.player!==who)||
    (kind.endsWith('burning')&&!/버닝\s*데몬즈?/.test(H.name(room,id))))
  H.fail(409,'자신 필드의 버닝데몬즈 몬스터를 선택해야 합니다.');
 if(kind==='non-mage'&&/마술사|마법사/.test(H.attribute(room,id)))
  H.fail(409,'마술사·마법사 속성은 대상으로 지정할 수 없습니다.');
 return {...body,target:{type:'unit',id}};
}

export function responseTargetStillValid(room,who,cardId,body,H){
 try{prepareResponseTargets(room,who,cardId,body,H);return true;}
 catch(error){if(error.status===409)return false;throw error;}
}

// Enumerate public battlefield choices only; never inspect either deck/hand.
// The same validator is used by action preflight and AI candidate selection.
export function responseTargetChoices(room,who,cardId,H){
 if(!batchResponseTargets[cardId])return null;
 const candidates=[...room.players.flatMap(p=>p.field.filter(Boolean).map(id=>({type:'unit',id}))),
  {type:'player',player:1-who},{type:'player',player:who}];
 return candidates.filter(target=>responseTargetStillValid(room,who,cardId,{target},H));
}
