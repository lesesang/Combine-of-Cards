/**
 * Audited preflight rules for main-deck cards with explicit v1.3 requirements.
 * No natural-language eval. Pure validation returns a cost plan; the caller
 * commits that plan transactionally before summoning, never after.
 * Cards not listed here are not certified as fully automated by this module.
 */
const SPEC = new Map();
const register = (ids, predicate) => { for (const id of ids.split(' ')) SPEC.set(id, predicate); };
const deny = message => { const e = new Error(message); e.status = 409; throw e; };
const ok = () => ({costs:[]});
const require_ = (condition, message) => { if (!condition) deny(message); return ok(); };

function context(room, who, unitId, catalog, body) {
 const player=room.players[who], foe=room.players[1-who];
 const card= catalog.get(room.units[unitId]?.cardId);
 if(!player||!foe||!card)deny('존재하지 않는 플레이어 또는 카드입니다.');
 const named=id=>catalog.get(room.units[id]?.cardId)?.name||room.units[id]?.tokenCard?.name||'';
 const type=id=>catalog.get(room.units[id]?.cardId)?.type||'';
 const attribute=id=>catalog.get(room.units[id]?.cardId)?.attribute||'';
 const ownField=player.field.filter(Boolean),enemyField=foe.field.filter(Boolean);
 const ownIntegration=player.integration?named(player.integration):'';
 const fieldNames=ownField.map(named);
 const hasField=(term)=>fieldNames.some(n=>n.includes(term));
 const hasIntegration=(term)=>ownIntegration.includes(term);
 const fieldCount=(term)=>ownField.filter(id=>attribute(id)===term||named(id).includes(term)).length;
 const deckCount=(term)=>player.deck.filter(id=>attribute(id)===term||named(id).includes(term)).length;
 const handCount=(term)=>player.hand.filter(id=>type(id)==='주문'||named(id).includes(term)).length;
 const fieldAnywhere=(term)=>[...ownField,...enemyField].some(id=>named(id).includes(term));
 return {room,who,unitId,body:body||{},player,foe,card,named,type,attribute,ownField,enemyField,ownIntegration,hasField,hasIntegration,fieldCount,deckCount,handCount,fieldAnywhere};
}

