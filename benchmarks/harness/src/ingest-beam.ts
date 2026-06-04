/**
 * BEAM turn-level ingest — mirrors the LoCoMo ingest pattern in ingest.ts.
 *
 * Reads the BEAM canonical archive (`benchmarks/data/beam/beam.jsonl`, built
 * by `build-beam-canonical.ts`) and produces an array of atomic turn frames,
 * one per message in each unique conversation.
 *
 * BEAM canonical source shape per instance (DatasetInstance with extras):
 *   {
 *     instance_id: string,         // e.g. "beam_0_q3"
 *     conversation_id: string,     // e.g. "beam_0"  (= `beam_${conversationIndex}`)
 *     question: string,
 *     expected: string[],
 *     context: string,             // formatted full conversation text:
 *                                  //   "user: ...\nassistant: ...\n..."
 *     chat_size?: string,          // '128K' | '500K' | '1M' | '10M'
 *   }
 *
 * The conversation turns are reconstructed by parsing the `context` field of
 * the FIRST instance encountered for each unique `conversation_id`. All
 * instances that share a `conversation_id` reference the same conversation, so
 * only one parse per conversation is needed; subsequent instances are skipped.
 *
 * gopId mapping: `turn.gopId = instance.conversation_id` (e.g. `"beam_0"`).
 * The retrieval and agentic cells use `instance.conversation_id` as their
 * gopId filter — so turns stored under `gopId = conversation_id` align
 * without any cell-level changes.
 *
 * GATE-S0 decision (frame-per-turn granularity) applies here too. See
 * ingest.ts §GATE-S0.
 */

import fs from 'node:fs';
import type { MindDB, HybridSearch, FrameStore, SessionStore } from '@waggle/core';

// ── Public types ─────────────────────────────────────────────────────────────

/** One BEAM conversation turn, ready to be written as a frame. */
export interface BeamTurn {
  /** Conversation identifier — becomes `memory_frames.gop_id`.
   *  Format: `beam_${conversationIndex}`, matching the canonical builder. */
  gopId: string;
  /** Zero-based index of this message within the conversation. */
  messageIndex: number;
  role: 'user' | 'assistant';
  content: string;
  /** Formatted `"${role}: ${content}"` — the string that lands in
   *  `memory_frames.content` and gets FTS5 / vec-indexed. */
  formattedContent: string;
  /** BEAM context-window size bucket this conversation belongs to.
   *  Preserved from the source instance for observability; not used
   *  by the ingest or retrieval logic. */
  chatSize: string;
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

interface BeamRawInstance {
  instance_id?: string;
  conversation_id?: string;
  question?: string;
  expected?: unknown;
  context?: string;
  chat_size?: string;
}

// ── Context parser ────────────────────────────────────────────────────────────

/**
 * Parse a BEAM `context` string back into individual (role, content) pairs.
 *
 * The canonical builder formats the conversation as:
 *   "user: <text>\nassistant: <text>\nuser: <text>\n..."
 *
 * Lines that start with `"user: "` or `"assistant: "` begin a new turn;
 * any subsequent lines that do NOT start with one of those prefixes are
 * treated as continuation lines of the current turn (i.e. multi-line content
 * is preserved). This matches the round-trip produced by:
 *   `turns.map(t => \`${t.role}: ${t.content}\`).join('\n')`
 *
 * Returns an empty array when `context` is empty or cannot be parsed.
 */
function parseContextToTurns(context: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!context || !context.trim()) return [];

  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let currentRole: 'user' | 'assistant' | null = null;
  const currentLines: string[] = [];

  const flush = (): void => {
    if (currentRole === null || currentLines.length === 0) return;
    const content = currentLines.join('\n').trim();
    if (content) result.push({ role: currentRole, content });
    currentLines.length = 0;
    currentRole = null;
  };

  for (const line of context.split('\n')) {
    if (line.startsWith('user: ')) {
      flush();
      currentRole = 'user';
      currentLines.push(line.slice('user: '.length));
    } else if (line.startsWith('assistant: ')) {
      flush();
      currentRole = 'assistant';
      currentLines.push(line.slice('assistant: '.length));
    } else if (currentRole !== null) {
      // Continuation line for the current turn.
      currentLines.push(line);
    }
    // Lines before the first recognisable prefix are silently skipped —
    // BEAM contexts always start with a "user: " line.
  }
  flush();
  return result;
}

// ── Turn extractor ────────────────────────────────────────────────────────────

