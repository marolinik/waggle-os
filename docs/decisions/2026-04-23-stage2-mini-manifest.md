# C3 Stage 2 Mini — Per-Run Manifest v1

**Manifest SHA-256:** `07cd1d8fe139498f8c54262db8fe6f260f3757bedf86b127bf32d7dc5894eb9d`
**Manifest SHA-256 (short):** `07cd1d8fe139`
**Machine-readable twin:** `decisions/2026-04-23-stage2-mini-manifest.manifest.yaml`
**Parent bench-spec lock:** `decisions/2026-04-22-bench-spec-locked.md` (A3 LOCK v1)
**Datum:** 2026-04-23
**Sprint:** 12 · Task 2 · C3 Stage 2 Mini
**Authority:** PM (Marko Marković), 2026-04-23 v2 brief ratification
**Status:** LOCKED for the C3 Stage 2 mini run. Any parameter change
requires HALT + new decision doc + new hash binding.

---

## 0. TL;DR

C3 Stage 2 mini per-run manifest (16-field spec per A3 LOCK §7). Binds
Qwen 3.6-35B-A3B as subject, 3-primary direct-routed judge ensemble
(Opus 4.7 + GPT-5.4 + Gemini 3.1 Pro Preview) + Grok 4.20 direct tie-break,
4 cells × 100 LoCoMo instances = 400 evaluations, seed 42, $250 hard cap,
a3_failure_code namespace split live, resolveTieBreak wire live.

---

## 1. Routing policy (updated v2 2026-04-23)

All three primary judges + the tie-break reserve use LiteLLM local
aliases that route DIRECT to the upstream provider API. Subject model
retains the OpenRouter bridge (no direct DashScope alternative for the
`qwen3.6-35b-a3b-via-openrouter` alias per Sprint 11 Day-1 OVERRIDE
+ §2 pre-kick LOCKED routing).

| Role      | LiteLLM alias                     | Upstream                        | API key env         |
|-----------|-----------------------------------|---------------------------------|---------------------|
| Judge #1  | `claude-opus-4-7`                 | `anthropic/claude-opus-4-7`     | `ANTHROPIC_API_KEY` |
| Judge #2  | `gpt-5.4`                         | `openai/gpt-5.4`                | `OPENAI_API_KEY`    |
| Judge #3  | `gemini-3.1-pro`                  | `gemini/gemini-3.1-pro-preview` | `GEMINI_API_KEY`    |
| Tie-break | `grok-4.20`                       | `xai/grok-4.20`                 | `XAI_API_KEY`       |
| Subject   | `qwen3.6-35b-a3b-via-openrouter`  | `openrouter/qwen/qwen3.5-35b-a3b` (bridge) | `OPENROUTER_API_KEY` |

Routing arch + smoke-verification record: `sessions/2026-04-23-litellm-config-audit.md`.

## 2. Pinning decisions

- **claude-opus-4-7** — canonical Anthropic dated family alias resolved
  at kickoff via live `/v1/models` probe. `anthropic_immutable` pinning
  surface (immutable dated snapshots upstream, no carve-out reason).
- **gpt-5.4** — OpenAI floating alias (no immutable snapshot exposed
  on the Chat Completions surface for the gpt-5.x family). Floating
  alias mandated by B3 addendum § 5.
- **gemini-3.1-pro** — Google AI Studio floating alias served as
  `gemini/gemini-3.1-pro-preview` (no stable variant as of 2026-04-23
  01:47 UTC per OpenRouter catalog probe + direct AI Studio smoke at
  02:35:00Z). Preview-alias stability guaranteed within a release
  window, not across cycles. Replay-time verification required.
  Floating alias mandated by B3 addendum § 5.
- **grok-4.20** — xAI floating alias. No immutable snapshot upstream.
  Floating alias mandated by B3 addendum § 5. Tie-break reserve;
  activates on 3-primary 1-1-1 vote split per B2 LOCK § 1.
- **qwen3.6-35b-a3b-via-openrouter** — subject model, OpenRouter bridge
  alias routes to `qwen/qwen3.5-35b-a3b` (one-minor regress vs the
  DashScope-direct `qwen3.6-35b-a3b` canonical alias). DashScope-direct
  unavailable in this run per Sprint 11 Day-1 OVERRIDE.

## 3. Known scope-outs for mini

### F6 / F_other live-judge emission

The judge response parser (`packages/server/src/benchmarks/judge/failure-mode-judge.ts`
Zod schema + `buildJudgePrompt`) still targets the Sprint 9 5-value
`FailureMode` space (F1..F5). The A3 LOCK § 6 rubric block builder
(`benchmarks/harness/src/failure-taxonomy/rubric.ts::buildJudgeRubricBlock`)
is shipped and emits deterministically, but it has not yet been spliced
into the Task 2 runtime judge prompt.

**Impact on this mini run:**
- F6 (format-violation) and F_other (escape hatch) counts will be 0 in
  `aggregate.json::failure_distribution.counts` for all 4 cells.
- The distribution remains structurally valid — (null + F1..F5) sums to
  400 across cells.
- Exit-criterion +12 grep
  (`jq '.a3_failure_code' benchmarks/runs/<run>/*.jsonl | sort | uniq -c`)
  matches verbatim against `failure_distribution.counts` per A3 namespace
  split contract. The grep just reports 0 for F6 and F_other keys.
- F_other review-flag gate stays OFF trivially: 0/400 = 0% < 10% strict
  greater-than threshold.
