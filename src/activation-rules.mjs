import {TIMED_SPELL_IDS,requireUnusedEffect} from './effect-usage.mjs';
import {destructionProtected} from './protection-auras.mjs';
import {covenantReady} from './undead-spells.mjs';
import {clayRevivalReady,clayCopyCandidates} from './clay-copies.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {balanceValues as B} from './balance-values.mjs';
import {allWanderersDied,enemyFieldEmptyThreeTurns} from './integration-history.mjs';
import {cardUseForbidden} from './card-game-history.mjs';
import {batchSummonCount} from './effect-summon-batches.mjs';
import {hasElementalForm} from './elemental-dragons.mjs';
import {evolutionRules,validateEvolution,natureEvolutionCosts} from './evolution.mjs';
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

function context(room, who, unitId, catalog, body, copiedCardId=null) {
 const player=room.players[who], foe=room.players[1-who];
 const card= catalog.get(copiedCardId??room.units[unitId]?.cardId);
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
 return {room,who,unitId,catalog,body:body||{},player,foe,card,named,type,attribute,ownField,enemyField,ownIntegration,hasField,hasIntegration,fieldCount,deckCount,handCount,fieldAnywhere};
}

register('COC-01-009',c=>require_(Boolean(c.player.integration),'이 주문은 일체화 상태에서만 사용할 수 있습니다.'));
register('COC-01-002',c=>{
 const ids=c.body.costUnitIds;
 require_(Array.isArray(ids)&&ids.length===1&&c.player.field.includes(ids[0])&&c.room.units[ids[0]].cardId==='COC-01-001','자신 필드의 그란레오 1장을 릴리스해야 합니다.');
 return {costs:[{unitId:ids[0],to:'grave'}]};
});
register('COC-21-003',c=>require_(c.room.phase==='DRAW'&&c.player.turnsTaken===1&&c.player.deck.filter(id=>c.attribute(id).includes('저주')).length>=2,'재단은 첫 자신의 드로우 페이즈에 덱의 저주 카드 2장 조건으로 자동 발동합니다.'));
register('COC-03-006',c=>{
 const id=c.body.costCardId;
 require_(id!==c.unitId&&c.player.hand.includes(id)&&c.attribute(id).includes('영매'),'다른 영매 속성 패 1장을 버려야 합니다.');
 return {costs:[{unitId:id,to:'grave'}]};
});
register('COC-17-007',c=>require_(Object.keys(c.player.pyramidSources||{}).length>0,'피라미드의 필드 효과가 적용 중이어야 합니다.'));
register('COC-21-006',c=>require_((c.player.monsterLossCount||0)>=3&&(c.player.recentMonsterLosses||[]).length===3,'자신의 몬스터 3장 이상 파괴/삭제 이력이 필요합니다.'));
register('COC-05-005',c=>require_(!c.player.roundPlays&&c.player.lastCardUseTurn!==c.room.turnNumber,'이번 턴에 처음 사용하는 카드여야 합니다.'));
register('COC-05-007',c=>{require_(c.hasField('카툰 랜드'),'카툰 랜드가 필드에 있어야 합니다.');return require_(c.player.field.includes(null),'카드를 가져올 빈 필드 칸이 없습니다.');});
register('COC-05-010',c=>require_(!c.hasField('카툰 랜드'),'카툰 랜드가 필드에 없어야 합니다.'));
register('COC-06-001',c=>require_((c.player.metalElementUsedGame||0)>=5,'금속 또는 원소 카드 5장 사용 기록이 필요합니다.'));
register('COC-06-005',c=>require_((c.player.elementSpellPlaysThisTurn||0)>=2,'이번 턴에 원소 주문을 2장 이상 사용해야 합니다.'));
register('COC-06-007',c=>require_((c.player.roundPlays||0)>=5,'이 카드를 제외하고 이번 턴에 카드 5장을 먼저 사용해야 합니다.'));
register('COC-07-002',c=>{
 require_(c.room.units[c.unitId].activationTurn!==c.room.turnNumber,'이 렌 카드는 이번 턴에 이미 사용했습니다.');
 return {costs:[{markActivation:c.unitId},{draw:1,player:1-c.who}]};
});
register('COC-08-001',c=>require_(c.deckCount('요괴')>=2,'덱에 요괴 속성 카드가 2장 이상 있어야 합니다.'));
register('COC-08-003',c=>require_(c.fieldCount('요괴')>=1,'필드에 요괴 몬스터가 필요합니다.'));
register('COC-08-004',c=>require_(c.fieldCount('요괴')>=3,'필드에 요괴 몬스터 3장이 필요합니다.'));
register('COC-08-006',c=>require_(c.fieldCount('요괴')===2,'필드에 요괴 몬스터가 정확히 2장 있어야 합니다.'));
register('COC-08-009',c=>{
 require_(c.fieldCount('요괴')>0,'강화할 자신의 요괴 몬스터가 필요합니다.');
 return {costs:[{scheduleFieldDestruction:c.ownField.map(id=>({id,revision:c.room.units[id].fieldRevision||0})),player:c.who}]};
});
register('COC-08-010',c=>require_(c.hasIntegration('츠쿠모가미 야시키'),'츠쿠모가미 야시키와 일체화 중이어야 합니다.'));
register('COC-09-001',c=>require_(c.deckCount('무기')>=3,'덱에 무기 속성 카드 3장이 필요합니다.'));
register('COC-09-005 COC-09-006 COC-09-007',c=>require_(Boolean(c.player.integration),'일체화 상태여야 합니다.'));
register('COC-10-010',c=>require_(covenantReady(c.room,c.who),'현재 프람덴베르카와 일체화한 동안 자신의 몬스터가 3장 이상 파괴되고 빈 필드가 있어야 합니다.'));
register('COC-10-005',c=>require_(allWanderersDied(c.room,c.who),'자신 소유의 디트리히·프란츠·율리우스가 각각 필드에서 파괴된 기록이 필요합니다.'));
register('COC-07-006',c=>{validateEvolution(c.room,c.who,c.card.id,c.catalog);return require_((c.foe.reloads||0)>=1,'상대가 드로우 부족으로 리로드 피해를 받은 기록이 필요합니다.');});
register('COC-11-002',c=>{
 validateEvolution(c.room,c.who,c.card.id,c.catalog);
 require_([...c.ownField,...c.enemyField].filter(id=>/용|드래곤/.test(c.attribute(id))).length>=2,'양쪽 필드에 용/드래곤 속성 몬스터가 합계 2장 이상 있어야 합니다.');
 require_(c.player.hp>300,'체력 300을 지불한 뒤 생존해야 합니다.');
 return {costs:[{player:c.who,hp:300}]};
});
register('COC-11-010',c=>require_(c.hasIntegration('해풍을 다스리는 용왕'),'해풍을 다스리는 용왕 일체화 상태가 필요합니다.'));
register('COC-12-004',c=>require_(c.player.hand.length<=1,'손패가 1장 이하여야 합니다.'));
register('COC-12-009',c=>require_(c.deckCount('영웅')>=6,'덱에 영웅 속성 카드 6장 이상이 필요합니다.'));
register('COC-13-001 COC-13-002 COC-13-003 COC-13-004 COC-13-005',c=>require_(c.enemyField.length>0,'상대 필드에 몬스터가 있어야 합니다.'));
register('COC-13-006',c=>require_(c.enemyField.length===0,'상대 필드에 몬스터가 없는 경우에만 일반 소환할 수 있습니다.'));
register('COC-14-003',c=>require_(Boolean(c.player.integration),'일체화 상태여야 합니다.'));
register('COC-14-006',c=>require_(c.enemyField.some(id=>c.room.units[id]?.atk>=350),'상대 필드에 공격력 350 이상 몬스터가 필요합니다.'));
register('COC-17-001',c=>require_(c.hasField('태양신')&&c.hasField('호루스'),'필드에 태양신 호루스가 있어야 합니다.'));
register('COC-17-005 COC-17-006',c=>require_(c.hasIntegration('호루스의 현신'),'호루스의 현신–파라오와 일체화해야 합니다.'));
register('COC-19-007',c=>{require_(clayRevivalReady(c.room,c.who),'지난 한 턴 전체부터 현재까지 자신의 필드가 비어 있어야 합니다.');return require_(clayCopyCandidates(c.room,c.who,c.catalog).length>0,'묘지에 파괴된 자신의 기본 몬스터가 필요합니다.');});
register('COC-20-003',c=>require_(c.player.hp<=600,'체력이 600 이하여야 합니다.'));
register('COC-20-006',c=>require_(c.player.hp<=700,'체력이 700 이하여야 합니다.'));
register('COC-20-007',c=>require_(c.player.hp<=500&&c.hasIntegration('버닝 데몬즈'),'버닝데몬즈 일체화와 체력 500 이하가 필요합니다.'));
register('COC-20-009',c=>({costs:[{player:c.who,hp:100,damage:true}]}));
register('COC-20-010',c=>{
 require_(batchSummonCount(c.room,c.who,c.card.id,{cards:c.catalog})>0,'필드를 떠난 자신의 버닝데몬즈와 빈 필드가 필요합니다.');
 const hp=Math.ceil(c.player.hp/2);require_(c.player.hp>hp,'체력 절반을 지불한 뒤 생존해야 합니다.');
 return {costs:[{player:c.who,hp}]};
});
register('COC-20-011',c=>require_(c.fieldAnywhere('버닝데몬즈')||c.fieldAnywhere('버닝 데몬즈'),'버닝데몬즈가 필드에 있어야 합니다.'));
register('COC-23-002 COC-23-003 COC-23-005 COC-23-008',c=>require_(c.hasIntegration('라이드 위저드'),'라이드 위저드와 일체화해야 합니다.'));
register('COC-23-004',c=>require_(c.deckCount('라이드 위저드')>=1,'덱에 라이드 위저드가 있어야 합니다.'));
register('COC-23-006 COC-23-009',c=>require_(c.hasIntegration('라이드 위저드'),'라이드 위저드와 일체화해야 합니다.'));
register('COC-23-010',c=>{
 require_(c.player.hand.length===1&&c.ownField.length===0&&c.player.deck.length<=3,'이 카드 외 손패가 없고, 필드가 비어 있으며 덱이 3장 이하여야 합니다.');
 return require_(batchSummonCount(c.room,c.who,c.card.id,{cards:c.catalog})>0,'사용 가능한 라이드머신 소환 후보가 필요합니다.');
});
register('COC-24-003 COC-24-004 COC-24-005 COC-24-006 COC-24-009 COC-26-003 COC-26-004 COC-26-009',c=>require_(c.hasIntegration('베스트 지니어스'),'베스트 지니어스와 일체화해야 합니다.'));
register('COC-24-002 COC-26-002',c=>require_(c.deckCount('베스트 지니어스')>=1,'덱에 베스트 지니어스가 있어야 합니다.'));
register('COC-24-007',c=>{require_(c.ownField.length===0,'필드가 비어 있어야 합니다.');return require_(batchSummonCount(c.room,c.who,c.card.id,{cards:c.catalog})>0,'묘지에 실제 파괴된 자기 몬스터가 필요합니다.');});
register('COC-24-008 COC-26-008',c=>require_(c.ownField.filter(id=>c.named(id).includes('매치')).length<=1,'필드의 매치 몬스터가 1장 이하여야 합니다.'));
register('COC-26-005',c=>require_(c.hasField('저지먼트 매치'),'필드에 저지먼트 매치가 있어야 합니다.'));
register('COC-30-008',c=>require_((c.player.natureSpellsUsedGame||0)>=3,'이번 게임에서 자연 속성 주문을 3장 이상 사용해야 합니다.'));
register('COC-30-009',c=>{
 const eligible=natureEvolutionCosts(c.room,c.who,c.unitId,c.catalog),ids=c.body.costDeckIds;
 if(!Array.isArray(ids)||ids.length!==2||new Set(ids).size!==2||!ids.every(id=>eligible.includes(id)))deny('비용으로 버릴 서로 다른 자연 속성 덱 카드 2장을 선택해야 합니다.');
 return {costs:ids.map(unitId=>({unitId,to:'grave'}))};
});
register('COC-31-001',c=>require_(c.enemyField.length>0,'상대 필드에 몬스터가 필요합니다.'));
register('COC-31-002',c=>require_(c.fieldAnywhere('크로와'),'필드에 크로와가 존재해야 합니다.'));
register('COC-31-003',c=>require_(c.fieldAnywhere('크로와')&&c.fieldAnywhere('카스테'),'필드에 크로와와 카스테가 필요합니다.'));
register('COC-31-004',c=>require_(enemyFieldEmptyThreeTurns(c.room,c.who,c.catalog),'상대 필드에 몬스터가 없는 상태로 연속 3턴이 완전히 지나야 합니다.'));
register('COC-31-010',c=>require_(c.hasIntegration('슈'),'최광의 대마법사 슈와 일체화해야 합니다.'));
register('COC-32-001 COC-32-002 COC-32-003 COC-32-004',c=>require_(c.player.hand.some(id=>id!==c.unitId&&c.type(id)==='주문'),'패에 주문 카드가 있어야 합니다.'));
for(const [spell,form] of [['COC-32-005','COC-32-001'],['COC-32-006','COC-32-002'],['COC-32-007','COC-32-003'],['COC-32-008','COC-32-004']])register(spell,c=>require_(hasElementalForm(c.room,[...c.ownField,...c.enemyField],form),`${c.catalog.get(form).name} 또는 규칙상 같은 이름인 드래곤이 필드에 있어야 합니다.`));
register('COC-32-009',c=>require_(['COC-32-001','COC-32-002','COC-32-003','COC-32-004'].some(form=>hasElementalForm(c.room,c.ownField,form)),'원소의 마법사 몬스터가 필드에 있어야 합니다.'));
register('COC-32-010',c=>require_((c.player.spellsThisTurn||0)>=1,'이번 턴에 주문을 사용한 기록이 있어야 합니다.'));

