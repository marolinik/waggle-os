#!/usr/bin/env tsx
/**
 * BEAM 1M — resumable per-conversation substrate ingest (mind-per-conv).
 *
 * DESIGN (per build-phase brief):
 *   - One persistent .mind file PER conversation → no cross-conversation lock
 *     contention, so N conversations can ingest concurrently.
 *   - RESUMABLE: a `<mind>.done.json` marker is written only after a
 *     conversation fully ingests + indexes. On restart, conversations with a
 *     valid marker are skipped; a .mind file WITHOUT a marker (crash mid-ingest)
 *     is deleted and rebuilt from scratch. This mirrors LongMemEval's
 *     skip-if-complete minds cache.
 *   - Reads turns directly from the BEAM repo's per-conversation chat.json
 *     (~4 MB each), NOT the 3 GB canonical — `extractTurnsFromBeam` does a
 *     readFileSync that would blow V8's string limit on the 1M archive.
 *
 * The gop_id written per frame is `beam_<convId>`, matching the
 * `conversation_id` on every canonical instance — so the answer cells scope to
 * the right conversation without any change to their gopId filter.
 *
 * Embedding: local Ollama `nomic-embed-text` (1024-dim) — free, no API spend.
 * The embedder has a fixed 30 s per-request timeout, so the index batch size is
 * kept modest (default 48) to avoid timing out on long turns.
 *
 * Progress: one stdout line per conversation start/finish, plus a marker file
 * per completed conversation and an appended progress log — all monitorable
 * from the filesystem while this runs in the background.
 *
 * Usage:
 *   tsx benchmarks/harness/scripts/beam-ingest-1m.ts \
 *     [--convs 1-35] [--concurrency 1] [--batch-size 48] \
 *     [--beam-chats D:/Projects/BEAM/chats] [--minds-dir <path>] [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createOllamaEmbedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { ingestBeamCorpus } from '../src/ingest-beam.js';
import type { BeamTurn } from '../src/ingest-beam.js';

const CHAT_SIZE = '1M';
const CHAT_SIZE_DIR = '1M';

interface Args {
  convs: number[];
  concurrency: number;
  batchSize: number;
  beamChats: string;
  mindsDir: string;
  force: boolean;
}

function parseConvSpec(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      for (let i = a; i <= b; i++) out.add(i);
    } else if (/^\d+$/.test(part.trim())) {
      out.add(parseInt(part.trim(), 10));
    }
  }
  return [...out].sort((a, b) => a - b);
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  let convs = parseConvSpec('1-35');
  let concurrency = 1;
  let batchSize = 48;
  let beamChats = path.resolve(repoRoot, '..', 'BEAM', 'chats');
  let mindsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M');
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    const next = argv[i + 1];
    if (f === '--convs' && next) { convs = parseConvSpec(next); i++; }
    else if (f === '--concurrency' && next) { concurrency = Math.max(1, parseInt(next, 10)); i++; }
    else if (f === '--batch-size' && next) { batchSize = Math.max(1, parseInt(next, 10)); i++; }
    else if (f === '--beam-chats' && next) { beamChats = path.resolve(next); i++; }
    else if (f === '--minds-dir' && next) { mindsDir = path.resolve(next); i++; }
    else if (f === '--force') { force = true; }
  }
  return { convs, concurrency, batchSize, beamChats, mindsDir, force };
}

interface RawMsg { role?: string; content?: string }
interface RawBatch { turns?: RawMsg[][] }

/**
 * Flatten a BEAM chat.json into ordered {role, content} messages.
 * Replicates build-beam-canonical.ts::flattenBeamTurns EXACTLY (batches →
 * turn-groups → messages, non-empty content only) so the ingested frames match
 * the canonical's conversation turns.
 */
function flattenChatJson(chatJsonPath: string): Array<{ role: string; content: string }> {
  const batches = JSON.parse(fs.readFileSync(chatJsonPath, 'utf-8')) as RawBatch[];
  const out: Array<{ role: string; content: string }> = [];
  for (const batch of batches) {
    if (!Array.isArray(batch.turns)) continue;
    for (const group of batch.turns) {
      if (!Array.isArray(group)) continue;
      for (const msg of group) {
        const role = String(msg.role ?? 'unknown').toLowerCase();
        const content = String(msg.content ?? '').trim();
        if (content) out.push({ role, content });
      }
    }
  }
  return out;
}

interface IngestMarker {
  conv: number;
  gop_id: string;
  chat_size: string;
  frames: number;
  turns_seen: number;
  ingest_ms: number;
  index_ms: number;
  batch_size: number;
  embedder_model: string;
  embedder_dims: number;
  built_at: string;
}

function markerPath(mindsDir: string, conv: number): string {
  return path.join(mindsDir, `beam_1M_${conv}.done.json`);
}
function mindPath(mindsDir: string, conv: number): string {
  return path.join(mindsDir, `beam_1M_${conv}.mind`);
}

