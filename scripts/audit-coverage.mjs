import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {automationStatus} from '../src/automation-status.mjs';
import {spellHandlerIds} from '../src/automated-effects.mjs';
import {responseSpellIds} from '../src/spell-response-registry.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readable=path.join(root,'public/data/catalog.json');
const compressed=path.join(root,'public/data/catalog.json.gz.b64');
const catalog=JSON.parse(fs.existsSync(compressed)?zlib.gunzipSync(Buffer.from(fs.readFileSync(compressed,'utf8').trim(),'base64')).toString('utf8'):fs.readFileSync(readable,'utf8'));
const byDeck=new Map(catalog.decks.map(d=>[d.id,d.name]));
const entries=catalog.cards.map(c=>({id:c.id,deck:byDeck.get(c.deckId),name:c.name,type:c.type,zone:c.zone,status:automationStatus(c),conditions:c.conditions,effects:c.effects}));
const tally=entries.reduce((a,c)=>(a[c.status]=(a[c.status]||0)+1,a),{});
if(new Set(responseSpellIds).size!==responseSpellIds.length)throw Error('Duplicate response spell ID');
for(const id of responseSpellIds){
 const card=catalog.cards.find(c=>c.id===id);
 if(!card||card.type!=='주문'||!spellHandlerIds.includes(id))throw Error('Invalid response spell registration: '+id);
}
const out={sourceRuleVersion:'1.3',automatedSpellHandlerCount:spellHandlerIds.length,responseSpellCount:responseSpellIds.length,responseSpellIds,generatedAt:'repository build time',counts:tally,notes:['partial = only some card behavior; no card has complete formal proof','manual = effects not safely automated by current engine','basic = card has no conditional/effect text, but global mechanics still require validation'],cards:entries};
const outputs={'automation-audit.json':JSON.stringify(out,null,2)+'\n'};
const lines=[
 '# 카드 자동 판정 적용 범위 — 실제 코드 기준',
 '',
 '> 카드 ID별 상태는 자동화 구현을 보수적으로 표시합니다. **부분 지원 ≠ 완전 자동화**. ',
 '',
 `- 카드 ${entries.length}개 · 주문 핸들러 ${spellHandlerIds.length}개`,
 `- 상대 pass/저장 가능한 스택에 연결된 주문 ${responseSpellIds.length}종 (실제 카운터·완전 자동화 인증 아님)`,
 `- 부분 지원 ${tally.partial||0}개, 일반 카드만 ${tally.basic||0}개, 수동/미지원 ${tally.manual||0}개`,
 '- 카드의 수동/부분 지원 상태를 전체 자동 지원으로 변경해서는 안 됩니다.',
 '- 소환 소재/복사/장착/상대 턴의 반응형 효과, 선택권/공개, 효과 우선도 등은 추가 엔진과 검증이 필요합니다.',
 '',
 '> 자동 생성 파일입니다. 구현 설명은 [AUTOMATION_NOTES.md](AUTOMATION_NOTES.md), 효과별 범위는 [EFFECT_COVERAGE.md](EFFECT_COVERAGE.md)에서 별도로 관리합니다.','',
 '## 덱별 카드 구현 범위','',
 '| 덱 | 부분 지원 | 기본 규칙만 | 수동/미지원 | 합계 |','|---|---:|---:|---:|---:|'
];
for(const d of catalog.decks){const cards=entries.filter(c=>c.deck===d.name);const count=k=>cards.filter(c=>c.status===k).length;lines.push(`| ${d.name} | ${count('partial')} | ${count('basic')} | ${count('manual')} | ${cards.length} |`)}
lines.push('','## 미지원·부분 지원 카드 목록','','| ID | 카드명 | 지원 상태 | 종류 |','|---|---|---|---|');
for(const c of entries.filter(c=>c.status!=='basic'))lines.push(`| ${c.id} | ${c.name.replaceAll('|','/')} | ${c.status==='partial'?'부분 지원':'미지원'} | ${c.type} |`);
lines.push('','## 정식 공개 전 필수 검증','',
 '1. 모든 카드의 발동 사건·발동 조건·비용·대상·선택권·결과·종료 조건 기계 명세화',
 '2. 대상 불능, 효과 소스 이동, 우선순위, 역순 해결, 반응 창의 자동 규칙',
 '3. 퓨전·라피드·얼라이즈 소재와 복사·지속 주문·장착·조종권 변동',
 '4. 카드별 독립 테스트와 24개 덱 전체 조합의 상태 기반 시뮬레이션',
 '5. 단일 프로세스 파일 저장에서 운영 가능한 DB와 권한·감사·재접속 설계로 이전','');
outputs['AUTOMATION_COVERAGE.md']=lines.join('\n');
const effects=JSON.parse(fs.readFileSync(path.join(root,'docs/effect-coverage.json'),'utf8'));
const effectLines=['# 효과별 자동화 추적 (자동 생성)','','현재 등록한 '+effects.length+'개 효과만 추적합니다. **미등록 효과는 미검증이며, partial/provisional은 완전 지원이 아닙니다.**','','| 카드 · 효과 | 상태 | 발동 · 비용 | 처리 | 남은 작업 | 검증 |','|---|---|---|---|---|---|'];
const escape=value=>String(value).replaceAll('|','/').replaceAll('\n',' ');
const seen=new Set();
for(const effect of effects){
 const card=catalog.cards.find(c=>c.id===effect.cardId),key=`${effect.cardId}:${effect.effectNumber}`;
 if(!card||seen.has(key)||!Number.isInteger(effect.effectNumber)||effect.effectNumber<1||card.effects[effect.effectNumber-1]!==effect.sourceText)throw Error('Invalid or stale source effect: '+key);
 seen.add(key);
 if(!['partial','provisional'].includes(effect.status))throw Error('Complete automation cannot be certified by this register: '+key);
 for(const field of ['trigger','condition','cost','target','resolution','duration','remaining'])if(typeof effect[field]!=='string'||!effect[field].trim())throw Error('Missing '+field+': '+key);
 if(!effect.implementation?.length||!effect.tests?.length)throw Error('Missing implementation/tests: '+key);
 for(const file of effect.implementation)if(!fs.existsSync(path.join(root,file)))throw Error('Missing implementation file: '+file);
 for(const test of effect.tests){const source=fs.readFileSync(path.join(root,test.path),'utf8');if(!source.includes(`test('${test.name}'`))throw Error('Missing regression test: '+test.name)}
 const links=effect.tests.map(t=>`[${escape(t.name)}](../${t.path})`).join('<br>');
 effectLines.push(`| ${key} | ${effect.status} | ${escape(effect.trigger)} / ${escape(effect.cost)} | ${escape(effect.resolution)} | ${escape(effect.remaining)} | ${links} |`);
}
outputs['EFFECT_COVERAGE.md']=effectLines.join('\n')+'\n';
const check=process.argv.includes('--check');
for(const [file,content] of Object.entries(outputs)){
 const filename=path.join(root,'docs',file);
 if(check){if(!fs.existsSync(filename)||fs.readFileSync(filename,'utf8')!==content)throw Error('Stale generated report: '+file+'; run npm run check:coverage');}
 else fs.writeFileSync(filename,content);
}
console.log(JSON.stringify(tally));
