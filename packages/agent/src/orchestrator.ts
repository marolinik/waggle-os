import {
  type MindDB,
  type MemoryFrame,
  type ScoringProfile,
  IdentityLayer,
  AwarenessLayer,
  FrameStore,
  SessionStore,
  HybridSearch,
  KnowledgeGraph,
  ImprovementSignalStore,
  createCoreLogger,
  type Embedder,
  TEMPORAL_GUIDANCE,
  renderReferenceDateLine,
  parseDateWindow,
  createInProcessReranker,
  type Reranker,
  MIND_FACT_PREFIX,
  MIND_EVENT_PREFIX,
  MIND_PROFILE_PREFIX,
} from '@waggle/core';
import { createMindTools, type ToolDefinition } from './tools.js';
import { buildSelfAwareness, type AgentCapabilities } from './self-awareness.js';
import { buildAwarenessSummary, markSummarySurfaced, type AwarenessSummary } from './improvement-detector.js';
import { CognifyPipeline } from './cognify.js';
import { scanForInjection } from './injection-scanner.js';
import { runPatternWriteBack } from './pattern-write-back.js';
import {
  fetchRecentFrames,
  loadRecentContext as loadRecentContextImpl,
  loadRecentContextFrames as loadRecentContextFramesImpl,
  type ContextFrames as ContextFramesImpl,
} from './context-loader.js';

// Re-export ContextFrames for back-compat — tests + apps import this type
// from `./orchestrator` per the pre-PR-F surface.
export type ContextFrames = ContextFramesImpl;
// H-AUDIT-1 contract: turnId is a per-turn trace ID (UUID v4) generated at
// chat-route turn entry and propagated EXPLICITLY through every downstream
// stage (agent-loop → orchestrator → retrieval → prompt-assembler → cognify
// → tool-calls). No AsyncLocalStorage, no globals — propagation is
// tsc-verifiable via optional `turnId?: string` params on each entry
// function. See `turn-context.ts` for the generator + logging helpers.
import { logTurnEvent } from './turn-context.js';
import { tierForModel, type ModelTier } from './model-tier.js';
import type { AgentPersona } from './personas.js';
import {
  PromptAssembler,
  type AssembleOptions,
  type AssembledPrompt,
  type RecalledMemory,
} from './prompt-assembler.js';

const logger = createCoreLogger('orchestrator');

// Content-length constants now live in `./content-constants.ts` (single
// source of truth shared with the pattern-write-back extractor). Imports
// below pull only the ones this file still references.
import {
  CONTEXT_PREVIEW_LENGTH,
  RECALL_LINE_LENGTH,
  RECALLED_SNIPPET_LENGTH,
} from './content-constants.js';

export interface OrchestratorConfig {
  db: MindDB;
  embedder: Embedder;
  apiKey?: string;
  model?: string;
  mode?: 'local' | 'team';
  version?: string;
  skills?: string[];
  /**
   * W4.2: optional cross-encoder reranker injected for tests. When absent,
   * a lazy in-process reranker (Xenova/ms-marco-MiniLM-L-6-v2, ~22MB ONNX)
   * is created on first recall IF the WAGGLE_RERANKER=1 flag is set;
   * creation failure soft-fails to RRF-only ordering.
   */
  reranker?: Reranker;
}

/**
 * Options for tier-adaptive recall. When omitted, `recallMemory` behaves
 * byte-identically to its pre-PromptAssembler implementation.
 */
export interface RecallOptions {
  /** ScoringProfile forwarded to HybridSearch. Default: 'balanced'. */
  profile?: ScoringProfile;
  /** Drop results whose finalScore is below this floor. Default: no filter. */
  scoreFloor?: number;
  /** Model tier hint — recorded for downstream consumers (PromptAssembler). */
  tier?: ModelTier;
  /** H-AUDIT-1: per-turn trace ID (UUID v4). Logs memory-recall stage. */
  turnId?: string;
}

/**
 * Workspace-specific layers — created when a workspace mind is activated.
 * Separate from personal mind layers so both can be queried.
 */
interface WorkspaceLayers {
  db: MindDB;
  frames: FrameStore;
  sessions: SessionStore;
  search: HybridSearch;
  knowledge: KnowledgeGraph;
  cognify: CognifyPipeline;
}

