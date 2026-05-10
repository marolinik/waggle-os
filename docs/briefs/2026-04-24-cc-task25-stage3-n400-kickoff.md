# CC-1 Brief — Task 2.5 Stage 3 N=400 SOTA Endpoint Kickoff

**Date:** 2026-04-24
**Sprint:** 12 · Task 2.5 · Stage 3
**Branch:** `feature/c3-v3-wrapper` (continuation; HEAD = `373516c`)
**Primary artefact on completion:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-24-task25-stage3-n400-complete.md`
**Authority:** PM (Marko Marković) — Option 1 (N=400 direct) ratified
2026-04-24 on Gate C PARTIAL PASS exit.

---

## 0. Context recap (mandatory read before §1)

Stage 2-Retry Gate C closed 2026-04-24 with PARTIAL PASS 3/4 criteria:
retrieval − no-context = +25pp (5× brief target), monotonicity chain
no-context (0.10) < retrieval (0.35) < agentic (0.40) < oracle (0.55)
observed clean. Fisher two-sided p=0.127 marginal (miss <0.10 by 0.027);
one-sided p=0.064 would pass. PM read: signal is thesis-validation
grade, marginality is power-gated at N=20 not signal-gated.

**PM ratification 2026-04-24**: Option 1 — N=400 direct escalate, no
intermediate seed-43 N=40 hedge. Rationale: same 25pp effect at N=400
yields Fisher two-sided p<0.001 trivially; intermediate hedge adds
$1.50 cost without new signal that N=400 does not already produce.
SOTA endpoint composition happens on N=400 exit, not on an intermediate.

Stage 3 is **execution-only** — no cell-semantics changes, no
substrate changes, no agent-loop changes. The code frozen at `373516c`
is the endpoint. Stage 3 produces: manifest v4 pre-registration (ex-ante
lock), N=400 run, Gate D exit, SOTA claim composition scope draft.

**Gate C exit report full text:**
`D:\Projects\PM-Waggle-OS\sessions\2026-04-24-task25-stage2-retry-complete.md`

---

## 1. Scope — three deliverables

### 1.1 Manifest v4 pre-registration (ex-ante lock)

Draft a pre-registration document at
`benchmarks/results/manifest-v4-preregistration.md` AND a structured
twin at `benchmarks/results/manifest-v4-preregistration.yaml`. Both
must be committed and SHA-256-hashed BEFORE the N=400 run starts —
that commit is the pre-registration anchor. Any change to success
criteria after the anchor commit invalidates the pre-registration.

Required content, both formats:

- **Primary hypothesis (directional)**: retrieval judge-accuracy >
  no-context judge-accuracy by ≥ 5pp, evaluated at Fisher exact
  **one-sided** p < 0.10. The one-sided test is justified by the
  theory-driven directional claim (memory provides lift, not noise)
  and is locked ex-ante, not picked post-hoc.
- **Secondary endpoints** (all ex-ante, all non-blocking on primary
  but reported):
  - Monotonicity chain: no-context ≤ retrieval ≤ agentic ≤ oracle-
    context, with each neighbour pair tested for ≥ 0pp lift at
    one-sided p < 0.20 (loose to detect direction, not significance).
  - Agentic lift over retrieval: agentic − retrieval ≥ 0pp.
  - Full-context abstain penalty: oracle-context − full-context
    reported as diagnostic (expected positive given SYSTEM_EVOLVED
    strict abstain).
- **Sample**: 5 cells × N=400 = 2000 judge-scored evaluations.
  Instance selection seed fixed and recorded. Same LoCoMo canonical
  dataset as Gate C (SHA-256 of source file recorded).
- **Model stack**: subject route table (DashScope direct primary +
  OpenRouter fallback_1 + NOT_AVAILABLE fallback_2), judge ensemble
  (Opus 4.7 + GPT-5.4 + Gemini 3.1 Pro preview, majority vote), SHAs
  of their model-identifier strings.
- **Substrate**: conv-scope filter via HybridSearch.search gopId
  param (search.ts:14), top-K=20, embedder ollama + nomic-embed-text,
  chunked vector index batch 200.
- **SYSTEM_AGENTIC prompt**: verbatim bytes + SHA-256 (the softened
  version from Gate B §1.3).
- **Stopping rules**: budget hard-cap $30, streak halt (§7.2), health
  check (§7.3), runner lock (§7.4), no p-hacking interim looks.
- **Post-hoc exclusion policy**: NONE. All 2000 evals that pipeline
  emits enter the analysis. If a row has a judge failure, it counts
  as evaluator-loss and is reported separately; not excluded from the
  cell accuracy denominator (this prevents selective exclusion).
- **Deviation policy**: any deviation from this document during run
  or analysis → immediate halt, PM raise, re-pre-register if accepted.

Anchor commit subject: `docs(benchmarks): Task 2.5 Stage 3 manifest v4
pre-registration — ex-ante lock before N=400`. Record the commit SHA
+ timestamp in both md and yaml twin.

### 1.2 N=400 execution run

Kick `scripts/run-mini-locomo.ts` with the v3 cells surface
(`--v3-cells` flag from Stage 2-Retry §1.5) at N=400 per cell. Five
cells × 400 = 2000 evals. Use same seed as Gate C for instance
selection unless there's a structural reason to reroll (document if
so).

Respect budget cap: hard halt at **$28** (2pp below the $30 cap to
leave room for final judge calls mid-flight). If at any point
accumulated spend crosses $28, halt immediately, write partial JSONL
to disk, and exit with Gate D-halted status.

Concurrency: whatever the harness currently defaults to (concurrency
2 per Stage 2-Retry ratified). No tuning for Stage 3.

Expected wall-clock: ~40-60 min based on Gate C's 100-eval run at
46.6% of $2.50 cap budget; N=400 scales roughly linearly, call it
$23 expected + some reasoning token variance up to $28.

### 1.3 Gate D exit report + SOTA claim composition scope

On exit, write the completion report at
`D:\Projects\PM-Waggle-OS\sessions\2026-04-24-task25-stage3-n400-complete.md`
with sections mirroring Stage 2-Retry exit:

- §0 Pre-registration cross-reference (manifest v4 SHA + anchor
  commit SHA, confirm no deviations during run)
- §1 Verification (suite, tsc clean — no code changes expected since
  373516c so this is just a sanity re-run)
- §2 Commits on feature/c3-v3-wrapper (manifest v4 anchor + any
  execution-trail commits if new JSONL files were added)
- §3 N=400 runtime report: per-cell judge-accuracy, Fisher one-sided
  p for primary hypothesis, Fisher two-sided p as diagnostic, effect
  size + 95% Wilson CI, monotonicity chain evaluation, agentic
  behaviour triple (search rate, turns histogram, unknown rate),
  budget used, halt/retry/fallback counters
- §4 Thesis-validation evidence chain: reference Gate B dry-run 8/20
  whole-corpus leak + Gate C monotonicity + Stage 3 N=400 primary
  endpoint; assemble as three-point chain
- §5 Deviations (if any) — expected: none
- §6 SOTA claim composition scope (NOT the claim itself — just the
  scope of what the claim can and cannot say given the Stage 3 data):
  - What can be claimed: memory-lift magnitude and significance,
    per-cell numbers, monotonicity framework, conv-scope fair-
    comparison methodology
  - What cannot be claimed yet: direct comparability to Mem0 91.6%
    (their setup is whole-corpus with their memory-synthesis layer,
    not conv-scope with ours — scope disclosure required); multi-
    model generalization (Stage 3 is Qwen-only); production claims
  - Open questions for PM: public-claim phrasing, benchmark
    publication venue, co-comparison with Mem0 at matched scope
    (would require separate run)

CC-1 does NOT compose the public SOTA claim itself — that is PM +
Marko authoring. CC-1 delivers the scope + data that bounds what the
claim can truthfully say.

Gate D exit ping format:

```
[GATE-D-COMPLETE] status: {pass|fail|partial} — {headline}
artefact: sessions/2026-04-24-task25-stage3-n400-complete.md
manifest_v4_sha: {sha256}
preregistration_anchor: {commit SHA}
commits: {new SHAs} on feature/c3-v3-wrapper
head: {SHA}
judge_acc: no-context={x}, oracle-context={x}, full-context={x}, retrieval={x}, agentic={x}
primary: retrieval − no-context = {x}pp, Fisher one-sided p={p} (target <0.10)
secondary: monotonicity chain {pass|partial|fail}, agentic ≥ retrieval {pass|fail}
budget: ${x} / $30 (halt cap $28)
next: PM decides {SOTA claim compose | publish gate | further scope}
```

---

## 2. Non-scope — do not touch

- No cell-semantics changes. Code at 373516c is frozen endpoint.
- No substrate changes (conv-scope filter, top-K=20, ingest chunking).
- No SYSTEM_AGENTIC changes — the softened Gate B version is locked.
- No agent-loop changes — §1.4 fallback and search_memory tool stable.
- No judge ensemble changes (Opus 4.7 + GPT-5.4 + Gemini 3.1).
- No subject route table changes (DashScope + OpenRouter + NOT_AVAILABLE).
- No tests to add/modify — 325/325 suite stands.
- Do NOT compose the public SOTA claim. Deliver scope + data only.

---

## 3. Budget + halt rules

**Budget**: $30 cap, $28 hard halt (2pp below cap). Expected burn
~$23 based on Gate C cost/eval × 20.

**Halt conditions**:
- Budget $28 crossed → immediate halt, partial JSONL persisted
- Fetch-retry streak §7.2 → halt per existing logic
- Health check §7.3 fails → halt per existing logic
- Runner lock §7.4 contention → halt per existing logic
- Deviation from manifest v4 pre-registration (any) → immediate halt,
  PM raise

**No interim looks policy**: do not peek at partial results and
selectively halt. The N=400 run is pre-registered; halt only on the
conditions above.

---

## 4. PM gates

**Gate P (pre-run, pre-anchor)**: commit manifest v4 pre-registration
md + yaml twin, halt, await PM ratification of the pre-registration
document. This is the only intermediate halt. PM confirms the ex-ante
locks match Stage 2-Retry Gate C ratifications, then issues GO.

**Gate D (post-run exit)**: exit report per §1.3. PM hard stop before
SOTA claim composition, public claim drafting, or any external
communication.

No self-advance at either gate.

---

## 5. Paste-ready prompt for continuing CC-1 session

If fresh session, paste into new CC-1 context. If continuing active
session, paste as next turn:

```
Task 2.5 Stage 3 N=400 SOTA endpoint kickoff. Branch feature/c3-v3-
wrapper at HEAD 373516c (Stage 2-Retry frozen, execution-only from
here). Full brief at
D:\Projects\PM-Waggle-OS\briefs\2026-04-24-cc-task25-stage3-n400-kickoff.md —
read all the way through before any action.

