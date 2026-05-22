# Implementation Plan: Agent-Harness Comparison Benchmark Matrix

> Companion to `HARNESS-BENCHMARK-GOAL-2026-05-22.md` (goal LOCKED to Reading B).
> Produced by the planner agent (read-only codebase analysis) 2026-05-22.

## DIRECTION UPDATE (Marko, 2026-05-22 — "positioning must prove strength on the agent harness")

The benchmark must prove **Waggle's OWN harness** is strong — not a third-party reference agent.
Verified finding: the GAIA 2 83.8% used `gaia2-hermes` (a generic worker bridging an upstream model
API to the ARE adapter — **zero Waggle linkage**). So nothing yet proves Waggle's harness. This puts
the **Waggle→ARE adapter back as the CORE deliverable** (the Reading-A piece), reconciled with
Reading B as: *"Waggle = sovereign orchestrator AND ships a first-party harness proven against the references."*

**Arena chosen (Marko): GAIA 2 — reuse the existing rig.** Memory benchmark (LongMemEval/BEAM) drops
to a secondary moat lane. TheAgentCompany deferred to "next" (per BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md).

### CONFIRMED adapter architecture (`waggle_worker`)

GAIA 2 has **no MCP**; it exposes apps as **CLI tools** via a `gaia2-exec` setuid wrapper, and the agent
is a *terminal-using* agent (`--exec-tool terminal` + a scenario-rendered `~/AGENTS.md`). Hermes drives
the env with essentially **one `terminal` tool + AGENTS.md**. Waggle's `runAgentLoop` (`AgentLoopConfig`)
accepts exactly this shape:

| ARE/Hermes contract | Waggle `AgentLoopConfig` field |
|---|---|
| upstream model API (Sonnet 4.6) | `model` + `litellmUrl` + `litellmApiKey` |
| scenario `~/AGENTS.md` | `systemPrompt` |
| single `terminal` tool → `gaia2-exec` | `tools: [terminalTool]` (executor shells to `gaia2-exec`) |
| task over Unix socket | `messages` |
| tool/event capture | `onToolUse` / `onToolResult` (also feeds events.jsonl) |

**`waggle_worker` (Node) responsibilities:**
1. Connect to the adapter Unix socket; send `{"type":"ready"}`; receive `{"type":"message","text":<task>,"run_id"}`.
2. Read `~/AGENTS.md` → `systemPrompt`; define ONE `terminal` tool whose executor runs the command via `gaia2-exec` (so calls land in `events.jsonl` for the judge).
3. Call `runAgentLoop({model: "claude-sonnet-4-6", systemPrompt, tools:[terminal], messages:[task], maxTurns, maxTokenBudget})`.
4. Send `{"type":"response","run_id","state":"final"|"error","message": <final answer>}`.

**`gaia2-waggle` container:** model on `gaia2-hermes` Dockerfile; same `gaia2-init-entrypoint.sh` (adapter + eventd + gaia2-exec + AGENTS.md render); swap `hermes_worker.py` → a Node `waggle_worker` bundling `@waggle/agent` (+ `@waggle/core`, `@waggle/shared`).

**Fairness invariant (the whole point):** same model (Sonnet 4.6), same single-terminal-tool, same AGENTS.md, same judge, same scenarios. The ONLY variable is Waggle's loop logic (planning/reflection/verification-gate). That is exactly "harness strength."

**Scope:** bounded ~1-2 days. Hard parts: (a) containerizing Waggle's Node runtime + TS build inside the image; (b) wiring the terminal tool executor to `gaia2-exec`; (c) matching maxTurns/token budget to Hermes for fairness. Then low-N probe: Waggle vs Hermes vs OpenClaw on search, same protocol.

### De-risk spike finding (2026-05-22) — the native-dep gate

