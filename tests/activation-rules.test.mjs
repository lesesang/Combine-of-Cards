import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {planActivation,commitActivationCosts,PRECHECKED_ACTIVATION_IDS} from '../src/activation-rules.mjs';
const catalog=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(new URL('../public/data/catalog.json.gz.b64',import.meta.url),'utf8').trim(),'base64')));
const cards=new Map(catalog.cards.map(c=>[c.id,c]));
const room=()=>({units:{},players:[0,1].map(()=>({deck:[],hand:[],field:[null,null,null],integration:null,hp:1000,roundPlays:0} ))});
function put(r,who,id,zone){const uid=`U${Object.keys(r.units).length+1}`;r.units[uid]={cardId:id,owner:who};const p=r.players[who];if(zone==='field')p.field[p.field.indexOf(null)]=uid;else if(zone==='integration')p.integration=uid;else p[zone].push(uid);return uid;}
const check=(r,who,id,body)=>planActivation({room:r,who,unitId:id,cards,body});
test('every preflight handler refers to a real card ID',()=>{assert.ok(PRECHECKED_ACTIVATION_IDS.length>=60);for(const id of PRECHECKED_ACTIVATION_IDS)assert.ok(cards.has(id),id)});
test('universe cannot be summoned without exactly two own field monsters',()=>{
 const r=room(),spell=put(r,0,'COC-12-010','hand'),a=put(r,0,'COC-12-001','field'),b=put(r,0,'COC-12-002','field');
 assert.throws(()=>check(r,0,spell),/2장/);
 assert.throws(()=>check(r,0,spell,{costUnitIds:[a,a]}),/2장/);
 const plan=check(r,0,spell,{costUnitIds:[a,b]});assert.equal(plan.costs.length,2);
 const moved=[];commitActivationCosts(r,plan,{move:(_,id,to)=>moved.push({id,to}),destroy:()=>{throw Error('unexpected')}});
 assert.deepEqual(moved,[{id:a,to:'grave'},{id:b,to:'grave'}]);
});
test('gandrade dragon discards all remaining hand except itself',()=>{
 const r=room(),id=put(r,0,'COC-27-004','hand'),a=put(r,0,'COC-27-001','hand'),b=put(r,0,'COC-27-003','hand');
 assert.deepEqual(check(r,0,id).costs.map(c=>c.unitId),[a,b]);
 assert.ok(!check(r,0,id).costs.some(c=>c.unitId===id));
});
test('Kaido conditions and integration requirements protect against invalid summons',()=>{
 const r=room(),id=put(r,0,'COC-13-002','hand');assert.throws(()=>check(r,0,id),/상대 필드/);
 put(r,1,'COC-03-005','field');assert.equal(check(r,0,id).verified,true);
 const ride=put(r,0,'COC-23-003','hand');assert.throws(()=>check(r,0,ride),/라이드 위저드/);
 put(r,0,'COC-23-001','integration');assert.equal(check(r,0,ride).verified,true);
});
test('field elemental spells cannot activate with a wrong wizard',()=>{
 const r=room(),spell=put(r,0,'COC-32-008','hand');put(r,0,'COC-32-001','field');assert.throws(()=>check(r,0,spell),/랜드/);
 put(r,0,'COC-32-004','field');assert.equal(check(r,0,spell).verified,true);
});
test('low-health and first-action conditions use current pre-play state',()=>{
 const r=room(),burning=put(r,0,'COC-20-003','hand'),first=put(r,0,'COC-05-005','hand');
 assert.throws(()=>check(r,0,burning),/600/);r.players[0].hp=600;assert.equal(check(r,0,burning).verified,true);
 assert.equal(check(r,0,first).verified,true);r.players[0].roundPlays=1;assert.throws(()=>check(r,0,first),/처음/);
});
test('Storm Knight requires one or two valid banishment materials and a target for two',()=>{
 const r=room(),knight=put(r,0,'COC-14-004','hand'),a=put(r,0,'COC-14-008','field'),b=put(r,0,'COC-14-009','field');
 assert.throws(()=>check(r,0,knight),/1~2장/);
 assert.equal(check(r,0,knight,{costUnitIds:[a]}).costs[0].to,'banished');
 assert.throws(()=>check(r,0,knight,{costUnitIds:[a,b]}),/절반/);
 assert.throws(()=>check(r,0,knight,{costUnitIds:[a,b],target:{type:'unit',id:a}}),/절반/);
 const foe=put(r,1,'COC-03-005','field');assert.equal(check(r,0,knight,{costUnitIds:[a,b],target:{type:'unit',id:foe}}).costs.length,2);
});
test('Pharaoh general requires a mummy soldier token as a material',()=>{
 const r=room(),general=put(r,0,'COC-17-008','hand'),other=put(r,0,'COC-17-002','field');
 assert.throws(()=>check(r,0,general,{costUnitIds:[other]}),/미라 병사/);
 const mummy=put(r,0,'COC-17-004','field');r.units[mummy].tokenCard={name:'미라 병사'};
 // A real token's unit cardId is TOKEN:... and is resolved using tokenCard.
 r.units[mummy].cardId='TOKEN:미라 병사';
 assert.equal(check(r,0,general,{costUnitIds:[mummy]}).costs[0].to,'grave');
});
test('rich envy rejects sacrifice below combined 200 and absent enemy target',()=>{
 const r=room(),spell=put(r,0,'COC-21-004','hand'),own=put(r,0,'COC-21-009','field');
 r.units[own].atk=100;r.units[own].hp=99;
 const foe=put(r,1,'COC-03-005','field');
 assert.throws(()=>check(r,0,spell,{costUnitIds:[own],target:{type:'unit',id:foe}}),/200/);
 r.units[own].hp=100;assert.equal(check(r,0,spell,{costUnitIds:[own],target:{type:'unit',id:foe}}).costs.length,1);
});