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
} from '@waggle/core';
import { createMindTools, type ToolDefinition } from './tools.js';
import { buildSelfAwareness, type AgentCapabilities } from './self-awareness.js';
import { buildAwarenessSummary, markSummarySurfaced, type AwarenessSummary } from './improvement-detector.js';
import { CognifyPipeline } from './cognify.js';
import { scanForInjection } from './injection-scanner.js';
import { runPatternWriteBack } from './pattern-write-back.js';
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
}

/**
 * Typed context snapshot consumed by PromptAssembler. Keeps the legacy
 * `loadRecentContext()` string-output path untouched for backwards compat.
 *
 * `stateFrames`: I-frames (identity/state snapshots).
 * `recentChanges`: P-frames (deltas) + B-frames (background notes).
 * `activeWork`: structured awareness items (tasks, actions, pending, flags).
 * `keyEntities`: most-connected KG entities (workspace when active).
 * `personalPreferences`: cross-workspace preference/correction frames.
 */
export interface ContextFrames {
  stateFrames: MemoryFrame[];
  recentChanges: MemoryFrame[];
  activeWork: Array<{ category: string; content: string; priority: number }>;
  keyEntities: Array<{ name: string; type: string }>;
  personalPreferences: string[];
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
    // Review #3 revisited: an earlier revision TTL-cached this (5s). Removed because
    // callers and tests write to the underlying tables via ancillary paths (direct
    // KnowledgeGraph.createEntity, FrameStore.createIFrame) that the cache cannot
    // observe. buildSystemPrompt runs once per user turn, not once per LLM iteration,
    // so the "6× COUNT(*)" cost the original finding flagged is paid once per turn —
    // negligible below ~100k frames. If a large-scale user ever proves this matters,
    // the correct fix is a write-counter in MindDB, not a time-based cache.
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
   * M17: shared helper — fetches recent frames ordered by importance then recency.
   * Used by both loadRecentContext and recallMemory's catch-up branch.
   */
  private fetchRecentFrames(
    db: MindDB,
    limit: number,
    opts?: { excludeTemporary?: boolean },
  ): Array<{ id: number; content: string; frame_type: string; importance: string; created_at: string }> {
    const raw = db.getDatabase();
    const excludeTemp = opts?.excludeTemporary ?? false;
    const whereClause = excludeTemp
      ? `WHERE importance != 'deprecated' AND importance != 'temporary'`
      : `WHERE importance != 'deprecated'`;
    return raw.prepare(
      `SELECT id, content, frame_type, importance, created_at
       FROM memory_frames
       ${whereClause}
       ORDER BY
         CASE importance
           WHEN 'critical' THEN 0
           WHEN 'important' THEN 1
           WHEN 'normal' THEN 2
           ELSE 3
         END,
         id DESC
       LIMIT ?`
    ).all(limit) as Array<{ id: number; content: string; frame_type: string; importance: string; created_at: string }>;
  }

