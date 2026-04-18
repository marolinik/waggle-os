/**
 * H-10 G1 — Evolution Service.
 *
 * Autonomy layer for the self-evolution loop. Runs a quiet background daemon
 * that, on each tick:
 *
 *   1. Picks one eligible evolve target (persona or behavioral-spec section)
 *      whose trace count since its last run passes a minimum-dataset gate.
 *   2. Invokes EvolutionOrchestrator.runOnce with Anthropic-backed judge /
 *      mutate / execute adapters — same plumbing as POST /api/evolution/run.
 *   3. Produces a `proposed` EvolutionRun. Accept/reject stays manual via the
 *      existing Memory → Evolution UI; the service never auto-deploys.
 *
 * Why a standalone setInterval rather than CronStore integration: CronStore's
 * job-type enum is a breaking-change surface and the existing cron executor
 * dispatches by enum. A standalone daemon keeps H-10 surgical, testable, and
 * independent — the Memory → Evolution "Run now" button shipped in Phase 8.5
 * still covers manual triggering through the HTTP route.
 *
 * Disabled by default. Opt-in via WAGGLE_EVOLUTION_AUTO_ENABLED=1.
 */

import {
  EvolutionOrchestrator,
  LLMJudge,
  buildJudgeLLMCall,
  buildGEPAMutateFn,
  buildSchemaExecuteFn,
  makeRunningJudge,
  createAnthropicEvolutionLLM,
  listPersonas,
  getPersona,
  BEHAVIORAL_SPEC,
  BEHAVIORAL_SPEC_SECTIONS,
  type BehavioralSpecSection,
  type EvolutionLLM,
  type Schema,
  type EvolutionTarget,
} from '@waggle/agent';
import type {
  ExecutionTraceStore,
  EvolutionRunStore,
  TraceOutcome,
} from '@waggle/core';

// ── Public types ─────────────────────────────────────────────────

export interface EvolutionTargetId {
  kind: EvolutionTarget;
  name: string;
}

export interface EvolutionCandidate extends EvolutionTargetId {
  /** ISO timestamp of the most recent run for this target, or null if never run. */
  lastRunAt: string | null;
  /** Finalized traces recorded since `lastRunAt` (or total when never run). */
  newTraces: number;
}

/** Result of a single tick — a structured report the caller can log. */
export type TickResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      targetKind: EvolutionTarget;
      targetName: string;
      outcome: string;
      runUuid: string | null;
    };

export interface ActiveBehavioralSpecLike {
  [section: string]: unknown;
}

export interface EvolutionServiceDeps {
  traceStore: ExecutionTraceStore;
  runStore: EvolutionRunStore;
  /** Returns the current Anthropic API key or null when none configured. */
  getApiKey: () => string | null;
  /** Active behavioral spec (with deployed overrides applied). */
  getActiveBehavioralSpec: () => ActiveBehavioralSpecLike;
  /** Test hook — defaults to createAnthropicEvolutionLLM. */
  llmFactory?: (apiKey: string) => Promise<EvolutionLLM | null>;
  /**
   * Test hook — by default we build and invoke an EvolutionOrchestrator.
   * Overriding this lets unit tests inject a deterministic runner without
   * spinning up the real LLM plumbing.
   */
  runner?: (target: EvolutionTargetId, baseline: string, apiKey: string) => Promise<TickResult>;
  /** Structured log sink — defaults to no-op. */
  log?: (level: 'info' | 'warn', msg: string) => void;
}

export interface EvolutionServiceConfig {
  /** Milliseconds between tick attempts. Default 6h. Clamped to ≥ 60s. */
  tickIntervalMs?: number;
  /** Minimum finalized traces since a target's last run for it to be eligible. */
  minTracesPerTarget?: number;
  /** Explicit targets list. Defaults to all personas + all spec sections. */
  targets?: EvolutionTargetId[];
  /** Trace outcomes that count toward the dataset gate. */
  eligibleOutcomes?: TraceOutcome[];
}

// ── Service ──────────────────────────────────────────────────────

const MIN_TICK_INTERVAL_MS = 60_000;
const DEFAULT_TICK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const DEFAULT_MIN_TRACES = 20;
const DEFAULT_ELIGIBLE_OUTCOMES: TraceOutcome[] = ['success', 'corrected', 'verified'];

