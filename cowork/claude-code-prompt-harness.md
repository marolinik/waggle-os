# Claude Code Prompt: Add State-Machine Workflow Harnesses to Waggle OS

> Paste this into Claude Code when working in the waggle-os repo.

---

## Context

Waggle OS has a workflow system that currently works like this:
- `packages/agent/src/task-shape.ts` — heuristic classifier detects 6 task shapes (research, compare, draft, review, decide, plan-execute, mixed) with confidence + complexity
- `packages/agent/src/workflow-composer.ts` — picks one of 4 execution modes (direct, structured_single_agent, skill_guided, subagent_workflow) and generates PlanStep arrays
- `packages/agent/src/subagent-orchestrator.ts` — runs multi-step workflows with dependency ordering, WorkerState tracking, and result aggregation
- `packages/agent/src/workflow-tools.ts` — exposes `compose_workflow` and `orchestrate_workflow` as agent tools
- `packages/agent/src/feature-flags.ts` — has `ADVANCED_WORKFLOWS` and `VERIFIER_AUTO_RUN` flags

**The gap:** The workflow-composer picks a mode and generates steps, but there are NO phase gates, NO checkpoints, NO validation between phases, and NO state tracking. Steps are advisory — the agent can skip them, reorder them, or declare success without verification. For enterprise-grade reliability (the KVARK funnel), we need deterministic harnesses that enforce phase completion before progression.

The Verifier persona already exists in `persona-data.ts` (id: 'verifier', line ~621) with a solid verification protocol and VERDICT output format. But it's never auto-invoked by the workflow system. The feature flag `VERIFIER_AUTO_RUN` exists but nothing reads it.

## Task

Create a **WorkflowHarness** layer that sits between workflow-composer and the agent loop. This is NOT a rewrite — it extends the existing system.

### File 1: `packages/agent/src/workflow-harness.ts` (NEW)

Create a state-machine harness engine with these types and behavior:

```typescript
// === Types ===

export type PhaseStatus = 'pending' | 'active' | 'validating' | 'passed' | 'failed' | 'skipped';

export interface PhaseGate {
  /** Human-readable name of the validation */
  name: string;
  /** Validation function — receives the phase output, returns pass/fail + reason */
  validate: (output: PhaseOutput) => Promise<GateResult>;
}

export interface GateResult {
  passed: boolean;
  reason: string;
  /** Evidence that the gate checked (tool output, file content, etc.) */
  evidence?: string;
}

export interface HarnessPhase {
  /** Phase identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this phase does — injected into agent context */
  instruction: string;
  /** Tools allowed in this phase (null = use persona default) */
  allowedTools?: string[] | null;
  /** Validation gates that must ALL pass before moving to next phase */
  gates: PhaseGate[];
  /** Max retries if gates fail (default 1) */
  maxRetries?: number;
  /** Whether this phase requires human approval before proceeding */
  requiresApproval?: boolean;
  /** Timeout in ms (default 5 minutes) */
  timeoutMs?: number;
}

export interface PhaseOutput {
  phaseId: string;
  /** The agent's output text for this phase */
  content: string;
  /** Tool calls made during this phase */
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  /** Files created or modified */
  artifacts: string[];
  /** Duration in ms */
  durationMs: number;
  /** Tokens consumed */
  tokens: { input: number; output: number };
}

export interface HarnessCheckpoint {
  harnessId: string;
  phaseId: string;
  status: PhaseStatus;
  output?: PhaseOutput;
  gateResults: GateResult[];
  retryCount: number;
  timestamp: number;
}

export interface WorkflowHarness {
  /** Unique ID for this harness definition */
  id: string;
  /** Human-readable name */
  name: string;
  /** When to auto-select this harness (matched against TaskShape + user query) */
  triggerPatterns: RegExp[];
  /** Ordered phases */
  phases: HarnessPhase[];
  /** How to aggregate phase outputs into final result */
  aggregation: 'concatenate' | 'last' | 'synthesize';
  /** Feature flag that must be enabled (optional) */
  featureFlag?: string;
}

export interface HarnessRunState {
  harnessId: string;
  /** Index of current phase */
  currentPhase: number;
  /** Status of each phase */
  phaseStatuses: Map<string, PhaseStatus>;
  /** Checkpoints for each completed phase */
  checkpoints: HarnessCheckpoint[];
  /** Whether the harness completed successfully */
  completed: boolean;
  /** Whether the harness was aborted */
  aborted: boolean;
  /** Abort reason if applicable */
  abortReason?: string;
  /** Total tokens across all phases */
  totalTokens: { input: number; output: number };
  /** Start timestamp */
  startedAt: number;
}
```

**Core behavior of the harness runner:**

