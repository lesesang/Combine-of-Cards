# 기술 구조, 개발 실행, 테스트·운영 및 보안 인수인계

**현재:** Node.js 단일 서버 + 브라우저 정적 파일 + 서버 내부 게임 상태. **정식 운영 인프라/DB/공개 URL은 아직 없음.** 이 문서를 읽으면 새 채팅의 개발자가 직접 실행·검증하고 배포 전 조건을 알 수 있어야 한다.

## 1. 개발 환경과 실행

- 저장소: https://github.com/lesesang/Combine-of-Cards
- 브랜치: **main** (기능별 새 브랜치에서 작업, CI 성공 후 PR 병합).
- Node.js **20 이상**, GitHub Actions에서는 Node 22. 외부 npm 런타임 패키지 없이 node 표준 라이브러리 기반.
- 기본 서버 주소: http://localhost:3000, PORT 환경 변수로 변경.
- 데이터 위치: 기본 **.data/rooms.json**, DATA_DIR 환경 변수로 변경.
- 룰/엔진 식별 문자열: server.mjs 안의 **1.3-ai-beta.10**. 카드/룰북 정본은 v1.3.
- 테스트/빌드/운영 명령:

~~~bash
git clone https://github.com/lesesang/Combine-of-Cards.git
cd Combine-of-Cards
npm start
# 별도 터미널:
npm test
npm run check:data
npm run test:matrix
npm run check:coverage
~~~

Windows PowerShell에서도 동일하게 npm 명령 사용. npm run check:coverage 실행 후에는 Git diff를 확인할 것.

## 2. 주요 파일과 역할