register('COC-03-003',c=>{validateEvolution(c.room,c.who,c.card.id,c.catalog);return ok();});
register('COC-07-003 COC-07-004 COC-07-008 COC-07-010',c=>({costs:[{player:1-c.who,draw:1}]}));

// Paid before the opponent responds. Resolution never charges these again.
register('COC-05-002 COC-31-007',c=>{
 const cost=c.card.id==='COC-31-007'?B.flashHpCost:100;
 require_(c.player.hp>cost,'필요한 체력을 지불할 수 없습니다.');
 require_(c.player.field.includes(null),'카드를 놓을 빈 필드 칸이 없습니다.');
 return {costs:[{player:c.who,hp:cost}]};
});
register('COC-14-002',c=>{
 require_(c.player.deck.length>0,'비용으로 버릴 덱 맨 위 카드가 필요합니다.');
 return {costs:[{unitId:c.player.deck[0],to:'grave'}]};
});
register('COC-27-010',c=>({costs:[{player:c.who,hp:200,damage:true}]}));
register('COC-30-011',c=>{
 const used=new Set(c.player.natureSpellTurns||[]);
 return require_(used.has(c.room.turnNumber-2)&&used.has(c.room.turnNumber-4),
  '지난 자신의 두 턴 모두 자연 속성 주문을 사용했어야 합니다.');
});