`runAgentLoop` (agent-loop.ts) transitively imports `@waggle/core` via `injection-scanner.ts`
(`scanForInjection`) and `turn-context.ts` (`createCoreLogger`). `@waggle/core`'s barrel re-exports
the substrate from `@waggle/hive-mind-core`, which depends on **`better-sqlite3`** (+ sqlite-vec; CLAUDE.md
notes a `sqlite-vec-windows-x64` variant). The GAIA 2 containers are **Linux**, so the native module must
*load* in Linux — even though the loop never opens a DB (`scanForInjection` is pure regex, `createCoreLogger`
is trivial logging). This is the afternoon-eater flagged earlier; it is **solvable, not blocking**:

- **Path A (cleanest): break the core-barrel dependency for the benchmark worker.** Import `scanForInjection`
  + `createCoreLogger` from deep paths, or vendor minimal copies, so the worker never pulls the DB barrel →
  no native dep at all. Smallest container, no sqlite in the agent image.
- **Path B: Linux-build the stack.** `better-sqlite3 ^12.6.2` has Linux prebuilds (fine via `npm install` in
  Linux); swap `sqlite-vec-windows-x64` → the Linux/cross-platform sqlite-vec. Heavier image, but uses the
  real stack unmodified.

**Recommend Path A** — the loop genuinely doesn't need the DB; a slim worker is faster to build, smaller to
ship, and avoids per-arch native-dep maintenance.

**✅ PATH A PROVEN (2026-05-22).** Spike step 1 done. The agent loop's *entire* runtime closure from
`@waggle/core` is exactly **2 symbols** — `createCoreLogger` + `scanForInjection` — both in DB-free modules
(`logger.ts`, `injection-scanner.ts`, zero sqlite imports). A 2-symbol stub re-exporting them from
hive-mind-core's deep `dist/` paths bypasses the `db.js` barrel (which eagerly loads `better-sqlite3` at
line 14 of the hive-mind-core index). Verified in an isolated dir **outside the monorepo with `better-sqlite3`
not resolvable**: `{ import_ok: true, runAgentLoop: "function", better_sqlite3: "not-resolvable (clean)" }`.
Artifacts: `waggle-os-gaia2-wt/benchmarks/gaia2/spike-waggle-worker/`.

**→ `gaia2-waggle` container collapses to:** `node:20-slim` + agent `dist/` + the 2-symbol stub +
`hive-mind-core/dist/{logger.js,injection-scanner.js}`. No native rebuild, no sqlite. The remaining build
is mechanical: (1) Node `waggle_worker` (socket protocol: ready/message/response); (2) single `terminal`
tool whose executor shells to `gaia2-exec`; (3) Dockerfile modeled on `gaia2-hermes`; (4) low-N probe
Waggle vs Hermes vs OpenClaw, same model+judge+scenarios.

### TWO-PILLAR plan (Marko 2026-05-22: both proofs co-equal)

| Pillar | Track | Near-term move | Status |
|---|---|---|---|
| **1 — Harness SOTA** | GAIA 2 rig (this plan) | build `waggle_worker` (Path A) → low-N Waggle-vs-Hermes-vs-OpenClaw probe | spike in progress |
| **2 — Memory SOTA** | memory benchmarks | LoCoMo done (C-1 67.8% trio-strict) → **LongMemEval** → **BEAM** flagship; ideally on a LOCAL model (sovereign demo) | LoCoMo done; LongMemEval/BEAM = new track |

Both run under the sovereignty triple (local-first / zero-egress / auditable) and feed Tier-1 + Tier-2 deliverables.

---

## DECISIONS LOCKED (Marko, 2026-05-22)
1. **Comparison set = {Hermes, OpenClaw, Oracle} only** — the 3 ARE-native profiles. **Do NOT build ARE adapters for Claude Code / Codex / Claude Cowork.** Those remain governance-only entries (Reading B: "runs safely inside Waggle, audited"), never capability-scored. → Phase 0.3 (adapter scoping) is **dropped**; Phase 0.2 external research is **dropped**; Phase 0 collapses to confirming the 3-profile matrix + Oracle's role as the upper-bound ceiling.
2. **Phase 1 (judge integrity / offline re-judge) green-lit** — start immediately, <$50 judge tokens, no new agent spend.
3. **Lower-N first** — probe the matrix at low N before committing to any N=160 spine. No ~$1k spend authorized; lower-N probes only until results justify scale-up.

