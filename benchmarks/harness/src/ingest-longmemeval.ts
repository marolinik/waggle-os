/**
 * LME V1 turn-level ingest — mirrors the LoCoMo ingest pattern in ingest.ts.
 *
 * Reads the LongMemEval canonical archive (`benchmarks/data/longmemeval/
 * longmemeval.jsonl`, built by build-longmemeval-canonical.ts) and produces
 * an array of atomic turn frames, one per message per session.
 *
 * LME V1 source shape per instance:
 *   {
 *     instance_id: string,          // unique QA-pair id
 *     conversation_id: string,      // equals question_id; conversation scope
 *     question: string,
 *     expected: string[],
 *     context: string,              // formatted conversation (unused by ingest)
 *     sessions: Array<{
 *       session_id: string,
 *       date?: string,              // optional ISO date for the session
 *       messages: Array<{
 *         role: 'user' | 'assistant',
 *         content: string,
 *       }>,
 *     }>,
 *   }
 *
 * The `retrieval` and `agentic` cells already use `instance.conversation_id`
 * as a gopId filter in HybridSearch. This module stores each turn under
 * `gopId = instance.conversation_id` so the filter scope aligns correctly.
 * Because multiple instances share the same conversation_id, turns are
 * deduplicated per conversation: only the FIRST instance encountered for
 * each conversation_id drives the session extraction. Later instances for
 * the same conversation carry the same turns — ingesting them twice would
 * pollute the vector index with byte-identical duplicates.
 *
 * GATE-S0 decision (frame-per-turn granularity) applies here too: one frame
 * per message, not one frame per session. See ingest.ts §GATE-S0.
 */

import fs from 'node:fs';
import type { MindDB, HybridSearch, FrameStore, SessionStore } from '@waggle/core';

// ── Public types ─────────────────────────────────────────────────────────────

/** One LME V1 session message after parsing, ready to be written as a frame. */
export interface LongMemEvalTurn {
  /** Conversation identifier — becomes `memory_frames.gop_id`.
   *  Equals `instance.conversation_id` from the canonical builder. */
  gopId: string;
  /** Zero-based index within the flattened session-message sequence. */
  messageIndex: number;
  role: 'user' | 'assistant';
  /** Session identifier from `sessions[N].session_id`. */
  sessionId: string;
  /** Optional ISO date from `sessions[N].date`. */
  sessionDate?: string;
  content: string;
  /** Formatted `"${role}: ${content}"` — the string that lands in
   *  `memory_frames.content` and gets FTS5 / vec-indexed. Mirrors the
   *  LoCoMo `"${speaker}: ${text}"` pattern from ingest.ts. */
  formattedContent: string;
}

export interface IngestStats {
  /** Number of frames successfully created (after dedup). */
  count: number;
  /** Wall-clock ms spent on `createIFrame` loop (includes FTS5 auto-index). */
  ingestMs: number;
  /** Wall-clock ms spent on `indexFramesBatch` (embedder + vec0 insert). */
  indexMs: number;
}

// ── Internal raw-schema types ─────────────────────────────────────────────────

interface LmeRawMessage {
  role: string;
  content: string;
}

interface LmeRawSession {
  session_id?: string;
  date?: string;
  messages?: LmeRawMessage[];
}

interface LmeRawInstance {
  instance_id?: string;
  conversation_id?: string;
  question?: string;
  expected?: unknown;
  context?: string;
  sessions?: LmeRawSession[];
}

// ── Turn extractor ────────────────────────────────────────────────────────────

/**
 * Flatten a LongMemEval canonical JSONL archive into an array of atomic turn
 * records.
 *
 * One record per `sessions[].messages[]` entry across ALL instances in the
 * file, with per-conversation dedup: if two instances share the same
 * `conversation_id`, only the FIRST encountered instance's sessions are
 * extracted. Downstream `ingestLongMemEvalCorpus` will hit `FrameStore`'s
 * own content-hash dedup, but this pre-dedup keeps the returned array lean
 * and avoids redundant embedder calls.
 *
 * Session order is preserved verbatim (array index order in the source).
 * Message order within each session is also preserved verbatim.
 *
 * @param jsonlPath  Absolute or CWD-relative path to `longmemeval.jsonl`.
 */
