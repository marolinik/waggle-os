#!/usr/bin/env tsx
/**
 * P1 — Evidence Ledger builder (E6). Per BEAM 1M conversation, re-distill the
 * WHOLE raw chat.json into an exhaustive, DATED, QUOTE-GROUNDED evidence ledger.
 *
 * WHY (see BEAM-PARADOX-DEEP-DIVE): the entire 18pp gap to Eywa sits in 4
 * whole-history STATE abilities (abstention / contradiction / event_ordering /
 * temporal). Top-k retrieval covers <3% of a 1M-token conversation, so no
 * excerpt can answer them. The fix is a complete DERIVED store, in Eywa's record
 * format: each line carries a DATE + a VERBATIM SOURCE QUOTE (anti-lossiness —
 * the prior minds-1M-obs distillation stripped dates/numbers and collapsed
 * temporal 0.60→0.15). We rebuild from scratch; we do NOT reuse minds-1M-obs.
 *
 * UNIT: a "session" = a contiguous same-date block (BEAM anchors each session's
 * opening main_question with a time_anchor that propagates forward — identical
 * semantics to src/beam-date-map.ts::buildConvDateMap). Each session (~100K tok)
 * is chunked into small message windows for EXHAUSTIVE extraction; every chunk
 * inherits the session date. Both USER and ASSISTANT messages are mined (known
 * gate facts such as the DeepL/Google pricing live in assistant turns).
 *
 * LINE FORMAT (one atomic fact per line, date-ordered):
 *   [YYYY-MM-DD] <fact> ("<verbatim source quote, <=25 words>") {entity1; entity2}
 *
 * RESUMABLE: per-chunk cache (data/beam/ledgers-1M/.cache/) + per-conv
 * .done.json. Rerun with --resume skips finished convs; cached chunks are reused
 * even for an unfinished conv. --budget hard-caps spend.
 *
 * Usage:
 *   tsx scripts/beam-build-ledger.ts --convs 1 --budget 5          # P1 gate: conv 1 first
 *   tsx scripts/beam-build-ledger.ts --convs 1,10,11 --budget 12   # pilot set
 *   tsx scripts/beam-build-ledger.ts --convs 1-35 --budget 30 --resume  # full
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createBeamOpenAiClient, BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { normalizeTimeAnchor } from '../src/beam-date-map.js';

// ── paths ────────────────────────────────────────────────────────────────────
const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..'); // waggle-os
const BEAM_CHATS = path.resolve(repoRoot, '..', 'BEAM', 'chats');
const OUT_DIR = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'ledgers-1M');
const CACHE_DIR = path.join(OUT_DIR, '.cache');

// ── args ─────────────────────────────────────────────────────────────────────
interface Args { convs: number[]; budget: number; resume: boolean; model: string; chunkMsgs: number; concurrency: number; }

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
  const a: Args = { convs: parseConvSpec('1-35'), budget: 45, resume: false, model: 'gpt-5-mini', chunkMsgs: 20, concurrency: 10 };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--budget' && next) { a.budget = parseFloat(next); i++; }
    else if (f === '--resume') { a.resume = true; }
    else if (f === '--model' && next) { a.model = next; i++; }
    else if (f === '--chunk-msgs' && next) { a.chunkMsgs = parseInt(next, 10); i++; }
    else if (f === '--concurrency' && next) { a.concurrency = parseInt(next, 10); i++; }
  }
  return a;
}

// ── session extraction from chat.json (mirrors buildConvDateMap propagation) ──
interface Msg { role: string; content: string; }
interface Session { date: string; messages: Msg[]; }
interface RawMsg { role?: string; content?: string; time_anchor?: string }
interface RawBatch { turns?: RawMsg[][]; time_anchor?: string }

function loadSessions(conv: number): Session[] {
  const p = path.join(BEAM_CHATS, '1M', String(conv), 'chat.json');
  const batches = JSON.parse(fs.readFileSync(p, 'utf-8')) as RawBatch[];
  let current: string | null = null;
  const sessions: Session[] = [];
  let cur: Session | null = null;
  for (const batch of batches) {
    const bd = normalizeTimeAnchor(batch.time_anchor);
    if (bd) current = bd;
    if (!Array.isArray(batch.turns)) continue;
    for (const group of batch.turns) {
      if (!Array.isArray(group)) continue;
      for (const m of group) {
        const role = String(m.role ?? 'unknown').toLowerCase();
        const content = String(m.content ?? '').trim();
        const md = normalizeTimeAnchor(m.time_anchor);
        if (md) current = md;
        if (!content || current === null) continue;
        if (!cur || cur.date !== current) { cur = { date: current, messages: [] }; sessions.push(cur); }
        cur.messages.push({ role, content });
      }
    }
  }
  return sessions;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── extraction prompt ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT =
  'You are a meticulous memory-extraction system. You convert a dated slice of a ' +
  'conversation between a user and an AI assistant into an exhaustive list of atomic ' +
  'evidence facts. You never summarize away detail and you never invent anything.';

function buildExtractionPrompt(date: string, msgs: Msg[]): string {
  const slice = msgs.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
  return `The following is a slice of a conversation that took place on ${date}. Distill it into an evidence ledger: one line per SUBSTANTIVE fact.

STRICT OUTPUT FORMAT — one fact per line, and NOTHING else:
[${date}] <the fact, self-contained and specific> ("<verbatim quote copied EXACTLY from the slice, <=25 words>") {entity1; entity2}

RULES:
1. COMPLETE ON INFORMATION, not on sentences. Capture every distinct piece of information that could later be asked about: user decisions, preferences, goals, plans, and instructions; every stated tool, library, framework, version number, configuration value, port, price/cost, date, deadline, name, event, problem/error, and its outcome or resolution. Do NOT drop any fact that carries a number, version, date, price, name, or a decision.
2. CONSOLIDATE, do not fragment. Put ONE coherent claim on ONE line — fold a recommendation and its rationale, or a setting and its value, into a single line. Do NOT split a bulleted list or a single explanation into many fragment lines. Skip pure pleasantries, filler, restatements, and generic advice that carries no specific detail. Most 20-message slices distill to roughly 25-45 lines, not hundreds.
3. The parenthetical quote is MANDATORY on every line and must be copied VERBATIM (character-for-character) from a message in the slice, at most 25 words. It is the evidence anchor — never paraphrase it, never fabricate it. Quote the single most load-bearing <=25-word span (containing the key value/name/number when there is one).
4. Copy numbers, versions, dates, prices, filenames, ports, and identifiers EXACTLY as written in the slice — never round or normalize them.
5. Attribute the source. Start the fact with "User" or "Assistant" when the source matters (e.g., "User decided to use franc v6.1.0", "Assistant recommended running the backend on port 4000").
6. {entities}: the key named entities in the fact (technologies, projects, people, files, services, providers), semicolon-separated. Use {} if there are none.
7. If a value CHANGES within the slice (e.g., a version or decision is revised), emit one line for each stated value — do not collapse them.
8. Preserve the wording of every stated date ("on March 18", "next Tuesday", "in two weeks") inside the fact so downstream temporal reasoning has the raw reference.
9. Output ONLY the evidence lines. No headers, no numbering, no commentary, no blank lines, no markdown.

CONVERSATION SLICE (date ${date}):
${slice}`;
}

// ── line parsing / validation ─────────────────────────────────────────────────
const LINE_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s+(.*?)\s*\("([^"]*)"\)\s*(\{[^}]*\})?\s*$/;

function normWS(s: string): string { return s.replace(/\s+/g, ' ').trim().toLowerCase(); }

/** Verify the verbatim quote actually appears in the slice (anti-hallucination /
 *  anti-lossiness). Ellipsis-split spans each checked as substrings. */
