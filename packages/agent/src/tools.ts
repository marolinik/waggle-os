import type {
  MindDB,
  IdentityLayer,
  AwarenessLayer,
  FrameStore,
  SessionStore,
  HybridSearch,
  KnowledgeGraph,
  Embedder,
} from '@waggle/core';
import type { CognifyPipeline } from './cognify.js';
import type { CombinedRetrievalResult, CombinedResult } from './combined-retrieval.js';
import type { FeedbackHandler } from './feedback-handler.js';

// ── F16: Text normalization for fuzzy dedup ──────────────────────────────
/** Normalize text for fuzzy dedup: lowercase, collapse whitespace, strip punctuation */
function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')    // strip punctuation
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim();
}

/** Compute cosine similarity between two Float32Arrays */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── F22: Dramatic claims detection ───────────────────────────────────────
const DRAMATIC_CLAIM_PATTERNS: RegExp[] = [
  /\b(shut(?:ting)?\s*down|clos(?:ing|ed)\s+(?:the\s+)?company|going\s+bankrupt|bankrupt(?:cy)?|dissolv(?:ing|ed))\b/i,
  /\b(mass\s+layoff|laid?\s+off\s+everyone|fir(?:ing|ed)\s+(?:all|everyone|the\s+entire))\b/i,
  /\b(lawsuit|legal\s+threat|su(?:ing|ed)\s+(?:us|them|the\s+company)|cease\s+and\s+desist)\b/i,
  /\b(revenue\s*(?:is|=|dropped?\s+to)\s*(?:\$?\s*)?0|lost\s+all\s+(?:our\s+)?funding|funding\s+(?:fell?\s+through|collapsed?))\b/i,
];

/** Detect dramatic claim patterns in content. Returns matched pattern descriptions. */
function detectDramaticClaims(content: string): string[] {
  const labels = ['company_shutdown', 'mass_layoffs', 'legal_threats', 'dramatic_financial'];
  const matches: string[] = [];
  for (let i = 0; i < DRAMATIC_CLAIM_PATTERNS.length; i++) {
    if (DRAMATIC_CLAIM_PATTERNS[i].test(content)) {
      matches.push(labels[i]);
    }
  }
  return matches;
}

// ── F6: Confidence level type ────────────────────────────────────────────
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unverified';