function isComplete(mindsDir: string, conv: number): IngestMarker | null {
  const mp = markerPath(mindsDir, conv);
  if (!fs.existsSync(mp)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(mp, 'utf-8')) as IngestMarker;
    if (m && m.frames > 0 && fs.existsSync(mindPath(mindsDir, conv))) return m;
  } catch { /* fall through */ }
  return null;
}

function logProgress(mindsDir: string, line: string): void {
  const stamped = `${new Date().toISOString()} ${line}`;
  process.stdout.write(stamped + '\n');
  try {
    fs.appendFileSync(path.join(mindsDir, '_ingest-progress.log'), stamped + '\n');
  } catch { /* best-effort */ }
}

async function ingestOne(args: Args, conv: number): Promise<IngestMarker> {
  const gopId = `beam_${conv}`;
  const chatJsonPath = path.join(args.beamChats, CHAT_SIZE_DIR, String(conv), 'chat.json');
  if (!fs.existsSync(chatJsonPath)) {
    throw new Error(`chat.json not found for conv ${conv}: ${chatJsonPath}`);
  }

  // Clean any partial .mind left by a prior crash (no valid marker present).
  const mp = mindPath(args.mindsDir, conv);
  for (const suffix of ['', '-wal', '-shm']) {
    const f = mp + suffix;
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }

  const messages = flattenChatJson(chatJsonPath);
  const turns: BeamTurn[] = messages.map((m, i) => ({
    gopId,
    messageIndex: i,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
    formattedContent: `${m.role}: ${m.content}`,
    chatSize: CHAT_SIZE,
  }));

  logProgress(args.mindsDir, `[ingest][conv ${conv}] START turns=${turns.length} db=${path.basename(mp)}`);

  const embedder = createOllamaEmbedder();
  const substrate = createSubstrate({ dbPath: mp, embedder });
  try {
    const stats = await ingestBeamCorpus(
      substrate.db, substrate.search, substrate.frames, substrate.sessions,
      turns, { batchSize: args.batchSize },
    );
    const marker: IngestMarker = {
      conv,
      gop_id: gopId,
      chat_size: CHAT_SIZE,
      frames: stats.count,
      turns_seen: turns.length,
      ingest_ms: stats.ingestMs,
      index_ms: stats.indexMs,
      batch_size: args.batchSize,
      embedder_model: 'nomic-embed-text',
      embedder_dims: embedder.dimensions,
      built_at: new Date().toISOString(),
    };
    fs.writeFileSync(markerPath(args.mindsDir, conv), JSON.stringify(marker, null, 2) + '\n', 'utf-8');
    return marker;
  } finally {
    substrate.close();
  }
}

async function runPool(args: Args, convs: number[]): Promise<void> {
  let cursor = 0;
  let done = 0;
  const total = convs.length;
  const startAll = Date.now();

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= convs.length) return;
      const conv = convs[idx];
      const existing = args.force ? null : isComplete(args.mindsDir, conv);
      if (existing) {
        done++;
        logProgress(args.mindsDir, `[ingest][conv ${conv}] SKIP (already complete, frames=${existing.frames}) [${done}/${total}]`);
        continue;
      }
      const t0 = Date.now();
      try {
        const m = await ingestOne(args, conv);
        done++;
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const elapsedMin = ((Date.now() - startAll) / 60000).toFixed(1);
        const rate = done / ((Date.now() - startAll) / 60000);
        const etaMin = rate > 0 ? ((total - done) / rate).toFixed(1) : '?';
        logProgress(
          args.mindsDir,
          `[ingest][conv ${conv}] DONE frames=${m.frames} index_ms=${m.index_ms} took=${secs}s ` +
          `[${done}/${total}] elapsed=${elapsedMin}m eta=${etaMin}m`,
        );
      } catch (err) {
        logProgress(args.mindsDir, `[ingest][conv ${conv}] ERROR ${(err as Error).message}`);
        throw err;
      }
    }
  }

  const workers = Array.from({ length: Math.min(args.concurrency, convs.length) }, () => worker());
  await Promise.all(workers);
  const totalMin = ((Date.now() - startAll) / 60000).toFixed(1);
  logProgress(args.mindsDir, `[ingest] ALL DONE ${done}/${total} conversations in ${totalMin}m`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  fs.mkdirSync(args.mindsDir, { recursive: true });
  logProgress(
    args.mindsDir,
    `[ingest] start convs=${args.convs[0]}..${args.convs[args.convs.length - 1]} (n=${args.convs.length}) ` +
    `concurrency=${args.concurrency} batch=${args.batchSize} chats=${args.beamChats}`,
  );
  await runPool(args, args.convs);
}

main().catch(err => {
  console.error('[beam-ingest-1m] FATAL:', err);
  process.exit(1);
});
