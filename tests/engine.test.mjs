import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coc-test-'));
process.env.DATA_DIR=temporary;
process.env.NODE_ENV='test';
const {createApp}=await import('../server.mjs');
const server=createApp();
let base;
before(async()=>{await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`});
after(async()=>{await new Promise(ok=>server.close(ok));fs.rmSync(temporary,{recursive:true,force:true})});
async function call(uri,{method='GET',token,body}={}){const response=await fetch(base+uri,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{}) ,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,json:await response.json(),headers:response.headers}}
async function createPair(){const x=await call('/api/rooms',{method:'POST',body:{label:'Player 1',deckId:'01'}});assert.equal(x.status,201);const y=await call(`/api/rooms/${x.json.code}/join`,{method:'POST',body:{label:'Player 2',deckId:'03'}});assert.equal(y.status,201);return {code:x.json.code,tokens:[x.json.token,y.json.token],state:x.json.state}}
async function act(pair,index,type,extra={}){const s=await call(`/api/rooms/${pair.code}`,{token:pair.tokens[index]});return call(`/api/rooms/${pair.code}/actions`,{method:'POST',token:pair.tokens[index],body:{type,expectedVersion:s.json.version,...extra}})}
test('catalog integrity and static security headers',async()=>{const r=await call('/api/catalog');assert.equal(r.status,200);assert.equal(r.json.decks.length,24);assert.equal(r.json.cards.length,254);assert.equal(r.json.excludedDeckIds.length,8);for(const d of r.json.decks){assert.ok(d.main.length>=7&&d.main.length<=10);assert.ok(d.extra.length<=7);assert.equal(new Set(d.main).size,d.main.length)}const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(await html.text(),/컴바인 오브 카드즈/);assert.match(html.headers.get('content-security-policy'),/script-src 'self'/)});
test('lobby authentication and private hand visibility',async()=>{const p=await createPair();const a=await call(`/api/rooms/${p.code}`,{token:p.tokens[0]});const b=await call(`/api/rooms/${p.code}`,{token:p.tokens[1]});assert.equal(a.status,200);assert.equal(a.json.you,0);assert.equal(b.json.you,1);assert.equal(a.json.players[1].hand,null);assert.equal(b.json.players[0].hand,null);assert.equal((await call(`/api/rooms/${p.code}`)).status,401);assert.equal((await call(`/api/rooms/${p.code}`,{token:'f'.repeat(64)})).status,403);const unauthorized=await call(`/api/rooms/${p.code}/actions`,{method:'POST',token:p.tokens[1],body:{type:'start',expectedVersion:b.json.version}});assert.equal(unauthorized.status,409)});
test('start, draw, phases, summon, spell, attacks and dice',async()=>{const p=await createPair();let r=await act(p,0,'start');assert.equal(r.status,200);assert.equal(r.json.status,'active');assert.equal(r.json.phase,'DRAW');assert.equal(r.json.players[0].handCount,2);assert.equal(r.json.players[1].handCount,2);const active=r.json.turn,defender=1-active;assert.equal((await act(p,defender,'draw')).status,403);r=await act(p,active,'draw');assert.equal(r.status,200);assert.equal(r.json.phase,'MAIN');assert.equal(r.json.players[active].handCount,3);
const hand=r.json.players[active].hand;let playable=null;for(const card of hand.filter(u=>['몬스터','주문','일체화'].includes(u.card.type))){const attempt=await act(p,active,'play',{unitId:card.id});if(attempt.status===200){playable=card;r=attempt;break;}assert.equal(attempt.status,409,'an unplayable card must fail with a conflict, not consume a card');}if(playable?.card.type==='몬스터')assert.ok(r.json.players[active].field.some(u=>u?.id===playable.id));if(playable?.card.type==='주문')assert.ok(r.json.players[active].grave.some(u=>u?.id===playable.id));if(r.json.pendingSpell){r=await act(p,defender,'spellResponse',{choice:'pass'});assert.equal(r.status,200);}r=await act(p,active,'phase');assert.equal(r.json.phase,'ATTACK');const attacker=r.json.players[active].field.find(u=>u&&u.atk>0)||r.json.players[active].integration;if(attacker?.atk>0){r=await act(p,active,'attack',{attackerId:attacker.id,target:{type:'player'}});assert.equal(r.status,200);assert.ok(r.json.pendingAttack);assert.equal((await act(p,active,'defend')).status,409);r=await act(p,defender,'defend');assert.equal(r.status,200);assert.equal(r.json.pendingAttack,null);assert.ok(r.json.players[defender].hp>=1000-attacker.atk&&r.json.players[defender].hp<1000)}r=await act(p,active,'phase');assert.equal(r.json.phase,'END');r=await act(p,active,'phase');assert.equal(r.json.phase,'DRAW');assert.equal(r.json.turn,defender)});
test('mutual approval required for manual rulings; optimistic concurrency',async()=>{const p=await createPair();let r=await act(p,0,'start');const by=r.json.turn,other=1-by;const prior=r.json.players[other].hp;r=await act(p,by,'manual',{kind:'hp',payload:{player:other,delta:-75},explanation:'확인된 카드 효과 75 피해'});assert.equal(r.status,200);assert.equal(r.json.players[other].hp,prior);assert.ok(r.json.pendingManual);assert.equal((await act(p,by,'manualDecision',{approve:true})).status,403);const conflict=await call(`/api/rooms/${p.code}/actions`,{method:'POST',token:p.tokens[other],body:{type:'manualDecision',expectedVersion:1,approve:true}});assert.equal(conflict.status,409);r=await act(p,other,'manualDecision',{approve:true});assert.equal(r.status,200);assert.equal(r.json.players[other].hp,prior-75);assert.equal(r.json.pendingManual,null);r=await act(p,other,'manual',{kind:'note',payload:{},explanation:'효과 주석 테스트'});assert.equal(r.status,200);r=await act(p,by,'manualDecision',{approve:false});assert.equal(r.json.pendingManual,null);assert.ok(r.json.logs.some(x=>x.text.includes('거절')))});
test('invalid manual payloads do not leak hidden cards or mutate health',async()=>{const p=await createPair();let r=await act(p,0,'start');const active=r.json.turn,other=1-active;const hp=r.json.players[other].hp;r=await act(p,active,'manual',{kind:'hp',payload:{player:other,delta:-999999},explanation:'악성 수치 입력 확인'});assert.equal(r.status,200);r=await act(p,other,'manualDecision',{approve:true});assert.equal(r.status,400);const s=await call(`/api/rooms/${p.code}`,{token:p.tokens[other]});assert.equal(s.json.players[other].hp,hp);assert.equal(s.json.players[active].hand,null)});
test('forbidden rooms and persisted state are isolated',async()=>{const p=await createPair();const s=JSON.parse(fs.readFileSync(path.join(temporary,'rooms.json'),'utf8'));assert.ok(s[p.code]);assert.ok(!JSON.stringify(s[p.code].players).includes(p.tokens[0]));assert.equal((await call('/api/rooms/ZZZZZZ',{token:p.tokens[0]})).status,404);const r=await call('/api/rooms',{method:'POST',body:{deckId:'xx',label:'X'}});assert.equal(r.status,400)});
test('AI: random and selected decks, independent three difficulties, private cards',async()=>{
 for(const difficulty of ['easy','medium','hard']){
  const body={deckId:'30',aiDeckId:difficulty==='hard'?'03':'random',difficulty,label:'인간'};
  const a=await call('/api/ai',{method:'POST',body});
  assert.equal(a.status,201,JSON.stringify(a.json));
  const g=a.json.state;
  assert.equal(g.mode,'ai');assert.equal(g.difficulty,difficulty);assert.equal(g.you,0);
  assert.ok(g.players[1].deckId);assert.equal(g.players[1].hand,null);assert.equal(g.players[1].extra,null);
  assert.equal(g.players[1].label.startsWith('AI · '),true);
  const noKey=await call(`/api/rooms/${a.json.code}`);assert.equal(noKey.status,401);
  const badJoin=await call(`/api/rooms/${a.json.code}/join`,{method:'POST',body:{deckId:'01',label:'침입'}});assert.equal(badJoin.status,409);
  const p={code:a.json.code,tokens:[a.json.token,null]};let state=g;
  for(let i=0;i<30&&state.status==='active';i++){
   const t=state.pendingAbility?'abilityResponse':state.pendingSpell?'spellResponse':state.pendingExtraSummon?'extraResponse':state.turn===0?(state.pendingAttack?.stage==='response'?'defend':state.phase==='DRAW'?'draw':state.phase==='MAIN'?'phase':state.phase==='ATTACK'?'phase':'phase'):'defend';
   const actType=t==='phase'&&state.phase==='MAIN'?'phase':t;
   const r=await act(p,0,actType,['abilityResponse','extraResponse','spellResponse'].includes(actType)?{choice:'pass'}:{});assert.equal(r.status,200,JSON.stringify(r.json));state=r.json;
   assert.equal(state.players[1].hand,null);
  }
  assert.ok(state.version>g.version);
 }
});
test('AI rejects unimplemented spell instead of silently consuming the card',async()=>{
 const a=await call('/api/ai',{method:'POST',body:{deckId:'01',aiDeckId:'03',difficulty:'medium'}});assert.equal(a.status,201);
 const p={code:a.json.code,tokens:[a.json.token,null]};let s=a.json.state;
 if(s.turn!==0){for(let i=0;i<60&&s.turn!==0&&s.status==='active';i++){const t=s.pendingAbility?'abilityResponse':s.pendingSpell?'spellResponse':s.pendingExtraSummon?'extraResponse':s.pendingAttack?'defend':s.phase==='DRAW'?'draw':'phase';const r=await act(p,0,t,['abilityResponse','extraResponse','spellResponse'].includes(t)?{choice:'pass'}:{});assert.equal(r.status,200);s=r.json}}
 if(s.status==='active'&&s.turn===0&&s.phase==='DRAW')s=(await act(p,0,'draw')).json;
 const unavailable=s.players[0].hand?.find(u=>u.card.type==='주문'&&!['COC-03-007','COC-03-008','COC-05-002'].includes(u.card.id));
 if(unavailable){const r=await act(p,0,'play',{unitId:unavailable.id});assert.equal(r.status,409);const again=(await call(`/api/rooms/${p.code}`,{token:p.tokens[0]})).json;assert.ok(again.players[0].hand.some(u=>u.id===unavailable.id))}
});