| 경로 | 책임 및 주의사항 |
|---|---|
| **server.mjs** | HTTP/API, 룸 비밀 토큰·인증, 룸 저장·복원, 턴/페이즈/다이스/드로우/리로드/승패, AI 행동 루프, 카드별 소환·전투 예외, 지속 효과 훅 |
| **src/activation-rules.mjs** | 카드 발동 전 조건과 비용 검사. 88종 기준이나 전 카드 검증 완료가 아님 |
| **src/automated-effects.mjs** | 카드 ID 기반 주문 효과 실행 핸들러 71종(효과 전체 완료 아님) |
| **src/life-eating-sword.mjs** | COC-21-002 주문의 독립 효과, 자기 ATTACK 시작 HP 30/+ATK 100, 다음 자기 턴 ×2 곱셈 중복, 저장/턴 만료. **장착이 아님** |
| **src/combat-stats.mjs** | 실제/조건용 취급 공격력 분리. 50/250 같은 카드별 판정 및 ATK 효과별 예외 |
| **src/field-abilities.mjs** | 메인 페이즈 일부 카드의 필드 발동 13종·AI 행동 |
| **src/extra-summons.mjs** | 엑스트라 21개 지정 소재, 소환 수단, 필드 공간 검사 및 AI 소환 선택 |
| **src/effect-runtime.mjs** | JSON 저장 가능한 LIFO 효과 선언/해결, 소스 이탈 예외, 독립 지속 효과와 종료 트리거의 공통 기반 |
| **src/dragon-gold.mjs** | 파프니르/라인의 황금/니벨룽겐의 반지 부분 실연동 |
| **src/cartoon-land.mjs** | 카툰 랜드 파괴 → 데몬즈 드래곤 → 월드 가이드 복구 연쇄 |
| **src/automation-status.mjs** | 카드 지원 상태 분류(현재 partial/manual/basic, full 인증 없음) |
| **public/index.html, style.css, app.js** | 한국어 웹 UI, 덱·카드 도감, AI/PvP 방·대전 컨트롤, 지속 효과 카운터 표시 |
| **public/data/catalog.json.gz.b64** | 배포와 테스트에 포함된 v1.3 도감 JSON을 gzip+base64로 저장 |
| **scripts/build-data.mjs** | 별도 제공되는 원본 v1.3 카드 JSON으로 도감 생성. **원본 파일은 아직 현 repo에 없음** |
| **scripts/verify-data.mjs** | 덱 수·카드 수·덱 구성·삭제 덱 검증 |
| **scripts/audit-coverage.mjs** | 실제 코드 기반 카드 지원 상태 보고서/JSON 생성. **아래 주의사항 참조** |
| **scripts/ai-matrix-smoke.mjs** | AI 상 난이도에 각 덱을 배정해 API 진행 확인. **실제 모든 행동/효과의 정답 검증 아님** |
| **tests/*.test.mjs** | 모듈 단위·서버 통합/보안·판정 회귀 테스트 |
| **.github/workflows/ci.yml, test.yml** | 문법/데이터/테스트/AI 스모크 검증 |
| **Dockerfile, .dockerignore** | 단일 프로세스 실험용 컨테이너 설정. 영속 볼륨·HTTPS/DB 추가 필요 |

## 3. 현재 HTTP API 모양 (server.mjs에서 최종 확인)

| 방식 | 엔드포인트 | 설명 |
|---|---|---|
| GET | /api/health | 서버 상태, 베타 버전 |
| GET | /api/catalog | 24덱/254카드, 카드별 자동화 상태 |
| POST | /api/ai | 본인 deckId, 상대 aiDeckId 또는 random, difficulty: easy/medium/hard, 본인 label로 AI 방 생성 |
| POST | /api/rooms | 2인 방 생성 |
| POST | /api/rooms/:CODE/join | 생성된 2인 방 참가 |
| GET | /api/rooms/:CODE | 방 비밀 토큰으로 본인용 게임 상태 조회 |
| POST | /api/rooms/:CODE/actions | 버전 검사(expectedVersion), 플레이어 토큰 인증 후 게임 행동 실행 |
| GET | /api/rooms/:CODE/hand-preview | 특정 '카드 뺏기' 발동 가능 상태에서만 상대 패 임시 공개 API |

- 방 생성/AI 시작 응답에는 **방 코드와 플레이어 비밀 토큰**이 포함됨. 그 뒤 접근에 Authorization: Bearer 토큰을 사용한다.
- 서버에는 인증 토큰 자체가 아닌 SHA-256 해시를 저장한다. 브라우저 토큰 보관은 현재 **localStorage**, 공유 장치와 XSS/토큰 복구 정책에 주의.
- 게임 행동은 **expectedVersion**을 검사하므로 다른 액션 후에는 새 상태를 가져와 재시도해야 한다.
- 서버가 공개하는 publicState에서 다른 플레이어의 **손패는 null**. 숨겨진 덱 순서·비밀 토큰을 공개하지 않는 것이 목표.
- 상대 패를 보는 합법적 특정 효과는 조건부 API가 있으나, 공개·선택·효과 해결·사용 후 정보 보관 문제에 대해 더 엄격한 권한 검증이 필요.
- 일부 효과/공격에서 클라이언트가 직접 계산한 피해 값을 그대로 적용하지 않는다. 게임 서버가 직접 다이스를 굴린다.

## 4. 데이터 저장과 배포 제한

현재 서버 시작 시 DATA_DIR 아래 rooms.json 파일을 읽으며, 룸 상태를 저장할 때 임시 파일 작성 후 rename으로 교체한다. 코드가 파일 손상을 발견하면 덮어쓰지 않고 실패하도록 한다. 이는 **단일 Node 프로세스**를 전제로 한 개발 저장 방식이다.

- **여러 서버 인스턴스에서 동일한 파일을 공유하지 않는다.** 분산 락/DB 충돌 제어가 없다.
- 컨테이너/서버 재배포에서 파일이 삭제되지 않도록 DATA_DIR을 영속 볼륨에 연결해야 한다.
- Dockerfile의 존재 = 정식 배포 완료가 아니다. 현재 공개 URL, 운영 DB, 도메인/HTTPS 인증서를 배포했다고 주장하지 말 것.
- 정식 운영 시 적절한 DB에 room 및 이벤트 로그, 고정 룰 버전, 유저 세션, 재접속·권한·보존·백업 메타를 저장하고 DB 트랜잭션·낙관적 잠금을 확보할 것.
- GitHub Pages/Cloudflare Pages 등 정적 사이트만으로는 **Node 서버 게임 API가 작동하지 않는다**. 지원되는 서버 호스팅(컨테이너/VM) 또는 API 런타임 이식이 필요.

## 5. 테스트 신뢰도와 주의할 사항

| 명령 | 실제 검증 | 검증하지 못하는 것 |
|---|---|---|
| npm test | tests/*의 구체적인 카드/서버/보안/판정 회귀 시나리오 | 임의의 254카드 전 효과·카드 간 모든 조합 |
| npm run check:data | 24덱 254카드, 삭제 덱 및 기본 구조·장수 | 텍스트 원본과의 의미상 동일성, 각 효과 코드 완전성 |
| npm run test:matrix | 24개 상대 AI 덱의 API 진행 스모크 검사 | 24×24 덱 실제 대전 완주·특수 효과 정답성 |
| npm run check:coverage | 자동 효과 등록과 카드 상태 보고서 생성 | 효과별 세부 구현·룰 정확도·카드 완전 지원 인증 |
| GitHub CI | Node 22 환경에서 위 검사 수행 | 운영 보안 부하 시험, 재접속 장기 테스트, 원본 DOCX 대조 |

**보고서 갱신:** `npm run check:coverage`는 AUTOMATION_COVERAGE.md / automation-audit.json / EFFECT_COVERAGE.md만 재생성한다. 수동 설명은 **AUTOMATION_NOTES.md**, 효과 명세는 **effect-coverage.json**에 쓴다. `npm run check:coverage -- --check`는 파일을 바꾸지 않고 출력 일치·원문/효과 번호·구현 경로·테스트 이름을 검증한다. CI는 이 읽기 전용 검사를 사용한다. 정본 전체 검증이나 완전 자동화 인증을 뜻하지 않는다.

**Codex 현행 문서:** [CODEX_HANDOFF](CODEX_HANDOFF.md) · [CODEX_IMPLEMENTATION_PLAN](CODEX_IMPLEMENTATION_PLAN.md) · [CODEX_RULES_REFERENCE](CODEX_RULES_REFERENCE.md). 최신 163 partial/90 manual/1 basic, 71 주문 핸들러, 61 일반 주문 응답 스택, 69개 효과별 추적 등록. `1.3-ai-beta.10` 서버 버전 문자열은 이 자동화 범위 집계를 나타내지 않는다.

신규 `src/grave-abilities.mjs`는 순수 비용 검사와 묘지 회수, `src/effect-usage.mjs`는 효과 번호별 턴 제한을 담당한다. actions API의 `graveAbility`는 `sourceUnitId`, `costUnitId`, `expectedVersion`을 받는다. 본인 상태의 `graveAbilities`에 현재 합법적인 조합만 제공하고 상대 비공개 영역은 포함하지 않는다. 규칙/엔진 버전은 beta.10이며, 기존 방에 없던 `effectUsage`는 첫 사용부터 생성된다. 이전 버전에서 수행한 효과 횟수를 소급 복원하지는 않는다.

## 6. 공개 전 보안 체크리스트

- [ ] **사용자 계정/방 접근 정책**: 인증 토큰 수명, 재접속/토큰 분실 처리, 강제 퇴장, 세션 취소·게임 종료·방 정리
- [ ] **비밀정보 차단**: 상대 손패, 덱 순서, 무작위 seed, 인증 토큰, 카드가 허용하지 않은 패 공개. 사람·AI가 서버 내부 숨겨진 정보를 전략/화면에 사용하지 않음
- [ ] **행동 입력 검사**: phase, who, target, card instance UID, cost, active zone, material, 횟수, expectedVersion, 중복 사용/재전송
- [ ] **일괄 실행 무결성**: 비용 차감 후 오류로 중간 손실이 없어야 하고, 난수와 상태 로그가 재현 가능한 단일 액션이어야 함
- [ ] **부하 및 무한 반복 제한**: 무제한 응답/중첩/AI 상태 계산이 다른 룸을 마비시키지 않으며 안전한 중단 이유 표시
- [ ] **HTTPS / CSP / CORS / CSRF / 쿠키 정책**: 현재 CSP·path validation·요청 크기 한도는 초기 방어만 제공. 운영 환경에서 전체 검토
- [ ] **네트워크와 프록시**: 현재 rate-limit은 메모리와 req.socket.remoteAddress 기반. 다중 서버/프록시 환경에서 신뢰된 IP 전달과 중앙 rate-limit 필요
- [ ] **정적 파일/DB**: 프로젝트 루트 및 .data, 원본 카드 비공개 파일/토큰이 웹 루트로 노출되지 않게 확인
- [ ] **의존성·배포 비밀**: 비밀번호/토큰/운영 키를 GitHub 커밋에 넣지 않으며 GitHub Actions/호스팅 비밀 관리 사용
- [ ] **복구**: 저장 파일 손상/서버 재시작/중단된 체인·턴/동시 접속/여러 인스턴스의 일관성 테스트
- [ ] **권리·개인정보**: 원작 카드 텍스트 및 이미지 사용 권리, 회원 정보·로그 보유/삭제 정책 확인

## 7. 다음 채팅 개발 시 작업 품질 규칙

1. **현재 main 코드 및 테스트**를 먼저 읽고 서류만 믿지 않음.
2. 카드 v1.3 원문과 공식 확정 재정을 명세로 쓰되 미확정은 별도 등록.
3. 카드별 '일부'와 '전부' 구현을 구별; 관련 테스트 없이는 완전 지원 표기 금지.
4. 새 기능의 조건·비용·대상·소스 이동/무효화·동시 피해·영역 이동 및 AI 선택권 테스트.
5. 기존 테스트 실패를 덮거나 안전성 검사를 제거하지 않음. 실패 로그를 원인별 수정.
6. GitHub Actions 성공을 **확인한 후** PR 병합. main에서 파일·자동화 현황이 올바른지 검증.
7. 변경 시 docs/IMPLEMENTATION_HISTORY.md, docs/OPEN_RULINGS_REGISTER.md, docs/AUTOMATION_COVERAGE.md를 함께 갱신.

**같이 읽기:** docs/START_HERE_NEW_CHAT.md / docs/ROADMAP_AND_ACCEPTANCE.md / docs/OPEN_RULINGS_REGISTER.md / README.md.

## 진화 비용·덱 선택 API (2026-10-14)

- `GET /api/rooms/:code/evolution-costs?unitId=...`: 자기 MAIN, 사용 가능한 패의 숲속의 맹약/아젤리아, 자연 2장 이상인 경우만 비용 후보 반환. 상대/비참가자·다른 대기 단계 거부. 덱 순서 대신 카드 ID 순.
- `play`의 `costDeckIds`: 서로 다른 자기 덱 자연 카드 2장의 UID. 서버가 다시 검사하고 대응 전에 지불.
- `pendingDeckSearch`: 발동자만 `choices`를 받음. 대응 종료 후 `deckSearch` 행동의 `unitId`로 선택, `expectedVersion` 필수. 상대는 대기 상태만 받으며 선택 이후 가져온 카드는 로그로 공개.
- 두 대기 단계는 rooms.json 저장/재접속과 HTTP 트랜잭션 롤백을 사용한다. 신규 모듈은 `src/evolution.mjs`, `src/deck-search.mjs`.

## 엑스트라 소환 무효화 API (2026-10-14)

`pendingExtraSummon`은 `awaiting`, `counter`, 현재 대응자에게만 `counters`를 공개한다. `extraResponse`에서 `choice:counter, sourceUnitId` 또는 `choice:pass`를 선택하며 `expectedVersion`을 제출한다. 같은 물리 스톰블레이거의 `spellCounterGameUsed`는 주문/소환 합계 게임당 1회다. 소환/카운터는 공통 JSON LIFO 스택을 사용한다. 구 pass 전용 저장은 응답 시 스택을 보완한다. 공개 상태에는 엑스트라 내부 UID·스택·상대 패를 추가하지 않는다. 새 모듈 `src/summon-counters.mjs`, 명세 `EXTRA_SUMMON_COUNTERS.md`.

## 필드 무효화·다중 대응 (2026-10-14)

`src/counter-effects.mjs`가 카드별 소스 영역·대상 종류·사용 상태와 LIFO 카운터 등록/해결을 공유한다. `pendingSpell`/`pendingExtraSummon`의 `counter`는 마지막 선언이며 내부 `countersDeclared`는 저장용 목록이다. 공개 `counters`에는 현재 합법 후보의 UID/이름/`limitText`만 제공한다. 필드 카드 `counterUsedThisStay`는 필드 밖에서 재진입 시 초기화하지만 필드 간 조종권 이동에는 유지한다. `fieldRevision`/기존 `integrationRevision`은 선언 후 이탈·재진입을 식별한다. API는 기존 `spellResponse`/`extraResponse`를 재사용하며 대상은 서버가 마지막 상대 효과로 고정한다. 클라이언트가 임의 스택 대상을 정하지 못한다.

## 2026-10-14 필드 발동7종 대응과 다음 작업

기존 필드 발동 **7종(몬스터5·일체화2)**을 선언·비용 선지불→상대 대응→LIFO 해결에 연결했다. 윈드 걸은 몬스터5종과 기존 몬스터 카운터3종에만 대응하며 일체화2종은 제외한다. 크래쉬볼티지는 확정 공통 규칙의 자기 턴1회를 유지하며 패1장 비용을 선언 시 지불한다. 카이저 공격권 비용·소스/대상 재검사·재시작·HTTP 원자성·UI·AI3난이도를 연결했다. **161 partial /92 manual /1 basic, 효과 증거65건(62장), 완전 인증0**. [범위·검증·남은 작업](FIELD_ABILITY_RESPONSES.md).

다음은 남은 필드 발동6종의 비용/사용 제한·조건을 원문과 대조하여 대응 창에 연결하고, 소환/파괴/묘지 유발을 통합한다. 확정 공통 규칙의 기본 자기 턴1회와 카드별 특례를 구분하고, ATK 0 공격 가능과 별도 능력치 변화/파괴 규칙도 함께 대조한다.

**최신 사용자 명확화:** 동일 효과라도 서로 다른 실제 카드는 독립적으로 발동한다. 필드13종·퓨전 업·AI의 기록을 UID/효과 번호별로 분리했다. 구 저장의 UID 없는 다중 카드 사용 기록은 특정 카드에 소급 귀속할 수 없어 별도로 보존한다. [실제 카드별 기록과 저장 형식 한계](FIELD_ABILITY_RESPONSES.md).

## 2026-10-15 원소 교체 소환4종 / 재정 정비

원소의 마법사4종의 1번 교체 소환을 자기 파괴 비용→몬스터 효과 대응→패·덱·묘지 비공개 선택→소환 대응에 연결했다. 플레이어별 공유1회와 효과2 독립을 유지하며, 사용자가 소환 무효 시 원래 영역 유지를 확정했다. PvP·AI3난이도·R21 재선택·동시 파괴 회복·JSON/HTTP 복구를 검증한다. **163 partial /90 manual /1 basic, 효과 증거69건(66장), 완전 인증0**. 필드 발동17종 중 대응11종이며 일반 체인에 원소 교체를 후발 삽입하는 경로와 2번/드래곤 전체 효과는 미완료다. [상세 명세](ELEMENTAL_REPLACEMENT_SUMMONS.md).

새 규칙 결정/문구 패치는 [위임 정책](CARD_REFINEMENT_POLICY.md)과 [전후 이력](card-patches.json)에 기록한다. 전수 자동화·576대전·운영 배포는 계속 미완료다. 다음은 원소2번/드래곤·남은 필드6종·범용 후발 체인이다.
