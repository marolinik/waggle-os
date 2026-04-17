# Waggle OS — PromptAssembler implementation brief (v4)

**Audience:** Claude Code, operating in `D:\Projects\waggle-os`
**Authored by:** Claude.ai (strategy), reviewed with Marko
**Date:** April 17, 2026
**Supersedes:** v1, v2, v3. v4 replaces placeholder answers with repo-verified facts (feature flag location, task-shape API, LiteLLM configuration gaps), adds Opus 4.6 as a separate condition, and makes memory clean-slate explicit and enforced.
**Status:** Ready to implement — feature-flagged, default off. Eval run is part of the deliverable.

---

## 1. Context

Waggle OS ships a five-layer memory stack (Identity, Awareness, Frames, Knowledge Graph, Hybrid Search) feeding a single-turn orchestrator that assembles a system prompt. This works well with Claude Opus 4.7 / 4.6 / Sonnet 4.6. With small models (Gemma 4 31B Dense, Gemma 4 26B MoE, Qwen3-30B-A3B) the quality drops more than the raw capability gap predicts, because context is handed as an undifferentiated dump and small models lack the headroom to sort it mid-generation.

This brief implements **PromptAssembler** — a sixth layer between memory retrieval and the LLM call that produces a tier-adaptive, typed, scaffolded prompt. Wraps existing code; does not replace it. Feature-flagged, default off.

Waggle and KVARK are dev-stage projects with no accumulated user memory. The eval therefore populates memory organically through priming conversation turns, then runs the actual test question. This tests the full production loop (save_memory → cognify → retrieve → assemble → answer), not the assembler in isolation.

---

## 2. Goal and measurable target

**Goal.** Close ≥40% of the (Opus 4.7 baseline minus small-model baseline) quality gap on reasoning-heavy scenarios, without changing the model.

**Eval conditions:**

| Code | Model | Prompt path | Routing |
|------|-------|-------------|---------|
| A | Claude Opus 4.7 | current buildSystemPrompt | LiteLLM → native Anthropic |
| B | Gemma 4 31B Dense | current buildSystemPrompt | LiteLLM → OpenRouter |
| C | Gemma 4 31B Dense | PromptAssembler | LiteLLM → OpenRouter |
| D | Claude Opus 4.7 | PromptAssembler | LiteLLM → native Anthropic |
| E | Claude Opus 4.6 | current buildSystemPrompt | LiteLLM → native Anthropic |
| F | Claude Opus 4.6 | PromptAssembler | LiteLLM → native Anthropic |

**Secondary eval — does the pattern generalize across small models?** Repeat B and C with:
- Gemma 4 26B MoE (3.8B active)
- Qwen3-30B-A3B (30B total / 3B active)

**Success criterion.** `mean(C) − mean(B) ≥ 0.4 × (mean(A) − mean(B))` across the reasoning scenarios (1–5). D must not regress from A by more than 2pp on any scenario. Opus 4.7 vs 4.6 delta (A − E) is reported but not pass/fail — Marko wants the generation-over-generation measurement for future model-selection decisions.

---

## 3. Non-goals — do NOT touch

- `packages/core/src/mind/*` — memory internals.
- `packages/agent/src/evolution-*.ts`, `compose-evolution.ts`, `evolve-schema.ts`, `iterative-optimizer.ts`, `judge.ts` — evolution stack.
- `packages/optimizer/*`.
- `composePersonaPrompt` behavior.
- Injection scanner on recalled memory.
- MindDB schema, migrations, embedding pipeline.

---

## 4. Approach

Three additive components:

1. **Typed context frames.** Add `loadRecentContextFrames()` returning a typed struct. Keep existing `loadRecentContext()` for backwards compat.
2. **Tier-adaptive retrieval.** Map model → tier. Tier drives scoring profile, recall limit, score floor.
3. **Response scaffold by task shape.** Uses existing `detectTaskShape()` classifier (confirmed real, not stubbed — see §10). Injects short response skeleton when tier ≠ frontier and confidence ≥ 0.3.

---

## 5. Files to create

