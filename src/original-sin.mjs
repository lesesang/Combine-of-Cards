import {gainUnitStats,gainPlayerStats} from './stat-gains.mjs';
import {applySharedUnitEffect,destroySharedUnits,moveSharedUnits,captureSharedUnits} from './shared-unit-effects.mjs';
import {declareEffect} from './effect-runtime.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {REUSABLE_SPELL_IDS,prepareCopiedSpellBody} from './spell-reuse.mjs';
import {castAutomatedSpell} from './automated-effects.mjs';
import {responseTargetChoices,responseTargetStillValid} from './spell-response-targets.mjs';
import {planReusedSpellActivation,commitActivationCosts} from './activation-rules.mjs';
import {beginDeckSearch} from './deck-search.mjs';
import {cardUseForbidden} from './card-game-history.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {nobleTarget,grantNoble} from './demon-effects.mjs';
import {balanceValues as B} from './balance-values.mjs';

// Explicit clauses, never an entire-card or natural-language evaluator.
// Historical/event-driven clauses stay unsupported until their independent
// event observers exist. A snapshot alone cannot manufacture an activation event.
export const SIN_SPELL_IDS=Object.freeze(REUSABLE_SPELL_IDS.filter(id=>!['COC-07-010','COC-20-004','COC-30-002'].includes(id)));
export const SIN_MONSTER_IDS=Object.freeze(['COC-05-004','COC-08-003','COC-12-013','COC-13-002','COC-13-005','COC-21-012','COC-24-003','COC-26-003']);
const spells=new Set(SIN_SPELL_IDS),monsters=new Set(SIN_MONSTER_IDS);
const ID='COC-21-001';
const ledgerKey=(uid,cid,number)=>`${uid}:${cid}:${number}`;
function idle(r){return r.status==='active'&&r.phase==='MAIN'&&!r.effectStack?.length&&!r.suspendedResponses?.length&&!r.deferredMonsterTriggers?.length&&!r.revivalQueue?.length&&!['pendingAttack','pendingManual','pendingSpell','pendingAbility','pendingExtraSummon','pendingTriggerOrder','pendingMonsterTriggers','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingRecruitChoice','pendingElementalChoice','pendingSummonBatch','pendingTurnStart','pendingTurnEnd'].some(k=>r[k]);}
function ready(r,who){
 const p=r.players[who],u=p?.integration&&r.units[p.integration];
 return r.turn===who&&idle(r)&&u?.cardId===ID&&!u.effectsNegated&&!effectUsedThisTurn(r,who,u.id,1);
}
function spellForbidden(r,who){const p=r.players[who];return (p.spellForbiddenUntil||0)>0&&p.spellForbiddenUntil>=p.turnsTaken;}
function clauses(card){return spells.has(card.id)?card.id==='COC-30-005'?[1,2]:[1]:monsters.has(card.id)?[1]:[];}
function originals(r,H){
 return r.players.flatMap((p,player)=>['hand','field'].flatMap(zone=>p[zone].filter(Boolean).map(id=>({id,player,zone,card:H.cards.get(r.units[id]?.cardId)||r.units[id]?.tokenCard}))))
  .filter(e=>e.card&&(e.card.type==='주문'||e.card.type.includes('몬스터')))
  .sort((a,b)=>a.player-b.player||a.zone.localeCompare(b.zone)||a.card.id.localeCompare(b.card.id)||a.id.localeCompare(b.id));
}
export function originalSinView(r,who,H){
 if(!ready(r,who))return null;
 const p=r.players[who],choices=[],unsupported=[];
 for(const original of originals(r,H)){
  // Only the authorized copier sees these hand identities, never the opponent
  // or a spectator. No deck, hand order, private unit state or future draw is exposed.
  const {id,player,zone,card}=original,numbers=clauses(card);
  for(const effectNumber of numbers){
   const key=ledgerKey(id,card.id,effectNumber);
   if(p.originalSinCopies?.[key]?.lastUsedTurn===r.turnNumber||cardUseForbidden(r,who,card)||card.type==='주문'&&spellForbidden(r,who))continue;
   choices.push({originalUnitId:id,cardId:card.id,name:card.name,player,zone,effectNumber,text:card.effects[effectNumber-1]});
  }
  if(!numbers.length||card.effects.length>numbers.length&&card.id!=='COC-21-002')unsupported.push({cardId:card.id,name:card.name,player,zone});
 }
 return {sourceUnitId:p.integration,choices,unsupported};
}
function prepareMonster(r,who,cid,body,H){
 const p=r.players[who],selected={};
 if(cid==='COC-08-003'||cid==='COC-12-013'){
  if(!p.hand.includes(body.costCardId))H.fail(409,'복사한 효과의 본문 비용으로 자신의 패 1장을 선택하세요.');
  selected.costCardId=body.costCardId;
 }
 if(cid==='COC-08-003')return selected;
 if(cid==='COC-21-012')return {...selected,target:nobleTarget(r,who,body.target,H)};
 const target=body.target,z=target?.type==='unit'&&H.zone(r,target.id),own=['COC-24-003','COC-26-003'].includes(cid);
 if(z?.zone!=='field'||z.player!==(own?who:1-who)||!Number.isFinite(r.units[target.id].hp))H.fail(409,'복사한 효과에 맞는 필드 몬스터를 선택하세요.');
 if(['COC-13-002','COC-13-005'].includes(cid)&&!p.field.includes(null))H.fail(409,'탈취할 빈 필드가 필요합니다.');
 return {...selected,target:{type:'unit',id:target.id}};
}
export function prepareOriginalSin(r,who,body,H){
 if(!ready(r,who)||body.sourceUnitId!==r.players[who].integration)H.fail(409,'현재 원죄의 복사 효과를 발동할 수 없습니다.');
 const original=originals(r,H).find(e=>e.id===body.originalUnitId),number=body.effectNumber??1;
 if(!original||!clauses(original.card).includes(number))H.fail(409,'패·필드의 현재 지원하는 원본 효과를 선택하세요.');
 const card=original.card,p=r.players[who],key=ledgerKey(original.id,card.id,number);
 if(p.originalSinCopies?.[key]?.lastUsedTurn===r.turnNumber)H.fail(409,'이 원본 효과의 플레이어별 이번 턴 횟수를 사용했습니다.');
 if(cardUseForbidden(r,who,card)||card.type==='주문'&&spellForbidden(r,who))H.fail(409,'원죄도 원본 효과의 사용 금지를 무시할 수 없습니다.');
 let selected,costs=[];
 if(spells.has(card.id)){
  selected=prepareCopiedSpellBody(r,who,card.id,body,H);
  // These two requirements are in the EFFECT body. All other supported
  // original conditions (including sacrifices/HP/draw costs) are ignored.
  if(['COC-31-007','COC-31-009'].includes(card.id))costs=planReusedSpellActivation({room:r,who,sourceId:body.sourceUnitId,cardId:card.id,cards:H.cards,body:selected}).costs;
 }else{
  selected=prepareMonster(r,who,card.id,body,H);
  if(card.id==='COC-12-013')costs=[{unitId:selected.costCardId,to:'grave'}];
 }
 const target=selected.target?.type==='unit'?r.units[selected.target.id]:null,tz=target&&H.zone(r,target.id);
 return {sourceId:body.sourceUnitId,sourceRevision:r.units[body.sourceUnitId].integrationRevision||0,
  originalId:original.id,cardId:card.id,effectNumber:number,key,
  snapshot:{card:structuredClone(card),unit:structuredClone(r.units[original.id]),controller:original.player,zone:original.zone,turn:r.turnNumber,
   past:{usedCardsGame:structuredClone(r.players[original.player].usedCardsGame||{}),destructionHistory:structuredClone(r.destructionHistory||[])}},
  body:{...selected,unitId:body.sourceUnitId},costs,
  target:target?{id:target.id,zone:tz.zone,controller:tz.player,revision:tz.zone==='field'?(target.fieldRevision||0):(target.integrationRevision||0)}:null};
}
export function queueOriginalSin(r,who,body,H){
 const plan=prepareOriginalSin(r,who,body,H),before=structuredClone(r);
 try{
  const p=r.players[who];p.originalSinCopies??={};
  p.originalSinCopies[plan.key]??={snapshot:structuredClone(plan.snapshot),uses:0};
  const copy=p.originalSinCopies[plan.key];copy.lastUsedTurn=r.turnNumber;copy.uses++;
  markEffectUsed(r,who,plan.sourceId,1);
  commitActivationCosts(r,{costs:plan.costs},{draw:H.draw,move:H.move,destroy:H.destroy});
  if(plan.cardId==='COC-08-003')H.move(r,plan.body.costCardId,'deck',r.units[plan.body.costCardId].owner);
  H.outcome(r);if(r.status!=='active')return;
  const effect=declareEffect(r,{effectId:'original-sin-resolution',owner:who,sourceId:plan.sourceId,sourceZone:'integration',payload:plan});
  r.pendingAbility={who,sourceId:plan.sourceId,cardId:ID,sequence:effect.sequence,stage:'response',kind:'original-sin',effectNumber:1,copyCardId:plan.cardId};
  H.log(r,'effect',`원죄: ${plan.snapshot.card.name} 효과 ${plan.effectNumber} 복사 선언 (조건 면제·본문 비용 지불)`);
 }catch(error){for(const k of Object.keys(r))delete r[k];Object.assign(r,before);throw error;}
}
export function resolveOriginalSin(r,e,H){
 const p=e.payload,u=r.units[p.sourceId],z=H.zone(r,p.sourceId),who=e.owner;
 if(!u||u.cardId!==ID||u.effectsNegated||z?.zone!=='integration'||z.player!==who||(u.integrationRevision||0)!==p.sourceRevision){H.log(r,'effect','원죄 일체화 이탈/진화/무효로 복사 불발');return;}
 if(p.target){const t=r.units[p.target.id],tz=t&&H.zone(r,t.id);if(tz?.zone!==p.target.zone||tz.player!==p.target.controller||(tz.zone==='field'?(t.fieldRevision||0):(t.integrationRevision||0))!==p.target.revision){H.log(r,'effect','복사 대상 이탈/조종권 변경으로 불발');return;}}
 // The original physical source need not remain in its zone: its selected
 // clause was snapshotted at declaration. The copier and target still must.
 const cid=p.cardId,player=r.players[who],target=p.body.target;
 if(cid==='COC-30-005'){
  if(p.effectNumber===1)player.spellDiceBonus=(player.spellDiceBonus||0)+50;
  else{player.bonusDrawsByOwnTurn??={};const next=(player.turnsTaken||0)+1;player.bonusDrawsByOwnTurn[next]=(player.bonusDrawsByOwnTurn[next]||0)+1;}
 }else if(cid==='COC-07-011'){
  // Even its resolution-time draw/mill is printed in CONDITIONS, hence waived.
  gainPlayerStats(r,who,{hp:B.selfDevourHeal});const gained=gainUnitStats(r,u.id,{atk:B.selfDevourAttack}).atk;
  const token=u.selfDevourBuffToken||`${u.id}:${r.selfDevourSequence=(r.selfDevourSequence||0)+1}`;u.selfDevourBuffToken=token;
  r.effects??=[];const existing=r.effects.find(e=>e.type==='selfDevourBuff'&&e.token===token);
  if(existing)existing.amount+=gained;else r.effects.push({type:'selfDevourBuff',unitId:u.id,player:who,turn:r.turnNumber,token,amount:gained});
 }else if(spells.has(cid)){
  try{prepareCopiedSpellBody(r,who,cid,p.body,H);}catch(error){if(error.status!==409)throw error;H.log(r,'effect','복사 효과의 대상 상태 변경으로 불발');return;}
  if(!responseTargetStillValid(r,who,cid,p.body,H)){H.log(r,'effect','복사 효과 대상 조건 변경으로 불발');return;}
  const result=castAutomatedSpell(r,who,p.snapshot.card,p.body,H,{activationValidated:true});
  if(result.retain||result.evolution)throw new Error('unsupported physical Original Sin continuation');
  if(result.deckSearch&&r.status==='active')beginDeckSearch(r,who,cid,H.cards,H);
 }else if(monsters.has(cid)){
  if(['COC-13-002','COC-13-005'].includes(cid)&&!player.field.includes(null))return;
  if(cid==='COC-08-003')H.draw(r,who);
  else if(cid==='COC-05-004')moveSharedUnits(r,[target.id],'deck',H,{sourceId:p.sourceId});
  else if(cid==='COC-12-013')destroySharedUnits(r,[target.id],H,{sourceId:p.sourceId,sourcePlayer:who,sourceCardId:cid});
  else if(cid==='COC-21-012')grantNoble(r,who,target,H);
  else if(['COC-24-003','COC-26-003'].includes(cid)){applySharedUnitEffect(r,[target.id],H,(id,t)=>{if(!Number.isFinite(t.hp))return;t.atk=Math.max(0,Math.floor(t.hp));if(!t.atk)H.destroy(r,id,{sourceId:p.sourceId});});}
  else{
   if(cid==='COC-13-002'){const face=H.roll(2);H.log(r,'dice',`원죄·사랑 도둑: 1d2 = ${face}`);if(face!==1)return;}
   const attack=swordActualAttack(r,target.id,{getZone:H.zone});captureSharedUnits(r,[target.id],who,H);
   if(cid==='COC-13-005')damagePlayer(r,1-who,Math.floor(attack/B.thiefDamageDivisor));
  }
 }else throw new Error('unsupported persisted Original Sin clause');
 H.outcome(r);H.log(r,'effect','원죄: 선택한 효과 1개 해결, 원본 카드는 소모하지 않음');
}
export function chooseAIOriginalSin(r,who,H){
 const view=originalSinView(r,who,H);if(!view)return null;
 const candidates=[];
 for(const choice of view.choices){
  const cid=choice.cardId,healing=['COC-03-008','COC-30-007','COC-21-012'].includes(cid);
  const all=[...r.players.flatMap(p=>p.field.filter(Boolean).map(id=>({type:'unit',id}))),{type:'player',player:healing?who:1-who},{type:'player',player:healing?1-who:who}];
  for(const option of cid==='COC-23-009'?[1,2]:[undefined]){
   let targets=spells.has(cid)?responseTargetChoices(r,who,cid,H,{option})||all:all;
   if(['COC-08-005','COC-30-003'].includes(cid))targets=[{type:'player',player:1-who}];
   if(cid==='COC-30-005')targets=[undefined];
   const payments=['COC-31-009','COC-08-003','COC-12-013'].includes(cid)?r.players[who].hand.map(costCardId=>({costCardId})):[{}];
   let found=false;
   for(const payment of payments){for(const target of targets){
    if(healing&&target&&(target.type==='player'?target.player:H.zone(r,target.id)?.player)!==who)continue;
    const body={sourceUnitId:view.sourceUnitId,originalUnitId:choice.originalUnitId,effectNumber:choice.effectNumber,target,option,...payment};
    try{prepareOriginalSin(r,who,body,H);candidates.push({body,score:cid==='COC-21-012'?100:cid==='COC-30-007'?Math.min(240,Math.max(0,1000-r.players[who].hp)):['COC-32-008','COC-31-008'].includes(cid)?r.players[1-who].field.filter(Boolean).length*150:target?.type==='unit'&&H.zone(r,target.id)?.player!==who?100+(r.units[target.id].atk||0):60});found=true;break;}catch(error){if(error.status!==409)throw error;}
   }if(found)break;}
  }
 }
 if(!candidates.length)return null;
 return (r.aiDifficulty==='easy'?candidates[H.randomInt(candidates.length)]:candidates.sort((a,b)=>b.score-a.score)[0]).body;
}
