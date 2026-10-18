import {recordCopyHistory} from './copy-history.mjs';
import {recordFafnirTreasure,fafnirResidence} from './dragon-growth.mjs';
import {effectUsedThisTurn,markEffectUsed} from './effect-usage.mjs';
import {declareEffect} from './effect-runtime.mjs';
import {gainPlayerStats} from './stat-gains.mjs';
import {
  registerPersistent, endPersistent
} from './effect-runtime.mjs';

// A single dragon subsystem owns the created cards and their persistent counter.
// Token conversion, the Fafnir summon, and the ring's higher resolution priority
// must agree even when a reaction/destroy event is triggered by another deck.
export const DRAGON_CARDS = Object.freeze({
  fafnir: 'COC-11-007',
  gold: 'COC-11-008',
  ring: 'COC-11-009'
});

export function dragonGoldEffects(room) {
  return (room.persistentEffects || []).filter(item => item.kind === 'dragon-gold' && !item.closing);
}

function addTreasure(room, gold, n, { log } = {}) {
  if (!Number.isInteger(n) || n < 1) return;
  gold.counters += n;
  recordFafnirTreasure(room,gold.anchorId,n);
  log?.(room, 'effect', `라인의 황금: 보물 ${n}개 추가 (총 ${gold.counters}개)`);
}