register('COC-01-009',c=>require_(Boolean(c.player.integration),'이 주문은 일체화 상태에서만 사용할 수 있습니다.'));
register('COC-05-005',c=>require_(!c.player.roundPlays,'이번 턴에 처음 사용하는 카드여야 합니다.'));
register('COC-05-007',c=>require_(c.hasField('카툰 랜드'),'카툰 랜드가 필드에 있어야 합니다.'));
register('COC-05-010',c=>require_(!c.hasField('카툰 랜드'),'카툰 랜드가 필드에 없어야 합니다.'));
register('COC-06-001',c=>require_((c.player.metalElementUsedGame||0)>=5,'금속 또는 원소 카드 5장 사용 기록이 필요합니다.'));
register('COC-06-005',c=>require_((c.player.elementSpellPlaysThisTurn||0)>=2,'이번 턴에 원소 주문을 2장 이상 사용해야 합니다.'));
register('COC-06-007',c=>require_((c.player.roundPlays||0)>=5,'이번 턴에 이 주문 이전 카드 5장을 사용해야 합니다.'));
register('COC-08-001',c=>require_(c.deckCount('요괴')>=2,'덱에 요괴 속성 카드가 2장 이상 있어야 합니다.'));
register('COC-08-003',c=>require_(c.fieldCount('요괴')>=1,'필드에 요괴 몬스터가 필요합니다.'));
register('COC-08-004',c=>require_(c.fieldCount('요괴')>=3,'필드에 요괴 몬스터 3장이 필요합니다.'));
register('COC-08-006',c=>require_(c.fieldCount('요괴')===2,'필드에 요괴 몬스터가 정확히 2장 있어야 합니다.'));
register('COC-08-010',c=>require_(c.hasIntegration('츠쿠모가미 야시키'),'츠쿠모가미 야시키와 일체화 중이어야 합니다.'));
register('COC-09-001',c=>require_(c.deckCount('무기')>=3,'덱에 무기 속성 카드 3장이 필요합니다.'));
register('COC-09-005 COC-09-006 COC-09-007',c=>require_(Boolean(c.player.integration),'일체화 상태여야 합니다.'));
register('COC-11-010',c=>require_(c.hasIntegration('해풍을 다스리는 용왕'),'해풍을 다스리는 용왕 일체화 상태가 필요합니다.'));
register('COC-12-004',c=>require_(c.player.hand.length<=1,'손패가 1장 이하여야 합니다.'));
register('COC-12-009',c=>require_(c.deckCount('영웅')>=6,'덱에 영웅 속성 카드 6장 이상이 필요합니다.'));
register('COC-13-001 COC-13-002 COC-13-003 COC-13-004 COC-13-005',c=>require_(c.enemyField.length>0,'상대 필드에 몬스터가 있어야 합니다.'));
register('COC-13-006',c=>require_(c.enemyField.length===0,'상대 필드에 몬스터가 없는 경우에만 일반 소환할 수 있습니다.'));
register('COC-14-003',c=>require_(Boolean(c.player.integration),'일체화 상태여야 합니다.'));
register('COC-14-006',c=>require_(c.enemyField.some(id=>c.room.units[id]?.atk>=350),'상대 필드에 공격력 350 이상 몬스터가 필요합니다.'));
register('COC-17-001',c=>require_(c.hasField('태양신')&&c.hasField('호루스'),'필드에 태양신 호루스가 있어야 합니다.'));
register('COC-17-005 COC-17-006',c=>require_(c.hasIntegration('호루스의 현신'),'호루스의 현신–파라오와 일체화해야 합니다.'));
register('COC-20-003',c=>require_(c.player.hp<=600,'체력이 600 이하여야 합니다.'));
register('COC-20-006',c=>require_(c.player.hp<=700,'체력이 700 이하여야 합니다.'));
register('COC-20-007',c=>require_(c.player.hp<=500&&c.hasIntegration('버닝 데몬즈'),'버닝데몬즈 일체화와 체력 500 이하가 필요합니다.'));
register('COC-20-011',c=>require_(c.hasField('버닝데몬즈')||c.hasField('버닝 데몬즈'),'버닝데몬즈가 필드에 있어야 합니다.'));
register('COC-23-002 COC-23-003 COC-23-005 COC-23-008',c=>require_(c.hasIntegration('라이드 위저드'),'라이드 위저드와 일체화해야 합니다.'));
register('COC-23-004',c=>require_(c.deckCount('라이드 위저드')>=1,'덱에 라이드 위저드가 있어야 합니다.'));
register('COC-23-006 COC-23-009',c=>require_(c.hasIntegration('라이드 위저드'),'라이드 위저드와 일체화해야 합니다.'));
register('COC-23-010',c=>require_(c.player.hand.length===1&&c.ownField.length===0&&c.player.deck.length<=3,'이 카드 외 손패가 없고, 필드가 비어 있으며 덱이 3장 이하여야 합니다.'));
register('COC-24-003 COC-24-004 COC-24-005 COC-24-006 COC-24-009 COC-26-003 COC-26-004 COC-26-009',c=>require_(c.hasIntegration('베스트 지니어스'),'베스트 지니어스와 일체화해야 합니다.'));
register('COC-24-002 COC-26-002',c=>require_(c.deckCount('베스트 지니어스')>=1,'덱에 베스트 지니어스가 있어야 합니다.'));
register('COC-24-007',c=>require_(c.ownField.length===0,'필드가 비어 있어야 합니다.'));
register('COC-24-008 COC-26-008',c=>require_(c.ownField.filter(id=>c.named(id).includes('매치')).length<=1,'필드의 매치 몬스터가 1장 이하여야 합니다.'));
register('COC-26-005',c=>require_(c.hasField('저지먼트 매치'),'필드에 저지먼트 매치가 있어야 합니다.'));
register('COC-30-008',c=>require_((c.player.natureSpellsUsedGame||0)>=3,'이번 게임에서 자연 속성 주문을 3장 이상 사용해야 합니다.'));
register('COC-30-009',c=>require_(c.hasIntegration('풍요의 여신 아젤리아'),'풍요의 여신 아젤리아와 일체화해야 합니다.'));
register('COC-31-001',c=>require_(c.enemyField.length>0,'상대 필드에 몬스터가 필요합니다.'));
register('COC-31-002',c=>require_(c.fieldAnywhere('크로와'),'필드에 크로와가 존재해야 합니다.'));
register('COC-31-003',c=>require_(c.fieldAnywhere('크로와')&&c.fieldAnywhere('카스테'),'필드에 크로와와 카스테가 필요합니다.'));
register('COC-31-010',c=>require_(c.hasIntegration('슈'),'최광의 대마법사 슈와 일체화해야 합니다.'));
register('COC-32-001 COC-32-002 COC-32-003 COC-32-004',c=>require_(c.player.hand.some(id=>id!==c.unitId&&c.type(id)==='주문'),'패에 주문 카드가 있어야 합니다.'));
register('COC-32-005',c=>require_(c.hasField('플레임'),'원소의 마법사 플레임이 필드에 있어야 합니다.'));
register('COC-32-006',c=>require_(c.hasField('워터'),'원소의 마법사 워터가 필드에 있어야 합니다.'));
register('COC-32-007',c=>require_(c.hasField('윈드'),'원소의 마법사 윈드가 필드에 있어야 합니다.'));
register('COC-32-008',c=>require_(c.hasField('랜드'),'원소의 마법사 랜드가 필드에 있어야 합니다.'));
register('COC-32-009',c=>require_(c.ownField.some(id=>c.named(id).includes('원소의 마법사')),'원소의 마법사 몬스터가 필드에 있어야 합니다.'));
register('COC-32-010',c=>require_((c.player.spellsThisTurn||0)>=1,'이번 턴에 주문을 사용한 기록이 있어야 합니다.'));

