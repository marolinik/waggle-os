#!/usr/bin/env tsx
/**
 * BEAM 1M — STANDING-DIRECTIVES extractor (the "personal mind / identity" lane).
 *
 * The three falsified levers (distilled-fact retrieval, additive hybrid,
 * outline preamble) all failed the same way: they COMPRESSED content, and BEAM
 * rewards verbatim detail. This lane does the opposite: it extracts a SMALL
 * set of durable, user-stated standing directives — explicit preferences,
 * standing instructions, dietary/format/tooling rules — kept near-verbatim
 * with their dates. 10-40 lines per conversation, not a summary of anything.
 *
 * Source: the distilled facts already in minds-1M-obs ("[YYYY-MM-DD] fact"),
 * batched through gpt-4o-mini with a strict KEEP-ONLY-DIRECTIVES filter, then
 * a final dedupe/merge pass per conversation. Output:
 *   benchmarks/data/beam/directives-1M/beam_1M_<conv>.json
 *   { conv, gop_id, directives: [{date, text}], built_at, cost_usd }
 *
 * RESUMABLE per conv (.done.json). No ollama dependency. ~$1 for all 35.
 *
 * Usage: npx tsx benchmarks/harness/scripts/beam-build-directives.ts [--convs 1-35] [--estimate]
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createSubstrate } from '../src/substrate.js';
import { createBeamOpenAiClient, loadDotEnv } from '../src/beam-openai-client.js';

const FILTER_SYSTEM =
  'You filter a list of dated facts about a USER. KEEP ONLY standing directives: ' +
  'explicit preferences ("prefers X", "dislikes Y", "favorite is Z"), standing instructions or rules the user ' +
  'gave the assistant ("always respond with...", "never suggest...", "call me..."), and durable personal ' +
  'constraints that shape future answers (dietary restrictions, accessibility needs, format/tooling/style rules). ' +
  'DISCARD everything else: events, one-off tasks, project status, possessions, plans, numbers that are not rules. ' +
  'Output the kept lines VERBATIM (including their [YYYY-MM-DD] prefix), one per line, no bullets, no preamble. ' +
  'If nothing qualifies, output nothing.';

const MERGE_SYSTEM =
  'You deduplicate a list of dated user directives (preferences / standing instructions). Merge duplicates and ' +
  'near-duplicates, KEEPING the most recent date for each distinct directive and its most specific wording. ' +
  'If two directives conflict, keep BOTH (they show a preference change; the reader uses the dates). ' +
  'Output one directive per line as "[YYYY-MM-DD] text", chronologically ordered, no preamble. Maximum 40 lines: ' +
  'if more, keep the most consequential.';

const FACT_DATE_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s*/;
const BATCH_CHARS = 12000;

function parseConvSpec(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.add(i); }
    else if (/^\d+$/.test(part.trim())) out.add(+part.trim());
  }
  return [...out].sort((a, b) => a - b);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  let convs = parseConvSpec('1-35');
  let estimate = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--convs' && argv[i + 1]) convs = parseConvSpec(argv[++i]);
    else if (argv[i] === '--estimate') estimate = true;
  }
  const obsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs');
  const outDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'directives-1M');
  fs.mkdirSync(outDir, { recursive: true });

  loadDotEnv();
  const client = estimate ? null : createBeamOpenAiClient({ model: 'gpt-4o-mini' });

  let totalCost = 0; let totalChars = 0; let totalBatches = 0;
  for (const conv of convs) {
    const outPath = path.join(outDir, `beam_1M_${conv}.json`);
    const donePath = path.join(outDir, `beam_1M_${conv}.done.json`);
    if (fs.existsSync(donePath) && fs.existsSync(outPath)) { console.log(`[directives][conv ${conv}] SKIP`); continue; }
    const mindPath = path.join(obsDir, `beam_1M_${conv}.mind`);
    if (!fs.existsSync(mindPath)) { console.error(`[directives][conv ${conv}] missing obs mind`); continue; }

    const substrate = createSubstrate({ dbPath: mindPath });
    let facts: string[];
    try {
      facts = substrate.frames.getGopFrames(`beam_${conv}`)
        .map(f => f.content)
        .filter(c => FACT_DATE_RE.test(c));
    } finally { substrate.close(); }

    // Batch the facts through the filter.
    const batches: string[] = [];
    let cur: string[] = []; let curLen = 0;
    for (const f of facts) {
      if (curLen + f.length > BATCH_CHARS && cur.length) { batches.push(cur.join('\n')); cur = []; curLen = 0; }
      cur.push(f); curLen += f.length + 1;
    }
    if (cur.length) batches.push(cur.join('\n'));
    totalChars += facts.reduce((a, b) => a + b.length, 0); totalBatches += batches.length;
    if (estimate) { console.log(`[directives][conv ${conv}] estimate: facts=${facts.length} batches=${batches.length}`); continue; }

    let convCost = 0; const kept: string[] = [];
    for (const b of batches) {
      const res = await client!.chat({ system: FILTER_SYSTEM, user: b, maxTokens: 700 });
      convCost += res.costUsd;
      for (const line of res.text.split('\n')) { const t = line.trim(); if (t && FACT_DATE_RE.test(t)) kept.push(t); }
    }
    // Merge/dedupe pass.
    let directives: Array<{ date: string; text: string }> = [];
    if (kept.length) {
      const res = await client!.chat({ system: MERGE_SYSTEM, user: kept.join('\n'), maxTokens: 1200 });
      convCost += res.costUsd;
      for (const line of res.text.split('\n')) {
        const m = line.trim().match(FACT_DATE_RE);
        if (m) directives.push({ date: m[1], text: line.trim().slice(m[0].length) });
      }
    }
    fs.writeFileSync(outPath, JSON.stringify({ conv, gop_id: `beam_${conv}`, directives, built_at: new Date().toISOString(), cost_usd: Math.round(convCost * 1e4) / 1e4 }, null, 2));
    fs.writeFileSync(donePath, JSON.stringify({ conv, directives: directives.length, cost_usd: convCost }));
    totalCost += convCost;
    console.log(`[directives][conv ${conv}] DONE raw-kept=${kept.length} merged=${directives.length} cost=$${convCost.toFixed(4)}`);
  }
  if (estimate) {
    const inTok = totalChars / 4;
    console.log(`\nESTIMATE: batches=${totalBatches} input≈${(inTok / 1e6).toFixed(2)}M tok → ≈ $${((inTok / 1e6) * 0.15 + (totalBatches * 300 / 1e6) * 0.6).toFixed(2)}`);
  } else console.log(`\nALL DONE. total=$${totalCost.toFixed(2)}`);
}

main().catch(err => { console.error('[beam-build-directives] FATAL:', err); process.exit(1); });