// Queues contain JSON snapshots only. No nested effect-stack resolution is
// allowed in a movement hook or in the middle of a token-producing effect.
export function createDragonTreasures(room,who,anchorId,H){
 const goldId=H.instantiate(room,DRAGON_CARDS.gold,who),ringId=H.instantiate(room,DRAGON_CARDS.ring,who);
 room.units[goldId].dragonGoldBinding={anchorId,anchorRevision:room.units[anchorId].fieldRevision||0,anchorResidence:fafnirResidence(room.units[anchorId]),ringId,owner:who};
 room.units[ringId].dragonRingBinding={anchorId,goldId,owner:who};
 H.move(room,goldId,'hand',who);H.move(room,ringId,'hand',who);
 H.log(room,'effect',`${room.players[who].label}: 연결된 황금·반지 생성, 황금 자동 사용 대기`);
}
export function queueGoldHandArrival(room,id,who){
 const unit=room.units[id];if(room.status!=='active'||unit?.cardId!==DRAGON_CARDS.gold)return;
 const old=(room.persistentEffects||[]).find(g=>g.kind==='dragon-gold'&&g.sourceId===id&&!g.closing);
 const binding=unit.dragonGoldBinding||(old?{anchorId:old.anchorId,anchorRevision:room.units[old.anchorId]?.fieldRevision||0,...(Number.isInteger(old.data?.anchorResidence)?{anchorResidence:old.data.anchorResidence}:{}),ringId:old.data?.ringId,owner:old.owner}:null);
 if(!binding||binding.ended||binding.lapsed)return;
 const revision=unit.zoneRevision||0;
 if((room.goldCastQueue||[]).some(j=>j.sourceId===id&&j.sourceRevision===revision))return;
 (room.goldCastQueue??=[]).push({sourceId:id,who,sourceRevision:revision,binding:{...binding}});
}
export function declareGoldCast(room,job,H){
 const u=room.units[job.sourceId],z=u&&H.zone(room,u.id),p=room.players[job.who];
 if(!u||u.cardId!==DRAGON_CARDS.gold||z?.zone!=='hand'||z.player!==job.who||(u.zoneRevision||0)!==job.sourceRevision||u.dragonGoldBinding?.ended||u.dragonGoldBinding?.lapsed)return false;
 if((p.turnsTaken>0&&(p.spellForbiddenUntil||0)>=p.turnsTaken)||effectUsedThisTurn(room,job.who,u.id,1)){
  H.log(room,'effect','라인의 황금: 주문 금지/실물별 이번 턴 사용 제한으로 자동 사용 불가');return false;
 }
 markEffectUsed(room,job.who,u.id,1);H.move(room,u.id,'grave',u.owner);H.recordUse?.(room,job.who,u.id);
 recordCopyHistory(room,'play',{who:job.who});p.roundPlays=(p.roundPlays||0)+1;p.spellsThisTurn=(p.spellsThisTurn||0)+1;
 const e=declareEffect(room,{effectId:'dragon-gold-cast-resolution',owner:job.who,sourceId:u.id,sourceZone:'grave',exception:'independent',
  payload:{cardId:DRAGON_CARDS.gold,sourceRevision:u.zoneRevision||0,binding:job.binding}});
 room.pendingAbility={who:job.who,sourceId:u.id,cardId:u.cardId,kind:'gold-cast',effectNumber:1,sequence:e.sequence,stage:'response'};
 H.log(room,'effect','라인의 황금: 패 진입 자동 주문 사용, 상대 대응 대기');return true;
}
export function resolveGoldCast(room,e,H){
 const u=room.units[e.sourceId],z=u&&H.zone(room,u.id),b=e.payload.binding;
 if(!u||u.cardId!==DRAGON_CARDS.gold||z?.zone!=='grave'||z.player!==u.owner||(u.zoneRevision||0)!==e.payload.sourceRevision||u.dragonGoldBinding?.ended||u.dragonGoldBinding?.lapsed){
  H.log(room,'effect','라인의 황금: 사용 원본 이탈/재진입으로 불발');return;
 }
 // Reusing the same physical Gold does not duplicate its independent grant
 // or reset already earned treasure. A different physical Gold is separate.
 if((room.persistentEffects||[]).some(g=>g.kind==='dragon-gold'&&g.sourceId===u.id))return;
 const anchor=room.units[b.anchorId],az=anchor&&H.zone(room,anchor.id);
 if(!anchor||anchor.cardId!==DRAGON_CARDS.fafnir||az?.zone!=='field'||(b.anchorResidence!==undefined?fafnirResidence(anchor)!==b.anchorResidence:(anchor.fieldRevision||0)!==b.anchorRevision)){
  H.log(room,'effect','라인의 황금: 생성 당시 파프니르의 필드 체류 소실로 지속 효과 불발');return;
 }
 registerPersistent(room,{kind:'dragon-gold',owner:b.owner,sourceId:u.id,anchorId:b.anchorId,expires:'anchor-destroyed',counters:0,data:{ringId:b.ringId,...(Number.isInteger(b.anchorResidence)?{anchorResidence:b.anchorResidence}:{})}});
 H.log(room,'effect','라인의 황금: 보물 지속 효과 적용');
}
// Unresolved generated Gold belongs to that uninterrupted field residence.
// An already applied independent Gold survives non-destructive departure.
export function onFafnirLeftField(room,anchorId){
 const active=new Set((room.persistentEffects||[]).filter(g=>g.kind==='dragon-gold').map(g=>g.sourceId));
 for(const u of Object.values(room.units))if(u.cardId===DRAGON_CARDS.gold&&u.dragonGoldBinding?.anchorId===anchorId&&!active.has(u.id))u.dragonGoldBinding.lapsed=true;
}
function endGoldBinding(room,id){
 const binding=room.units[id]?.dragonGoldBinding;
 if(binding){binding.ended=true;const ring=room.units[binding.ringId];if(ring?.dragonRingBinding)ring.dragonRingBinding.ended=true;}
}
export function onTokenCreation(room,tokenId,controller,H){
 if(room.units[tokenId]?.created)onTokenActivity(room,'생성',controller,H,tokenId);
}
export function onTokenActivity(room,eventType,controller,H,tokenId=null){
 if(room.status!=='active'||!['생성','소환','사용','릴리스'].includes(eventType)||![0,1].includes(controller))return;
 const candidates=[];
 for(const [who,p] of room.players.entries())for(const originZone of ['hand','deck'])for(const id of [...p[originZone]].sort()){
  const u=room.units[id];if(u?.cardId===DRAGON_CARDS.fafnir)candidates.push({who,extraUnitId:id,originZone,originRevision:u.zoneRevision||0});
 }
 const event={kind:'event',id:`token-event-${room.tokenWorkSequence=(room.tokenWorkSequence||0)+1}`,eventType,controller,tokenId,
  tokenRevision:tokenId?(room.units[tokenId]?.fieldRevision||0):null,candidates,stage:'order'};
 // A successful placement must finish its complete dragon chain before the
 // next queued placement can consume the last field slot (R07).
 const queue=room.tokenWorkQueue??=[];
 const firstGeneration=queue.findIndex(j=>j.kind==='token');
 if(firstGeneration<0)queue.push(event);else queue.splice(firstGeneration,0,event);
}
export function settleTokenEvent(room,event,H){
 const golds=dragonGoldEffects(room);
 // R06: controller's side first; multiple Golds on that side use the oldest
 // still active registration. Never give two credits for one actual event.
 const receiver=golds.find(g=>g.owner===event.controller)||golds[0];if(!receiver)return;
 addTreasure(room,receiver,1,H);
 if(!['생성','소환'].includes(event.eventType))return;
 const token=room.units[event.tokenId],where=token&&H.zone(room,token.id);
 if(token?.created&&where?.zone==='field'&&where.player===event.controller&&(token.fieldRevision||0)===event.tokenRevision){
  H.move(room,token.id,'banished',event.controller,{treasureConversion:true});
  H.log(room,'effect','성공한 토큰 생성/소환 사건: 황금 보물로 전환 (파괴 아님)');
 }
}