export function extractTurnsFromLongMemEval(jsonlPath: string): LongMemEvalTurn[] {
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(
      `LongMemEval canonical archive not found at ${jsonlPath}. ` +
      `Build it via: npx tsx benchmarks/harness/scripts/build-longmemeval-canonical.ts`,
    );
  }

  const raw = fs.readFileSync(jsonlPath, 'utf-8');
  const lines = raw.split('\n');

  const out: LongMemEvalTurn[] = [];
  /** Tracks which conversation_ids we've already extracted sessions from. */
  const seenConversations = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let instance: LmeRawInstance;
    try {
      instance = JSON.parse(trimmed) as LmeRawInstance;
    } catch {
      // Tolerate malformed lines — consistent with datasets.ts loadDataset behaviour.
      continue;
    }

    const conversationId = instance.conversation_id;
    if (!conversationId) continue;

    // Per-conversation dedup: only the first instance for each conversation_id
    // drives the session extraction (all instances for a conversation share the
    // same session history — re-ingesting would create duplicate frames).
    if (seenConversations.has(conversationId)) continue;
    seenConversations.add(conversationId);

    if (!Array.isArray(instance.sessions)) continue;

    let messageIndex = 0;
    for (const session of instance.sessions) {
      if (!session || !Array.isArray(session.messages)) continue;
      const sessionId = session.session_id ?? `session_${messageIndex}`;
      const sessionDate = typeof session.date === 'string' ? session.date : undefined;

      for (const msg of session.messages) {
        if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) continue;
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        out.push({
          gopId: conversationId,
          messageIndex,
          role,
          sessionId,
          ...(sessionDate !== undefined ? { sessionDate } : {}),
          content: msg.content,
          formattedContent: `${role}: ${msg.content}`,
        });
        messageIndex++;
      }
    }
  }

  return out;
}

// ── Ingest options ────────────────────────────────────────────────────────────

/**
 * Default batch size for vector indexing. Matches `ingest.ts` DEFAULT_INDEX_BATCH_SIZE.
 * See ingest.ts for the rationale (ollama-embedder 30 s per-request timeout).
 */
const DEFAULT_INDEX_BATCH_SIZE = 200;

export interface IngestOptions {
  /** Vector-index batch size. Default 200. Callers with fast/parallel
   *  embedders can raise this; callers hitting timeouts should lower it. */
  batchSize?: number;
}

// ── Corpus ingest ─────────────────────────────────────────────────────────────

/**
 * Ingest a LongMemEval turn stream into an ephemeral MindDB + HybridSearch pair.
 *
 * Signature is intentionally identical to `ingestLoCoMoCorpus` in `ingest.ts`
 * so callers can swap the two without changing their substrate wiring.
 *
 * Each turn becomes one I-frame with:
 *   - `gop_id  = turn.gopId`            (= instance.conversation_id)
 *   - `content = turn.formattedContent` (= `"${role}: ${content}"`)
 *   - `source  = 'import'`
 *   - `importance = 'normal'`
 *
 * The `gopId` value matches the `conversation_id` stored on every
 * `DatasetInstance` for LME V1 — so the retrieval and agentic cells'
 * existing `gopId` filter in `HybridSearch.search()` will correctly scope
 * to the right conversation without any cell-level changes.
 *
 * FTS5 indexing fires automatically inside `createIFrame`. Vector indexing is
 * batched via `indexFramesBatch` in chunks of `batchSize` so slow/rate-limited
 * embedders don't hit request timeouts on large corpora.
 *
 * Caller owns the MindDB + HybridSearch lifecycle (see `createSubstrate` in
 * `substrate.ts`). Call `substrate.close()` in your `finally` block.
 */
export async function ingestLongMemEvalCorpus(
  db: MindDB,
  search: HybridSearch,
  frames: FrameStore,
  sessions: SessionStore,
  turns: LongMemEvalTurn[],
  options: IngestOptions = {},
): Promise<IngestStats> {
  void db;  // reserved for future per-db hooks; kept for signature symmetry with ingestLoCoMoCorpus
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_INDEX_BATCH_SIZE);
  const ingestStart = Date.now();
  const toIndex: Array<{ id: number; content: string }> = [];
  const seen = new Set<number>();

  // memory_frames.gop_id → sessions.gop_id is a FOREIGN KEY. Ensure one
  // session row per conversation exists BEFORE any createIFrame call fires.
  const ensuredGops = new Set<string>();
  for (const turn of turns) {
    if (!ensuredGops.has(turn.gopId)) {
      sessions.ensure(turn.gopId, 'longmemeval-benchmark', `LME V1 conversation ${turn.gopId}`);
      ensuredGops.add(turn.gopId);
    }

    const frame = frames.createIFrame(turn.gopId, turn.formattedContent, 'normal', 'import');
    if (seen.has(frame.id)) continue;   // dedup-collapsed duplicate
    seen.add(frame.id);
    toIndex.push({ id: frame.id, content: turn.formattedContent });
  }
  const ingestMs = Date.now() - ingestStart;

  // Chunk the vector-index batch so a slow embedder can't blow the per-request
  // timeout on a large corpus. Each chunk is one sqlite-vec transaction.
  const indexStart = Date.now();
  for (let i = 0; i < toIndex.length; i += batchSize) {
    const slice = toIndex.slice(i, i + batchSize);
    await search.indexFramesBatch(slice);
  }
  const indexMs = Date.now() - indexStart;

  return { count: toIndex.length, ingestMs, indexMs };
}
