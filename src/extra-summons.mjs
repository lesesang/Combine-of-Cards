/**
 * Strict v1.3 extra-deck recipes. No text guessing, no generic-material fallback.
 * Verifies summon eligibility only; triggered and continuous effects have separate support.
 */
import {requireUnusedEffect} from './effect-usage.mjs';
import {destructionProtected} from './protection-auras.mjs';
import {elementalFormId} from './elemental-dragons.mjs';
const id=(...ids)=>ids.map(value=>({kind:'id',value}));
export const EXTRA_RECIPES=Object.freeze({
 'COC-12-011':{method:'hero',parts:id('COC-12-001','COC-12-002')},
 'COC-12-012':{method:'hero',parts:id('COC-12-003','COC-12-004')},
 'COC-12-013':{method:'hero',parts:id('COC-12-003','COC-12-008')},
 'COC-12-014':{method:'hero',parts:id('COC-12-007','COC-12-001')},
 'COC-12-015':{method:'hero',parts:id('COC-12-003','COC-12-004','COC-12-002')},
 'COC-22-011':{method:'fusion',parts:Array(5).fill({kind:'prefix',value:'블랙 메탈'})},
 'COC-22-012':{method:'fusion',parts:Array(3).fill({kind:'prefix',value:'블랙 메탈'})},
 'COC-22-013':{method:'fusion',parts:Array(3).fill({kind:'prefix',value:'블랙 메탈'})},
 'COC-22-014':{method:'fusion',parts:Array(2).fill({kind:'prefix',value:'블랙 메탈'})},
 'COC-22-015':{method:'fusion',parts:Array(2).fill({kind:'prefix',value:'블랙 메탈'})},
 'COC-26-011':{method:'fusion',parts:id('COC-26-003','COC-26-002')},
 'COC-26-012':{method:'fusion',parts:id('COC-26-004','COC-26-005')},
 'COC-27-011':{method:'fusion',parts:[{kind:'attribute',value:'용'},...id('COC-27-008')]},
 'COC-27-012':{method:'fusion',parts:id('COC-27-007','COC-27-008')},
 'COC-27-013':{method:'fusion',parts:id('COC-27-001','COC-27-008')},
 'COC-27-014':{method:'fusion',parts:id('COC-27-003','COC-27-008')},
 'COC-32-011':{method:'wakeup',parts:id('COC-32-001')},
 'COC-32-012':{method:'wakeup',parts:id('COC-32-002')},
 'COC-32-013':{method:'wakeup',parts:id('COC-32-003')},
 'COC-32-014':{method:'wakeup',parts:id('COC-32-004')},
 'COC-32-015':{method:'infinity',parts:Array(3).fill({kind:'family',value:['원소의 마법사','드래곤 위저드']})}
});
export const SUPPORTED_EXTRA_IDS=Object.freeze(Object.keys(EXTRA_RECIPES));
export const UNDEAD_FUSION_IDS=Object.freeze(['COC-22-006','COC-27-002']);
const spellForDeck={'22':['COC-22-006','COC-22-008','COC-22-009'],'26':['COC-26-007'],'27':['COC-27-002','COC-27-009']};
function reject(message){const e=new Error(message);e.status=409;throw e}
function matches(card,part){
 if(!card||!card.type.includes('몬스터'))return false;
 switch(part.kind){
 case 'id':return card.id===part.value||elementalFormId(card.id)===part.value;
 case 'prefix':return card.name.startsWith(part.value);
 case 'attribute':return card.attribute===part.value;
 case 'family':return part.value.some(name=>card.name.includes(name));
 default:return false;
 }
}
function perfectMatch(parts,materialCards){
 if(parts.length!==materialCards.length)return false;
 const selected=new Set();
 function visit(i){
  if(i===parts.length)return true;
  for(let j=0;j<materialCards.length;j++)if(!selected.has(j)&&matches(materialCards[j],parts[i])){
   selected.add(j);if(visit(i+1))return true;selected.delete(j);
  }
  return false;
 }
 return visit(0);
}
/** Pure, atomic precondition validator. Do not mutate the game state here. */
export function validateExtraSummon({room,who,extraUnitId,materials,spellUnitId,cards}){
 const player=room.players[who];
 if(!player||!player.extra.includes(extraUnitId))reject('해당 카드는 자신의 엑스트라 덱에 없습니다.');
 const extra=room.units[extraUnitId],recipe=EXTRA_RECIPES[extra?.cardId];
 if(!recipe)reject('이 엑스트라 카드의 소환 조건은 아직 자동 검증할 수 없습니다.');
 const undead=recipe.method==='fusion'&&UNDEAD_FUSION_IDS.includes(room.units[spellUnitId]?.cardId);
 if(!Array.isArray(materials)||materials.length!==recipe.parts.length||new Set(materials).size!==materials.length)reject('소재 개수 또는 중복 지정이 잘못되었습니다.');
 const fieldOnly=recipe.method==='wakeup'||recipe.method==='infinity';
 const materialCards=materials.map(unitId=>{
  const zone=player.field.includes(unitId)?'field':player.hand.includes(unitId)?'hand':player.grave.includes(unitId)?'grave':null;
  if(!zone||(undead?zone!=='grave':zone==='grave')||(fieldOnly&&zone!=='field'))reject(undead?'언데드 퓨전의 지정 소재는 자신의 묘지에서 선택해야 합니다.':'소재를 자신의 올바른 패·필드 영역에서 선택해야 합니다.');
  if(recipe.method==='wakeup'&&(room.units[unitId].effectDestructionImmune||destructionProtected(room,unitId)))reject('파괴 면역인 몬스터는 웨이크업 파괴 비용으로 지불할 수 없습니다.');
  const card=cards.get(room.units[unitId]?.cardId);
  if(!card)reject('존재하지 않는 소재 카드입니다.');
  return card;
 });
 if(!perfectMatch(recipe.parts,materialCards))reject('이 퓨전 몬스터에 기재된 지정 소재와 일치하지 않습니다.');
 const spentFromField=materials.filter(id=>player.field.includes(id)).length;
 if(player.field.filter(Boolean).length-spentFromField>=player.field.length)reject('소재를 보낸 뒤에도 소환할 필드 공간이 없습니다.');
 if(recipe.method==='hero'){
  if(spellUnitId)reject('용기의 패왕 소환에는 퓨전업을 사용할 수 없습니다.');
  if(room.units[player.integration]?.cardId!=='COC-12-009')reject('용기의 패왕과 일체화한 상태여야 합니다.');
 }else if(recipe.method==='fusion'||recipe.method==='wakeup'){
  const allowed=recipe.method==='wakeup'?['COC-32-009']:(spellForDeck[extra.cardId.slice(4,6)]||[]);
  if(!player.hand.includes(spellUnitId)||!allowed.includes(room.units[spellUnitId]?.cardId))reject('이 소환에 필요한 지정 주문을 패에서 사용해야 합니다.');
  requireUnusedEffect(room,who,spellUnitId,1);
 }else if(spellUnitId)reject('해당 소환에는 퓨전 주문을 소비하지 않습니다.');
 return {method:undead?'undead-fusion':recipe.method,spellUnitId:spellUnitId||null,materials:[...materials]};
}
