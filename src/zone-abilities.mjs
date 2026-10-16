import {declareEffect} from './effect-runtime.mjs';
import {requireUnusedEffect,markEffectUsed} from './effect-usage.mjs';
import {actionLocked} from './demon-effects.mjs';
import {cardUseForbidden} from './card-game-history.mjs';
import {queueCardRevival} from './death-revival.mjs';
import {swordActualAttack} from './life-eating-sword.mjs';

export const WYVERN_ID='COC-11-004';
const areas=['hand','deck','field'];
export function planZoneAbility(r,who,{sourceUnitId,to},H){
 if(r.status!=='active'||r.turn!==who||r.phase!=='MAIN'||r.effectStack?.length||
  ['pendingAttack','pendingAttackSequence','pendingManual','pendingAbility','pendingSpell','pendingExtraSummon','pendingMonsterTriggers','pendingTriggerOrder','pendingDeckSearch','pendingTriggerTargetChoice','pendingSummonBatch','pendingElementalChoice','pendingRecruitChoice','pendingInfinityChoice'].some(k=>r[k]))
  H.fail(409,'자신의 메인 페이즈에 진행 중인 효과가 없을 때만 영역 이동 효과를 사용할 수 있습니다.');
 const u=r.units[sourceUnitId],z=u&&H.zone(r,sourceUnitId);
 if(u?.cardId!==WYVERN_ID||z?.player!==who||!areas.includes(z.zone)||!areas.includes(to)||to===z.zone)
  H.fail(409,'자신의 패·덱·필드에 있는 와이번과 다른 목적 영역을 선택하세요.');
 if(u.effectsNegated||actionLocked(r,sourceUnitId)||cardUseForbidden(r,who,H.cards.get(u.cardId)))H.fail(409,'지금은 이 카드의 효과를 사용할 수 없습니다.');
 if(to==='field'&&!r.players[who].field.includes(null))H.fail(409,'소환할 빈 필드가 없습니다.');
 requireUnusedEffect(r,who,sourceUnitId,1);
 return {cardId:WYVERN_ID,sourceId:sourceUnitId,sourceZone:z.zone,sourceRevision:z.zone==='field'?(u.fieldRevision||0):(u.zoneRevision||0),to};
}
export function queueZoneAbility(r,who,body,H){
 const plan=planZoneAbility(r,who,body,H);
 const e=declareEffect(r,{effectId:'zone-ability-resolution',owner:who,sourceId:plan.sourceId,sourceZone:plan.sourceZone,
  ...(plan.sourceZone==='field'?{}:{exception:'independent'}),payload:plan});
 markEffectUsed(r,who,plan.sourceId,1);
 r.pendingAbility={who,sourceId:plan.sourceId,cardId:plan.cardId,sequence:e.sequence,stage:'response',kind:'zone',effectNumber:1};
 H.log(r,'effect',`${H.name(r,plan.sourceId)} 공개: ${plan.sourceZone} → ${plan.to} 이동 효과 선언, 상대 대응 대기`);
}
export function resolveZoneAbility(r,e,H){
 const p=e.payload,u=r.units[e.sourceId],z=u&&H.zone(r,e.sourceId);
 if(!u||u.cardId!==p.cardId||u.effectsNegated||z?.zone!==p.sourceZone||z.player!==e.owner||
  (z.zone==='field'?(u.fieldRevision||0):(u.zoneRevision||0))!==p.sourceRevision){
  H.log(r,'effect','와이번: 선언한 원본의 이탈·재진입·조종권·무효 상태 변경으로 불발');return;
 }
 if(p.to==='field'){
  queueCardRevival(r,e.owner,u.id,H,{kind:'wyvern',originZone:p.sourceZone});
  H.log(r,'effect','와이번: 원래 영역에서 효과 소환 예약, 소환에 별도로 대응');
 }else H.move(r,u.id,p.to,u.owner);
}
export function legalZoneAbilities(r,who,H){
 const p=r.players[who];if(!p)return [];
 const choices=[];
 // Only the owner receives this list. No deck positions or unrelated cards.
 for(const id of [...p.field,...p.hand,...p.deck].filter(Boolean).sort()){
  if(r.units[id]?.cardId!==WYVERN_ID)continue;
  for(const to of areas)try{const plan=planZoneAbility(r,who,{sourceUnitId:id,to},H);choices.push({sourceUnitId:id,from:plan.sourceZone,to,atk:swordActualAttack(r,id,{getZone:H.zone}),hp:r.units[id].hp});}
  catch(error){if(error.status!==409)throw error;}
 }
 return choices;
}
export function chooseAIZoneAbility(r,who,H){
 const choices=legalZoneAbilities(r,who,H);
 // Deploy from our private deck first; do not endlessly bounce healthy units.
 const summon=choices.filter(c=>c.to==='field').sort((a,b)=>(a.from==='deck'?0:1)-(b.from==='deck'?0:1));
 if(summon.length)return summon[0];
 if(r.aiDifficulty==='easy')return null;
 return choices.find(c=>c.from==='field'&&c.to==='hand'&&r.units[c.sourceUnitId].hp>0&&r.units[c.sourceUnitId].hp<50)||null;
}
