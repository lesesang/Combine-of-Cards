# Repository agent instructions — Combine of Cards

## 2026-10-16 주문 재사용·묘지 사건 묶음 — 미검증

[재사용·묘지 사건 명세](docs/SPELL_REUSE_AND_GRAVE_EVENTS_DRAFT.md): 아젤리아/유리카/하우스 파티가 기본 주문22종을 재사용하는 경로, 베리아/스트로베리아의 사건별 반복 반응, 퓨전 업 묘지 회수 대응을 작성했다. 부모 대응을 보관해 새 유발부터 해결하고 END·공격 재진입을 보완했다. 유발35(몬스터32/일체화3), 별도 재사용3종. **테스트/CI 미실행, draft PR #75 누적·미병합**이며 원죄/모든 원본 효과 복사·장착 등은 미완료다. 생성 보고서는 main PR #74 기준선 그대로다.

## 2026-10-16 소환 유발·검색·회수 묶음 — 미검증

[22종 효과 경로 묶음](docs/SUMMON_TRIGGER_BATCH_DRAFT.md): 소환 유발20종을 공통 대응으로 이동하고 케미의 사용 주문 회수·디텍티브 검색 선택을 연결했다. 렌의 누락된 상대 드로우 비용, 스플래쉬 조건 재검사, 스파클링 대상 범위, 티라노의 HP 미정 생존을 수정했다. 유발 등록33종(몬스터32·일체화1), 주문76/대응68·필드22. **테스트/CI 미실행, draft PR #75에 누적, 미병합·미배포**다. 생성 보고서는 main PR #74 기준선이며 새 초안의 검증 증거가 아니다. 상세 변경·개발자 해석·미완료·다음 묶음은 링크 문서에 모았다.

## 2026-10-15 구현 우선 후속 — 미검증

[진화·소환 연계19종 구현 초안](docs/EVOLVED_AND_SUMMON_AUTOMATION_DRAFT.md)을 draft PR #75에 추가했다. 진화 사용 이력3종, 선택 부활/소환4종, 드라고닉·지니어스 발동, 소환 유발6종, 버닝 드래곤·야시키·지연 파괴·매치 반사를 작성했다. 일반 패 몬스터 소환도 비용→대응→소환으로 연결했다. **테스트/CI 미실행, 미병합**이다. 새 등록 목록은 주문76/대응68·필드22·몬스터 유발12이며 검증 인증 수치는 아니다. 생성 보고서는 PR #74의 기준선으로 남겼고 일괄 검증 때 갱신해야 한다. 다음은 묘지 이동 발동·회수·복사·장착과 남은 소환/유발이다.

## 사용자 변경: 구현 우선, 일괄 검증은 후속 단계 (2026-10-15)

사용자가 “지금부터는 일단 자동화만 해줘. 테스트는 나중에 한 번에”라고 지시했다. 현재 구현 단계에서는 테스트/CI를 실행하지 않고 별도 브랜치·draft PR에 모은다. 커밋의 `[skip ci]`로 자동 CI 실행도 보류하며 테스트 자체를 삭제하거나 약화하지 않는다. 기존의 최종 검증/병합 절차는 후속 일괄 검증 단계에 적용한다. 미검증 변경을 완료 인증/CI 성공으로 표시하거나 main에 병합·배포하지 않는다. 이 최신 사용자 요청이 아래 과거 작업별 즉시 테스트 지침보다 우선한다.



This file is for a new coding assistant taking over the repository after the 2026-10-13 ChatGPT conversation.

## Read these before changing source

1. **docs/CODEX_HANDOFF.md** — CURRENT Codex entrypoint, latest merged PR, implementation scope, actionable continuation prompt.
2. **docs/CODEX_RULES_REFERENCE.md** — approved game rules, 17 officially confirmed rulings, card-by-card corrections and latest Magic Sword ruling.
3. **docs/CODEX_IMPLEMENTATION_PLAN.md** — issue-mapped P0/P1/P2/P3 roadmap and testable PR acceptance criteria.
4. docs/START_HERE_NEW_CHAT.md — historical ChatGPT handoff, later addenda; earlier text may be superseded by latest confirmed corrections.
5. docs/PRODUCT_VISION_AND_RULES.md — approved rules and product intent.
6. docs/DECISIONS_AND_CORRECTIONS.md — user-approved card/engine corrections. **Do not revert Gandrae Dragon's self-exclusion.**
7. docs/OPEN_RULINGS_REGISTER.md — ambiguous rulings, proposed fixes and provisional code behavior.
8. docs/ROADMAP_AND_ACCEPTANCE.md — prioritized acceptance criteria.
9. docs/ARCHITECTURE_AND_RUNBOOK.md — commands, APIs, storage and security.
10. docs/AUTOMATION_COVERAGE.md — card coverage; **partial is not complete**.
11. Current main source, tests and GitHub Actions. Check their actual state before editing.

