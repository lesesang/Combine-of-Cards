import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-counter-api-'));
process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const tokens=['a'.repeat(64),'b'.repeat(64)];
const r={code:'COUNT1',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',mode:'pvp',players:[],units:{},logs:[],effects:[]};
I.createPlayer(r,'30','Caster',tokens[0]);I.createPlayer(r,'14','Counter',tokens[1]);
r.players.forEach(p=>p.turnsTaken=2);r.players[0].hp=200;
const spell=r.players[0].deck.find(id=>r.units[id].cardId==='COC-30-007');
const source=r.players[1].deck.find(id=>r.units[id].cardId==='COC-14-001');
I.move(r,spell,'hand',0);I.move(r,source,'integration',1);
const storage=path.join(dir,'rooms.json');fs.writeFileSync(storage,JSON.stringify({COUNT1:r}));
let server,base;
async function start(tag){
 const {createApp}=await import(`../server.mjs?counter=${tag}`);
 server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 base=`http://127.0.0.1:${server.address().port}`;
}
async function call(who,body){
 const response=await fetch(base+'/api/rooms/COUNT1'+(body?'/actions':''),{
  method:body?'POST':'GET',headers:{authorization:'Bearer '+(tokens[who]||'invalid'),'content-type':'application/json'},
  body:body?JSON.stringify(body):undefined});
 return {status:response.status,state:await response.json()};
}
test.after(async()=>{if(server?.listening)await new Promise(ok=>server.close(ok));fs.rmSync(dir,{recursive:true,force:true});});

test('Storm HTTP: identity/version rejection and restart preserve the pending counter and spent limit',async()=>{
 await start('before');
 assert.equal((await call(0,{type:'play',unitId:spell,expectedVersion:1})).status,200);
 const choice={type:'spellResponse',choice:'counter',sourceUnitId:source,expectedVersion:2};
 const before=fs.readFileSync(storage,'utf8');
 assert.equal((await call(2,choice)).status,401);
 assert.equal((await call(0,choice)).status,403);
 assert.equal((await call(1,{...choice,expectedVersion:1})).status,409);
 assert.equal((await call(1,{...choice,sourceUnitId:spell})).status,409);
 assert.equal(fs.readFileSync(storage,'utf8'),before);
 const declared=await call(1,choice);assert.equal(declared.status,200);
 assert.equal(declared.state.pendingSpell.awaiting,0);
 assert.equal(declared.state.players[0].hand,null);
 assert.equal(declared.state.players[0].extra,null);
 assert.equal(declared.state.effectStack,undefined);
 await new Promise(ok=>server.close(ok));await start('after');
 assert.deepEqual((await call(1)).state,declared.state);
 assert.equal((await call(1,{...choice,expectedVersion:3})).status,403);
 const resolved=await call(0,{type:'spellResponse',choice:'pass',expectedVersion:3});
 assert.equal(resolved.status,200);assert.equal(resolved.state.pendingSpell,null);
 assert.equal(resolved.state.players[0].hp,200);
 assert.ok(resolved.state.players[0].grave.some(u=>u.id===spell));
 assert.equal(resolved.state.players[1].integration.spellCounterGameUsed,true);
 assert.equal((await call(0,{type:'spellResponse',choice:'pass',expectedVersion:3})).status,409);
 await new Promise(ok=>server.close(ok));await start('resolved');
 assert.deepEqual((await call(0)).state,resolved.state);
});
