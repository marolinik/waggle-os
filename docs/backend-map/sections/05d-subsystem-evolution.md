# Subsystem: Self-Evolution Loop

## Purpose

The Evolution subsystem is Waggle's **self-improvement engine**: it mines the agent's own execution history, evolves better persona prompts and behavioral-spec text using a GEPA population-search + EvolveSchema mutation pipeline scored by an LLM-as-judge, passes survivors through safety gates, persists every attempt as an auditable `EvolutionRun`, and lets the user **accept** (deploy as an override file) or **reject** each proposal. It never auto-deploys — every accepted change writes a versioned, rollback-able override and hot-reloads the live spec. The frontend surface is the **Memory app → Evolution tab**.

This section is the contract for the frontend rebuild. The endpoints, payload shapes, status enums, and SSE event names below are quoted directly from the backend code (`packages/server/src/local/routes/evolution.ts`, `packages/agent/src/*`, `packages/hive-mind-core/src/mind/{execution-traces,evolution-runs}.ts`).

---

## 1. The Closed Loop (mental model)

```
 every chat turn ──► TraceRecorder ──► execution_traces table
                                              │
            (manual "New Run" OR background EvolutionService tick)
                                              │
                                              ▼
   EvolutionOrchestrator.runOnce()
     1. trigger-check  (enough eligible traces?)
     2. dataset        (EvalDatasetBuilder mines traces → EvalExample[])
     3. compose        (ComposeEvolution = EvolveSchema then IterativeGEPA)
     4. gates          (runGates: size / growth / structural / regression)
     5. persist        (EvolutionRunStore.create → status 'proposed')
                                              │
                                              ▼
                         evolution_runs table  (status: proposed)
                                              │
                 user reviews in Evolution tab │
                  ┌───────────────────────────┴───────────────────────────┐
                  ▼                                                         ▼
         POST .../accept                                          POST .../reject
                  │                                                         │
       deploy callback writes                                     status → 'rejected'
       override JSON file +                                          (terminal)
       emits cache-invalidation event
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   status 'deployed'   status 'failed'
   (deploy threw)
```

Key design fact (from `evolution-orchestrator.ts`): **the orchestrator is pure and does NOT touch the filesystem.** Deploy is a pluggable callback supplied by the server route. This means the frontend talks only to HTTP; all file writes happen server-side behind the `accept` endpoint.

---

## 2. HTTP API — every endpoint

