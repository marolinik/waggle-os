/**
 * WorkflowHarness — state-machine engine for phased workflow execution.
 *
 * Sits between workflow-composer and the agent loop. Provides deterministic
 * phase gates, checkpoints, validation, and retry logic.
 *
 * The harness does NOT run the agent loop itself — it provides state and
 * instructions that the agent loop consumes. All gate validation is
 * deterministic (no LLM calls inside the engine).
 *
 * Events emitted:
 * - harness:phase:start  { harnessId, phaseId, phaseName }
 * - harness:phase:complete  { harnessId, phaseId, gateResults }
 * - harness:phase:fail  { harnessId, phaseId, gateResults, retryCount }
 * - harness:gate:pass  { harnessId, phaseId, gateName }
 * - harness:gate:fail  { harnessId, phaseId, gateName, reason }
 */

import { EventEmitter } from 'node:events';

// ── Types ───────────────────────────────────────────────────────

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
  /** Evidence that the gate checked */
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
  /** When to auto-select this harness */
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

// ── Harness Engine ──────────────────────────────────────────────

export const harnessEvents = new EventEmitter();

/** Initialize a new harness run with all phases pending. */
export function createHarnessRun(harness: WorkflowHarness): HarnessRunState {
  const phaseStatuses = new Map<string, PhaseStatus>();
  for (const phase of harness.phases) {
    phaseStatuses.set(phase.id, 'pending');
  }

  // Mark first phase as active
  if (harness.phases.length > 0) {
    phaseStatuses.set(harness.phases[0].id, 'active');
    harnessEvents.emit('harness:phase:start', {
      harnessId: harness.id,
      phaseId: harness.phases[0].id,
      phaseName: harness.phases[0].name,
    });
  }

  return {
    harnessId: harness.id,
    currentPhase: 0,
    phaseStatuses,
    checkpoints: [],
    completed: harness.phases.length === 0,
    aborted: false,
    totalTokens: { input: 0, output: 0 },
    startedAt: Date.now(),
  };
}

// ── Event payload types ──────────────────────────────────────────
//
// These shapes are what `harnessEvents.emit(...)` hands to listeners.
// Exporting them lets downstream consumers (like HarnessTraceBridge) type
// their subscribers properly instead of coercing `unknown`.

export interface HarnessPhaseStartEvent {
  harnessId: string;
  phaseId: string;
  phaseName: string;
}

export interface HarnessPhaseCompleteEvent {
  harnessId: string;
  phaseId: string;
  phaseName: string;
  /** The phase's static instruction text — useful as trace input. */
  phaseInstruction: string;
  output: PhaseOutput;
  gateResults: Array<GateResult & { name: string }>;
}

export interface HarnessPhaseFailEvent {
  harnessId: string;
  phaseId: string;
  phaseName: string;
  phaseInstruction: string;
  output: PhaseOutput;
  gateResults: Array<GateResult & { name: string }>;
  retryCount: number;
  aborted?: boolean;
}

export interface HarnessGatePassEvent {
  harnessId: string;
  phaseId: string;
  gateName: string;
}

export interface HarnessGateFailEvent {
  harnessId: string;
  phaseId: string;
  gateName: string;
  reason: string;
}

/**
 * Validate output against current phase gates, record checkpoint,
 * advance if all gates pass, retry or abort if they fail.
 */