**Resulting matrix:** {Hermes, OpenClaw, Oracle} × {5 GAIA 2 splits} × {4 metric families}. Oracle = upper-bound reference (gold context) showing headroom; Hermes + OpenClaw = the two real harnesses under test.

## Overview
Fill a controlled `{entities} × {GAIA 2 splits} × {4 metric families}` matrix where Waggle OS is the held-constant local-first arena and harnesses are the variable. One cell exists (Hermes × search × N=160 = 83.8% strict / 86.5% judged-only). The plan is gated by one hard unknown (do Claude Code / Codex / Cowork even run in ARE?) and one Tier-1 blocker (self-judge contamination).

## Critical findings from the codebase (these reshape the matrix)

1. **The comparison set as stated is not directly runnable.** The runner ships exactly three agent profiles — `_HERMES`, `_OPENCLAW`, `_ORACLE` (`container_env.py:67-93`, `detect_profile()` `:154-163`). Only three container dirs exist: `containers/{hermes,openclaw,oracle}`. **Claude Code, Codex, and Claude Cowork are NOT ARE-native agents** — they are product harnesses with their own loops, not GAIA2 adapters. They cannot be dropped into ARE as-is.

2. **OpenClaw is a universal model adapter.** Per `containers/openclaw/README.md` it speaks Anthropic / OpenAI / OpenAI-compat / OpenRouter via its gateway. So the *underlying models* of those products can run through ARE, but **the product harness loop itself does not**. Forces a framing decision (Phase 0).

3. **GAIA 2 has 5 splits, not 6.** `CANONICAL_SPLITS = (execution, search, ambiguity, adaptability, time)` (`config.py:24-30`). The goal doc's "noise" is not a GAIA2 split — drop/remap. Matrix denominator = 5 splits.

4. **Judge wiring:** host validation in `cli.py:_resolve_judge_config()` (`:434-480`); `[judge]` TOML → `JudgeConfig`; injected into in-container `gaia2-eventd` as `GAIA2_JUDGE_*` (`runner.py:391-438`). Changing judge = changing `[judge]`. Independent/ensemble judge + self-vs-independent delta require **offline re-judging of persisted `events.jsonl`** — that harness does not exist yet.

5. **Metrics gap is real.** `result.json` carries only `success`, `reward`, `num_agent_events`, `failure_reasons`, `daemon_status` (`runner.py:211-284`). **No tokens, no $, no wall-clock.** Must be added.

6. **The 5-error floor is in-container.** `daemon_status.json` status=`error` written by `gaia2-eventd`; `runner.py:237-241` only reads it. Fix is an in-container daemon change OR a host-side offline-re-judge workaround.

---

## Phase 0 — Framing + Research Gate (BLOCKING, mostly external research)

1. **Resolve "harness vs model" framing** (Risk: H · verify: PM sign-off in a §0 addendum)
   - Entities = agent **harnesses** (Hermes loop vs OpenClaw loop vs Claude Code loop…) or **models-under-one-harness** (Sonnet vs GPT-5 vs Gemini via OpenClaw)? Controlled-variable principle implies the former; codebase only supports the latter for non-ARE products.
   - Three viable matrices: **(A)** ARE-native only — Hermes × OpenClaw, model held at Sonnet 4.6 (only clean apples-to-apples); **(B)** add Claude Code/Codex/Cowork via custom ARE adapters (large build); **(C)** reframe non-ARE entries as "model rows" via OpenClaw. Recommend **(A) as the Tier-1 spine, (B) as stretch.**