Context: Gate C 2026-04-24 returned PARTIAL PASS 3/4 with retrieval −
no-context = +25pp (5× target), monotonicity chain no-context <
retrieval < agentic < oracle clean, Fisher two-sided p=0.127 marginal
due to N=20 power limit not signal. PM ratified Option 1 — N=400
direct escalate.

Stage 3 scope (three deliverables, execution-only):
- §1.1 Manifest v4 pre-registration: md + yaml twin at
  benchmarks/results/manifest-v4-preregistration.{md,yaml}, committed
  and SHA-256-hashed BEFORE N=400 run (ex-ante anchor). One-sided
  primary hypothesis locked: retrieval > no-context ≥ 5pp, Fisher
  one-sided p<0.10. Secondary endpoints + stopping rules + NO post-hoc
  exclusion policy all spelled out.
- §1.2 N=400 execution: 5 cells × N=400 = 2000 evals via --v3-cells
  flag at concurrency 2, budget cap $30 with $28 hard halt.
- §1.3 Gate D exit report at PM-Waggle-OS/sessions/2026-04-24-task25-
  stage3-n400-complete.md with §0-§6 per brief. CC-1 does NOT compose
  public SOTA claim — delivers scope + data only.

Two PM gates:
- Gate P: halt after manifest v4 committed, await PM ratification of
  pre-registration content BEFORE N=400 kicks.
