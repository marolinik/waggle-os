/**
 * Task 2.5 Stage 1 — LoCoMo turn-level ingest.
 *
 * Reads the raw LoCoMo archive (`benchmarks/data/locomo10.json` from the
 * snap-research/locomo repo) and produces a stream of atomic turn frames.
 * Each LoCoMo conversation is a `{speaker_a, speaker_b, session_N_date_time,
 * session_N: LocomoTurn[]}` object; we enumerate every `session_N` array,
 * flatten its turns, and emit one `{gopId, diaId, speaker, text, content}`
 * record per turn.
 *
 * GATE-S0 decision (2026-04-23, PM Marko Marković): granularity = frame-per-turn.
 * Rationale: frame-per-conversation (10 frames, via dedup collapse) degenerates
 * the retrieval cell into the full-context cell and kills the 4-cell ablation
 * signal. See sessions/2026-04-23-task25-s0-readiness.md §0.3 and the Stage 1
 * brief for the adjudication record.
 *
 * The ingest wrapper composes two primitives that already exist in
 * `@waggle/core`:
 *   - `FrameStore.createIFrame(gopId, content, importance, source)` — inserts
 *     one memory_frames row + auto-indexes FTS5.
 *   - `HybridSearch.indexFramesBatch([{id, content}])` — atomic batch vector
 *     index via `embedder.embedBatch(contents)`.
 *
 * No LLM calls. Ingest is offline and costs nothing (the embedder is local:
 * ollama-embedder for production runs, a deterministic fake for unit tests).
 */

import fs from 'node:fs';
import type { MindDB, HybridSearch, FrameStore, SessionStore } from '@waggle/core';

/** Raw LoCoMo turn shape from `benchmarks/data/locomo10.json`. Matches the
 *  snap-research/locomo schema. Optional fields (`img_url`, `blip_caption`,
 *  `query`) are ignored by the ingest — they don't carry text-level memory. */
export interface LocomoRawTurn {
  speaker: string;
  dia_id: string;
  text: string;
  img_url?: string[];
  blip_caption?: string;
  query?: string;
}

export interface LocomoRawConversation {
  speaker_a: string;
  speaker_b: string;
  [sessionKey: string]: string | LocomoRawTurn[];
}

export interface LocomoRawSample {
  sample_id: string;
  conversation: LocomoRawConversation;
  qa: unknown[];
}

/** Extracted turn, ready to be written as a frame. `content` is the string
 *  that lands in `memory_frames.content` and gets FTS5/vec-indexed. */
export interface LocomoTurn {
  /** Conversation identifier — becomes `memory_frames.gop_id`. */
  gopId: string;
  /** LoCoMo evidence id (`D<session>:<turn>`). Preserved for traceability. */
  diaId: string;
  speaker: string;
  text: string;
  /** Formatted `"{speaker}: {text}"` — the content that gets embedded. */
  content: string;
}

export interface IngestStats {
  /** Number of frames successfully created. */
  count: number;
  /** Wall-clock ms spent on `createIFrame` loop (includes FTS5 auto-index). */
  ingestMs: number;
  /** Wall-clock ms spent on `indexFramesBatch` (embedder + vec0 insert). */
  indexMs: number;
}

/**
 * Flatten a raw LoCoMo archive into an array of atomic turn records.
 *
 * One record per turn across every `session_N` array in every conversation.
 * Session order within a conversation is numeric ascending; turn order within
 * a session is preserved verbatim from the source. This matches the paper's
 * "1540 atomic frames across 10 LoCoMo conversations (~154 turns each)" claim
 * — the actual count may differ slightly from 1540 because the source file
 * can have variable turn counts per conversation.
 */
export function extractTurnsFromLocomoRaw(rawPath: string): LocomoTurn[] {
  if (!fs.existsSync(rawPath)) {
    throw new Error(
      `LoCoMo raw archive not found at ${rawPath}. Download with: ` +
      `curl -sL -o benchmarks/data/locomo10.json ` +
      `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json`,
    );
  }
  const raw = fs.readFileSync(rawPath, 'utf-8');
  let samples: LocomoRawSample[];
  try {
    samples = JSON.parse(raw) as LocomoRawSample[];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LoCoMo archive at ${rawPath} is not valid JSON: ${msg}`);
  }
  if (!Array.isArray(samples)) {
    throw new Error(`LoCoMo archive at ${rawPath} must be a JSON array of samples`);
  }

  const out: LocomoTurn[] = [];
  for (const sample of samples) {
    if (!sample?.sample_id || !sample.conversation) continue;
    const sessionKeys = Object.keys(sample.conversation)
      .filter(k => /^session_\d+$/.test(k))
      .sort((a, b) => parseSessionNumber(a) - parseSessionNumber(b));
    for (const key of sessionKeys) {
      const turns = sample.conversation[key];
      if (!Array.isArray(turns)) continue;
      for (const turn of turns) {
        if (!turn?.dia_id || typeof turn.text !== 'string' || !turn.speaker) continue;
        out.push({
          gopId: sample.sample_id,
          diaId: turn.dia_id,
          speaker: turn.speaker,
          text: turn.text,
          content: `${turn.speaker}: ${turn.text}`,
        });
      }
    }
  }
  return out;
}

function parseSessionNumber(key: string): number {
  const m = key.match(/^session_(\d+)$/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Ingest a turn stream into an ephemeral MindDB + HybridSearch pair.
 *
 * Each turn becomes one I-frame with `gop_id = turn.gopId`, `content =
 * turn.content`, `source = 'import'`, `importance = 'normal'`. After all
 * frames are created, a single `indexFramesBatch` call embeds them in one
 * sqlite-vec transaction. FTS5 indexing is handled automatically by
 * `createIFrame` via `indexFts`.
 *
 * Caller owns the MindDB + HybridSearch lifecycle (see `createSubstrate` in
 * `substrate.ts`). Dedup (via `FrameStore.findDuplicate(content)`) is
 * expected to be a no-op at turn granularity — two turns with byte-identical
 * `"{speaker}: {text}"` across conversations are vanishingly rare in LoCoMo.
 * When it does fire, the returned `count` reflects the deduplicated total so
 * the caller's vector-index batch stays in sync with the frame table.
 */
export async function ingestLoCoMoCorpus(
  db: MindDB,
  search: HybridSearch,
  frames: FrameStore,
  sessions: SessionStore,
  turns: LocomoTurn[],
): Promise<IngestStats> {
  void db;  // reserved for future per-db hooks; kept for signature symmetry
  const ingestStart = Date.now();
  const toIndex: Array<{ id: number; content: string }> = [];
  const seen = new Set<number>();
  // memory_frames.gop_id → sessions.gop_id is a FOREIGN KEY. Ensure one
  // session row per conversation exists BEFORE any createIFrame call fires.
  const ensuredGops = new Set<string>();
  for (const turn of turns) {
    if (!ensuredGops.has(turn.gopId)) {
      sessions.ensure(turn.gopId, 'locomo-benchmark', `LoCoMo conversation ${turn.gopId}`);
      ensuredGops.add(turn.gopId);
    }
    const frame = frames.createIFrame(turn.gopId, turn.content, 'normal', 'import');
    if (seen.has(frame.id)) continue;   // dedup-collapsed duplicate
    seen.add(frame.id);
    toIndex.push({ id: frame.id, content: turn.content });
  }
  const ingestMs = Date.now() - ingestStart;

  const indexStart = Date.now();
  await search.indexFramesBatch(toIndex);
  const indexMs = Date.now() - indexStart;

  return { count: toIndex.length, ingestMs, indexMs };
}