function quoteInSlice(quote: string, sliceNorm: string): boolean {
  const parts = quote.split(/\.\.\.|…/).map(p => normWS(p)).filter(p => p.length >= 6);
  if (parts.length === 0) return normWS(quote).length > 0 && sliceNorm.includes(normWS(quote));
  return parts.every(p => sliceNorm.includes(p));
}

interface ChunkResult { lines: string[]; verified: number; total: number; costUsd: number; failure: string | null; }

async function extractChunk(client: BeamOpenAiClient, date: string, msgs: Msg[]): Promise<ChunkResult> {
  const prompt = buildExtractionPrompt(date, msgs);
  const r = await client.chat({ system: SYSTEM_PROMPT, user: prompt, maxTokens: 16384 });
  if (r.failureMode) return { lines: [], verified: 0, total: 0, costUsd: r.costUsd, failure: r.failureMode };
  const sliceNorm = normWS(msgs.map(m => m.content).join(' '));
  const lines: string[] = [];
  let verified = 0, total = 0;
  for (const rawLine of r.text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(LINE_RE);
    if (!m) continue; // drop malformed lines
    total++;
    const quote = m[3];
    const ok = quoteInSlice(quote, sliceNorm);
    if (ok) verified++;
    // normalize entity braces to {} when empty/missing
    const ent = m[4] && m[4] !== '{}' ? ` ${m[4]}` : '';
    lines.push(`[${m[1]}] ${m[2].trim()} ("${quote}")${ent}`);
  }
  return { lines, verified, total, costUsd: r.costUsd, failure: null };
}