- `packages/agent/src/prompt-assembler.ts` — core class, ~300–400 LOC.
- `packages/agent/src/model-tier.ts` — tier type + mapping, ~80 LOC.
- `packages/agent/tests/prompt-assembler.test.ts` — unit tests.
- `packages/agent/tests/model-tier.test.ts` — tier mapping tests.
- `packages/agent/tests/eval/prompt-assembler-eval.ts` — eval harness.
- `packages/agent/tests/eval/scenarios-prompt-assembler.ts` — the 6 scenarios.

## 6. Files to modify

- `packages/agent/src/orchestrator.ts` — add `loadRecentContextFrames()`, `buildAssembledPrompt()`. Extend `recallMemory` signature with optional `{ limit, profile, scoreFloor, tier }`. Default-absent path must be byte-identical to current behavior (snapshot test).
- `packages/agent/src/model-router.ts` — import and re-export `tierForModel`.
- `packages/agent/src/agent-loop.ts` — read feature flag via `isEnabled('PROMPT_ASSEMBLER')`; off = current path unchanged; on = use `buildAssembledPrompt()`.
- `packages/agent/src/feature-flags.ts` — add `PROMPT_ASSEMBLER: process.env['WAGGLE_PROMPT_ASSEMBLER'] === '1'` to the `FEATURE_FLAGS` constant. (Location confirmed — this is the canonical flag mechanism. See §7.1.)
- `litellm-config.yaml` — add new model entries for Gemma 4 31B, Gemma 4 26B MoE, Qwen3-30B-A3B, and Claude Opus 4.7 (if not already routed). See §11.2.

---

## 7. Type contracts

### 7.1 Feature flag — confirmed pattern

The existing `packages/agent/src/feature-flags.ts` uses env-var driven flags on a `FEATURE_FLAGS` const object. Add a new line:

```ts
// packages/agent/src/feature-flags.ts
export const FEATURE_FLAGS = {
  // ... existing flags ...
  /** Enable PromptAssembler (tier-adaptive prompt packaging) */
  PROMPT_ASSEMBLER: process.env['WAGGLE_PROMPT_ASSEMBLER'] === '1',
} as const;
```

Use `isEnabled('PROMPT_ASSEMBLER')` in `agent-loop.ts`. Off by default. Eval harness sets `WAGGLE_PROMPT_ASSEMBLER=1` in the environment when running assembled conditions (C, D, F).

### 7.2 model-tier.ts

```ts
export type ModelTier = 'small' | 'mid' | 'frontier';

export function tierForModel(model: string): ModelTier;
// Frontier: 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-*'
// Mid:      'claude-sonnet-4-6', 'claude-sonnet-*', 'claude-haiku-4-5', 'claude-haiku-*'
// Small:    'gemma-4-31b*', 'gemma-4-26b*', 'gemma-4-*',
//           'qwen3-30b-a3b*', 'qwen3-32b*', 'qwen3.5-*',
//           'llama-3*', 'llama-4*' under ~40B
// Default (unknown): 'mid'
// Case-insensitive, match family prefix.
```

### 7.3 prompt-assembler.ts

```ts
import type { MemoryFrame } from '@waggle/core';
import type { AgentPersona } from './personas.js';
import type { ModelTier } from './model-tier.js';
import type { TaskShape } from './task-shape.js';  // existing type, see §10

export interface ContextFrames {
  stateFrames: MemoryFrame[];
  recentChanges: MemoryFrame[];
  activeWork: Array<{ category: string; content: string; priority: number }>;
  keyEntities: Array<{ name: string; type: string }>;
  personalPreferences: string[];
}

export interface RecalledMemory {
  workspace: MemoryFrame[];
  personal: MemoryFrame[];
  scanSafe: boolean;
}

export interface AssembleInput {
  corePrompt: string;
  persona: AgentPersona | null;
  context: ContextFrames;
  recalled: RecalledMemory;
  query: string;
  tier: ModelTier;
  taskShape?: TaskShape;  // from existing detectTaskShape()
  workspaceTone?: string;
}

export interface AssembledPrompt {
  system: string;
  userPrefix: string;
  responseScaffold: string | null;
  debug: {
    tier: ModelTier;
    taskShape: TaskShape['type'] | null;
    taskShapeConfidence: number;
    scaffoldApplied: boolean;
    sectionsIncluded: string[];
    framesUsed: number;
    totalChars: number;
  };
}

export interface AssembleOptions {
  taskShape?: TaskShape;
  tierOverride?: ModelTier;
  maxSystemChars?: number;  // default 32_000
  confidenceThreshold?: number;  // default 0.3
}

export class PromptAssembler {
  assemble(input: AssembleInput): AssembledPrompt;
}
```