export class Orchestrator {
  private db: MindDB;
  private embedder: Embedder;
  private identity: IdentityLayer;
  private awareness: AwarenessLayer;
  private frames: FrameStore;
  private sessions: SessionStore;
  private search: HybridSearch;
  private knowledge: KnowledgeGraph;
  private tools: ToolDefinition[];
  private model: string;
  private mode: 'local' | 'team';
  private version: string;
  private skills: string[];
  private improvementSignals: ImprovementSignalStore;

  /** M8: deferred signal marking — collected during buildSystemPrompt, committed after model call */
  private _pendingSurfacedAwareness: AwarenessSummary | null = null;

  /** Workspace-specific layers (null when no workspace is active) */
  private workspaceLayers: WorkspaceLayers | null = null;
  /** W4.2: memoized reranker promise — resolves undefined on creation failure. */
  private rerankerPromise: Promise<Reranker | undefined> | null = null;

  /** Team sync client — set for team workspaces, null for personal */
  private teamSync: import('@waggle/core').TeamSync | null = null;

  /**
   * Section cache — stores computed values and their inputs.
   * Cached sections are recomputed only when their input changes.
   */
  private _sectionCache = new Map<string, { input: string; output: string }>();

  constructor(config: OrchestratorConfig) {
    this.db = config.db;
    this.embedder = config.embedder;
    this.model = config.model ?? 'unknown';
    this.mode = config.mode ?? 'local';
    this.version = config.version ?? '0.0.0';
    this.skills = config.skills ?? [];
    this.identity = new IdentityLayer(config.db);
    this.awareness = new AwarenessLayer(config.db);
    this.frames = new FrameStore(config.db);
    this.sessions = new SessionStore(config.db);
    this.search = new HybridSearch(config.db, config.embedder);
    if (config.reranker) this.rerankerPromise = Promise.resolve(config.reranker);
    this.knowledge = new KnowledgeGraph(config.db);
    this.improvementSignals = new ImprovementSignalStore(config.db);

    const cognify = new CognifyPipeline({
      frames: this.frames,
      sessions: this.sessions,
      knowledge: this.knowledge,
      search: this.search,
    });

    this.tools = createMindTools({
      db: this.db,
      identity: this.identity,
      awareness: this.awareness,
      frames: this.frames,
      sessions: this.sessions,
      search: this.search,
      knowledge: this.knowledge,
      cognify,
      // Skills 2.0 gap K: write-path contradiction detection emits a
      // correction signal through this store when a new save conflicts
      // with an existing frame.
      improvementSignals: this.improvementSignals,
      // Provide workspace accessors so tools can route to the right mind
      getWorkspaceLayers: () => this.workspaceLayers,
    });
  }

  /**
   * Activate a workspace mind alongside the personal mind.
   * Creates workspace-specific layers for frames, search, knowledge, cognify.
   * Identity always stays in personal mind.
   */
  setWorkspaceMind(workspaceDb: MindDB): void {
    if (this.workspaceLayers) {
      logger.info('switching workspace mind — replacing previous workspace layers');
    }
    const frames = new FrameStore(workspaceDb);
    const sessions = new SessionStore(workspaceDb);
    const search = new HybridSearch(workspaceDb, this.embedder);
    const knowledge = new KnowledgeGraph(workspaceDb);
    const cognify = new CognifyPipeline({
      frames,
      sessions,
      knowledge,
      search,
    });

    this.workspaceLayers = { db: workspaceDb, frames, sessions, search, knowledge, cognify };
  }

  /**
   * Clear the workspace mind (back to personal-only mode).
   */
  clearWorkspaceMind(): void {
    this.workspaceLayers = null;
  }

  /** Set the TeamSync client for push-on-write to team server. */
  setTeamSync(sync: import('@waggle/core').TeamSync | null): void {
    this.teamSync = sync;
  }

  /** Whether a workspace mind is currently active */
  hasWorkspaceMind(): boolean {
    return this.workspaceLayers !== null;
  }