// Material / discard costs: preflight every zone and selected unit before any mutation.
register('COC-31-009',c=>{
 const id=c.body.costCardId;
 if(typeof id!=='string'||id===c.unitId||!c.player.hand.includes(id))
  deny('효과 비용으로 버릴 다른 자신의 손패 1장을 선택해야 합니다.');
 return {costs:[{unitId:id,to:'grave'}]};
});
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
 if(!Number.isFinite(unit.atk)||!Number.isFinite(unit.hp)||unit.atk+unit.hp<B.envySacrificeTotal)deny(`제물 몬스터의 현재 공격력과 체력 합계가 ${B.envySacrificeTotal} 이상이어야 합니다.`);
 if(!c.enemyField.includes(c.body.target?.id))deny('파괴할 상대 필드 몬스터를 선택해야 합니다.');
 return {costs:[{unitId:ids[0],to:'grave'}]};
});
register('COC-27-004',c=>({costs:c.player.hand.filter(id=>id!==c.unitId).map(id=>({unitId:id,to:'grave'}))}));
register('COC-08-008',c=>({costs:c.player.hand.filter(id=>id!==c.unitId).map(id=>({unitId:id,to:'grave'}))}));

/** Validation has no side effects and can be safely used for AI move planning. */
export function planActivation({room,who,unitId,cards,body={}}){
 const c=context(room,who,unitId,cards,body);
 if(TIMED_SPELL_IDS.includes(c.card.id))requireUnusedEffect(room,who,unitId,1);
 if(cardUseForbidden(room,who,c.card))deny('라이드머신 어나더의 게임 중 사용 금지로 다른 라이드머신을 사용할 수 없습니다.');
 if(evolutionRules[c.card.id])validateEvolution(room,who,c.card.id,cards);
 const predicate=SPEC.get(c.card.id);
 return {...(predicate?predicate(c):ok()),verified:!!predicate,cardId:c.card.id};
}