- Gate D: halt after N=400 exit, PM hard stop before any SOTA claim
  composition.

Non-scope: cell semantics, substrate, SYSTEM_AGENTIC, agent-loop,
judge ensemble, subject routing, test suite — all frozen at 373516c.
No additions.

Budget $30 cap / $28 hard halt. No interim looks. Any deviation from
pre-registration during run = immediate halt.

Start with §1.1 — draft manifest v4 pre-registration md + yaml twin,
commit as anchor, halt at Gate P. Await PM ratification before §1.2
N=400 kick.
```

---

## 6. PM closing notes

One-sided test is locked ex-ante because the directional hypothesis
is theory-driven, not data-driven — memory provides lift if the
cognitive-layer framing is correct, and our task from the start was
to measure lift magnitude and significance, not direction. If the
pre-registration text is ever challenged externally, the Gate B
dry-run (whole-corpus leaks 8/20 quantified before any N=20 data was
seen) and Gate C monotonicity observation are the ex-ante scaffolding
that justifies the directional framing.

At Gate D exit, if primary endpoint passes (Fisher one-sided
p<0.10 on retrieval − no-context ≥ 5pp), we compose the SOTA claim
against the memory-lift framework — NOT against Mem0 91.6% directly,
because their setup is whole-corpus + memory-synthesis layer and ours
is conv-scope + RRF-retrieval. Matched-scope Mem0 co-run is a
subsequent question, not a Stage 3 blocker.

If primary endpoint fails at Gate D despite Stage 2-Retry Gate C's
signal, we have a power-vs-signal question that requires PM
adjudication — but that's <2% probability given Gate C's effect size
and coherent monotonicity chain. We plan for pass, not fail, at
Stage 3.
