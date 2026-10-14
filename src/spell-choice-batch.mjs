// Explicit clauses from the runtime catalog; not full-card certification.
export const choiceResponseTargets=Object.freeze({
 'COC-03-007':'any','COC-03-008':'any','COC-05-002':null,
 'COC-05-006':'two-non-toon','COC-05-007':'enemy-field',
 'COC-14-002':null,'COC-14-009':null,'COC-23-009':'option',
 'COC-27-010':'own-superior','COC-30-004':'enemy',
 'COC-30-011':'enemy-player','COC-31-007':'enemy-field'
});
export const choiceResponseSpellIds=Object.freeze(Object.keys(choiceResponseTargets));
export function isNonToonField(room,id,H){
 const z=typeof id==='string'&&H.zone(room,id);
 return Boolean(z?.zone==='field'&&!room.units[id].treatedAsToon&&
  !H.name(room,id).includes('카툰')&&
  !room.players[z.player].field.some(uid=>uid&&H.name(room,uid).includes('카툰 랜드')));
}
export function prepareChoiceDeclaration(room,who,cardId,body,H){
 if(['COC-14-009','COC-23-009'].includes(cardId)&&![1,2].includes(body.option))
  H.fail(409,'사용할 효과 1 또는 2를 선택해야 합니다.');
 if(cardId==='COC-05-006'){
  if(!Array.isArray(body.targets)||body.targets.length!==2||new Set(body.targets).size!==2)
   H.fail(409,'카툰이 아닌 몬스터 두 장을 각각 선택해야 합니다.');
  if(!body.targets.every(id=>isNonToonField(room,id,H)))
   H.fail(409,'카툰이 아닌 필드 몬스터를 선택해야 합니다.');
  return {...body,targets:[...body.targets]};
 }
 return body;
}
