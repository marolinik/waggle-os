#!/usr/bin/env tsx
/**
 * E2 — BEAM 2×2 store×prompt causal ablation on the contradiction ability.
 *
 * Isolates whether our +23pp BEAM contradiction win comes from (a) retaining raw
 * dated turns in the store, (b) the conflict-aware v2 answer prompt, or their
 * interaction. Four cells over the SAME 70 contradiction_resolution questions:
 *
 *   | cell | store                     | prompt              |
 *   | A    | raw dated turns (ours)    | conflict-aware v2   | published run (reused)
 *   | B    | raw dated turns (ours)    | incumbent-base (v1) | this script
 *   | C    | reconciled current-only   | conflict-aware v2   | this script
 *   | D    | reconciled current-only   | incumbent-base (v1) | this script
 *
 * Retrieval is held CONSTANT across all cells: OUR retriever, top-30, regenerated
 * locally (deterministic) and cached once. Cells B/C/D read the identical cache.
 * The "store" dimension changes ONLY whether the retrieved dated turns are passed
 * raw (B) or first collapsed by a read-time reconciliation pass (C/D). The
 * "prompt" dimension changes ONLY the rule set (v2 vs v1), dating held constant.
 *
 * Reconciliation is a read-time SIMULATION of write-time reconciliation: a single
 * gpt-5-mini ADD/UPDATE/DELETE pass over the top-30 dated turns → a current-state
 * dated fact list where the later statement wins and no contradiction survives.
 * It is cached per instance_id so cells C and D answer a byte-identical store.
 *
 * Modes (one command each; resumable):
 *   --mode retrieval   build beam-e2-retrieval.json (needs ollama; no API spend)
 *   --mode repro-a     re-answer N cell-A questions over the cache, compare scores
 *   --mode cellB       answer incumbent over dated raw turns → beam-e2-cellB.jsonl
 *   --mode reconcile   build beam-e2-reconciled.json (gpt-5-mini)
 *   --mode cellC       answer v2 over reconciled store → beam-e2-cellC.jsonl
 *   --mode cellD       answer incumbent over reconciled store → beam-e2-cellD.jsonl
 *   --mode confound    classify every cell's answers surface-both/pick-latest/abstain
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createOllamaEmbedder } from '@waggle/core';
import type { SearchResult } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { createBeamOpenAiClient } from '../src/beam-openai-client.js';
import type { BeamOpenAiClient } from '../src/beam-openai-client.js';
import {
  buildAnswerGenerationPrompt,        // v1 / incumbent-base rule set
  buildAnswerGenerationPromptV2,      // conflict-aware v2 rule set
  judgeQuestion,
} from '../src/beam-nugget-judge.js';
import type { BeamLlmResult } from '../src/beam-nugget-judge.js';
import { buildConvDateMap, renderMemories } from '../src/beam-date-map.js';

const ABILITY = 'contradiction_resolution';
const TOP_K = 30;
const CONVS = Array.from({ length: 35 }, (_, i) => i + 1);

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const beamChats = path.resolve(repoRoot, '..', 'BEAM', 'chats');
const mindsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M');
const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
const RETRIEVAL_CACHE = path.join(outDir, 'beam-e2-retrieval.json');
const RECONCILED_CACHE = path.join(outDir, 'beam-e2-reconciled.json');
const PUBLISHED_A = path.join(outDir, 'beam-1m-FULL700-gpt5-retv2.jsonl');

interface Question {
  instanceId: string; conv: number; gopId: string; question: string; rubric: string[];
}

function extractRubric(pq: Record<string, unknown>): string[] {
  const raw = pq.rubric;
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  if (raw && typeof raw === 'object') {
    const n = (raw as Record<string, unknown>).nuggets;
    if (Array.isArray(n)) return n.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (raw) return [String(raw).trim()];
  return [];
}

/** Load only the contradiction_resolution questions for a conv, in dataset order. */
function loadContradictionQuestions(conv: number): Question[] {
  const pqPath = path.join(beamChats, '1M', String(conv), 'probing_questions', 'probing_questions.json');
  if (!fs.existsSync(pqPath)) return [];
  const data = JSON.parse(fs.readFileSync(pqPath, 'utf-8')) as Record<string, Record<string, unknown>[]>;
  const out: Question[] = [];
  const questions = data[ABILITY];
  if (!Array.isArray(questions)) return [];
  questions.forEach((pq, qi) => {
    const q = typeof pq.question === 'string' ? pq.question : '';
    if (!q) return;
    out.push({
      instanceId: `beam_1M_${conv}_${ABILITY}_q${qi}`,
      conv, gopId: `beam_${conv}`, question: q, rubric: extractRubric(pq),
    });
  });
  return out;
}

