import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {automationStatus} from '../src/automation-status.mjs';
import {spellHandlerIds} from '../src/automated-effects.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'public/data/catalog.json'),'utf8'));
const byDeck=new Map(catalog.decks.map(d=>[d.id,d.name]));
const entries=catalog.cards.map(c=>({id:c.id,deck:byDeck.get(c.deckId),name:c.name,type:c.type,zone:c.zone,status:automationStatus(c),conditions:c.conditions,effects:c.effects}));
const tally=entries.reduce((a,c)=>(a[c.status]=(a[c.status]||0)+1,a),{});
const out={sourceRuleVersion:'1.3',automatedSpellHandlerCount:spellHandlerIds.length,generatedAt:'repository build time',counts:tally,notes:['partial = only some card behavior; no card has complete formal proof','manual = effects not safely automated by current engine','basic = card has no conditional/effect text, but global mechanics still require validation'],cards:entries};
fs.writeFileSync(path.join(root,'docs/automation-audit.json'),JSON.stringify(out,null,2)+'\n');
const lines=[
 '# 카드 자동 판정 적용 범위 — 실제 코드 기준',
 '',
 '> 카드 ID별 상태는 자동화 구현을 보수적으로 표시합니다. **부분 지원 ≠ 완전 자동화**. ',
 '',
 `- 카드 ${entries.length}개 · 주문 핸들러 ${spellHandlerIds.length}개`,
 `- 부분 지원 ${tally.partial||0}개, 일반 카드만 ${tally.basic||0}개, 수동/미지원 ${tally.manual||0}개`,
 '- 카드의 수동/부분 지원 상태를 전체 자동 지원으로 변경해서는 안 됩니다.',
 '- 소환 소재/복사/장착/상대 턴의 반응형 효과, 선택권/공개, 효과 우선도 등은 추가 엔진과 검증이 필요합니다.',
 '',
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
fs.writeFileSync(path.join(root,'docs/AUTOMATION_COVERAGE.md'),lines.join('\n'));
console.log(JSON.stringify(tally));
