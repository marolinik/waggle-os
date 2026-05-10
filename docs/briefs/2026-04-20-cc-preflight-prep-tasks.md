# CC Brief — Preflight Prep Mini-Sprint

**Datum:** 2026-04-20 PM (post-Sprint-7 push)
**Autor:** PM (Claude, za Marka → CC)
**Scope:** four tasks to scaffold preflight gate Stage 0 → Stage 1 → Stage 2 execution. No preflight run in this sprint — this is code + data + test scaffolding only. Zero API spend.
**Exit target:** sprint-8-exit ping file committed to `PM-Waggle-OS/sessions/2026-04-XX-sprint-8-exit.md` with pass/fail + commit SHAs per task.

---

## Context

Sprint 7 (7 tasks, 7 commits, 14-file turnId propagation) pushed to origin/main 2026-04-20 PM. Four-cell harness scaffold, M-11 real embedder with fail-loud 503 contract, and H-AUDIT-1 code-backed traceability are live.

Between sprint 7 close and now, PM locked **three new OQ resolution sets** (9 resolutions total). You have not seen them. Read them first — they introduce hard constraints that Tasks 1-4 must honor.

## Read-first (sequential, in this order)

1. `D:\Projects\PM-Waggle-OS\decisions\2026-04-20-preflight-oq-resolutions-locked.md` — Stage 2 sample structure (13/13/12/12), re-run policy (same sample, max 3 attempts, 3 formal exception types), budget amendment ($150 Block 4.3)
2. `D:\Projects\PM-Waggle-OS\decisions\2026-04-20-verbose-fixed-oq-resolutions-locked.md` — verbose-fixed template language (English), version lock timing (after Week 2), unit test requirement (explicit, not runtime-only)
3. `D:\Projects\PM-Waggle-OS\decisions\2026-04-20-failure-mode-oq-resolutions-locked.md` — F1-F5 MECE taxonomy, F3 bucket for mixed errors, calibration set n=10
4. `D:\Projects\PM-Waggle-OS\strategy\2026-04-20-failure-mode-taxonomy.md` — full v1 spec with judge prompt §4 and rubric §5
5. `D:\Projects\PM-Waggle-OS\strategy\2026-04-20-verbose-fixed-template.md` — 6-segment template, forbidden elements list, validation checklist
6. `D:\Projects\PM-Waggle-OS\strategy\2026-04-20-preflight-gate-spec.md` — full preflight gate operational spec

If anything contradicts this brief, the LOCKED decision files win. Flag the contradiction in the exit ping.

---

## Task 1 — Stage 2 sample lock file

**Output:** `benchmarks/data/preflight-locomo-50.json` (or `packages/server/benchmarks/data/preflight-locomo-50.json` — pick whichever matches harness conventions from Sprint 7).

**Source:** LoCoMo public benchmark dataset (Zhang et al. 2024, HuggingFace `snap-stanford/locomo` or equivalent canonical source).

**Composition:** 50 instances, distribution **13 single-hop / 13 multi-hop / 12 temporal / 12 open-ended**. No deviation from these counts.

**Selection:** deterministic stratified sample with `seed=42`. Document the selection algorithm in a comment header of the JSON file (e.g., "sorted by instance ID ascending within category, seed=42 stable selection of first N per category after Fisher-Yates shuffle").

**Schema per instance:**
```json
{
  "id": "<locomo_instance_id>",
  "category": "single-hop" | "multi-hop" | "temporal" | "open-ended",
  "context": "<ground-truth supporting conversation/excerpt shown to model>",
  "question": "<question text>",
  "ground_truth_answer": "<canonical answer>",
  "locomo_metadata": { ... original LoCoMo fields preserved ... }
}
```