---

## 8. Algorithm

1. Tier-scoped retrieval happens upstream in `recallMemory(..., opts)`. `assemble` consumes results.
2. Group frames by type. Dedupe by id. Rank I-frames by importance → recency. Keep top 3 / 6 / 10 for small / mid / frontier.
3. Compose system prompt in this section order, omitting empty sections:

```
# Identity
## Persona: <name>
# State
# Recent changes
# Active work
# Personal preferences
[# Response format]   (only if conditions in §9 met)
```

4. Truncation policy: if > `maxSystemChars`, trim Recent changes → Active work → State. Never trim Identity or Persona.
5. `userPrefix` empty in v1. Reserved.
6. `responseScaffold` per §9 gating.
7. Injection safety: `recallMemory` already scans. Do not re-scan.
8. `debug` fully populated — eval reads it.

---

## 9. Scaffold matrix — using existing TaskShape taxonomy

The existing `detectTaskShape()` in `packages/agent/src/task-shape.ts` uses a 7-value taxonomy: `research | compare | draft | review | decide | plan-execute | mixed`. Use this directly; do not reinvent. Map to scaffold categories via this table:

| TaskShape | Scaffold category | Small tier | Mid tier | Frontier |
|-----------|-------------------|------------|----------|----------|
| research | retrieval | "Cite the frame. Quote the relevant fragment. Answer directly." | "Cite source. Answer." | (none) |
| compare | analysis | "State the assumption. List the trade-offs. Give the recommendation." | "Briefly state assumption, then recommendation." | (none) |
| decide | analysis | "State the assumption. List the trade-offs. Give the recommendation." | "Briefly state assumption, then recommendation." | (none) |
| review | analysis | "State the assumption. List the trade-offs. Give the recommendation." | "Briefly state assumption, then recommendation." | (none) |
| plan-execute | execution | "Confirm inputs. State plan in one sentence. Execute. Report result." | "State plan. Execute. Report." | (none) |
| draft | creation | (none) | (none) | (none) |
| mixed | (none) — too ambiguous to scaffold | (none) | (none) | (none) |

**Additional gate:** apply scaffold only when `taskShape.confidence ≥ 0.3` (default — tunable via `confidenceThreshold`). Low-confidence classifications degrade gracefully to no scaffold. This protects against misfires on Serbian input (the classifier is English-only — see §10).

Store the mapping as a const `SCAFFOLD_MAP: Record<TaskShape['type'], { small: string | null; mid: string | null; frontier: string | null }>`.

---

## 10. Task-shape classification — use the existing classifier

**Verified:** `packages/agent/src/task-shape.ts` implements a real, well-designed heuristic classifier. Not stubbed. Do not reimplement.

```ts
// Usage inside assemble():
import { detectTaskShape } from './task-shape.js';

const shape = detectTaskShape(query);
// shape.type: TaskShapeType ('research' | 'compare' | ...)
// shape.confidence: 0..1
// shape.complexity: 'simple' | 'moderate' | 'complex'
// shape.signals: diagnostic array
```

**Language caveat:** the classifier is English-only — patterns match English phrases (`should I`, `compare X to Y`, `draft me a`, etc.). Serbian queries will typically return `type: 'draft'` with `confidence: 0.1` (the fallback default). The `confidenceThreshold: 0.3` gate in §9 means Serbian queries will naturally get no scaffold. This is acceptable behavior for v1 — bilingualizing the classifier is a separate, larger change outside this brief's scope.

---

## 11. The eval — priming, test, judge

### 11.1 Per-scenario flow

For each of the 6 scenarios (§13):

1. **CLEAN SLATE.** Before the scenario starts:
   - Compute a scenario-specific temp directory path: `<os.tmpdir()>/waggle-eval-<timestamp>-<scenario-name>/`.
   - `rm -rf` that directory if it exists (`fs.rmSync(path, { recursive: true, force: true })`).
   - `mkdir -p` to recreate it.
   - Instantiate a new `MindDB(path.join(tempDir, 'mind.db'))`. Schema initializes on first open.
   - **Assert that `SELECT COUNT(*) FROM memory_frames` returns 0.** Abort the scenario with a clear error if not — means the previous run didn't clean up.