/** Derive default confidence from source provenance */
function deriveConfidence(source: string): ConfidenceLevel {
  switch (source) {
    case 'tool_verified': return 'high';
    case 'user_stated':   return 'medium';
    case 'agent_inferred': return 'low';
    default:              return 'unverified';
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
  /** PM-6: Whether this tool can operate without LLM connectivity (default: false) */
  offlineCapable?: boolean;
}

/** Workspace-specific layers for dual-mind routing */
interface WorkspaceLayers {
  db: MindDB;
  frames: FrameStore;
  sessions: SessionStore;
  search: HybridSearch;
  knowledge: KnowledgeGraph;
  cognify: CognifyPipeline;
}

/** Tracks tool utilization across the current session */
export interface ToolUtilizationTracker {
  /** Record that a tool was used */
  recordUsage(toolName: string): void;
  /** Get the set of unique tools used this session */
  getUsedTools(): Set<string>;
  /** Get the total number of available tools */
  totalAvailable: number;
  /** Get utilization ratio (uniqueUsed / totalAvailable) */
  getUtilization(): number;
}

/** Create a ToolUtilizationTracker instance */
export function createToolUtilizationTracker(totalAvailable: number): ToolUtilizationTracker {
  const usedTools = new Set<string>();
  return {
    recordUsage(toolName: string) {
      usedTools.add(toolName);
    },
    getUsedTools() {
      return new Set(usedTools);
    },
    totalAvailable,
    getUtilization() {
      if (totalAvailable === 0) return 0;
      return usedTools.size / totalAvailable;
    },
  };
}

export interface MindToolDeps {
  db: MindDB;
  identity: IdentityLayer;
  awareness: AwarenessLayer;
  frames: FrameStore;
  sessions: SessionStore;
  search: HybridSearch;
  knowledge: KnowledgeGraph;
  cognify?: CognifyPipeline;
  feedback?: FeedbackHandler;
  /** F16: Optional embedder for semantic dedup (cosine similarity) */
  embedder?: Embedder;
  /** Dynamic accessor for workspace layers — checked at call time */
  getWorkspaceLayers?: () => WorkspaceLayers | null;
  /** W5.7: Accessor for ALL workspace search instances (for cross-workspace search) */
  getAllWorkspaceSearches?: () => Array<{ workspaceId: string; workspaceName: string; search: HybridSearch }>;
  /** Optional tool utilization tracker for session-level stats */
  toolUtilizationTracker?: ToolUtilizationTracker;
}

export function createMindTools(deps: MindToolDeps): ToolDefinition[] {
  // W2.10: Per-session memory save rate limiter (prevents memory flooding attacks)
  const MAX_SAVES_PER_SESSION = 50;
  let saveMemoryCount = 0;

  return [
    {
      name: 'get_identity',
      description: 'Get the agent identity (who am I, what is my role)',
      offlineCapable: true,
      parameters: {},
      execute: async () => {
        if (!deps.identity.exists()) return 'No identity configured yet.';
        return deps.identity.toContext();
      },
    },
    {
      name: 'get_awareness',
      description: 'Get current awareness state (active tasks, recent actions, pending items, flags, tool utilization)',
      offlineCapable: true,
      parameters: {},
      execute: async () => {
        let context = deps.awareness.toContext();

        // Append utilization stats if tracker is available
        if (deps.toolUtilizationTracker) {
          const tracker = deps.toolUtilizationTracker;
          const used = tracker.getUsedTools();
          const utilization = tracker.getUtilization();
          context += `\n\n## Tool Utilization\n`;
          context += `- Unique tools used this session: ${used.size}\n`;
          context += `- Total available tools: ${tracker.totalAvailable}\n`;
          context += `- Utilization: ${(utilization * 100).toFixed(1)}%\n`;
          if (utilization < 0.1) {
            context += `- Note: Low utilization — consider using more of your available tools (skills, workflows, sub-agents) for richer results.\n`;
          }
        }

        return context;
      },
    },
    {
      name: 'search_memory',
      description: 'Search through memory for relevant past experiences and knowledge. Searches both personal and workspace memory when a workspace is active.',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for' },
          profile: {
            type: 'string',
            enum: ['balanced', 'recent', 'important', 'connected'],
            description: 'Scoring profile to use',
          },
          scope: {
            type: 'string',
            enum: ['all', 'personal', 'workspace'],
            description: 'Which mind to search (default: all)',
          },
          limit: { type: 'number', description: 'Max results to return' },
          importance: {
            type: 'string',
            enum: ['critical', 'important', 'normal', 'temporary', 'all'],
            description: 'Filter by importance level (default: all)',
          },
          since: {
            type: 'string',
            description: 'ISO date — only return frames created after this date (e.g., "2026-03-14")',
          },
          until: {
            type: 'string',
            description: 'ISO date — only return frames created before this date (e.g., "2026-03-21")',
          },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const limit = (args.limit as number) ?? 10;
        const scope = (args.scope as string) ?? 'all';
        const query = args.query as string;
        const profile = (args.profile as 'balanced') ?? 'balanced';
        const importanceFilter = (args.importance as string) ?? 'all';
        // F20: Temporal filtering params
        const since = args.since as string | undefined;
        const until = args.until as string | undefined;
        const wsLayers = deps.getWorkspaceLayers?.();

        const sections: string[] = [];

        // F14: Helper to filter results by importance level
        const filterByImportance = <T extends { frame: { importance: string } }>(results: T[]): T[] => {
          if (importanceFilter === 'all') return results;
          return results.filter(r => r.frame.importance === importanceFilter);
        };

        // W2.6: Search workspace mind FIRST (results shown before personal, boosted priority)
        if (wsLayers && (scope === 'all' || scope === 'workspace')) {
          const wsResults = filterByImportance(await wsLayers.search.search(query, { limit, profile, since, until }));
          if (wsResults.length > 0) {
            sections.push('## Workspace Memory');
            sections.push(...wsResults.map((r, i) =>
              `[${i + 1}] (score: ${r.finalScore.toFixed(3)}, type: ${r.frame.frame_type}, importance: ${r.frame.importance}, source: ${(r.frame as any).source ?? 'user_stated'})\n${r.frame.content}`
            ));
          }
        }

        // Search personal mind (shown after workspace results, with reduced limit when workspace is active)
        if (scope === 'all' || scope === 'personal') {
          // W2.6: When inside a workspace, cap personal results to reduce noise
          const personalLimit = (wsLayers && scope === 'all') ? Math.min(limit, 3) : limit;
          const personalResults = filterByImportance(await deps.search.search(query, { limit: personalLimit, profile, since, until }));
          if (personalResults.length > 0) {
            if (wsLayers) {
              sections.push('## Personal Memory\n_(Cross-workspace — not specific to this workspace)_');
            }
            sections.push(...personalResults.map((r, i) =>
              `[${i + 1}] (score: ${r.finalScore.toFixed(3)}, type: ${r.frame.frame_type}, importance: ${r.frame.importance}, source: ${(r.frame as any).source ?? 'user_stated'})\n${r.frame.content}`
            ));
          }
        }

        // W2.5: Detect potential contradictions in results
        if (sections.length > 1) {
          const allContent = sections.filter(s => !s.startsWith('##')).join('\n');
          const contradictionSignals = ['but ', 'however', 'instead', 'no longer', 'changed to', 'reversed', 'cancelled', 'not '];
          const hasConflictSignal = contradictionSignals.some(s => allContent.toLowerCase().includes(s));
          if (hasConflictSignal) {
            sections.push('\n⚠️ Note: Multiple memories found. Check for potential contradictions — verify which is the most current/authoritative version.');
          }
        }

        if (sections.length > 0) return sections.join('\n\n');

        // Fallback: LIKE scan on both minds
        const allFallback: string[] = [];
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

        for (const [label, db] of [['personal', deps.db], ...(wsLayers ? [['workspace', wsLayers.db] as const] : [])] as const) {
          const raw = db.getDatabase();
          let fallbackFrames: Array<{ id: number; content: string; frame_type: string; importance: string }>;
          if (keywords.length > 0) {
            const likeClauses = keywords.map(() => "LOWER(content) LIKE '%' || ? || '%' ESCAPE '\\'").join(' OR ');
            const likeParams = keywords.map(k => k.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_'));
            fallbackFrames = raw.prepare(
              `SELECT id, content, frame_type, importance FROM memory_frames WHERE ${likeClauses} ORDER BY id DESC LIMIT ?`
            ).all(...likeParams, limit) as any[];
          } else {
            fallbackFrames = raw.prepare(
              'SELECT id, content, frame_type, importance FROM memory_frames ORDER BY id DESC LIMIT ?'
            ).all(limit) as any[];
          }
          if (fallbackFrames.length > 0) {
            if (wsLayers) allFallback.push(`## ${label === 'workspace' ? 'Workspace' : 'Personal'} Memory`);
            allFallback.push(...fallbackFrames.map((f, i) =>
              `[${i + 1}] (type: ${f.frame_type}, importance: ${f.importance})\n${f.content}`
            ));
          }
        }

        if (allFallback.length === 0) return 'No relevant memories found.';
        return allFallback.join('\n\n');
      },
    },
    // W5.7: Cross-workspace search — searches ALL workspace minds + personal
    {
      name: 'search_all_workspaces',
      description: 'Search across ALL workspaces and personal memory simultaneously. Use for cross-project queries like "what should I work on?" or "find everything about topic X across all projects".',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for across all workspaces' },
          limit: { type: 'number', description: 'Max results per workspace (default: 5)' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = args.query as string;
        const limitPerWs = (args.limit as number) ?? 5;
        const sections: string[] = [];

        // Search personal mind
        const personalResults = await deps.search.search(query, { limit: limitPerWs, profile: 'balanced' });
        if (personalResults.length > 0) {
          sections.push('## Personal Memory');
          sections.push(...personalResults.map((r, i) =>
            `[${i + 1}] (score: ${r.finalScore.toFixed(3)}, importance: ${r.frame.importance})\n${r.frame.content}`
          ));
        }

        // Search all workspace minds
        const allWs = deps.getAllWorkspaceSearches?.() ?? [];
        for (const { workspaceId, workspaceName, search: wsSearch } of allWs) {
          try {
            const wsResults = await wsSearch.search(query, { limit: limitPerWs, profile: 'balanced' });
            if (wsResults.length > 0) {
              sections.push(`## Workspace: ${workspaceName} (${workspaceId})`);
              sections.push(...wsResults.map((r, i) =>
                `[${i + 1}] (score: ${r.finalScore.toFixed(3)}, importance: ${r.frame.importance})\n${r.frame.content}`
              ));
            }
          } catch { /* skip unreadable workspaces */ }
        }

        if (sections.length === 0) return 'No relevant memories found across any workspace.';
        return sections.join('\n\n');
      },
    },
    {
      name: 'save_memory',
      description: 'Save a new memory. Defaults to workspace mind when active.\n\n'
        + 'CRITICAL ROUTING RULES:\n'
        + '- target="workspace" (DEFAULT): ALL project data, client data, decisions, tasks, meeting notes, research findings, confidential information, names, budgets, timelines. '
        + 'Workspace memories are ISOLATED — they cannot be seen from other workspaces. Use this for ANYTHING workspace-specific.\n'
        + '- target="personal": ONLY for user preferences (favorite color, communication style), personal facts (name, role, timezone), '
        + 'and cross-workspace knowledge (general skills, tool preferences). Personal memories are shared across ALL workspaces.\n\n'
        + 'When in doubt, use workspace. Never save client names, budgets, confidential data, or project-specific information to personal mind.',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory content to save' },
          importance: {
            type: 'string',
            enum: ['critical', 'important', 'normal', 'temporary'],
            description: 'How important is this memory',
          },
          target: {
            type: 'string',
            enum: ['workspace', 'personal'],
            description: 'Which mind to save to. Workspace (default): ALL project/client/confidential data — isolated per workspace. Personal: ONLY user preferences and cross-workspace knowledge — shared across all workspaces.',
          },
          source: {
            type: 'string',
            enum: ['user_stated', 'tool_verified', 'agent_inferred'],
            description: 'Provenance: user_stated = the user said this, tool_verified = confirmed via tool output, agent_inferred = your own analysis/synthesis.',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low', 'unverified'],
            description: 'Confidence level. Auto-derived from source if omitted: tool_verified→high, user_stated→medium, agent_inferred→low.',
          },
        },
        required: ['content'],
      },
      execute: async (args) => {
        // W2.10: Rate limit memory saves to prevent flooding (50 per session)
        saveMemoryCount++;
        if (saveMemoryCount > MAX_SAVES_PER_SESSION) {
          return `Memory save rate limit reached (${MAX_SAVES_PER_SESSION} saves this session). This prevents memory flooding. Start a new session to save more memories.`;
        }

        let importance = (args.importance as string) ?? 'normal';
        const content = args.content as string;
        const target = (args.target as string) ?? 'workspace';
        const source = (args.source as string) ?? 'user_stated';
        const wsLayers = deps.getWorkspaceLayers?.();

        // F6: Derive confidence from source if not explicitly provided
        const confidence: ConfidenceLevel = (args.confidence as ConfidenceLevel) ?? deriveConfidence(source);

        // F7: Strict workspace routing — respect target parameter, with safety guardrail
        // When target='workspace' AND workspace is active → save to workspace only
        // When target='personal' → save to personal, UNLESS content appears workspace-specific
        let effectiveTarget = target;

        // B1-guardrail: Detect workspace-specific content being routed to personal mind
        // If workspace is active and content contains confidential/project signals, redirect to workspace
        if (effectiveTarget === 'personal' && wsLayers != null) {
          const contentLower = content.toLowerCase();
          const workspaceSpecificPatterns = [
            /\bconfidential\b/i, /\bclient\b/i, /\bbudget\b/i, /\bengagement\b/i,
            /\bdeliverable\b/i, /\bmilestone\b/i, /\btimeline\b/i, /\bdeadline\b/i,
            /\bceo\b/i, /\bcto\b/i, /\bcfo\b/i, /\bcoo\b/i,
            /\$\d{2,}[,.]?\d*[kmb]?\b/i, // dollar amounts ($500K, $1.2M, etc.)
            /\bproject\b.*\b(?:plan|status|update)\b/i,
            /\bcontract\b/i, /\bproposal\b/i, /\bnda\b/i, /\bsow\b/i,
          ];
          const hasWorkspaceSignal = workspaceSpecificPatterns.some(p => p.test(content));
          if (hasWorkspaceSignal) {
            effectiveTarget = 'workspace';
          }
        }

        const useWorkspace = effectiveTarget === 'workspace' && wsLayers != null;
        const targetFrames = useWorkspace ? wsLayers!.frames : deps.frames;
        const targetSessions = useWorkspace ? wsLayers!.sessions : deps.sessions;
        const targetCognify = useWorkspace ? wsLayers!.cognify : deps.cognify;
        const targetDb = useWorkspace ? wsLayers!.db : deps.db;
        const mindLabel = useWorkspace ? 'workspace' : 'personal';

        // F22: Detect dramatic claims and flag them
        const dramaticClaims = detectDramaticClaims(content);
        let dramaticFlag = '';
        if (dramaticClaims.length > 0) {
          // Downgrade importance to 'temporary' for dramatic claims unless explicitly set to critical
          if (!args.importance || (importance !== 'critical')) {
            importance = 'temporary';
          }
          dramaticFlag = ` [flag: dramatic_claim (${dramaticClaims.join(', ')})]`;
        }

        // ── Dedup checks (F7 cross-mind + F16 enhanced) ──────────────

        // Helper: check a single database for exact or normalized duplicates
        const checkDedupInDb = async (db: MindDB, label: string): Promise<string | null> => {
          try {
            const raw = db.getDatabase();

            // Exact-match dedup (original W2.4 check)
            const exactMatch = raw.prepare(
              "SELECT id, content FROM memory_frames WHERE content = ? LIMIT 1"
            ).get(content) as { id: number; content: string } | undefined;
            if (exactMatch) {
              return `Memory already exists in ${label} mind (frame ${exactMatch.id}) — skipped duplicate save.`;
            }

            // F16: Normalized string comparison
            const normalizedContent = normalizeForDedup(content);
            if (normalizedContent.length > 0) {
              // Fetch recent frames for normalized comparison (cap at 100 to avoid perf issues)
              const recentFrames = raw.prepare(
                "SELECT id, content FROM memory_frames ORDER BY id DESC LIMIT 100"
              ).all() as Array<{ id: number; content: string }>;

              for (const frame of recentFrames) {
                if (normalizeForDedup(frame.content) === normalizedContent) {
                  return `Memory already exists in ${label} mind (frame ${frame.id}, normalized match) — skipped duplicate save.`;
                }
              }
            }

            // F16: Embedding-based similarity dedup (if embedder available)
            if (deps.embedder && normalizedContent.length > 0) {
              try {
                const candidateFrames = raw.prepare(
                  "SELECT id, content FROM memory_frames ORDER BY id DESC LIMIT 50"
                ).all() as Array<{ id: number; content: string }>;

                if (candidateFrames.length > 0) {
                  const newEmbedding = await deps.embedder.embed(content);
                  const candidateTexts = candidateFrames.map(f => f.content);
                  const candidateEmbeddings = await deps.embedder.embedBatch(candidateTexts);

                  for (let i = 0; i < candidateEmbeddings.length; i++) {
                    const similarity = cosineSimilarity(newEmbedding, candidateEmbeddings[i]);
                    if (similarity > 0.95) {
                      return `Memory already exists in ${label} mind (frame ${candidateFrames[i].id}, semantic similarity: ${similarity.toFixed(3)}) — skipped duplicate save.`;
                    }
                  }
                }
              } catch { /* non-blocking — continue if embedding dedup fails */ }
            }
          } catch { /* non-blocking — proceed with save if dedup check fails */ }
          return null;
        };

        // F7: Cross-mind dedup — check BOTH workspace and personal mind before saving
        const targetDedupResult = await checkDedupInDb(targetDb, mindLabel);
        if (targetDedupResult) return targetDedupResult;

        // Check the OTHER mind for cross-mind duplicates
        if (useWorkspace) {
          // Saving to workspace — also check personal mind
          const crossDedupResult = await checkDedupInDb(deps.db, 'personal');
          if (crossDedupResult) {
            return crossDedupResult.replace('skipped duplicate save', 'skipped cross-mind duplicate save');
          }
        } else if (wsLayers) {
          // Saving to personal — also check workspace mind
          const crossDedupResult = await checkDedupInDb(wsLayers.db, 'workspace');
          if (crossDedupResult) {
            return crossDedupResult.replace('skipped duplicate save', 'skipped cross-mind duplicate save');
          }
        }

        // Use cognify pipeline if available (extracts entities + indexes for search)
        if (targetCognify) {
          const result = await targetCognify.cognify(content, importance as any);
          return `Memory saved to ${mindLabel} mind (importance: ${importance}, source: ${source}, confidence: ${confidence}${dramaticFlag}, entities: ${result.entitiesExtracted}, relations: ${result.relationsCreated}).`;
        }

        // Fallback: raw frame creation (no entity extraction or vector indexing)
        const active = targetSessions.getActive();
        let gopId: string;
        if (active.length === 0) {
          const session = targetSessions.create();
          gopId = session.gop_id;
        } else {
          gopId = active[0].gop_id;
        }
        const latestI = targetFrames.getLatestIFrame(gopId);
        if (latestI) {
          targetFrames.createPFrame(gopId, content, latestI.id, importance as any, source as any);
        } else {
          targetFrames.createIFrame(gopId, content, importance as any, source as any);
        }
        return `Memory saved to ${mindLabel} mind (importance: ${importance}, source: ${source}, confidence: ${confidence}${dramaticFlag}).`;
      },
    },
    {
      name: 'query_knowledge',
      description: 'Query the knowledge graph for entities and their relationships. Use query="*" to list all known entities.',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Entity name to search for, or "*" to list all entities' },
          type: { type: 'string', description: 'Filter by entity type (e.g., person, project, technology, concept, organization)' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = args.query as string;
        const entityType = args.type as string | undefined;

        let entities;
        // F5: Wildcard support — list all entities
        if (query === '*' || query.toLowerCase() === 'all') {
          entities = deps.knowledge.getEntitiesByType(entityType ?? '');
        } else if (entityType) {
          entities = deps.knowledge.getEntitiesByType(entityType);
          entities = entities.filter(e => e.name.toLowerCase().includes(query.toLowerCase()));
        } else {
          entities = deps.knowledge.searchEntities(query);
        }

        if (entities.length === 0) return `No entities found matching "${query}".`;

        const maxEntities = (query === '*' || query.toLowerCase() === 'all') ? 50 : 10;
        const results: string[] = [];
        for (const entity of entities.slice(0, maxEntities)) {
          const rels = deps.knowledge.getRelationsFrom(entity.id);
          const relStr = rels.length > 0
            ? rels.map(r => {
                const target = deps.knowledge.getEntity(r.target_id);
                return `  → ${r.relation_type} → ${target?.name ?? 'unknown'} (confidence: ${r.confidence})`;
              }).join('\n')
            : '  (no outgoing relations)';
          results.push(`${entity.entity_type}: ${entity.name}\n${relStr}`);
        }
        return results.join('\n\n');
      },
    },
    {
      name: 'add_task',
      description: 'Add a task to the awareness layer for tracking',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Task description' },
          priority: { type: 'number', description: 'Priority (0-10, higher = more important)' },
        },
        required: ['content'],
      },
      execute: async (args) => {
        const item = deps.awareness.add('task', args.content as string, (args.priority as number) ?? 5);
        return `Task added: "${item.content}" (priority: ${item.priority})`;
      },
    },
    {
      name: 'correct_knowledge',
      description: 'Correct or invalidate a knowledge entity. Use entity_id from query_knowledge results.',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'number', description: 'The entity ID to update' },
          action: {
            type: 'string',
            enum: ['correct', 'invalidate'],
            description: 'Whether to correct or invalidate the entity',
          },
          updates: {
            type: 'object',
            description: 'For correct: property updates to merge. For invalidate: { reason: "why it is wrong" }',
          },
        },
        required: ['entity_id', 'action'],
      },
      execute: async (args) => {
        if (!deps.feedback) {
          return 'Feedback handler not available. Cannot correct knowledge.';
        }

        const entityId = args.entity_id as number;
        const action = args.action as string;
        const updates = (args.updates as Record<string, unknown>) ?? {};

        if (action === 'correct') {
          deps.feedback.correctEntity(entityId, updates);
          return `Entity ${entityId} corrected with updates: ${JSON.stringify(updates)}`;
        } else if (action === 'invalidate') {
          const reason = (updates.reason as string) ?? 'No reason provided';
          deps.feedback.invalidateEntity(entityId, reason);
          return `Entity ${entityId} invalidated. Reason: ${reason}`;
        }

        return `Unknown action "${action}". Use "correct" or "invalidate".`;
      },
    },
  ];
}