## Product requirements

- Preserve the user's custom TCG v1.3: **24 premade playable decks**, **254 card records**, no card mixing across premade decks.
- Never restore the deleted decks: 합체 기계, 코미컬, 럭키, 카지노이드, 비트스타즈, 파트너 몬스터즈, 코브라, 아홉꼬리.
- The goal is **fully automatic server-authoritative card effects**, AI duels (choose opponent deck/random; easy, medium, hard), PvP, rules conflict diagnostics and production-ready deployment.
- **Latest implementation (elemental dragon batch, 2026-10-15): 163 partially supported / 90 manually unsupported / 1 basic, 72 registered spell handlers, 64 spells in opponent-pass effect stack and only 91 effect-number evidence records. Complete coverage certified: 0.** The server banner is beta.13, not an accurate support inventory. Full automation is not achieved.
- Source v1.3 DOCX and comparison JSON were created in a prior conversation but are **not yet committed** to this public repository. See docs/SOURCE_DATA_PROVENANCE.md.

## Latest user-confirmed rules to preserve (PR #57–#58)

- **COC-21-002 Life-Eating Sword is a SPELL to grave, NOT equipment.** Selected field monster / integrated player gains independent persistent effects. Each instance forces **30 HP payment and +100 ATK at the START OF ITS OWN ATTACK PHASE** (not TURN_START); 30 HP or less means cannot pay and that monster is destroyed / directly affected player loses. Skipped ATTACK phase means no payment.
- A qualifying enemy-monster kill by the enchanted bearer schedules **x2 ATK during the bearer's entire NEXT own turn**, not permanently; multiple x2 triggers/instances multiply x4/x8/x16/... (no arbitrary once-per-turn cap).
- **Voluntary equipment removal is forbidden**; physical equip detachment only by explicit card effect/rule. Sword is unrelated to physical attachment mechanics.
- Keep Gandrae Dragon's self-exclusion; true ATK 50 vs condition-treated 250 for Black Metal Magician; R05/R06/R07/R08/R09/R10/R11/R12/R13/R21/R22/R23/R24/R25/R28/R29/R30 official approval.
- All these are CONFIRMED rules; missing implementation is NOT a reason to ask for approval again. Explicitly distinguish unsupported effect or missing v1.3 source files from actual unresolved interpretations.

- **2026-10-14 user-confirmed evolution rules:** replace the base ATK and preserve buffs (100 + 50 → 150 + 50 = 200); restore the original physical card when moving to hand/deck/grave. Do not ask again. See docs/DECISIONS_AND_CORRECTIONS.md. Evolution target effects remain partial.

- **2026-10-14 user-confirmed summon ruling:** a negated extra-deck monster remains in the extra deck; paid materials/spells are not refunded. Do not ask again. The user also confirmed that spell/summon Storm negation shares one physical-card game limit (not one use per clause and not a global limit for other cards). General hand/effect/token summons remain unsupported.

- **2026-10-14 confirmed field counter reset:** COC-12-001/12-002/24-005 may reuse their counter after resummoning. Control transfer alone is not resummoning. Keep Storm COC-14-001 once per physical card per game. Do not ask again.

- **2026-10-14 latest user correction: COC-12-002 Wind Girl negates only opposing MONSTER effects.** It cannot negate spells, Storm integration effects, or raw summons. The live catalog text is now “1회 상대 몬스터의 효과를 무효로 합니다.”. Resummon reset is unchanged. PR #68 broader scope is superseded; do not ask again.

## Latest implementation update (2026-10-13)

