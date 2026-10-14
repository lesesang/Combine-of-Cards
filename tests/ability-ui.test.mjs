import {batchResponseSpellIds} from '../src/spell-response-targets.mjs';
// DOM interaction contract tests; these do not replace rendered browser QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function ui(){
 const nodes=new Map(),requests=[],listeners={};
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
 const document={querySelector:s=>node(s.slice(1)),querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>({className:'',textContent:'',remove(){}})};
 const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:'#battle'},setTimeout(){},clearTimeout(){},fetch:async(url,options)=>{requests.push({url,body:options.body?JSON.parse(options.body):undefined});return {ok:true,json:async()=>url.includes('evolution-costs')?{choices:[{id:'nature1',card:{name:'자연 카드 1'}},{id:'nature2',card:{name:'자연 카드 2'}}]}:url.includes('hand-preview')?{cards:[{id:'hidden',name:'상대의 숨겨진 카드'}]}:game}},console});
 const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/boot\(\);\s*$/,'');
 vm.runInContext(source,context);
 const unit=(id,cardId,name)=>({id,atk:100,hp:100,card:{id:cardId,name}});
 const sourceUnit=unit('fusion','COC-22-008','블랙 메탈 퓨전 업'),payer=unit('falcon','COC-22-001','블랙 메탈 팔콘');
 const crash=unit('crash','COC-12-013','크래쉬볼티지'),cost=unit('cost','COC-12-001','버릴 카드'),enemy=unit('enemy','COC-12-002','상대 몬스터');
 const game={code:'ABC123',you:0,turn:0,turnNumber:1,phase:'MAIN',status:'active',version:7,graveAbilities:[{sourceUnitId:sourceUnit.id,costUnitId:payer.id}],automation:{fieldAbilityIds:['COC-12-013']},players:[{hand:[cost],grave:[sourceUnit],field:[payer,crash,null],integration:null},{field:[enemy,null,null],hand:null}]};
 game.players[0].hand.push(unit('steal','COC-13-008','카드 뺏기'));game.players[1].handCount=1;
  context.fixture=game;vm.runInContext("state.game=fixture;state.room='ABC123';state.token='token';render=()=>{}",context);
 return {node,requests,listeners,run:code=>vm.runInContext(code,context)};
}
test('grave-effect UI sends the server-provided choice and optimistic version with the explicit attack cost',async()=>{
 const t=ui();t.run('openGraveAbility()');
 assert.match(t.node('modalRoot').innerHTML,/공격 기회 1회/);
 t.node('graveChoice').value='0';await t.node('graveSubmit').onclick();
 assert.deepEqual(t.requests,[{url:'/api/rooms/ABC123/actions',body:{type:'graveAbility',expectedVersion:7,sourceUnitId:'fusion',costUnitId:'falcon'}}]);
});

test('Storm UI: only current responder sees counters and sends the selected source with version',async()=>{
 const t=ui();
 t.run("state.game.pendingSpell={who:1,awaiting:0,card:{name:'회복'},counters:[{sourceUnitId:'storm',name:'스톰블레이거 드래곤'}]}");
 const html=t.run('battlePending(state.game)');
 assert.match(html,/data-spell-counter="storm"/);assert.match(html,/게임당 1회/);
 await t.listeners.click({target:{closest:()=>({id:'',dataset:{spellCounter:'storm'}})}});
 assert.deepEqual(t.requests,[{url:'/api/rooms/ABC123/actions',body:{type:'spellResponse',expectedVersion:7,choice:'counter',sourceUnitId:'storm'}}]);
 t.run('state.game.pendingSpell.awaiting=1');
 assert.doesNotMatch(t.run('battlePending(state.game)'),/data-spell-counter=|id="spellPass"/);
 t.run("state.game.pendingSpell={who:0,awaiting:0,card:{name:'회복'},counter:{name:'스톰블레이거 드래곤'},counters:[]}");
 assert.match(t.run('battlePending(state.game)'),/id="spellPass"/);
 await t.listeners.click({target:{closest:()=>({id:'spellPass',dataset:{}})}});
 assert.equal(t.requests[1].body.choice,'pass');
});

test('BLOCK UI: requires a selected other hand card and submits its UID with the version',async()=>{
 const t=ui();
 t.run("state.game.players[0].hand.push({id:'block',card:{id:'COC-31-009',name:'BLOCK'}})");
 t.run('openPlay()');t.node('playPick').value='block';await t.node('playPick').onchange();
 assert.equal(t.node('playCostWrap').style.display,'');
 assert.match(t.node('playCostCard').innerHTML,/value="cost"/);
 assert.doesNotMatch(t.node('playCostCard').innerHTML,/value="block"/);
 await t.node('playSubmit').onclick();assert.equal(t.requests.length,0);
 t.node('playCostCard').value='cost';await t.node('playSubmit').onclick();
 assert.equal(t.requests[0].body.unitId,'block');
 assert.equal(t.requests[0].body.costCardId,'cost');
 assert.equal(t.requests[0].body.expectedVersion,7);
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
 t.node('stealPreviewPick').value='hidden'; // Simulate user choosing the revealed card in the test DOM.
 assert.equal(t.node('stealPreviewPick').value,'hidden');
 await t.node('playSubmit').onclick();
 const played=t.requests.filter(x=>x.body?.type==='play');
 assert.equal(played.length,1);
 assert.equal(played[0].body.unitId,'steal');
 assert.deepEqual(played[0].body.target,{type:'unit',id:'hidden'});
 assert.equal(t.requests.filter(x=>x.url.endsWith('/hand-preview')).length,1);
});

