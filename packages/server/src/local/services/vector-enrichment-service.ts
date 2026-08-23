import type { EmbeddingProviderInstance, MindDB } from '@waggle/core';
import {
  runVectorBackfill,
  type VectorBackfillOptions,
  type VectorBackfillResult,
} from '../vector-backfill.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_PASSES_PER_MIND = 4;
const DEFAULT_MAX_WORKSPACES_PER_RUN = 20;

export interface VectorEnrichmentServiceDeps {
  personalMind: MindDB;
  embeddingProvider: EmbeddingProviderInstance;
  listWorkspaceIds: () => string[];
  acquireWorkspaceMind: (workspaceId: string) => MindDB;
  releaseWorkspaceMind: (workspaceId: string) => void;
  /** Test seam; production uses runVectorBackfill. */
  runPass?: (
    db: MindDB,
    provider: EmbeddingProviderInstance,
    options?: VectorBackfillOptions,
  ) => Promise<VectorBackfillResult>;
  log?: (level: 'info' | 'warn', message: string) => void;
}

export interface VectorEnrichmentServiceConfig extends VectorBackfillOptions {
  intervalMs?: number;
  maxPassesPerMind?: number;
  maxWorkspacesPerRun?: number;
}

export interface VectorEnrichmentRunResult {
  mindsVisited: number;
  passes: number;
  framesProcessed: number;
  framesReembedded: number;
  chunksCreated: number;
  errors: string[];
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value as number)) : fallback;
}

/**
 * Single-flight background reconciler. One run starts immediately, then every
 * five minutes. Each workspace mind stays cache-pinned across all of its
 * bounded passes, and shutdown waits for the active run before DB teardown.
 */
export class VectorEnrichmentService {
  private readonly deps: VectorEnrichmentServiceDeps;
  private readonly config: Required<VectorEnrichmentServiceConfig>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<VectorEnrichmentRunResult> | null = null;
  private workspaceCursor = 0;
  private stopping = false;

  constructor(deps: VectorEnrichmentServiceDeps, config: VectorEnrichmentServiceConfig = {}) {
    this.deps = deps;
    this.config = {
      intervalMs: positiveInteger(config.intervalMs, DEFAULT_INTERVAL_MS),
      maxPassesPerMind: positiveInteger(config.maxPassesPerMind, DEFAULT_MAX_PASSES_PER_MIND),
      maxWorkspacesPerRun: positiveInteger(config.maxWorkspacesPerRun, DEFAULT_MAX_WORKSPACES_PER_RUN),
      maxFrames: positiveInteger(config.maxFrames, 32),
      batchSize: positiveInteger(config.batchSize, 8),
    };
  }

  start(): void {
    if (this.timer || this.stopping) return;
    void this.runNow();
    this.timer = setInterval(() => { void this.runNow(); }, this.config.intervalMs);
    this.timer.unref?.();
  }

  runNow(): Promise<VectorEnrichmentRunResult> {
    if (this.inFlight) return this.inFlight;
    if (this.stopping) {
      return Promise.resolve({
        mindsVisited: 0,
        passes: 0,
        framesProcessed: 0,
        framesReembedded: 0,
        chunksCreated: 0,
        errors: [],
      });
    }
    const task = this.runOnce();
    this.inFlight = task;
    void task.finally(() => {
      if (this.inFlight === task) this.inFlight = null;
    }).catch(() => undefined);
    return task;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const active = this.inFlight;
    if (active) await active.catch(() => undefined);
  }

  private async runOnce(): Promise<VectorEnrichmentRunResult> {
    const aggregate: VectorEnrichmentRunResult = {
      mindsVisited: 0,
      passes: 0,
      framesProcessed: 0,
      framesReembedded: 0,
      chunksCreated: 0,
      errors: [],
    };

    const personalLast = await this.runMind('personal', this.deps.personalMind, aggregate);
    if (personalLast?.skipped === 'no_real_embedder' || personalLast?.skipped === 'provider_degraded') {
      return aggregate;
    }

    const workspaceIds = [...new Set(this.deps.listWorkspaceIds())];
    if (workspaceIds.length === 0 || this.stopping) return aggregate;
    const selected: string[] = [];
    const count = Math.min(workspaceIds.length, this.config.maxWorkspacesPerRun);
    for (let offset = 0; offset < count; offset += 1) {
      selected.push(workspaceIds[(this.workspaceCursor + offset) % workspaceIds.length]);
    }
    this.workspaceCursor = (this.workspaceCursor + count) % workspaceIds.length;

    for (const workspaceId of selected) {
      if (this.stopping) break;
      let acquired = false;
      try {
        const mind = this.deps.acquireWorkspaceMind(workspaceId);
        acquired = true;
        await this.runMind(`workspace ${workspaceId}`, mind, aggregate);
      } catch (err) {
        const message = `workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`;
        aggregate.errors.push(message);
        this.deps.log?.('warn', `Vector enrichment failed for ${message}`);
      } finally {
        if (acquired) this.deps.releaseWorkspaceMind(workspaceId);
      }
    }
    return aggregate;
  }

  private async runMind(
    label: string,
    mind: MindDB,
    aggregate: VectorEnrichmentRunResult,
  ): Promise<VectorBackfillResult | null> {
    aggregate.mindsVisited += 1;
    let last: VectorBackfillResult | null = null;
    const runPass = this.deps.runPass ?? runVectorBackfill;
    for (let pass = 0; pass < this.config.maxPassesPerMind && !this.stopping; pass += 1) {
      try {
        last = await runPass(mind, this.deps.embeddingProvider, {
          maxFrames: this.config.maxFrames,
          batchSize: this.config.batchSize,
        });
      } catch (err) {
        const message = `${label}: ${err instanceof Error ? err.message : String(err)}`;
        aggregate.errors.push(message);
        this.deps.log?.('warn', `Vector enrichment failed for ${message}`);
        break;
      }
      aggregate.passes += 1;
      aggregate.framesProcessed += last.framesProcessed;
      aggregate.framesReembedded += last.framesReembedded;
      aggregate.chunksCreated += last.chunksCreated;
      if (last.errors.length > 0) {
        const messages = last.errors.map(error => `${label}: ${error}`);
        aggregate.errors.push(...messages);
        this.deps.log?.('warn', `Vector enrichment deferred for ${messages.join('; ')}`);
        break;
      }
      if (last.skipped || !last.hasMore) break;
    }

    if (last && !last.skipped && (last.framesProcessed > 0 || last.vectorsRepaired)) {
      this.deps.log?.(
        'info',
        `Vector enrichment (${label}): frames=${last.framesProcessed} ` +
        `whole=${last.framesReembedded} chunks=${last.chunksCreated}`,
      );
    }
    return last;
  }
}
