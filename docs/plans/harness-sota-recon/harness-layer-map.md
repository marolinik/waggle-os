# The Waggle Harness — Precise Definition & Ablation Ladder

> Recon for a publishable benchmark. Goal: define "the Waggle harness" as the
> **independent variable** — i.e. everything the agent loop adds on top of a
> single raw `model.complete(prompt)` call — and enumerate each layer as an
> **ablatable** component.
>
> All claims below are read directly from source. File:line citations are exact
> as of branch `feature/warm-hive-pr3` (2026-06-16). Where a behavior could NOT
> be verified, it is flagged in "Risks & Gaps".

---

## 0. TL;DR for the benchmark designer

There are **two distinct harnesses** in this repo, and conflating them is the
single biggest threat to a publishable claim:

1. **The production chat harness** — `packages/server/src/local/routes/chat.ts`
   (`POST /api/chat`). This is the real, full-fat Waggle agent: ~25 layers
   wrapped around `runAgentLoop`. It is SSE-streamed, stateful, side-effecting
   (writes memory, traces, signals), and **not** a clean function. It is the
   "full harness" a marketing claim would point at, but it is hard to ablate
   cleanly because layers are interleaved with I/O.

2. **The benchmark harness** — `benchmarks/harness/src/cells.ts`. This already
   implements a **clean, pure-ish ablation grid** (`raw` / `no-context` /
   `filtered` / `compressed` / `full-context` / `retrieval` / `agentic`). It is
   the right substrate for a publishable benchmark, BUT its current cells ablate
   the **memory substrate** (does retrieval help?), **not** the agent-harness
   layers (planning, self-correction, quality control, governance). The
   `agentic` cell uses `runAgentLoop` with a **single tool** (`search_memory`)
   and `maxTurns: 3` — it is NOT the production harness.

**Recommendation up front:** the cleanest publishable design is to extend the
benchmark harness's cell pattern with a NEW ablation axis built on the *real*
`runAgentLoop` + `Orchestrator`, toggling the layers enumerated in §3 via the
existing env-flag / config seams. Do **not** try to ablate `chat.ts` in place.

---

## 1. The "bare model" baseline (the zero point of the ladder)

A single stateless completion. In this repo the closest faithful primitive is
`LlmClient.call({ model, systemPrompt, userPrompt })` (benchmarks/harness/src/llm.ts),
which the `raw` / `no-context` cells use. The agent-loop equivalent would be
`runAgentLoop` with `tools: []`, `maxTurns: 1`, all gates off — but note even
that adds a retry/timeout wrapper (§3 Layer 1).

Two candidate baselines, both already implemented as cells:

- **`no-context`** (cells.ts:480) — `systemPrompt` (a model-aware factoid
  persona via `selectShape`) + `userPrompt = "Question: <q>"`. No context, no
  retrieval, no tools, one call. **This is the honest zero-memory baseline.**
- **`raw`** (cells.ts:292) — same but the user prompt embeds the dataset's
  oracle `instance.context`. The harness explicitly documents (types.ts:49-54,
  cells.ts:464-479) that on LoCoMo `raw` is NOT zero-context (it is
  oracle-fed) and renames it the `oracle-context` diagnostic. **Do not use
  `raw` as the baseline — a reviewer will flag the oracle leak.**

> Pin the baseline as **`no-context`**: same model, same decoding params, same
> output-format persona, the ONLY difference vs. treatment cells being the
> ablated layer. That is the apples-to-apples zero point.

---

## 2. The "full harness" definition (production)

The full production harness = every layer in §3 with default flags. End-to-end
control flow in `chat.ts`, in execution order:

```
POST /api/chat
 ├─ [pre-LLM, server-side]
 │   validate + injection-scan user input        (chat.ts:418, score≥0.7 blocks)
 │   path-traversal guards                        (chat.ts:414, 447)
 │   RBAC viewer gate                             (chat.ts:434)
 │   model pilot: budget/fallback/smart-route     (chat.ts:519-547)
 │   per-session orchestrator + workspace mind    (chat.ts:574-594)
 │   slash-command routing                        (chat.ts:630)
 │   AUTO MEMORY RECALL (recallMemory)            (chat.ts:764)  ← memory layer
 │   GEPA prompt expansion (Haiku)                (chat.ts:804)  ← extra LLM call
 │   ambiguity guard prefix                       (chat.ts:831)
 │   PromptAssembler (buildAssembledPrompt)       (chat.ts:868)  ← tier-adaptive prompt
 │   buildSystemPrompt (identity+awareness+spec)  (chat.ts:884)  ← behavioral spec
 │   per-request approval hook (confirmation)     (chat.ts:893)  ← governance
 │   persona tool filter + availability filter    (chat.ts:1047, 1056)
 │   capability router                            (chat.ts:1064)
 │   context compression (LLM summarize middle)   (chat.ts:1103) ← extra LLM call
 │   governance policies (blockedTools)           (chat.ts:1133)
 │   iteration budget (max 90)                    (chat.ts:1142)
 │   trace recorder start                         (chat.ts:1277)
 │
 ├─ runAgentLoop (the inner loop)                 (agent-loop.ts:143, maxTurns:200)
 │   per turn:
 │     LLM call (stream) + retry/timeout          (agent-loop.ts:284-325)
 │     token-budget guard                         (agent-loop.ts:388)
 │     for each tool_call: executeToolCall        (tool-executor.ts:62)
 │       JSON parse → onToolUse → governance block
 │       → pre:tool hook → pre:memory-write hook
 │       → LoopGuard.check → execute
 │       → scanForInjection(tool output)          ← injection defense
 │       → onToolResult → post hooks
 │     on no-tool-calls (final turn):
 │       maybeFireCompletionGate                   (loop-gates.ts:109)
 │         D3 verification gate                    ← self-correction
 │         D1 skill-distillation gate              ← closed learning loop
 │
 └─ [post-LLM, server-side]
     credential-pool success/fallback chain       (chat.ts:1337-1377)
     cost tracking + per-session tokens           (chat.ts:1400)
     trace finalize (outcome=success)             (chat.ts:1413)
     commitSurfacedSignals                         (chat.ts:1428)
     autoSaveFromExchange (pattern write-back)     (chat.ts:1437) ← memory write
     planSkillDistillation signal record           (chat.ts:1456)
     KG auto-extraction (extractEntities)          (chat.ts:1479) ← memory write
     correction detection (analyzeAndRecord…)      (chat.ts:1502) ← self-improvement
     auto skill capture (shouldSuggestCapture)     (chat.ts:1532)
     regulated-persona disclaimer                  (chat.ts:1566)
     schedule suggestion                           (chat.ts:1580)
     GROUNDING GUARD (checkGrounding) + hedge      (chat.ts:1593) ← verification
     persist + done event
```

---

## 3. The harness layers, as ablatable components

Each layer below: **what it adds over raw · independently toggleable? (how/where) ·
cost (extra tokens / LLM calls) · capability vs. governance/cost-only**.

> Legend — Cost: **0** = no extra model tokens/calls; **+ctx** = adds input
> tokens to the main call; **+call** = makes an extra LLM call; **±turns** =
> can add agent-loop turns (each turn = 1 LLM call).

### Layer 0 — Tools (the foundational capability layer)
- **Adds:** the model can act (read/write files, bash, web, memory, git, …),
  via OpenAI-style function calling. `runAgentLoop` converts `tools` to
  `openaiTools` (agent-loop.ts:224) and loops until no tool calls remain.
- **Toggle:** `AgentLoopConfig.tools` array (agent-loop.ts:35). Empty ⇒ pure
  completion (effectively bare model). Subsets via `filterToolsForContext`
  (`general`/`code`/`research`, tool-filter.ts:23) and persona allow/deny lists
  (`applyPersonaToolFilter`). Benchmark `agentic` cell uses `tools:
  [search_memory]` (cells.ts:399).
- **Cost:** **±turns** — each tool round-trip is another LLM call. The single
  biggest cost driver in the harness.
- **Type:** **CAPABILITY** (and the precondition for most other layers).

### Layer 1 — Loop control: retry / timeout / abort
- **Adds:** robustness — 429/5xx/network retry with backoff (retry-policy.ts via
  agent-loop.ts:308,318), per-request timeout `WAGGLE_LLM_TIMEOUT_MS` default
  300s (agent-loop.ts:253), client-disconnect abort (agent-loop.ts:260,375).
- **Toggle:** not flag-gated; intrinsic to `runAgentLoop`. Ablate by using the
  raw `LlmClient` path (benchmark cells) instead. `maxTurns` (default 10 in
  loop, 200 in chat, 3 in benchmark agentic) bounds it.