test('batch UI: all 23 spell IDs use the chosen target and optimistic version',async()=>{
 for(const cardId of batchResponseSpellIds){
  const t=ui();t.run(`state.game.players[0].hand.push({id:'batch',card:{id:'${cardId}',name:'주문'}})`);
  t.run('openPlay()');t.node('playPick').value='batch';await t.node('playPick').onchange();
  t.node('spellTarget').value='enemy';await t.node('playSubmit').onclick();
  assert.equal(t.requests[0].body.unitId,'batch',cardId);
  assert.deepEqual(t.requests[0].body.target,{type:'unit',id:'enemy'},cardId);
  assert.equal(t.requests[0].body.expectedVersion,7,cardId);
 }
});


test('choice UI: both modes require a choice and submit it with targets and version',async()=>{
 for(const cardId of ['COC-14-009','COC-23-009'])for(const option of [1,2]){
  const t=ui();t.run(`state.game.players[0].hand.push({id:'choice',card:{id:'${cardId}',name:'선택 주문'}})`);
  t.run('openPlay()');t.node('playPick').value='choice';await t.node('playPick').onchange();
  assert.equal(t.node('playOptionWrap').style.display,'');
  await t.node('playSubmit').onclick();assert.equal(t.requests.length,0);
  t.node('playOption').value=String(option);t.node('spellTarget').value='enemy';
  await t.node('playSubmit').onclick();assert.equal(t.requests[0].body.option,option);
  assert.deepEqual(t.requests[0].body.target,{type:'unit',id:'enemy'});assert.equal(t.requests[0].body.expectedVersion,7);
 }
});
test('choice UI: two distinct selected monster UIDs are submitted together',async()=>{
 const t=ui();t.run("state.game.players[0].hand.push({id:'arrows',card:{id:'COC-05-006',name:'카툰 우드 에로우즈'}})");
 t.run('openPlay()');t.node('playPick').value='arrows';await t.node('playPick').onchange();
 t.node('spellTarget').value='enemy';t.node('spellTarget2').value='falcon';await t.node('playSubmit').onclick();
 assert.deepEqual(t.requests[0].body.targets,['enemy','falcon']);assert.equal(t.requests[0].body.expectedVersion,7);
});


test('evolution UI: privately loads nature costs and requires two distinct UIDs',async()=>{
 const t=ui();t.run("state.game.players[0].hand.push({id:'evolve',card:{id:'COC-30-009',name:'숲속의 맹약'}})");
 t.run('openPlay()');t.node('playPick').value='evolve';await t.node('playPick').onchange();
 assert.match(t.requests[0].url,/evolution-costs\?unitId=evolve$/);
 assert.match(t.node('evolutionCost1').innerHTML,/자연 카드 1/);
 t.node('evolutionCost1').value='nature1';t.node('evolutionCost2').value='nature1';await t.node('playSubmit').onclick();
 assert.equal(t.requests.filter(r=>r.body?.type==='play').length,0);
 t.node('evolutionCost2').value='nature2';await t.node('playSubmit').onclick();
 const req=t.requests.find(r=>r.body?.type==='play');assert.deepEqual(req.body.costDeckIds,['nature1','nature2']);assert.equal(req.body.expectedVersion,7);
});
test('search UI: only the owner selects a deck card and other play controls are locked',async()=>{
 const t=ui();t.run("state.game.pendingDeckSearch={who:0,cardId:'COC-24-008',choices:[{id:'chosen',card:{name:'검색 카드'}}]}");
 assert.match(t.run('battlePending(state.game)'),/검색 카드/);assert.equal(t.run('battleControls(state.game)'),'');
 t.node('deckSearchChoice').value='chosen';await t.listeners.click({target:{closest:()=>({id:'deckSearchSubmit',dataset:{}})}});
 assert.deepEqual(t.requests[0].body,{type:'deckSearch',unitId:'chosen',expectedVersion:7});
 t.run('state.game.pendingDeckSearch={who:1,cardId:"COC-24-008"}');
 assert.doesNotMatch(t.run('battlePending(state.game)'),/deckSearchChoice|deckSearchSubmit|검색 카드/);
});