Base path is `/api/evolution`. All routes registered in `packages/server/src/local/routes/evolution.ts` via `evolutionRoutes`. The web app calls them through `adapter.fetch(...)` (see `EvolutionTab.tsx`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/evolution/runs` | List runs (newest first). Filterable. |
| GET | `/api/evolution/runs/:uuid` | Single run detail, with `winner_schema_json` / `artifacts_json` / `gate_reasons_json` pre-parsed into `winnerSchema` / `artifacts` / `gateReasons`. |
| POST | `/api/evolution/runs/:uuid/accept` | Accept a `proposed` run → deploy override file → mark `deployed` (or `failed`). |
| POST | `/api/evolution/runs/:uuid/reject` | Reject a `proposed` run → mark `rejected`. |
| GET | `/api/evolution/targets` | Enumerate evolvable targets: persona list + behavioral-spec section names + a default schema. Populates the New-Run dropdowns. |
| GET | `/api/evolution/baseline` | Fetch the live baseline text (`?kind=&name=`) for a target plus a default `schemaBaseline`. |
| POST | `/api/evolution/run` | Trigger a real evolution run synchronously (Haiku-backed). Returns JSON, **or streams SSE** when `Accept: text/event-stream`. |
| GET | `/api/evolution/status` | Aggregate status counts for the dashboard + `pendingCount`. |

### 2.1 GET `/api/evolution/runs`

Query params (all optional):

| Param | Type | Notes |
|---|---|---|
| `status` | string \| string[] | One of `proposed\|accepted\|rejected\|deployed\|failed`. Repeat the param for multiple. |
| `targetKind` | string | e.g. `persona-system-prompt`. |
| `targetName` | string | e.g. `coder`. |
| `since` | ISO string | Lower bound on `created_at`. |
| `limit` | string | Parsed to int, clamped `1..500`, default `50`. |

Response: `{ runs: EvolutionRun[], count: number }`.

### 2.2 GET `/api/evolution/runs/:uuid`

404 `{ error: 'Run not found' }` when missing. On success returns the full `EvolutionRun` row **plus** three decoded fields:

```jsonc
{
  ... all EvolutionRun columns ...,
  "winnerSchema": <parsed winner_schema_json | null>,
  "artifacts":   <parsed artifacts_json | null>,
  "gateReasons": <parsed gate_reasons_json | []>   // [{ gate, verdict, reason }]
}
```

### 2.3 POST `/api/evolution/runs/:uuid/accept`

Body: `{ note?: string }`.
Guards: 404 if not found; **409** `{ error: 'Run is in status "X" — only proposed runs can be accepted' }` when status ≠ `proposed`.
On success returns the updated `EvolutionRun` (status will be `deployed` on a successful deploy, `failed` if the deploy callback threw). Server-side side effects: writes an override file (see §6) and emits `persona:reloaded` or `behavioral-spec:reloaded` on the server event bus to invalidate the chat route's system-prompt cache.

### 2.4 POST `/api/evolution/runs/:uuid/reject`

Body: `{ reason?: string }`. Same 404 / 409 guards. Returns the updated run (status `rejected`).

### 2.5 GET `/api/evolution/targets`

```jsonc
{
  "personas": [{ "id": "coder", "name": "Coder", "description": "...", "icon": "..." }],
  "sections": ["coreLoop","qualityRules","behavioralRules","workPatterns","intelligenceDefaults"],
  "defaultSchema": { "name": "generic_baseline", "version": 1, "fields": [ ... ] }
}
```

### 2.6 GET `/api/evolution/baseline?kind=&name=`

Both query params **required** (400 if missing). Valid `kind`: `persona-system-prompt` or `behavioral-spec-section`.
- `persona-system-prompt`: returns the persona's live `systemPrompt`. 404 if unknown persona.
- `behavioral-spec-section`: returns the **active** section text (deployed overrides already applied via `server.activeBehavioralSpec`, falling back to compile-time `BEHAVIORAL_SPEC`). 404 if unknown section.

Response: `{ baseline: string, schemaBaseline: Schema }`.

### 2.7 POST `/api/evolution/run` — trigger a real run

Request body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `targetKind` | `EvolutionTarget` | yes | Must be one of `persona-system-prompt`, `behavioral-spec-section`, `tool-description`, `skill-body`, `generic`. |
| `targetName` | string | yes | Non-empty. |
| `baseline` | string | yes | Non-empty current instruction text. |
| `schemaBaseline` | `Schema` | yes | Object with string `name` + array `fields` (+ `version`). |
| `minDelta` | number | no | Improvement threshold to create a proposal. Default `0.02` (2pp). |
| `gepa` | object | no | `{ populationSize?, generations?, miniEvalSize?, anchorEvalSize?, seed?, concurrency? }`. Route defaults `concurrency` to `4`. |
| `schema` | object | no | `{ populationSize?, generations?, evalSize?, anchorEvalSize?, seed? }`. |
| `gateOptions` | `GateOptions` | no | Override gate caps/tolerances. |

Status codes:

| Code | Meaning |
|---|---|
| 200 | Orchestrator ran — inspect `body.outcome` (see §3.4). |
| 400 | Validation error (bad/missing body field). |
| 422 | No Anthropic API key in the vault (`Add one in Settings → Vault`). |
| 503 | `@ax-llm/ax` unavailable / LLM init failed. |
| 500 | Run threw mid-flight (JSON path only). |

JSON response payload (`buildResultPayload`):

```jsonc
{
  "outcome": "proposed | skipped-trigger | skipped-gates | skipped-delta | aborted",
  "reason": "<string | undefined>",
  "run": <EvolutionRun | undefined>,          // present for proposed + skipped-gates
  "gateResults": <GateResult[] | undefined>,
  "composeSummary": {                          // null when compose didn't run
    "combinedDelta": 0.07,
    "fullyImproved": true,
    "schemaImproved": true,
    "schemaDelta": 0.03,
    "instructionImproved": true,
    "instructionDelta": 0.05,
    "winnerId": "g3-m1"
  }
}
```

**SSE mode** — when the client sends `Accept: text/event-stream`, the route streams `text/event-stream` (the New-Run modal does this). Events:

| `event:` | `data:` payload |
|---|---|
| `open` | `{ targetKind, targetName }` — stream-is-live signal. |
| `progress` | `EvolutionProgress` `{ phase, message?, detail? }` (see §3.1). |
| `done` | the same `buildResultPayload` object as the JSON path. |
| `error` | `{ error: string }`. |

The orchestrator run **continues to completion even if the client disconnects** (cancelling mid-flight would waste LLM spend already incurred).

### 2.8 GET `/api/evolution/status`

Query: `targetKind?`, `targetName?`, `since?`.
Response: `{ counts: Record<EvolutionRunStatus, number>, pendingCount: number }` where `pendingCount === counts.proposed`.

---

## 3. Core data shapes

### 3.1 `EvolutionProgress` (orchestrator phases, also the SSE `progress` payload)

```ts
phase: 'trigger-check' | 'dataset' | 'compose' | 'gates' | 'persist' | 'skipped' | 'done'
message?: string
detail?: unknown   // nested ComposeProgress / GEPAProgress / EvolveSchemaProgress event
```

### 3.2 `EvolutionRun` (the `evolution_runs` SQLite row — source of truth for the UI list/detail)

| Column | Type | Notes |
|---|---|---|
| `id` | number | Autoincrement PK. |
| `run_uuid` | string | UNIQUE; the public identifier used in all route paths. |
| `target_kind` | `EvolutionRunTarget` | `persona-system-prompt` \| `behavioral-spec-section` \| `tool-description` \| `skill-body` \| `generic`. |
| `target_name` | string \| null | Persona id or spec-section name. |
| `baseline_text` | string | Pre-evolution text. |
| `winner_text` | string | Evolved winner text. |
| `winner_schema_json` | string \| null | JSON-encoded `Schema` when a schema stage ran. |
| `delta_accuracy` | number | Winner − baseline judge score (0..1 fraction; UI renders as `pp`). |
| `gate_verdict` | `'pass' \| 'fail'` | Overall gate verdict. |
| `gate_reasons_json` | string | JSON array of `{ gate, verdict, reason }`. |
| `status` | `EvolutionRunStatus` | `proposed` \| `accepted` \| `rejected` \| `deployed` \| `failed`. |
| `artifacts_json` | string \| null | Per-gen history / Pareto size / example count blob. |
| `user_note` | string \| null | Accept note or reject reason. |
| `failure_reason` | string \| null | Set when status is `failed`. |
| `created_at` | string | ISO/SQLite datetime. |
| `decided_at` | string \| null | When accepted/rejected. |
| `deployed_at` | string \| null | When deployed/failed. |

> **Frontend note:** the current `EvolutionTab.tsx` type uses `gate_verdict: 'pass' | 'fail' | 'warn'` and a `resolved_at` field, but the backend only ever emits `'pass' | 'fail'` and uses `decided_at` / `deployed_at` (there is no `resolved_at` column or `warn` verdict). Build against the backend columns above; treat `warn` as cosmetic.

### 3.3 `ExecutionTrace` / `TracePayload` (the raw fuel — `execution_traces` table)

The loop's input. Written by `TraceRecorder` (agent-side facade) on every chat turn / workflow phase. Frontend does not write these, but they explain where eval data comes from.

| Column | Type | Notes |
|---|---|---|
| `id` | number | PK. |
| `session_id` / `persona_id` / `workspace_id` | string \| null | Filtering keys. |
| `model` | string \| null | Model used. |
| `task_shape` | string \| null | Task classification. |
| `outcome` | `TraceOutcome` | `success` \| `corrected` \| `abandoned` \| `verified` \| `pending`. |
| `trace_json` | string | Serialized `TracePayload`. |
| `cost_usd` / `duration_ms` | number | Metrics. |
| `created_at` / `finalized_at` | string \| null | Timestamps. |

`TracePayload` = `{ input, output, reasoning[], toolCalls[], artifacts[], tokens, harness?, correctionFeedback?, tags? }`. Tool-call args are secret-scrubbed before persistence (`SECRET_ARG_KEYS` in `trace-recorder.ts`).

### 3.4 `OrchestratorOutcome` (drives `outcome` in run-trigger responses)

| Value | Meaning |
|---|---|
| `proposed` | Run created, gates passed, awaiting accept/reject. `run` populated. |
| `skipped-trigger` | Auto-trigger threshold not met / no eligible traces to form a dataset. |
| `skipped-gates` | Compose ran but gates failed; run is created then **immediately auto-rejected** (kept for audit). `run` populated. |
| `skipped-delta` | Winner improved less than `minDelta`; no proposal created. |
| `aborted` | Abort signal fired. |

### 3.5 `Schema` (DSPy-style typed signature evolved by EvolveSchema)

```ts
Schema      = { name: string; version: number; fields: SchemaField[] }
SchemaField = { name; type: FieldType; description; required: boolean; constraints: FieldConstraint[] }
FieldType   = 'string'|'number'|'boolean'|'array'|'object'|'enum'
FieldConstraint = { kind: 'minLength'|'maxLength'|'pattern'|'enum'|'range'|'custom'; value: string|number|string[] }
```

Default schema (from both `evolution.ts` route and `evolution-service.ts`): two fields `reasoning` (string, optional) then `answer` (string, required).

---

## 4. The evolution pipeline internals (for accurate UI labels/tooltips)

### 4.1 EvalDatasetBuilder (`eval-dataset.ts`)
Mines `execution_traces` into `EvalExample { input, expected_output, metadata }`. Positive examples come from `success`/`verified` outcomes; `corrected` traces become negatives whose `correctionFeedback` is the ground truth. Filter pipeline order: **secret scan → length/low-signal heuristic → optional judge → input-hash dedup → deterministic 60/20/20 train/val/holdout split.** Deterministic given a seed.

### 4.2 EvolveSchema — Stage 1 (`evolve-schema.ts`)
Evolves output **structure**. Three per-generation phases: **A Structure Discovery** (add/remove/replace fields — biggest-impact mutation class), **B Field-Order Probes** (e.g. move `reasoning` before `answer`), **C Failure-Driven Refinement** (edit descriptions / tighten constraints from worst-example feedback). 8 typed mutations: `add_output_field`, `remove_field`, `edit_field_desc`, `change_field_type`, `add_constraint`, `remove_constraint`, `reorder_fields`, `replace_output_fields`. 2-D Pareto selection on **(accuracy ↑, complexity ↓)**. Defaults: population 5, generations 3, evalSize 32, anchorEvalSize 100, seed 1.

### 4.3 IterativeGEPA — Stage 2 (`iterative-optimizer.ts`)
Freezes the winning schema; evolves the **instruction prompt** via multi-generation population search with reflective mutations driven by judge feedback ("ASI"). Per generation: micro-screen (default 50) → mini-eval (default 64) → mutate top Pareto candidate. Anchor eval default 400. 3-D Pareto on **(correctness, procedureFollowing, conciseness)**. 7 strategies cycle: `expand-edge-cases`, `tighten-format`, `add-examples`, `clarify-constraints`, `reduce-length`, `restructure-steps`, `targeted-feedback`. **Safety guard:** GEPA throws unless passed a `makeRunningJudge`-wrapped judge (or `allowBareJudge: true` for tests) — a bare judge would optimize prompt-text-vs-expected similarity (a meaningless gradient).

### 4.4 ComposeEvolution (`compose-evolution.ts`)
Runs Stage 1 then Stage 2. **Feedback separation** is the critical design detail: Stage 2's judge is wrapped by `filterJudgeFeedback` so **structural** complaints (e.g. "missing reasoning field") are stripped, leaving only value-level signals — otherwise GEPA would mutate the instruction to undo the schema Stage 1 just evolved. Numeric scores are preserved; only the textual `feedback` is filtered (`defaultFeedbackFilter`).

### 4.5 LLMJudge (`judge.ts`)
Rubric scorer. Weights: **correctness 0.5, procedureFollowing 0.3, conciseness 0.2** (must sum to 1.0), each 0–10 then normalized, multiplied by a length penalty (default target 2000 chars, tolerance 0.5, floor 0.5). Produces `JudgeScore { overall, weighted, correctness, procedureFollowing, conciseness, lengthPenalty, feedback, parsed }`. The `feedback` string is the input that drives GEPA's reflective mutations.

### 4.6 Evolution Gates (`evolution-gates.ts`)
A candidate must pass **all** gates; first failure short-circuits to `fail`. Gate categories and the structured `GateResult { gate, verdict: 'pass'|'fail', reason, detail? }` the UI renders:

| Gate `gate` | Checks |
|---|---|
| `non-empty` | Candidate not blank. |
| `size` | Hard char cap by target: persona ≤ 3000, tool-description ≤ 500, skill-body ≤ 15000, behavioral-spec-section ≤ 4000, generic ≤ 8000. |
| `growth` | ≤ +20% over baseline length (default `maxGrowthRatio` 0.2). |
| `balanced-fences` | Even number of ``` ``` ``` markdown fences. |
| `no-placeholders` | Rejects `[PLACEHOLDER]`, `<placeholder>`, `{{var}}`. |
| `no-todos` | Rejects leftover `TODO:` / `FIXME:` / `XXX:` line labels. |
| `regression` | Candidate score must not drop below `maxRegression` (default −0.02). Only runs when scores provided. |

When the overall verdict is `fail`, the orchestrator **creates the run then immediately rejects it** (outcome `skipped-gates`) so dangerous candidates never appear in the review queue but stay in history.

### 4.7 Evolution LLM Wiring (`evolution-llm-wiring.ts`)
Binds real LLMs (default **Claude 4.5 Haiku** via `@ax-llm/ax`, dynamic-imported) into the model-agnostic primitives: `buildJudgeLLMCall`, `buildGEPAMutateFn`, `buildSchemaExecuteFn`, `makeRunningJudge`. Includes exponential-backoff retry (5s → 15s → 45s → 135s → 150s, 6 attempts) over retryable HTTP statuses/codes. The `RUNNING_JUDGE_BRAND` symbol marks judges that execute the candidate prompt against a real LLM before scoring.

---

## 5. Triggering: manual vs autonomous

| Mode | Trigger | Where |
|---|---|---|
| **Manual** | User clicks "New Run" → `POST /api/evolution/run` (SSE). | `EvolutionTab.tsx` New-Run modal. |
| **Autonomous** | Background daemon `EvolutionService` ticks (default every 6h), picks one eligible target whose new-trace count ≥ `minTracesPerTarget` (default 20), runs `runOnce`, produces a `proposed` run. | `evolution-service.ts`, wired in `index.ts`. |

The autonomous daemon is **disabled by default** — opt-in via env `WAGGLE_EVOLUTION_AUTO_ENABLED=1` (also `WAGGLE_EVOLUTION_TICK_INTERVAL_MS`, `WAGGLE_EVOLUTION_MIN_TRACES`). It **never auto-deploys**; accept/reject is always manual. Default targets = every registered persona + every behavioral-spec section.

---

## 6. Deploy mechanics (what "Accept & Deploy" does server-side)

From `evolution-deploy.ts` + the `deployFromRun` dispatcher in the route:

- **`persona-system-prompt`** → `deployPersonaOverride(dataDir, …)` writes `{dataDir}/personas/{id}.json` (shadows the built-in persona via `loadCustomPersonas`). Emits `persona:reloaded`.
- **`behavioral-spec-section`** → `deployBehavioralSpecOverride(dataDir, …)` writes `{dataDir}/behavioral-overrides/{section}.json` (merged into `BEHAVIORAL_SPEC` at load). Emits `behavioral-spec:reloaded`.
- **`tool-description` / `skill-body` / `generic`** → **not yet implemented**; the deploy throws, so accepting such a run lands it in status `failed`.

Every writer is **atomic** (write `.tmp` then rename) and **backs up** the previous version to `{file}.bak`, enabling `rollbackPersonaOverride` / `rollbackBehavioralSpecOverride`. The five behavioral-spec sections are exactly: `coreLoop`, `qualityRules`, `behavioralRules`, `workPatterns`, `intelligenceDefaults`.

---

## 7. Loop diagram (full)

```mermaid
flowchart TD
    subgraph capture["Trace capture (every turn)"]
        AL[Agent loop / chat route] -->|onToolUse / onToolResult| TR[TraceRecorder]
        TR --> ETS[(execution_traces)]
    end

    subgraph trigger["Trigger"]
        UI[Evolution tab: New Run] -->|POST /api/evolution/run| ORC
        SVC[EvolutionService daemon\nWAGGLE_EVOLUTION_AUTO_ENABLED] -->|tick → runOnce| ORC
    end

    ORC[EvolutionOrchestrator.runOnce]
    ETS --> EDB[EvalDatasetBuilder\nmine traces → EvalExample]
    EDB --> CMP

    subgraph compose["ComposeEvolution"]
        CMP[ComposeEvolution] --> ES[Stage 1: EvolveSchema\n2D Pareto accuracy/complexity]
        ES -->|frozen winner schema| GEPA[Stage 2: IterativeGEPA\n3D Pareto + reflective mutate]
        JUDGE[LLMJudge\ncorrectness/procedure/conciseness] -.scores.-> ES
        JUDGE -.filtered feedback.-> GEPA
        LLM[Haiku via @ax-llm/ax\nmakeRunningJudge / mutate / execute] -.-> JUDGE
    end

    ORC --> CMP
    GEPA -->|winner_text + delta| GATES[runGates\nsize/growth/structural/regression]
    GATES -->|pass| STORE[(evolution_runs)\nstatus = proposed]
    GATES -->|fail| STOREF[(evolution_runs)\ncreate then auto-reject]

    STORE -->|GET /runs, /status| REVIEW[Evolution tab review]
    REVIEW -->|POST /accept| DEPLOY[deployFromRun\npersona/spec override file]
    REVIEW -->|POST /reject| REJECTED[status = rejected]
    DEPLOY -->|success| DEPLOYED[status = deployed\n+ emit *:reloaded event]
    DEPLOY -->|throws| FAILED[status = failed]
    DEPLOYED -.hot-reload.-> AL
```