export class EvolutionService {
  private readonly deps: EvolutionServiceDeps;
  private readonly cfg: Required<EvolutionServiceConfig>;
  private timer: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  constructor(deps: EvolutionServiceDeps, cfg: EvolutionServiceConfig = {}) {
    this.deps = deps;
    this.cfg = {
      tickIntervalMs: Math.max(MIN_TICK_INTERVAL_MS, cfg.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS),
      minTracesPerTarget: Math.max(1, cfg.minTracesPerTarget ?? DEFAULT_MIN_TRACES),
      targets: cfg.targets ?? EvolutionService.defaultTargets(),
      eligibleOutcomes: cfg.eligibleOutcomes ?? DEFAULT_ELIGIBLE_OUTCOMES,
    };
  }

  /** Default targets = every registered persona + every behavioral-spec section. */
  static defaultTargets(): EvolutionTargetId[] {
    const personas: EvolutionTargetId[] = listPersonas().map(p => ({
      kind: 'persona-system-prompt',
      name: p.id,
    }));
    const sections: EvolutionTargetId[] = BEHAVIORAL_SPEC_SECTIONS.map(s => ({
      kind: 'behavioral-spec-section',
      name: s,
    }));
    return [...personas, ...sections];
  }

  /** Kick off the daemon. Fires one tick immediately, then on interval. */
  start(): void {
    if (this.timer) return;
    // Run an initial tick on the next event-loop turn so callers can await
    // startup side-effects deterministically.
    setImmediate(() => { void this.tick(); });
    this.timer = setInterval(() => { void this.tick(); }, this.cfg.tickIntervalMs);
    // Don't pin the process alive just for the evolution timer.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  get config(): Readonly<Required<EvolutionServiceConfig>> {
    return this.cfg;
  }

