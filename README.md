# Combine of Cards — 컴바인 오브 카드즈

동호회 자작 TCG 《컴바인 오브 카드즈》를 플레이 가능한 온라인 대전 웹 서비스로 만드는 저장소다. **현재 v1.3 규칙 기반 개발 베타**이며 **254개 카드 모든 효과의 완전 자동화·정식 운영 배포는 아직 미완료**다.

## Codex에서 개발 이어가기 — 가장 먼저 읽을 문서

**[Codex 통합 인수인계](docs/CODEX_HANDOFF.md)** · **[최신 확정 규칙·카드별 결정](docs/CODEX_RULES_REFERENCE.md)** · **[이슈 연동 작업 로드맵](docs/CODEX_IMPLEMENTATION_PLAN.md)**

Codex는 먼저 루트 [AGENTS.md](AGENTS.md)와 위 3개 문서를 읽고, 실제 main 코드·Actions CI·[이슈 #21~#29](https://github.com/lesesang/Combine-of-Cards/issues)를 대조한다. 이어서 [확정 원칙](docs/PRODUCT_VISION_AND_RULES.md), [카드 교정](docs/DECISIONS_AND_CORRECTIONS.md), [17개 추가 확정 재정](docs/RULINGS_CONFIRMED_2026-10-13.md), [13개 잔여 구현·검증](docs/OPEN_RULINGS_REGISTER.md), [구현 이력](docs/IMPLEMENTATION_HISTORY.md)을 확인한다.

[구형 새 채팅 인계 문서](docs/START_HERE_NEW_CHAT.md)도 보존하지만, **최신 Codex 인계 문서가 현재 상태의 우선 탐색 지점**이다. 오래된 문구의 기술 미완료가 사용자 확정 규칙을 뒤집지 않는다.

## 현재 상태 — 2026-10-14, 주문 23종 일괄 대응 통합

| 항목 | 실제 코드/생성 보고서 기준 |
|---|---|
| 대전 가능한 사전 구성 덱 | **24개** |
| 전체 카드 항목 | **254개** = 메인 215 + 엑스트라 21 + 생성/진화 18 |
| 카드 지원 집계 | **부분 지원 163 / 수동·미지원 90 / 기본 카드 1** |
| 완전 자동화 인증 카드 | **0개** |
| 자동 주문 핸들러 | **72개** (개별 효과 전체 완성 아님) |
| 실제 상대 pass/LIFO 스택 연결 주문 | **64종** (마검 포함; 무효화 카드 4종 부분 지원) |
| 일부 필드 발동 | **19종(대응 창 19종)** |
| 엑스트라 소환 레시피 | **21개** (스톰블레이거 소환 무효화 연결) |
| 발동 조건 사전검사 | **88종** |
| 문서화한 효과 번호별 증거 | **91건** (82장 카드의 일부 조항, 전수 추적 미완료) |
| 공개 운영용 DB/실서비스 URL | **없음** |
| 작업 시작 main | **47bc720** (PR #72), Node tests + Verify TCG beta 둘 다 성공; 이번 PR 최종 CI는 PR/이슈 기록 참조 |

**부분 지원 ≠ 완전 지원.** 163장 전체 효과를 모두 자동화했다는 뜻이 아니다. 매 개발 시작마다 보고서와 실제 실행 코드를 기준으로 최신 집계를 다시 확인한다.

### 최근 확정 규칙 (예시)

- **생명을 먹는 마검 (COC-21-002): 장착 카드가 아닌 주문**, 카드 본체는 사용 후 묘지로. 효과를 부여받은 몬스터/일체화 플레이어가 **자기 ATTACK 페이즈 시작**에 인스턴스마다 HP **30** 강제 지불(+ATK 100), HP **30 이하**면 지불 불가한 순간 몬스터 파괴 또는 직접 부여 플레이어 패배. 상대 몬스터 처치로 받은 **×2는 다음 자신의 턴 시작~종료**에 적용. 중복 2배 효과는 **×4·×8·×16…**. ATTACK을 건너뛰면 지불도 발생하지 않는다. ([PR #57](https://github.com/lesesang/Combine-of-Cards/pull/57), [PR #58](https://github.com/lesesang/Combine-of-Cards/pull/58))
- **장착 해제는 자의로 불가.** 카드 효과/확정 규칙이 요구할 때만 처리. 마검을 장착 목록에 넣지 않는다.
- **간드레이드래곤**은 소환 시 **자기 자신만 제외**하고 다른 몬스터를 파괴한다.
- **블랙 메탈 매지션**은 실제 공격력 50/기본 1d50, 명시된 조건용으로만 공격력 250 취급.
- 2026-10-13 확정 **R05/R06/R07/R08/R09/R10/R11/R12/R13/R21/R22/R23/R24/R25/R28/R29/R30**의 세부 사항을 다시 미확정으로 취급하지 않는다.

모든 규칙의 정식 설명은 [CODEX_RULES_REFERENCE](docs/CODEX_RULES_REFERENCE.md), [PRODUCT_VISION_AND_RULES](docs/PRODUCT_VISION_AND_RULES.md), [DECISIONS_AND_CORRECTIONS](docs/DECISIONS_AND_CORRECTIONS.md)를 참고한다.

## 개발·테스트 실행

Node.js **20 이상**, ESM/Node 표준 라이브러리 기반.

```bash
git clone https://github.com/lesesang/Combine-of-Cards.git
cd Combine-of-Cards
npm start                           # http://localhost:3000
npm test
npm run check:data
npm run test:matrix
npm run check:coverage
npm run check:coverage -- --check
```

- `server.mjs`: Node HTTP API, 방/턴/룰/AI, `.data/rooms.json` 파일 저장(단일 프로세스). `PORT`, `DATA_DIR` 환경변수.
- `src/automated-effects.mjs`, `src/effect-runtime.mjs`, `src/activation-rules.mjs`: 주문 처리, 스택, 발동 사전검사.
- `src/life-eating-sword.mjs`: 최신 마검 ATTACK 타이밍/중첩 2배/독립 상태. `src/combat-stats.mjs`: 실제/취급 공격력.
- `src/extra-summons.mjs`, `src/field-abilities.mjs`, `src/grave-abilities.mjs`, `src/dragon-gold.mjs`, `src/cartoon-land.mjs`: 기타 특수 소환/효과.
- `public/`: 브라우저 UI, `public/data/catalog.json.gz.b64`: 서버가 우선 로드하는 압축 플레이 카탈로그.
- `tests/`, `scripts/`: 판정/보안/AI·데이터 회귀 검사. **`npm run test:matrix`는 24덱 AI 스모크이며 576 매치 완주 인증이 아님**.
- `npm run check:coverage`는 생성 보고서 3개를 덮어쓴다. 사람이 쓰는 설명은 `docs/AUTOMATION_NOTES.md`, 효과별 입력은 `docs/effect-coverage.json`에 쓰고 읽기 전용 `--check`로 일치 확인.

### 전체 구현/운영 한계

- 메인 덱은 **24개 원본 덱 각각 독립 사용**, 다른 덱 카드 사전 혼합 금지. 삭제된 8덱(합체 기계, 코미컬, 럭키, 카지노이드, 비트스타즈, 파트너 몬스터즈, 코브라, 아홉꼬리) 복원 금지.
- 기존 GitHub에는 **v1.3 원본 룰북 DOCX/정본 JSON/구버전 비교 원본이 아직 미커밋**. 현재 카탈로그와 정본 자료를 혼동하지 않는다. [출처·편입 계획](docs/SOURCE_DATA_PROVENANCE.md).
- 독립 지속·일부 실제 장착 링크/얼라이즈 이동/일부 응답 스택은 있으나 전체 카드 복사·대응 무효화·모든 효과·AI 전략은 미완성.
- 실제 DB·사용자 인증 수명/재접속·보안·HTTPS·모니터링·권리 확인·운영 배포 등 [완료 기준](docs/ROADMAP_AND_ACCEPTANCE.md) 미충족. Dockerfile이 있어도 배포 완료가 아니다.

## 기여·품질

1. 기존 확정 판정을 무효화하거나 원본 카드 수치/효과를 편의대로 바꾸지 않는다. **새 규칙이 필요하면 실제 사용자 미확정만 명시적으로 확인**한다.
2. 한 카드 효과/공통 사건 단위로 서버·AI·UI·테스트를 함께 구현한다. 상대 비공개 카드/덱 순서·토큰/원소유권 보호, 비용·상태 원자성 검증.
3. `docs/effect-coverage.json`, 역사·룰 변경 문서, GitHub 이슈에 구현 범위와 **미완료**를 남긴다.
4. 두 GitHub Actions(**Node tests**, **Verify TCG beta**)가 **PR 최종 SHA에서 성공한 뒤** main에 병합하고 main 결과까지 확인한다.

**바로 복사할 Codex 시작 요청문은 [CODEX_HANDOFF.md 하단](docs/CODEX_HANDOFF.md#7-작업-이력추적인계-유지)에 있다.**

라이징 윈드 걸(COC-12-002)은 최신 사용자 정정에 따라 **상대 몬스터 효과만** 무효화한다. 카드 문구도 수정했으며, 재소환 후 재사용 규칙은 유지한다. 현재 지원 범위는 [필드 무효화 명세](docs/FIELD_COUNTER_CHAINS.md)를 참조한다.

필드 발동7종을 상대 대응 창에 연결했으며, 같은 효과라도 **서로 다른 실제 카드는 각각 발동**하도록 사용 횟수를 카드 UID·효과별로 분리했습니다. [구현 범위와 남은 작업](docs/FIELD_ABILITY_RESPONSES.md).

## 2026-10-15 원소 교체 소환 및 후속 정비

원소의 마법사4종의 1번 교체 소환을 자기 파괴 비용→몬스터 효과 대응→패·덱·묘지 비공개 선택→소환 대응에 연결했다. 플레이어별 공유1회와 효과2 독립을 유지하며, 사용자가 소환 무효 시 원래 영역 유지를 확정했다. PvP·AI3난이도·R21 재선택·동시 파괴 회복·JSON/HTTP 복구를 검증한다. **163 partial /90 manual /1 basic, 효과 증거69건(66장), 완전 인증0**. 필드 발동17종 중 대응11종이며 일반 체인에 원소 교체를 후발 삽입하는 경로와 2번/드래곤 전체 효과는 미완료다. [상세 명세](docs/ELEMENTAL_REPLACEMENT_SUMMONS.md).

새 사용자 지시로 덱의 흐름/창작 의도를 보존하는 재정·밸런스 정비도 직접 진행한다. [정비 기준·원소 덱 검토·다음 계획](docs/CARD_REFINEMENT_POLICY.md).

## 2026-10-15 전체 카드 밸런스 B1 / D1 운영 목표

254장·24덱 설계 검토: **80장 개정·174장 유지**. F=HERO는 전투 효율 너프, 용/드래곤·저주/악마는 초동·회복·비용 버프를 우선했다. 기존17재정·마검·장착 해제 금지·간드레이 자기 제외·진화·개별 횟수·원소 공유1회는 유지한다. 개발자 재정 개정과 사용자 확정은 구분한다. [전수 검토와 변경 사유](docs/BALANCE_PATCH_B1.md), [변경 전후](docs/card-patches.json).

현재 **163 partial /90 manual /1 basic, 주문 핸들러72, 대응 주문64, 효과 증거77건(73장), 완전 인증0**. 용의 둥지 자동화와 질투/욕망 대응, 새 수치와 도발/흡혈/효과 무효·만료 오류를 수정했다. 미구현 원소2번/드래곤·재단·소환 제외는 여전히 미완료다. 254장 검토는 전 효과 자동화 또는 실전 승률 균형 인증이 아니다.

다음은 미구현 개정 효과의 상태/반응 명세→공통 체인 연결→24×24 대전과 난이도 평가다. 운영 DB는 사용자 개인 **Cloudflare D1**을 목표로 한다. [D1 저장소 분리·동시성·이전 계획](docs/CLOUDFLARE_D1_PLAN.md). D1 연결과 운영 배포는 아직 하지 않았다.

## 2026-10-15 필드 효과6종 대응 / 슈 선택 소환 (PR #73 당시)

기존 즉시 실행6종을 공통 대응으로 옮겨 **등록 필드 발동17종 모두 대응 연결(몬스터13·일체화4)**. 쿠로쿠로비 반환·프람덴베르카 제물과 게임3회·라이드 플레임 게임1회·매치2종 현재HP 설정·슈 비공개 선택/소환 대응을 PvP/AI/복구에 연결했다. 원문/B1 수치와 기존 확정 재정은 유지한다. [명세·재정 해석·검증·미완료](docs/REMAINING_FIELD_RESPONSES.md).

당시 **163 partial /90 manual /1 basic, 주문 핸들러72·대응64, 효과 증거83건(79장), 완전 인증0**. 신규 카드 완성 인증이 아니라 기존 부분 효과의 비용·무효화·소환 처리 보완이다. 일반 체인 삽입/전체 유발·일체화 진입 이력·B1 미구현 조항은 남는다. 다음은 원소 반격/지연과 소환·파괴·묘지 사건 묶음이다. 개인 Cloudflare D1 저장소 분리/이전은 별도 계획을 유지하며 아직 연결/배포하지 않았다.


## 2026-10-15 원소 드래곤 8개 효과 조항 묶음

드래곤4종의 규칙상 이름을 정확한 주문/웨이크업 소재 조건에 연결하고, 오션·테라2번을 선언→상대 대응→LIFO에 구현했다. 테라 체류/실제 턴 시작을 JSON으로 기록한다. 플레임·볼케이노 추가 공격은 현재 실제ATK·무효·다른 추가 공격과 합산·UID/효과2 횟수·영역 이탈 초기화를 보완했다. 파괴 면역 웨이크업 비용을 사전 거부한다. 원문/B1 수치·기존 확정 재정은 변경하지 않았다. [명세·개발자 판단·검증·잔여](docs/ELEMENTAL_DRAGON_EFFECTS.md).

최신 **163 partial /90 manual /1 basic, 등록 필드19종/대응19종(몬스터15·일체화4), 효과 증거91건(82장), 완전 인증0**. 주문72/대응64·엑스트라21 유지. 다음은 워터 공격 선언 반격·랜드 턴 시작 교환·인피니티 제외/선택과 공통 유발 대응이다. 플레임/볼케이노 전투 유발 독립 대응·볼케이노 전체 효과 처치는 남는다. 개인 Cloudflare D1은 계획만 있으며 연결/운영 배포하지 않았다.