// Material / discard costs: preflight every zone and selected unit before any mutation.
register('COC-12-010',c=>{
 const ids=c.body.costUnitIds;
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||!ids.every(id=>c.ownField.includes(id)))deny('소환하기 전에 자신 필드의 몬스터 2장을 소재로 지정해야 합니다.');
 return {costs:ids.map(id=>({unitId:id,to:'grave'}))};
});
register('COC-14-001',c=>{
 const ids=c.body.costUnitIds;
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||!ids.every(id=>c.ownField.includes(id)))deny('자신 필드의 몬스터 2장을 파괴 비용으로 지정해야 합니다.');
 return {costs:ids.map(id=>({unitId:id,to:'destroy'}))};
});
register('COC-14-004',c=>{
 const ids=c.body.costUnitIds;
 if(!Array.isArray(ids)||ids.length<1||ids.length>2||new Set(ids).size!==ids.length||!ids.every(id=>c.ownField.includes(id)))deny('자신을 제외한 아군 몬스터 1~2장을 제외 비용으로 선택해야 합니다.');
 if(ids.length===2){
  const target=c.body.target?.id;
  if(!target||ids.includes(target)||![...c.ownField,...c.enemyField].includes(target))deny('공격력을 절반으로 낮출 유효한 필드 몬스터를 선택해야 합니다.');
 }
 return {costs:ids.map(id=>({unitId:id,to:'banished'}))};
});
register('COC-14-005',c=>require_(c.player.deck.length>0,'무작위로 버릴 덱 카드가 1장 이상 필요합니다.'));
register('COC-17-008',c=>{
 const ids=c.body.costUnitIds;
 if(!Array.isArray(ids)||ids.length!==1||!c.ownField.includes(ids[0])||!c.named(ids[0]).includes('미라 병사'))deny('자신 필드의 미라 병사 1장을 릴리스해야 합니다.');
 return {costs:[{unitId:ids[0],to:'grave'}]};
});
register('COC-21-004',c=>{
 const ids=c.body.costUnitIds;
 if(!Array.isArray(ids)||ids.length!==1||!c.ownField.includes(ids[0]))deny('제물로 바칠 아군 몬스터를 지정해야 합니다.');
 const unit=c.room.units[ids[0]];
 if(!Number.isFinite(unit.atk)||!Number.isFinite(unit.hp)||unit.atk+unit.hp<250)deny('제물 몬스터의 현재 공격력과 체력 합계가 250 이상이어야 합니다.');
 if(!c.enemyField.includes(c.body.target?.id))deny('파괴할 상대 필드 몬스터를 선택해야 합니다.');
 return {costs:[{unitId:ids[0],to:'grave'}]};
});
register('COC-27-004',c=>({costs:c.player.hand.filter(id=>id!==c.unitId).map(id=>({unitId:id,to:'grave'}))}));
register('COC-08-008',c=>({costs:c.player.hand.filter(id=>id!==c.unitId).map(id=>({unitId:id,to:'grave'}))}));

/** Validation has no side effects and can be safely used for AI move planning. */
export function planActivation({room,who,unitId,cards,body={}}){
 const c=context(room,who,unitId,cards,body);
 const predicate=SPEC.get(c.card.id);
 return {...(predicate?predicate(c):ok()),verified:!!predicate,cardId:c.card.id};
}

export function commitActivationCosts(room,plan,{move,destroy}){
 for(const cost of plan.costs){
  const unit=room.units[cost.unitId];
  if(!unit)deny('소재나 비용으로 지정한 카드가 존재하지 않습니다.');
  if(cost.to==='destroy')destroy(room,cost.unitId);
  else move(room,cost.unitId,cost.to==='banished'?'banished':'grave',unit.owner);
 }
}
export const PRECHECKED_ACTIVATION_IDS=Object.freeze([...SPEC.keys()].sort());