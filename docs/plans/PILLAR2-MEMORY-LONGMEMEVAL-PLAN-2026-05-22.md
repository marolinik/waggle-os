# Pillar 2 — Memory SOTA (LongMemEval) — plan

> Companion to HARNESS-BENCHMARK-GOAL (two co-equal pillars). Pillar 1 (harness) done at N=40
> (Waggle on par with Hermes). Pillar 2 proves the **memory substrate** is at/near SOTA — the
> one axis where Waggle can *beat* frontier long-context, not just match.

## Why LongMemEval (upgrade from the C-1 LoCoMo run)
- LoCoMo (C-1, done): 67.8% trio-strict, +4.6pp over Mem0 paper. "Modest by 2026 standards."
- **LongMemEval**: 500 questions, **5 abilities** — info-extraction, multi-session reasoning, temporal
  reasoning, **knowledge-updates**, **abstention** (the last two LoCoMo lacks). The credible, citable
  successor. (BEAM = the unsaturated flagship; later.)
- SOTA reference: multi-session reasoning ~70% (Mem0); top systems ~94% overall. Mem0's own
  numbers are the comparison anchor — but we run our own under matched protocol (no apples-to-oranges).

## Reusable infra (LoCoMo harness — `D:/Projects/hive-mind-test/scripts/locomo/`)
The full pipeline already exists and is directly adaptable:
| LoCoMo script | Role | LongMemEval adaptation |
|---|---|---|
| `00-fetch-dataset.mjs` | download + SHA-pin dataset | swap source → LongMemEval (HF `xiaowu0162/LongMemEval` / official release); LongMemEval_S (~115K tok, 40 sessions) |
| `01-prepare-workspace.mjs` | fresh hive-mind workspace | reuse; **per-question** haystack isolation (LongMemEval gives each Q its own session set) |
| `02b-ingest-all-convs.mjs` | ingest sessions → FrameStore | adapt to LongMemEval session schema |
| `03b-cognify-all.mjs` | memory extraction | reuse |
| `12-cell-retrieval.mjs` | recall top-K → subject model answers (via `cli/recall-context.js`) | reuse core; subject = Sonnet 4.6 AND Qwen 3.6 35B (local — `34-*-qwen` precedent) |
| `38-judge-trio-v5.mjs` + `38b-redo` | trio-strict judge | reuse; **add abstention handling** (judge must accept "I don't know" when gold = no-answer) |
| `14/24/34-report` | aggregate + report | reuse; report PER-ABILITY (5 categories) + overall |

## Adaptation specifics (the real work vs LoCoMo)
1. **Per-question haystacks.** LongMemEval associates each question with its own set of haystack
   sessions (some relevant, most distractors). Either (a) one workspace per question (clean isolation,
   500 ingests) or (b) one big workspace + per-question session-scope filter. (a) is cleaner/defensible.
2. **Abstention category.** Some questions have NO answer in the haystack — the system must abstain.
   Retrieval + subject prompt must allow "not in memory"; judge must score abstention correctly.
3. **Knowledge-updates.** Facts change across sessions; retrieval must surface the LATEST. Tests the
   substrate's bitemporal/recency handling (KnowledgeGraph validity).
4. **Token-cost reporting.** Per Mem0's 2026 framing, report accuracy AT a token budget (retrieval is
   cheap vs full-context) — a Waggle advantage to surface.

## Two subject-model lanes (mirror Pillar 1)
- **Sonnet 4.6** (cloud) — the capability number.
- **Qwen 3.6 35B thinking** (LOCAL) — the sovereign number ([[project-pillar1-qwen-local-followup]]).
  The `34-cell-retrieval-v4-qwen` + `35-judge-*-qwen` scripts prove the local-Qwen path already works.

## Execution steps
1. **Fetch + SHA-pin LongMemEval** (adapt `00-fetch`). Confirm exact HF/GitHub source + schema.
2. Build sample (start small — N=50 across the 5 abilities — for a probe before the full 500).
3. Ingest haystacks → cognify (per-question workspaces).
4. Retrieval cell (Sonnet) → answers; then Qwen-local cell.
5. Trio-strict judge (+ abstention handling) → per-ability + overall.
6. Report vs Mem0 anchor under matched protocol. Scale 50 → 500 if the probe holds.

## Budget
Retrieval+judge is cheap (LoCoMo full was ~$26). N=50 probe ≈ a few $; full 500 ≈ ~$30-50 incl trio.
Far cheaper than the agentic pillar — and the higher-leverage "Waggle wins" claim.