**Acceptance:**
- File committed to repo
- Harness runtime assertion added (where `runner.ts` loads sample): if category distribution ≠ 13/13/12/12, throw with explicit error message `Pre-flight sample distribution mismatch: expected 13/13/12/12, got {actual}`
- Smoke test in `benchmarks/harness/tests/smoke.test.ts` (extend existing, don't add new file) asserts the distribution

**Reference:** `decisions/2026-04-20-preflight-oq-resolutions-locked.md` §OQ-PF-1

---

## Task 2 — Failure mode calibration set

**Output:** `benchmarks/data/failure-mode-calibration-10.jsonl` (same directory as Task 1 sample, JSONL format — one instance per line).

**Composition:** 10 LoCoMo instances **non-overlapping** with preflight-locomo-50.json (different instance IDs, same source dataset). Category mix: **3 single-hop / 3 multi-hop / 2 temporal / 2 open-ended**.

**Selection:** deterministic with `seed=43` (different from Task 1 to ensure non-overlap); assert no ID overlap with Task 1 output.

**Schema per line:**
```json
{"id": "<id>", "category": "<cat>", "context": "<ctx>", "question": "<q>", "ground_truth_answer": "<a>", "human_label": {"verdict": null, "failure_mode": null, "rationale": null}}
```

**Leave `human_label` fields null.** PM will fill them in a labeling pass.

**Acceptance:**
- File committed
- Assertion in smoke test: no ID overlap with Task 1 file; category distribution matches 3/3/2/2

**Reference:** `decisions/2026-04-20-failure-mode-oq-resolutions-locked.md` §OQ-FM-3

---

## Task 3 — Verbose-fixed cell isolation unit test

**Output:** `packages/server/tests/benchmarks/verbose-fixed-cell-isolation.test.ts` (or nearest equivalent path matching existing vitest conventions).

**Minimum 3 test cases:**

1. `'verbose-fixed cell invokes zero retrieval calls'` — mock the retrieval stack (combined-retrieval, memory adapter), activate the verbose-fixed cell through the harness cell function, assert `retriever.search` call count === 0.

2. `'verbose-fixed cell invokes zero wiki compiler calls'` — mock `wiki.compile`, activate verbose-fixed cell, assert call count === 0.

3. `'verbose-fixed cell invokes zero memory read calls'` — mock the memory reader, activate verbose-fixed cell, assert call count === 0.

**Framework:** vitest (match Sprint 7 convention from `turn-context.test.ts`).

**Acceptance:**
- All 3 tests green in CI
- Any future PR breaking cell isolation triggers test failure
- Test included in `vitest.config.ts` default test run (no special flag needed)

**Reference:** `decisions/2026-04-20-verbose-fixed-oq-resolutions-locked.md` §OQ-VF-3

---

## Task 4 — Failure mode judge module (scaffold, not wired)

**Output:** `packages/server/benchmarks/judge/failure-mode-judge.ts` (or nearest equivalent in harness layout).

**Content:** pure TypeScript module exporting:

```typescript
export interface JudgeResult {
  verdict: "correct" | "incorrect";
  failure_mode: null | "F1" | "F2" | "F3" | "F4" | "F5";
  rationale: string;
  judge_model: string;
}

export async function judgeAnswer(params: {
  question: string;
  groundTruth: string;
  contextExcerpt: string;
  modelAnswer: string;
  judgeModel: string;          // e.g. "claude-sonnet-4-6"
  llmClient: LlmClient;
}): Promise<JudgeResult>

export async function judgeEnsemble(params: {
  question: string;
  groundTruth: string;
  contextExcerpt: string;
  modelAnswer: string;
  judgeModels: string[];       // typically 4: Sonnet, Haiku, GPT-5, Gemini-Pro
  llmClients: Map<string, LlmClient>;
}): Promise<{
  ensemble: JudgeResult[];
  majority: JudgeResult;
  fleissKappa: number;
}>

export function computeFleissKappa(ratings: JudgeResult[][]): number
```

**Judge prompt:** EXACT text from `strategy/2026-04-20-failure-mode-taxonomy.md` §4, interpolated with `{{question}}`, `{{ground_truth}}`, `{{context_excerpt}}`, `{{model_answer}}`. Do not modify the prompt.

**JSON parsing:** strict schema validation via Zod. If parse fails, retry once with a reminder `"Your previous response was not valid JSON. Return only the JSON object, no prose."`. If second retry fails, throw `JudgeParseError` — do not silently default to incorrect.

**Unit tests in same folder (`failure-mode-judge.test.ts`):**
- Valid JSON parse with all 5 failure modes (5 fixture cases)
- Invalid JSON triggers retry, retry success returns correct result
- Invalid JSON on retry throws `JudgeParseError`
- 4-judge ensemble majority computation (2-2 tie broken by Sonnet, 3-1 majority wins, 4-0 unanimous)
- Fleiss' kappa computed correctly on a hand-crafted 4×10 ratings matrix (use a known test case from statistical literature; target value within 0.01 tolerance)

**NOT in scope this sprint:** wiring judge into `runner.ts`, adding per-instance judge call to the JSONL output flow, calling judge during harness execution. That is Sprint 9.

**Reference:** `strategy/2026-04-20-failure-mode-taxonomy.md` §4 (prompt), §6 (ensemble protocol), §8 (kappa thresholds)

---

## Exit gate

Ping PM via `PM-Waggle-OS/sessions/2026-04-XX-sprint-8-exit.md` (ISO date of completion) with:

- [ ] Task 1 sample file committed, SHA, smoke test assertion green
- [ ] Task 2 calibration file committed (empty human_label), SHA, distribution assertion green
- [ ] Task 3 verbose-fixed cell isolation tests — all 3 green, file path, SHA
- [ ] Task 4 judge module + unit tests — all green, file paths, SHA
- [ ] `tsc --noEmit` clean across all packages
- [ ] Total test count before/after (e.g., 4902 → 4910)
- [ ] Zero regression (re-run full suite, confirm 4901 pre-existing still pass)
- [ ] Zero API spend (confirm no LlmClient calls made outside unit-test mocks)

If any task blocks on a LOCKED decision ambiguity, stop and write a clarification-request ping to PM instead of improvising. LOCKED decisions are source of truth; the brief is summary.

## Not in scope (explicit exclusions)

- Stage 0 Dogfood execution (Marko's personal AI exports harvest + 3-question test)
- Stage 1 mikro-eval run (12 tasks × 3 arms)
- Stage 2 preflight 4-cell run on preflight-locomo-50.json
- Judge wiring into runner.ts JSONL output
- Real embedder key provisioning (that's operational, not engineering)
- Week 1 Qwen3 35B-A3B × LoCoMo main run
