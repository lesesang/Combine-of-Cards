import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spellHandlerIds} from '../src/automated-effects.mjs';

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
