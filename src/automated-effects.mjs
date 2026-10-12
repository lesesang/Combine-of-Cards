// Audited, deterministic card-effect handlers. No free-form text execution.
// A handler must be backed by a particular v1.3 card wording.
const aliases={};
const register=(ids,handler)=>{for(const id of ids.split(' '))aliases[id]=handler;};
const getTarget=(ctx,kind='enemy')=>{
 const {r,who,body,H}=ctx;
 const target=body.target;
 if(target?.type==='unit'&&typeof target.id==='string'){
  const z=H.zone(r,target.id);
  if(z&&['field','integration'].includes(z.zone)&&(kind==='any'||z.player===(kind==='own'?who:1-who)))return {id:target.id,player:z.player};
 }
 if(target?.type==='player'&&Number.isInteger(target.player)&&(kind==='any'||target.player===(kind==='own'?who:1-who)))return {player:target.player};
 const enemy=1-who,p=r.players[kind==='own'?who:enemy];
 if(kind==='any'&&target?.type==='player')return {player:target.player};
 const candidate=p.field.find(Boolean);
 return candidate?{id:candidate,player:kind==='own'?who:enemy}:{player:kind==='own'?who:enemy};
};
const hit=(ctx,target,amount)=>{if(!Number.isFinite(amount))throw Error('잘못된 피해 수치');amount=Math.max(0,Math.floor(amount));if(target.id)ctx.H.hurt(ctx.r,target.id,amount);else{ctx.r.players[target.player].hp-=amount;ctx.H.outcome(ctx.r)}};
const heal=(ctx,target,amount)=>{amount=Math.max(0,Math.floor(amount));if(target.id)ctx.H.healUnit(ctx.r,target.id,amount);else ctx.r.players[target.player].hp+=amount;};
const charge=(ctx,amount)=>{const p=ctx.r.players[ctx.who];if(p.hp<=amount)ctx.H.fail(409,'필요한 체력을 지불할 수 없습니다.');p.hp-=amount;};
const enemy=(ctx)=>getTarget(ctx,'enemy');
const own=(ctx)=>getTarget(ctx,'own');
function fieldHas(ctx,phrase){return ctx.r.players[ctx.who].field.some(id=>id&&ctx.H.name(ctx.r,id).includes(phrase));}
function requireField(ctx,phrase){if(!fieldHas(ctx,phrase))ctx.H.fail(409,`${phrase} 카드가 필드에 있어야 합니다.`)}
function addCurse(ctx,id){ctx.r.players[ctx.who].effects??=[];ctx.r.players[ctx.who].effects.push({type:'burn',id,amount:50,ownerTurn:true});}
// spell handlers: return { retain?: 'field', spent?: boolean }.
register('COC-03-007',ctx=>{const n=ctx.r.players[1-ctx.who].grave.length;hit(ctx,enemy(ctx),Array.from({length:n},()=>ctx.H.roll(100)).reduce((a,b)=>a+b,0));});
register('COC-03-008',ctx=>{const n=ctx.r.players[ctx.who].grave.length;heal(ctx,own(ctx),Array.from({length:n},()=>ctx.H.roll(100)).reduce((a,b)=>a+b,0));});
register('COC-05-002',ctx=>{charge(ctx,100);if(!ctx.r.players[ctx.who].field.includes(null))ctx.H.fail(409,'몬스터 슬롯이 없습니다.');return {retain:'field',monsterized:true,hp:1,atk:0}});
register('COC-06-003',ctx=>{const n=Math.max(0,ctx.r.players[ctx.who].roundElementUses||0)+( ['금속','원소'].includes(ctx.c.attribute)?1:0);for(let i=0;i<n;i++){const choices=[...ctx.r.players.flatMap((p,j)=>[{player:j},...p.field.filter(Boolean).map(id=>({player:j,id}))])];hit(ctx,choices[ctx.H.randomInt(choices.length)],50)}});
register('COC-06-004',ctx=>{const targets=ctx.r.players.flatMap((p,i)=>p.field.filter(Boolean).map(id=>({id,player:i})));if(!targets.length)ctx.H.fail(409,'필드에 몬스터가 없습니다.');if((ctx.r.players[ctx.who].roundElementUses||0)>=3){for(const t of targets.slice(0,2))ctx.H.destroy(ctx.r,t.id)}else{const t=getTarget(ctx,'any');if(!t.id)ctx.H.fail(409,'몬스터 대상이 필요합니다.');hit(ctx,t,100)}});
register('COC-06-007',ctx=>{if((ctx.r.players[ctx.who].roundPlays||0)<5)ctx.H.fail(409,'이번 턴 카드 사용이 5회 이상이어야 합니다.');hit(ctx,enemy(ctx),300)});
register('COC-07-003',ctx=>{ctx.H.draw(ctx.r,1-ctx.who);ctx.H.mill(ctx.r,1-ctx.who,3)});
register('COC-07-010',ctx=>{ctx.H.draw(ctx.r,1-ctx.who);ctx.H.mill(ctx.r,1-ctx.who,ctx.r.players[1-ctx.who].lastRoundPlays||0)});
register('COC-08-005',ctx=>{const target=enemy(ctx);ctx.r.effects??=[];ctx.r.effects.push({type:'dot',target,damage:50,origin:ctx.who});});
register('COC-08-006',ctx=>{if(ctx.r.players[ctx.who].field.filter(id=>id&&ctx.H.attribute(ctx.r,id)==='요괴').length<2)ctx.H.fail(409,'요괴 2장이 필요합니다.');const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'파괴할 몬스터가 없습니다.');ctx.H.destroy(ctx.r,t.id)});
register('COC-08-007',ctx=>{const n=ctx.r.players[ctx.who].field.filter(id=>id&&ctx.H.attribute(ctx.r,id)==='요괴').length;heal(ctx,{player:ctx.who},n*100)});
register('COC-10-009',ctx=>{ctx.r.effects??=[];ctx.r.effects.push({type:'firstDestroyHeal',player:ctx.who,turn:ctx.r.turnNumber});});
register('COC-13-007',ctx=>{const p=ctx.r.players[1-ctx.who],n=Math.floor(p.hp/10);p.hp-=n;ctx.r.players[ctx.who].hp+=n;ctx.H.outcome(ctx.r)});
register('COC-13-008',ctx=>{const op=ctx.r.players[1-ctx.who];if(!op.hand.length)return;const picked=(ctx.body.target?.id&&op.hand.includes(ctx.body.target.id))?ctx.body.target.id:ctx.r.mode==='ai'&&ctx.who===1?op.hand[ctx.H.randomInt(op.hand.length)]:null;if(!picked)ctx.H.fail(409,'상대 손패 중 버릴 카드를 직접 선택해 주세요.');ctx.H.move(ctx.r,picked,'grave',1-ctx.who)});
register('COC-14-003',ctx=>{if(!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'제거할 몬스터가 없습니다.');ctx.H.move(ctx.r,t.id,'banished',ctx.H.originalOwner(ctx.r,t.id));});
register('COC-14-006',ctx=>{if(!ctx.r.players[1-ctx.who].field.some(id=>id&&ctx.r.units[id].atk>=350))ctx.H.fail(409,'공격력 350 이상인 상대 몬스터가 필요합니다.');ctx.r.players[1-ctx.who].noAttackUntil=(ctx.r.players[1-ctx.who].turnsTaken||0)+1;});
register('COC-17-003',ctx=>{const p=ctx.r.players[ctx.who];p.hp+=150;for(const id of p.field.filter(Boolean))heal(ctx,{id},150)});
register('COC-17-005',ctx=>{if(!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');hit(ctx,enemy(ctx),ctx.H.roll(400))});
register('COC-17-006',ctx=>{if(!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');const n=ctx.H.roll(200);hit(ctx,{player:1-ctx.who},n);for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))hit(ctx,{id},n)});
register('COC-20-005',ctx=>{const n=ctx.H.roll(200);hit(ctx,{player:ctx.who},n);hit(ctx,{player:1-ctx.who},n)});
register('COC-21-005',ctx=>{const t=own(ctx);if(!t.id)ctx.H.fail(409,'자신의 몬스터를 선택하세요.');const hp=ctx.r.units[t.id].hp||0;ctx.H.destroy(ctx.r,t.id);ctx.r.players[ctx.who].hp+=hp});
register('COC-27-006',ctx=>{hit(ctx,enemy(ctx),100)});
register('COC-30-001',ctx=>{for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))if(ctx.r.units[id].atk<=100)ctx.H.destroy(ctx.r,id)});
register('COC-30-003',ctx=>{for(let i=0;i<3;i++)hit(ctx,enemy(ctx),ctx.H.roll(50))});
register('COC-30-006',ctx=>{const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'대상 몬스터가 없습니다.');ctx.r.units[t.id].diceMax=10});
register('COC-30-007',ctx=>{ctx.r.players[ctx.who].hp+=300});
// COC-30-011: prior-two-turn natural spell history is not yet implemented; do not misrepresent as automated.
register('COC-31-008',ctx=>{if(ctx.H.roll(2)===1)for(const p of ctx.r.players)for(const id of [...p.field].filter(Boolean))ctx.H.destroy(ctx.r,id)});
register('COC-32-005',ctx=>{requireField(ctx,'플레임');hit(ctx,{player:1-ctx.who},ctx.H.roll(200))});
register('COC-32-006',ctx=>{requireField(ctx,'워터');heal(ctx,{player:ctx.who},100)});
register('COC-32-008',ctx=>{requireField(ctx,'랜드');for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))ctx.H.destroy(ctx.r,id)});
// More precisely scoped automatic spells with explicit prerequisites.
register('COC-06-002',ctx=>{const count=ctx.r.players[ctx.who].roundElementUses||0;const atk=count*50,hp=50+count*50;ctx.H.summonToken(ctx.r,ctx.who,'인조 생물',atk,hp)});
register('COC-07-004',ctx=>{ctx.H.draw(ctx.r,1-ctx.who);const a=ctx.H.search(ctx.r,ctx.who,'포식자 알리자');if(!a)ctx.H.search(ctx.r,ctx.who,'포식의 맹약')});
register('COC-07-011',ctx=>{ctx.H.draw(ctx.r,1-ctx.who);ctx.H.mill(ctx.r,1-ctx.who,3);ctx.r.players[ctx.who].hp+=400;const id=ctx.r.players[ctx.who].integration;if(id){ctx.r.units[id].atk+=200;ctx.r.units[id].buffExpiresAt=(ctx.r.players[ctx.who].turnsTaken||0)+1;ctx.r.units[id].temporaryBuff=(ctx.r.units[id].temporaryBuff||0)+200}});
register('COC-14-002',ctx=>{ctx.H.mill(ctx.r,ctx.who,1);for(let i=0;i<2;i++)ctx.H.summonToken(ctx.r,ctx.who,'스톰 토큰',0,50)});
register('COC-14-009',ctx=>{if(ctx.body.option===2){ctx.H.summonToken(ctx.r,ctx.who,'스톰 토큰',0,50)}else{hit(ctx,{player:1-ctx.who},50);for(const id of [...ctx.r.players[1-ctx.who].field].filter(Boolean))hit(ctx,{id},50)}});
register('COC-17-004',ctx=>{for(let i=0;i<3;i++)if(!ctx.H.summonToken(ctx.r,ctx.who,'미라 병사',80,100))break});
register('COC-19-004',ctx=>{const p=ctx.r.players[ctx.who],id=p.deck.find(id=>ctx.H.type(ctx.r,id)==='몬스터');if(id)ctx.H.move(ctx.r,id,'hand',ctx.who)});
register('COC-19-005',ctx=>{const t=getTarget(ctx,'any');if(!t.id)ctx.H.fail(409,'필드의 몬스터가 필요합니다.');ctx.r.units[t.id].frozen=true;ctx.r.units[t.id].battleInvulnerable=true;});
register('COC-20-003',ctx=>{if(ctx.r.players[ctx.who].hp>600)ctx.H.fail(409,'체력 600 이하일 때만 사용 가능합니다.');ctx.H.search(ctx.r,ctx.who,'버닝 데몬즈')});
register('COC-23-009',ctx=>{if(!ctx.r.players[ctx.who].integration)ctx.H.fail(409,'일체화가 필요합니다.');const t=enemy(ctx);if(ctx.body.option===1){if(!t.id)ctx.H.fail(409,'파괴할 몬스터가 없습니다.');ctx.H.destroy(ctx.r,t.id)}else hit(ctx,t,200)});
register('COC-24-006',ctx=>{const id=ctx.r.players[ctx.who].integration;if(!id)ctx.H.fail(409,'일체화가 필요합니다.');for(const target of [...ctx.r.players[ctx.who].field].filter(Boolean))ctx.H.destroy(ctx.r,target);ctx.r.units[id].atk+=60});
register('COC-24-008 COC-26-008',ctx=>{const p=ctx.r.players[ctx.who];if(p.field.filter(id=>id&&ctx.H.name(ctx.r,id).includes('매치')).length>1)ctx.H.fail(409,'필드의 매치는 최대 1장이어야 합니다.');const id=p.deck.find(id=>ctx.H.type(ctx.r,id)==='몬스터');if(id)ctx.H.move(ctx.r,id,'hand',ctx.who)});
register('COC-31-005',ctx=>{ctx.H.draw(ctx.r,ctx.who);if(ctx.H.roll(2)===1){const p=ctx.r.players[1-ctx.who];if(p.hand.length)ctx.H.move(ctx.r,p.hand[ctx.H.randomInt(p.hand.length)],'grave',1-ctx.who)}});
register('COC-31-007',ctx=>{charge(ctx,100);const t=enemy(ctx);if(!t.id)ctx.H.fail(409,'탈취할 몬스터가 없습니다.');ctx.H.capture(ctx.r,ctx.who,t.id)});
register('COC-31-009',ctx=>{const p=ctx.r.players[ctx.who];if(!p.hand.length)ctx.H.fail(409,'버릴 패 한 장이 필요합니다.');const selected=ctx.body.costCardId&&p.hand.includes(ctx.body.costCardId)?ctx.body.costCardId:p.hand[0];ctx.H.move(ctx.r,selected,'grave',ctx.who);for(const id of ctx.r.players[1-ctx.who].field.filter(Boolean))ctx.r.units[id].effectsNegated=true});
register('COC-32-007',ctx=>{requireField(ctx,'윈드');ctx.r.players[1-ctx.who].spellForbiddenUntil=(ctx.r.players[1-ctx.who].turnsTaken||0)+1});
register('COC-30-005',ctx=>{ctx.r.players[ctx.who].spellDiceBonus=(ctx.r.players[ctx.who].spellDiceBonus||0)+50;ctx.r.players[ctx.who].bonusDrawOnTurn=(ctx.r.players[ctx.who].turnsTaken||0)+1});
// Generic evolution: named created-card search, preserving integration identity by updating cardId.
const evolves={'COC-03-003':'영매사 스트로베리아','COC-08-010':'오오 츠쿠모가미 백귀야행','COC-20-007':'버닝데몬즈 워리어 드라고닉','COC-23-006':'라이드 위저드 인피니티','COC-24-009':'인빈시블 지니어스','COC-26-009':'인빈시블 지니어스','COC-30-009':'대자연의 여신 유리카'};
for(const [id,target] of Object.entries(evolves)){aliases[id]=(ctx)=>{const p=ctx.r.players[ctx.who];if(!p.integration)ctx.H.fail(409,'일체화 중이어야 합니다.');const matching=ctx.H.cardNamed(ctx.r,ctx.who,target);if(!matching)ctx.H.fail(409,'진화 대상이 카드 데이터에 없습니다.');ctx.H.evolve(ctx.r,p.integration,matching)};}
export function hasAutoSpell(cardId){return Object.hasOwn(aliases,cardId)}
export const spellHandlerIds=Object.keys(aliases);
export function castAutomatedSpell(r,who,c,body,H){const f=aliases[c.id];if(!f)return {supported:false};const ctx={r,who,c,body,H};const result=f(ctx)||{};return {supported:true,...result}}
