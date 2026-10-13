# Repository agent instructions — Combine of Cards

This file is for a new coding assistant taking over the repository after the 2026-10-13 ChatGPT conversation.

## Read these before changing source

1. docs/START_HERE_NEW_CHAT.md — current implementation status and the full restart prompt.
2. docs/PRODUCT_VISION_AND_RULES.md — approved rules and product intent.
3. docs/DECISIONS_AND_CORRECTIONS.md — user-approved card/engine corrections. **Do not revert Gandrae Dragon's self-exclusion.**
4. docs/OPEN_RULINGS_REGISTER.md — ambiguous rulings, proposed fixes and provisional code behavior.
5. docs/ROADMAP_AND_ACCEPTANCE.md — prioritized acceptance criteria.
6. docs/ARCHITECTURE_AND_RUNBOOK.md — commands, APIs, storage and security.
7. docs/AUTOMATION_COVERAGE.md — card coverage; **partial is not complete**.
8. Current main source, tests and GitHub Actions. Check their actual state before editing.

## Product requirements

- Preserve the user's custom TCG v1.3: **24 premade playable decks**, **254 card records**, no card mixing across premade decks.
- Never restore the deleted decks: 합체 기계, 코미컬, 럭키, 카지노이드, 비트스타즈, 파트너 몬스터즈, 코브라, 아홉꼬리.
- The goal is **fully automatic server-authoritative card effects**, AI duels (choose opponent deck/random; easy, medium, hard), PvP, rules conflict diagnostics and production-ready deployment.
- As of beta.10, the code supports **156 partially**, **97 manually/unsupported**, **1 basic**; 70 spell handlers. **Full automation is not achieved.**
- Source v1.3 DOCX and comparison JSON were created in a prior conversation but are **not yet committed** to this public repository. See docs/SOURCE_DATA_PROVENANCE.md.

## Latest implementation update (2026-10-13)

- beta.10: 156 partial / 97 manual / 1 basic; 13 field abilities; Black Metal Fusion Up grave recovery and independent effect limits; Crash Voltage discard/destruction and confirmed dice-result piercing (R28).
- **R05/R06/R07/R08/R09/R10/R11/R12/R13/R21/R22/R23/R24/R25/R28/R29/R30 were user-approved 2026-10-13**: see docs/RULINGS_CONFIRMED_2026-10-13.md. Never describe these 17 as open. Some confirmed behavior (notably R22 response window and all R05 token paths) remains incompletely implemented.
- Generated coverage reports and manual notes are now separated. Edit docs/AUTOMATION_NOTES.md for prose and docs/effect-coverage.json for effect records. Run npm run check:coverage then npm run check:coverage -- --check. CI must reject stale reports without silently regenerating them.

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
