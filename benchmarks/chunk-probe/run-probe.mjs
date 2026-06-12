/**
 * D1 chunk-lane eval probe — long-frame needle retrieval (2026-06-12).
 *
 * PRE-REGISTERED DESIGN (before any run):
 *  - LoCoMo was REJECTED as the ruler: its frames max at ~1000 chars, below
 *    the 2000-char chunk threshold — every frame yields one chunk ≡ the whole
 *    frame, so a LoCoMo A/B measures noise by construction.
 *  - Honest corpus: a COPY of the real production personal mind
 *    (~/.hive-mind/personal.mind: 471 frames, 129 >2k chars, max 25.7k).
 *  - Both cells re-embedded from scratch with the SAME local embedder
 *    (Ollama nomic-embed-text-8k, 1024-dim) — the original mind's vectors are
 *    mock-fingerprinted and unusable; equal footing by construction.
 *  - Needle = a verbatim sentence drawn from the 50–90% depth of a long frame
 *    (where whole-frame embedding signal dilutes). Verbatim is fair: vector
 *    lanes never touch FTS, and both cells get the identical query.
 *  - Cell A (control):  HybridSearch.vectorSearch (whole-frame vectors)
 *  - Cell B (treatment): HybridSearch.vectorSearchChunks (chunk vectors,
 *    best-chunk-per-frame) — called directly; no env flag needed.
 *  - Metric: hit@1 / hit@5 / hit@10 of the source frame, paired per needle.
 *  - Decision rule (pre-registered): flip default-ON only if chunk hit@5
 *    beats whole-frame hit@5 by a clear margin (paired; report exact counts).
 *
 * Run: node benchmarks/chunk-probe/run-probe.mjs   (from waggle-os-w4 root)
 * Requires: Ollama up with nomic-embed-text-8k; hive-mind-core dist built.
 * Cost: $0 (all local). The source mind is NEVER touched (sqlite backup API).
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = pathToFileURL(path.join(ROOT, 'packages/hive-mind-core/dist/index.js')).href;
const SOURCE_MIND = 'C:/Users/MarkoMarkovic/.hive-mind/personal.mind';
const PROBE_DIR = path.join(ROOT, 'benchmarks/chunk-probe/data');
const PROBE_MIND = path.join(PROBE_DIR, 'probe.mind');

const MIN_FRAME_LEN = 2500;   // only frames where chunking can matter
const MAX_NEEDLES = 60;
const K = 10;

const { MindDB, HybridSearch, createOllamaEmbedder, rechunkAllFrames } = await import(CORE);

// ── 1. Copy the mind (sqlite backup API — consistent snapshot, source untouched)
fs.mkdirSync(PROBE_DIR, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  const p = PROBE_MIND + suffix;
  if (fs.existsSync(p)) fs.rmSync(p);
}
{
  const BetterSqlite3 = (await import(pathToFileURL(path.join(ROOT, 'node_modules/better-sqlite3/lib/index.js')).href)).default;
  const src = new BetterSqlite3(SOURCE_MIND, { readonly: true });
  await src.backup(PROBE_MIND);
  src.close();
}
console.log('[probe] mind copied to', PROBE_MIND);

// ── 2. Open with mono substrate + real local embedder
const db = new MindDB(PROBE_MIND);
const embedder = createOllamaEmbedder({ model: 'nomic-embed-text-8k', targetDimensions: 1024 });
const search = new HybridSearch(db, embedder);

// ── 3. Wipe mock vectors, re-embed all frames (whole-frame control vectors)
db.recreateVecTables(1024);
const raw = db.getDatabase();
const frames = raw.prepare('SELECT id, content FROM memory_frames ORDER BY id').all();
console.log(`[probe] re-embedding ${frames.length} frames (whole-frame vectors)…`);
const BATCH = 16;
for (let i = 0; i < frames.length; i += BATCH) {
  // Cap at 4,000 chars. LIVE FINDING: the '-8k' model's underlying nomic-bert
  // architecture caps at 2048 TOKENS (ollama show: nomic-bert.context_length
  // 2048) and Ollama enforces it — R5's maxEmbedCharsForModel trusts the
  // model NAME (24k chars) and would 400, then per-text-fallback every long
  // frame to a MOCK vector in production. Whole-frame embedding beyond the
  // real cap is impossible — that blindness is what the chunk lane (≤2k
  // chars ≈ 500 tokens) structurally fixes.
  const batch = frames.slice(i, i + BATCH).map(f => ({ id: f.id, content: f.content.slice(0, 4_000) }));
  await search.indexFramesBatch(batch);
  if ((i / BATCH) % 5 === 0) process.stdout.write(`  ${Math.min(i + BATCH, frames.length)}/${frames.length}\r`);
}
console.log(`\n[probe] whole-frame vectors: ${raw.prepare('SELECT COUNT(*) n FROM memory_frames_vec').get().n}`);

// ── 4. Chunk backfill (treatment vectors; flag-independent helper)
const rechunk = await rechunkAllFrames(db, search);
console.log('[probe] rechunk:', JSON.stringify(rechunk));
const chunkStats = raw.prepare(
  `SELECT COUNT(*) chunks, SUM(cnt > 1) multi FROM (
     SELECT frame_id, COUNT(*) cnt FROM memory_frame_chunks GROUP BY frame_id)`
).get();
console.log(`[probe] chunks: ${chunkStats.chunks} total, ${chunkStats.multi} frames with >1 chunk`);

// ── 5. Needle extraction: verbatim sentence from 50–90% depth of long frames
function extractNeedle(content) {
  const start = Math.floor(content.length * 0.5);
  const end = Math.floor(content.length * 0.9);
  const slice = content.slice(start, end);
  const sentences = slice.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim());
  const candidates = sentences.filter(s => s.length >= 80 && s.length <= 250 && s.split(/\s+/).length >= 10);
  if (candidates.length === 0) return null;
  // deterministic pick: the longest candidate (most distinctive)
  return candidates.sort((a, b) => b.length - a.length)[0];
}
const longFrames = frames.filter(f => f.content.length >= MIN_FRAME_LEN);
const needles = [];
for (const f of longFrames) {
  const n = extractNeedle(f.content);
  // beyondCap: needle text starts past the 8k whole-frame embed cap — content
  // structurally invisible to the whole-frame vector (chunking's strongest case).
  if (n) needles.push({ frameId: f.id, needle: n, frameLen: f.content.length, beyondCap: f.content.indexOf(n) >= 4_000 });
  if (needles.length >= MAX_NEEDLES) break;
}
console.log(`[probe] ${needles.length} needles from ${longFrames.length} long frames (>=${MIN_FRAME_LEN} chars)`);

// ── 6. Paired cells
let stats = { a1: 0, a5: 0, a10: 0, b1: 0, b5: 0, b10: 0, bOnly5: 0, aOnly5: 0 };
let strat = { withinCap: { n: 0, a5: 0, b5: 0 }, beyondCap: { n: 0, a5: 0, b5: 0 } };
const rows = [];
for (const { frameId, needle, frameLen, beyondCap } of needles) {
  const a = await search.vectorSearch(needle, K);
  const b = (await search.vectorSearchChunks(needle, K)) ?? [];
  const ra = a.indexOf(frameId);
  const rb = b.indexOf(frameId);
  if (ra === 0) stats.a1++; if (ra >= 0 && ra < 5) stats.a5++; if (ra >= 0) stats.a10++;
  if (rb === 0) stats.b1++; if (rb >= 0 && rb < 5) stats.b5++; if (rb >= 0) stats.b10++;
  const aHit5 = ra >= 0 && ra < 5, bHit5 = rb >= 0 && rb < 5;
  if (bHit5 && !aHit5) stats.bOnly5++;
  if (aHit5 && !bHit5) stats.aOnly5++;
  const s = beyondCap ? strat.beyondCap : strat.withinCap;
  s.n++; if (aHit5) s.a5++; if (bHit5) s.b5++;
  rows.push({ frameId, frameLen, beyondCap, rankWhole: ra, rankChunk: rb, needle: needle.slice(0, 80) });
}

// ── 7. Report
const n = needles.length;
console.log('\n========== D1 CHUNK-LANE PROBE RESULT ==========');
console.log(`corpus: copy of personal.mind | needles: ${n} | embedder: nomic-embed-text-8k/1024`);
console.log(`            hit@1        hit@5        hit@10`);
console.log(`whole-frame ${stats.a1}/${n}        ${stats.a5}/${n}        ${stats.a10}/${n}`);
console.log(`chunk-lane  ${stats.b1}/${n}        ${stats.b5}/${n}        ${stats.b10}/${n}`);
console.log(`paired hit@5: chunk-only wins ${stats.bOnly5}, whole-only wins ${stats.aOnly5} (discordant pairs)`);
console.log(`strata hit@5: within-cap n=${strat.withinCap.n} whole ${strat.withinCap.a5} vs chunk ${strat.withinCap.b5}` +
  ` | beyond-cap n=${strat.beyondCap.n} whole ${strat.beyondCap.a5} vs chunk ${strat.beyondCap.b5}`);
fs.writeFileSync(path.join(PROBE_DIR, 'probe-result.json'), JSON.stringify({ n, stats, rows }, null, 2));
console.log('[probe] per-needle detail → benchmarks/chunk-probe/data/probe-result.json');
db.close();
