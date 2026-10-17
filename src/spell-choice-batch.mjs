import {isCartoonField} from './cartoon-land.mjs';
// Explicit clauses from the runtime catalog; not full-card certification.
export const choiceResponseTargets=Object.freeze({
 'COC-06-004':'mercury','COC-24-006':null,
 'COC-19-002':'own-field',
 'COC-03-007':'any','COC-03-008':'any','COC-05-002':null,
 'COC-05-006':'two-non-toon','COC-05-007':'enemy-field',
 'COC-14-002':null,'COC-14-009':null,'COC-23-009':'option',
 'COC-27-010':'own-superior','COC-30-004':'enemy',
 'COC-30-011':'enemy-player','COC-31-007':'enemy-field'
});
export const choiceResponseSpellIds=Object.freeze(Object.keys(choiceResponseTargets));
export function isNonToonField(room,id,H){
 return H.zone(room,id)?.zone==='field'&&!isCartoonField(room,id,H);
}
export function prepareChoiceDeclaration(room,who,cardId,body,H){
 if(cardId==='COC-24-006'){
  const id=room.players[who].integration,u=id&&room.units[id];
  if(!u)H.fail(409,'마인드 체인지를 사용할 일체화가 필요합니다.');
  return {...body,mindChangeHost:id,mindChangeRevision:u.integrationRevision||0};
 }
 if(cardId==='COC-06-004'){
  const mode=(room.players[who].roundElementUses||0)+1>=3?2:1;
  const ids=mode===2?body.targets:[body.target?.type==='unit'?body.target.id:null];
  if(!Array.isArray(ids)||ids.length!==mode||new Set(ids).size!==mode||ids.some(id=>!id||H.zone(room,id)?.zone!=='field'))
   H.fail(409,mode===2?'파괴할 서로 다른 필드 몬스터 두 장을 선택하세요.':'피해를 줄 필드 몬스터 한 장을 선택하세요.');
  return {...body,mercuryEffect:mode,mercuryTargets:ids.map(id=>({id,controller:H.zone(room,id).player,revision:room.units[id].fieldRevision||0})),
   ...(mode===2?{targets:[...ids]}:{target:{type:'unit',id:ids[0]}})};
 }
 if(['COC-14-009','COC-23-009','COC-19-002'].includes(cardId)&&![1,2].includes(body.option))
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
export function mercuryTargetsStillPresent(room,body,H){
 return (body.mercuryTargets||[]).filter(t=>{
  const u=room.units[t.id],z=u&&H.zone(room,t.id);
  return z?.zone==='field'&&z.player===t.controller&&(u.fieldRevision||0)===t.revision;
 }).map(t=>t.id);
}