2. **Identity set.** `identity.create({ name: 'Marko', role: 'CEO' })`.

3. **Priming phase.** Run 2 conversation turns through the full `runAgentLoop`, using Claude Sonnet 4.6 (native Anthropic, via `claude-sonnet-4-6` entry in LiteLLM) as the priming assistant. Each turn goes through the real orchestrator, so `autoSaveFromExchange` and `cognify` fire naturally. Priming user messages are crafted to include save-trigger phrases that activate the heuristics in `autoSaveFromExchange`.

4. **Memory verification.** After priming:
   - `SELECT COUNT(*) FROM memory_frames` must be ≥ 2. Log the actual count.
   - For each substring in `memoryVerificationSubstrings`, query `SELECT 1 FROM memory_frames WHERE content LIKE ?` with `%substring%`. Log which matched.
   - If verification fails, mark this scenario `primingFailed: true` in the results. Do not abort the whole eval — continue with other scenarios. Priming failure is a valuable finding.

5. **Snapshot MindDB.** Copy the SQLite file to `<tempDir>/snapshot.db`.

6. **Test phase.** For each condition (A / B / C / D / E / F + secondary B' / C' / B'' / C''):
   - Close any open connection to the main DB.
   - `fs.copyFileSync(snapshotPath, workDbPath)` — fresh copy of the snapshot for this condition.
   - Instantiate a new `MindDB(workDbPath)` and its Orchestrator.
   - Set env var `WAGGLE_PROMPT_ASSEMBLER=1` for conditions C, D, F, secondary C', C''. Unset for A, B, E, secondary B', B''.
   - Run the test turn through `runAgentLoop` with the condition's model.
   - Capture the assistant output and the `debug` block from `AssembledPrompt` (for assembled conditions).

7. **Judge phase.** For each output, call `LLMJudge.score({ input: testQuery, expected: conditionA_output, actual: conditionX_output })` with Sonnet 4.6 as judge. Gold reference for B/C/D/E/F/B'/C'/B''/C'' is condition A's output for that scenario.

8. **Repeat across 3 seeds.** Seed varies only the test-turn generation (decoding temperature is fixed; seed controls tie-breaking in retrieval ranking and any random sampling). Priming is run once per scenario with seed=0 — same memory state across all seeds for all conditions.

9. **Cleanup.** After the scenario completes, `rm -rf` the entire temp directory. Don't leave state on disk between scenarios.

### 11.2 Model access — LiteLLM configuration

Existing `litellm-config.yaml` covers Sonnet 4.6 and Opus 4.6 natively. It does not cover Opus 4.7, Gemma 4, or Qwen3-30B-A3B. Claude Code must add new entries.

Add to `litellm-config.yaml` (leave existing entries untouched):

```yaml
  # ── Added for PromptAssembler eval (v4) ────────────────────────

  # Claude Opus 4.7 — native Anthropic. Released 16 April 2026 (yesterday).
  # Confirmed by Marko: use native Anthropic endpoint, NOT the OpenRouter route.
  - model_name: claude-opus-4-7
    litellm_params:
      model: anthropic/claude-opus-4-7-20260416
      api_key: os.environ/ANTHROPIC_API_KEY
  # If the exact date suffix differs from 20260416, probe the Anthropic API
  # (`curl https://api.anthropic.com/v1/models` with your API key) to discover
  # the current Opus 4.7 model ID and substitute. Family is stable; only the
  # date suffix may shift.

  # Gemma 4 — via OpenRouter
  - model_name: gemma-4-31b
    litellm_params:
      model: openrouter/google/gemma-4-31b-it
      api_key: os.environ/OPENROUTER_API_KEY

  - model_name: gemma-4-26b-moe
    litellm_params:
      model: openrouter/google/gemma-4-26b-it
      api_key: os.environ/OPENROUTER_API_KEY

  # Qwen3-30B-A3B — via OpenRouter
  - model_name: qwen3-30b-a3b
    litellm_params:
      model: openrouter/qwen/qwen3-30b-a3b-instruct
      api_key: os.environ/OPENROUTER_API_KEY
