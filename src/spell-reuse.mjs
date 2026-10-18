import {recordCopyHistory} from './copy-history.mjs';
import {declareEffect} from './effect-runtime.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {castAutomatedSpell,validateLifeEatingSwordTarget} from './automated-effects.mjs';
import {prepareResponseTargets,responseTargetChoices,responseTargetStillValid} from './spell-response-targets.mjs';
import {planReusedSpellActivation,commitActivationCosts} from './activation-rules.mjs';
import {beginDeckSearch,eligibleSearchIds,deckSearchSpellIds} from './deck-search.mjs';

export const REUSE_RULES=Object.freeze({
 'COC-30-008':{zone:'integration',effectNumber:1,baseDiceMax:100},
 'COC-30-010':{zone:'integration',effectNumber:2,baseDiceMax:100},
 'COC-26-006':{zone:'hand',effectNumber:1,onceGame:true,bothPlayers:true}
});
// Only audited normal spell clauses with explicit condition/cost plans.
// Physical retention, evolution, fusion, further copies and monsterized clauses are not
// silently approximated. Adding a normal handler does not add copy support.
export const REUSABLE_SPELL_IDS=Object.freeze([
 'COC-01-004','COC-01-005','COC-03-007','COC-03-008',
 'COC-08-005','COC-08-007','COC-10-009','COC-13-007',
 'COC-17-003','COC-19-005','COC-20-005','COC-21-002',
 'COC-27-006','COC-30-001','COC-30-002','COC-30-003',
 'COC-30-005','COC-30-006','COC-30-007',
 'COC-31-005','COC-31-006','COC-31-008',
 'COC-01-009','COC-06-007','COC-07-003','COC-07-004','COC-07-010','COC-07-011',
 'COC-08-006','COC-08-009','COC-11-011','COC-14-003','COC-14-006',
 'COC-17-005','COC-17-006','COC-19-004','COC-20-003','COC-20-004','COC-20-011',
 'COC-21-004','COC-21-005','COC-23-009','COC-24-008','COC-26-008','COC-27-010',
 'COC-30-011','COC-31-007','COC-31-009','COC-31-010',
 'COC-32-005','COC-32-006','COC-32-007','COC-32-008'
]);
const reusable=new Set(REUSABLE_SPELL_IDS);
function idle(r){return r.status==='active'&&r.phase==='MAIN'&&!['pendingAttack','pendingManual','pendingSpell','pendingAbility','pendingExtraSummon','pendingTriggerOrder','pendingMonsterTriggers','pendingTriggerTargetChoice','pendingDeckSearch','pendingInfinityChoice','pendingRecruitChoice','pendingElementalChoice','pendingSummonBatch'].some(key=>r[key])&&!r.effectStack?.length;}
function sourceReady(r,who,id,H){
 const u=r.units[id],rule=u&&REUSE_RULES[u.cardId],z=u&&H.zone(r,id);
 return rule&&z?.player===who&&z.zone===rule.zone&&!u.effectsNegated&&
  !(rule.onceGame?u.spellReuseGameUsed:effectUsedThisTurn(r,who,id,rule.effectNumber))&&
  !((r.players[who].spellForbiddenUntil||0)>0&&r.players[who].spellForbiddenUntil>=r.players[who].turnsTaken);
}
function history(r,who,rule){
 const entries=[];
 for(const player of rule.bothPlayers?[who,1-who]:[who])for(const [unitId,entry] of Object.entries(r.players[player].usedCardsGame||{}))entries.push({player,unitId,cardId:entry.cardId});
 return entries;
}
export function spellReuseView(r,who,H){
 if(r.turn!==who||!idle(r))return [];
 const p=r.players[who];
 return [p.integration,...p.hand].filter(id=>id&&sourceReady(r,who,id,H)).map(id=>{
  const rule=REUSE_RULES[r.units[id].cardId],ids=[...new Set(history(r,who,rule).map(e=>e.cardId))].filter(cid=>H.cards.get(cid)?.type==='주문').sort();
  return {sourceUnitId:id,cardId:r.units[id].cardId,effectNumber:rule.effectNumber,
   choices:ids.filter(cid=>reusable.has(cid)).map(cardId=>({cardId,name:H.cards.get(cardId).name})),
   unsupported:ids.filter(cid=>!reusable.has(cid)).map(cardId=>({cardId,name:H.cards.get(cardId).name}))};
 });
}
export function prepareCopiedSpellBody(r,who,cardId,body,H){
 const selected={};
 // Ignore unrelated client fields; only this original clause defines choices.
 if(['COC-01-004','COC-01-005','COC-03-007','COC-03-008','COC-08-005','COC-19-005','COC-21-002','COC-27-006','COC-30-002','COC-30-003','COC-30-006','COC-31-006',
  'COC-06-007','COC-08-006','COC-14-003','COC-17-005','COC-20-004','COC-20-011','COC-21-004','COC-21-005','COC-23-009','COC-27-010','COC-30-011','COC-31-007'].includes(cardId))selected.target=body.target;
 if(cardId==='COC-23-009')selected.option=body.option;
 if(cardId==='COC-31-009')selected.costCardId=body.costCardId;
 if(cardId==='COC-21-004')selected.costUnitIds=body.costUnitIds;
 // The two legacy handlers used implicit targets; copies always freeze one.
 if(['COC-08-005','COC-30-003'].includes(cardId))return prepareResponseTargets(r,who,'COC-30-002',selected,H);
 if(['COC-03-007','COC-03-008'].includes(cardId))return prepareResponseTargets(r,who,'COC-06-007',selected,H);
 if(cardId==='COC-21-002')validateLifeEatingSwordTarget(r,selected,H,who);
 return prepareResponseTargets(r,who,cardId,selected,H);
}
export function prepareSpellReuse(r,who,body,H){
 const id=body.sourceUnitId;
 if(r.turn!==who||!idle(r)||!sourceReady(r,who,id,H))H.fail(409,'현재 발동할 수 있는 주문 재사용 카드가 아닙니다.');
 const u=r.units[id],rule=REUSE_RULES[u.cardId],original=history(r,who,rule).find(e=>e.cardId===body.copyCardId);
 if(!original||!reusable.has(original.cardId))H.fail(409,'사용 이력에 있고 현재 재사용을 지원하는 주문을 선택하세요.');
 const prepared=prepareCopiedSpellBody(r,who,original.cardId,body,H);
 const activation=planReusedSpellActivation({room:r,who,sourceId:id,cardId:original.cardId,cards:H.cards,body:prepared});
 const targets=prepared.target?.type==='unit'?[prepared.target.id]:[];
 return {originCardId:u.cardId,sourceId:id,sourceZone:rule.zone,sourceRevision:u.integrationRevision||0,
  original:{...original},effectNumber:rule.effectNumber,baseDiceMax:rule.baseDiceMax??null,activation,
  body:{...prepared,unitId:id},targets:targets.map(uid=>{const z=H.zone(r,uid),target=r.units[uid];return {id:uid,zone:z.zone,controller:z.player,revision:z.zone==='integration'?(target.integrationRevision||0):(target.fieldRevision||0)};})};
}
export function queueSpellReuse(r,who,body,H){
 const plan=prepareSpellReuse(r,who,body,H),rule=REUSE_RULES[plan.originCardId],u=r.units[plan.sourceId];
 const before=structuredClone(r);
 try{
 if(rule.onceGame){
  u.spellReuseGameUsed=true;H.move(r,plan.sourceId,'grave',u.owner);H.recordUse(r,who,plan.sourceId);
  recordCopyHistory(r,'play',{who});r.players[who].roundPlays=(r.players[who].roundPlays||0)+1;
  r.players[who].spellsThisTurn=(r.players[who].spellsThisTurn||0)+1;
 }else markEffectUsed(r,who,plan.sourceId,rule.effectNumber);
 commitActivationCosts(r,plan.activation,{
  draw:H.draw,
  move:(room,uid,to,owner)=>H.move(room,uid,to,owner,{tokenAction:to==='grave'?'릴리스':to==='banished'?'사용':undefined}),
  destroy:(room,uid)=>H.destroy(room,uid,{cause:'cost'})
 });
 H.outcome(r);
 if(r.status!=='active')return;
 const e=declareEffect(r,{effectId:'spell-reuse-resolution',owner:who,sourceId:plan.sourceId,sourceZone:plan.sourceZone,
  ...(rule.onceGame?{exception:'self-cost'}:{}),payload:plan});
 r.pendingAbility={who,sourceId:plan.sourceId,cardId:plan.originCardId,sequence:e.sequence,stage:'response',kind:'reuse',effectNumber:rule.effectNumber,copyCardId:plan.original.cardId};
 H.log(r,'effect',`${H.name(r,plan.sourceId)}: ${H.cards.get(plan.original.cardId).name} 효과 재사용 선언`);
 }catch(error){for(const key of Object.keys(r))delete r[key];Object.assign(r,before);throw error;}
}
export function resolveSpellReuse(r,e,H){
 const p=e.payload,u=r.units[p.sourceId],rule=REUSE_RULES[p.originCardId],z=H.zone(r,p.sourceId);
 if(!rule||!reusable.has(p.original?.cardId))throw new Error('unsupported persisted spell copy');
 if(!rule.onceGame&&(!u||u.cardId!==p.originCardId||u.effectsNegated||z?.zone!=='integration'||z.player!==e.owner||(u.integrationRevision||0)!==p.sourceRevision)){
  H.log(r,'effect','주문 재사용 소스 이탈/진화/무효로 불발');return;
 }
 const valid=p.targets.every(t=>{const target=r.units[t.id],tz=target&&H.zone(r,t.id);return tz?.zone===t.zone&&tz.player===t.controller&&(t.zone==='integration'?(target.integrationRevision||0):(target.fieldRevision||0))===t.revision;});
 if(!valid||!responseTargetStillValid(r,e.owner,p.original.cardId,p.body,H)){H.log(r,'effect','주문 재사용 대상 이탈/재진입으로 불발');return;}
 try{prepareCopiedSpellBody(r,e.owner,p.original.cardId,p.body,H);}catch(error){if(error.status!==409)throw error;H.log(r,'effect','주문 재사용 대상 조건 변경으로 불발');return;}
 const result=castAutomatedSpell(r,e.owner,H.cards.get(p.original.cardId),p.body,H,{activationValidated:true,baseDiceMax:p.baseDiceMax});
 if(result.retain||result.evolution)throw new Error('copy handler requires unsupported physical continuation');
 if(result.deckSearch&&r.status==='active')beginDeckSearch(r,e.owner,p.original.cardId,H.cards,H);
 H.log(r,'effect',`${H.cards.get(p.original.cardId).name}: 원본 소모 없이 효과 재사용 해결`);
}
export function chooseAISpellReuse(r,who,H){
 const candidates=[];
 for(const source of spellReuseView(r,who,H))for(const choice of source.choices){
  const cardId=choice.cardId;
  const healing=['COC-03-008','COC-08-007','COC-17-003','COC-30-007'].includes(cardId);
  if(healing&&r.players[who].hp>=1000)continue;
  if(cardId==='COC-03-007'&&!r.players[1-who].grave.length||cardId==='COC-03-008'&&!r.players[who].grave.length)continue;
  if(deckSearchSpellIds.includes(cardId)&&!eligibleSearchIds(r,who,cardId,H.cards).length)continue;
  if(cardId==='COC-31-009'&&!r.players[1-who].field.some(id=>id&&!r.units[id].effectsNegated))continue;
  const options=cardId==='COC-23-009'?[1,2]:[null];
  for(const option of options){
  let targets=responseTargetChoices(r,who,cardId,H,{option})||[{type:'player',player:1-who}];
  if(['COC-08-005','COC-30-003'].includes(cardId))targets=[{type:'player',player:1-who}];
  if(cardId==='COC-21-002')targets=[{type:'player',player:who},...r.players[who].field.filter(Boolean).map(id=>({type:'unit',id}))];
  if(healing)targets=[{type:'player',player:who}];
  targets.sort((a,b)=>Number((b.type==='player'?b.player:H.zone(r,b.id)?.player)===(healing?who:1-who))-Number((a.type==='player'?a.player:H.zone(r,a.id)?.player)===(healing?who:1-who)));
  const payments=cardId==='COC-31-009'?r.players[who].hand.filter(id=>id!==source.sourceUnitId).map(costCardId=>({costCardId})):
   cardId==='COC-21-004'?r.players[who].field.filter(Boolean).map(id=>({costUnitIds:[id]})):[{}];
  let found=false;
  for(const payment of payments){
   for(const target of targets){const body={sourceUnitId:source.sourceUnitId,copyCardId:cardId,target,...(option?{option}:{}),...payment};try{
    const plan=prepareSpellReuse(r,who,body,H);
    if(plan.activation.costs.some(cost=>cost.player===who&&cost.hp>=r.players[who].hp))continue;
    candidates.push(body);found=true;break;
   }catch(error){if(error.status!==409)throw error;}}
   if(found)break;
  }
  }
 }
 if(!candidates.length)return null;
 if(r.aiDifficulty==='easy')return candidates[H.randomInt(candidates.length)];
 const score=body=>{
  if(body.copyCardId==='COC-30-007')return Math.min(240,Math.max(0,1000-r.players[who].hp));
  if(body.copyCardId==='COC-30-005')return 100;
  if(body.copyCardId==='COC-30-003')return 150;
  if(body.copyCardId==='COC-27-006')return r.aiDifficulty==='hard'&&r.players[1-who].hp<=100?1000:100;
  if(body.target?.type==='unit'&&H.zone(r,body.target.id)?.player!==who)return Math.max(0,r.units[body.target.id].atk||0)+50;
  return 60;
 };
 return candidates.sort((a,b)=>score(b)-score(a))[0];
}
