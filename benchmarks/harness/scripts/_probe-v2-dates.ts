#!/usr/bin/env tsx
/**
 * THROWAWAY probe (no OpenAI spend) — validates the v2 date-stamping wiring for
 * conv 1: builds the content→date map, measures coverage against the actual
 * ingested frames, retrieves top-30 for one question, renders v2 memories, and
 * prints the first 3 so the "[YYYY-MM-DD] role: ..." prefixes are visible.
 * Requires ollama up (query embedding). Safe to delete.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { createOllamaEmbedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { buildConvDateMap, renderMemories, computeDateHitRate } from '../src/beam-date-map.js';

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const conv = 1;
const gopId = `beam_${conv}`;
const mindPath = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M', `beam_1M_${conv}.mind`);
const beamChats = path.resolve(repoRoot, '..', 'BEAM', 'chats');
const chatJson = path.join(beamChats, '1M', String(conv), 'chat.json');
const pqPath = path.join(beamChats, '1M', String(conv), 'probing_questions', 'probing_questions.json');

function firstQuestion(): string {
  const d = JSON.parse(fs.readFileSync(pqPath, 'utf-8')) as Record<string, Array<{ question?: string }>>;
  const pref = d.contradiction_resolution ?? Object.values(d)[0];
  return pref?.[0]?.question ?? 'What backend and database was I using?';
}

async function main(): Promise<void> {
  const dateMap = buildConvDateMap(chatJson);
  console.log(`date map entries: ${dateMap.size}`);

  const embedder = createOllamaEmbedder();
  const substrate = createSubstrate({ dbPath: mindPath, embedder });
  try {
    const allContents = substrate.frames.getGopFrames(gopId).map(f => f.content);
    const { dated, total } = computeDateHitRate(allContents, dateMap);
    const pct = total ? (100 * dated) / total : 0;
    console.log(`hit-rate over ${total} frames: dated ${dated}/${total} (${pct.toFixed(2)}%)  ${pct > 90 ? 'PASS(>90%)' : 'FAIL(<=90%)'}`);

    const question = firstQuestion();
    console.log(`\nquestion: ${question}`);
    const results = await substrate.search.search(question, { limit: 30, gopId });
    const memories = [...results].sort((a, b) => a.frame.id - b.frame.id).map(r => r.frame.content);
    const v2 = renderMemories(memories, dateMap, 'v2');
    const withDate = v2.filter(m => /^\[\d{4}-\d{2}-\d{2}\] /.test(m)).length;
    console.log(`retrieved=${v2.length}  with-date-prefix=${withDate}`);
    console.log('first 3 v2 memories:');
    for (const m of v2.slice(0, 3)) console.log('  ' + m.slice(0, 160));
  } finally {
    substrate.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