```

**Slug verification step:** before the eval runs, Claude Code must issue a trivial probe (curl or a LiteLLM test-completion) against each small-model slug to confirm it resolves. OpenRouter model slugs can change — if a slug is dead (404 or "model not found"), substitute the current equivalent from the OpenRouter catalog and log the substitution. If no current equivalent exists, skip that model in secondary suite and note in results.

**Routing summary:**
- A, D (Opus 4.7): LiteLLM → native Anthropic (released 16 April 2026)
- E, F (Opus 4.6): LiteLLM → native Anthropic
- Sonnet 4.6 (priming + judge): LiteLLM → native Anthropic
- B, C (Gemma 4 31B): LiteLLM → OpenRouter
- Secondary B', C' (Gemma 4 26B): LiteLLM → OpenRouter
- Secondary B'', C'' (Qwen3-30B-A3B): LiteLLM → OpenRouter

All inference goes through the LiteLLM proxy at `litellmUrl` already configured in Waggle. Do not bypass LiteLLM and call OpenRouter directly — that would miss the retry, timeout, and logging layers already configured.

### 11.3 Outputs Claude Code must produce

1. `tmp_bench_results.json` (repo root) — full structured results. Include debug block per run, priming success flag, primingFrameCount, verification substring match map, duration metrics.
2. Console table at end of run — scenario rows × condition columns (A, B, C, D, E, F) with means, per-row (C−B) delta and (A−B) gap, aggregate totals, Opus generation delta (A−E).
3. `EVAL-RESULTS.md` (repo root) — human-readable summary. Structure below.

### 11.4 EVAL-RESULTS.md structure

```markdown
# PromptAssembler eval results

**Run date:** <ISO>
**Commit:** <sha>
**Duration:** <minutes>
**LiteLLM slug probe:** pass / partial / fail — note any substitutions

## Summary

| Metric                                    | Value       |
|-------------------------------------------|-------------|
| Scenarios                                 | 6           |
| Scenarios with successful priming         | X / 6       |
| Seeds per scenario                        | 3           |
| Target (C closes ≥40% of A−B gap)         | pass / fail |
| D regression vs A (max over rows)         | X.XXpp      |
| Opus generation delta (A 4.7 − E 4.6)     | X.XXpp      |
| Gap closure achieved (primary)            | X%          |

## Priming results

<table: scenario × memoryVerificationSubstrings matched / missed>

Primary findings from priming (narrative, 2–4 bullets):
- Did English priming work?
- Did Serbian priming work?
- Any scenario-specific surprises?

## Primary run — Gemma 4 31B Dense (B, C) vs Claude Opus 4.7 (A, D) vs Opus 4.6 (E, F)

<per-scenario breakdown: mean scores per condition, (C−B) delta, (A−B) gap, sample output from best-scoring C seed>

## Secondary — Gemma 4 26B MoE
<same structure, B' and C' only>

## Secondary — Qwen3-30B-A3B
<same structure, B'' and C'' only>

## Cross-model pattern

Does (C − B) hold positive across Gemma 31B, Gemma 26B MoE, Qwen 30B-A3B?
- All three positive → structural effect
- Some positive → partial; note which and hypothesize
- None positive → thesis wrong; next step is scenario iteration or project kill

## Opus generation delta

A (Opus 4.7) vs E (Opus 4.6) on each scenario — does 4.7 actually outperform 4.6 on Waggle workloads?

## Honest observations