// ── per-chunk cache ────────────────────────────────────────────────────────────
function cachePath(conv: number, si: number, ci: number): string {
  return path.join(CACHE_DIR, `conv${conv}_s${si}_c${ci}.json`);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  loadDotEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  // gpt-5-mini emits many output tokens per extraction chunk → the 60s default
  // timeout aborts mid-generation. Use a long timeout and reasoning_effort:low
  // (extraction is mechanical; hidden reasoning is wasted latency + $ here).
  // Any provider-prefixed model ("openai/*", "anthropic/*") is routed through
  // OpenRouter (the OpenAI-direct account's quota can be exhausted — 429
  // insufficient_quota). Bare model names keep the OpenAI-direct path unchanged.
  const client: BeamOpenAiClient = args.model.includes('/')
    ? (() => {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) throw new Error('OPENROUTER_API_KEY required for provider-routed models');
        const bare = args.model.replace(/^[^/]+\//, '');
        return new BeamOpenAiClient({
          model: args.model, apiKey: key, baseUrl: 'https://openrouter.ai/api/v1',
          pricing: OPENAI_PRICING[args.model] ?? OPENAI_PRICING[bare] ?? { inputPerMillion: 0.25, outputPerMillion: 2.0 },
          timeoutMs: 300_000, maxRetries: 2, reasoningEffort: 'minimal',
        });
      })()
    : createBeamOpenAiClient({
        model: args.model, pricing: OPENAI_PRICING[args.model],
        timeoutMs: 300_000, maxRetries: 2, reasoningEffort: 'minimal',
      });

  console.log(`[ledger] model=${args.model} chunkMsgs=${args.chunkMsgs} concurrency=${args.concurrency} budget=$${args.budget} convs=${args.convs.length}`);
  let totalCost = 0;

  for (const conv of args.convs) {
    const ledgerPath = path.join(OUT_DIR, `conv${conv}.ledger.txt`);
    const donePath = path.join(OUT_DIR, `conv${conv}.done.json`);
    if (args.resume && fs.existsSync(donePath) && fs.existsSync(ledgerPath)) {
      console.log(`[ledger] conv ${conv}: done (skip)`);
      continue;
    }
    const chatPath = path.join(BEAM_CHATS, '1M', String(conv), 'chat.json');
    if (!fs.existsSync(chatPath)) { console.warn(`[ledger] conv ${conv}: no chat.json (skip)`); continue; }

    const sessions = loadSessions(conv);
    // Build the flat list of (sessionIdx, chunkIdx, date, msgs) jobs.
    interface Job { si: number; ci: number; date: string; msgs: Msg[]; }
    const jobs: Job[] = [];
    sessions.forEach((s, si) => chunk(s.messages, args.chunkMsgs).forEach((c, ci) => jobs.push({ si, ci, date: s.date, msgs: c })));

    console.log(`[ledger] conv ${conv}: ${sessions.length} sessions, ${jobs.length} chunks → extracting...`);
    let convCost = 0, verifiedSum = 0, totalSum = 0, failures = 0;

    const results = await mapLimit(jobs, args.concurrency, async (job) => {
      const cp = cachePath(conv, job.si, job.ci);
      if (fs.existsSync(cp)) {
        try { return JSON.parse(fs.readFileSync(cp, 'utf-8')) as ChunkResult; } catch { /* re-extract */ }
      }
      if (totalCost + convCost >= args.budget) return { lines: [], verified: 0, total: 0, costUsd: 0, failure: 'budget' } as ChunkResult;
      const res = await extractChunk(client, job.date, job.msgs);
      convCost += res.costUsd;
      if (!res.failure) fs.writeFileSync(cp, JSON.stringify(res));
      return res;
    });

    // Assemble the ledger in job order (session-ordered, chunk-ordered → date-ordered).
    const allLines: string[] = [];
    for (const r of results) {
      allLines.push(...r.lines);
      verifiedSum += r.verified; totalSum += r.total;
      if (r.failure && r.failure !== 'budget') failures++;
    }
    if (totalCost + convCost >= args.budget && results.some(r => r.failure === 'budget')) {
      console.warn(`[ledger] conv ${conv}: BUDGET hit mid-conv — partial cache written, NOT marking done. Rerun with higher --budget --resume.`);
      totalCost += convCost;
      break;
    }
    // Chunk failures are NOT cached, so a rerun retries only them. Do not mark
    // done and do not overwrite an existing ledger with a partial one — leave the
    // prior good ledger (if any) untouched and let a rerun complete the conv.
    if (failures > 0) {
      console.warn(`[ledger] conv ${conv}: ${failures} chunk failures — NOT marking done; rerun to retry`);
      totalCost += convCost;
      continue;
    }

    fs.writeFileSync(ledgerPath, allLines.join('\n') + '\n');
    const approxTokens = Math.ceil((allLines.join('\n').length) / 4);
    const stats = {
      conv, sessions: sessions.length, chunks: jobs.length, messages: sessions.reduce((n, s) => n + s.messages.length, 0),
      lines: allLines.length, approx_tokens: approxTokens,
      quote_verified: totalSum ? +(verifiedSum / totalSum).toFixed(4) : 0,
      quote_verified_pct: totalSum ? +(100 * verifiedSum / totalSum).toFixed(1) : 0,
      chunk_failures: failures, cost_usd: +convCost.toFixed(4), model: args.model,
    };
    fs.writeFileSync(donePath, JSON.stringify(stats, null, 2));
    totalCost += convCost;
    console.log(`[ledger] conv ${conv}: ${allLines.length} lines, ~${approxTokens} tok, quote-verified ${stats.quote_verified_pct}% (${verifiedSum}/${totalSum}), ${failures} chunk-failures, $${convCost.toFixed(3)} | running $${totalCost.toFixed(2)}`);
    if (totalCost >= args.budget) { console.warn(`[ledger] budget $${args.budget} reached — stopping.`); break; }
  }
  console.log(`[ledger] DONE. total spend $${totalCost.toFixed(3)}`);
}

main().catch(e => { console.error('[beam-build-ledger] FATAL:', e); process.exit(1); });
