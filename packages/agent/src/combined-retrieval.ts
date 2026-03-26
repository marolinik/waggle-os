/**
 * Combined Retrieval — merges workspace memory, personal memory, and KVARK enterprise search.
 *
 * This is the core merge engine for Milestone B. It does NOT format output for
 * the agent (that's search_memory's job in B2). It returns structured data with
 * source attribution so the consumer can format however it needs.
 *
 * Design:
 * - Pure data in, pure data out — no side effects, no framework deps
 * - KVARK is only called when local results are insufficient
 * - Every result carries explicit source attribution
 * - KVARK failures degrade gracefully (local results preserved, error captured)
 */

import {
  parseSearchResults,
  type KvarkClientLike,
  type KvarkStructuredResult,
} from './kvark-tools.js';

// ── Public types ──────────────────────────────────────────────────────────

export type ResultSource = 'workspace' | 'personal' | 'kvark';

export interface CombinedResult {
  content: string;
  source: ResultSource;
  attribution: string;
  score: number;
  metadata: {
    // Memory-sourced
    frameId?: number;
    frameType?: string;
    importance?: string;
    // KVARK-sourced
    documentId?: number;
    documentType?: string | null;
  };
}

export interface CombinedRetrievalResult {
  query: string;
  workspaceResults: CombinedResult[];
  personalResults: CombinedResult[];
  kvarkResults: CombinedResult[];
  kvarkAvailable: boolean;
  kvarkSkipped: boolean;
  kvarkError?: string;
  /** True when workspace memory and KVARK results may disagree on the same topic */
  hasConflict: boolean;
  /** Human-readable note explaining detected conflict (undefined when no conflict) */
  conflictNote?: string;
}

export interface CombinedSearchOptions {
  limit?: number;
  profile?: string;
  scope?: 'all' | 'personal' | 'workspace';
}

/**
 * Minimal search interface — matches HybridSearch.search() from @waggle/core.
 * Defined here to avoid a hard package dependency.
 */
export interface MemorySearchLike {
  search(query: string, options?: { limit?: number; profile?: string }): Promise<MemorySearchResultLike[]>;
}

/** Mirrors SearchResult from @waggle/core/mind/search */
export interface MemorySearchResultLike {
  frame: {
    id: number;
    content: string;
    frame_type: string;
    importance: string;
  };
  finalScore: number;
}

