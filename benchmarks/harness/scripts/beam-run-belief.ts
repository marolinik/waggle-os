#!/usr/bin/env tsx
/**
 * BEAM 1M — the `belief` cell (E3). ADDITIVE belief-store overlay on the winning
 * retrieval config.
 *
 * WHAT IT IS. The best BEAM config is cell=retrieval, prompt=v2, top_k=30 over
 * the raw dated turns in minds-1M (headline 0.6482/74.0% @ gpt-5). The prior
 * `hive_mind_ipb` cell created P/B belief frames but NEVER injected them into the
 * answer prompt (belief theater). This cell wires the REAL belief store in:
 *
 *   1. Retrieve the SAME raw dated turns from minds-1M (top_k=30, v2 date-stamped)
 *      — byte-for-byte the baseline answer context. UNCHANGED. Detail is still
 *      carried by the raw turns (E1: we still need them for instruction/preference).
 *   2. Retrieve the query-relevant distilled facts from minds-1M-obs (k-belief),
 *      then run the ACTUAL supersede/consolidation code over them:
 *        - detectSupersessionChains  (LLM: same-attribute value-over-time chains)
 *        - detectEntityGroups        (LLM: enumerable member sets)
 *        - applyConsolidation        (emits the current-value P-frames + set B-frames)
 *      applyConsolidation is run inside a ROLLED-BACK SQLite transaction so the
 *      shared obs mind on disk is never mutated; we read the returned frames only.
 *   3. Fold the returned P/B frame contents into a "# CURRENT VALUES" belief block
 *      and inject it into buildAnswerGenerationPromptV2 as a clearly-delimited
 *      section BEFORE the raw turns (new optional `beliefsBlock` param; the prompt
 *      is byte-identical to v2 when the block is empty).
 *
 * This replicates the LongMemEval "current values" injection mechanism (the
 * validated SOTA lever), NOT the e2-cells.ts gpt-5-mini belief *simulation* (a
 * losing arm). Detection uses a cheap model (--detect-model, default gpt-5-mini)
 * as the ConsolidationLlm transport; the graded ANSWER + JUDGE stay on the
 * canonical models.
 *
 * MODELS. --model = answerer (gpt-5 for the isolation pilot; anthropic/claude-
 * sonnet-4.6 for the stacked headline — routed through OpenRouter by
 * createBeamOpenAiClient). --judge-model = judge (default gpt-5, canonical/
 * comparable to our 64.82 and Eywa's 82.85 under the same judge). Every answer
 * row is recorded with nugget_scores so a later Sonnet-judge (Eywa protocol) pass
 * via beam-rejudge.ts is possible.
 *
 * RESUMABLE. Append-JSONL; on --resume, already-answered instance_ids are skipped.
 * --instance-ids <file> restricts to an exact allowlist (reuse matched50.txt).
 * --budget caps spend with a hard stop.
 *
 * Usage:
 *   # pilot (isolation): gpt-5 answerer + gpt-5 judge, matched-50
 *   tsx benchmarks/harness/scripts/beam-run-belief.ts --model gpt-5 \
 *     --instance-ids benchmarks/harness/scripts/matched50.txt --budget 12 --resume
 *   # headline: belief + Sonnet-4.6 answerer, gpt-5 judge, full-700
 *   tsx benchmarks/harness/scripts/beam-run-belief.ts --model anthropic/claude-sonnet-4.6 \
 *     --judge-model gpt-5 --convs 1-35 --budget 90 --resume
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createOllamaEmbedder } from '@waggle/core';
import {
  detectSupersessionChains, detectEntityGroups, applyConsolidation,
  type ConsolidationLlm, type Observation, type MemoryFrame,
} from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import type { Substrate } from '../src/substrate.js';
import { createBeamOpenAiClient, BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { buildAnswerGenerationPromptV2, judgeQuestion } from '../src/beam-nugget-judge.js';
import type { BeamLlmResult } from '../src/beam-nugget-judge.js';
import { buildConvDateMap, renderMemories } from '../src/beam-date-map.js';
import { computeBeamMetrics, formatBeamMetrics } from '../src/beam-metrics.js';
import type { BeamQuestionResult } from '../src/beam-metrics.js';

interface Question {
  instanceId: string;
  conv: number;
  gopId: string;
  memoryAbility: string;
  question: string;
  rubric: string[];
}

interface Args {
  model: string;
  judgeModel: string;
  detectModel: string;
  topK: number;
  kBelief: number;
  budget: number;
  resume: boolean;
  convs: number[];
  beamChats: string;
  rawMindsDir: string;
  obsMindsDir: string;
  instanceIds: Set<string> | null;
  outPath: string | null;
  tag: string;
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
    model: 'gpt-5',
    judgeModel: 'gpt-5',
    detectModel: 'gpt-5-mini',
    topK: 30,
    kBelief: 60,
    budget: 12,
    resume: false,
    convs: parseConvSpec('1-35'),
    beamChats: path.resolve(repoRoot, '..', 'BEAM', 'chats'),
    rawMindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M'),
    obsMindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs'),
    instanceIds: null,
    outPath: null,
    tag: 'belief',
  };
  let judgeExplicit = false;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--model' && next) { a.model = next; i++; }
    else if (f === '--judge-model' && next) { a.judgeModel = next; judgeExplicit = true; i++; }
    else if (f === '--detect-model' && next) { a.detectModel = next; i++; }
    else if (f === '--top-k' && next) { a.topK = parseInt(next, 10); i++; }
    else if (f === '--k-belief' && next) { a.kBelief = parseInt(next, 10); i++; }
    else if (f === '--budget' && next) { a.budget = parseFloat(next); i++; }
    else if (f === '--resume') { a.resume = true; }
    else if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--tag' && next) { a.tag = next; i++; }
    else if (f === '--instance-ids' && next) {
      const ids = fs.readFileSync(path.resolve(next), 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);
      a.instanceIds = new Set(ids); i++;
    }
    else if (f === '--out' && next) { a.outPath = path.resolve(next); i++; }
  }
  // Default: judge with the answerer's model unless a judge model was named.
  if (!judgeExplicit) a.judgeModel = a.model;
  return a;
}

// ── Question loading (identical scheme to beam-run-1m.ts) ────────────────────

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

function loadConvQuestions(beamChats: string, conv: number): Question[] {
  const pqPath = path.join(beamChats, '1M', String(conv), 'probing_questions', 'probing_questions.json');
  if (!fs.existsSync(pqPath)) return [];
  const data = JSON.parse(fs.readFileSync(pqPath, 'utf-8')) as Record<string, Record<string, unknown>[]>;
  const out: Question[] = [];
  for (const [category, questions] of Object.entries(data)) {
    if (!Array.isArray(questions)) continue;
    questions.forEach((pq, qi) => {
      const q = typeof pq.question === 'string' ? pq.question : '';
      if (!q) return;
      out.push({
        instanceId: `beam_1M_${conv}_${category}_q${qi}`,
        conv, gopId: `beam_${conv}`, memoryAbility: category,
        question: q, rubric: extractRubric(pq),
      });
    });
  }
  return out;
}

function mindPath(mindsDir: string, conv: number): string {
  return path.join(mindsDir, `beam_1M_${conv}.mind`);
}
function isIngested(mindsDir: string, conv: number): boolean {
  return fs.existsSync(path.join(mindsDir, `beam_1M_${conv}.done.json`)) && fs.existsSync(mindPath(mindsDir, conv));
}
function chatJsonPath(beamChats: string, conv: number): string {
  return path.join(beamChats, '1M', String(conv), 'chat.json');
}
function memoriesFromResults(results: readonly { frame: { id: number; content: string } }[]): string[] {
  return [...results].sort((a, b) => a.frame.id - b.frame.id).map(r => r.frame.content);
}
function stripAns(text: string): string {
  return text.includes('ANSWER:') ? text.split('ANSWER:').pop()!.trim() : text.trim();
}
function approxTokens(s: string): number { return Math.max(1, Math.ceil(s.length / 4)); }

/** Build a client. gpt/o-series → OpenAI (createBeamOpenAiClient). Claude ids
 *  (e.g. anthropic/claude-sonnet-4.6) → OpenRouter's OpenAI-compatible endpoint
 *  with OPENROUTER_API_KEY. Isolated here so the shared client stays untouched. */
