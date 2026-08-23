#!/usr/bin/env tsx
/** Cost-light smoke: build + print the belief block for a few conv-1 questions
 *  (detection LLM = gpt-5-mini only; no answer/judge). Validates imports, the
 *  rolled-back applyConsolidation transaction, and block well-formedness. */
import path from 'node:path';
import url from 'node:url';
import { createOllamaEmbedder } from '@waggle/core';
import { detectSupersessionChains, detectEntityGroups, applyConsolidation,
  type ConsolidationLlm, type Observation, type MemoryFrame } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { createBeamOpenAiClient } from '../src/beam-openai-client.js';

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const obsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs');
const beamChats = path.resolve(repoRoot, '..', 'BEAM', 'chats');

const ROLLBACK = Symbol('rb');
const detect = createBeamOpenAiClient({ model: 'gpt-5-mini' });
let cost = 0;
const llm: ConsolidationLlm = async (system, user) => {
  const r = await detect.chat({ system, user, jsonMode: true, maxTokens: 1200 });
  cost += r.costUsd;
  return r.text;
};

async function main(): Promise<void> {
  const conv = 1;
  const embedder = createOllamaEmbedder();
  const obsSub = createSubstrate({ dbPath: path.join(obsDir, `beam_1M_${conv}.mind`), embedder });
  // pull a few probing questions likely to have chains/groups
  const pq = JSON.parse((await import('node:fs')).readFileSync(
    path.join(beamChats, '1M', String(conv), 'probing_questions', 'probing_questions.json'), 'utf-8')) as Record<string, { question: string }[]>;
  const picks: { ability: string; question: string }[] = [];
  for (const ab of ['knowledge_update', 'contradiction_resolution', 'multi_session_reasoning']) {
    if (pq[ab]?.[0]) picks.push({ ability: ab, question: pq[ab][0].question });
  }
  try {
    for (const p of picks) {
      const results = await obsSub.search.search(p.question, { limit: 60, gopId: `beam_${conv}` });
      const obs: Observation[] = results.map(r => ({ id: r.frame.id, content: r.frame.content, created_at: String(r.frame.created_at ?? '') }));
      const [chains, groups] = await Promise.all([detectSupersessionChains(obs, llm), detectEntityGroups(obs, llm)]);
      const raw = obsSub.db.getDatabase();
      let pframes: MemoryFrame[] = []; let bframes: MemoryFrame[] = [];
      try { raw.transaction(() => { const res = applyConsolidation(obsSub.frames, chains, groups, `beam_${conv}`); pframes = res.pframes; bframes = res.bframes; throw ROLLBACK; })(); }
      catch (e) { if (e !== ROLLBACK) throw e; }
      console.log('\n════════', p.ability, '════════');
      console.log('Q:', p.question);
      console.log(`retrieved=${results.length} chains=${chains.length} groups=${groups.length} pframes=${pframes.length} bframes=${bframes.length}`);
      console.log('--- P-frames (current values) ---');
      for (const f of pframes) console.log('  ' + f.content);
      console.log('--- B-frames (enumerable sets) ---');
      for (const f of bframes) console.log('  ' + f.content);
    }
  } finally {
    obsSub.close();
  }
  console.log(`\ndetect cost=$${cost.toFixed(4)}`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
