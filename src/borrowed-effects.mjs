import {activeBorrowed,borrowedProfile,borrowedProgram,installBorrowed} from './borrowed-state.mjs';
import {gainUnitStats,gainPlayerStats,scaledStatGain} from './stat-gains.mjs';
import {swordActualAttack,swordMultiplierCount} from './life-eating-sword.mjs';
import {damagePlayer} from './weapon-equipment.mjs';
import {applySharedUnitEffect,destroySharedUnits,moveSharedUnits,captureSharedUnits,hurtSharedUnits} from './shared-unit-effects.mjs';
import {beginDeckSearch,eligibleSearchIds} from './deck-search.mjs';
import {beginOracle,resolveProphet} from './deck-control.mjs';
import {copyRecentMills} from './copy-history.mjs';
import {queueCardRevival} from './death-revival.mjs';

function targets(r,who,rule,H){
 const host=r.players[who].integration,attack=host?swordActualAttack(r,host,{getZone:H.zone}):0;
 return r.players.flatMap((p,player)=>p.field.filter(Boolean).filter(id=>
  (!['enemy','high-hp'].includes(rule.target)||player!==who)&&
  (rule.target!=='own'||player===who)&&
  (rule.target!=='black-metal'||H.name(r,id).startsWith('블랙 메탈'))&&
  (rule.target!=='high-hp'||r.units[id].hp>attack)&&
  (rule.target!=='lower'||Number(H.cards.get(r.units[id].cardId)?.atk)<attack)));
}
export function prepareBorrowed(r,who,cid,number,body,H){
 const rule=borrowedProfile(cid,number),p=r.players[who];
 if(!rule)H.fail(409,'등록되지 않은 복사 조항입니다.');
 // Installing an observer never synthesizes its activation event.
 if(rule.event)return {};
 const selected={};
 if(['seafood','donkey'].includes(rule.action)){
  const id=body.followupId,cid=rule.action==='seafood'?'COC-13-006':'COC-13-002',z=id&&H.zone(r,id);
  if(!id||r.units[id]?.cardId!==cid||z?.player!==who||!['deck','hand','grave'].includes(z.zone))H.fail(409,'이어 소환할 자기 패·덱·묘지의 실제 몬스터를 선택하세요.');
  if(p.field.filter(id=>id===null).length<(rule.action==='donkey'?2:1))H.fail(409,'탈취와 후속 소환에 필요한 빈 칸이 없습니다.');
  Object.assign(selected,{followupId:id,followupZone:z.zone,followupRevision:r.units[id].zoneRevision||0});
 }
 if(rule.attackCost&&!H.attackAvailable(r.units[p.integration],r.turnNumber))H.fail(409,'복사 효과의 비용으로 지불할 공격 기회가 없습니다.');
 const previous=p.originalSinCopies?.[`${body.originalUnitId}:${cid}:${number}`];
 const original=r.units[body.originalUnitId];
 if(!previous&&(rule.limit==='game'&&original?.blackMetalGardenerUsed||rule.limit==='stay'&&original?.blackMetalSoldierUsed))H.fail(409,'복사 시점 원본의 게임/체류 사용 한도를 이미 소모했습니다.');
 if(rule.limit==='game'&&previous?.uses>0||rule.limit==='stay'&&previous?.usedHost===p.integration&&previous?.usedHostRevision===(r.units[p.integration].integrationRevision||0))H.fail(409,'복사한 원본 조항의 게임/체류 사용 한도를 소모했습니다.');
 if(rule.action==='bm-search'&&!eligibleSearchIds(r,who,cid,H.cards).length)H.fail(409,'검색/회수할 카드가 없습니다.');
 if(rule.action==='immortal'){
  if(!p.deck.includes(body.costDeckId))H.fail(409,'비용으로 묘지에 보낼 자기 덱 카드를 선택하세요.');
  selected.costDeckId=body.costDeckId;
 }
 if(rule.target){
  if(rule.target==='any'&&body.target?.type==='player'&&[0,1].includes(body.target.player))selected.target={type:'player',player:body.target.player};
  else if(body.target?.type==='unit'&&targets(r,who,rule,H).includes(body.target.id))selected.target={type:'unit',id:body.target.id};
  else H.fail(409,'복사 조항에 맞는 실제 대상을 선택하세요.');
 }
 if(rule.action==='solo-destroy'&&p.field.some(Boolean))H.fail(409,'복사 주체 이외에 자신의 필드 몬스터가 없어야 합니다.');
 if(rule.action==='ride-gain'){
  const player=body.target?.type==='player'?body.target.player:H.zone(r,body.target?.id)?.player;
  const id=r.players[player]?.integration;
  if(r.units[id]?.cardId!=='COC-23-001')H.fail(409,'효과 본문이 지정한 실제 라이드 위저드를 선택하세요.');
  selected.target={type:'unit',id};
 }
 const installed=(p.borrowedPrograms||[]).find(g=>g.key===`${body.originalUnitId}:${cid}:${number}`);
 if(rule.action==='terra'&&(installed?.history.ownStarts??original?.dragonResidence?.ownTurnStarts??0)<2)H.fail(409,'복사한 독립 체류 이력이 두 번의 자기 턴 시작을 충족해야 합니다.');
 if(rule.action==='beast'){
  if(!Number.isInteger(body.attackGain)||body.attackGain<1||body.attackGain>300||swordActualAttack(r,p.integration,{getZone:H.zone})>=300)H.fail(409,'공격력 300 미만에서 강화량 1~300을 선택하세요.');
  selected.attackGain=body.attackGain;
 }
 if(rule.action==='mill-damage'){
  if(!Number.isInteger(body.discardCount)||body.discardCount<1||body.discardCount>Math.min(3,p.deck.length))H.fail(409,'덱 위 비용 매수를 1~3장 중 선택하세요.');
  selected.discardCount=body.discardCount;
 }
 return selected;
}
export function payBorrowed(r,who,cid,number,body,H){
 const rule=borrowedProfile(cid,number),u=r.units[r.players[who].integration];
 if(rule?.action==='mill-damage')H.mill(r,who,body.discardCount);
 if(rule?.action==='immortal')H.move(r,body.costDeckId,'grave',r.units[body.costDeckId].owner);
 if(rule?.attackCost){
  if(u.attackCountTurn!==r.turnNumber){u.attackCountTurn=r.turnNumber;u.attackCount=0;}u.attackCount++;
  if(cid==='COC-22-004')H.graveActivation?.(r,{cardId:cid});
 }
}
export function resolveBorrowedCopy(r,who,plan,H){
 const rule=borrowedProfile(plan.cardId,plan.effectNumber),g=installBorrowed(r,who,plan);
 if(!rule.event&&rule.action)run(r,who,g,rule,plan.body,{},H);
 H.refreshStats(r);
 H.log(r,'effect',rule.event?'원죄: 독립 사건 기록을 가진 복사 능력 등록; 실제 다음 사건을 기다림':'원죄: 선택 조항 적용');
}
export function recordBorrowedEvent(r,event,data={}){
 if(r.status!=='active')return;
 for(const [who,p] of r.players.entries())for(const g of activeBorrowed(r,who,{includeNegated:true})){
  const rule=borrowedProfile(g.cardId,g.number),h=g.history;
  if(event==='own-summon'&&r.units[data.unitId]?.cardId==='COC-19-001'&&!h.clayIds.includes(data.unitId))h.clayIds.push(data.unitId);
  if(event==='own-turn-start'&&who===data.who&&h.lastStart!==r.turnNumber){h.lastStart=r.turnNumber;h.ownStarts++;}
  if(event==='battle'&&data.sourceId===p.integration){
   if(h.attackTurn!==r.turnNumber){h.attackTurn=r.turnNumber;h.targets=[];}
   h.attacks++;if(data.targetId&&!h.targets.includes(data.targetId))h.targets.push(data.targetId);
  }
  if(rule.event!==event||r.units[p.integration].effectsNegated)continue;
  if(rule.action==='storm-one'&&h.materialCount!==1||rule.action==='storm-half'&&h.materialCount!==2)continue;
  if(['own-turn-start','own-attack-start','own-summon'].includes(event)&&who!==data.who)continue;
  if(event==='enemy-effect-draw'&&who===data.who)continue;
  if(event==='targeted'&&who!==data.who)continue;
  if(event==='attack-declared'&&data.sourceId!==p.integration)continue;
  if(['battle','enemy-destroyed'].includes(event)&&data.sourceId!==p.integration)continue;
  if(event==='enemy-destroyed'&&(data.victimController===who||data.cause==='cost'||data.cause==='condition'))continue;
  if(rule.action==='land'&&(h.ownStarts!==2||h.landUsed))continue;
  if(rule.action==='flame'&&(!data.targetId||!(data.sourceAttack>data.targetAttack)))continue;
  if(rule.action==='knight'&&!data.targetId)continue;
  if(rule.action==='knight'){
   if(h.knightTurn!==r.turnNumber){h.knightTurn=r.turnNumber;h.knightTargets=[];}
   if(h.knightTargets.includes(data.targetId))continue;h.knightTargets.push(data.targetId);
  }
  if(!rule.repeat&&h.usedTurns[event]===r.turnNumber)continue;
  h.usedTurns[event]=r.turnNumber;if(rule.oneStay)h.landUsed=true;
  r.borrowedEventSequence=(r.borrowedEventSequence||0)+1;
  (r.deferredMonsterTriggers??=[]).push({key:`borrowed-${r.borrowedEventSequence}`,effectId:'monster-trigger-resolution',owner:who,
   sourceId:p.integration,sourceZone:'integration',priority:0,payload:{cardId:'COC-21-001',sourceRevision:r.units[p.integration].integrationRevision||0,
    eventTurn:r.turnNumber,borrowedKey:g.key,borrowedCardId:g.cardId,borrowedNumber:g.number,eventData:{...data,attacks:h.attacks,targetCount:h.attackTurn===r.turnNumber?h.targets.length:0},
    ...(event==='enemy-effect-draw'?{drawEvent:true}:{})}});
 }
}
export function resolveBorrowedEvent(r,e,H){
 const g=borrowedProgram(r,e.owner,e.payload.borrowedKey);if(!g)return;
 const rule=borrowedProfile(g.cardId,g.number);
 if(rule.action==='prophet'){resolveProphet(r,e,H);return;}
 if(rule.target){
  const eventData={...e.payload.eventData};
  if(rule.action==='death-writer'){
   eventData.face=H.roll(3);H.log(r,'dice',`복사한 데스 라이터: 1d3 = ${eventData.face}`);
   if(eventData.face===2){run(r,e.owner,g,rule,{},eventData,H);return;}
  }
  const targetKind=eventData.face===3?'enemy':rule.target;
  const ids=targets(r,e.owner,{...rule,target:targetKind},H),choices=ids.map(id=>({id,controller:H.zone(r,id).player,revision:r.units[id].fieldRevision||0}));
  if(targetKind==='any')choices.push({id:'player:0',player:0},{id:'player:1',player:1});
  if(!choices.length)return;
  r.pendingDeckSearch={who:e.owner,cardId:g.cardId,borrowedChoice:true,key:g.key,
   choices,eventData,targetKind};return;
 }
 run(r,e.owner,g,rule,{},e.payload.eventData,H);
}
export function borrowedChoiceView(r,viewer,cards){
 const p=r.pendingDeckSearch,ids=p.choices.filter(t=>t.player!==undefined||r.players[t.controller].field.includes(t.id)&&(r.units[t.id]?.fieldRevision||0)===t.revision);
 return {who:p.who,cardId:p.cardId,zone:'field',borrowedChoice:true,...(viewer===p.who?{choices:ids.map(t=>({id:t.id,card:t.player!==undefined?{id:t.id,name:r.players[t.player].label,atk:0,hp:r.players[t.player].hp}:cards.get(r.units[t.id].cardId)||r.units[t.id].tokenCard}))}:{})};
}
export function chooseBorrowed(r,who,id,H){
 const p=r.pendingDeckSearch;if(!p?.borrowedChoice||p.who!==who)H.fail(403,'복사 유발 선택권자가 아닙니다.');
 const g=borrowedProgram(r,who,p.key),rule=g&&borrowedProfile(g.cardId,g.number);
 const legal=g?borrowedChoiceView(r,who,H.cards).choices.filter(t=>t.id.startsWith('player:')||targets(r,who,{...rule,target:p.targetKind||rule.target},H).includes(t.id)):[];
 if(!legal.length){r.pendingDeckSearch=null;return;}
 if(!legal.some(t=>t.id===id))H.fail(409,'현재 남아 있는 복사 유발 대상을 선택하세요.');
 r.pendingDeckSearch=null;run(r,who,g,rule,{target:id.startsWith('player:')?{type:'player',player:Number(id.slice(7))}:{type:'unit',id}},p.eventData,H);
}
function run(r,who,g,rule,body,event,H){
 const p=r.players[who],u=r.units[p.integration],target=body.target;
 const damage=amount=>target?.type==='unit'?hurtSharedUnits(r,[target.id],amount,H,{sourceId:u.id}):damagePlayer(r,target?.player??1-who,amount);
 const extra=()=>{if(u.bonusAttackTurn!==r.turnNumber){u.bonusAttackTurn=r.turnNumber;u.bonusAttackCount=0;}u.bonusAttackCount++;};
 switch(rule.action){
 case 'seafood':case 'donkey':{
  captureSharedUnits(r,[target.id],who,H,{reserve:rule.action==='donkey'?1:0});
  const id=body.followupId,z=H.zone(r,id);
  if(z?.player===who&&z.zone===body.followupZone&&(r.units[id]?.zoneRevision||0)===body.followupRevision){
   if(z.zone==='grave')H.graveActivation?.(r,{cardId:g.cardId});
   queueCardRevival(r,rule.action==='seafood'?1-who:who,id,H,{kind:rule.action==='donkey'?'borrowed-donkey':'borrowed-seafood',originZone:z.zone});
  }
  break;
 }
 case 'storm-one':H.summonToken(r,who,'스톰 토큰',0,50);break;
 case 'storm-half':applySharedUnitEffect(r,[target.id],H,(id,t)=>{const before=t.atk;t.atk=Math.floor(Math.max(0,t.atk)/2);if(before>0&&!t.atk)H.destroy(r,id,{sourceId:u.id});});break;
 case 'beria-search':{
  const id=['hand','field','deck','grave','extra','banished'].flatMap(z=>p[z]).find(id=>id&&r.units[id]?.cardId==='COC-03-003');
  if(id)H.move(r,id,'hand',r.units[id].owner);break;
 }
 case 'wraith':u.atk=0;p.hp=1;break; // The copier is Original Sin, not Beria.
 case 'remnant':{
  const id=H.instantiate(r,'COC-10-002',who);r.units[id].atk=swordActualAttack(r,u.id,{getZone:H.zone});r.units[id].hp=p.hp;H.move(r,id,'hand',who);
  // move restores physical printed stats; set the defined arrival snapshot afterwards.
  r.units[id].atk=swordActualAttack(r,u.id,{getZone:H.zone});r.units[id].hp=p.hp;break;
 }
 case 'storm-token':H.summonToken(r,who,'스톰 토큰',0,50);break;
 case 'ride-gain':if(r.units[target.id]?.cardId==='COC-23-001')gainUnitStats(r,target.id,{atk:50});break;
 case 'another':gainUnitStats(r,u.id,{atk:110});p.rideMachineLock=true;break;
 case 'tyranno':{
  let count=0,more=true;while(more&&count<2&&p.deck.length){const id=p.deck[0],c=H.cards.get(r.units[id].cardId);more=count===0&&!r.units[id].created&&c?.type.includes('몬스터');H.mill(r,who,1);count++;}
  gainUnitStats(r,u.id,{atk:count*50});gainPlayerStats(r,who,{hp:count*50});break;
 }
 case 'magician-base':u.atk=50+u.atk-(u.baseAtk||0);u.baseAtk=50;break;
 case 'death-writer':{
  const face=event.face;if(face===2)H.draw(r,who);
  else if(face===1)damage(swordActualAttack(r,u.id,{getZone:H.zone}));
  else if(target?.type==='unit'&&H.zone(r,target.id)?.player!==who)applySharedUnitEffect(r,[target.id],H,(id,t)=>{const before=t.atk;t.atk=Math.max(0,t.atk-Math.floor(swordActualAttack(r,u.id,{getZone:H.zone})/2));if(before>0&&!t.atk)H.destroy(r,id,{cause:'lethal',sourceId:u.id});});
  break;
 }
 case 'water':{
  const a=r.units[event.attackerId],z=a&&H.zone(r,a.id);
  if(z?.zone==='field'&&z.player===1-who&&(a.fieldRevision||0)===event.attackerRevision&&swordActualAttack(r,a.id,{getZone:H.zone})>p.hp){destroySharedUnits(r,[a.id],H,{sourceId:u.id});if(H.zone(r,a.id)?.zone!=='field'||(a.fieldRevision||0)!==event.attackerRevision)r.pendingAttack=null;}break;
 }
 case 'infinity':{
  const foe=r.players[1-who];
  for(let n=Math.min(2,foe.hand.length);n>0;n--){const id=foe.hand[H.randomInt(foe.hand.length)];H.move(r,id,'banished',r.units[id].owner);}
  for(let n=Math.min(2,foe.deck.length);n>0;n--){const id=foe.deck[0];H.move(r,id,'banished',r.units[id].owner);}
  if(foe.grave.length){H.graveActivation?.(r,{cardId:g.cardId});r.pendingInfinityChoice={who:1-who,sourceId:u.id,candidates:[...foe.grave],count:Math.min(2,foe.grave.length)};}break;
 }
 case 'bm-mode':u.blackMetalMode={turn:r.turnNumber,amount:rule.attack-(u.baseAtk||0),attacks:rule.attacks};break;
 case 'bm-search':beginDeckSearch(r,who,g.cardId,H.cards,H,{sourceId:u.id,sourceCardId:u.cardId,sourceZone:'integration',sourceRevision:u.integrationRevision||0});break;
 case 'bm-heal':if(target.type==='player')gainPlayerStats(r,target.player,{hp:50});else applySharedUnitEffect(r,[target.id],H,id=>H.healUnit(r,id,50));break;
 case 'bm-protect':applySharedUnitEffect(r,[target.id],H,(id,t)=>{t.effectDestructionImmune=true;});break;
 case 'bm-weaken':case 'bm-gain':applySharedUnitEffect(r,[target.id],H,(id,t)=>{
  const before=swordActualAttack(r,id,{getZone:H.zone});
  (t.blackMetalStatGrants??=[]).push({sourceId:u.id,amount:rule.action==='bm-weaken'?-100:scaledStatGain(r,{id},50),expiresBeforeTurn:r.turnNumber+(rule.action==='bm-weaken'?2:1)});
  if(rule.action==='bm-weaken'&&before>0&&!swordActualAttack(r,id,{getZone:H.zone}))H.destroy(r,id,{cause:'lethal',sourceId:u.id});
 });break;
 case 'immortal':
  for(const t of Object.values(r.units))if(t.immortalProtection)t.immortalProtection=t.immortalProtection.filter(x=>x.borrowedKey!==g.key||x.sourceId!==u.id);
  applySharedUnitEffect(r,[target.id],H,(id,t)=>{(t.immortalProtection??=[]).push({sourceId:u.id,borrowedKey:g.key,residence:u.integrationRevision||0,targetResidence:t.linkedResidence||0});});break;
 case 'copper':g.link={id:target.id,residence:r.units[target.id].linkedResidence||0};g.sequence=r.linkedEffectSequence=(r.linkedEffectSequence||0)+1;break;
 case 'beast':{
  const before=swordActualAttack(r,u.id,{getZone:H.zone}),factor=2**Math.min(52,swordMultiplierCount(r,u.id,{getZone:H.zone}));
  u.atk+=Math.min(scaledStatGain(r,{id:u.id},body.attackGain),Math.max(0,Math.floor((300-before)/factor)));
  damagePlayer(r,who,Math.ceil(Math.max(0,swordActualAttack(r,u.id,{getZone:H.zone})-before)/2));break;
 }
 case 'solo-destroy':if(!p.field.some(Boolean))destroySharedUnits(r,[target.id],H,{sourceId:u.id});break;
 case 'ocean':if(r.units[target.id].hp>swordActualAttack(r,u.id,{getZone:H.zone}))destroySharedUnits(r,[target.id],H,{sourceId:u.id});break;
 case 'terra':damagePlayer(r,1-who,Math.floor(Math.max(0,p.hp)/2));break;
 case 'mill-damage':damage(body.discardCount*50);break;
 case 'half-damage':damage(Math.floor(swordActualAttack(r,u.id,{getZone:H.zone})/2));break;
 case 'half-die':{const n=Math.floor(swordActualAttack(r,u.id,{getZone:H.zone})/2);damage(n>0?H.roll(n):0);break;}
 case 'mill-event':H.mill(r,event.who,event.count||1);break;
 case 'orochi':hurtSharedUnits(r,r.players[1-who].field.filter(Boolean),(event.attacks||0)*80,H,{sourceId:u.id});damagePlayer(r,1-who,(event.attacks||0)*80);break;
 case 'victim-attack':damagePlayer(r,1-who,event.victimAttack||0);break;
 case 'victim-half':damagePlayer(r,1-who,Math.floor((event.victimAttack||0)/2));break;
 case 'chimera':damagePlayer(r,1-who,(event.targetCount||0)*100);break;
 case 'knight':r.players[event.targetController].blackMetalCounters=(r.players[event.targetController].blackMetalCounters||0)+1;break;
 case 'flame':case 'extra-attack':extra();break;
 case 'land':{const attack=Math.max(0,Math.floor(u.atk)),hp=p.hp;u.atk=hp;p.hp=attack;break;}
 case 'both-draw':H.draw(r,who);if(r.status==='active')H.draw(r,1-who);break;
 case 'mill-two':H.mill(r,1-who,2);break;
 case 'mill-history':{let n=0;for(let i=copyRecentMills(p.originalSinCopies?.[g.key]?.history,r);i>0;i--)n+=H.roll(50);damagePlayer(r,1-who,n);break;}
 case 'draw-two':H.draw(r,who);if(r.status==='active')H.draw(r,who);break;
 case 'heal':gainPlayerStats(r,who,{hp:rule.amount});break;
 case 'coin-draw':H.draw(r,H.roll(2)===1?who:1-who);break;
 case 'coin-damage':{let n=0;for(let i=0;i<5;i++)if(H.roll(2)===1)n+=100;damagePlayer(r,1-who,n);break;}
 case 'franz':if(p.hp>500){const dealt=damagePlayer(r,who,p.hp-500);damagePlayer(r,1-who,dealt);}break;
 case 'freeze':r.players[1-who].noAttackUntil=r.players[1-who].turnsTaken+1;break;
 case 'search':beginDeckSearch(r,who,g.cardId,H.cards,H,{sourceId:u.id,sourceCardId:u.cardId,sourceZone:'integration',sourceRevision:u.integrationRevision||0});break;
 case 'return':moveSharedUnits(r,[target.id],'hand',H,{sourceId:u.id});break;
 case 'banish':moveSharedUnits(r,[target.id],'banished',H,{sourceId:u.id});break;
 case 'capture':captureSharedUnits(r,[target.id],who,H);break;
 case 'destroy-lower':destroySharedUnits(r,[target.id],H,{sourceId:u.id});break;
 case 'coin-weaken':{let heads=0;for(let i=0;i<3;i++)if(H.roll(2)===1)heads++;if(heads===2)applySharedUnitEffect(r,[target.id],H,(id,t)=>{t.atk=Math.max(0,t.atk-100);if(!t.atk)H.destroy(r,id,{sourceId:u.id});});break;}
 case 'destroy-others':destroySharedUnits(r,r.players.flatMap(p=>p.field.filter(Boolean)),H,{sourceId:u.id},{exclude:[u.id]});break;
 case 'return-others':moveSharedUnits(r,r.players.flatMap(p=>p.field.filter(Boolean)),'deck',H,{sourceId:u.id},{exclude:[u.id]});break;
 case 'oracle':beginOracle(r,{owner:who,sourceId:u.id,payload:{sourceRevision:u.integrationRevision||0}},H);break;
 }
 H.refreshStats(r);H.outcome(r);
}