function makeClient(model: string): BeamOpenAiClient {
  if (/claude|anthropic/i.test(model)) {
    loadDotEnv();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not found in environment or .env (required for Claude answerer).');
    const pricing = OPENAI_PRICING[model] ?? { inputPerMillion: 3.0, outputPerMillion: 15.0 };
    return new BeamOpenAiClient({ model, apiKey, baseUrl: 'https://openrouter.ai/api/v1', pricing });
  }
  return createBeamOpenAiClient({ model });
}

// ── Belief block (REAL supersede/consolidation) ──────────────────────────────

const ROLLBACK = Symbol('belief-rollback');

/** B-frame content is JSON {description, references}; return the description
 *  (`label (N members)`), falling back to the raw string if it isn't JSON. */
function bframeDescription(content: string): string {
  try {
    const o = JSON.parse(content) as { description?: unknown };
    if (o && typeof o.description === 'string') return o.description;
  } catch { /* not JSON — use raw */ }
  return content;
}

interface BeliefBlock { block: string | null; nChains: number; nGroups: number; nRetrieved: number }

/**
 * Build the consolidated "# CURRENT VALUES" block for a question from the obs
 * (distilled-fact) mind. Retrieves the query-relevant facts, detects supersession
 * chains + enumerable groups with the injected ConsolidationLlm, then runs the
 * REAL applyConsolidation inside a rolled-back transaction so the shared mind on
 * disk is untouched — we consume only the returned P/B frames.
 */