function allQuestions(): Question[] {
  return CONVS.flatMap(loadContradictionQuestions);
}

function mindPath(conv: number): string { return path.join(mindsDir, `beam_1M_${conv}.mind`); }

/** Oldest-first (frame id asc) — mirrors the harness's memoriesFromResults. */
function memoriesFromResults(results: readonly SearchResult[]): string[] {
  return [...results].sort((a, b) => a.frame.id - b.frame.id).map(r => r.frame.content);
}

// ── Retrieval cache (deterministic, no API) ──────────────────────────────────

interface RetrievalEntry { instanceId: string; conv: number; question: string; rubric: string[]; datedMemories: string[]; }

async function buildRetrievalCache(): Promise<void> {
  const embedder = createOllamaEmbedder();
  const byConv = new Map<number, Question[]>();
  for (const q of allQuestions()) {
    if (!byConv.has(q.conv)) byConv.set(q.conv, []);
    byConv.get(q.conv)!.push(q);
  }
  const cache: Record<string, RetrievalEntry> = {};
  let total = 0;
  for (const conv of CONVS) {
    const qs = byConv.get(conv) ?? [];
    if (qs.length === 0) continue;
    const substrate = createSubstrate({ dbPath: mindPath(conv), embedder });
    try {
      const dateMap = buildConvDateMap(path.join(beamChats, '1M', String(conv), 'chat.json'));
      for (const q of qs) {
        const results = await substrate.search.search(q.question, { limit: TOP_K, gopId: q.gopId });
        const memories = memoriesFromResults(results);
        const datedMemories = renderMemories(memories, dateMap, 'v2');
        cache[q.instanceId] = { instanceId: q.instanceId, conv, question: q.question, rubric: q.rubric, datedMemories };
        total++;
        process.stdout.write(`  [conv ${conv}] ${q.instanceId} → ${datedMemories.length} dated turns\n`);
      }
    } finally { substrate.close(); }
  }
  fs.writeFileSync(RETRIEVAL_CACHE, JSON.stringify(cache, null, 0) + '\n', 'utf-8');
  console.log(`\n[retrieval] cached ${total} questions → ${RETRIEVAL_CACHE}`);
}

function loadRetrievalCache(): Record<string, RetrievalEntry> {
  if (!fs.existsSync(RETRIEVAL_CACHE)) { console.error(`[e2] missing ${RETRIEVAL_CACHE}; run --mode retrieval first`); process.exit(2); }
  return JSON.parse(fs.readFileSync(RETRIEVAL_CACHE, 'utf-8')) as Record<string, RetrievalEntry>;
}

// ── Reconciliation cache (gpt-5-mini; simulate write-time ADD/UPDATE/DELETE) ──

const RECONCILE_SYSTEM =
  'You maintain a running fact store from a user\'s chat history, mem0-style. You are given dated ' +
  'conversation excerpts in chronological order (oldest first). Produce the CURRENT state of the ' +
  'user\'s facts as a bulleted list. Apply ADD/UPDATE/DELETE semantics: when a later statement ' +
  'changes or contradicts an earlier one, KEEP ONLY the later (current) value and discard the ' +
  'earlier one — the superseded value must NOT appear anywhere. Each surviving fact is a single ' +
  'line prefixed with the date it was last affirmed: [YYYY-MM-DD] fact. Do NOT include ' +
  'contradictions, history, or "previously X now Y" phrasing — only the current resolved state. ' +
  'Output ONLY the bulleted list, one fact per line.';

function buildReconcilePrompt(datedMemories: string[]): string {
  const body = datedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `## Dated conversation excerpts (oldest first)\n${body}\n\n## Current-state fact list (later statement wins, no contradiction survives):`;
}

interface ReconciledEntry { instanceId: string; reconciledMemories: string[]; }