  /**
   * Load recent context from memory for session preloading.
   * Loads from workspace mind when available, falls back to personal.
   */
  loadRecentContext(limit = 5): string {
    // Use workspace mind for recent context when available (it's more relevant)
    const primaryDb = this.workspaceLayers?.db ?? this.db;
    const raw = primaryDb.getDatabase();

    // Recent memories — prioritize by importance, then recency (A3 fix)
    const recentFrames = this.fetchRecentFrames(primaryDb, limit);

    // Active tasks (from personal awareness — always available)
    const awarenessCtx = this.awareness.toContext();

    // Top knowledge entities (from workspace if available).
    // Review #4: `OR` in JOIN condition defeats both relation indexes
    // (idx_relations_source, idx_relations_target). UNION ALL over two
    // index-friendly joins keeps both indexes live at 1M+ relations.
    const topEntities = raw.prepare(
      `SELECT ke.name, ke.entity_type, COUNT(rc.entity_id) as rel_count
       FROM knowledge_entities ke
       LEFT JOIN (
         SELECT source_id AS entity_id FROM knowledge_relations
         UNION ALL
         SELECT target_id AS entity_id FROM knowledge_relations
       ) rc ON rc.entity_id = ke.id
       GROUP BY ke.id ORDER BY rel_count DESC LIMIT 10`
    ).all() as Array<{ name: string; entity_type: string; rel_count: number }>;

    const parts: string[] = [];

    if (recentFrames.length > 0) {
      const source = this.workspaceLayers ? 'Workspace' : 'Personal';
      parts.push(`## Recent ${source} Memory`);
      for (const f of recentFrames) {
        parts.push(`- [${f.importance}] ${f.content.slice(0, CONTEXT_PREVIEW_LENGTH)}`);
      }
    }

    if (awarenessCtx !== 'No active awareness items.') {
      parts.push('\n## Active Tasks & State');
      parts.push(awarenessCtx);
    }

    if (topEntities.length > 0) {
      parts.push('\n## Key Knowledge');
      parts.push(topEntities.map(e => `${e.entity_type}: ${e.name}`).join(', '));
    }

    // E4: Always include personal preferences in context (cross-workspace continuity)
    // Query personal mind for preferences regardless of workspace state
    {
      const prefDb = this.db.getDatabase();
      const personalPrefs = prefDb.prepare(
        `SELECT content FROM memory_frames
         WHERE importance != 'deprecated'
           AND (content LIKE 'User preference:%' OR content LIKE 'Correction from user:%'
                OR content LIKE 'Style note:%' OR content LIKE 'Workspace topic:%')
         ORDER BY id DESC LIMIT 5`
      ).all() as Array<{ content: string }>;
      if (personalPrefs.length > 0) {
        const label = this.workspaceLayers
          ? 'Personal Preferences (across all workspaces)'
          : 'Personal Preferences';
        parts.push(`\n## ${label}`);
        for (const p of personalPrefs) {
          parts.push(`- ${p.content.slice(0, CONTEXT_PREVIEW_LENGTH)}`);
        }
      }
    }

    // Review #1: scan preloaded context for injection before it enters the system prompt.
    // Harvested personal preferences and workspace frames can carry poisoned instructions.
    const joined = parts.join('\n');
    const scan = scanForInjection(joined, 'tool_output');
    if (!scan.safe) {
      logger.warn('preloaded context injection detected — dropping', {
        score: scan.score,
        flags: scan.flags,
      });
      return '';
    }
    return joined;
  }