// Reuse checks the original spell's requirements with the real executor UID.
// No synthetic unit, catalog mutation or original card movement is required.
// The caller owns its explicit audited-copy allowlist; this is not Original Sin.
export function planReusedSpellActivation({room,who,sourceId,cardId,cards,body={}}){
 if(!room.units[sourceId]||cards.get(cardId)?.type!=='주문')deny('재사용 실행자와 원본 주문이 필요합니다.');
 const c=context(room,who,sourceId,cards,body,cardId);
 if(cardUseForbidden(room,who,c.card))deny('원본 주문의 사용 금지를 우회할 수 없습니다.');
 if(evolutionRules[cardId])deny('진화 주문 재사용은 아직 지원하지 않습니다.');
 const predicate=SPEC.get(cardId);
 return {...(predicate?predicate(c):ok()),verified:!!predicate,cardId};
}

export function commitActivationCosts(room,plan,{move,destroy,draw}){
 // Validate the entire cost set before moving the first card; one protected
 // material must not let the action partially pay the other materials.
 for(const cost of plan.costs){
  if(cost.markActivation){
   if(!room.units[cost.markActivation]||room.units[cost.markActivation].activationTurn===room.turnNumber)deny('이 카드의 턴당 사용 횟수를 이미 지불했습니다.');
   continue;
  }
  if(cost.scheduleFieldDestruction){
   if(cost.scheduleFieldDestruction.some(c=>!room.players[cost.player].field.includes(c.id)||(room.units[c.id]?.fieldRevision||0)!==c.revision))deny('지연 파괴를 약정할 자신의 필드가 변경되었습니다.');
   continue;
  }
  if(cost.draw){if(!room.players[cost.player]||typeof draw!=='function')deny('드로우 비용을 처리할 수 없습니다.');continue;}
  if(cost.hp!==undefined){
   if(!room.players[cost.player]||(!cost.damage&&room.players[cost.player].hp<=cost.hp))deny('필요한 체력을 지불할 수 없습니다.');
   continue;
  }
  const unit=room.units[cost.unitId];
  if(!unit)deny('소재나 비용으로 지정한 카드가 존재하지 않습니다.');
  if(cost.to==='destroy'&&(unit.effectDestructionImmune||destructionProtected(room,cost.unitId)))
   deny('파괴할 수 없는 몬스터는 파괴 비용으로 지불할 수 없습니다.');
 }
 for(const cost of plan.costs){
  if(cost.markActivation){room.units[cost.markActivation].activationTurn=room.turnNumber;continue;}
  if(cost.scheduleFieldDestruction){
   room.effects??=[];room.effects.push({type:'next-enemy-turn-destroy',player:cost.player,appliedAtTurn:room.turnNumber,targets:structuredClone(cost.scheduleFieldDestruction)});continue;
  }
  if(cost.draw){draw(room,cost.player);continue;}
  if(cost.hp!==undefined){if(cost.damage)damagePlayer(room,cost.player,cost.hp);else room.players[cost.player].hp-=cost.hp;continue;}
  const unit=room.units[cost.unitId];
  if(cost.to==='destroy'){
   if(destroy(room,cost.unitId)===false)
    deny('몬스터 파괴 비용 지불에 실패했습니다.');
  }else move(room,cost.unitId,cost.to==='banished'?'banished':'grave',unit.owner);
 }
}
export const PRECHECKED_ACTIVATION_IDS=Object.freeze([...SPEC.keys()].sort());