function readCache(p: string): Record<string, ReconciledEntry> {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, ReconciledEntry>; }
  catch { console.warn(`[reconcile] ${path.basename(p)} unparseable — treating as empty`); return {}; }
}

/** Reconcile a conv-range shard into its own cache file. Skips ids already
 *  present in the MAIN cache (from an earlier partial run) or this shard's file,
 *  so parallel shards never redo each other's or the prior run's work. */
async function buildReconciledCache(convRange: number[] | null, cachePath: string): Promise<void> {
  const retrieval = loadRetrievalCache();
  const client = createBeamOpenAiClient({ model: 'gpt-5-mini' });
  const shard = readCache(cachePath);
  const mainDone = new Set(Object.keys(readCache(RECONCILED_CACHE)));
  const inRange = (conv: number): boolean => !convRange || convRange.includes(conv);
  let cost = 0, done = 0;
  const ids = Object.keys(retrieval).sort();
  for (const id of ids) {
    const entry = retrieval[id];
    if (!inRange(entry.conv)) continue;
    if (shard[id] || mainDone.has(id)) continue;
    const res = await client.chat({ system: RECONCILE_SYSTEM, user: buildReconcilePrompt(entry.datedMemories), maxTokens: 4096 });
    cost += res.costUsd;
    const lines = res.text.split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
    shard[id] = { instanceId: id, reconciledMemories: lines };
    fs.writeFileSync(cachePath, JSON.stringify(shard, null, 0) + '\n', 'utf-8');
    done++;
    process.stdout.write(`  reconciled ${id}: ${entry.datedMemories.length} turns → ${lines.length} facts  $${cost.toFixed(3)}\n`);
  }
  console.log(`\n[reconcile] shard ${path.basename(cachePath)} +${done} (${Object.keys(shard).length} in shard) cost=$${cost.toFixed(4)}`);
}