2. **Research — ARE-compatibility of Claude Code / Codex / Cowork** (Risk: H · verify: written per-product verdict {ARE-native:no / adapter-feasible / not-benchmarkable})
   - Verifiable now: no container/profile exists. Needs external research: does each product expose a scriptable single-task-in / final-message-out interface wrappable behind the ARE `gaia2_adapter` HTTP contract (`POST /notify`, `GET /status`, `events.jsonl`)? Claude Code has headless CLI/SDK; Codex has a CLI; Cowork is a product UI (hardest / possibly impossible). **External research — flagged.**

3. **Scope custom adapter (only if 0.2 = adapter-feasible)** (Risk: H · verify: 1-page adapter design mapping product I/O → `gaia2_adapter` HTTP contract + faketime + event logging). Real per-product engineering arc.

**Phase 0 gates everything else.** If 0.2 returns "not-benchmarkable," the defensible matrix is Hermes × OpenClaw, and Tier-2 claims pivot to "run Codex/Claude Code/Hermes locally, audited" as a **governance** claim — which is exactly Reading B's thesis.

---

## Phase 1 — Judge Integrity (Tier-1 blocker; RUNNABLE NOW, no Phase 0 dep)

1. **Offline re-judge harness** (new `runner/gaia2_runner/rejudge.py` or script) (Risk: M · verify: re-judging existing N=160 reproduces ≈134 PASS within noise). Decouples judging from execution → a $91 run judged N times for judge-token cost only.
2. **Independent + ensemble judge** (`[judge]` + rejudge harness) (Risk: M · verify: self-vs-independent delta reported). Use M6 roster (Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5). Mirror C-1 LOCOMO **trio-strict** discipline. Pre-register protocol before any new run.
3. **Judge-leniency delta on existing cell** (Risk: L · verify: `JUDGE-DELTA-search-N160.md` with self 86.5% vs independent X% vs trio-strict Y%). **Cheapest highest-credibility deliverable available now** — strengthens/corrects the one published cell with zero new agent spend.

---

## Phase 2 — Sovereignty Triple Proof (protagonist metric; RUNNABLE NOW)

1. **Egress=0 proof** (new `runs/sovereignty/egress-proof.md` + capture script) (Risk: M · verify: pcap shows only allowlisted provider egress, zero else — or full air-gap with local model). Defensible claim: "zero egress except the user's chosen model endpoint" unless a local model (Ollama/vLLM) is used with `--network=none`.
2. **Audit-trail completeness** (`runs/sovereignty/audit-completeness.md`) (Risk: L · verify: every tool call in `events.jsonl` maps to a trace entry). This *is* the KVARK governance hook.
3. **Reproducibility assertion** (Risk: L · verify: hermetic re-run reproduces aggregate within CI). Largely proven for Hermes; formalize per harness.

---

## Phase 3 — Metric Instrumentation (4 families; RUNNABLE NOW)

1. **Capture cost/tokens/wall-clock into `result.json`** (`runner.py:211-284`) (Risk: M · verify: re-run cell carries `tokens_in/out`, `cost_usd`, `wall_clock_s`, `tool_calls`). Tokens/$ from OpenClaw gateway traffic (its README: "logs raw model traffic") else estimate from `events.jsonl` × pricing. **Reuse `packages/agent/src/cost-tracker.ts` pricing table — do not hand-roll.** UTF-8-safe + platform-guarded; bundle with the Windows patch set.
2. **4-family metric schema** (new `benchmarks/gaia2/METRIC-SCHEMA.md`) (Risk: L). Capability: strict + judged-only. Efficiency: tokens/$/tool-calls/wall-clock. Reliability: error-rate/recovery/determinism. Sovereignty: 3 binaries from Phase 2.
3. **Determinism harness** (Risk: M · verify: pass@k reruns of a 20-scenario subset report variance). Runner already supports `pass_at>1` with avg±stddev + pass@N.

---

## Phase 4 — 5-Error Floor: Fix or Document (RUNNABLE NOW)