- **Cost:** **0** on the happy path; retries add calls only on failure.
- **Type:** **GOVERNANCE/robustness** (no capability gain).

### Layer 2 — LoopGuard (repetition / oscillation breaker)
- **Adds:** detects the model calling the same tool+args repeatedly
  (consecutive > 3, or ≥4 in a rolling window of 10) and returns an error result
  instead of executing (loop-guard.ts:27, wired tool-executor.ts:130).
- **Toggle:** constructed unconditionally inside `runAgentLoop` (agent-loop.ts:247);
  not env-gated. Ablate by raising thresholds via `LoopGuardConfig` — requires
  a code seam (the loop hard-codes `new LoopGuard()`).
- **Cost:** **0** (saves cost by short-circuiting loops).
- **Type:** **GOVERNANCE/cost-control.**

### Layer 3 — IterationBudget (runaway-spend guard + pressure prompts)
- **Adds:** counts iterations (max 90 in chat.ts:1142), injects budget-pressure
  text into context at 70%/90% to make the model wrap up (iteration-budget.ts:35).
- **Toggle:** constructed in chat.ts only; **not used inside `runAgentLoop`**
  (verified: agent-loop.ts has no IterationBudget import). In chat.ts it is
  `tick()`-ed once per response (chat.ts:1386), so its pressure text barely
  fires in practice — see Risks.
- **Cost:** **0** baseline; pressure messages add a few tokens when they fire.
- **Type:** **GOVERNANCE/cost-control.**

### Layer 4 — Behavioral Spec (the system-prompt scaffold)
- **Adds:** the 5-section reasoning contract — coreLoop (RECALL→ASSESS→ACT→
  LEARN→RESPOND), qualityRules (anti-hallucination), behavioralRules,
  workPatterns, intelligenceDefaults — plus two `=== CRITICAL ===` blocks:
  Memory-Conflict Protocol and Verification-Before-Completion
  (behavioral-spec.ts:18-96). Injected in chat.ts:252 (`activeSpec.rules`).
- **Toggle:** swap `server.activeBehavioralSpec` or pass a stripped spec.
  Cleanly ablatable as a string. The benchmark cells already do this — they use
  minimal personas (`FACTOID_BASELINE_PERSONA`) instead of the full spec.
- **Cost:** **+ctx** — this is a large, fixed system-prompt cost
  (chat.ts:257 warns when total prompt > 12K tokens).
- **Type:** **CAPABILITY** (behavior shaping; observed to move quality) — but
  note CLAUDE.md and verification-gate.ts:6 record that prose discipline is NOT
  reliably obeyed, which is why structural gates (Layers 11-12) exist.

### Layer 5 — Identity + Self-Awareness + Preloaded Context (`buildSystemPrompt`)
- **Adds:** `Orchestrator.buildSystemPrompt()` (orchestrator.ts:301) assembles
  Identity (from IdentityLayer), Self-Awareness (tools/skills/model/memory-stats
  + improvement signals), and recent-context frames. Section-cached
  (orchestrator.ts:285).
- **Toggle:** `buildSystemPrompt` returns `''` on a fresh/empty mind; ablate by
  passing an empty-identity orchestrator or bypassing. Self-awareness depends on
  `ImprovementSignalStore` (empty ⇒ no awareness section).
- **Cost:** **+ctx.**
- **Type:** **CAPABILITY** (grounding/personalization).

### Layer 6 — Automatic Memory Recall (`recallMemory`)  ← the headline memory layer
- **Adds:** before the LLM call, `Orchestrator.recallMemory(query)`
  (orchestrator.ts:453) runs **multi-lane** retrieval and renders a
  `# Recalled Memories` block: importance lane (K=5), date-window lane,
  catch-up importance branch, extraction lanes (profiles / facts cap 60 /
  events cap 40 / windowed events), HybridSearch semantic top-K (default 10),
  and a **raw-detail verbatim lane** gated on the cross-encoder reranker
  (orchestrator.ts:703). Output is injection-scanned (orchestrator.ts:761) and
  carries temporal guidance + a reference-date anchor (orchestrator.ts:772-794).
