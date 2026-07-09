#!/usr/bin/env tsx
/**
 * THROWAWAY probe for the hybrid cell merge/sort. conv 1, first question.
 * Prints the first 8 merged display lines and checks:
 *   (a) both raw "user:/assistant:" lines AND bare facts appear,
 *   (b) every printed line has a single [YYYY-MM-DD] prefix,
 *   (c) lines are in ascending date order.
 * No LLM spend — retrieval is local ollama only.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { createOllamaEmbedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { buildConvDateMap } from '../src/beam-date-map.js';
import { mergeHybrid } from '../src/beam-hybrid.js';

const CONV = 1;
const K_RAW = 15;
const K_FACT = 60;

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const beamChats = path.resolve(repoRoot, '..', 'BEAM', 'chats');
const rawMind = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M', `beam_1M_${CONV}.mind`);
const obsMind = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs', `beam_1M_${CONV}.mind`);
const chatJson = path.join(beamChats, '1M', String(CONV), 'chat.json');
const pqPath = path.join(beamChats, '1M', String(CONV), 'probing_questions', 'probing_questions.json');

function firstQuestion(): string {
  const data = JSON.parse(fs.readFileSync(pqPath, 'utf-8')) as Record<string, Array<Record<string, unknown>>>;
  for (const arr of Object.values(data)) {
    if (Array.isArray(arr)) for (const pq of arr) if (typeof pq.question === 'string' && pq.question) return pq.question;
  }
  throw new Error('no question found');
}

const DATE_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s/;

async function main(): Promise<void> {
  const question = firstQuestion();
  console.log(`conv ${CONV} question: ${question}\n`);

  const embedder = createOllamaEmbedder();
  const rawSub = createSubstrate({ dbPath: rawMind, embedder });
  const obsSub = createSubstrate({ dbPath: obsMind, embedder });
  try {
    const dateMap = buildConvDateMap(chatJson);
    const rawResults = await rawSub.search.search(question, { limit: K_RAW, gopId: `beam_${CONV}` });
    const factResults = await obsSub.search.search(question, { limit: K_FACT, gopId: `beam_${CONV}` });
    const merged = mergeHybrid(rawResults, factResults, dateMap);

    const clip = (l: string): string => (l.length > 150 ? l.slice(0, 150) + '…' : l);
    const top8 = merged.displayStrings.slice(0, 8);
    console.log('── first 8 merged display lines ──');
    top8.forEach((l, i) => console.log(`${String(i + 1).padStart(2)}. [${merged.entries[i].kind}] ${clip(l)}`));

    // Surface the first raw + first fact entry (with merged index) so BOTH kinds
    // are visibly dated + single-bracketed even when the top-8 is one-sided.
    const firstRawIdx = merged.entries.findIndex(e => e.kind === 'raw');
    const firstFactIdx = merged.entries.findIndex(e => e.kind === 'fact');
    console.log('\n── first raw turn + first fact in the merged list ──');
    if (firstRawIdx >= 0) console.log(`#${firstRawIdx + 1} [raw]  ${clip(merged.displayStrings[firstRawIdx])}`);
    if (firstFactIdx >= 0) console.log(`#${firstFactIdx + 1} [fact] ${clip(merged.displayStrings[firstFactIdx])}`);

    // Which kinds land in the top 8?
    const top8Kinds = merged.entries.slice(0, 8).map(e => e.kind);
    const hasRaw = merged.entries.some(e => e.kind === 'raw' && (e.text.startsWith('user:') || e.text.startsWith('assistant:')));
    const hasFact = merged.entries.some(e => e.kind === 'fact');

    // (b) single [date] prefix on every printed line.
    const allDated = top8.every(l => DATE_RE.test(l));
    // (c) ascending date order across ALL entries.
    const dates = merged.entries.map(e => e.date);
    let ascending = true;
    for (let i = 1; i < dates.length; i++) if (dates[i] < dates[i - 1]) { ascending = false; break; }

    console.log('\n── checks ──');
    console.log(`retrieved: raw=${rawResults.length} facts=${factResults.length} merged=${merged.entries.length}`);
    console.log(`raw-date hit-rate: ${merged.rawTotal ? ((100 * merged.rawDated) / merged.rawTotal).toFixed(1) + '%' : 'n/a'} (${merged.rawDated}/${merged.rawTotal})`);
    console.log(`top8 kinds: ${top8Kinds.join(',')}`);
    console.log(`(a) both raw turns AND bare facts present overall: ${hasRaw && hasFact} (raw=${hasRaw}, fact=${hasFact})`);
    console.log(`(b) every top-8 line has a single [YYYY-MM-DD] prefix: ${allDated}`);
    console.log(`(c) all ${dates.length} merged entries ascending by date: ${ascending}`);
  } finally {
    rawSub.close();
    obsSub.close();
  }
}

main().catch(err => { console.error('[_probe-hybrid] FATAL:', err); process.exit(1); });
