import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_RECIPES, SUPPORTED_EXTRA_IDS, validateExtraSummon } from '../src/extra-summons.mjs';

const cards=new Map([
 ['COC-12-001',{id:'COC-12-001',type:'몬스터',name:'F=HERO 블래스트 보이',attribute:'영웅'}],
 ['COC-12-002',{id:'COC-12-002',type:'몬스터',name:'F=HERO 라이징 윈드 걸',attribute:'영웅'}],
 ['COC-12-009',{id:'COC-12-009',type:'일체화',name:'용기의 패왕',attribute:'영웅'}]
]);
function room(){
 return {players:[{extra:['extra'],hand:['a'],field:['b',null,null],integration:null}],units:{
 extra:{cardId:'COC-12-011'},a:{cardId:'COC-12-001'},b:{cardId:'COC-12-002'},hero:{cardId:'COC-12-009'}
 }};
}
test('twenty-one distinct v1.3 extra recipes exist',()=>{
 assert.equal(SUPPORTED_EXTRA_IDS.length,21);
 assert.equal(Object.keys(EXTRA_RECIPES).length,21);
});
test('hero fusion requires declared integration and two distinct materials',()=>{
 const r=room();
 const args={room:r,who:0,extraUnitId:'extra',materials:['a','b'],cards};
 assert.throws(()=>validateExtraSummon(args),/용기의 패왕/);
 r.players[0].integration='hero';
 assert.equal(validateExtraSummon(args).method,'hero');
 assert.throws(()=>validateExtraSummon({...args,materials:['a','a']}),/소재/);
});
