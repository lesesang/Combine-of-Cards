import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coc-effect-registration-'));
process.env.DATA_DIR=dir;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const tokens=['a'.repeat(64),'b'.repeat(64)];
const room={code:'REG123',status:'active',version:1,turn:0,turnNumber:3,phase:'MAIN',
  mode:'pvp',players:[],units:{},logs:[],effects:[]};
I.createPlayer(room,'07','Caster',tokens[0]);
I.createPlayer(room,'03','Opponent',tokens[1]);
room.players.forEach(p=>p.turnsTaken=2);
const source=room.players[0].deck.find(id=>room.units[id].cardId==='COC-07-003');
I.move(room,source,'hand',0);
const storage=path.join(dir,'rooms.json');
fs.writeFileSync(storage,JSON.stringify({REG123:room}));
let server,base;
async function start(tag){
  const {createApp}=await import(`../server.mjs?registration=${tag}`);
  server=createApp();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  base=`http://127.0.0.1:${server.address().port}`;
}
async function call(who,body){
  const response=await fetch(base+'/api/rooms/REG123'+(body?'/actions':''),{
    method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[who],
      'content-type':'application/json'},body
  });
  return {status:response.status,state:await response.json()};
}
test.after(async()=>{
  if(server?.listening)await new Promise(ok=>server.close(ok));
  fs.rmSync(dir,{recursive:true,force:true});
});

test('R01 HTTP: rejected non-finite spell data preserves cost, version and disk; valid retry restores once',async()=>{
  await start('initial');
  const before=(await call(0)).state;
  const persistedBefore=JSON.parse(fs.readFileSync(storage,'utf8'));
  // Valid JSON syntax can still exceed JavaScript's finite numeric range.
  const rejected=await call(0,`{"type":"play","unitId":"${source}","expectedVersion":1,"extra":1e309}`);
  assert.equal(rejected.status,500);
  assert.match(rejected.state.details,/JSON/);
  assert.deepEqual((await call(0)).state,before);
  assert.deepEqual(JSON.parse(fs.readFileSync(storage,'utf8')),persistedBefore);
  const declared=await call(0,JSON.stringify({type:'play',unitId:source,expectedVersion:1}));
  assert.equal(declared.status,200);
  assert.ok(declared.state.pendingSpell);
  assert.equal(declared.state.version,2);
  assert.equal((await call(1)).state.players[0].hand,null);
  await new Promise(ok=>server.close(ok));
  await start('restored');
  assert.deepEqual((await call(0)).state,declared.state);
  const resolved=await call(1,JSON.stringify({type:'spellResponse',choice:'pass',expectedVersion:2}));
  assert.equal(resolved.status,200);
  assert.equal(resolved.state.pendingSpell,null);
  assert.equal(resolved.state.players[1].hand.length,1);
  assert.equal(resolved.state.players[1].grave.length,3);
  assert.equal((await call(1,JSON.stringify({type:'spellResponse',choice:'pass',expectedVersion:2}))).status,409);
  assert.deepEqual((await call(1)).state,resolved.state);
});
