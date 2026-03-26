import {
  type MindDB,
  type Importance,
  IdentityLayer,
  AwarenessLayer,
  FrameStore,
  SessionStore,
  HybridSearch,
  KnowledgeGraph,
  ImprovementSignalStore,
  type Embedder,
} from '@waggle/core';
import { createMindTools, type ToolDefinition } from './tools.js';
import { buildSelfAwareness, type AgentCapabilities } from './self-awareness.js';
import { buildAwarenessSummary, markSummarySurfaced } from './improvement-detector.js';
import { CognifyPipeline } from './cognify.js';

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

  /** Workspace-specific layers (null when no workspace is active) */
  private workspaceLayers: WorkspaceLayers | null = null;

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
      db: config.db,
      embedder: config.embedder,
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
    const frames = new FrameStore(workspaceDb);
    const sessions = new SessionStore(workspaceDb);
    const search = new HybridSearch(workspaceDb, this.embedder);
    const knowledge = new KnowledgeGraph(workspaceDb);
    const cognify = new CognifyPipeline({
      db: workspaceDb,
      embedder: this.embedder,
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

  /** Whether a workspace mind is currently active */
  hasWorkspaceMind(): boolean {
    return this.workspaceLayers !== null;
  }

  getMemoryStats(): { frameCount: number; sessionCount: number; entityCount: number } {
    const raw = this.db.getDatabase();
    const frameCount = (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt;
    const sessionCount = (raw.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;
    const entityCount = (raw.prepare('SELECT COUNT(*) as cnt FROM knowledge_entities').get() as { cnt: number }).cnt;

    // Add workspace stats if available
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
   * Load recent context from memory for session preloading.
   * Loads from workspace mind when available, falls back to personal.
   */
  loadRecentContext(limit = 5): string {
    // Use workspace mind for recent context when available (it's more relevant)
    const primaryDb = this.workspaceLayers?.db ?? this.db;
    const raw = primaryDb.getDatabase();

    // Recent memories — prioritize by importance, then recency (A3 fix)
    const recentFrames = raw.prepare(
      `SELECT content, frame_type, importance, created_at
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
    ).all(limit) as Array<{ content: string; frame_type: string; importance: string; created_at: string }>;

    // Active tasks (from personal awareness — always available)
    const awarenessCtx = this.awareness.toContext();

    // Top knowledge entities (from workspace if available)
    const topEntities = raw.prepare(
      `SELECT ke.name, ke.entity_type, COUNT(kr.id) as rel_count
       FROM knowledge_entities ke
       LEFT JOIN knowledge_relations kr ON kr.source_id = ke.id OR kr.target_id = ke.id
       GROUP BY ke.id ORDER BY rel_count DESC LIMIT 10`
    ).all() as Array<{ name: string; entity_type: string; rel_count: number }>;

    const parts: string[] = [];

    if (recentFrames.length > 0) {
      const source = this.workspaceLayers ? 'Workspace' : 'Personal';
      parts.push(`## Recent ${source} Memory`);
      for (const f of recentFrames) {
        parts.push(`- [${f.importance}] ${f.content.slice(0, 200)}`);
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
    if (this.workspaceLayers) {
      const personalRaw = this.db.getDatabase();
      const personalPrefs = personalRaw.prepare(
        `SELECT content FROM memory_frames
         WHERE importance != 'deprecated'
           AND (content LIKE 'User preference:%' OR content LIKE 'Correction from user:%'
                OR content LIKE 'Style note:%' OR content LIKE 'Workspace topic:%')
         ORDER BY id DESC LIMIT 5`
      ).all() as Array<{ content: string }>;
      if (personalPrefs.length > 0) {
        parts.push('\n## Personal Preferences (across all workspaces)');
        for (const p of personalPrefs) {
          parts.push(`- ${p.content.slice(0, 200)}`);
        }
      }
    }

    return parts.join('\n');
  }

  buildSystemPrompt(): string {
    const parts: string[] = [];

    // ── IDENTITY (always personal) ──
    if (this.identity.exists()) {
      parts.push('# Identity\n' + this.identity.toContext());
    }

    // ── SELF-AWARENESS (runtime context) ──
    const awareness = buildAwarenessSummary(this.improvementSignals);
    // Mark signals as surfaced so they won't repeat (per correction #6)
    if (awareness.totalActionable > 0) {
      markSummarySurfaced(this.improvementSignals, awareness);
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
    parts.push(buildSelfAwareness(caps));

    // ── PRELOADED CONTEXT ──
    const recentContext = this.loadRecentContext();
    if (recentContext) {
      parts.push('# Context From Your Memory\nThis was automatically loaded — you already know this:\n' + recentContext);
    }

    return parts.join('\n\n');
  }

  /**
   * Automatic memory recall: search for memories relevant to the user's query.
   * Searches BOTH personal and workspace minds when workspace is active.
   * Returns formatted recall text with source attribution.
   */
  async recallMemory(query: string, limit = 10): Promise<{ text: string; count: number; recalled?: string[] }> {
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
        // For catch-up queries: fetch important frames by importance + recency, not semantic search
        const wsRaw = this.workspaceLayers.db.getDatabase();
        const importantFrames = wsRaw.prepare(
          `SELECT content, frame_type, importance, created_at
           FROM memory_frames
           WHERE importance IN ('critical', 'important')
              OR content LIKE 'Decision%'
              OR content LIKE '%decided%'
           ORDER BY
             CASE importance WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
             id DESC
           LIMIT ?`
        ).all(limit) as Array<{ content: string; frame_type: string; importance: string; created_at: string }>;

        // Also get the most recent frames for recency context
        const recentFrames = wsRaw.prepare(
          `SELECT content, frame_type, importance, created_at
           FROM memory_frames
           WHERE importance != 'deprecated' AND importance != 'temporary'
           ORDER BY id DESC LIMIT ?`
        ).all(Math.min(limit, 3)) as Array<{ content: string; frame_type: string; importance: string; created_at: string }>;

        // Combine and deduplicate
        const seen = new Set<string>();
        const combined: typeof importantFrames = [];
        for (const f of [...importantFrames, ...recentFrames]) {
          const key = f.content.slice(0, 100);
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(f);
          }
        }

        workspaceResults = combined.slice(0, limit).map(f => ({
          score: 1,
          frame: { content: f.content, importance: f.importance, created_at: f.created_at },
        }));
        personalResults = await this.search.search(query, { limit: 2, profile: 'balanced' });
      } else {
        // Normal semantic search for specific queries
        personalResults = await this.search.search(query, { limit, profile: 'balanced' });
        workspaceResults = this.workspaceLayers
          ? await this.workspaceLayers.search.search(query, { limit, profile: 'balanced' })
          : [];
      }

      const allLines: string[] = [];

      if (workspaceResults.length > 0) {
        allLines.push('## Workspace Memory');
        for (const r of workspaceResults) {
          const date = r.frame.created_at?.slice(0, 10) ?? 'unknown';
          allLines.push(`- [${date}, ${r.frame.importance}] ${r.frame.content.slice(0, 300)}`);
        }
      }

      if (personalResults.length > 0) {
        allLines.push('## Personal Memory');
        if (this.workspaceLayers) {
          allLines.push('_(Cross-workspace personal knowledge — not specific to this workspace)_');
        }
        for (const r of personalResults) {
          const date = r.frame.created_at?.slice(0, 10) ?? 'unknown';
          allLines.push(`- [${date}, ${r.frame.importance}] ${r.frame.content.slice(0, 300)}`);
        }
      }

      const totalCount = personalResults.length + workspaceResults.length;
      if (totalCount === 0) return { text: '', count: 0, recalled: [] };

      // Collect content snippets for UI display (B5 fix)
      const recalled: string[] = [];
      for (const r of [...workspaceResults, ...personalResults]) {
        recalled.push(r.frame.content.slice(0, 120));
      }

      const text = '# Recalled Memories\n'
        + 'These memories were automatically retrieved for the user\'s current message.\n'
        + 'IMPORTANT: Use these to ground your response. Cite them naturally: "From our previous discussion...", "You mentioned that...", "Based on your workspace context..."\n'
        + 'Do NOT ignore relevant memories. Do NOT present memory content as your own reasoning — attribute it.\n\n'
        + allLines.join('\n');

      return { text, count: totalCount, recalled };
    } catch {
      return { text: '', count: 0, recalled: [] };
    }
  }

  /**
   * Post-response heuristic write-back.
   * Scans the user message + assistant response for save-worthy signals
   * and auto-saves distilled memories. Returns descriptions of what was saved.
   * Saves to workspace mind when available, personal for preference-type content.
   */
  async autoSaveFromExchange(userMsg: string, assistantMsg: string): Promise<string[]> {
    const saved: string[] = [];
    const userLower = userMsg.toLowerCase();
    const combined = `${userMsg}\n${assistantMsg}`;

    // Target: workspace when available, personal otherwise
    const targetFrames = this.workspaceLayers?.frames ?? this.frames;
    const targetSessions = this.workspaceLayers?.sessions ?? this.sessions;
    const targetCognify = this.workspaceLayers?.cognify ?? null;

    // Helper to save a memory entry
    const save = async (content: string, importance: Importance, target: 'workspace' | 'personal' = 'workspace') => {
      const useWorkspace = target === 'workspace' && this.workspaceLayers;
      const frames = useWorkspace ? this.workspaceLayers!.frames : this.frames;
      const sessions = useWorkspace ? this.workspaceLayers!.sessions : this.sessions;
      const cognify = useWorkspace ? this.workspaceLayers!.cognify : null;

      if (cognify) {
        await cognify.cognify(content, importance);
      } else {
        const active = sessions.getActive();
        let gopId: string;
        if (active.length === 0) {
          gopId = sessions.create().gop_id;
        } else {
          gopId = active[0].gop_id;
        }
        const latestI = frames.getLatestIFrame(gopId);
        if (latestI) {
          frames.createPFrame(gopId, content, latestI.id, importance);
        } else {
          frames.createIFrame(gopId, content, importance);
        }
      }
      saved.push(content.slice(0, 80));
    };

    // Skip trivial exchanges (very short messages)
    if (userMsg.length < 20 && assistantMsg.length < 100) return saved;

    // ── Pattern: User stated a preference (C4: broadened patterns) ──
    const prefPatterns = [
      /\bi (?:prefer|like|want|need|always|never)\b/i,
      /\bcall me\b/i,
      /\bmy (?:name|style|preference)\b/i,
      /\bdon'?t (?:ever|always)\b/i,
      /\bi(?:'d| would) rather\b/i,
      /\bkeep (?:it|things) (?:short|brief|concise|detailed)\b/i,
      /\buse (?:bullet|numbered|markdown|plain)\b/i,
      /\bstop (?:doing|saying|adding)\b/i,
      /\bfrom now on\b/i,
      /\bplease (?:always|never|don'?t)\b/i,
    ];
    for (const pat of prefPatterns) {
      if (pat.test(userMsg)) {
        const sentences = userMsg.split(/[.!?\n]+/).filter(s => pat.test(s));
        if (sentences.length > 0) {
          await save(`User preference: ${sentences[0].trim()}`, 'normal', 'personal');
        }
        break;
      }
    }

    // ── E4: Implicit style detection (infer from behavior, not just explicit statements) ──
    // Only trigger if we haven't already saved a preference this exchange
    if (saved.length === 0 && userMsg.length > 30) {
      // Detect format preferences from how user asks
      const styleSignals: Array<{ pattern: RegExp; note: string }> = [
        { pattern: /\b(?:bullet|bullets|bullet.?points?|list form)\b/i, note: 'Style note: User prefers bullet-point format' },
        { pattern: /\b(?:keep it (?:short|brief)|tl;?dr|tldr|short version|in brief)\b/i, note: 'Style note: User prefers concise responses' },
        { pattern: /\b(?:explain|detail|elaborate|go deeper|more detail|thorough)\b/i, note: 'Style note: User prefers detailed explanations' },
        { pattern: /\b(?:table|tabular|spreadsheet|columns)\b/i, note: 'Style note: User prefers tabular data presentation' },
        { pattern: /\b(?:code first|show me the code|just the code)\b/i, note: 'Style note: User prefers code examples over prose' },
        { pattern: /\b(?:plain english|simple terms|eli5|layman|non.?technical)\b/i, note: 'Style note: User prefers non-technical language' },
      ];

      for (const { pattern, note } of styleSignals) {
        if (pattern.test(userMsg)) {
          // Check if we already have this note in personal mind to avoid duplicates
          const personalRaw = this.db.getDatabase();
          const existing = personalRaw.prepare(
            `SELECT id FROM memory_frames WHERE content = ? LIMIT 1`
          ).get(note) as { id: number } | undefined;
          if (!existing) {
            await save(note, 'normal', 'personal');
          }
          break;
        }
      }
    }

    // ── Pattern: Decision was made (A5: broadened patterns) ──
    const decisionPatterns = [
      /\b(?:let'?s go with|we(?:'ll| will) (?:use|go with|do)|decided to|decision:|agreed to)\b/i,
      /\bthe plan is\b/i,
      /\bok(?:ay)?,?\s+(?:option|choice|approach)\s*(?:[a-z]|\d)/i,
      /\blet'?s (?:proceed|move forward|do that|go ahead)\b/i,
      /\bwe(?:'re| are) going (?:with|to)\b/i,
      /\bfinal(?:ly|ized)?\s+(?:decision|choice|answer)\b/i,
      /\bi(?:'ll| will) go (?:with|ahead)\b/i,
    ];
    const decisionSource = combined;
    for (const pat of decisionPatterns) {
      if (pat.test(decisionSource)) {
        // Extract decision from assistant response first, then user message
        const decisionSentences = assistantMsg.split(/[.!?\n]+/).filter(s => pat.test(s));
        if (decisionSentences.length > 0) {
          // Save up to 300 chars for full decision context (A5: was 200)
          await save(`Decision: ${decisionSentences[0].trim().slice(0, 300)}`, 'important');
        } else {
          const userDecisions = userMsg.split(/[.!?\n]+/).filter(s => pat.test(s));
          if (userDecisions.length > 0) {
            await save(`Decision: ${userDecisions[0].trim().slice(0, 300)}`, 'important');
          }
        }
        break;
      }
    }

    // ── Pattern: User correction ──
    const correctionPatterns = [
      /\b(?:no,? (?:actually|that'?s wrong|it'?s)|wrong|incorrect|not (?:right|correct|true)|you'?re mistaken)\b/i,
    ];
    if (correctionPatterns.some(p => p.test(userMsg))) {
      await save(`Correction from user: ${userMsg.slice(0, 200)}`, 'important', 'personal');
    }

    // ── Pattern: Research output with external sources (B2 fix) ──
    const hasUrls = /https?:\/\/[^\s)]+/.test(assistantMsg);
    const hasStructuredFindings = assistantMsg.length > 600 && (
      (assistantMsg.includes('\n## ') && hasUrls) ||
      (assistantMsg.match(/^\d+\./gm)?.length ?? 0) >= 3
    );
    if (hasStructuredFindings) {
      // Extract key findings: headings + first sentences
      const headings = assistantMsg.match(/^##?\s+.+$/gm)?.slice(0, 3) ?? [];
      const urls = assistantMsg.match(/https?:\/\/[^\s)]+/g)?.slice(0, 3) ?? [];
      const findingSummary = [
        ...headings.map(h => h.replace(/^#+\s+/, '')),
        ...(urls.length > 0 ? [`Sources: ${urls.join(', ')}`] : []),
      ].join('. ');
      if (findingSummary.length > 20) {
        await save(`Research findings: ${findingSummary.slice(0, 400)}`, 'important');
      }
    }

    // ── F29: Structured extraction from substantial work output ──
    // Instead of saving one opaque "Work completed:" blob, extract structured elements.
    if (assistantMsg.length > 200) {
      const lines = assistantMsg.split('\n').filter(l => l.trim().length > 5);
      let savedStructured = false;

      // F29a: Extract inline decisions from assistant response (different patterns than the explicit decision block above)
      const inlineDecisionPatterns = [
        /\b(?:recommended|recommend|suggestion is|best approach|should use|going with)\b/i,
        /\b(?:conclusion|concluded|summary|in summary)\b/i,
      ];
      for (const pat of inlineDecisionPatterns) {
        const decisionLines = lines.filter(l => pat.test(l));
        if (decisionLines.length > 0 && saved.length < 5) {
          const decisionText = decisionLines[0].replace(/^[-*\d.#]+\s*/, '').trim();
          if (decisionText.length > 20) {
            await save(`Recommendation: ${decisionText.slice(0, 300)}`, 'important');
            savedStructured = true;
            break;
          }
        }
      }

      // F29b: Save user's original question/statement as a frame (if substantive)
      if (userMsg.length >= 30 && userMsg.length <= 500 && saved.length < 5) {
        // Only if not already captured by other patterns (preferences, corrections, decisions)
        const alreadyCapturedUser = saved.some(s =>
          s.startsWith('User preference:') || s.startsWith('Correction from user:') || s.startsWith('Decision:')
        );
        if (!alreadyCapturedUser) {
          await save(`User asked: ${userMsg.slice(0, 300)}`, 'temporary');
          savedStructured = true;
        }
      }

      // F29c: Extract key facts from bullet points or numbered lists
      if (assistantMsg.length > 500) {
        const bullets = lines
          .filter(l => l.match(/^[-*]\s/) || l.match(/^\d+\.\s/))
          .map(l => l.replace(/^[-*\d.]+\s+/, '').trim())
          .filter(l => l.length > 15 && l.length < 300);

        if (bullets.length >= 2 && saved.length < 5) {
          // Save top 3 key points as one concise frame
          const keyPoints = bullets.slice(0, 3).join('; ');
          const heading = lines.find(l => l.startsWith('#'))?.replace(/^#+\s+/, '') ?? '';
          const prefix = heading ? `${heading}: ` : 'Key points: ';
          await save(`${prefix}${keyPoints.slice(0, 400)}`, 'normal');
          savedStructured = true;
        }
      }

      // F29d: Fallback — if nothing structured was extracted and response is substantial,
      // save a compact summary (not the full blob)
      if (!savedStructured && assistantMsg.length > 500 && saved.length === 0) {
        const heading = lines.find(l => l.startsWith('#'))?.replace(/^#+\s+/, '') ?? '';
        const firstMeaningful = lines.find(l => !l.startsWith('#') && l.length > 20)?.trim() ?? '';
        const summary = heading
          ? `${heading}${firstMeaningful ? ': ' + firstMeaningful : ''}`
          : firstMeaningful || 'Work output produced';
        await save(`Work completed: ${summary.slice(0, 300)}`, 'normal');
      }
    }

    return saved;
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