- **Latest COC-21-002 confirmation (PR #58):** Life-Eating Sword is a spell to grave, not equipment. Every granted instance pays 30 HP / gains +100 ATK at bearer\'s own ATTACK phase start; HP <=30 prevents payment, destroying the unit or losing as targeted player. Monster kills by a bearer grant ×2 for its **next own full turn**, copies stack multiplicatively (×4, ×8, ×16). Voluntary unequipping remains prohibited. Track unimplemented causes separately.

- Historical beta.10 baseline: 156 partial / 97 manual / 1 basic; 13 field abilities; Black Metal Fusion Up grave recovery and independent effect limits; Crash Voltage discard/destruction and confirmed dice-result piercing (R28).
- **R05/R06/R07/R08/R09/R10/R11/R12/R13/R21/R22/R23/R24/R25/R28/R29/R30 were user-approved 2026-10-13**: see docs/RULINGS_CONFIRMED_2026-10-13.md. Never describe these 17 as open. Some confirmed behavior (notably R22 response window and all R05 token paths) remains incompletely implemented.
- Generated coverage reports and manual notes are now separated. Edit docs/AUTOMATION_NOTES.md for prose and docs/effect-coverage.json for effect records. Run npm run check:coverage then npm run check:coverage -- --check. CI must reject stale reports without silently regenerating them.

- **Confirmed default effect limit:** absent an explicit exception, each physical card UID / individual effect is usable once during its own turn (PRODUCT_VISION_AND_RULES.md). Missing limit text on a card is not permission for unlimited activations. Preserve Crash Voltage once per turn.

- **2026-10-14 latest user clarification:** different physical cards may each activate the same effect independently. Never share usage by effect text, card name, or catalog ID across UIDs. Keep each card’s explicit turn/game/resummon exceptions and independent effect numbers.

- **2026-10-14 explicit shared exception:** Elemental Magicians COC-32-001/002/003/004 share ONE activation per turn for effect 1 only. Their effect 2 is not part of that group. Replacement summon execution is partially implemented; the user confirmed the shared group is per player, not shared across both players. See docs/ELEMENTAL_REPLACEMENT_SUMMONS.md for supported windows and remaining chain insertion work.

## Non-negotiable rules

- Confirmed user rulings override incorrect older text and code. **간드레이드래곤 destroys every other monster, not itself**. It discards its other hand cards on summon.
- Do not modify a card's numbers, costs, timing, targets or effect meaning merely to simplify implementation.
- Clearly distinguish **confirmed** rulings, **provisional code decisions**, and **unsupported** mechanics. Never silently pretend a complex card is automated.
- Preserve source-card IDs. Distinguish card original owner from current controller, printed/current/treated ATK, and single-turn versus persistent and copied state.
- Roll dice, shuffle, check costs, reveal legal hidden information, resolve effects and determine winners on the **server**. Use the same legality engine for human and AI actions.
- Preserve the approved six engine policies (source-leaves-field exceptions, independent persistent effects, trigger ordering and LIFO, copy snapshots, stat separation, safe infinite-loop detection). They are in docs/PRODUCT_VISION_AND_RULES.md.
- Original rules v1.3 and card text are the implementation target, not a license to improvise a card effect.

## Workflow

- Create a feature branch from current main; change source + targeted tests + documentation together.
- For each card: write trigger, legality, cost, target/controller/choice, resolution, duration/expiry, chain interactions and rollback behavior.
- Test valid and invalid moves, random/dice boundaries, target movement, opponent reactions, simultaneous destruction/death, AI behavior, private information, replay/reconnect.
- Run: npm test; npm run check:data; npm run test:matrix. Review npm run check:coverage diffs: it **rewrites** docs/AUTOMATION_COVERAGE.md.
- Confirm GitHub CI succeeds before merging the PR to main. Update implementation history, open-ruling entries and coverage numbers when applicable.
- Avoid claims of full automation or deployed production until acceptance criteria in docs/ROADMAP_AND_ACCEPTANCE.md are met.

**Preferred first work:** bring the canonical v1.3 card source into the repository (rights permitting); reconcile generated coverage reports; integrate the common event/response chain and then cover missing effects with tests. Do not re-ask the user questions already resolved and recorded in docs/DECISIONS_AND_CORRECTIONS.md.


## 2026-10-13 R01 follow-up (PR #44)

- Ten targeted automated spells now use the persisted opponent-pass / LIFO spell stack (3 prior + 7 additional target-free cards). Other automatic spell effects are not presumed fully reactive. See `tests/spell-response-expanded.test.mjs` and `docs/EFFECT_STACK_AND_PERSISTENCE.md`.


## Codex handoff and continuous maintenance

- Start with [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md), [docs/CODEX_RULES_REFERENCE.md](docs/CODEX_RULES_REFERENCE.md), and [docs/CODEX_IMPLEMENTATION_PLAN.md](docs/CODEX_IMPLEMENTATION_PLAN.md); compare every claim to current main and open issues #21–#29.
- The user's original v1.3 DOCX/JSON master documents have NOT yet been committed; do not fabricate source files, effect words, card IDs, dates or completed card automation. Current live catalog is `public/data/catalog.json.gz.b64`.
- For a code PR, update effect-level evidence and current summaries, use branch tests + both GitHub CI workflows at final head SHA, then squash-merge, verify post-merge main CI, and comment on the corresponding issue.
- Older PR comments and old counts (155/98 and 156/97) are HISTORICAL; use the latest generated audit for current figures. Remove contradictory *current* claims in user-facing docs rather than merely appending conflicting statements.

## 2026-10-15 user-delegated card and ruling refinement

The user authorized autonomous fixes for ambiguous rulings and overpowered effects, while preserving the whole deck’s flow and creative intent. Follow docs/CARD_REFINEMENT_POLICY.md. Do not re-request approval for each ruling. Preserve established rulings as the baseline; justify any necessary revision with before/after text, deck-wide reasoning and regression evidence. Runtime card text may be patched under this authorization, with history in docs/card-patches.json; never pretend it is the missing canonical source. Current four elemental replacement summons negate back to their original hand/deck/grave zone (user-confirmed); already-paid costs and shared usage stay spent.

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
