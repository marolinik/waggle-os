/**
 * On-demand MCP tool retrieval (steal #6).
 *
 * MCP servers can expose dozens of tools. Dumping every running server's tool
 * into the model's tool pool bloats the prompt and drowns the built-ins. This
 * module relevance-gates ONLY the MCP tools: built-ins are always injected in
 * full by the caller; MCP tools above a threshold are narrowed to a top-k
 * selection driven by the recent conversation.
 *
 * Invariants (see docs/plans/STEALS-TIER2-ARC-2026-07-10.md §D6):
 *   - Feature disabled  → inject ALL MCP tools (no gating).
 *   - count ≤ threshold → inject ALL MCP tools (nothing to narrow).
 *   - count >  threshold → inject the union-only accumulated set for the
 *     conversation, grown by this turn's top-k. A tool that ever entered a
 *     conversation's pool never vanishes mid-conversation.
 *
 * Scoring uses the mind embedder (cosine over "name: description"), lazily
 * indexed and rebuilt whenever the running tool set changes. When the embedder
 * is absent or degraded to the deterministic mock, it falls back to
 * keyword-overlap scoring (mirrors connector-search.ts) — and NEVER full-dumps
 * above the threshold. Any failure returns the accumulated set only, so a
 * retrieval hiccup can never break the turn.
 */

import type { Embedder } from '@waggle/core';
import type { ToolDefinition } from '../tools.js';

export interface McpToolRetrievalConfig {
  /** Master switch. When false, all MCP tools are injected (no gating). */
  enabled: boolean;
  /** Inject all MCP tools when the running count is at or below this. */
  threshold: number;
  /** How many tools this turn's ranking may add to the conversation pool. */
  topK: number;
}

export const DEFAULT_MCP_TOOL_RETRIEVAL_CONFIG: McpToolRetrievalConfig = {
  enabled: true,
  threshold: 20,
  topK: 10,
};

/** Minimal message shape used to build the retrieval query. */
export interface RetrievalMessage {
  role: string;
  content: string;
}

export interface McpToolSelectionResult {
  tools: ToolDefinition[];
  /** Tools matched by this turn's ranking, excluding older accumulated matches. */
  retrievedToolNames: string[];
}

/** Trailing user/assistant turns considered when building the query. */
const QUERY_MESSAGE_WINDOW = 5;
/** Cap the query so an unusually long turn can't dominate the embed input. */
const MAX_QUERY_CHARS = 2_000;
/** LRU cap on tracked conversations. */
const DEFAULT_MAX_CONVERSATIONS = 200;

/**
 * Build the retrieval query from the trailing ≤5 user/assistant TEXT messages.
 * Tool-role turns and empty content are skipped. Returns '' when there is no
 * usable text (caller then leaves the accumulated set untouched).
 */
export function buildRetrievalQuery(messages: readonly RetrievalMessage[]): string {
  const text: string[] = [];
  for (let i = messages.length - 1; i >= 0 && text.length < QUERY_MESSAGE_WINDOW; i--) {
    const m = messages[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content !== 'string') continue;
    const trimmed = m.content.trim();
    if (!trimmed) continue;
    text.push(trimmed);
  }
  return text.reverse().join('\n').slice(0, MAX_QUERY_CHARS);
}

function latestRetrievalQuery(messages: readonly RetrievalMessage[]): string {
  for (const role of ['user', 'assistant']) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== role || typeof message.content !== 'string') continue;
      const trimmed = message.content.trim();
      if (trimmed) return trimmed.slice(0, MAX_QUERY_CHARS);
    }
  }
  return '';
}

/** Detect the deterministic mock embedder without a hard type dependency. */
function isMockEmbedder(embedder: Embedder): boolean {
  const probe = embedder as Embedder & { getActiveProvider?: () => string };
  return typeof probe.getActiveProvider === 'function' && probe.getActiveProvider() === 'mock';
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 3) out.add(word);
  }
  return out;
}

interface RankedToolNames {
  selectedToolNames: string[];
  latestToolNames: string[];
}

export class McpToolRetriever {
  private readonly embedder: Embedder | null;
  private readonly maxConversations: number;
  /** Union-only per-conversation tool-name set. LRU by insertion/access order. */
  private readonly accumulators = new Map<string, Set<string>>();
  /** Lazy embedding index, invalidated when the running tool set changes. */
  private index: { signature: string; vectors: Map<string, Float32Array> } | null = null;

  constructor(opts?: { embedder?: Embedder | null; maxConversations?: number }) {
    this.embedder = opts?.embedder ?? null;
    this.maxConversations = opts?.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;
  }

  /**
   * Resolve which MCP tools to inject for this turn. Never throws — a failure
   * degrades to the conversation's accumulated set.
   */
  async selectTools(
    mcpTools: ToolDefinition[],
    messages: readonly RetrievalMessage[],
    conversationId: string,
    config?: Partial<McpToolRetrievalConfig>,
  ): Promise<ToolDefinition[]> {
    return (await this.selectToolsWithDetails(mcpTools, messages, conversationId, config)).tools;
  }