1. `createHarnessRun(harness: WorkflowHarness): HarnessRunState` — initializes run state with all phases pending
2. `advancePhase(state: HarnessRunState, output: PhaseOutput): Promise<HarnessRunState>` — validates output against current phase gates, records checkpoint, advances if all gates pass, retries or aborts if they fail
3. `getCurrentPhaseInstruction(state: HarnessRunState, harness: WorkflowHarness): string | null` — returns the instruction for the current active phase (null if completed/aborted)
4. `canRetry(state: HarnessRunState, harness: WorkflowHarness): boolean` — checks if current phase has retries remaining
5. `getRunSummary(state: HarnessRunState, harness: WorkflowHarness): string` — human-readable markdown summary with phase statuses, gate results, and checkpoint evidence

**Important constraints:**
- The harness does NOT run the agent loop itself — it provides state and instructions that the agent loop consumes
- The harness is deterministic — no LLM calls inside the harness engine itself
- Gate validation functions CAN be async (for file-exists checks, test runs, etc.) but should be fast
- Emit events for UI: `harness:phase:start`, `harness:phase:complete`, `harness:phase:fail`, `harness:gate:pass`, `harness:gate:fail`

### File 2: `packages/agent/src/builtin-harnesses.ts` (NEW)

Create 3 built-in harnesses that demonstrate the pattern:

**1. `research-verify` harness:**
- Phase 1: "Gather" — search memory and web, collect sources
  - Gate: at least 2 tool calls to search_memory or web_search (check toolCalls array)
- Phase 2: "Synthesize" — organize findings into structured summary
  - Gate: output contains at least 3 distinct sections or bullet groups
- Phase 3: "Verify" — auto-invoke Verifier persona pattern (check claims against sources)
  - Gate: output contains "VERDICT:" string (the Verifier's mandatory output format)
  - This phase uses the Verifier's system prompt instructions injected into the phase instruction

**2. `code-review-fix` harness:**
- Phase 1: "Understand" — read the code, understand the change
  - Gate: at least 1 read_file tool call
- Phase 2: "Review" — identify issues with severity ratings
  - Gate: output contains structured issue list (look for "Critical", "Warning", or "Info" patterns)
- Phase 3: "Fix" — apply fixes
  - Gate: at least 1 write_file or edit_file tool call
- Phase 4: "Verify" — run tests/typecheck
  - Gate: at least 1 bash tool call containing "test" or "tsc" or "lint"

**3. `document-draft` harness:**
- Phase 1: "Context" — gather requirements and prior context from memory
  - Gate: at least 1 search_memory tool call
- Phase 2: "Draft" — produce the document
  - Gate: output length > 500 chars OR at least 1 write_file/generate_docx tool call
- Phase 3: "Self-review" — re-read and identify gaps, inconsistencies
  - Gate: output identifies at least 1 specific improvement (not just "looks good")

### File 3: Integrate into `workflow-composer.ts` (MODIFY)

Add a new execution mode:

```typescript
export type ExecutionMode =
  | 'direct'
  | 'structured_single_agent'
  | 'skill_guided'
  | 'subagent_workflow'
  | 'harnessed';  // NEW
```

Add to `WorkflowPlan`:
```typescript
/** Harness to use when executionMode is 'harnessed' */
harness?: WorkflowHarness;
```

In `selectExecutionMode()`, add harness selection BEFORE the existing mode logic:
- Import the built-in harnesses
- Check if any harness's triggerPatterns match the task string
- If match found AND `FEATURE_FLAGS.ADVANCED_WORKFLOWS` is true, return 'harnessed'
- The harness match should be checked first but is opt-in via the feature flag

### File 4: Wire Verifier auto-run into the harness (MODIFY feature-flags.ts consumers)

In the harnesses that have a "Verify" phase, check `FEATURE_FLAGS.VERIFIER_AUTO_RUN`:
- If ON: the verify phase is included (default behavior of the harness)
- If OFF: the verify phase is skipped (set status to 'skipped' in the harness run)

This way the existing `VERIFIER_AUTO_RUN` flag actually does something.

### File 5: Add harness tools to `workflow-tools.ts` (MODIFY)

Add a new tool `run_harness` that:
- Accepts a harness ID and task
- Creates a HarnessRunState
- Returns the first phase instruction
- Subsequent calls advance through phases (the agent calls the tool again with phase output)

Also add `list_harnesses` tool that returns available harness IDs with descriptions and trigger patterns.

## Rules

1. Follow CLAUDE.md Section 7 strictly:
   - Re-read files before editing
   - Max 5 files per phase
   - Run `npx tsc --noEmit --project packages/agent/tsconfig.json` after changes — zero errors required
   - Run `npm run test -- --run` — all tests must pass

2. Export everything new from `packages/agent/src/index.ts`

3. Add JSDoc comments on all public functions and types

4. Do NOT modify:
   - `persona-data.ts` (Verifier persona is already good)
   - `subagent-orchestrator.ts` (harness is a parallel system, not a replacement)
   - `task-shape.ts` (classifier stays as-is)

5. The harness engine must be pure TypeScript with zero external dependencies (no new npm packages)

6. Write at least one test file: `packages/agent/tests/workflow-harness.test.ts` covering:
   - Phase progression (happy path)
   - Gate failure + retry
   - Gate failure + abort (max retries exceeded)
   - Skipped verify phase when VERIFIER_AUTO_RUN is off
   - Run summary generation