async function buildBeliefBlock(
  obsSub: Substrate, gopId: string, question: string, detectLlm: ConsolidationLlm, kBelief: number,
): Promise<BeliefBlock> {
  const results = await obsSub.search.search(question, { limit: kBelief, gopId });
  if (results.length < 2) return { block: null, nChains: 0, nGroups: 0, nRetrieved: results.length };

  const obs: Observation[] = results.map(r => ({
    id: r.frame.id,
    content: r.frame.content,
    created_at: String(r.frame.created_at ?? ''),
  }));

  const [chains, groups] = await Promise.all([
    detectSupersessionChains(obs, detectLlm),
    detectEntityGroups(obs, detectLlm),
  ]);
  if (chains.length === 0 && groups.length === 0) {
    return { block: null, nChains: 0, nGroups: 0, nRetrieved: results.length };
  }

  // Real consolidation, thrown away on disk: BEGIN → applyConsolidation → ROLLBACK.
  const raw = obsSub.db.getDatabase();
  let pframes: MemoryFrame[] = [];
  let bframes: MemoryFrame[] = [];
  try {
    raw.transaction(() => {
      const res = applyConsolidation(obsSub.frames, chains, groups, gopId);
      pframes = res.pframes;
      bframes = res.bframes;
      throw ROLLBACK; // discard all writes; we already captured the returned frames
    })();
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }

  // P-frame content is the clean `[current] attr: value (as of date)` line.
  // B-frame content is a JSON blob {description, references}; surface the
  // human-readable `description` (`label (N members)`), never the raw JSON.
  const values = pframes.map(f => String(f.content).replace(/^\[current\]\s*/, '').trim()).filter(Boolean);
  const sets = bframes.map(f => bframeDescription(String(f.content))).map(s => s.trim()).filter(Boolean);
  if (values.length === 0 && sets.length === 0) {
    return { block: null, nChains: chains.length, nGroups: groups.length, nRetrieved: results.length };
  }

  const parts: string[] = [];
  if (values.length) {
    parts.push(
      'CURRENT VALUES (consolidated from the user\'s whole history — each line is the LATEST known ' +
      'value of a fact that CHANGED over time; when a raw memory below conflicts with one of these, ' +
      'trust the value here):\n' + values.map(v => `- ${v}`).join('\n'),
    );
  }
  if (sets.length) {
    parts.push(
      'ENUMERABLE SETS (complete member counts inferred across all sessions — use these when asked ' +
      'to count or list every item of a kind):\n' + sets.map(s => `- ${s}`).join('\n'),
    );
  }
  return { block: parts.join('\n\n'), nChains: chains.length, nGroups: groups.length, nRetrieved: results.length };
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function run(args: Args): Promise<void> {
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });
  const modelSlug = args.model.replace(/[^a-z0-9.]+/gi, '-');
  const outPath = args.outPath ?? path.join(outDir, `beam-1m-${args.tag}-${modelSlug}-topk${args.topK}.jsonl`);

  const doneIds = new Set<string>();
  if (fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const row = JSON.parse(t) as { instance_id?: string }; if (args.resume && row.instance_id) doneIds.add(row.instance_id); } catch { /* skip */ }
    }
    if (args.resume) console.log(`[belief] resume: ${doneIds.size} already answered in ${path.basename(outPath)}`);
    else if (doneIds.size === 0 && fs.readFileSync(outPath, 'utf-8').trim()) console.warn(`[belief] WARNING: ${path.basename(outPath)} exists; appending WITHOUT --resume may duplicate rows.`);
  }

  const answerClient = makeClient(args.model);
  const judgeClient = args.judgeModel === args.model ? answerClient : makeClient(args.judgeModel);
  const detectClient = makeClient(args.detectModel);
  const embedder = createOllamaEmbedder();

  let detectCost = 0;
  const detectLlm: ConsolidationLlm = async (system, user) => {
    const r = await detectClient.chat({ system, user, jsonMode: true, maxTokens: 1200 });
    detectCost += r.costUsd;
    return r.text;
  };

  const perQuestion: BeamQuestionResult[] = [];
  const answerPromptToks: number[] = [];
  let answerCost = 0, judgeCost = 0, budgetStopped = false;
  let beliefNonEmpty = 0, chainsTotal = 0, groupsTotal = 0;
  const outStream = fs.createWriteStream(outPath, { flags: 'a' });

  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c) && isIngested(args.obsMindsDir, c));
  console.log(`[belief] answer=${args.model} judge=${args.judgeModel} detect=${args.detectModel} top_k=${args.topK} k_belief=${args.kBelief} budget=$${args.budget} convs=${convs.length}${args.instanceIds ? ` allowlist=${args.instanceIds.size}` : ''}`);

  for (const conv of convs) {
    if (budgetStopped) break;
    const questions = loadConvQuestions(args.beamChats, conv)
      .filter(q => !doneIds.has(q.instanceId) && (!args.instanceIds || args.instanceIds.has(q.instanceId)));
    if (questions.length === 0) continue;

    const rawSub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
    const obsSub = createSubstrate({ dbPath: mindPath(args.obsMindsDir, conv), embedder });
    const dateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv));
    try {
      for (const q of questions) {
        const spent = answerCost + judgeCost + detectCost;
        if (spent >= args.budget) { budgetStopped = true; console.warn(`[belief] budget $${args.budget} hit ($${spent.toFixed(2)})`); break; }

        // 1) belief block from the obs mind (real supersede/consolidation).
        const bel = await buildBeliefBlock(obsSub, q.gopId, q.question, detectLlm, args.kBelief);
        if (bel.block) beliefNonEmpty++;
        chainsTotal += bel.nChains; groupsTotal += bel.nGroups;

        // 2) SAME raw dated turns as the baseline retrieval cell (top_k=30, v2).
        const results = await rawSub.search.search(q.question, { limit: args.topK, gopId: q.gopId });
        const memories = memoriesFromResults(results);
        const display = renderMemories(memories, dateMap, 'v2');
        const prompt = buildAnswerGenerationPromptV2(q.question, display, undefined, bel.block ?? undefined);
        answerPromptToks.push(approxTokens(prompt));

        const ans = await answerClient.chat({ system: '', user: prompt, maxTokens: 4096 });
        answerCost += ans.costUsd;
        const answer = stripAns(ans.text);

        // 3) judge (canonical).
        const { judgement, llmResults } = await judgeQuestion(
          judgeClient,
          { question: q.question, rubric: q.rubric, memoryAbility: q.memoryAbility, answer },
          {},
        );
        for (const r of llmResults) judgeCost += r.costUsd;

        perQuestion.push({ instanceId: q.instanceId, memoryAbility: q.memoryAbility, score: judgement.score, ...(judgement.error ? { error: judgement.error } : {}) });
        outStream.write(JSON.stringify({
          instance_id: q.instanceId, conv, memory_ability: q.memoryAbility, question: q.question,
          answer, score: judgement.score, judgment: judgement.judgment, nugget_scores: judgement.nuggetScores,
          n_nuggets: q.rubric.length, cell: 'belief', prompt: 'v2', top_k: args.topK, k_belief: args.kBelief,
          belief_used: !!bel.block, belief_chains: bel.nChains, belief_groups: bel.nGroups,
          answer_model: args.model, judge_model: args.judgeModel, detect_model: args.detectModel,
          ...(bel.block ? { belief_block: bel.block } : {}),
        }) + '\n');
        const flag = bel.block ? `bel(${bel.nChains}c/${bel.nGroups}g)` : 'bel(—)';
        process.stdout.write(`  [conv ${conv}] ${q.memoryAbility.padEnd(24)} ${flag.padEnd(12)} score=${judgement.score.toFixed(2)} $${(answerCost + judgeCost + detectCost).toFixed(3)}\n`);
      }
    } finally {
      rawSub.close();
      obsSub.close();
    }
  }
  outStream.end();

  const metrics = computeBeamMetrics(perQuestion);
  const meanTok = answerPromptToks.length ? Math.round(answerPromptToks.reduce((s, x) => s + x, 0) / answerPromptToks.length) : 0;
  const totalCost = answerCost + judgeCost + detectCost;
  const summaryPath = outPath.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    run: {
      cell: 'belief', dataset: 'beam-1m', answer_model: args.model, judge_model: args.judgeModel,
      detect_model: args.detectModel, prompt: 'v2', top_k: args.topK, k_belief: args.kBelief,
      minds_dir: 'minds-1M (answer) + minds-1M-obs (belief)',
      mean_answer_prompt_tokens: meanTok,
      belief_nonempty: beliefNonEmpty, answered_now: perQuestion.length,
      chains_total: chainsTotal, groups_total: groupsTotal,
      budgetStopped,
    },
    metrics: { overall_avg_score: metrics.overall.avgScore, overall_pass_rate_pct: metrics.overall.accuracy, by_ability: metrics.byAbility },
    cost: { total_usd: totalCost, answer_usd: answerCost, judge_usd: judgeCost, detect_usd: detectCost },
  }, null, 2) + '\n', 'utf-8');

  console.log('\n════════ BEAM 1M — belief ════════');
  console.log(formatBeamMetrics(metrics));
  console.log(`belief block non-empty on ${beliefNonEmpty}/${perQuestion.length} questions (chains=${chainsTotal} groups=${groupsTotal})`);
  console.log(`cost=$${totalCost.toFixed(4)} (answer=$${answerCost.toFixed(3)} judge=$${judgeCost.toFixed(3)} detect=$${detectCost.toFixed(3)})  answered_now=${perQuestion.length}  budgetStopped=${budgetStopped}`);
  console.log(`jsonl:   ${outPath}`);
  console.log(`summary: ${summaryPath}`);
}

run(parseArgs()).catch(err => { console.error('[beam-run-belief] FATAL:', err); process.exit(1); });