export async function advancePhase(
  state: HarnessRunState,
  harness: WorkflowHarness,
  output: PhaseOutput,
): Promise<HarnessRunState> {
  if (state.completed || state.aborted) return state;
  if (state.currentPhase >= harness.phases.length) return state;

  const phase = harness.phases[state.currentPhase];
  const newState = { ...state, phaseStatuses: new Map(state.phaseStatuses) };

  // Update tokens
  newState.totalTokens = {
    input: state.totalTokens.input + output.tokens.input,
    output: state.totalTokens.output + output.tokens.output,
  };

  // Set phase to validating
  newState.phaseStatuses.set(phase.id, 'validating');

  // Run all gates
  const gateResults: GateResult[] = [];
  let allPassed = true;

  for (const gate of phase.gates) {
    try {
      const result = await gate.validate(output);
      gateResults.push(result);

      if (result.passed) {
        harnessEvents.emit('harness:gate:pass', {
          harnessId: harness.id,
          phaseId: phase.id,
          gateName: gate.name,
        });
      } else {
        allPassed = false;
        harnessEvents.emit('harness:gate:fail', {
          harnessId: harness.id,
          phaseId: phase.id,
          gateName: gate.name,
          reason: result.reason,
        });
      }
    } catch (err) {
      const failResult: GateResult = {
        passed: false,
        reason: `Gate error: ${err instanceof Error ? err.message : String(err)}`,
      };
      gateResults.push(failResult);
      allPassed = false;
    }
  }

  // Find existing checkpoint retry count
  const existingCheckpoints = state.checkpoints.filter(c => c.phaseId === phase.id);
  const retryCount = existingCheckpoints.length;

  // Record checkpoint
  const checkpoint: HarnessCheckpoint = {
    harnessId: harness.id,
    phaseId: phase.id,
    status: allPassed ? 'passed' : 'failed',
    output,
    gateResults,
    retryCount,
    timestamp: Date.now(),
  };
  newState.checkpoints = [...state.checkpoints, checkpoint];

  // Attach gate names so consumers don't have to zip back to phase.gates[i].
  const namedGateResults: Array<GateResult & { name: string }> = gateResults.map((r, i) => ({
    ...r,
    name: phase.gates[i]?.name ?? '(anonymous)',
  }));

  if (allPassed) {
    // Phase passed — advance to next
    newState.phaseStatuses.set(phase.id, 'passed');
    const completeEvent: HarnessPhaseCompleteEvent = {
      harnessId: harness.id,
      phaseId: phase.id,
      phaseName: phase.name,
      phaseInstruction: phase.instruction,
      output,
      gateResults: namedGateResults,
    };
    harnessEvents.emit('harness:phase:complete', completeEvent);

    const nextIdx = state.currentPhase + 1;
    if (nextIdx >= harness.phases.length) {
      // All phases complete
      newState.currentPhase = nextIdx;
      newState.completed = true;
    } else {
      // Advance to next phase
      newState.currentPhase = nextIdx;
      const nextPhase = harness.phases[nextIdx];

      // Check if next phase should be skipped
      if (nextPhase.id.includes('verify') && shouldSkipVerify()) {
        newState.phaseStatuses.set(nextPhase.id, 'skipped');
        // Try to advance past skipped phase
        const afterSkip = nextIdx + 1;
        if (afterSkip >= harness.phases.length) {
          newState.currentPhase = afterSkip;
          newState.completed = true;
        } else {
          newState.currentPhase = afterSkip;
          newState.phaseStatuses.set(harness.phases[afterSkip].id, 'active');
          harnessEvents.emit('harness:phase:start', {
            harnessId: harness.id,
            phaseId: harness.phases[afterSkip].id,
            phaseName: harness.phases[afterSkip].name,
          });
        }
      } else {
        newState.phaseStatuses.set(nextPhase.id, 'active');
        harnessEvents.emit('harness:phase:start', {
          harnessId: harness.id,
          phaseId: nextPhase.id,
          phaseName: nextPhase.name,
        });
      }
    }
  } else {
    // Phase failed
    const maxRetries = phase.maxRetries ?? 1;
    if (retryCount < maxRetries) {
      // Retry — keep phase active
      newState.phaseStatuses.set(phase.id, 'active');
      const failEvent: HarnessPhaseFailEvent = {
        harnessId: harness.id,
        phaseId: phase.id,
        phaseName: phase.name,
        phaseInstruction: phase.instruction,
        output,
        gateResults: namedGateResults,
        retryCount: retryCount + 1,
      };
      harnessEvents.emit('harness:phase:fail', failEvent);
    } else {
      // Max retries exceeded — abort
      newState.phaseStatuses.set(phase.id, 'failed');
      newState.aborted = true;
      newState.abortReason = `Phase "${phase.name}" failed after ${retryCount + 1} attempts: ${gateResults.filter(g => !g.passed).map(g => g.reason).join('; ')}`;
      const abortEvent: HarnessPhaseFailEvent = {
        harnessId: harness.id,
        phaseId: phase.id,
        phaseName: phase.name,
        phaseInstruction: phase.instruction,
        output,
        gateResults: namedGateResults,
        retryCount: retryCount + 1,
        aborted: true,
      };
      harnessEvents.emit('harness:phase:fail', abortEvent);
    }
  }

  return newState;
}