- **Toggle (rich set of independent sub-switches):**
  - whole layer: don't call `recallMemory` (chat.ts:759 `!hasCustomRunner` gate;
    benchmark `no-context` / `raw` / `compressed` cells skip it entirely).
  - reranker: `WAGGLE_RERANKER=0` (orchestrator.ts:440) — default ON.
  - raw-detail lane: `WAGGLE_RAWDETAIL=0` (orchestrator.ts:711) — the W3.4
    ablation calls this the single-hop driver (+2.40 z=1.95).
  - scoring profile / score floor / limit via `RecallOptions` (orchestrator.ts:91).
- **Cost:** **+ctx** (often large — the raw-detail + lane blocks are the token
  driver per MEMORY.md token-efficiency backlog: ~3,747 tok/q, heavy lanes =
  semantic K=10 + rawdetail K=6). Reranker adds **local compute** (ONNX), not
  LLM tokens.
- **Type:** **CAPABILITY** (this is the substrate moat; the existing
  retrieval/agentic cells already isolate its causal lift).

### Layer 7 — PromptAssembler (sixth-layer tier-adaptive packaging)
- **Adds:** `buildAssembledPrompt` (orchestrator.ts:351) → `PromptAssembler.assemble`
  (prompt-assembler.ts:320). Tier-driven frame caps (small 3 / mid 6 / frontier 10),
  typed sections (Identity/Persona/State/Recent changes/Active work/Preferences/
  Recalled memory), truncation policy, and a task-shape **response scaffold**
  (compression vs expansion matrix, prompt-assembler.ts:135,181). Frontier tier
  → no scaffold.
- **Toggle:** `WAGGLE_PROMPT_ASSEMBLER=0` (feature-flags.ts:38, default ON).
  `scaffoldStyle` option (compression/expansion). When off, chat falls back to
  `buildSystemPrompt() + recallMemory()` raw concatenation.
- **Cost:** **0 extra calls**; reshapes/caps `+ctx` (can REDUCE tokens via caps
  and truncation). Reuses the recall text (no double search, W4.5).
- **Type:** **CAPABILITY** (prompt engineering; tier-adaptive).

### Layer 8 — Persona system (prompt + tool filter)
- **Adds:** persona system-prompt composition (`composePersonaPrompt`,
  chat.ts:309) and persona-scoped tool allow/deny (`applyPersonaToolFilter`,
  chat.ts:1050). 13→17 personas; read-only personas strip write tools.
- **Toggle:** `personaOverride` / workspace `personaId` (null ⇒ generic).
  Tool filter is a pure function over the tool list.
- **Cost:** **+ctx** (persona prompt) and may REDUCE `±turns` (fewer tools).
- **Type:** **CAPABILITY** + **GOVERNANCE** (the deny-list is a safety control).

### Layer 9 — GEPA prompt expansion (vague-prompt rewriter)
- **Adds:** on the FIRST user message, an optimizer (Ax/GEPA, cheapest model
  Haiku) classifies the prompt as vague and expands it, optionally emitting
  clarifying choices (chat.ts:804-826).
- **Toggle:** `getOptimizerService(server)` returns null ⇒ off; gated to
  `isFirstUserMessage && !hasCustomRunner`. No single env flag in chat.ts —
  ablate by not wiring the optimizer service.
- **Cost:** **+call** (one extra Haiku call per first turn).
- **Type:** **CAPABILITY** (input rewriting).

### Layer 10 — Context compression (long-conversation summarizer)
- **Adds:** when conversation > ~50% of context window, prunes tool results,
  protects head/tail, LLM-summarizes the middle using the **budget model**
  (`compressConversation`, chat.ts:1103). Falls back to a sliding window
  (`applyContextWindow`) when no budget model.
- **Toggle:** requires `budgetModel` configured; `COMPACTION_ENABLED` flag
  (feature-flags.ts:23) governs the separate 4-layer compaction path. Ablate by
  unsetting budget model ⇒ plain sliding window.
- **Cost:** **+call** (budget-model summarize) only when it triggers; reduces
  `+ctx` thereafter.
- **Type:** **GOVERNANCE/cost-control** (enables long sessions; not a
  per-turn capability gain).

### Layer 11 — D3 Verification-before-completion gate  ← self-correction
- **Adds:** when a final turn ASSERTS verified/passing/working but ran no
  verification-class tool that turn, inject ONE corrective directive and force
  another turn (verification-gate.ts:44, fired in loop-gates.ts:121). One-shot.
  This is the **structural** enforcement of the behavioral-spec prose, because
  prose alone is not obeyed (verification-gate.ts:6).