<3–5 bullets. Flag surprises. Don't tune scaffolds to make numbers look better.>
```

### 11.5 The test → run → report loop

1. Implement code (§5, §6).
2. Run unit tests + existing 291 E2E. All green before proceeding.
3. Implement scenarios (§13) and harness (§11.1).
4. Update `litellm-config.yaml` (§11.2). Run slug probe to verify endpoints reachable.
5. Execute the eval. Expected duration: 60–120 minutes. Log per-scenario progress to stdout. Each scenario's temp dir is cleaned after use.
6. Generate three output artifacts.
7. Re-read `EVAL-RESULTS.md`. Flag surprises in "Honest observations". Do not tune scaffolds retroactively.
8. Commit code, scenarios, and `EVAL-RESULTS.md`. `tmp_bench_results.json` goes in `.gitignore`.
9. Report back to Marko with one-paragraph outcome, link to `EVAL-RESULTS.md`, any blockers.

---

## 12. Unit tests (must pass before eval)

### 12.1 prompt-assembler.test.ts

Hand-built fixtures. No LLM, no DB.

- Identity + Persona always present.
- `small` tier: State ≤ 3 frames.
- `frontier` tier: no Response-format section.
- `mid` + `plan-execute` shape (via mocked detectTaskShape return): scaffold = "State plan. Execute. Report."
- `draft` shape at any tier: no scaffold.
- `mixed` shape at any tier: no scaffold.
- Confidence below threshold (0.3): no scaffold regardless of shape/tier.
- Empty `context.stateFrames`: State section omitted (not empty-header).
- `maxSystemChars` exceeded: Recent changes trimmed first, State last, Identity/Persona never.
- `recalled.scanSafe === false`: recalled memory ignored.
- `debug.framesUsed` matches rendered count.
- `debug.scaffoldApplied` matches whether scaffold text is non-null.

### 12.2 model-tier.test.ts

- `claude-opus-4-7` → `frontier`
- `claude-opus-4-6` → `frontier`
- `claude-sonnet-4-6` → `mid`
- `claude-haiku-4-5` → `mid`
- `gemma-4-31b` → `small`
- `gemma-4-26b-moe` → `small`
- `qwen3-30b-a3b` → `small`
- `qwen3-32b` → `small`
- `unknown-model-xyz` → `mid`
- `Claude-Opus-4-7` → `frontier` (case-insensitive)

### 12.3 Orchestrator integration

- `recallMemory("test")` with no options → byte-identical to current behavior (snapshot test on output string).
- `buildAssembledPrompt("test", null)` on a minimally seeded DB → well-formed output, non-empty system, debug populated.

### 12.4 Feature-flag snapshot

- `FEATURE_FLAGS.PROMPT_ASSEMBLER === false` when env var unset.
- `FEATURE_FLAGS.PROMPT_ASSEMBLER === true` when `WAGGLE_PROMPT_ASSEMBLER=1`.
- `agent-loop.ts` with flag off: system prompt output byte-identical to pre-change code. Regression protection.

---

## 13. The 6 scenarios (priming + test)

Each scenario is a mini-conversation. `primingTurns` run first with Sonnet 4.6, producing memory frames. Then `testTurn` runs under each condition. Every priming user message includes at least one phrase expected to trigger `autoSaveFromExchange` heuristics ("decided", "we'll use", "I prefer", "going with"). Serbian scenarios mix Serbian content with English trigger phrases to improve save success rate while keeping the domain language authentic.

### Scenario 1 — Analysis/Decide, Serbian

```ts
{
  name: 'sovereignty-deployment',
  shape: 'decide',
  language: 'sr',
  primingTurns: [
    { user: "Imamo novi projekat. Tri početna enterprise klijenta — banke i telco iz regiona. Svi imaju regulatorne zahteve za data residency u Srbiji, to je tvrdo ograničenje." },
    { user: "We decided to go with on-prem deployment on our H200 x8 hardware. Suverenitet je core value proposition — klijenti ne žele hyperscaler cloud. We'll use our own stack for all three initial customers." },
  ],
  testTurn: {
    query: "Sumiraj naš deployment pristup za prva tri klijenta i obrazloži zašto smo tako odlučili.",
  },
  memoryVerificationSubstrings: ['data residency', 'on-prem', 'H200'],
  rubricHints: "Should cite on-prem decision, reference data-residency constraints, mention sovereignty positioning, acknowledge H200 hardware. Serbian response expected. Classifier confidence likely low on Serbian query — scaffold likely not applied. That's acceptable.",
}
```

### Scenario 2 — Compare, English

```ts
{
  name: 'decomposition-choice',
  shape: 'compare',
  language: 'en',
  primingTurns: [
    { user: "I ran a decomposition experiment last week. Finding: MECE is the cost-efficient winner — same IC% as BPMN at 2-4x lower token cost. BPMN wins on gate complexity: 14 LLM calls vs MECE's 8 for equivalent gate logic. I decided MECE is our default for simple workflows." },
    { user: "New challenge. An energy client wants a 24-agent workflow with complex cross-agent dependencies — orchestration, approvals, compensation, rollback. We'll use one of the two methods for this." },
  ],
  testTurn: {
    query: "Compare MECE vs BPMN for this 24-agent workflow. Which method should we use and why?",
  },
  memoryVerificationSubstrings: ['MECE', 'BPMN', '24-agent'],
  rubricHints: "Should recommend BPMN for the complex gates despite higher cost; acknowledge MECE as simpler-default; state trade-off explicitly. Expected scaffold: analysis (assumption → trade-offs → recommendation).",
}
```

### Scenario 3 — Plan-execute, English

```ts
{
  name: 'migration-plan',
  shape: 'plan-execute',
  language: 'en',
  primingTurns: [
    { user: "Our product has three tiers I want you to remember. Solo is free. Teams is $29/month per user. Business is $79/month. We decided Teams requires cloud webhook for billing — Stripe integration, still pending as M2-2." },
    { user: "Technical architecture for tiers: Solo uses local SQLite per user — fully offline. Teams adds a shared workspace mind with team sync on top, but personal minds remain local. Data migration path: user's local SQLite frames get replicated to the workspace mind on first Teams login." },
  ],
  testTurn: {
    query: "Create a plan to migrate a 10-person design firm from Waggle Solo to Waggle Teams. Break it down into concrete steps including any blockers.",
  },
  memoryVerificationSubstrings: ['$29', 'Teams', 'Stripe', 'workspace mind'],
  rubricHints: "Numbered plan ~5-7 steps, Stripe/M2-2 as blocker, data migration (local → workspace mind), total cost ($290/mo). Expected scaffold: execution (confirm inputs → plan → execute → report).",
}
```

### Scenario 4 — Research, English

```ts
{
  name: 'license-boundary',
  shape: 'research',
  language: 'en',
  primingTurns: [
    { user: "We're preparing a proposal for Yettel Serbia — AI and MLOps platform based on our KVARK core plus custom connectors for their telco systems." },
    { user: "Critical clause we decided on: the KVARK license boundary must be non-negotiable in this deal. We license a deployment, not the source. That protects our IP — KVARK remains Egzakta property and we can use it for other clients. I want you to remember this as a hard constraint." },
  ],
  testTurn: {
    query: "What is the KVARK license boundary in the Yettel proposal, and why is it non-negotiable?",
  },
  memoryVerificationSubstrings: ['KVARK', 'license boundary', 'non-negotiable'],
  rubricHints: "Cite the specific fact (boundary non-negotiable) and the reason (IP separation, KVARK stays Egzakta). Direct answer, no hedging. Expected scaffold: retrieval (cite frame → quote → answer).",
}
```

### Scenario 5 — Research, Serbian

```ts
{
  name: 'investor-status',
  shape: 'research',
  language: 'sr',
  primingTurns: [
    { user: "Radimo rundu investicije. Cilj nam je EUR 20M, pre-money procena između 70 i 80 miliona evra." },
    { user: "Aktivan kontakt je Clipperton Finance, partner Dr. Nikolas Westphal. We decided to sign the NDA, pitch deck je poslat. Trenutno su u fazi dubinske analize, čekamo povratnu informaciju." },
  ],
  testTurn: {
    query: "Ko su aktivni investitori za našu rundu i u kojoj fazi smo sa njima?",
  },
  memoryVerificationSubstrings: ['Clipperton', 'Westphal', '20M'],
  rubricHints: "Should name Clipperton Finance and Dr. Nikolas Westphal, state status (NDA signed, deck sent, due diligence). Serbian response. Low classifier confidence likely → no scaffold. Tests whether mid-Serbian-context bilingual priming saved the facts.",
}
```

### Scenario 6 — Draft, English

```ts
{
  name: 'floodtwin-summary',
  shape: 'draft',
  language: 'en',
  primingTurns: [
    { user: "We're drafting FloodTwin-WB — a concept for the EU Horizon 2026 call. Flood digital twin for the Western Balkans. Deadline is April 2026." },
    { user: "Scope we decided on: Serbia plus five Western Balkan countries. Existing hydro models are siloed per country — we'll use a cross-border digital twin with real-time sensor fusion to unify them. Consortium partner we're going with: Mistral AI, because the sovereignty narrative strengthens the EU angle." },
  ],
  testTurn: {
    query: "Draft a 150-word executive summary for the FloodTwin-WB proposal.",
  },
  memoryVerificationSubstrings: ['Western Balkans', 'Mistral', 'cross-border'],
  rubricHints: "Creative task — judge on coherence and inclusion of key elements (Western Balkans, Mistral, cross-border unification, EU sovereignty). NO scaffold should apply — `draft` shape maps to creation category, no scaffold at any tier. If condition C shows a scaffold in debug, it's a classification bug.",
}
```

---

## 14. Acceptance criteria

- [ ] All 291 existing E2E tests pass.
- [ ] 0 TypeScript errors across monorepo.
- [ ] Feature flag off = snapshot-identical behavior (§12.4).
- [ ] Unit tests (§12) pass.
- [ ] LiteLLM slug probe passes for all six models (or substitutions logged).
- [ ] Eval harness executes primary suite (A/B/C/D/E/F) end-to-end. Secondary suites complete if endpoints available; otherwise skipped with explicit note in results.
- [ ] EVAL-RESULTS.md committed with real numbers.
- [ ] Priming-verification results included per scenario.
- [ ] Clean-slate assertion passes at the start of every scenario (§11.1 step 1).
- [ ] No temp files or databases left on disk after the run.
- [ ] No changes to `/packages/core/src/mind/*` or evolution stack.
- [ ] `composePersonaPrompt` unchanged.

Target met is desired, not required. Ship the code regardless — measurement is the point.

---

## 15. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| OpenRouter slug for Gemma 4 / Qwen changes post-brief | Slug probe step before eval; substitute and log if needed |
| Opus 4.7 Anthropic API rate-limited (newly released, uncertain capacity) | Retry via evolution-llm-wiring policy; if sustained, Opus 4.6 (E/F) serves as secondary ceiling measurement |
| Serbian priming doesn't save frames (English-regex heuristics) | Verification step surfaces it; results flag scenarios as primingFailed rather than hiding |
| Cross-scenario state leak | rm -rf + mkdir + COUNT(*) assertion at scenario start; another rm -rf at end |
| Eval too long (60–120 min) | Log per-scenario; checkpoint not required in v1 |
| Small-tier 3-frame limit too restrictive | Score floor filters first; adjust floor before limit if needed |

---

## 16. Rollback

Single feature flag. `unset WAGGLE_PROMPT_ASSEMBLER`. Done.

---

## 17. Implementation order

1. `model-tier.ts` + tests.
2. `ContextFrames` type + `loadRecentContextFrames()`. Tests.
3. Extend `recallMemory` with options. Snapshot test identical-when-absent.
4. `PromptAssembler` + unit tests. Fully mocked. Uses `detectTaskShape` from existing module.
5. `buildAssembledPrompt()` + integration test.
6. Feature flag in `feature-flags.ts`; flag-gate in `agent-loop.ts`. Snapshot test flag-off.
7. Scenarios file (§13).
8. `litellm-config.yaml` updates (§11.2). Slug probe.
9. Eval harness with clean-slate enforcement.
10. Execute the eval. Log progress per scenario.
11. Generate `EVAL-RESULTS.md`.
12. Read own results. Flag surprises honestly.
13. Commit. Report back.

---

## 18. Don't

- Don't rewrite `buildSystemPrompt` — wrap it.
- Don't touch `recallMemory`'s catch-up branch.
- Don't reinvent task-shape classification — use existing `detectTaskShape`.
- Don't pre-seed memory frames. Priming turns only.
- Don't skip the clean-slate step. Each scenario starts empty, ends empty.
- Don't add new providers, embedders, or DB tables (except the four new LiteLLM entries specified in §11.2).
- Don't fix GEPA while you're in there.
- Don't tune scaffold text against eval scenarios after seeing numbers.
- Don't silently skip scenarios because of endpoint issues. Log and continue.
- Don't hide priming failures.
- Don't bypass LiteLLM to call OpenRouter directly. All routing through LiteLLM proxy.
