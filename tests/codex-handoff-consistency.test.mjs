import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spellHandlerIds} from '../src/automated-effects.mjs';
import {responseSpellIds} from '../src/spell-response-registry.mjs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const audit=JSON.parse(read('docs/automation-audit.json'));
const handoff=read('docs/CODEX_HANDOFF.md');
const rules=read('docs/CODEX_RULES_REFERENCE.md');
const plan=read('docs/CODEX_IMPLEMENTATION_PLAN.md');
const readme=read('README.md');
const agents=read('AGENTS.md');
const legacy=read('docs/START_HERE_NEW_CHAT.md');

test('Codex handoff files are discoverable from AGENTS and README and map to real documents',()=>{
 for(const path of ['docs/CODEX_HANDOFF.md','docs/CODEX_RULES_REFERENCE.md','docs/CODEX_IMPLEMENTATION_PLAN.md']){
  assert.ok(fs.existsSync(new URL(path,root)),path);
  assert.ok(agents.includes(path),`AGENTS must reference ${path}`);
  assert.ok(readme.includes(path.replace('docs/','docs/')),`README must reference ${path}`);
  assert.ok(handoff.includes(path.split('/').at(-1)),'handoff should crosslink '+path);
 }
 assert.ok(legacy.includes('CODEX_HANDOFF.md'),'legacy handoff should direct Codex to current entrypoint');
 assert.ok(plan.includes('#21')&&plan.includes('#29'),'plan must track issues #21 through #29');
});

test('Codex current automation statistics match generated code-derived audit',()=>{
 assert.equal(audit.automatedSpellHandlerCount,spellHandlerIds.length);
 const {partial,manual,basic}=audit.counts;
 assert.equal(partial+manual+basic,audit.cards.length);
 assert.match(readme,new RegExp(`부분 지원 ${partial} / 수동·미지원 ${manual} / 기본 카드 ${basic}`));
 for(const doc of [handoff,rules,plan,agents]){
  assert.ok(doc.includes(String(partial)), 'current partial count missing from current Codex documentation');
  assert.ok(doc.includes(String(manual)), 'current unsupported count missing from current Codex documentation');
 }
 assert.ok(handoff.includes(`핸들러 ${spellHandlerIds.length}개`));
 assert.ok(readme.includes('완전 자동화 인증 카드'));
 assert.ok(readme.includes('**0개**'));
});

test('Codex rules preserve latest Sword timing, non-equipment behavior, and stackable next-turn doubles',()=>{
 for(const doc of [handoff,rules,readme,agents]){
  assert.ok(doc.includes('COC-21-002'), 'missing canonical Sword ID');
  assert.ok(doc.includes('ATTACK'), 'Sword payment must be tied to ATTACK phase');
  assert.ok(doc.includes('30'), 'Sword must require payment of 30 HP');
  assert.ok(doc.includes('100'), 'Sword must grant +100 ATK');
  assert.ok(doc.includes('×2')||doc.includes('x2'), 'Sword next-own-turn double must be visible');
 }
 assert.match(rules,/자의로 해제 불가|자의적 장착 해제|자의로 해제/);
 assert.match(rules,/×4/);
 assert.match(rules,/×8/);
 assert.match(rules,/×16/);
 assert.match(readme,/자기 ATTACK 페이즈 시작/);
 assert.ok(handoff.includes('원본 카드는 묘지')||handoff.includes('원본 카드는 묘지로'));
});

test('Codex references keep approved RIDs separate from 13 outstanding engineering tasks',()=>{
 const ids=['R05','R06','R07','R08','R09','R10','R11','R12','R13','R21','R22','R23','R24','R25','R28','R29','R30'];
 for(const id of ids)assert.ok(rules.includes(id),id+' must remain confirmed');
 for(const id of ['R01','R02','R03','R04','R14','R15','R16','R17','R18','R19','R20','R26','R27'])
  assert.ok(rules.includes(id),id+' must remain tracked for engineering');
 assert.ok(handoff.includes('R05/R06/R07'));
 assert.ok(plan.includes('576'),'full directed 24x24 match testing must be tracked');
});

test('current response-window counts include the Sword and match the shared runtime registry',()=>{
 const count=responseSpellIds.length;
 assert.ok(responseSpellIds.includes('COC-21-002'),'the Sword response window must not disappear from coverage');
 assert.equal(audit.responseSpellCount,count);
 assert.deepEqual(audit.responseSpellIds,[...responseSpellIds]);
 const summaries=[
  [readme,/스택 연결 주문 \| \*\*(\d+)종/],
  [handoff,/공통 체인에 통합된 주문은 \*\*(\d+)종/],
  [plan,/pass·스택에 연결된 \*\*(\d+)종/],
  [agents,/(\d+) spells in opponent-pass effect stack/],
  [legacy,/주문 응답 스택 \*\*(\d+)종/],
  [read('docs/ARCHITECTURE_AND_RUNBOOK.md'),/(\d+) 일반 주문 응답 스택/],
  [read('docs/OPEN_RULINGS_REGISTER.md'),/실제 주문 응답 스택 (\d+)종/],
  [read('docs/ROADMAP_AND_ACCEPTANCE.md'),/자동 주문 (\d+)종 pass→LIFO/]
 ];
 for(const [doc,pattern] of summaries)assert.equal(Number(doc.match(pattern)?.[1]),count,String(pattern));
});

test('effect evidence preserves confirmed R28 and R29 while keeping automation partial',()=>{
 const evidence=JSON.parse(read('docs/effect-coverage.json'));
 for(const [cardId,effectNumber,testName] of [
  ['COC-12-013',2,'R28: piercing uses the dice result, not attack stat or unrelated bonus damage'],
  ['COC-22-008',2,'R29: frozen, forbidden and zero-ATK units still have a spendable attack opportunity']
 ]){
  const effect=evidence.find(e=>e.cardId===cardId&&e.effectNumber===effectNumber);
  assert.equal(effect.status,'partial');
  assert.ok(effect.tests.some(t=>t.path==='tests/confirmed-rulings.test.mjs'&&t.name===testName));
  assert.doesNotMatch(effect.remaining,/공식 확인|가능 여부/);
 }
 assert.match(evidence.find(e=>e.cardId==='COC-12-013'&&e.effectNumber===2).resolution,/다이스 결과/);
});