export interface CombinedRetrievalDeps {
  workspaceSearch: MemorySearchLike | null;
  personalSearch: MemorySearchLike;
  kvarkClient: KvarkClientLike | null;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum local results with strong scores before we skip KVARK */
const LOCAL_COVERAGE_MIN_COUNT = 3;
/** Score threshold to consider a local result "strong" */
const LOCAL_COVERAGE_SCORE_THRESHOLD = 0.7;
/** Minimum score for a result to participate in conflict detection */
const CONFLICT_SCORE_THRESHOLD = 0.6;

// ── Conflict detection ───────────────────────────────────────────────────

/** Status/decision keywords grouped by polarity */
const POSITIVE_STATUS = ['approved', 'accepted', 'selected', 'chose', 'chosen', 'decided', 'confirmed', 'active', 'completed', 'launched', 'enabled'];
const NEGATIVE_STATUS = ['rejected', 'cancelled', 'canceled', 'postponed', 'deprecated', 'deferred', 'suspended', 'disabled', 'abandoned', 'declined', 'revoked'];

/**
 * Detect potential conflict between workspace memory and KVARK results.
 *
 * Conservative heuristic — only flags when:
 * 1. Both sources have relevant results (score ≥ threshold)
 * 2. Top results contain contradictory status/decision language
 *
 * Returns null when no conflict detected, or a short explanatory note.
 */
export function detectConflict(
  workspaceResults: CombinedResult[],
  kvarkResults: CombinedResult[],
): string | null {
  // Need strong results from both sources
  const strongWs = workspaceResults.filter(r => r.score >= CONFLICT_SCORE_THRESHOLD);
  const strongKvark = kvarkResults.filter(r => r.score >= CONFLICT_SCORE_THRESHOLD);
  if (strongWs.length === 0 || strongKvark.length === 0) return null;

  // Check top results (up to 3 from each) for status polarity conflict
  const wsTexts = strongWs.slice(0, 3).map(r => r.content.toLowerCase());
  const kvarkTexts = strongKvark.slice(0, 3).map(r => r.content.toLowerCase());

  const wsPolarity = extractPolarity(wsTexts);
  const kvarkPolarity = extractPolarity(kvarkTexts);

  // Conflict: one source is positive, the other is negative
  if (wsPolarity === 'positive' && kvarkPolarity === 'negative') {
    return 'Workspace memory contains affirmative language (approved/selected/active) while enterprise documents contain contradictory language (rejected/cancelled/deprecated). These sources may be out of sync.';
  }
  if (wsPolarity === 'negative' && kvarkPolarity === 'positive') {
    return 'Enterprise documents contain affirmative language while workspace memory contains contradictory language. The enterprise source may be more current.';
  }

  return null;
}

type Polarity = 'positive' | 'negative' | 'neutral';

function extractPolarity(texts: string[]): Polarity {
  const combined = texts.join(' ');
  const hasPositive = POSITIVE_STATUS.some(w => combined.includes(w));
  const hasNegative = NEGATIVE_STATUS.some(w => combined.includes(w));

  // Only assign polarity when one side dominates
  if (hasPositive && !hasNegative) return 'positive';
  if (hasNegative && !hasPositive) return 'negative';
  return 'neutral';
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Map a memory SearchResult into a CombinedResult */
export function mapMemoryResult(
  result: MemorySearchResultLike,
  source: 'workspace' | 'personal',
): CombinedResult {
  return {
    content: result.frame.content,
    source,
    attribution: source === 'workspace' ? '[workspace memory]' : '[personal memory]',
    score: result.finalScore,
    metadata: {
      frameId: result.frame.id,
      frameType: result.frame.frame_type,
      importance: result.frame.importance,
    },
  };
}

/** Map a KvarkStructuredResult into a CombinedResult */
export function mapKvarkResult(result: KvarkStructuredResult): CombinedResult {
  return {
    content: result.content,
    source: 'kvark',
    attribution: result.attribution,
    score: result.score,
    metadata: {
      documentId: result.documentId,
      documentType: result.documentType,
    },
  };
}

/** Check whether local results are strong enough to skip KVARK */
export function hasSufficientLocalCoverage(results: CombinedResult[]): boolean {
  const strongResults = results.filter(r => r.score >= LOCAL_COVERAGE_SCORE_THRESHOLD);
  return strongResults.length >= LOCAL_COVERAGE_MIN_COUNT;
}

/** Decide whether KVARK should be queried */
export function shouldQueryKvark(
  kvarkClient: KvarkClientLike | null,
  scope: 'all' | 'personal' | 'workspace',
  localResults: CombinedResult[],
): boolean {
  if (!kvarkClient) return false;
  if (scope === 'personal' || scope === 'workspace') return false;
  if (hasSufficientLocalCoverage(localResults)) return false;
  return true;
}

// ── Main class ────────────────────────────────────────────────────────────

export class CombinedRetrieval {
  private deps: CombinedRetrievalDeps;

  constructor(deps: CombinedRetrievalDeps) {
    this.deps = deps;
  }

  async search(query: string, opts: CombinedSearchOptions = {}): Promise<CombinedRetrievalResult> {
    const { limit = 10, profile = 'balanced', scope = 'all' } = opts;

    // 1. Search workspace memory
    const workspaceResults = await this.searchWorkspace(query, limit, profile, scope);

    // 2. Search personal memory
    const personalResults = await this.searchPersonal(query, limit, profile, scope);

    // 3. Decide whether to call KVARK
    const localResults = [...workspaceResults, ...personalResults];
    const kvarkAvailable = this.deps.kvarkClient !== null;
    const callKvark = shouldQueryKvark(this.deps.kvarkClient, scope, localResults);

    if (!callKvark) {
      return {
        query,
        workspaceResults,
        personalResults,
        kvarkResults: [],
        kvarkAvailable,
        kvarkSkipped: kvarkAvailable, // skipped only if it was available but we chose not to call
        hasConflict: false,
      };
    }

    // 4. Call KVARK (with graceful degradation)
    const { kvarkResults, kvarkError } = await this.searchKvark(query, limit);

    // 5. Detect potential conflict between workspace memory and KVARK
    const conflictNote = detectConflict(workspaceResults, kvarkResults);

    return {
      query,
      workspaceResults,
      personalResults,
      kvarkResults,
      kvarkAvailable: true,
      kvarkSkipped: false,
      kvarkError,
      hasConflict: conflictNote !== null,
      conflictNote: conflictNote ?? undefined,
    };
  }

  private async searchWorkspace(
    query: string, limit: number, profile: string, scope: string,
  ): Promise<CombinedResult[]> {
    if (!this.deps.workspaceSearch) return [];
    if (scope === 'personal') return [];

    const results = await this.deps.workspaceSearch.search(query, { limit, profile });
    return results.map(r => mapMemoryResult(r, 'workspace'));
  }

  private async searchPersonal(
    query: string, limit: number, profile: string, scope: string,
  ): Promise<CombinedResult[]> {
    if (scope === 'workspace') return [];

    const results = await this.deps.personalSearch.search(query, { limit, profile });
    return results.map(r => mapMemoryResult(r, 'personal'));
  }

  private async searchKvark(
    query: string, limit: number,
  ): Promise<{ kvarkResults: CombinedResult[]; kvarkError?: string }> {
    try {
      const response = await this.deps.kvarkClient!.search(query, { limit });
      const structured = parseSearchResults(response);
      return { kvarkResults: structured.map(mapKvarkResult) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown KVARK error';
      return { kvarkResults: [], kvarkError: message };
    }
  }
}