- The `a3_failure_code` column is still populated for every judged row
  via `mapLegacyToA3()` (1:1 pass-through of F1..F5 → F1..F5, null → null).

**Activation path:** Task 2 Phase 2 (deferred) — buildJudgeRubricBlock()
splice + Zod enum expansion to 8-value space + follow-on test coverage.

### models.json provider-field union lag

The `ModelProvider` union in `benchmarks/harness/src/types.ts` lacks
direct-variant members (no `'openai'`, `'google_ai_studio'`, `'xai'`).
`models.json` entries for `gpt-5.4` and `gemini-3.1-pro` retain
`*_via_openrouter` provider labels for TypeScript compatibility even
though runtime routing is direct. The `litellmModel` field + the
pinning-surface carve-out reason fields encode the direct-routing arch
faithfully; the `provider` cosmetic drift is non-blocking for C3 mini.

**Activation path:** types.ts union extension + models.json provider
field refresh — dedicated cleanup commit.

## 4. Invocation command (bound to this manifest's hash)

```bash
node benchmarks/harness/src/runner.ts \
  --model qwen3.6-35b-a3b-via-openrouter \
  --cell raw,filtered,compressed,full-context \
  --dataset locomo \
  --limit 100 \
  --per-cell \
  --seed 42 \
  --live \
  --budget 250 \
  --judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro \
  --manifest-hash 07cd1d8fe139498f8c54262db8fe6f260f3757bedf86b127bf32d7dc5894eb9d \
  --emit-preregistration-event
```

`--manifest-hash` is the full SHA-256 (64-char lowercase hex) of the YAML
file bytes. The runner's `parseArgs` enforces this format and emits
`bench.preregistration.manifest_hash` on run start.

The runner's `CANONICAL_MANIFEST_PATH` constant hard-codes the A3 LOCK
parent manifest path (`decisions/2026-04-22-bench-spec-locked.manifest.yaml`)
in the emitted event's `manifest_path` field. This is a known minor
audit-trail drift: the emitted path points to the parent, while the
hash is of this per-run YAML. Audit reviewers should read this manifest
via the path in the event's payload comment / related section, cross-
referencing this document. A types.ts fix to extend the emitted path
field is a non-blocking Task 2 Phase 2 candidate.

## 5. Exit criteria (11 original + 2 added per brief §6)

See `briefs/2026-04-23-cc-sprint-12-task2-c3-mini-kickoff.md` §6 for the
full list. Two added criteria specific to the namespace-split + wire
verification:

- **+12.** `JsonlRecord` shape: every judged row carries `a3_failure_code`
  + `a3_rationale` columns; the `jq`-extracted distribution must match
  `aggregate.json::failure_distribution.counts` verbatim.
- **+13.** Live `resolveTieBreak` invocation count in pino log equals
  `aggregate.json::tie_break_activations`. Smoke-fixture pre-encode
  pattern (tests/smoke/smoke-run.test.ts) must not appear on the live
  JSONL path (it doesn't — runner.ts uses the judge-runner.ts dynamic-
  import real resolver since commit `80896f1`).

## 6. Budget ledger

| Phase                         | Expected | Cap |
|-------------------------------|----------|-----|
| Pre-kick §2 trio              | $0       | —   |
| §3 Docker health              | $0       | —   |
| §3.5 LiteLLM audit + smoke    | ~$0.001  | —   |
| §4 Manifest emit              | $0       | —   |
| §5 Live run                   | $110–185 (revised, direct-provider aware, -5% vs OpenRouter-for-all) | $250 hard |
| **Hard abort**                |          | $325 (130% of cap) |

OpenRouter credit headroom at §3 check: $96.69 remaining of $495
total. Expected subject-model spend on the bridge: $30–60 (well inside
headroom). Judge direct-provider spend goes against Anthropic + OpenAI
+ Google AI Studio + xAI accounts (not tracked here; harness
--budget=$250 hard cap applies across all providers via local cost
accumulator).

## 7. Related

- `briefs/2026-04-23-cc-sprint-12-task2-c3-mini-kickoff.md` — v2 brief
  (authoritative)
- `decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 parent
- `decisions/2026-04-22-bench-spec-locked.manifest.yaml` — A3 LOCK YAML twin
- `decisions/2026-04-22-tie-break-policy-locked.md` — B2 LOCK (wire lives via
  commit `80896f1` with audit-slug alignment via `89268ae`)
- `decisions/2026-04-22-b3-lock-dashscope-addendum.md` — B3 addendum pinning-surface contract
- `decisions/2026-04-23-jsonl-record-taxonomy-split-locked.md` — §2.1 Opcija C LOCK
- `sessions/2026-04-23-sprint-12-task2-c3-stage2-mini-exit.md` — §2 pre-kick session 1 exit ping
- `sessions/2026-04-23-litellm-config-audit.md` — §3.5 direct-provider audit record
- Waggle-OS commits (on origin/main): `7b7436d` §2.1, `68f26ba` §2.2,
  `89268ae` §2.3, `34ba083` §3.5

---

**LOCKED. Hash binding `07cd1d8fe139498f8c54262db8fe6f260f3757bedf86b127bf32d7dc5894eb9d`
is the audit anchor for the C3 Stage 2 mini run. Any post-lock parameter
change requires HALT + new decision doc + new hash per A3 LOCK § 5
vN+1 protocol.**