  getMemoryStats(): { frameCount: number; sessionCount: number; entityCount: number } {
    // Intentionally not cached: ancillary write paths (direct
    // KnowledgeGraph.createEntity / FrameStore.createIFrame) would skip
    // cache invalidation. Cost is 6× COUNT(*) per user turn — negligible
    // below ~100k frames. If scale ever bites, fix via a write-counter
    // in MindDB, not a time-based cache.
    const raw = this.db.getDatabase();
    const frameCount = (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
    const sessionCount = (raw.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;
    const entityCount = (raw.prepare('SELECT COUNT(*) as cnt FROM knowledge_entities').get() as { cnt: number }).cnt;

    if (this.workspaceLayers) {
      const wsRaw = this.workspaceLayers.db.getDatabase();
      const wsFrames = (wsRaw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
      const wsSessions = (wsRaw.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;
      const wsEntities = (wsRaw.prepare('SELECT COUNT(*) as cnt FROM knowledge_entities').get() as { cnt: number }).cnt;
      return {
        frameCount: frameCount + wsFrames,
        sessionCount: sessionCount + wsSessions,
        entityCount: entityCount + wsEntities,
      };
    }
    return { frameCount, sessionCount, entityCount };
  }

  /**
   * Load recent context from memory for session preloading. Delegates to
   * `loadRecentContextImpl` — see `./context-loader.ts`.
   */
  loadRecentContext(limit = 5): string {
    return loadRecentContextImpl(this.contextLoaderDeps(), limit);
  }

  /**
   * Typed counterpart for `PromptAssembler`. Delegates to
   * `loadRecentContextFramesImpl` — see `./context-loader.ts`. Pure data;
   * injection scanning is the assembler's responsibility (it has tier
   * context needed to decide drop vs sanitize).
   */
  loadRecentContextFrames(limit = 10): ContextFrames {
    return loadRecentContextFramesImpl(this.contextLoaderDeps(), limit);
  }

  /** Assemble ContextLoaderDeps from this orchestrator's current layers. */
  private contextLoaderDeps() {
    return {
      personalDb: this.db,
      workspaceDb: this.workspaceLayers?.db ?? null,
      awareness: this.awareness,
    };
  }

  /**
   * Return a cached section value if the input hasn't changed.
   * Avoids redundant string construction for stable sections (e.g., identity).
   */
  private cachedSection(name: string, input: string, compute: () => string): string {
    const cached = this._sectionCache.get(name);
    if (cached && cached.input === input) return cached.output;
    const output = compute();
    this._sectionCache.set(name, { input, output });
    return output;
  }

  /**
   * Always recomputes — for sections that depend on runtime state.
   * Structurally consistent with cachedSection for future TTL-based optimization.
   */
  private uncachedSection(_name: string, compute: () => string): string {
    return compute();
  }

  buildSystemPrompt(): string {
    // ── IDENTITY (always personal, stable within a session) ──
    // Cache key must hash the full identity content — updated_at alone
    // has only second precision in SQLite, so rapid successive edits
    // (and fresh-mind tests) collide on the timestamp.
    const identitySection = this.cachedSection(
      'identity',
      this.identity.exists() ? JSON.stringify(this.identity.get()) : 'empty',
      () => this.identity.exists() ? '# Identity\n' + this.identity.toContext() : '',
    );

    // ── SELF-AWARENESS (runtime context, changes every call) ──
    const awarenessSection = this.uncachedSection('self_awareness', () => {
      const awareness = buildAwarenessSummary(this.improvementSignals);
      // Defer marking until commitSurfacedSignals() fires post-model-call.
      if (awareness.totalActionable > 0) {
        this._pendingSurfacedAwareness = awareness;
      }
      const caps: AgentCapabilities = {
        tools: this.tools.map(t => ({ name: t.name, description: t.description })),
        skills: this.skills,
        model: this.model,
        memoryStats: this.getMemoryStats(),
        mode: this.mode,
        version: this.version,
        awareness: awareness.totalActionable > 0 ? awareness : undefined,
      };
      return buildSelfAwareness(caps);
    });

    // ── PRELOADED CONTEXT (per-session memory, changes every call) ──
    const contextSection = this.uncachedSection('recent_context', () => {
      const recentContext = this.loadRecentContext();
      return recentContext
        ? '# Context From Your Memory\nThis was automatically loaded — you already know this:\n' + recentContext
        : '';
    });

    const parts = [identitySection, awarenessSection, contextSection].filter(Boolean);
    return parts.join('\n\n');
  }

  /**
   * PromptAssembler integration — produces a tier-adaptive, typed,
   * scaffolded prompt via the new sixth layer.
   *
   * Consumers: agent-loop.ts when `isEnabled('PROMPT_ASSEMBLER')`.
   * Feature-flagged, default off — callers outside that gate should keep
   * using `buildSystemPrompt()` + `recallMemory()` directly.
   */
  async buildAssembledPrompt(
    query: string,
    persona: AgentPersona | null = null,
    opts: AssembleOptions = {},
  ): Promise<AssembledPrompt> {
    const tier = tierForModel(this.model);
    const corePrompt = this.buildSystemPrompt();
    const context = this.loadRecentContextFrames();

    let recalled: RecalledMemory;
    if (opts.recalledText !== undefined) {
      // W4.5 (plan bug #9-2, double-compute): the caller already ran
      // recallMemory this turn — reuse its rendered multi-lane block instead
      // of re-running the searches. recallMemory scans for injection itself
      // (returns '' on a hit), so scanSafe is true by construction here.
      recalled = {
        workspace: [],
        personal: [],
        scanSafe: true,
        renderedText: opts.recalledText,
      };
    } else {
      // Direct search for raw frames (recallMemory returns formatted text;
      // the assembler consumes MemoryFrame[] and applies its own rendering).
      const personalResults = await this.search.search(query, { limit: 10, profile: 'balanced' });
      const workspaceResults = this.workspaceLayers
        ? await this.workspaceLayers.search.search(query, { limit: 10, profile: 'balanced' })
        : [];

      // Brief §8: run the injection scan here; assembler trusts scanSafe and
      // must not re-scan. On a poisoned hit, frames still flow through but
      // scanSafe=false causes the assembler to ignore the recall section.
      const joinedContent = [
        ...workspaceResults.map(r => r.frame.content),
        ...personalResults.map(r => r.frame.content),
      ].join('\n');
      const scanSafe = joinedContent.length === 0
        ? true
        : scanForInjection(joinedContent, 'tool_output').safe;

      recalled = {
        workspace: workspaceResults.map(r => r.frame),
        personal: personalResults.map(r => r.frame),
        scanSafe,
      };
    }

    return new PromptAssembler().assemble(
      {
        corePrompt,
        persona,
        context,
        recalled,
        query,
        tier,
      },
      opts,
    );
  }

  /**
   * M8: Commit deferred signal markings after model call succeeds.
   * Call this after the LLM response is received. If the model call fails,
   * skip this call — signals stay actionable for the next turn.
   */
  commitSurfacedSignals(): void {
    if (this._pendingSurfacedAwareness) {
      markSummarySurfaced(this.improvementSignals, this._pendingSurfacedAwareness);
      this._pendingSurfacedAwareness = null;
    }
  }

  /**
   * Automatic memory recall: search for memories relevant to the user's query.
   * Searches BOTH personal and workspace minds when workspace is active.
   * Returns formatted recall text with source attribution.
   *
   * `opts` is optional — when omitted, behavior is byte-identical to the
   * pre-PromptAssembler implementation (profile='balanced', no score floor).
   */
  /**
   * W4.2: lazy cross-encoder reranker. Opt-in via WAGGLE_RERANKER=1 (flag-off
   * default until the W4.5 live smoke — first use downloads the ~22MB ONNX
   * model). Creation failure memoizes undefined: recall soft-fails to
   * RRF-only ordering, never throws.
   */
  private getReranker(): Promise<Reranker | undefined> {
    if (this.rerankerPromise) return this.rerankerPromise;
    if (process.env['WAGGLE_RERANKER'] !== '1') {
      this.rerankerPromise = Promise.resolve(undefined);
      return this.rerankerPromise;
    }
    this.rerankerPromise = createInProcessReranker().catch((e: unknown) => {
      logger.warn('reranker unavailable — falling back to RRF ordering', {
        error: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    });
    return this.rerankerPromise;
  }

  async recallMemory(
    query: string,
    limit = 10,
    opts?: RecallOptions,
  ): Promise<{ text: string; count: number; recalled?: string[] }> {
    const profile: ScoringProfile = opts?.profile ?? 'balanced';
    const scoreFloor = opts?.scoreFloor;
    logTurnEvent(opts?.turnId, { stage: 'orchestrator.recallMemory.enter', queryChars: query.length, limit, profile });
    try {
      // Detect catch-up intent — these queries need importance-based recall, not literal text matching
      const catchUpPatterns = [
        /\bcatch me up\b/i, /\bwhere (?:are|were) we\b/i, /\bwhat matters\b/i,
        /\bwhat did we decide\b/i, /\bwhere did we leave off\b/i, /\bwhat['']?s the status\b/i,
        /\bwhat should I do\b/i, /\bwhat['']?s next\b/i, /\bsummariz/i, /\bbrief me\b/i,
        /\bget me up to speed\b/i, /\bwhat['']?s going on\b/i, /\bremind me\b/i,
      ];
      const isCatchUp = catchUpPatterns.some(p => p.test(query));

      let personalResults;
      let workspaceResults;
      // W4.1b/W4.3b: parsed explicit-period window — drives since/until in the
      // normal branch AND the "Events during X" render section below.
      let dateWindow: ReturnType<typeof parseDateWindow> = null;

      if (isCatchUp && this.workspaceLayers) {
        // For catch-up queries: fetch important frames by importance + recency, not semantic search.
        // Dedup MUST be by frame id, not content prefix — two frames sharing a 100-char prefix
        // ("Decision: use Postgres" vs "Decision: use Postgres (revised)") otherwise collapse.
        const wsRaw = this.workspaceLayers.db.getDatabase();
        type CatchUpRow = { id: number; content: string; frame_type: string; importance: string; created_at: string };
        const importantFrames = wsRaw.prepare(
          `SELECT id, content, frame_type, importance, created_at
           FROM memory_frames
           WHERE importance IN ('critical', 'important')
              OR content LIKE 'Decision%'
              OR content LIKE '%decided%'
           ORDER BY
             CASE importance WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
             id DESC
           LIMIT ?`
        ).all(limit) as CatchUpRow[];

        // Also get the most recent frames for recency context (shared helper)
        const recentFrames = fetchRecentFrames(
          this.workspaceLayers!.db, Math.min(limit, 3), { excludeTemporary: true },
        ) as CatchUpRow[];

        // Combine and deduplicate by frame id
        const seen = new Set<number>();
        const combined: CatchUpRow[] = [];
        for (const f of [...importantFrames, ...recentFrames]) {
          if (!seen.has(f.id)) {
            seen.add(f.id);
            combined.push(f);
          }
        }

        workspaceResults = combined.slice(0, limit).map(f => ({
          score: 1,
          frame: { content: f.content, importance: f.importance, created_at: f.created_at },
        }));
        personalResults = await this.search.search(query, { limit: 2, profile });
      } else {
        // W4.1b (#3) — deterministic date-window lane: when the query names an
        // explicit period ("in May 2026", "on 13 October 2025", "in 2024"),
        // restrict recall to frames created in that window via the substrate's
        // since/until filter. Graceful degradation: a window that matches
        // nothing falls back to unwindowed search below — the lane must never
        // LOSE recall, only sharpen it.
        dateWindow = parseDateWindow(query);
        const windowOpts = dateWindow
          ? { since: dateWindow.since, until: dateWindow.until }
          : {};

        // W4.2: cross-encoder reranker (soft-fails to undefined → RRF order).
        const reranker = await this.getReranker();

        // Normal semantic search for specific queries
        personalResults = await this.search.search(query, { limit, profile, reranker, ...windowOpts });
        workspaceResults = this.workspaceLayers
          ? await this.workspaceLayers.search.search(query, { limit, profile, reranker, ...windowOpts })
          : [];

        if (dateWindow && personalResults.length === 0 && workspaceResults.length === 0) {
          logTurnEvent(opts?.turnId, { stage: 'orchestrator.recallMemory.dateWindowEmpty', label: dateWindow.label });
          personalResults = await this.search.search(query, { limit, profile, reranker });
          workspaceResults = this.workspaceLayers
            ? await this.workspaceLayers.search.search(query, { limit, profile, reranker })
            : [];
        }

        // W4.1 (#2) — unconditional importance lane (benchmark fetchImportantFrames
        // K=5): critical/important frames reach recall on EVERY query, not only on
        // catch-up regex matches. Active mind only (workspace when set, else
        // personal); rendered BEFORE semantic hits (benchmark order); deduped by
        // frame id so a frame surfaced by both lanes renders once.
        const IMPORTANCE_LANE_K = 5;
        const laneDb = this.workspaceLayers?.db ?? this.db;
        type LaneRow = { id: number; content: string; frame_type: string; importance: string; created_at: string };
        const laneRows = laneDb.getDatabase().prepare(
          `SELECT id, content, frame_type, importance, created_at
           FROM memory_frames
           WHERE importance IN ('critical', 'important')
           ORDER BY
             CASE importance WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
             id DESC
           LIMIT ?`
        ).all(IMPORTANCE_LANE_K) as LaneRow[];
        if (laneRows.length > 0) {
          const laneIds = new Set(laneRows.map(f => f.id));
          const laneResults = laneRows.map(f => ({ score: 1, frame: f }));
          const notInLane = (r: { frame: { id?: number } }): boolean =>
            r.frame.id === undefined || !laneIds.has(r.frame.id);
          if (this.workspaceLayers) {
            workspaceResults = [...laneResults, ...workspaceResults.filter(notInLane)];
          } else {
            personalResults = [...laneResults, ...personalResults.filter(notInLane)];
          }
        }
      }

      // R2 sign-gate: self-incapacity frames are persisted at 'temporary'
      // importance so they don't re-enter the prompt as authoritative recall.
      // HybridSearch treats importance as a SCORE, not an EXCLUSION — apply
      // the SQL path's `!= 'temporary' AND != 'deprecated'` filter here too.
      const isAuthoritativeForRecall = (r: { frame: { importance?: string } }): boolean => {
        const imp = r.frame.importance ?? 'normal';
        return imp !== 'temporary' && imp !== 'deprecated';
      };
      personalResults = personalResults.filter(isAuthoritativeForRecall);
      workspaceResults = workspaceResults.filter(isAuthoritativeForRecall);

      // Apply optional score floor (PromptAssembler opt-in; byte-identical when absent).
      if (scoreFloor !== undefined) {
        const passes = (r: { finalScore?: number; score?: number }): boolean =>
          (r.finalScore ?? r.score ?? 1) >= scoreFloor;
        personalResults = personalResults.filter(passes);
        workspaceResults = workspaceResults.filter(passes);
      }

      // ── W4.3b: extraction-lane fetches (benchmark lanes #5/#6/#8) ──────
      // Prefix-tagged frames written by extract-memory-lanes (cron/harvest).
      // Active mind only; caps keep the rendered block token-bounded:
      // facts most-recent 60, events most-recent 40 (chronological render —
      // the wholesale chronological block is load-bearing; cap, don't rank).
      type LaneFrameRow = { id: number; content: string; importance: string; created_at: string };
      const laneMindDb = (this.workspaceLayers?.db ?? this.db).getDatabase();
      const profileFrames = laneMindDb.prepare(
        `SELECT id, content, importance, created_at FROM memory_frames
         WHERE content LIKE '${MIND_PROFILE_PREFIX} %' ORDER BY id ASC`
      ).all() as LaneFrameRow[];
      const factFrames = (laneMindDb.prepare(
        `SELECT id, content, importance, created_at FROM memory_frames
         WHERE content LIKE '${MIND_FACT_PREFIX}%' ORDER BY id DESC LIMIT 60`
      ).all() as LaneFrameRow[]).reverse();
      const eventFramesAll = laneMindDb.prepare(
        `SELECT id, content, importance, created_at FROM memory_frames
         WHERE content LIKE '${MIND_EVENT_PREFIX}%' ORDER BY created_at ASC, id ASC`
      ).all() as LaneFrameRow[];
      const eventFrames = eventFramesAll.slice(-40);

      // Dedup: lane frames never double-render via the search lanes; profile
      // frames are excluded from snippets UNCONDITIONALLY (benchmark rule).
      const laneFrameIds = new Set<number>([
        ...profileFrames.map(f => f.id),
        ...factFrames.map(f => f.id),
        ...eventFramesAll.map(f => f.id),
      ]);
      const notLaneFrame = (r: { frame: { id?: number; content: string } }): boolean =>
        !(r.frame.id !== undefined && laneFrameIds.has(r.frame.id)) &&
        !r.frame.content.startsWith(MIND_PROFILE_PREFIX);
      personalResults = personalResults.filter(notLaneFrame);
      workspaceResults = workspaceResults.filter(notLaneFrame);

      /** Body of a prefix-tagged lane frame (everything after the header line). */
      const laneBody = (content: string): string => {
        const nl = content.indexOf('\n');
        return nl >= 0 ? content.slice(nl + 1).trim() : content;
      };

      const allLines: string[] = [];

      // Render order is the benchmark's: profiles → facts → events →
      // windowed events → snippets (workspace/personal sections below).
      if (profileFrames.length > 0) {
        allLines.push('## Profiles');
        for (const f of profileFrames) {
          const m = f.content.match(/^\[mind-profile ([^\]]+)\]/);
          const name = m ? m[1] : 'Person';
          allLines.push(`- ${name}: ${laneBody(f.content).slice(0, 1200)}`);
        }
      }
      if (factFrames.length > 0) {
        allLines.push('## Memory Facts');
        for (const f of factFrames) {
          const date = f.created_at?.slice(0, 10);
          const datePrefix = date ? `[${date}] ` : '';
          allLines.push(`- ${datePrefix}${laneBody(f.content).slice(0, RECALL_LINE_LENGTH)}`);
        }
      }
      if (eventFrames.length > 0) {
        allLines.push('## Events (chronological)');
        for (const f of eventFrames) {
          // body already carries its [YYYY-MM-DD] resolved-event-date prefix
          allLines.push(`- ${laneBody(f.content).slice(0, RECALL_LINE_LENGTH)}`);
        }
      }
      // W4.3b: explicit-period queries surface the events INSIDE the window as
      // a dedicated section (uncapped — windows are small) so the model binds
      // to the right event instead of a similar one from another month.
      if (dateWindow) {
        const windowEvents = eventFramesAll.filter(f => {
          const d = String(f.created_at ?? '').slice(0, 10);
          return d >= dateWindow!.since && d <= dateWindow!.until;
        });
        if (windowEvents.length > 0) {
          allLines.push(`## Events during ${dateWindow.label}`);
          for (const f of windowEvents) {
            allLines.push(`- ${laneBody(f.content).slice(0, RECALL_LINE_LENGTH)}`);
          }
        }
      }

      if (workspaceResults.length > 0) {
        allLines.push('## Workspace Memory');
        for (const r of workspaceResults) {
          const date = r.frame.created_at?.slice(0, 10) ?? 'unknown';
          allLines.push(`- [${date}, ${r.frame.importance}] ${r.frame.content.slice(0, RECALL_LINE_LENGTH)}`);
        }
      }

      if (personalResults.length > 0) {
        allLines.push('## Personal Memory');
        if (this.workspaceLayers) {
          allLines.push('_(Cross-workspace personal knowledge — not specific to this workspace)_');
        }
        for (const r of personalResults) {
          const date = r.frame.created_at?.slice(0, 10) ?? 'unknown';
          allLines.push(`- [${date}, ${r.frame.importance}] ${r.frame.content.slice(0, RECALL_LINE_LENGTH)}`);
        }
      }

      const laneCount = profileFrames.length + factFrames.length + eventFrames.length;
      const totalCount = personalResults.length + workspaceResults.length + laneCount;
      if (totalCount === 0) {
        logTurnEvent(opts?.turnId, { stage: 'orchestrator.recallMemory.exit', totalCount: 0, blocked: false });
        return { text: '', count: 0, recalled: [] };
      }

      // Collect content snippets for UI display (B5 fix)
      const recalled: string[] = [];
      for (const r of [...workspaceResults, ...personalResults]) {
        recalled.push(r.frame.content.slice(0, RECALLED_SNIPPET_LENGTH));
      }
      for (const f of [...profileFrames, ...factFrames, ...eventFrames]) {
        recalled.push(f.content.slice(0, RECALLED_SNIPPET_LENGTH));
      }

      // Scan recalled memory for injection — a poisoned harvest frame
      // (e.g. ChatGPT export with embedded "ignore previous instructions")
      // must never silently flow into model context.
      const joinedLines = allLines.join('\n');
      const scan = scanForInjection(joinedLines, 'tool_output');
      if (!scan.safe) {
        logger.warn('recalled-memory injection detected — blocking recall', {
          score: scan.score,
          flags: scan.flags,
          count: totalCount,
        });
        logTurnEvent(opts?.turnId, { stage: 'orchestrator.recallMemory.exit', totalCount, blocked: true, injectionScore: scan.score });
        return { text: '', count: 0, recalled: [] };
      }

      // W4.1 (#1): anchor = max created_at across all rendered frames.
      const anchorLine = renderReferenceDateLine([
        ...[...workspaceResults, ...personalResults].map(r => r.frame.created_at),
        ...[...profileFrames, ...factFrames, ...eventFrames].map(f => f.created_at),
      ]);

      const text = '# Recalled Memories\n'
        + "These are facts saved in this WORKSPACE'S memory, retrieved for the user's current message. "
        + 'They may come from earlier sessions, other sessions, or imported sources — NOT necessarily from this conversation.\n'
        + 'IMPORTANT — ground your response in them, but attribute provenance HONESTLY:\n'
        + '- Attribute saved / earlier-session memory EXPLICITLY as memory: "your saved memory shows…", "in an earlier session you noted…", "from your workspace notes…". Never imply an ongoing relationship — do NOT say "welcome back", "you\'re back in context", "as we\'ve been discussing", or "from our last session", even when the recalled memory is real and cross-session. Reserve "you just said" / "as you mentioned" strictly for things said earlier in THIS same conversation.\n'
        + '- On the user\'s first message, do NOT claim continuity ("welcome back", "as we discussed", "you\'re back in context") — you have no prior turn with them yet.\n'
        + '- State ONLY what the memories below actually say. Do NOT add specifics — runway figures, headcounts, dollar amounts, dates, percentages, entity COUNTS, or competitor names — unless they appear verbatim in the memories. A detail that feels plausible but is not written below is CONFABULATION: ask instead of asserting. (Observed failures to avoid: stating "4 months runway" or "227 entities tracked" when neither appears in the memories.)\n'
        + '- Do NOT ignore relevant memories. Do NOT present memory content as your own reasoning — attribute it.\n'
        // W4.1 (#1): temporal guidance rides with the recalled block (NOT the
        // global system prompt) + a reference-date anchor so the model has a
        // concrete "now" to resolve relative time against. Both derive from
        // static text / frame dates — no injection surface beyond joinedLines
        // (already scanned above).
        + TEMPORAL_GUIDANCE + '\n\n'
        + (anchorLine ? anchorLine + '\n' : '')
        + joinedLines;

      logTurnEvent(opts?.turnId, {
        stage: 'orchestrator.recallMemory.exit',
        totalCount,
        workspaceHits: workspaceResults.length,
        personalHits: personalResults.length,
        textChars: text.length,
      });
      return { text, count: totalCount, recalled };
    } catch (err) {
      // Surface failures visibly — silent empty results train the model
      // to confabulate "I don't remember" instead of recalling real memory.
      logger.error('recallMemory failed', err);
      return {
        text: '[Memory recall temporarily unavailable. Proceed without prior context.]',
        count: 0,
        recalled: [],
      };
    }
  }

  /**
   * Post-response heuristic write-back. Delegates to `runPatternWriteBack` —
   * the regex pattern set + extractor logic live in `./pattern-write-back.ts`.
   * Routes preferences/corrections/style to personal mind; decisions and
   * work-output to workspace (or personal when no workspace is active).
   */
  async autoSaveFromExchange(userMsg: string, assistantMsg: string): Promise<string[]> {
    return runPatternWriteBack(
      {
        personal: { db: this.db, frames: this.frames, sessions: this.sessions },
        workspace: this.workspaceLayers
          ? {
              frames: this.workspaceLayers.frames,
              sessions: this.workspaceLayers.sessions,
              cognify: this.workspaceLayers.cognify,
            }
          : null,
        teamSync: this.teamSync,
      },
      userMsg,
      assistantMsg,
    );
  }

  getTools(): ToolDefinition[] {
    return this.tools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.find(t => t.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args);
  }

  getIdentity(): IdentityLayer { return this.identity; }
  getAwareness(): AwarenessLayer { return this.awareness; }
  getFrames(): FrameStore { return this.frames; }
  getSessions(): SessionStore { return this.sessions; }
  getSearch(): HybridSearch { return this.search; }
  getKnowledge(): KnowledgeGraph { return this.knowledge; }
  getImprovementSignals(): ImprovementSignalStore { return this.improvementSignals; }
}