// ── Combined retrieval result formatter ─────────────────────────────────

function formatResultEntry(r: CombinedResult, includeFrameType: boolean): string {
  const lines = [`- ${r.content} ${r.attribution} (score: ${r.score.toFixed(3)}`];
  if (includeFrameType && r.metadata.frameType) {
    lines[0] += `, type: ${r.metadata.frameType}`;
  }
  if (includeFrameType && r.metadata.importance) {
    lines[0] += `, importance: ${r.metadata.importance}`;
  }
  lines[0] += ')';
  return lines.join('\n');
}

/**
 * Format a CombinedRetrievalResult into a human-readable string for the agent.
 * @param result The combined retrieval result
 * @param hasWorkspace Whether a workspace is active (controls header display)
 */
export function formatCombinedResult(result: CombinedRetrievalResult, hasWorkspace: boolean): string {
  const sections: string[] = [];

  // Workspace results
  if (result.workspaceResults.length > 0) {
    const header = '## Workspace Memory';
    const entries = result.workspaceResults.map(r => formatResultEntry(r, true)).join('\n');
    sections.push(`${header}\n${entries}`);
  }

  // Personal results
  if (result.personalResults.length > 0) {
    if (hasWorkspace) {
      const header = '## Personal Memory';
      const entries = result.personalResults.map(r => formatResultEntry(r, true)).join('\n');
      sections.push(`${header}\n${entries}`);
    } else {
      // No workspace = no header, just results
      const entries = result.personalResults.map(r => formatResultEntry(r, true)).join('\n');
      sections.push(entries);
    }
  }

  // KVARK results
  if (result.kvarkResults.length > 0) {
    const header = '## Enterprise Knowledge (KVARK)';
    // KVARK results: score only, no frame_type/importance
    const entries = result.kvarkResults.map(r => formatResultEntry(r, false)).join('\n');
    sections.push(`${header}\n${entries}`);
  }

  // Source conflict notice
  if (result.hasConflict && result.conflictNote) {
    sections.push(`## Source Conflict\n${result.conflictNote}\nReview both sources carefully and note which is more recent or authoritative.`);
  }

  // KVARK error notice
  if (result.kvarkError && result.kvarkAvailable) {
    sections.push(`> Enterprise search encountered an error: ${result.kvarkError}\n> Results shown are from local memory only.`);
  }

  if (sections.length === 0) {
    return 'No relevant memories found.';
  }

  return sections.join('\n\n');
}
