#!/usr/bin/env tsx
/**
 * BEAM 1M — CONVERSATION OUTLINE builder (uniform coverage lever).
 *
 * For each conversation, read the distilled facts already in minds-1M-obs
 * (content "[YYYY-MM-DD] fact"), group them by session date, and compress each
 * date-group into a tight synopsis via gpt-4o-mini. The result is a small
 * "conversation timeline" (~10 sessions x ~10 bullets) that the answer prompt
 * can prepend to EVERY question — giving summarization / preference /
 * instruction / event_ordering the global coverage that top-k turn retrieval
 * lacks, without routing and without touching the retrieved-turn detail.
 *
 * No ollama dependency (no embedding). RESUMABLE: per-conv .done.json marker.
 * Output: benchmarks/data/beam/outlines-1M/beam_1M_<conv>.outline.json
 *   { conv, gop_id, sessions: [{date, synopsis}], built_at, cost_usd }
 *
 * Usage:
 *   npx tsx benchmarks/harness/scripts/beam-build-outlines.ts [--convs 1-35] [--estimate]
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createSubstrate } from '../src/substrate.js';
import { createBeamOpenAiClient, loadDotEnv } from '../src/beam-openai-client.js';

const OUTLINE_SYSTEM =
  'You compress a list of dated facts about a USER (extracted from one session of a long conversation) ' +
  'into a compact session synopsis. Output terse bullet lines, no preamble: 2-3 lines for sparse sessions ' +
  '(<30 facts), at most 8 for rich ones. ALWAYS include, when present: stated preferences and dislikes; ' +
  'standing instructions or rules the user gave; decisions made; key events (what happened); ' +
  'projects/topics worked on and their status; important numbers, names, versions. ' +
  'Be specific (keep names/numbers/versions verbatim). One fact per line, no blank lines.';

const FACT_DATE_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s*/;

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
    if (argv[i] === '--convs' && argv[i + 1]) { convs = parseConvSpec(argv[++i]); }
    else if (argv[i] === '--estimate') estimate = true;
  }
  const obsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs');
  const outDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'outlines-1M');
  fs.mkdirSync(outDir, { recursive: true });

  loadDotEnv();
  const client = estimate ? null : createBeamOpenAiClient({ model: 'gpt-4o-mini' });

  let totalCost = 0; let totalInChars = 0; let totalGroups = 0;
  for (const conv of convs) {
    const outPath = path.join(outDir, `beam_1M_${conv}.outline.json`);
    const donePath = path.join(outDir, `beam_1M_${conv}.done.json`);
    if (fs.existsSync(donePath) && fs.existsSync(outPath)) {
      console.log(`[outline][conv ${conv}] SKIP (done)`);
      continue;
    }
    const mindPath = path.join(obsDir, `beam_1M_${conv}.mind`);
    if (!fs.existsSync(mindPath)) { console.error(`[outline][conv ${conv}] missing obs mind, skipping`); continue; }

    // No embedder needed — we only read frames (default embedder object is
    // constructed but never called; no ollama traffic).
    const substrate = createSubstrate({ dbPath: mindPath });
    let byDate: Map<string, string[]>;
    try {
      const frames = substrate.frames.getGopFrames(`beam_${conv}`);
      byDate = new Map();
      for (const f of frames) {
        const m = f.content.match(FACT_DATE_RE);
        if (!m) continue;
        const list = byDate.get(m[1]) ?? [];
        list.push(f.content.slice(m[0].length));
        byDate.set(m[1], list);
      }
    } finally { substrate.close(); }

    const dates = [...byDate.keys()].sort();
    const sessions: Array<{ date: string; synopsis: string }> = [];
    let convCost = 0;
    for (const d of dates) {
      const facts = byDate.get(d)!;
      const input = facts.join('\n');
      totalInChars += input.length; totalGroups++;
      if (estimate) continue;
      const res = await client!.chat({
        system: OUTLINE_SYSTEM,
        user: `SESSION DATE: ${d}\nFACTS (${facts.length}):\n${input}`,
        maxTokens: 350,
      });
      convCost += res.costUsd;
      sessions.push({ date: d, synopsis: res.text.trim() });
    }
    if (!estimate) {
      fs.writeFileSync(outPath, JSON.stringify({ conv, gop_id: `beam_${conv}`, sessions, built_at: new Date().toISOString(), cost_usd: Math.round(convCost * 1e4) / 1e4 }, null, 2));
      fs.writeFileSync(donePath, JSON.stringify({ conv, sessions: sessions.length, cost_usd: convCost }));
      totalCost += convCost;
      console.log(`[outline][conv ${conv}] DONE sessions=${sessions.length} cost=$${convCost.toFixed(4)}`);
    } else {
      console.log(`[outline][conv ${conv}] estimate: dates=${dates.length} facts=${[...byDate.values()].reduce((a, b) => a + b.length, 0)}`);
    }
  }
  if (estimate) {
    const inTok = totalInChars / 4;
    console.log(`\nESTIMATE: groups=${totalGroups} input≈${(inTok / 1e6).toFixed(2)}M tok → gpt-4o-mini ≈ $${((inTok / 1e6) * 0.15 + (totalGroups * 350 / 1e6) * 0.6).toFixed(2)}`);
  } else {
    console.log(`\nALL DONE. total cost=$${totalCost.toFixed(2)}`);
  }
}

main().catch(err => { console.error('[beam-build-outlines] FATAL:', err); process.exit(1); });