// These entries join the same ordering/response group as King and Orochi.
export function dragonAttackTriggers(room,who){
 return dragonGoldEffects(room).filter(g=>g.owner===who).map(g=>({
  key:`gold-attack-${g.id}-${room.turnNumber}`,effectId:'monster-trigger-resolution',owner:who,
  sourceId:g.sourceId,sourceZone:'grave',exception:'independent',priority:0,
  title:'라인의 황금 · 보물 5개',payload:{cardId:DRAGON_CARDS.gold,goldEffectId:g.id,eventTurn:room.turnNumber}
 }));
}
export function pendingDragonDeath(room){
 return (room.persistentEffects||[]).some(g=>g.kind==='dragon-gold'&&g.closing);
}
function expireGold(room,gold,H){
 endPersistent(room,item=>item.id===gold.id);
 endGoldBinding(room,gold.sourceId);
 if(H.zone(room,gold.sourceId))H.move(room,gold.sourceId,'banished',room.units[gold.sourceId].owner);
 H.log(room,'effect','라인의 황금: 반지 처리 종료 후 지속 효과 종료');
}
/** Save the death event; never drain the caller's spell/counter stack here. */
export function onFafnirDestroyed(room,fafnirId,controller,H){
 for(const gold of dragonGoldEffects(room).filter(g=>g.anchorId===fafnirId)){
  gold.closing=true;endGoldBinding(room,gold.sourceId);
  const ringId=gold.data?.ringId,ring=room.units[ringId],z=ring&&H.zone(room,ringId);
  const owner=room.players[gold.owner],spellForbidden=owner.turnsTaken>0&&(owner.spellForbiddenUntil||0)>=owner.turnsTaken;
  if(!ring||ring.cardId!==DRAGON_CARDS.ring||z?.zone!=='hand'||z.player!==gold.owner||spellForbidden||effectUsedThisTurn(room,gold.owner,ringId,1)){expireGold(room,gold,H);continue;}
  // Ordinary automatic spell use: reveal/move before responding. A negated
  // Ring remains in the grave; only successful resolution banishes the Ring.
  markEffectUsed(room,gold.owner,ringId,1);
  recordCopyHistory(room,'play',{who:gold.owner});owner.roundPlays=(owner.roundPlays||0)+1;owner.spellsThisTurn=(owner.spellsThisTurn||0)+1;
  H.move(room,ringId,'grave',ring.owner);
  H.recordUse?.(room,gold.owner,ringId);
  (room.deferredMonsterTriggers??=[]).push({
   key:`ring-death-${gold.id}`,effectId:'monster-trigger-resolution',owner:gold.owner,
   sourceId:ringId,sourceZone:'grave',exception:'destroy-trigger',priority:0,
   title:'니벨룽겐의 반지 · 파괴 보상',payload:{cardId:DRAGON_CARDS.ring,goldEffectId:gold.id,
    treasureCount:Math.max(0,Math.floor(gold.counters)),sourceRevision:ring.zoneRevision||0,eventTurn:room.turnNumber}
  });
  H.log(room,'effect',`니벨룽겐의 반지: 보물 ${gold.counters}개 기록, 현재 체인 후 자동 주문 대응`);
 }
 // A countered/unresolved initial Gold has no treasure grant and cannot pay
 // a Ring reward, but its physical link must still end on actual destruction.
 const registered=new Set((room.persistentEffects||[]).filter(g=>g.kind==='dragon-gold').map(g=>g.sourceId));
 for(const u of Object.values(room.units)){
  const b=u.dragonGoldBinding;
  if(u.cardId!==DRAGON_CARDS.gold||b?.anchorId!==fafnirId||b.ended||registered.has(u.id))continue;
  endGoldBinding(room,u.id);
  if(H.zone(room,u.id))H.move(room,u.id,'banished',u.owner);
  H.log(room,'effect','파프니르 파괴: 미적용 황금의 연결 종료, 반지 보상 없음');
 }
}
export function resolveDragonTrigger(room,e,H){
 const p=e.payload;
 if(p.cardId!==DRAGON_CARDS.gold&&p.cardId!==DRAGON_CARDS.ring)return false;
 const gold=(room.persistentEffects||[]).find(g=>g.kind==='dragon-gold'&&g.id===p.goldEffectId);
 if(p.cardId===DRAGON_CARDS.gold){
  if(gold&&!gold.closing&&gold.owner===e.owner&&room.turn===e.owner&&room.phase==='ATTACK'&&room.turnNumber===p.eventTurn)addTreasure(room,gold,5,H);
  return true;
 }
 const ring=room.units[e.sourceId],z=ring&&H.zone(room,e.sourceId);
 if(!gold?.closing||!ring||ring.cardId!==DRAGON_CARDS.ring||z?.zone!=='grave'||z.player!==ring.owner||(ring.zoneRevision||0)!==p.sourceRevision){
  H.log(room,'effect','니벨룽겐의 반지: 사용한 원본의 묘지 이탈/재진입으로 강화 불발');return true;
 }
 const base=p.treasureCount*10,gained=gainPlayerStats(room,e.owner,{atk:base,hp:base});
 H.move(room,ring.id,'banished',ring.owner);
 H.log(room,'effect',`니벨룽겐의 반지: 보물 ${p.treasureCount}개 × 10 = ${base} 기본 강화 (적용 ATK+${gained.atk}/HP+${gained.hp})`);
 return true;
}
export function settleDragonTrigger(room,e,H){
 if(e.payload?.cardId!==DRAGON_CARDS.ring)return;
 const gold=(room.persistentEffects||[]).find(g=>g.id===e.payload.goldEffectId&&g.kind==='dragon-gold');
 // Cleanup also runs when the Ring is countered or its physical source moved.
 if(gold?.closing)expireGold(room,gold,H);
}
