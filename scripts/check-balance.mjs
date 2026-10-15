import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
const review=JSON.parse(fs.readFileSync('docs/balance-review-b1.json'));
const patches=JSON.parse(fs.readFileSync('docs/card-patches.json')).filter(p=>p.patchId==='BALANCE-B1');
const catalog=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('public/data/catalog.json.gz.b64','utf8').trim(),'base64')));
assert.equal(review.cards.length,254);assert.equal(new Set(review.cards.map(c=>c.cardId)).size,254);assert.equal(review.decks.length,24);
assert.equal(catalog.balanceRevision,review.revision);
for(const c of catalog.cards){
 const r=review.cards.find(r=>r.cardId===c.id),p=patches.find(p=>p.cardId===c.id);
 assert.ok(r?.reason&&r.deckId===c.deckId,`Missing review ${c.id}`);
 assert.equal(r.decision,p?'patch':'retain');
 if(p){assert.deepEqual(c,p.after);for(const key of ['id','deckId','type','zone'])assert.deepEqual(p.before[key],c[key]);assert.ok(p.rationale&&p.source.includes('NOT canonical'));}
}
const restored=structuredClone(catalog);delete restored.balanceRevision;restored.cards=restored.cards.map(c=>patches.find(p=>p.cardId===c.id)?.before||c);assert.equal(crypto.createHash('sha256').update(JSON.stringify(restored)).digest('hex'),review.baselineSha256,'Unrecorded card/deck change against baseline');
const cell=s=>String(s).replaceAll('|','/').replaceAll('\n',' ');
const lines=['# v1.3 기반 전체 카드 밸런스 B1','','**254장 / 24덱 전수 설계 검토, 80장 개정·174장 유지. 전체 효과 자동화 또는 실전 승률 균형 인증이 아니다.**','','사용자가 전체 카드·재정 조정을 위임하고 F=HERO 너프, 저주/악마·용/드래곤 버프를 우선 지정했다. 이 문서는 그 방향에 따른 개발자 패치이며 기존 공식 17개 확정 재정을 새로 받은 것으로 기록하지 않는다. 기준은 main `'+review.baselineCommit+'`의 실행 카탈로그다. 누락된 원본 v1.3 자료를 복원했다고 주장하지 않는다. 덱별 창작 의도 설명은 카탈로그 연계에서 도출한 개발자의 해석이다. 전체 변경 전후는 [card-patches.json](card-patches.json), 유지 포함 검토는 [balance-review-b1.json](balance-review-b1.json)에 있다.','','## 주요 조정','','- F=HERO: 13장 전투 수치 하향, 파트너 추가 피해100→50. 검색·드로우·퓨전 소재·무효화 범위/횟수·R28 관통은 유지.','- 용/드래곤: 초동6장 보강, 용의 둥지30/30 자동화 및 용왕이 유효하면45/45. 보물×10과 황금·반지 순서는 유지.','- 저주/악마: 몸값6장과 재단 비용 개선, 흡혈1/3→1/2, 질투 제물 합250→200. 마검은 수치 변경 없이 확정 재정을 문구에 반영.','- 다른 덱: 과도한 탈취·즉시 피해·광역 토큰·회복 조정과 약한 초동 보완. 블랙 메탈 공격력100 연결은 그대로 유지.','- 원소: 교체 효과1의 플레이어별 공유1회는 유지. 윈드/허리케인 직접 피해 하향; 워터·랜드·오션·테라·인피니티의 모호한 범위/기간·전체 자원 삭제 문구를 제한. 후자의 미구현 효과를 구현 완료로 표시하지 않는다.','','## 엔진 적용과 한계','','용의 둥지, 부자의 질투, 욕망의 끝을 주문 대응 스택에 연결한다. 질투의 제물과 FLASH 체력200은 대응 전에 지불하며 무효화되어도 반환하지 않는다. 질투/욕망의 대상 파괴 면역 우회는 주문 발동 무효를 막지 않는다. 파트너·뱀파이어·윈드 추가 효과는 효과 무효 상태에서 적용하지 않는다. 자가포식 버프는 자기 턴 종료에 정확히 회수한다. 가고일/히든 스나이퍼 도발을 적용하고 밀짚 인형의 잘못된 도발 표시를 제거한다.','','재단 소환/서큐버스 선택, 일부 소환 제외와 원소 지연·반격·삼영역 제외 등은 아직 미지원이다. 용왕 배율 자동화도 이번 용의 둥지 경로만 검증했다. 각 카드의 partial 표시는 개정 효과 전부 지원을 뜻하지 않는다. 실전 상성 승률은 아직 측정하지 않았고 AI 행렬은 합법 행동 스모크 검사다.','','기존 저장 대국은 규칙 버전을 고정하는 엔진이 없다. 운영 배포 전 진행 중 대국을 종료한 뒤 신규 대국부터 B1을 적용해야 한다. 이 PR의 main 병합은 운영 배포 완료가 아니다.','','## 덱별 의도와 변경 규모','','| 덱 | 변경 / 전체 | 보존할 흐름 |','|---|---:|---|'];
for(const d of review.decks){const rows=review.cards.filter(c=>c.deckId===d.id);lines.push(`| ${cell(d.name)} | ${rows.filter(c=>c.decision==='patch').length} / ${rows.length} | ${cell(d.intent)} |`)}
lines.push('','## 254장 검토 결과','','| 카드 | 결정·영역 | 사유 |','|---|---|---|');
for(const r of review.cards)lines.push(`| ${r.cardId} ${cell(r.name)} | ${r.decision==='patch'?'개정':'유지'} / ${r.automation} ${r.changedFields.join(',')} | ${cell(r.reason)} |`);
const output=lines.join('\n')+'\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync('docs/BALANCE_PATCH_B1.md','utf8'),output,'Stale balance report');else fs.writeFileSync('docs/BALANCE_PATCH_B1.md',output);
console.log(`B1: ${review.cards.length} cards reviewed, ${patches.length} patched, ${review.decks.length} decks`);
