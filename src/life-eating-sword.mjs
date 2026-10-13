/**
 * COC-21-002: Life-Eating Sword is a graveyard spell granting a serializable
 * independent effect, never a physical attachment.
 *
 * Each granted instance pays independently at the beginning of its bearer's
 * attack phase. Each qualifying enemy-monster kill schedules its own x2 for
 * the bearer's NEXT own turn. Multipliers compose: 2, 4, 8, 16, ...
 */
const KIND='lifeEatingSword';
const isSword=e=>e?.type===KIND;
const effects=r=>(r.effects||[]).filter(isSword);
const discardEffect=(r,e)=>{const i=r.effects?.indexOf(e)??-1;if(i!==-1)r.effects.splice(i,1)};

/** Current controller, or null if a unit-bearer is no longer on the field. */
function bearerController(room,e,getZone){
 if(e.target?.kind==='player'){
  const who=e.target.player;
  return (who===0||who===1)&&room.players[who]?who:null;
 }
 if(e.target?.kind==='unit'){
  const z=getZone(room,e.target.id);
  return z?.zone==='field'&&room.units[e.target.id]?z.player:null;
 }
 return null;
}

/** Return whether a destruction was caused by the enchanted active bearer. */
export function recordSwordKill(room,{sourceId=null,sourcePlayer=null,victimController=null}={}, {getZone,log}={}){
 if(!Number.isInteger(victimController)||!getZone)return 0;
 const sourceZone=sourceId?getZone(room,sourceId):null;
 const sourceController=sourceZone&&['field','integration'].includes(sourceZone.zone)?sourceZone.player:sourcePlayer;
 if(sourceController!==0&&sourceController!==1||sourceController===victimController)return 0;
 let count=0;
 for(const e of effects(room)){
  if(bearerController(room,e,getZone)!==sourceController)continue;
  const matches=e.target.kind==='unit'?
   sourceId===e.target.id && sourceZone?.zone==='field':
   (sourcePlayer===sourceController||room.players[sourceController].integration===sourceId);
  if(!matches)continue;
  e.pendingDoubleTurns??=[];
  // "The effect can be applied repeatedly" means distinct granted swords
  // stack, not an unlimited multiplier per enemy killed by one sword during
  // the same upcoming-turn window. Each sword earns at most one pending x2.
  if(e.pendingDoubleTurns.length)continue;
  e.pendingDoubleTurns.push(room.turnNumber);
  count++;
 }
 if(count)log?.(room,'effect',`생명을 먹는 마검: 몬스터 처치로 다음 자신의 턴 공격력 2배 효과 ${count}회 예약`);
 return count;
}

/** Applied once when the bearer's own turn begins, not at attack phase. */
export function beginSwordTurn(room,who,{getZone,log}={}){
 for(const e of [...effects(room)]){
  const bearer=bearerController(room,e,getZone);
  if(bearer===null){discardEffect(room,e);continue}
  // Never leave a modifier active after its designated turn.
  delete e.activeDoubleTurn;
  delete e.activeDoubleCount;
  if(bearer!==who)continue;
  const queued=Array.isArray(e.pendingDoubleTurns)?e.pendingDoubleTurns:[];
  const ready=queued.filter(turn=>Number.isInteger(turn)&&turn<room.turnNumber);
  e.pendingDoubleTurns=queued.filter(turn=>Number.isInteger(turn)&&turn>=room.turnNumber);
  if(!ready.length)continue;
  e.activeDoubleTurn=room.turnNumber;
  e.activeDoubleCount=1;
  log?.(room,'effect',`생명을 먹는 마검: 다음 자기 턴 공격력 2배 × ${ready.length} 중첩 발동`);
 }
}

export function endSwordTurn(room,who){
 for(const e of effects(room))if(e.activeDoubleTurn===room.turnNumber &&
  (e.target.kind==='player'?e.target.player===who:true)){
  delete e.activeDoubleTurn;
  delete e.activeDoubleCount;
 }
}

export function swordMultiplierCount(room,unitId,{getZone}={}){
 const z=getZone(room,unitId);
 if(!z||!['field','integration'].includes(z.zone))return 0;
 let sum=0;
 for(const e of effects(room)){
  if(e.activeDoubleTurn!==room.turnNumber)continue;
  if(e.target.kind==='unit'&&e.target.id===unitId&&z.zone==='field'||
     e.target.kind==='player'&&e.target.player===z.player&&
       room.players[z.player]?.integration===unitId)sum+=(e.activeDoubleCount||0);
 }
 return sum;
}
export function swordActualAttack(room,unitId,{getZone}={}){
 const raw=Number(room.units[unitId]?.atk);
 const base=Number.isFinite(raw)?Math.max(0,Math.floor(raw)):0;
 const count=swordMultiplierCount(room,unitId,{getZone});
 if(!count)return base;
 const boosted=base*2**Math.min(52,count);
 return Number.isSafeInteger(boosted)?boosted:Number.MAX_SAFE_INTEGER;
}

/** Called ONLY when entering ATTACK (never DRAW, MAIN, END or skipped attack). */
export function processSwordAttackPhase(room,who,{getZone,destroy,outcome,log}={}){
 for(const e of [...effects(room)]){
  if(room.status==='finished')break;
  const bearer=bearerController(room,e,getZone);
  if(bearer===null){discardEffect(room,e);continue}
  if(bearer!==who)continue;
  const unit=e.target.kind==='unit'?room.units[e.target.id]:null;
  const hp=unit?unit.hp:room.players[who].hp;
  if(!Number.isFinite(hp)||hp<=30){
   discardEffect(room,e);
   if(unit){
    destroy(room,e.target.id,{cause:'lethal'});
    log?.(room,'effect','생명을 먹는 마검: 공격 페이즈 시작에 체력 30 지불 불가 — 대상 몬스터 파괴');
   }else{
    room.players[who].hp=0;
    log?.(room,'effect','생명을 먹는 마검: 공격 페이즈 시작에 체력 30 지불 불가 — 플레이어 패배');
   }
   outcome?.(room);
   continue;
  }
  if(unit){
   unit.hp-=30;
   unit.atk+=100;
  }else{
   room.players[who].hp-=30;
   const p=room.players[who];
   p.playerAtkBonus=(p.playerAtkBonus||0)+100;
   if(p.integration){
    const u=room.units[p.integration];
    u.atk+=100;
    u.playerAttackBonusApplied=(u.playerAttackBonusApplied||0)+100;
   }
  }
  log?.(room,'effect','생명을 먹는 마검: 공격 페이즈 시작에 체력 30 지불 / 공격력 +100');
 }
}