- **Toggle:** `AgentLoopConfig.verificationGate` (default true, agent-loop.ts:161,
  loop-gates.ts:80). Clean boolean.
- **Cost:** **±turns** — fires at most once, costing one extra LLM call when it
  fires.
- **Type:** **CAPABILITY** (quality/correctness — reduces unverified claims).

### Layer 12 — D1 Skill-distillation gate  ← closed learning loop
- **Adds:** on a successful ≥5-tool turn (not a refusal), mechanically inject a
  directive to author a reusable skill via `create_skill`
  (skill-distillation.ts:59, fired loop-gates.ts:137). The user's real answer is
  preserved so the distillation turn's output doesn't overwrite it (issue #4).
  Hermes-parity feature; also records a `skill_promotion` improvement signal
  (chat.ts:1456) and broadcasts a `skill_share` signal (chat.ts:1308).
- **Toggle:** `AgentLoopConfig.skillDistillationGate` (default true,
  agent-loop.ts:162). Clean boolean.
- **Cost:** **±turns** — one extra turn when it fires (≥5-tool turns only).
- **Type:** **CAPABILITY** (long-horizon self-improvement) — but its
  per-task quality effect is indirect (benefits *future* tasks), so for a
  single-turn benchmark it is mostly a **cost** add.

### Layer 13 — Confirmation / autonomy gate (human-in-the-loop)
- **Adds:** a per-request `pre:tool` hook that pauses on risky tools
  (`needsConfirmationWithAutonomy`, chat.ts:900), enriched with risk metadata
  (`classifyGatedToolRisk` / `assessTrust`, chat.ts:944-983). Autonomy levels
  normal/trusted/yolo; critical ops never auto-pass.
- **Toggle:** `WAGGLE_AUTO_APPROVE=1` (chat.ts:53) bypasses; autonomy level in
  request body; hook only registered when `!hasCustomRunner`. For a benchmark,
  `hasCustomRunner` / auto-approve removes it.
- **Cost:** **0** model cost (it's a wait, not a call).
- **Type:** **GOVERNANCE** (no capability gain; for autonomous benchmarks it is
  effectively off).

### Layer 14 — Governance policies (team blockedTools / allowedSources)
- **Adds:** `governancePolicies.blockedTools` enforced in executeToolCall
  (tool-executor.ts:86). `allowedSources` is **set but NOT enforced** (explicit
  caveat, agent-loop.ts:51-59 + warning at chat.ts via agent-loop.ts:179).
- **Toggle:** `AgentLoopConfig.governancePolicies` (omit ⇒ no restriction).
- **Cost:** **0.**
- **Type:** **GOVERNANCE** (and a partly-unimplemented one — see Risks).

### Layer 15 — Injection defense (read + write side)
- **Adds:** `scanForInjection` on user input (chat.ts:418), on recalled memory
  (orchestrator.ts:761, chat.ts:768), and on EVERY tool output before it
  re-enters context (tool-executor.ts:161, the load-bearing C2 ordering).
- **Toggle:** not flag-gated (it's security). Ablate only by code seam; not
  recommended as an ablation arm for a quality benchmark.
- **Cost:** **0** (regex/heuristic, no LLM).
- **Type:** **GOVERNANCE/security.**

### Layer 16 — Capability router (tool-not-found resolver)
- **Adds:** when the model calls an unknown tool, returns structured
  alternatives (skills/plugins/MCP/subagents) + an `acquire_capability` hint
  instead of a bare error (tool-executor.ts:142, built chat.ts:1064).
- **Toggle:** `AgentLoopConfig.capabilityRouter` (omit ⇒ plain "unknown tool"
  error).
- **Cost:** **0** model cost; may save `±turns` by steering recovery.
- **Type:** **CAPABILITY** (recovery/UX).

### Layer 17 — Post-turn memory write-back (cognify / autoSave / KG)
- **Adds:** `autoSaveFromExchange` (pattern write-back → frames, chat.ts:1437),
  KG entity extraction (chat.ts:1479), CognifyPipeline (entities + relations +
  vector index, cognify.ts:51), and the contradiction detector at write time
  (contradiction-detector.ts:63, wired via createMindTools).
- **Toggle:** `!hasCustomRunner` gate (chat.ts:1433) — off for injected runners.
  `WAGGLE_AUTO_SAVE=aggressive` (feature-flags.ts:17) changes intensity.
- **Cost:** **0** model cost per turn (heuristic + embedding compute), but it is
  what FILLS the substrate that Layer 6 later reads — so it matters for
  **multi-turn / multi-session** benchmarks, not single-turn.
- **Type:** **CAPABILITY** (substrate-feeding; the moat's write half).

### Layer 18 — Correction / improvement detection (cross-session learning)
- **Adds:** `analyzeAndRecordCorrection` (chat.ts:1502) classifies user
  corrections as durable/task-local (correction-detector.ts:95) and records
  improvement signals; `buildAwarenessSummary` surfaces them into future
  prompts (improvement-detector.ts:127). Capability-gap recording too.
- **Toggle:** `!hasCustomRunner` gate; ablate by not calling the detectors.
- **Cost:** **0** model cost; adds `+ctx` on FUTURE turns (surfaced signals).
- **Type:** **CAPABILITY** (cross-session adaptation; out of scope for a
  single-turn benchmark).

### Layer 19 — Grounding guard (post-generation verification)
- **Adds:** `checkGrounding` (grounding-check.ts) flags quantitative specifics
  (money/count) the reply asserts that are absent from recalled memory + user
  message, appending an honest hedge note (chat.ts:1593-1606).
- **Toggle:** `WAGGLE_GROUNDING_HEDGE=0` (chat.ts:1601); only runs when
  `recalledContext` is non-empty.
- **Cost:** **0** (deterministic).
- **Type:** **CAPABILITY** (anti-confabulation/quality).

### Layer 20 — Quality controller (response-style linter)
- **Adds:** `checkResponseQuality` (quality-controller.ts:25) flags verbosity,
  emoji spam, filler, bullet overuse. **NOTE: not wired into chat.ts** (no
  import found). It exists as a utility; treat as inert in production today.
- **Toggle:** N/A in production path.
- **Cost:** **0.**
- **Type:** **GOVERNANCE/quality** — flag as currently UNWIRED (see Risks).

### Layer 21 — Sub-agent / workflow orchestration (multi-agent)
- **Adds:** `SubagentOrchestrator` (subagent-orchestrator.ts:59) runs
  dependency-ordered worker steps, each its own `runAgentLoop` (role tool
  presets, context injection, concatenate/last/synthesize aggregation,
  subagent-orchestrator.ts:223). `WorkflowHarness` (workflow-harness.ts) adds a
  deterministic phase-gate state machine with validation gates + retries.
- **Toggle:** `WAGGLE_ADVANCED_WORKFLOWS` (default ON, feature-flags.ts:14),
  `WAGGLE_COORDINATOR_MODE` (feature-flags.ts:11). **NOT on the default
  `/api/chat` path** — reached via subagent tools / workflow routes. Per-worker
  `maxTurns` default 50 (subagent-orchestrator.ts:231).
- **Cost:** **+call × N workers** (each worker is a full agent loop; synthesize
  adds one more). The most expensive optional layer.
- **Type:** **CAPABILITY** (decomposition for complex/long tasks).

### Layer 22 — Model pilot: budget / fallback / smart-route
- **Adds:** budget-threshold model swap (chat.ts:531), simple-turn routing to a
  cheaper model (`routeMessage`, smart-router.ts:12), retryable-error fallback
  model (chat.ts:1358), credential-pool key rotation (chat.ts:1337).
- **Toggle:** workspace/config-driven (default model, fallback, budget). For a
  benchmark, pin a single model and disable routing.
- **Cost:** **0** extra calls (it CHANGES which model answers — a confound to
  control for, not a quality layer).
- **Type:** **GOVERNANCE/cost-control** — *critical to pin* for a fair benchmark
  (otherwise the model silently changes mid-run).

### Layer 23 — Trace recording + audit + telemetry + signals
- **Adds:** TraceRecorder (execution traces for the evolution loop, chat.ts:1277),
  audit events (chat.ts:1177), WaggleDance signals (chat.ts:732), turnId
  structured logging (turn-context.ts:45).
- **Toggle:** absent when `server.traceStore` / `signalBus` undefined.
- **Cost:** **0** model cost.
- **Type:** **GOVERNANCE/observability** (no capability gain; needed only for
  the self-evolution arc, not for a quality benchmark).

---

## 4. The proposed ablation ladder (publishable)

Built to isolate **capability** layers (governance/cost layers held constant /
off). Same model (pinned), same decoding params, same dataset+seed across rungs.
Each rung adds exactly one capability axis over the prior.

| Rung | Name | = baseline + … | Existing cell? | Cost vs prior |
|---|---|---|---|---|
| 0 | **bare model** | `no-context`: 1 call, output-format persona only | ✅ `no-context` (cells.ts:480) | — |
| 1 | **+ behavioral spec** | inject full BEHAVIORAL_SPEC as system prompt | ❌ new (swap persona→spec) | +ctx |
| 2 | **+ memory recall** | + `recallMemory` block (Layer 6), no tools | ✅ `retrieval` (cells.ts:337) | +ctx |
| 3 | **+ prompt assembler** | + PromptAssembler tier packaging on the recall | ❌ new (`WAGGLE_PROMPT_ASSEMBLER`) | ~0 |
| 4 | **tools-only (agentic)** | model decides when to `search_memory`, maxTurns N | ✅ `agentic` (cells.ts:370) | ±turns |
| 5 | **+ full toolset** | full Waggle tool pool (read/write/bash/web/git/…) | ❌ new (pass `allTools`) | ±turns |
| 6 | **+ self-correction** | + D3 verification gate (Layer 11) | ❌ new (`verificationGate:true`) | ±turns |
| 7 | **+ closed loop** | + D1 skill distillation (Layer 12) | ❌ new (`skillDistillationGate:true`) | ±turns |
| 8 | **+ subagents/workflow** | + SubagentOrchestrator / WorkflowHarness (Layer 21) | ❌ new | +call×N |
| **Full** | **production harness** | all of the above + governance layers | ⚠️ `chat.ts` (not cleanly ablatable) | — |

Notes:
- Rungs 0-4 are **already buildable today** with the benchmark harness cells.
- Rungs 1, 3, 5-8 need NEW cells that call the *real* `runAgentLoop` with the
  matching `AgentLoopConfig`/`Orchestrator` toggles — all of which exist as
  clean boolean/env seams (verified §3). This is the genuinely novel work.
- Governance/cost layers (1,2,3,10,13,14,15,16,22,23) should be held **constant
  and off/neutral** across all rungs so they don't confound the capability
  measurement. The ONE you must actively pin is **Layer 22 (model pilot)** —
  fix the model, disable budget/smart-route/fallback.
- Layers 12, 17, 18 only pay off across **multiple turns/sessions**. On a
  single-turn QA benchmark (LoCoMo/LongMemEval style) they add cost without
  measurable quality. Either run a multi-session protocol or exclude them and
  say so.

---

## 5. Capability vs. governance/cost — the clean partition

**CAPABILITY (can raise answer quality):** Tools (0), Behavioral spec (4),
Identity/awareness (5), Memory recall (6), PromptAssembler (7), Persona prompt
(8), GEPA expansion (9), D3 verification (11), Capability router (16), Memory
write-back (17, multi-turn), Correction learning (18, multi-session), Grounding
guard (19), Subagents/workflow (21), D1 distillation (12, multi-task).

**GOVERNANCE / COST / SECURITY ONLY (no per-turn quality gain):** Loop
retry/timeout (1), LoopGuard (2), IterationBudget (3), Context compression (10,
enables long ctx), Confirmation/autonomy (13), Governance policies (14),
Injection defense (15), Model pilot (22), Trace/audit/telemetry (23), Quality
controller (20, currently unwired).

---

## 6. Verification commands the benchmark author should run

```bash
# Confirm the clean toggles exist as claimed:
grep -n "verificationGate\|skillDistillationGate" packages/agent/src/agent-loop.ts
grep -n "WAGGLE_RERANKER\|WAGGLE_RAWDETAIL\|WAGGLE_PROMPT_ASSEMBLER" packages/agent/src
grep -n "isEnabled\|FEATURE_FLAGS" packages/agent/src/feature-flags.ts
# Confirm the benchmark cells already implement rungs 0/2/4:
sed -n '291,500p' benchmarks/harness/src/cells.ts
```