/**
 * Flatten a BEAM canonical JSONL archive into an array of atomic turn records.
 *
 * One record per conversation message. Per-conversation dedup applies: only
 * the FIRST instance encountered for each `conversation_id` drives the context
 * parse. Subsequent instances for the same conversation are skipped (they
 * carry identical context).
 *
 * @param jsonlPath  Absolute or CWD-relative path to `beam.jsonl`.
 */
export function extractTurnsFromBeam(jsonlPath: string): BeamTurn[] {
  if (!fs.existsSync(jsonlPath)) {
    throw new Error(
      `BEAM canonical archive not found at ${jsonlPath}. ` +
      `Build it via: npx tsx benchmarks/harness/scripts/build-beam-canonical.ts`,
    );
  }

  const raw = fs.readFileSync(jsonlPath, 'utf-8');
  const lines = raw.split('\n');

  const out: BeamTurn[] = [];
  /** Tracks which conversation_ids we've already parsed context from. */
  const seenConversations = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let instance: BeamRawInstance;
    try {
      instance = JSON.parse(trimmed) as BeamRawInstance;
    } catch {
      // Tolerate malformed lines.
      continue;
    }

    const conversationId = instance.conversation_id;
    if (!conversationId) continue;

    // Per-conversation dedup: only the first instance for each conversation_id
    // has its context parsed (all instances for a conversation share the same
    // context — parsing more than once just creates duplicate frames).
    if (seenConversations.has(conversationId)) continue;
    seenConversations.add(conversationId);

    const context = instance.context ?? '';
    const chatSize = instance.chat_size ?? 'unknown';
    const parsedTurns = parseContextToTurns(context);

    if (parsedTurns.length === 0) continue;

    for (let i = 0; i < parsedTurns.length; i++) {
      const { role, content } = parsedTurns[i];
      out.push({
        gopId: conversationId,
        messageIndex: i,
        role,
        content,
        formattedContent: `${role}: ${content}`,
        chatSize,
      });
    }
  }

  return out;
}

// ── Ingest options ────────────────────────────────────────────────────────────

/**
 * Default batch size for vector indexing. Matches `ingest.ts`.
 * See ingest.ts for the ollama-embedder timeout rationale.
 */
const DEFAULT_INDEX_BATCH_SIZE = 200;

export interface IngestOptions {
  /** Vector-index batch size. Default 200. Callers with fast/parallel
   *  embedders can raise this; callers hitting timeouts should lower it. */
  batchSize?: number;
}

// ── Corpus ingest ─────────────────────────────────────────────────────────────

/**
 * Ingest a BEAM turn stream into an ephemeral MindDB + HybridSearch pair.
 *
 * Signature is intentionally identical to `ingestLoCoMoCorpus` in `ingest.ts`
 * so callers can swap the three ingest functions without changing their
 * substrate wiring. The only semantic difference is the session label written
 * to `SessionStore.ensure()` (`'beam-benchmark'`), which is cosmetic.
 *
 * Each turn becomes one I-frame with:
 *   - `gop_id  = turn.gopId`            (= instance.conversation_id, e.g. "beam_0")
 *   - `content = turn.formattedContent` (= `"${role}: ${content}"`)
 *   - `source  = 'import'`
 *   - `importance = 'normal'`
 *
 * The `gopId` value matches the `conversation_id` stored on every
 * `DatasetInstance` for BEAM — so the retrieval and agentic cells' existing
 * `gopId` filter in `HybridSearch.search()` scopes to the right conversation
 * without any cell-level changes.
 *
 * Caller owns the MindDB + HybridSearch lifecycle (see `createSubstrate` in
 * `substrate.ts`). Call `substrate.close()` in your `finally` block.
 */
export async function ingestBeamCorpus(
  db: MindDB,
  search: HybridSearch,
  frames: FrameStore,
  sessions: SessionStore,
  turns: BeamTurn[],
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
      sessions.ensure(turn.gopId, 'beam-benchmark', `BEAM conversation ${turn.gopId}`);
      ensuredGops.add(turn.gopId);
    }

    const frame = frames.createIFrame(turn.gopId, turn.formattedContent, 'normal', 'import');
    if (seen.has(frame.id)) continue;   // dedup-collapsed duplicate
    seen.add(frame.id);
    toIndex.push({ id: frame.id, content: turn.formattedContent });
  }
  const ingestMs = Date.now() - ingestStart;

  // Chunk the vector-index batch to avoid timeout issues on slow embedders.
  const indexStart = Date.now();
  for (let i = 0; i < toIndex.length; i += batchSize) {
    const slice = toIndex.slice(i, i + batchSize);
    await search.indexFramesBatch(slice);
  }
  const indexMs = Date.now() - indexStart;

  return { count: toIndex.length, ingestMs, indexMs };
}