/** Get the instruction for the current active phase (null if completed/aborted). */
export function getCurrentPhaseInstruction(
  state: HarnessRunState,
  harness: WorkflowHarness,
): string | null {
  if (state.completed || state.aborted) return null;
  if (state.currentPhase >= harness.phases.length) return null;

  const phase = harness.phases[state.currentPhase];
  const retryCount = state.checkpoints.filter(c => c.phaseId === phase.id).length;

  let instruction = `## Phase ${state.currentPhase + 1}/${harness.phases.length}: ${phase.name}\n\n${phase.instruction}`;

  if (retryCount > 0) {
    const lastCheckpoint = state.checkpoints.filter(c => c.phaseId === phase.id).pop();
    const failedGates = lastCheckpoint?.gateResults.filter(g => !g.passed) ?? [];
    instruction += `\n\n**RETRY (attempt ${retryCount + 1})** — Previous attempt failed:\n`;
    for (const gate of failedGates) {
      instruction += `- ${gate.reason}\n`;
    }
    instruction += '\nPlease address these issues.';
  }

  if (phase.gates.length > 0) {
    instruction += '\n\n**Completion criteria:**\n';
    for (const gate of phase.gates) {
      instruction += `- ${gate.name}\n`;
    }
  }

  return instruction;
}

/** Check if current phase has retries remaining. */
export function canRetry(state: HarnessRunState, harness: WorkflowHarness): boolean {
  if (state.completed || state.aborted) return false;
  if (state.currentPhase >= harness.phases.length) return false;

  const phase = harness.phases[state.currentPhase];
  const retryCount = state.checkpoints.filter(c => c.phaseId === phase.id).length;
  return retryCount < (phase.maxRetries ?? 1);
}

/** Generate a human-readable markdown summary of the harness run. */
export function getRunSummary(state: HarnessRunState, harness: WorkflowHarness): string {
  const lines: string[] = [
    `# Workflow: ${harness.name}`,
    '',
    `**Status:** ${state.completed ? 'Completed' : state.aborted ? 'Aborted' : 'In Progress'}`,
    `**Duration:** ${Date.now() - state.startedAt}ms`,
    `**Tokens:** ${state.totalTokens.input} input / ${state.totalTokens.output} output`,
    '',
    '## Phases',
    '',
    '| # | Phase | Status | Gates | Retries |',
    '|---|-------|--------|-------|---------|',
  ];

  for (let i = 0; i < harness.phases.length; i++) {
    const phase = harness.phases[i];
    const status = state.phaseStatuses.get(phase.id) ?? 'pending';
    const checkpoints = state.checkpoints.filter(c => c.phaseId === phase.id);
    const lastCheckpoint = checkpoints[checkpoints.length - 1];
    const gatesSummary = lastCheckpoint
      ? `${lastCheckpoint.gateResults.filter(g => g.passed).length}/${lastCheckpoint.gateResults.length} passed`
      : '-';
    const statusIcon = status === 'passed' ? 'PASS' : status === 'failed' ? 'FAIL' : status === 'skipped' ? 'SKIP' : status === 'active' ? 'ACTIVE' : status;

    lines.push(`| ${i + 1} | ${phase.name} | ${statusIcon} | ${gatesSummary} | ${checkpoints.length} |`);
  }

  if (state.abortReason) {
    lines.push('', `**Abort reason:** ${state.abortReason}`);
  }

  // Gate details for failed/passed phases
  const detailedCheckpoints = state.checkpoints.filter(c => c.gateResults.length > 0);
  if (detailedCheckpoints.length > 0) {
    lines.push('', '## Gate Details', '');
    for (const cp of detailedCheckpoints) {
      const phase = harness.phases.find(p => p.id === cp.phaseId);
      lines.push(`### ${phase?.name ?? cp.phaseId} (attempt ${cp.retryCount + 1})`);
      for (const gate of cp.gateResults) {
        const icon = gate.passed ? 'PASS' : 'FAIL';
        lines.push(`- **${icon}**: ${gate.reason}`);
        if (gate.evidence) {
          lines.push(`  Evidence: ${gate.evidence}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────

function shouldSkipVerify(): boolean {
  try {
    // Dynamic import to avoid circular dependency
    const env = process.env.WAGGLE_AUTO_VERIFY;
    return env !== 'true' && env !== '1';
  } catch {
    return true; // Skip by default if flag can't be read
  }
}