  /**
   * Run one tick. Returns a structured report. Never throws — errors are
   * caught, logged, and surfaced through the return value.
   */
  async tick(): Promise<TickResult> {
    if (this.tickInFlight) {
      return { skipped: true, reason: 'tick already in progress' };
    }
    this.tickInFlight = true;
    try {
      const apiKey = this.deps.getApiKey();
      if (!apiKey) {
        return { skipped: true, reason: 'no Anthropic API key in vault' };
      }

      const target = this.pickNextTarget();
      if (!target) {
        return { skipped: true, reason: 'no target meets the dataset gate' };
      }

      const baseline = this.resolveBaseline(target);
      if (!baseline) {
        return {
          skipped: true,
          reason: `no baseline for ${target.kind}/${target.name}`,
        };
      }

      const runner = this.deps.runner ?? this.defaultRunner.bind(this);
      const result = await runner(target, baseline, apiKey);

      if (!result.skipped) {
        this.deps.log?.(
          'info',
          `evolution tick: ${result.targetKind}/${result.targetName} → ${result.outcome}` +
            (result.runUuid ? ` (run ${result.runUuid})` : ''),
        );
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.deps.log?.('warn', `evolution tick failed: ${msg}`);
      return { skipped: true, reason: `tick failed: ${msg}` };
    } finally {
      this.tickInFlight = false;
    }
  }

  /**
   * Enumerate every configured target with its current dataset-gate status.
   * Exposed for inspection + the "status" UI; `pickNextTarget` consumes the
   * same data to choose a winner.
   */
  enumerateCandidates(): EvolutionCandidate[] {
    return this.cfg.targets.map(t => {
      const lastRun = this.deps.runStore.list({
        targetKind: t.kind,
        targetName: t.name,
        limit: 1,
      })[0];
      const lastRunAt = lastRun?.created_at ?? null;

      const traceFilter: {
        personaId?: string;
        since?: string;
        outcome: TraceOutcome[];
      } = { outcome: this.cfg.eligibleOutcomes };
      if (t.kind === 'persona-system-prompt') {
        traceFilter.personaId = t.name;
      }
      if (lastRunAt) traceFilter.since = lastRunAt;

      const newTraces = this.deps.traceStore.count(traceFilter);
      return { kind: t.kind, name: t.name, lastRunAt, newTraces };
    });
  }

  /**
   * Pick the best eligible target. "Eligible" = newTraces ≥ minTracesPerTarget.
   * "Best" = never-run first, then oldest lastRunAt, then most newTraces as a
   * tiebreaker. Returns null when no target clears the gate.
   */
  pickNextTarget(): EvolutionCandidate | null {
    const eligible = this.enumerateCandidates().filter(
      c => c.newTraces >= this.cfg.minTracesPerTarget,
    );
    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
      // Never-run first
      if (a.lastRunAt === null && b.lastRunAt !== null) return -1;
      if (a.lastRunAt !== null && b.lastRunAt === null) return 1;
      // Oldest last run first
      if (a.lastRunAt !== b.lastRunAt && a.lastRunAt && b.lastRunAt) {
        return a.lastRunAt.localeCompare(b.lastRunAt);
      }
      // Most new traces as tiebreaker
      return b.newTraces - a.newTraces;
    });
    return eligible[0];
  }

  /**
   * Resolve the current baseline text for a target:
   *   - persona-system-prompt: persona.systemPrompt from the live registry.
   *   - behavioral-spec-section: the active spec (with overrides) with a
   *     fallback to compile-time BEHAVIORAL_SPEC.
   */
  resolveBaseline(target: EvolutionTargetId): string | null {
    if (target.kind === 'persona-system-prompt') {
      return getPersona(target.name)?.systemPrompt ?? null;
    }
    if (target.kind === 'behavioral-spec-section') {
      if (!BEHAVIORAL_SPEC_SECTIONS.includes(target.name as BehavioralSpecSection)) {
        return null;
      }
      const active = this.deps.getActiveBehavioralSpec() as Record<string, unknown>;
      const fallback = BEHAVIORAL_SPEC as unknown as Record<string, unknown>;
      const value = active?.[target.name] ?? fallback[target.name];
      return typeof value === 'string' ? value : null;
    }
    // tool-description / skill-body / generic aren't auto-evolvable yet —
    // they would need a baseline source we don't have on disk.
    return null;
  }

  /**
   * Default runner — builds the Anthropic LLM + adapter stack and invokes
   * EvolutionOrchestrator.runOnce. Kept as an instance method so tests can
   * bypass it entirely via `deps.runner`.
   */
  private async defaultRunner(
    target: EvolutionTargetId,
    baseline: string,
    apiKey: string,
  ): Promise<TickResult> {
    const factory = this.deps.llmFactory ?? ((key: string) => createAnthropicEvolutionLLM(key));
    const llm = await factory(apiKey);
    if (!llm) {
      return { skipped: true, reason: '@ax-llm/ax unavailable — evolution LLM not initialized' };
    }

    const baseJudge = new LLMJudge(buildJudgeLLMCall(llm));
    const runningJudge = makeRunningJudge(baseJudge, llm);
    const schemaExecute = buildSchemaExecuteFn(llm);
    const mutate = buildGEPAMutateFn(llm);

    const orchestrator = new EvolutionOrchestrator({
      traceStore: this.deps.traceStore,
      runStore: this.deps.runStore,
      // No deploy — auto-accept is an explicit non-goal. User reviews proposals.
    });

    const result = await orchestrator.runOnce({
      targetKind: target.kind,
      targetName: target.name,
      baseline,
      schemaBaseline: defaultSchemaBaseline(target.kind),
      compose: {
        schema: {
          execute: schemaExecute,
          judge: baseJudge,
          examples: [],
        },
        instructions: {
          judge: runningJudge,
          mutate,
          targetKind: target.kind,
          examples: [],
          concurrency: 4,
        },
      },
    });

    return {
      skipped: false,
      targetKind: target.kind,
      targetName: target.name,
      outcome: result.outcome,
      runUuid: result.run?.run_uuid ?? null,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Sensible default Schema when a target has no structural baseline on disk.
 * Mirrors the default in packages/server/src/local/routes/evolution.ts so the
 * service produces runs with the same shape as the manual route.
 */
function defaultSchemaBaseline(kind: EvolutionTarget): Schema {
  return {
    name: kind.replace(/-/g, '_') + '_baseline',
    version: 1,
    fields: [
      {
        name: 'reasoning',
        type: 'string',
        description: 'short step-by-step justification before the answer',
        required: false,
        constraints: [],
      },
      {
        name: 'answer',
        type: 'string',
        description: 'the assistant\u0027s direct response',
        required: true,
        constraints: [],
      },
    ],
  };
}

/**
 * Read the env flag that gates automatic evolution. Returns true only when
 * the value is an explicit opt-in ("1" / "true"). Anything else — unset,
 * empty, "false", "0" — leaves the daemon dormant.
 */
export function isEvolutionAutoEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = (env.WAGGLE_EVOLUTION_AUTO_ENABLED ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}
