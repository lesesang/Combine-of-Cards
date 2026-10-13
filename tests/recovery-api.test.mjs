import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coc-recovery-api-'));
process.env.DATA_DIR=temporary;process.env.NODE_ENV='test';
const {gameTestInternals:I}=await import('../server.mjs');
const tokens=['a'.repeat(64),'b'.repeat(64)];
const room={code:'REC123',players:[],units:{},logs:[],effects:[],turn:0,turnNumber:3,phase:'MAIN',status:'active',version:1};
I.createPlayer(room,'22','A',tokens[0]);I.createPlayer(room,'22','B',tokens[1]);
for(const p of room.players)p.turnsTaken=1;
const pick=(cardId,zone)=>{const id=room.players[0].deck.find(id=>room.units[id].cardId===cardId);I.move(room,id,zone,0);return id};
const sourceUnitId=pick('COC-22-008','grave'),costUnitId=pick('COC-22-001','field');
fs.writeFileSync(path.join(temporary,'rooms.json'),JSON.stringify({REC123:room}));
let server,base;
async function start(tag){const {createApp}=await import(`../server.mjs?api=${tag}`);server=createApp();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base=`http://127.0.0.1:${server.address().port}`}
async function stop(){await new Promise(ok=>server.close(ok))}
async function call(body,who=0){const response=await fetch(base+'/api/rooms/REC123'+(body?'/actions':''),{method:body?'POST':'GET',headers:{authorization:`Bearer ${tokens[who]}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,state:await response.json()}}
test.after(async()=>{if(server?.listening)await stop();fs.rmSync(temporary,{recursive:true,force:true})});
test('HTTP recovery validates identity/version, rolls back invalid cost and persists usage across restart',async()=>{
 await start('initial');
 const before=(await call()).state;
 assert.deepEqual(before.graveAbilities,[{sourceUnitId,costUnitId}]);
 assert.deepEqual((await call(undefined,1)).state.graveAbilities,[]);
 const action={type:'graveAbility',sourceUnitId,costUnitId,expectedVersion:1};
 assert.equal((await call(action,1)).status,403);
 assert.equal((await call({...action,costUnitId:'missing'})).status,409);
 assert.deepEqual((await call()).state,before);
 const success=await call(action);assert.equal(success.status,200);
 assert.equal(success.state.version,2);
 assert.ok(success.state.players[0].hand.some(u=>u.id===sourceUnitId));
 assert.equal((await call(action)).status,409,'same expectedVersion cannot spend twice');
 const opponent=(await call(undefined,1)).state;
 assert.equal(opponent.players[0].hand,null);
 assert.ok(!JSON.stringify(opponent).includes(sourceUnitId),'recovered hand UID is not exposed in options or logs');
 await stop();await start('restored');
 assert.deepEqual((await call()).state,success.state);
 const persisted=JSON.parse(fs.readFileSync(path.join(temporary,'rooms.json'),'utf8')).REC123;
 assert.equal(persisted.players[0].effectUsage['COC-22-008:2'],3);
 assert.equal(persisted.units[costUnitId].attackCount,1);
});
