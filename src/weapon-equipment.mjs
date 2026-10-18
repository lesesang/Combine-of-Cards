// Physical equipment from the smith deck. Sword21-002 is NOT equipment.
import {damageProtected} from './protection-auras.mjs';
import {scaledStatGain} from './stat-gains.mjs';
import {borrowedTraits} from './borrowed-state.mjs';
export const WEAPON_MONSTERS=Object.freeze(['COC-09-002','COC-09-003','COC-09-004']);
export const WEAPON_SPELLS=Object.freeze(['COC-09-005','COC-09-006']);
export function activeWeapons(r,host){
 if(!host||host.effectsNegated)return [];
 return (host.attachments||[]).map(id=>r.units[id]).filter(u=>u&&u.attachmentHostId===host.id&&u.weaponGrant&&!u.effectsNegated);
}
export function weaponAttackBonus(r,host){return activeWeapons(r,host).reduce((n,u)=>n+scaledStatGain(r,{id:host.id},u.weaponGrant.attack),0);}
export function hasWeaponAbility(r,host,cardId){return activeWeapons(r,host).some(u=>u.cardId===cardId);}
// HP payment, HP setting, absorption and reload are separate from incoming
// attack/effect damage. Callers settle outcome after simultaneous damage.
export function damagePlayer(r,who,amount,{battle=false}={}){
 if(!Number.isFinite(amount))throw new Error('invalid player damage');
 amount=Math.max(0,Math.floor(amount));
 if(damageProtected(r,{type:'player',player:who}))return 0;
 const p=r.players[who],host=p.integration&&r.units[p.integration];
 let dealt=amount>0&&(hasWeaponAbility(r,host,'COC-09-002')||borrowedTraits(r,who,'damage-one').length)?1:amount;
 if(battle&&borrowedTraits(r,who,'battle-survival').length)dealt=Math.min(dealt,Math.max(0,p.hp-1));
 p.hp-=dealt;return dealt;
}
export function weaponCandidates(r,who,cardId,cards){
 const zone=cardId==='COC-09-006'?'grave':'deck';
 return r.players[who][zone].filter(id=>{
  const u=r.units[id],c=u&&cards.get(u.cardId);
  return u&&!u.created&&u.owner===who&&c?.type==='몬스터'&&c.attribute==='무기'&&WEAPON_MONSTERS.includes(c.id);
 }).sort((a,b)=>r.units[a].cardId.localeCompare(r.units[b].cardId)||a.localeCompare(b));
}
export function weaponHostValid(r,who,hostId,revision){
 const u=r.units[hostId];return !!u&&r.players[who].integration===hostId&&(u.integrationRevision||0)===revision;
}
export function equipWeapon(r,who,id,hostId,attack,H){
 const u=r.units[id],host=r.units[hostId],z=u&&H.zone(r,id);
 if(!u||!host||r.players[who].integration!==hostId||!WEAPON_MONSTERS.includes(u.cardId)||
  u.owner!==who||z?.player!==who||!['deck','grave','field'].includes(z.zone))return false;
 // Preserve the death snapshot; deck/grave grants use the printed attack.
 const value=Math.max(0,Math.floor(attack??Number(H.cards.get(u.cardId).atk)));
 H.attachCard(r,id,hostId,{cause:'card-effect'});
 u.weaponGrant={attack:value,hostRevision:host.integrationRevision||0,attachedTurn:r.turnNumber,expiresAfterTurn:r.turnNumber+3};
 H.refreshStats(r);
 H.log(r,'equipment',`${H.name(r,id)} 장착: 공격력 +${value}, 이후 세 번째 턴 종료에 파괴`);return true;
}
export function expireWeapons(r,H){
 for(const u of Object.values(r.units)){
  if(!u.weaponGrant||!u.attachmentHostId||r.turnNumber<u.weaponGrant.expiresAfterTurn)continue;
  H.detachCard(r,u.id,'grave',{cause:'card-effect'});
  H.log(r,'equipment','장착 기간 만료: 무기를 파괴하여 원래 소유자의 묘지로 보냄');
 }
 H.refreshStats(r);
}
export function beginWeaponSelection(r,who,cardId,H){
 const hostId=r.players[who].integration;
 if(!hostId){H.log(r,'equipment','장착할 일체화가 없어 불발');return;}
 const choices=weaponCandidates(r,who,cardId,H.cards);
 if(!choices.length){H.log(r,'equipment','선택 가능한 무기 몬스터가 없어 종료');return;}
 r.pendingDeckSearch={who,cardId,choices,weapon:true,hostId,hostRevision:r.units[hostId].integrationRevision||0};
}
export function chooseWeapons(r,who,ids,H){
 const p=r.pendingDeckSearch;
 if(r.status!=='active'||!p?.weapon||p.who!==who)H.fail(409,'장착할 무기를 선택할 권한이 없습니다.');
 if(!weaponHostValid(r,who,p.hostId,p.hostRevision)){r.pendingDeckSearch=null;H.log(r,'equipment','일체화 이탈/재진입으로 장착 불발');return;}
 const legal=weaponCandidates(r,who,p.cardId,H.cards).filter(id=>p.choices.includes(id));
 if(!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length||ids.some(id=>!legal.includes(id)))H.fail(409,'서로 다른 무기를 최대 2장 선택하세요.');
 if(ids.length&&p.cardId==='COC-09-006'&&!r.players[who].field.includes(null))H.fail(409,'부활 후 장착할 빈 필드가 한 칸 필요합니다.');
 r.pendingDeckSearch=null;
 if(p.cardId==='COC-09-005'){
  for(const id of ids)equipWeapon(r,who,id,p.hostId,null,H);
 }else if(ids.length){
  if(r.pendingSummonBatch)throw new Error('another summon batch is pending');
  r.pendingSummonBatch={kind:'weapon',who,cardId:p.cardId,stage:'summoning',hostId:p.hostId,hostRevision:p.hostRevision,
   queue:ids.map(id=>({id,zone:'grave',revision:r.units[id].zoneRevision||0})),turnNumber:r.turnNumber};
  H.graveActivation?.(r,{cardId:p.cardId});
 }
}
export function resumeWeaponRevival(r,p,H){
 while(p.queue.length){
  const next=p.queue.shift();
  if(!weaponHostValid(r,p.who,p.hostId,p.hostRevision)||!r.players[p.who].field.includes(null)){p.queue=[];break;}
  const u=r.units[next.id],z=u&&H.zone(r,next.id);
  if(z?.zone!=='grave'||z.player!==p.who||(u.zoneRevision||0)!==next.revision)continue;
  H.queueEffectSummon(r,{who:p.who,extraUnitId:next.id,originZone:'grave',originRevision:next.revision,
   weaponHostId:p.hostId,weaponHostRevision:p.hostRevision,recipe:{method:'weapon',materials:[]},turnNumber:r.turnNumber});return;
 }
 r.pendingSummonBatch=null;
}
export function finishWeaponRevival(r,p,H){
 const u=r.units[p.extraUnitId],z=u&&H.zone(r,p.extraUnitId);
 if(!weaponHostValid(r,p.who,p.weaponHostId,p.weaponHostRevision)||!r.players[p.who].field.includes(null)||
  z?.zone!=='grave'||z.player!==p.who||(u.zoneRevision||0)!==p.originRevision){H.log(r,'equipment','무기 부활 대상/일체화/빈 칸 소실로 불발');return;}
 H.move(r,u.id,'field',p.who);H.onSummon(r,p.who,u.id);
 equipWeapon(r,p.who,u.id,p.weaponHostId,null,H);
}