1. **Decide fix vs document** (Risk: M · verify: PM decision recorded). Fix is in-container (`gaia2-eventd` soft-close turn after idle-with-N-events) → image rebuild + parity/upstream path; compounding value across 5 splits. Cheaper: host-side workaround — when `daemon_status==error` but `last_response` non-empty + ≥N events, re-judge offline (Phase 1.1) instead of counting undecidable.
2. **File upstream issue regardless** (Risk: L).

---

## Phase 5 — Matrix Execution (BLOCKED on Phase 0 verdict; gated by 1-4)

1. **Lock cell list from Phase 0 verdict** (Risk: M · verify: pre-registration before spend). Spine: Hermes × {5 splits} + OpenClaw × {5 splits}, Sonnet 4.6, N≥160. = **10 cells × ~$91 ≈ $900-1000** — real PM budget question vs the prior $100 single-cell cap.
2. **Per-split N=10 probe before each full cell** (Risk: M). Splits differ (`time` scenarios have durations → longer wall-clock + timeout-FAIL path `runner.py:253-268`).
3. **Fill cells at concurrency=2** (Risk: M). Use `subset_manifest` for deterministic finish-passes (NOT `--retry` — over-selects, per P4.5).
4. **Aggregate + Wilson CI per cell** (Risk: L · ≈±6pp at N=160).

---

## Phase 6 — Deliverables (Tier-1 + Tier-2)

1. **Tier-1 pre-registration + writeup** (`TIER1-PROTOCOL.md` → `TIER1-RESULTS.md`) (Risk: M). **Kill the apples-to-oranges Mem0 baseline** — the P4.5 doc cites "~40-55% Mem0"; violates the guardrail (different judge/denominator). Drop from any Tier-1 artifact; every number from OUR matrix.
2. **Tier-2 hero claims tracing to Tier-1 cells** (`TIER2-HERO-CLAIMS.md`) (Risk: L). Per Reading B the protagonist claim is the **sovereignty triple across all harnesses**, not "Waggle #1."

---

## Blocked-on-research vs runnable-now

| Phase | Status |
|---|---|
| 0 framing + ARE-compat | **BLOCKED — external research** |
| 1 judge integrity | **Runnable now** (existing artifacts) |
| 2 sovereignty proof | **Runnable now** |
| 3 metric instrumentation | **Runnable now** |
| 4 5-error floor | **Runnable now** |
| 5 matrix execution | **Blocked on Phase 0 + Phases 1-4** |
| 6 deliverables | Follows 5; judge-delta sub-deliverable after Phase 1 |

## Effort
- Phases 1-4 (runnable now, no new agent spend): **M**, days of eng, <$50 judge tokens.
- Phase 0 research: **H** uncertainty, low investigation effort, high effort if adapters needed.
- Phase 5 full matrix: **H** budget (spine ~$900-1000; full 6×6 multiples more) — PM decision.

## Recommended execution order
1. **Phase 1.1 + 1.3 first** — offline re-judge + judge-delta on existing N=160. Highest credibility-per-dollar, closes the Tier-1 self-judge blocker, zero new agent spend.
2. **Phase 0.2 research in parallel** — ARE-compat of the three products determines matrix shape; long pole, start immediately.
3. Then Phases 2-4 while Phase 0 resolves.
4. Then Phase 5 once PM signs off on cell list + budget.

## Three biggest risks
1. **Comparison set may not exist as posed (H).** Runner supports only Hermes/OpenClaw/Oracle. The 3 products likely need bespoke adapters or aren't ARE-benchmarkable — may collapse the matrix to Hermes × OpenClaw (fine under Reading B governance framing).
2. **Judge contamination invalidates Tier-1 (H→mitigable now).** Only cell self-judges (Sonnet judging Sonnet). Fix cheaply via offline re-judge + trio-strict delta — do first.
3. **Budget (H, non-engineering).** 10-cell spine ~$900-1000; 6×6 stretch multiples more. Must be PM-ratified vs the prior $100 cap.
