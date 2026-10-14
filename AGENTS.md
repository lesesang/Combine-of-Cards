# Repository agent instructions — Combine of Cards

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
- **Latest implementation (four elemental replacements, 2026-10-15): 163 partially supported / 90 manually unsupported / 1 basic, 71 registered spell handlers, 61 spells in opponent-pass effect stack and only 69 effect-number evidence records. Complete coverage certified: 0.** The older server banner remains beta.10, not an accurate support inventory. Full automation is not achieved.
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
