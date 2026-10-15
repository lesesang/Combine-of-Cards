import {beginAutomaticTriggerOrder} from './effect-runtime.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';

// Draft automation: the user requested implementation batches before testing.
// These are automatic monster triggers, not selectable MAIN field abilities.
export const TRIGGER_RULES=Object.freeze({
 'COC-32-001':{effectNumber:2,event:'battle-completed'},
 'COC-32-002':{effectNumber:2,event:'attack-target'},
 'COC-32-004':{effectNumber:2,event:'second-turn-start'},
 'COC-32-011':{effectNumber:2,event:'enemy-monster-destroyed'},
 'COC-32-015':{effectNumber:1,event:'attack-declared'}
});
function trigger(r,who,id,extra={}){
 const u=r.units[id];
 return {key:`trigger-${r.turnNumber}-${id}`,effectId:'monster-trigger-resolution',owner:who,sourceId:id,sourceZone:'field',priority:0,
  title:`${u.cardId} · 효과 ${TRIGGER_RULES[u.cardId].effectNumber}`,
  payload:{cardId:u.cardId,sourceRevision:u.fieldRevision||0,...extra}};
}
function deferAttackBonus(r,id,H,extra){
 const u=r.units[id],z=H.zone(r,id);
 if(r.status!=='active'||!u||u.effectsNegated||z?.zone!=='field'||z.player!==r.turn||effectUsedThisTurn(r,z.player,id,2))return;
 const pending=r.deferredMonsterTriggers??=[];
 // Batch destruction is one opportunity, not one bonus for every victim.
 // Reserve by physical UID/effect/turn, independently of elemental effect 1.
 if(pending.some(e=>e.sourceId===id&&e.payload.eventTurn===r.turnNumber))return;
 pending.push(trigger(r,z.player,id,{eventTurn:r.turnNumber,...extra}));
}
export function recordElementalBattle(r,sourceId,{sourceAttack,targetAttack},H){
 if(r.units[sourceId]?.cardId==='COC-32-001'&&sourceAttack>targetAttack)
  deferAttackBonus(r,sourceId,H,{event:'battle-completed',sourceAttack,targetAttack});
}
export function recordMonsterDestruction(r,{sourceId,victimId,victimController,victimType,cause},H){
 const z=sourceId&&H.zone(r,sourceId);
 if(r.units[sourceId]?.cardId!=='COC-32-011'||cause==='cost'||sourceId===victimId||z?.player===victimController||!victimType?.includes('몬스터'))return;
 deferAttackBonus(r,sourceId,H,{event:'enemy-monster-destroyed',victimId});
}
export function drainDeferredMonsterTriggers(r,H){
 if(r.status!=='active'){r.deferredMonsterTriggers=[];return;}
 // Destruction can occur within a spell, paid cost, summon, or heal group.
 // Collect there, declare only after that complete chain and its choices.
 if(r.pendingMonsterTriggers||r.pendingAbility||r.pendingSpell||r.pendingExtraSummon||r.pendingTriggerOrder||r.pendingInfinityChoice||r.pendingElementalChoice||r.pendingRecruitChoice||r.pendingDeckSearch||r.effectStack?.length)return;
 const effects=(r.deferredMonsterTriggers||[]).filter(e=>r.units[e.sourceId]?.cardId===e.payload.cardId&&e.payload.eventTurn===r.turnNumber&&!effectUsedThisTurn(r,e.owner,e.sourceId,2));
 if(effects.length)queueMonsterTriggers(r,effects,H);
 r.deferredMonsterTriggers=[];
}
export function attackDeclarationTriggers(r,attackerId,target,H,{retarget=false}={}){
 const source=r.units[attackerId],who=r.turn,group=[];
 if(!source)return group;
 if(!retarget&&source.cardId==='COC-32-015'&&!source.effectsNegated&&!effectUsedThisTurn(r,who,attackerId,1))group.push(trigger(r,who,attackerId));
 const defender=target.type==='unit'&&r.units[target.id];
 if(defender?.cardId==='COC-32-002'&&!defender.effectsNegated&&((H.type(r,attackerId)||source.tokenCard?.type||'').includes('몬스터')||Number.isFinite(source.hp))&&!effectUsedThisTurn(r,1-who,target.id,2)){
  group.push(trigger(r,1-who,target.id,{attackerId,attackerController:who,attackerRevision:source.fieldRevision||0}));
 }
 return group;
}
export function landTurnTriggers(r,who){
 const group=[];
 for(const id of r.players[who].field.filter(Boolean)){
  const u=r.units[id],stay=u.dragonResidence;
  if(u.cardId!=='COC-32-004'||!stay||stay.ownTurnStarts!==2||stay.landTriggered)continue;
  // The one event is missed while negated, not replayed on a later turn.
  stay.landTriggered=true;
  if(!u.effectsNegated)group.push(trigger(r,who,id));
 }
 return group;
}
export function queueMonsterTriggers(r,effects,H){
 if(!effects.length)return;
 if(r.pendingMonsterTriggers||r.pendingAbility||r.pendingSpell||r.pendingExtraSummon)throw new Error('another response chain is pending');
 beginAutomaticTriggerOrder(r,effects.map(e=>({...e,title:`${H.name(r,e.sourceId)} · 효과 ${TRIGGER_RULES[e.payload.cardId].effectNumber}`})),r.turn);
 for(const e of effects){markEffectUsed(r,e.owner,e.sourceId,TRIGGER_RULES[e.payload.cardId].effectNumber);}
 r.pendingMonsterTriggers={stage:'ordering',queue:[]};
 resumeMonsterTriggers(r,H);
}
export function resumeMonsterTriggers(r,H){
 const pending=r.pendingMonsterTriggers;
 if(!pending||r.pendingTriggerOrder||r.pendingAbility||r.pendingInfinityChoice)return;
 if(r.status!=='active'){r.pendingMonsterTriggers=null;return;}
 if(pending.stage==='ordering'){
  if(!r.effectStack?.length||r.effectStack.some(e=>e.effectId!=='monster-trigger-resolution'))throw new Error('invalid ordered monster trigger stack');
  // Hold the already-declared lower entries while each upper entry receives
  // its own counter chain. Order and source snapshots stay serialized.
  pending.queue=r.effectStack.splice(0);pending.stage='responses';
 }
 if(r.effectStack?.length)return;
 const next=pending.queue.pop();
 if(!next){r.pendingMonsterTriggers=null;return;}
 r.effectStack.push(next);
 r.pendingAbility={who:next.owner,sourceId:next.sourceId,cardId:next.payload.cardId,sequence:next.sequence,stage:'response',kind:'trigger',effectNumber:TRIGGER_RULES[next.payload.cardId].effectNumber};
 H.log(r,'effect',`${H.name(r,next.sourceId)}: 자동 유발 효과 선언, 상대 대응 대기`);
}
export function resolveMonsterTrigger(r,e,H){
 const u=r.units[e.sourceId],z=H.zone(r,e.sourceId),p=e.payload;
 if(!u||u.cardId!==p.cardId||u.effectsNegated||z?.zone!=='field'||z.player!==e.owner||(u.fieldRevision||0)!==p.sourceRevision){H.log(r,'effect','유발 소스 이탈/재진입·조종권/무효 상태로 불발');return;}
 if(p.cardId==='COC-32-001'||p.cardId==='COC-32-011'){
  if(r.turn!==e.owner||p.eventTurn!==r.turnNumber)return;
  if(u.bonusAttackTurn!==r.turnNumber){u.bonusAttackTurn=r.turnNumber;u.bonusAttackCount=0;}
  u.bonusAttackCount=(u.bonusAttackCount||0)+1;
  H.log(r,'effect',`${H.name(r,e.sourceId)}: 이 턴 추가 공격 기회 1회 획득`);
 }else if(p.cardId==='COC-32-002'){
  const a=r.units[p.attackerId],az=H.zone(r,p.attackerId);
  if(!a||az?.zone!=='field'||az.player!==p.attackerController||(a.fieldRevision||0)!==p.attackerRevision)return;
  if(swordActualAttack(r,p.attackerId,{getZone:(room,id)=>H.zone(room,id)})>u.hp){
   H.destroy(r,p.attackerId,{sourceId:e.sourceId});
   // A destroyed then revived attacker is a different field stay too.
   const after=H.zone(r,p.attackerId);
   if(after?.zone!=='field'||after.player!==p.attackerController||(r.units[p.attackerId]?.fieldRevision||0)!==p.attackerRevision){r.pendingAttack=null;H.log(r,'attack','워터의 반격으로 공격자가 이탈하여 공격 종료');}
  }
 }else if(p.cardId==='COC-32-004'){
  if(!Number.isFinite(u.hp)||u.hp<=0)return;
  // Exchange mutable stats; independent Sword multipliers remain layered.
  const attack=Math.max(0,Math.floor(u.atk));u.atk=Math.max(0,Math.floor(u.hp));u.hp=attack;
  if(u.hp<=0)H.destroy(r,e.sourceId,{cause:'lethal',sourceId:e.sourceId});
  H.log(r,'effect','랜드: 현재 공격력·체력 교환 (독립 배율 유지)');
 }else if(p.cardId==='COC-32-015'){
  const enemy=1-e.owner,foe=r.players[enemy];
  const handCount=Math.min(2,foe.hand.length),deckCount=Math.min(2,foe.deck.length);
  for(let i=0;i<handCount;i++){const id=foe.hand[H.randomInt(foe.hand.length)];H.move(r,id,'banished',r.units[id].owner);}
  for(let i=0;i<deckCount;i++){const id=foe.deck[0];H.move(r,id,'banished',r.units[id].owner);}
  H.log(r,'effect',`인피니티: 상대 패 ${handCount}장과 덱 위 ${deckCount}장 제외`);
  const candidates=[...foe.grave];
  if(candidates.length)r.pendingInfinityChoice={who:enemy,sourceId:e.sourceId,candidates,count:Math.min(2,candidates.length)};
 }
 H.outcome(r);
}
export function infinityChoiceView(r,viewer,H){
 const p=r.pendingInfinityChoice;if(!p)return null;
 const eligible=p.candidates.filter(id=>r.players[p.who].grave.includes(id));
 return {who:p.who,count:Math.min(p.count,eligible.length),...(viewer===p.who?{choices:eligible.map(id=>({id,card:H.cards.get(r.units[id].cardId)}))}:{})};
}
export function chooseInfinityGrave(r,who,ids,H){
 const p=r.pendingInfinityChoice;
 if(r.status!=='active'||!p||who!==p.who)H.fail(409,'제외할 묘지 카드를 선택할 플레이어가 아닙니다.');
 const eligible=p.candidates.filter(id=>r.players[who].grave.includes(id));
 const count=Math.min(p.count,eligible.length);
 if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count||ids.some(id=>!eligible.includes(id)))H.fail(409,`자신의 묘지에서 서로 다른 카드 ${count}장을 선택하세요.`);
 for(const id of ids)H.move(r,id,'banished',r.units[id].owner);
 r.pendingInfinityChoice=null;H.log(r,'effect',`인피니티: 상대가 선택한 묘지 ${count}장 제외`);
}
