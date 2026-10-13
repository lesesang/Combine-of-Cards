// DOM interaction contract tests; these do not replace rendered browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function ui(){
 const nodes=new Map(),requests=[];
 const node=id=>{
  if(!nodes.has(id)){
   let html='';
   nodes.set(id,{value:'',textContent:'',style:{display:''},classList:{toggle(){},remove(){}},append(){},remove(){},
    get innerHTML(){return html},set innerHTML(value){html=value;
     for(const match of value.matchAll(/id="([^"]+)"/g))node(match[1]);
     for(const match of value.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))node(match[1]).value=match[2].match(/<option value="([^"]*)"/)?.[1]||'';
    }});
  }
  return nodes.get(id);
 };
 const document={querySelector:s=>node(s.slice(1)),querySelectorAll:()=>[],addEventListener(){},createElement:()=>({className:'',textContent:'',remove(){}})};
 const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:'#battle'},setTimeout(){},clearTimeout(){},fetch:async(url,options)=>{requests.push({url,body:options.body?JSON.parse(options.body):undefined});return {ok:true,json:async()=>url.includes('hand-preview')?{cards:[{id:'hidden',name:'상대의 숨겨진 카드'}]}:game}},console});
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/boot\(\);\s*$/,'');
 vm.runInContext(source,context);
 const unit=(id,cardId,name)=>({id,atk:100,hp:100,card:{id:cardId,name}});
 const sourceUnit=unit('fusion','COC-22-008','블랙 메탈 퓨전 업'),payer=unit('falcon','COC-22-001','블랙 메탈 팔콘');
 const crash=unit('crash','COC-12-013','크래쉬볼티지'),cost=unit('cost','COC-12-001','버릴 카드'),enemy=unit('enemy','COC-12-002','상대 몬스터');
 const game={code:'ABC123',you:0,turn:0,turnNumber:1,phase:'MAIN',status:'active',version:7,graveAbilities:[{sourceUnitId:sourceUnit.id,costUnitId:payer.id}],automation:{fieldAbilityIds:['COC-12-013']},players:[{hand:[cost],grave:[sourceUnit],field:[payer,crash,null],integration:null},{field:[enemy,null,null],hand:null}]};
 game.players[0].hand.push(unit('steal','COC-13-008','카드 뺏기'));game.players[1].handCount=1;
  context.fixture=game;vm.runInContext("state.game=fixture;state.room='ABC123';state.token='token';render=()=>{}",context);
 return {node,requests,run:code=>vm.runInContext(code,context)};
}
test('grave-effect UI sends the server-provided choice and optimistic version with the explicit attack cost',async()=>{
 const t=ui();t.run('openGraveAbility()');
 assert.match(t.node('modalRoot').innerHTML,/공격 기회 1회/);
 t.node('graveChoice').value='0';await t.node('graveSubmit').onclick();
 assert.deepEqual(t.requests,[{url:'/api/rooms/ABC123/actions',body:{type:'graveAbility',expectedVersion:7,sourceUnitId:'fusion',costUnitId:'falcon'}}]);
});
test('Crash Voltage UI labels a discard cost and submits the selected hand card and enemy target',async()=>{
 const t=ui();t.run('openFieldAbility()');
 assert.equal(t.node('abilityCostLabel').textContent,'비용으로 묘지에 버릴 손패 1장');
 t.node('abilityCostCard').value='cost';t.node('abilityTarget').value='enemy';
 await t.node('abilitySubmit').onclick();
 assert.deepEqual(t.requests,[{url:'/api/rooms/ABC123/actions',body:{type:'ability',expectedVersion:7,sourceUnitId:'crash',target:{type:'unit',id:'enemy'},costCardId:'cost'}}]);
});

test('card steal UI privately previews the opponent full hand, then submits a chosen UID',async()=>{
 const t=ui();t.run('openPlay()');
 t.node('playPick').value='steal';
 await t.node('playPick').onchange();
 assert.equal(t.node('stealPreviewWrap').style.display,'');
 assert.match(t.node('stealPreviewPick').innerHTML,/상대의 숨겨진 카드/);
 assert.equal(t.node('stealPreviewPick').value,'hidden');
 await t.node('playSubmit').onclick();
 const played=t.requests.filter(x=>x.body?.type==='play');
 assert.equal(played.length,1);
 assert.equal(played[0].body.unitId,'steal');
 assert.deepEqual(played[0].body.target,{type:'unit',id:'hidden'});
 assert.equal(t.requests.filter(x=>x.url.endsWith('/hand-preview')).length,1);
});