test('summon UI: only the responder counters and the summoner acknowledges without exposing extra UIDs',async()=>{
 const t=ui();t.run("state.game.pendingExtraSummon={who:1,awaiting:0,card:{name:'퓨전'},materialCount:2,counters:[{sourceUnitId:'storm',name:'스톰블레이거 드래곤'}]}");
 assert.match(t.run('battlePending(state.game)'),/data-extra-counter="storm"/);assert.match(t.run('battlePending(state.game)'),/주문\/소환 합계 게임당 1회/);
 await t.listeners.click({target:{closest:()=>({dataset:{extraCounter:'storm'}})}});
 assert.deepEqual(t.requests[0].body,{type:'extraResponse',choice:'counter',sourceUnitId:'storm',expectedVersion:7});
 t.run('state.game.pendingExtraSummon.awaiting=1');assert.doesNotMatch(t.run('battlePending(state.game)'),/data-extra-counter=|id="extraPass"/);
 t.run("state.game.pendingExtraSummon={who:0,awaiting:0,card:{name:'퓨전'},materialCount:2,counter:{name:'스톰블레이거 드래곤'},counters:[]}");
 assert.match(t.run('battlePending(state.game)'),/무효화 대응 없음/);
 await t.listeners.click({target:{closest:()=>({id:'extraPass',dataset:{}})}});
 assert.deepEqual(t.requests[1].body,{type:'extraResponse',choice:'pass',expectedVersion:7});
});

test('field counter UI: uses the card-specific reset label and submits Wind Girl against a counter',async()=>{
 const t=ui();t.run("state.game.pendingSpell={who:0,awaiting:0,card:{name:'회복'},counter:{name:'블래스트 보이'},counters:[{sourceUnitId:'wind',name:'라이징 윈드 걸',limitText:'재소환 전 1회'}]}");
 const html=t.run('battlePending(state.game)');assert.match(html,/재소환 전 1회/);assert.doesNotMatch(html,/게임당 1회 사용|다른 대응 카드는 미지원/);
 await t.listeners.click({target:{closest:()=>({dataset:{spellCounter:'wind'}})}});
 assert.deepEqual(t.requests[0].body,{type:'spellResponse',choice:'counter',sourceUnitId:'wind',expectedVersion:7});
});

test('field response UI: monster-only counter and pass use the current responder and version',async()=>{
 const t=ui();t.run("state.game.pendingAbility={who:1,awaiting:0,card:{name:'크래쉬볼티지'},counters:[{sourceUnitId:'wind',name:'라이징 윈드 걸',limitText:'재소환 전 1회'}]}");
 assert.equal(t.run('battleControls(state.game)'),'');const html=t.run('battlePending(state.game)');assert.match(html,/상대 몬스터 효과/);assert.match(html,/data-ability-counter="wind"/);assert.match(html,/재소환 전 1회/);
 await t.listeners.click({target:{closest:()=>({id:'',dataset:{abilityCounter:'wind'}})}});
 assert.deepEqual(t.requests[0].body,{type:'abilityResponse',expectedVersion:7,choice:'counter',sourceUnitId:'wind'});
 t.run('state.game.pendingAbility.awaiting=1');assert.doesNotMatch(t.run('battlePending(state.game)'),/data-ability-counter|id="abilityPass"/);
 t.run('state.game.pendingAbility.awaiting=0;state.game.pendingAbility.counters=[]');await t.listeners.click({target:{closest:()=>({id:'abilityPass',dataset:{}})}});assert.deepEqual(t.requests[1].body,{type:'abilityResponse',expectedVersion:7,choice:'pass'});
});

test('elemental UI: opponent-turn activation private selection and cost-trigger ordering use server choices',async()=>{
 const t=ui();t.run("state.game.turn=1;state.game.elementalAbilities=['falcon']");
 assert.match(t.run('elementalControls(state.game)'),/data-elemental-source="falcon"/);
 await t.listeners.click({target:{closest:()=>({dataset:{elementalSource:'falcon'}})}});
 assert.deepEqual(t.requests[0].body,{type:'ability',sourceUnitId:'falcon',expectedVersion:7});
 t.run("state.game.pendingElementalChoice={who:0,choices:[{id:'chosen',zone:'deck',card:{name:'원소의 마법사'}}]}");
 assert.match(t.run('battlePending(state.game)'),/chosen/);assert.equal(t.run('battleControls(state.game)'),'');
 t.node('elementalChoice').value='chosen';await t.listeners.click({target:{closest:()=>({id:'elementalSubmit',dataset:{}})}});
 assert.deepEqual(t.requests[1].body,{type:'elementalChoice',unitId:'chosen',expectedVersion:7});
 t.run('state.game.pendingElementalChoice={who:1}');assert.doesNotMatch(t.run('battlePending(state.game)'),/chosen|elementalSubmit/);
 t.run("state.game.pendingElementalChoice=null;state.game.pendingAbility={stage:'cost-triggers'};state.game.pendingTriggerOrder={awaiting:0,options:[{key:'a',title:'회복',priority:0}]}");
 assert.match(t.run('battlePending(state.game)'),/triggerOrderSubmit/);assert.doesNotMatch(t.run('battlePending(state.game)'),/abilityPass/);
});