  /**
   * Typed counterpart to `loadRecentContext()`. Returns structured data for
   * the PromptAssembler layer to compose into a model-tier-aware prompt.
   *
   * Sources (workspace when active, personal otherwise for frame queries;
   * personal mind always for preferences):
   * - stateFrames: I-frames (identity/state snapshots)
   * - recentChanges: P-frames + B-frames (deltas, background notes)
   * - activeWork: AwarenessLayer items (structured, not parsed from string)
   * - keyEntities: KG entities ordered by relation count
   * - personalPreferences: preference/correction/style-note frames
   *
   * Pure data — injection scanning is the caller's responsibility (PromptAssembler).
   */
  loadRecentContextFrames(limit = 10): ContextFrames {
    const primaryDb = this.workspaceLayers?.db ?? this.db;
    const raw = primaryDb.getDatabase();

    const frameRows = raw.prepare(
      `SELECT id, frame_type, gop_id, t, base_frame_id, content, importance, source,
              access_count, created_at, last_accessed
       FROM memory_frames
       WHERE importance != 'deprecated'
       ORDER BY
         CASE importance
           WHEN 'critical' THEN 0
           WHEN 'important' THEN 1
           WHEN 'normal' THEN 2
           ELSE 3
         END,
         id DESC
       LIMIT ?`
    ).all(limit) as MemoryFrame[];

    const stateFrames: MemoryFrame[] = [];
    const recentChanges: MemoryFrame[] = [];
    for (const f of frameRows) {
      if (f.frame_type === 'I') stateFrames.push(f);
      else recentChanges.push(f);
    }

    const awarenessItems = this.awareness.getAll();
    const activeWork = awarenessItems.map(item => ({
      category: item.category,
      content: item.content,
      priority: item.priority,
    }));

    const topEntities = raw.prepare(
      `SELECT ke.name, ke.entity_type, COUNT(rc.entity_id) as rel_count
       FROM knowledge_entities ke
       LEFT JOIN (
         SELECT source_id AS entity_id FROM knowledge_relations
         UNION ALL
         SELECT target_id AS entity_id FROM knowledge_relations
       ) rc ON rc.entity_id = ke.id
       GROUP BY ke.id ORDER BY rel_count DESC LIMIT 10`
    ).all() as Array<{ name: string; entity_type: string; rel_count: number }>;

    const keyEntities = topEntities.map(e => ({ name: e.name, type: e.entity_type }));

    const prefDb = this.db.getDatabase();
    const prefRows = prefDb.prepare(
      `SELECT content FROM memory_frames
       WHERE importance != 'deprecated'
         AND (content LIKE 'User preference:%' OR content LIKE 'Correction from user:%'
              OR content LIKE 'Style note:%' OR content LIKE 'Workspace topic:%')
       ORDER BY id DESC LIMIT 5`
    ).all() as Array<{ content: string }>;

    const personalPreferences = prefRows.map(p => p.content);

    return {
      stateFrames,
      recentChanges,
      activeWork,
      keyEntities,
      personalPreferences,
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
    // Review #11: cache key must reflect identity content, not just "exists"/"empty".
    // updated_at alone is not reliable — SQLite datetime('now') has second precision, so
    // rapid successive edits (or fresh-mind tests) share a timestamp. Hash the full row.
    const identitySection = this.cachedSection(
      'identity',
      this.identity.exists() ? JSON.stringify(this.identity.get()) : 'empty',
      () => this.identity.exists() ? '# Identity\n' + this.identity.toContext() : '',
    );

    // ── SELF-AWARENESS (runtime context, changes every call) ──
    const awarenessSection = this.uncachedSection('self_awareness', () => {
      const awareness = buildAwarenessSummary(this.improvementSignals);
      // M8: defer marking until commitSurfacedSignals() — called after model call succeeds
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

    const recalled: RecalledMemory = {
      workspace: workspaceResults.map(r => r.frame),
      personal: personalResults.map(r => r.frame),
      scanSafe,
    };

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

      if (isCatchUp && this.workspaceLayers) {
        // For catch-up queries: fetch important frames by importance + recency, not semantic search.
        // Review #6: dedup by frame id, not content prefix. Two distinct frames sharing a 100-char
        // prefix ("Decision: use Postgres …" vs "Decision: use Postgres (revised): …") previously
        // collapsed and one was dropped. Frame id is the only safe equality key.
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

        // Also get the most recent frames for recency context (M17: shared helper)
        const recentFrames = this.fetchRecentFrames(
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
        // Normal semantic search for specific queries
        personalResults = await this.search.search(query, { limit, profile });
        workspaceResults = this.workspaceLayers
          ? await this.workspaceLayers.search.search(query, { limit, profile })
          : [];
      }

      // R2 sign-gate closure (DEFECT-2): the autoSave `save()` chokepoint
      // coerces self-incapacity / refusal frames to `temporary` so they cannot
      // re-enter the prompt as authoritative recall. That contract was only
      // honored by the `fetchRecentFrames` SQL path (catch-up / recent); the
      // semantic path here (HybridSearch) applies importance as a *score*, not
      // an *exclusion*, so a sign-gated frame still surfaced. Enforce the same
      // `!= 'temporary' AND != 'deprecated'` authoritative-recall rule the SQL
      // path uses (orchestrator.ts:262), uniformly across both stores/branches.
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

      const allLines: string[] = [];

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

      const totalCount = personalResults.length + workspaceResults.length;
      if (totalCount === 0) {
        logTurnEvent(opts?.turnId, { stage: 'orchestrator.recallMemory.exit', totalCount: 0, blocked: false });
        return { text: '', count: 0, recalled: [] };
      }

      // Collect content snippets for UI display (B5 fix)
      const recalled: string[] = [];
      for (const r of [...workspaceResults, ...personalResults]) {
        recalled.push(r.frame.content.slice(0, RECALLED_SNIPPET_LENGTH));
      }

      // Review #1: scan recalled memory for injection before it enters the system prompt.
      // A poisoned harvest frame (ChatGPT export with embedded "ignore previous instructions",
      // malicious shared workspace content, etc.) must not silently flow into model context.
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

      const text = '# Recalled Memories\n'
        + 'These memories were automatically retrieved for the user\'s current message.\n'
        + 'IMPORTANT: Use these to ground your response. Cite them naturally: "From our previous discussion...", "You mentioned that...", "Based on your workspace context..."\n'
        + 'Do NOT ignore relevant memories. Do NOT present memory content as your own reasoning — attribute it.\n\n'
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
      // M5: surface failures visibly — silent empty results cause "I don't remember" hallucinations
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