/** Merge the main cache + all beam-e2-reconciled.shard-*.json into the main cache. */
function mergeReconciledShards(): void {
  const merged = readCache(RECONCILED_CACHE);
  for (const f of fs.readdirSync(outDir)) {
    if (!/^beam-e2-reconciled\.shard-.*\.json$/.test(f)) continue;
    const shard = readCache(path.join(outDir, f));
    for (const [id, v] of Object.entries(shard)) merged[id] = v;
  }
  fs.writeFileSync(RECONCILED_CACHE, JSON.stringify(merged, null, 0) + '\n', 'utf-8');
  const retrieval = loadRetrievalCache();
  const missing = Object.keys(retrieval).filter(id => !merged[id]);
  console.log(`[reconcile-merge] ${Object.keys(merged).length}/${Object.keys(retrieval).length} reconciled → ${RECONCILED_CACHE}`);
  if (missing.length) console.warn(`[reconcile-merge] MISSING ${missing.length}: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
}

function loadReconciledCache(): Record<string, ReconciledEntry> {
  if (!fs.existsSync(RECONCILED_CACHE)) { console.error(`[e2] missing ${RECONCILED_CACHE}; run --mode reconcile first`); process.exit(2); }
  return JSON.parse(fs.readFileSync(RECONCILED_CACHE, 'utf-8')) as Record<string, ReconciledEntry>;
}

// ── Answer + judge cells ─────────────────────────────────────────────────────

type Store = 'raw' | 'reconciled';
type Prompt = 'v2' | 'incumbent';

function stripAns(text: string): string {
  return text.includes('ANSWER:') ? text.split('ANSWER:').pop()!.trim() : text.trim();
}

function buildPrompt(prompt: Prompt, question: string, memories: string[]): string {
  return prompt === 'v2'
    ? buildAnswerGenerationPromptV2(question, memories)
    : buildAnswerGenerationPrompt(question, memories);
}

async function runCell(cellLabel: string, store: Store, prompt: Prompt, outPath: string, budget: number): Promise<void> {
  const retrieval = loadRetrievalCache();
  const reconciled = store === 'reconciled' ? loadReconciledCache() : null;
  const client = createBeamOpenAiClient({ model: 'gpt-5' });

  const doneIds = new Set<string>();
  if (fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const r = JSON.parse(t) as { instance_id?: string }; if (r.instance_id) doneIds.add(r.instance_id); } catch { /* skip */ }
    }
    console.log(`[${cellLabel}] resume: ${doneIds.size} already answered`);
  }
  const out = fs.createWriteStream(outPath, { flags: 'a' });
  const ids = Object.keys(retrieval).sort();
  let cost = 0, n = 0;
  for (const id of ids) {
    if (doneIds.has(id)) continue;
    if (cost >= budget) { console.warn(`[${cellLabel}] budget $${budget} hit`); break; }
    const entry = retrieval[id];
    const memories = store === 'raw' ? entry.datedMemories : (reconciled![id]?.reconciledMemories ?? []);
    const ans = await client.chat({ system: '', user: buildPrompt(prompt, entry.question, memories), maxTokens: 4096 });
    cost += ans.costUsd;
    const answer = stripAns(ans.text);
    const { judgement, llmResults } = await judgeQuestion(
      client, { question: entry.question, rubric: entry.rubric, memoryAbility: ABILITY, answer },
    );
    for (const r of llmResults) cost += r.costUsd;
    out.write(JSON.stringify({
      instance_id: id, conv: entry.conv, memory_ability: ABILITY, question: entry.question,
      answer, score: judgement.score, judgment: judgement.judgment, nugget_scores: judgement.nuggetScores,
      n_nuggets: entry.rubric.length, cell: cellLabel, store, prompt, top_k: TOP_K,
      n_memories: memories.length,
      note: store === 'reconciled' ? 'read-time simulation of write-time reconciliation' : undefined,
    }) + '\n');
    n++;
    process.stdout.write(`  [${cellLabel}] ${id} score=${judgement.score.toFixed(2)} $${cost.toFixed(3)}\n`);
  }
  out.end();
  console.log(`\n[${cellLabel}] answered_now=${n} cost=$${cost.toFixed(4)} → ${outPath}`);
}

// ── Cell-A reproduction spot check ───────────────────────────────────────────

async function reproA(nSample: number): Promise<void> {
  const retrieval = loadRetrievalCache();
  const publishedA = new Map<string, number>();
  for (const line of fs.readFileSync(PUBLISHED_A, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t) continue;
    const r = JSON.parse(t) as { instance_id: string; memory_ability: string; score: number };
    if (r.memory_ability === ABILITY && !publishedA.has(r.instance_id)) publishedA.set(r.instance_id, r.score);
  }
  const client = createBeamOpenAiClient({ model: 'gpt-5' });
  const ids = Object.keys(retrieval).sort().slice(0, nSample);
  let cost = 0;
  const rows: Array<{ id: string; repro: number; published: number }> = [];
  for (const id of ids) {
    const entry = retrieval[id];
    const ans = await client.chat({ system: '', user: buildAnswerGenerationPromptV2(entry.question, entry.datedMemories), maxTokens: 4096 });
    cost += ans.costUsd;
    const answer = stripAns(ans.text);
    const { judgement, llmResults } = await judgeQuestion(
      client, { question: entry.question, rubric: entry.rubric, memoryAbility: ABILITY, answer },
    );
    for (const r of llmResults) cost += r.costUsd;
    rows.push({ id, repro: judgement.score, published: publishedA.get(id) ?? NaN });
    process.stdout.write(`  repro ${id}: repro=${judgement.score.toFixed(2)} published=${(publishedA.get(id) ?? NaN).toFixed(2)} $${cost.toFixed(3)}\n`);
  }
  const meanRepro = rows.reduce((s, r) => s + r.repro, 0) / rows.length;
  const meanPub = rows.reduce((s, r) => s + r.published, 0) / rows.length;
  console.log(`\n[repro-a] n=${rows.length} mean repro=${meanRepro.toFixed(4)} vs published=${meanPub.toFixed(4)} cost=$${cost.toFixed(4)}`);
}

// ── Confound classification: surface-both vs pick-latest vs abstain ──────────

const CONFOUND_SYSTEM =
  'You classify how an assistant answer handled a question about a fact the user stated ' +
  'inconsistently over time. Respond with STRICT JSON: {"label":"<one of>"} where <one of> is:\n' +
  '- surface_both: the answer explicitly flags that the stored information is contradictory / ' +
  'conflicting, OR presents more than one of the conflicting values (optionally asking the user which is correct).\n' +
  '- pick_latest: the answer commits to a single value/state as the current answer without flagging any contradiction.\n' +
  '- abstain: the answer declines, saying it does not have enough information.\n' +
  'Judge ONLY the answer text\'s behaviour, not correctness.';

async function classifyConfound(cellFile: string): Promise<Record<string, number> | null> {
  const p = path.join(outDir, cellFile);
  if (!fs.existsSync(p)) { console.log(`[confound] ${cellFile}: missing`); return null; }
  const client = createBeamOpenAiClient({ model: 'gpt-5-mini' });
  const seen = new Set<string>();
  const counts: Record<string, number> = { surface_both: 0, pick_latest: 0, abstain: 0, other: 0 };
  let cost = 0;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t) continue;
    const r = JSON.parse(t) as { instance_id: string; question: string; answer: string };
    if (seen.has(r.instance_id)) continue; seen.add(r.instance_id);
    const res = await client.chat({
      system: CONFOUND_SYSTEM,
      user: `QUESTION:\n${r.question}\n\nANSWER:\n${r.answer}`,
      jsonMode: true, maxTokens: 200,
    });
    cost += res.costUsd;
    let label = 'other';
    try {
      const o = JSON.parse(res.text) as { label?: string };
      if (o.label && ['surface_both', 'pick_latest', 'abstain'].includes(o.label)) label = o.label;
    } catch { /* keep other */ }
    counts[label] = (counts[label] ?? 0) + 1;
  }
  const n = seen.size;
  console.log(`[confound] ${cellFile}: n=${n} surface_both=${counts.surface_both} pick_latest=${counts.pick_latest} abstain=${counts.abstain} other=${counts.other} cost=$${cost.toFixed(3)}`);
  return counts;
}

async function runConfound(): Promise<void> {
  const results: Record<string, Record<string, number> | null> = {};
  for (const [cell, file] of [['A','beam-e2-cellA.jsonl'],['B','beam-e2-cellB.jsonl'],['C','beam-e2-cellC.jsonl'],['D','beam-e2-cellD.jsonl']] as const) {
    results[cell] = await classifyConfound(file);
  }
  fs.writeFileSync(path.join(outDir, 'beam-e2-confound.json'), JSON.stringify(results, null, 2) + '\n', 'utf-8');
  console.log(`\n[confound] → ${path.join(outDir, 'beam-e2-confound.json')}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = argv[argv.indexOf('--mode') + 1] ?? '';
  const budgetArg = argv.indexOf('--budget');
  const budget = budgetArg >= 0 ? parseFloat(argv[budgetArg + 1]) : 30;
  const nArg = argv.indexOf('--n');
  const nSample = nArg >= 0 ? parseInt(argv[nArg + 1], 10) : 5;
  fs.mkdirSync(outDir, { recursive: true });
  switch (mode) {
    case 'retrieval': await buildRetrievalCache(); break;
    case 'repro-a': await reproA(nSample); break;
    case 'cellA': await runCell('A', 'raw', 'v2', path.join(outDir, 'beam-e2-cellA.jsonl'), budget); break;
    case 'cellB': await runCell('B', 'raw', 'incumbent', path.join(outDir, 'beam-e2-cellB.jsonl'), budget); break;
    case 'reconcile': {
      const convArg = argv.indexOf('--convs');
      const convRange = convArg >= 0
        ? argv[convArg + 1].split(',').flatMap(part => {
            const m = part.match(/^(\d+)-(\d+)$/);
            if (m) { const r: number[] = []; for (let i = +m[1]; i <= +m[2]; i++) r.push(i); return r; }
            return [parseInt(part, 10)];
          })
        : null;
      const cacheArg = argv.indexOf('--cache');
      const cachePath = cacheArg >= 0 ? path.join(outDir, argv[cacheArg + 1]) : RECONCILED_CACHE;
      await buildReconciledCache(convRange, cachePath);
      break;
    }
    case 'reconcile-merge': mergeReconciledShards(); break;
    case 'cellC': await runCell('C', 'reconciled', 'v2', path.join(outDir, 'beam-e2-cellC.jsonl'), budget); break;
    case 'cellD': await runCell('D', 'reconciled', 'incumbent', path.join(outDir, 'beam-e2-cellD.jsonl'), budget); break;
    case 'confound': await runConfound(); break;
    default: console.error(`unknown --mode "${mode}" (retrieval|repro-a|cellB|reconcile|cellC|cellD)`); process.exit(2);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
