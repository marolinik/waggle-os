#!/usr/bin/env tsx
/**
 * BEAM 1M — write-time OBSERVATION DISTILLATION (mem0/Mastra/LongMemEval-style).
 *
 * Ported from D:\Projects\hive-mind\benchmarks\longmemeval\34-run-observations.mjs
 * (the pattern that added ~+10pp on LongMemEval). Instead of retrieving raw
 * conversation turns (~900 tok each), we distill each conversation into dense,
 * dated, atomic, pronoun-resolved facts (~35 tok each) with a windowed
 * gpt-4o-mini pass, and store those as `agent_inferred` frames in a SEPARATE
 * per-conversation mind cache (`minds-1M-obs/`). Answering then retrieves top-k
 * FACTS ≈ true mem0-parity semantics (~7K-tok prompts, cheap) with our
 * extraction quality — this is what lets a top-200 run cost ~$20 instead of
 * ~$470 while (hypothesis) lifting accuracy on the harder abilities.
 *
 * DISTILL_SYSTEM is the LongMemEval prompt verbatim. Windows are ~WIN chars of
 * dated turn text; BEAM carries per-MESSAGE `time_anchor` dates ("March-01-2024"),
 * carried forward so each window is tagged with its session date.
 *
 * RESUMABLE: per-conv `.done.json` marker in minds-1M-obs; skip-if-complete; a
 * partial (crashed) mind without a marker is rebuilt.
 *
 * COST-SAFE: `--estimate` builds windows only (NO gpt-4o-mini calls) and reports
 * window/token counts + a projected full-35 cost. Use it before any paid run.
 * Embedding of the resulting facts is local ollama (free).
 *
 * Usage:
 *   tsx benchmarks/harness/scripts/beam-distill-1m.ts --estimate            # free
 *   tsx benchmarks/harness/scripts/beam-distill-1m.ts --convs 1-35 [--win 8000] [--conc 6]
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createOllamaEmbedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { createBeamOpenAiClient, loadDotEnv } from '../src/beam-openai-client.js';
import type { BeamOpenAiClient } from '../src/beam-openai-client.js';

const DISTILL_SYSTEM =
  'You extract durable, atomic facts about the USER from a slice of their conversation with an assistant. ' +
  'Output one fact per line, each starting with "[YYYY-MM-DD] " using the date the fact/event pertains to ' +
  '(use the session date shown if no other date). Cover: preferences and dislikes, possessions/brands/tools, ' +
  'decisions, events (what happened, when), plans, personal attributes, relationships, numbers/quantities. ' +
  'Be specific and self-contained (resolve pronouns to the entity). Only facts grounded in the text. ' +
  'No preamble, no bullets, no blank lines. If nothing durable, output nothing.';

interface Args {
  convs: number[];
  win: number;
  conc: number;
  distillModel: string;
  beamChats: string;
  mindsDir: string;
  estimate: boolean;
  force: boolean;
  maxTokens: number;
}

function parseConvSpec(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.add(i); }
    else if (/^\d+$/.test(part.trim())) out.add(+part.trim());
  }
  return [...out].sort((a, b) => a - b);
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const a: Args = {
    convs: parseConvSpec('1-35'),
    win: 8000,
    conc: 6,
    distillModel: 'gpt-4o-mini',
    beamChats: path.resolve(repoRoot, '..', 'BEAM', 'chats'),
    mindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs'),
    estimate: false,
    force: false,
    maxTokens: 700,
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--win' && next) { a.win = parseInt(next, 10); i++; }
    else if (f === '--conc' && next) { a.conc = Math.max(1, parseInt(next, 10)); i++; }
    else if (f === '--distill-model' && next) { a.distillModel = next; i++; }
    else if (f === '--beam-chats' && next) { a.beamChats = path.resolve(next); i++; }
    else if (f === '--minds-dir' && next) { a.mindsDir = path.resolve(next); i++; }
    else if (f === '--estimate') { a.estimate = true; }
    else if (f === '--force') { a.force = true; }
  }
  return a;
}

// ── Dated turn flattening + windowing ────────────────────────────────────────

interface RawMsg { role?: string; content?: string; time_anchor?: string | null }
interface RawBatch { turns?: RawMsg[][] }

/** Parse BEAM's "March-01-2024" (or ISO) message time_anchor to YYYY-MM-DD. */
function normBeamDate(s?: string | null): string | null {
  if (!s) return null;
  const raw = String(s).trim();
  let t = Date.parse(raw);
  if (!Number.isFinite(t)) t = Date.parse(raw.replace(/-/g, ' '));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

interface DatedTurn { role: string; content: string; date: string | null }

function flattenDatedTurns(chatJsonPath: string): DatedTurn[] {
  const batches = JSON.parse(fs.readFileSync(chatJsonPath, 'utf-8')) as RawBatch[];
  const out: DatedTurn[] = [];
  let lastDate: string | null = null;
  for (const batch of batches) {
    if (!Array.isArray(batch.turns)) continue;
    for (const group of batch.turns) {
      if (!Array.isArray(group)) continue;
      for (const msg of group) {
        const d = normBeamDate(msg.time_anchor);
        if (d) lastDate = d;
        const content = String(msg.content ?? '').trim();
        if (content) out.push({ role: String(msg.role ?? 'unknown').toLowerCase(), content, date: lastDate });
      }
    }
  }
  return out;
}

interface Window { text: string; date: string | null }

function buildWindows(turns: DatedTurn[], win: number): Window[] {
  const out: Window[] = [];
  let cur = ''; let curDate: string | null = null;
  for (const t of turns) {
    const line = `${t.date ? `[${t.date}] ` : ''}${t.role}: ${t.content}\n`;
    if (cur.length + line.length > win && cur) { out.push({ text: cur, date: curDate }); cur = ''; }
    if (!cur) curDate = t.date;
    cur += line;
  }
  if (cur) out.push({ text: cur, date: curDate });
  return out;
}

function toIso(d: string | null): string | undefined {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function approxTokens(s: string): number { return Math.max(1, Math.ceil(s.length / 4)); }

// ── Marker helpers ───────────────────────────────────────────────────────────

interface DistillMarker {
  conv: number; gop_id: string; facts: number; windows: number;
  distill_ms: number; index_ms: number; cost_usd: number; win: number;
  distill_model: string; built_at: string;
}
function markerPath(dir: string, conv: number): string { return path.join(dir, `beam_1M_${conv}.done.json`); }
function mindPath(dir: string, conv: number): string { return path.join(dir, `beam_1M_${conv}.mind`); }
function isComplete(dir: string, conv: number): DistillMarker | null {
  const mp = markerPath(dir, conv);
  if (!fs.existsSync(mp)) return null;
  try { const m = JSON.parse(fs.readFileSync(mp, 'utf-8')) as DistillMarker; if (m && m.facts >= 0 && fs.existsSync(mindPath(dir, conv))) return m; } catch { /* */ }
  return null;
}
function logProgress(dir: string, line: string): void {
  const stamped = `${new Date().toISOString()} ${line}`;
  process.stdout.write(stamped + '\n');
  try { fs.appendFileSync(path.join(dir, '_distill-progress.log'), stamped + '\n'); } catch { /* */ }
}

// Poll the local ollama server until it answers /api/tags (or ~2min elapses).
// Called between index-batch retries so we resume only once the server is live.
async function waitForOllama(dir: string, conv: number): Promise<void> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const url = `${host.replace(/\/$/, '')}/api/tags`;
  for (let i = 0; i < 24; i++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(t);
      if (res.ok) return;
    } catch { /* server not up yet */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  logProgress(dir, `[distill][conv ${conv}] ollama still unresponsive after ~2min wait — retrying batch anyway`);
}

// ── Estimate mode (no gpt-4o-mini spend) ─────────────────────────────────────

function runEstimate(args: Args): void {
  let totalWindows = 0; let totalInputChars = 0; let convsSeen = 0;
  for (const conv of args.convs) {
    const cj = path.join(args.beamChats, '1M', String(conv), 'chat.json');
    if (!fs.existsSync(cj)) continue;
    const turns = flattenDatedTurns(cj);
    const wins = buildWindows(turns, args.win);
    totalWindows += wins.length;
    for (const w of wins) totalInputChars += w.text.length;
    convsSeen++;
  }
  const SYS_TOK = approxTokens(DISTILL_SYSTEM) + 20;
  const inputToks = Math.ceil(totalInputChars / 4) + totalWindows * SYS_TOK;
  const outToksEst = totalWindows * 350; // ~350 output tokens/window (facts)
  // gpt-4o-mini pricing.
  const IN = 0.15 / 1e6, OUT = 0.6 / 1e6;
  const cost = inputToks * IN + outToksEst * OUT;
  const scale = convsSeen > 0 ? 35 / convsSeen : 1;
  console.log('\n════════ DISTILL COST ESTIMATE (gpt-4o-mini) ════════');
  console.log(`convs measured:      ${convsSeen}  (window size ${args.win} chars)`);
  console.log(`windows:             ${totalWindows}  (~${(totalWindows / (convsSeen || 1)).toFixed(0)}/conv)`);
  console.log(`input tokens:        ${(inputToks / 1e6).toFixed(2)}M`);
  console.log(`est output tokens:   ${(outToksEst / 1e6).toFixed(2)}M (~350/window)`);
  console.log(`cost (measured ${convsSeen} conv): $${cost.toFixed(2)}`);
  console.log(`──────────────────────────────────────────────────`);
  console.log(`PROJECTED FULL 35:   $${(cost * scale).toFixed(2)}   windows≈${Math.round(totalWindows * scale)}`);
  console.log(`(embedding the facts is local ollama = free; distill is gpt-4o-mini only)`);
}

// ── Distill one conversation ─────────────────────────────────────────────────

interface FactRow { text: string; date: string | null }

async function distillWindows(client: BeamOpenAiClient, wins: Window[], now: string | null, conc: number, maxTokens: number): Promise<{ facts: FactRow[]; costUsd: number }> {
  const facts: FactRow[] = [];
  let costUsd = 0;
  for (let w = 0; w < wins.length; w += conc) {
    const batch = wins.slice(w, w + conc);
    const results = await Promise.all(batch.map(win =>
      client.chat({ system: DISTILL_SYSTEM, user: `Session date: ${win.date || now || 'unknown'}\n\n${win.text}`, maxTokens })
        .catch(() => ({ text: '', inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0, failureMode: 'error' })),
    ));
    results.forEach((r, bi) => {
      costUsd += r.costUsd;
      for (const line of r.text.split('\n')) {
        const s = line.trim();
        if (s.length > 8) {
          const m = s.match(/\[(\d{4}-\d{2}-\d{2})\]/);
          facts.push({ text: s, date: (m ? m[1] : null) ?? batch[bi].date ?? now });
        }
      }
    });
  }
  return { facts, costUsd };
}

async function distillOne(args: Args, client: BeamOpenAiClient, conv: number): Promise<DistillMarker> {
  const gopId = `beam_${conv}`;
  const cj = path.join(args.beamChats, '1M', String(conv), 'chat.json');
  if (!fs.existsSync(cj)) throw new Error(`chat.json not found: ${cj}`);

  const mp = mindPath(args.mindsDir, conv);
  for (const s of ['', '-wal', '-shm']) if (fs.existsSync(mp + s)) fs.rmSync(mp + s, { force: true });

  const turns = flattenDatedTurns(cj);
  const now = (() => { const ds = turns.map(t => t.date).filter(Boolean).sort() as string[]; return ds.length ? ds[ds.length - 1] : null; })();
  const wins = buildWindows(turns, args.win);
  logProgress(args.mindsDir, `[distill][conv ${conv}] START windows=${wins.length} turns=${turns.length}`);

  const tD = Date.now();
  const { facts, costUsd } = await distillWindows(client, wins, now, args.conc, args.maxTokens);
  const distillMs = Date.now() - tD;

  const embedder = createOllamaEmbedder();
  const substrate = createSubstrate({ dbPath: mp, embedder });
  let indexMs = 0;
  try {
    substrate.sessions.ensure(gopId, 'beam-obs', `BEAM obs ${gopId}`);
    const toIndex: Array<{ id: number; content: string }> = [];
    const seen = new Set<number>();
    for (const fct of facts) {
      const frame = substrate.frames.createIFrame(gopId, fct.text, 'important', 'agent_inferred', toIso(fct.date));
      if (seen.has(frame.id)) continue;
      seen.add(frame.id);
      toIndex.push({ id: frame.id, content: fct.text });
    }
    const tI = Date.now();
    for (let b = 0; b < toIndex.length; b += 200) {
      const batch = toIndex.slice(b, b + 200);
      // ollama periodically becomes unresponsive under sustained multi-hour load
      // (mid-embed AbortError, or a hard connect-timeout when the server stalls).
      // A resumable run must not die on either: wait for the server to come back,
      // then retry the batch. Up to 8 attempts, backoff to 60s (~4min window).
      for (let attempt = 1; ; attempt++) {
        try { await substrate.search.indexFramesBatch(batch); break; }
        catch (err) {
          if (attempt >= 8) throw err;
          const waitMs = Math.min(60000, 8000 * attempt);
          logProgress(args.mindsDir, `[distill][conv ${conv}] index batch @${b} failed (attempt ${attempt}/8): ${(err as Error).message} — waiting for ollama, retry in ${waitMs / 1000}s`);
          await new Promise(r => setTimeout(r, waitMs));
          await waitForOllama(args.mindsDir, conv);
        }
      }
    }
    indexMs = Date.now() - tI;

    const marker: DistillMarker = {
      conv, gop_id: gopId, facts: toIndex.length, windows: wins.length,
      distill_ms: distillMs, index_ms: indexMs, cost_usd: Math.round(costUsd * 1e4) / 1e4,
      win: args.win, distill_model: args.distillModel, built_at: new Date().toISOString(),
    };
    fs.writeFileSync(markerPath(args.mindsDir, conv), JSON.stringify(marker, null, 2) + '\n', 'utf-8');
    return marker;
  } finally {
    substrate.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.estimate) { runEstimate(args); return; }

  fs.mkdirSync(args.mindsDir, { recursive: true });
  loadDotEnv();
  const client = createBeamOpenAiClient({ model: args.distillModel });
  logProgress(args.mindsDir, `[distill] start convs=${args.convs[0]}..${args.convs[args.convs.length - 1]} (n=${args.convs.length}) win=${args.win} conc=${args.conc} model=${args.distillModel}`);

  let done = 0; let totalCost = 0; const total = args.convs.length; const t0 = Date.now();
  for (const conv of args.convs) {
    const existing = args.force ? null : isComplete(args.mindsDir, conv);
    if (existing) { done++; logProgress(args.mindsDir, `[distill][conv ${conv}] SKIP (facts=${existing.facts}) [${done}/${total}]`); continue; }
    const c0 = Date.now();
    const m = await distillOne(args, client, conv);
    totalCost += m.cost_usd; done++;
    const secs = ((Date.now() - c0) / 1000).toFixed(0);
    const rate = done / ((Date.now() - t0) / 60000);
    const eta = rate > 0 ? ((total - done) / rate).toFixed(1) : '?';
    logProgress(args.mindsDir, `[distill][conv ${conv}] DONE facts=${m.facts} windows=${m.windows} cost=$${m.cost_usd} took=${secs}s [${done}/${total}] cum=$${totalCost.toFixed(2)} eta=${eta}m`);
  }
  logProgress(args.mindsDir, `[distill] ALL DONE ${done}/${total} convs, total cost=$${totalCost.toFixed(2)} in ${((Date.now() - t0) / 60000).toFixed(1)}m`);
}

main().catch(err => { console.error('[beam-distill-1m] FATAL:', err); process.exit(1); });