  async selectToolsWithDetails(
    mcpTools: ToolDefinition[],
    messages: readonly RetrievalMessage[],
    conversationId: string,
    config?: Partial<McpToolRetrievalConfig>,
  ): Promise<McpToolSelectionResult> {
    const cfg = { ...DEFAULT_MCP_TOOL_RETRIEVAL_CONFIG, ...config };

    if (mcpTools.length === 0) return { tools: [], retrievedToolNames: [] };
    // Feature off, or nothing to narrow → inject the full running tool set.
    if (!cfg.enabled) return { tools: mcpTools, retrievedToolNames: [] };
    if (mcpTools.length <= cfg.threshold) return { tools: mcpTools, retrievedToolNames: [] };

    const acc = this.getAccumulator(conversationId);
    let retrievedToolNames: string[] = [];
    try {
      const query = buildRetrievalQuery(messages);
      if (query) {
        const latestQuery = latestRetrievalQuery(messages) || query;
        const ranked = await this.rank(mcpTools, query, latestQuery, cfg.topK);
        retrievedToolNames = ranked.latestToolNames;
        for (const name of ranked.selectedToolNames) acc.add(name);
      }
    } catch {
      // Inject none new; the accumulated set below still stands the turn up.
    }
    return {
      tools: mcpTools.filter((t) => acc.has(t.name)),
      retrievedToolNames,
    };
  }

  private async rank(
    mcpTools: ToolDefinition[],
    query: string,
    latestQuery: string,
    topK: number,
  ): Promise<RankedToolNames> {
    if (!this.embedder || isMockEmbedder(this.embedder)) {
      return this.rankByKeyword(mcpTools, query, latestQuery, topK);
    }
    return this.rankByEmbedding(this.embedder, mcpTools, query, latestQuery, topK);
  }

  private async rankByEmbedding(
    embedder: Embedder,
    mcpTools: ToolDefinition[],
    query: string,
    latestQuery: string,
    topK: number,
  ): Promise<RankedToolNames> {
    const vectors = await this.ensureIndex(embedder, mcpTools);
    const [queryVec, latestQueryVec] = await embedder.embedBatch([query, latestQuery]);
    if (!queryVec || !latestQueryVec) return { selectedToolNames: [], latestToolNames: [] };

    const scored: Array<{ name: string; score: number; latestScore: number }> = [];
    for (const tool of mcpTools) {
      const vec = vectors.get(tool.name);
      // Skip dim-mismatched vectors rather than scoring them as noise.
      if (!vec || vec.length !== queryVec.length || vec.length !== latestQueryVec.length) continue;
      const latestScore = cosine(latestQueryVec, vec);
      const score = latestScore * 4 + cosine(queryVec, vec);
      // Positive-similarity floor: an orthogonal tool shares no signal with the
      // query, so padding the top-k with it just re-bloats the pool #6 gates.
      if (score > 0) scored.push({ name: tool.name, score, latestScore });
    }
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, topK);
    return {
      selectedToolNames: selected.map((item) => item.name),
      latestToolNames: selected.filter((item) => item.latestScore > 0).map((item) => item.name),
    };
  }

  /** Keyword-overlap fallback. Only tools with a hit are eligible — never a full dump. */
  private rankByKeyword(
    mcpTools: ToolDefinition[],
    query: string,
    latestQuery: string,
    topK: number,
  ): RankedToolNames {
    const words = tokenize(query);
    const latestWords = tokenize(latestQuery);
    if (words.size === 0) return { selectedToolNames: [], latestToolNames: [] };

    const scored: Array<{ name: string; score: number; latestScore: number }> = [];
    for (const tool of mcpTools) {
      const haystack = `${tool.name} ${tool.description}`.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (haystack.includes(word)) score++;
      }
      let latestScore = 0;
      for (const word of latestWords) {
        if (haystack.includes(word)) latestScore++;
      }
      score += latestScore * 4;
      if (score > 0) scored.push({ name: tool.name, score, latestScore });
    }
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, topK);
    return {
      selectedToolNames: selected.map((item) => item.name),
      latestToolNames: selected.filter((item) => item.latestScore > 0).map((item) => item.name),
    };
  }

  /** Build (or reuse) the tool-vector index. Rebuilt when the tool set changes. */
  private async ensureIndex(
    embedder: Embedder,
    mcpTools: ToolDefinition[],
  ): Promise<Map<string, Float32Array>> {
    const signature = mcpTools.map((t) => t.name).sort().join(' ');
    if (this.index && this.index.signature === signature) return this.index.vectors;

    const texts = mcpTools.map((t) => `${t.name}: ${t.description}`);
    const vecs = await embedder.embedBatch(texts);
    const vectors = new Map<string, Float32Array>();
    mcpTools.forEach((tool, i) => {
      const v = vecs[i];
      if (v) vectors.set(tool.name, v);
    });
    this.index = { signature, vectors };
    return vectors;
  }

  /** Get the conversation's accumulator, refreshing its LRU recency. */
  private getAccumulator(conversationId: string): Set<string> {
    const existing = this.accumulators.get(conversationId);
    if (existing) {
      this.accumulators.delete(conversationId);
      this.accumulators.set(conversationId, existing);
      return existing;
    }
    const fresh = new Set<string>();
    this.accumulators.set(conversationId, fresh);
    if (this.accumulators.size > this.maxConversations) {
      const oldest = this.accumulators.keys().next().value;
      if (oldest !== undefined) this.accumulators.delete(oldest);
    }
    return fresh;
  }
}
