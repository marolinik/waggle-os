#!/usr/bin/env tsx
/**
 * BEAM 1M — the `multiroute` cell (E4). Deterministic multi-route dated
 * retrieval (vector + timeline + entity, RRF-fused) + ability-gated belief
 * overlay, on top of the winning answer path.
 *
 * PER QUESTION:
 *   1. Multi-route context (src/beam-multiroute.ts): Route V (vector top-kVec)
 *      + Route T (broad dated timeline, parseDateWindow filter, coverage rank)
 *      + Route E (per-entity FTS across sessions), RRF-fused → top-N, DATED,
 *      chronological. Replaces the baseline single top-30 similarity context.
 *   2. Ability-gated belief block (E3 buildBeliefBlock, real supersede/
 *      consolidation, rolled-back txn, gpt-5-mini detect): injected ONLY for
 *      --belief-abilities (default knowledge_update,abstention,
 *      contradiction_resolution,event_ordering). Gate is by GOLD ability — an
 *      oracle gate for architecture isolation (a deployed system would use the
 *      measured gpt-5 classifier).
 *   3. Answer: buildAnswerGenerationPromptV2(q, multiRouteDisplay, undefined,
 *      beliefBlock?) → answerer (gpt-5 for isolation; anthropic/claude-sonnet-4.6
 *      for the headline, via OpenRouter).
 *   4. Judge: canonical gpt-5 nugget judge; full nugget_scores recorded per row
 *      so a later Sonnet-judge (Eywa protocol) pass via beam-rejudge.ts works.
 *
 * RESUMABLE: append-JSONL + skip-done (--resume). --instance-ids <file> exact
 * allowlist. --abilities restricts the question set. --budget hard-caps spend.
 *
 * Usage:
 *   # per-route smoke (print context, no spend):
 *   tsx scripts/beam-run-multiroute.ts --smoke --convs 1 --abilities temporal_reasoning
 *   # pilot (matched-50, gpt-5 answer + gpt-5 judge):
 *   tsx scripts/beam-run-multiroute.ts --model gpt-5 \
 *     --instance-ids scripts/matched50.txt --budget 12 --resume
 *   # headline full-700 (multi-route + gated belief + Sonnet answerer, gpt-5 judge):
 *   tsx scripts/beam-run-multiroute.ts --model anthropic/claude-sonnet-4.6 \
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
import { buildAnswerGenerationPromptV2, buildRepairPrompt, judgeQuestion } from '../src/beam-nugget-judge.js';
import type { BeamLlmResult } from '../src/beam-nugget-judge.js';
import { buildConvDateMap } from '../src/beam-date-map.js';
import { computeBeamMetrics, formatBeamMetrics } from '../src/beam-metrics.js';
import type { BeamQuestionResult } from '../src/beam-metrics.js';
import { buildMultiRouteContext, DEFAULT_MULTIROUTE, type MultiRouteOptions } from '../src/beam-multiroute.js';

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
  budget: number;
  resume: boolean;
  smoke: boolean;
  convs: number[];
  beamChats: string;
  rawMindsDir: string;
  obsMindsDir: string;
  instanceIds: Set<string> | null;
  abilities: Set<string> | null;
  beliefAbilities: Set<string>;
  noBelief: boolean;
  route: MultiRouteOptions;
  kBelief: number;
  outPath: string | null;
  tag: string;
  repair: boolean;
}

const DEFAULT_BELIEF_ABILITIES = ['knowledge_update', 'abstention', 'contradiction_resolution', 'event_ordering'];

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
    budget: 12,
    resume: false,
    smoke: false,
    convs: parseConvSpec('1-35'),
    beamChats: path.resolve(repoRoot, '..', 'BEAM', 'chats'),
    rawMindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M'),
    obsMindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs'),
    instanceIds: null,
    abilities: null,
    beliefAbilities: new Set(DEFAULT_BELIEF_ABILITIES),
    noBelief: false,
    route: { ...DEFAULT_MULTIROUTE },
    kBelief: 60,
    outPath: null,
    tag: 'multiroute',
    repair: false,
  };
  let judgeExplicit = false;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--model' && next) { a.model = next; i++; }
    else if (f === '--judge-model' && next) { a.judgeModel = next; judgeExplicit = true; i++; }
    else if (f === '--detect-model' && next) { a.detectModel = next; i++; }
    else if (f === '--budget' && next) { a.budget = parseFloat(next); i++; }
    else if (f === '--resume') { a.resume = true; }
    else if (f === '--smoke') { a.smoke = true; }
    else if (f === '--no-belief') { a.noBelief = true; }
    else if (f === '--repair') { a.repair = true; }
    else if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--tag' && next) { a.tag = next; i++; }
    else if (f === '--k-vec' && next) { a.route.kVec = parseInt(next, 10); i++; }
    else if (f === '--k-wide' && next) { a.route.kWide = parseInt(next, 10); i++; }
    else if (f === '--per-entity' && next) { a.route.perEntity = parseInt(next, 10); i++; }
    else if (f === '--cap-per-date' && next) { a.route.capPerDate = parseInt(next, 10); i++; }
    else if (f === '--top-n' && next) { a.route.topN = parseInt(next, 10); i++; }
    else if (f === '--k-belief' && next) { a.kBelief = parseInt(next, 10); i++; }
    else if (f === '--belief-abilities' && next) { a.beliefAbilities = new Set(next.split(',').map(s => s.trim()).filter(Boolean)); i++; }
    else if (f === '--abilities' && next) { a.abilities = new Set(next.split(',').map(s => s.trim()).filter(Boolean)); i++; }
    else if (f === '--instance-ids' && next) {
      const ids = fs.readFileSync(path.resolve(next), 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);
      a.instanceIds = new Set(ids); i++;
    }
    else if (f === '--out' && next) { a.outPath = path.resolve(next); i++; }
  }
  if (!judgeExplicit) a.judgeModel = a.model;
  return a;
}

// ── Question loading (identical scheme to beam-run-belief.ts) ────────────────

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
function stripAns(text: string): string {
  return text.includes('ANSWER:') ? text.split('ANSWER:').pop()!.trim() : text.trim();
}
function approxTokens(s: string): number { return Math.max(1, Math.ceil(s.length / 4)); }

/** gpt/o-series → OpenAI; Claude ids → OpenRouter. */
function makeClient(model: string): BeamOpenAiClient {
  if (/claude|anthropic/i.test(model)) {
    loadDotEnv();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not found in environment or .env (required for Claude answerer).');
    const pricing = OPENAI_PRICING[model] ?? { inputPerMillion: 3.0, outputPerMillion: 15.0 };
    // 180s (vs the 60s default): the repair pass on long summaries feeds the whole
    // draft back in and asks for an exhaustive rewrite — generation can exceed 60s
    // and abort to an empty completion (observed on summarization in the E5 smoke).
    // Extending the timeout is strictly safe (only waits longer) and also helps long drafts.
    return new BeamOpenAiClient({ model, apiKey, baseUrl: 'https://openrouter.ai/api/v1', pricing, timeoutMs: 180_000 });
  }
  return createBeamOpenAiClient({ model });
}

// ── Belief block (REAL supersede/consolidation) — from beam-run-belief.ts ────

const ROLLBACK = Symbol('belief-rollback');

function bframeDescription(content: string): string {
  try {
    const o = JSON.parse(content) as { description?: unknown };
    if (o && typeof o.description === 'string') return o.description;
  } catch { /* raw */ }
  return content;
}

interface BeliefBlock { block: string | null; nChains: number; nGroups: number }

async function buildBeliefBlock(
  obsSub: Substrate, gopId: string, question: string, detectLlm: ConsolidationLlm, kBelief: number,
): Promise<BeliefBlock> {
  const results = await obsSub.search.search(question, { limit: kBelief, gopId });
  if (results.length < 2) return { block: null, nChains: 0, nGroups: 0 };
  const obs: Observation[] = results.map(r => ({ id: r.frame.id, content: r.frame.content, created_at: String(r.frame.created_at ?? '') }));
  const [chains, groups] = await Promise.all([detectSupersessionChains(obs, detectLlm), detectEntityGroups(obs, detectLlm)]);
  if (chains.length === 0 && groups.length === 0) return { block: null, nChains: 0, nGroups: 0 };

  const raw = obsSub.db.getDatabase();
  let pframes: MemoryFrame[] = [];
  let bframes: MemoryFrame[] = [];
  try {
    raw.transaction(() => {
      const res = applyConsolidation(obsSub.frames, chains, groups, gopId);
      pframes = res.pframes; bframes = res.bframes;
      throw ROLLBACK;
    })();
  } catch (e) { if (e !== ROLLBACK) throw e; }

  const values = pframes.map(f => String(f.content).replace(/^\[current\]\s*/, '').trim()).filter(Boolean);
  const sets = bframes.map(f => bframeDescription(String(f.content))).map(s => s.trim()).filter(Boolean);
  if (values.length === 0 && sets.length === 0) return { block: null, nChains: chains.length, nGroups: groups.length };

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
  return { block: parts.join('\n\n'), nChains: chains.length, nGroups: groups.length };
}

// ── Smoke (print context, no spend) ──────────────────────────────────────────

async function smoke(args: Args): Promise<void> {
  const embedder = createOllamaEmbedder();
  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c));
  console.log(`[smoke] multi-route context (no LLM). route=${JSON.stringify(args.route)}`);
  for (const conv of convs) {
    const rawSub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
    const dateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv));
    try {
      const questions = loadConvQuestions(args.beamChats, conv)
        .filter(q => (!args.instanceIds || args.instanceIds.has(q.instanceId)) && (!args.abilities || args.abilities.has(q.memoryAbility)));
      for (const q of questions.slice(0, 4)) {
        const ctx = await buildMultiRouteContext(rawSub, q.gopId, q.question, dateMap, args.route);
        console.log(`\n════ conv ${conv} · ${q.memoryAbility} · ${q.instanceId}`);
        console.log(`Q: ${q.question}`);
        console.log(`entities: [${ctx.entities.join(' | ')}]  window: ${ctx.dateWindow ? ctx.dateWindow.label : '—'}`);
        console.log(`routes: V=${ctx.nVec} T=${ctx.nTimeline} E=${ctx.nEntity} → fused=${ctx.nFused} (dated=${ctx.nDated})`);
        console.log('── context (first 12 lines) ──');
        for (const line of ctx.displayStrings.slice(0, 12)) console.log('  ' + line.slice(0, 140));
        if (ctx.displayStrings.length > 12) console.log(`  … +${ctx.displayStrings.length - 12} more`);
      }
    } finally { rawSub.close(); }
  }
}

// ── Repair smoke (draft vs repaired, side by side; DOES spend) ────────────────
// Triggered by `--smoke --repair`. Real draft+repair model calls, NO judge.
// Cap the number of questions with `--convs`/`--abilities`/`--instance-ids`;
// prints at most the first `maxQ` questions (default 3 → ≤6 model calls).

async function repairSmoke(args: Args, maxQ = 3): Promise<void> {
  const embedder = createOllamaEmbedder();
  const answerClient = makeClient(args.model);
  const detectClient = makeClient(args.detectModel);
  let detectCost = 0, answerCost = 0, repairCost = 0;
  const detectLlm: ConsolidationLlm = async (system, user) => {
    const r = await detectClient.chat({ system, user, jsonMode: true, maxTokens: 1200 });
    detectCost += r.costUsd; return r.text;
  };
  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c));
  console.log(`[repair-smoke] answer=${args.model} detect=${args.detectModel} route=${JSON.stringify(args.route)} belief=${args.noBelief ? 'OFF' : [...args.beliefAbilities].join('+')}`);
  let shown = 0;
  for (const conv of convs) {
    if (shown >= maxQ) break;
    const rawSub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
    const obsAvailable = !args.noBelief && isIngested(args.obsMindsDir, conv);
    const obsSub = obsAvailable ? createSubstrate({ dbPath: mindPath(args.obsMindsDir, conv), embedder }) : null;
    const dateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv));
    try {
      const questions = loadConvQuestions(args.beamChats, conv)
        .filter(q => (!args.instanceIds || args.instanceIds.has(q.instanceId)) && (!args.abilities || args.abilities.has(q.memoryAbility)));
      for (const q of questions) {
        if (shown >= maxQ) break;
        const ctx = await buildMultiRouteContext(rawSub, q.gopId, q.question, dateMap, args.route);
        let bel: BeliefBlock = { block: null, nChains: 0, nGroups: 0 };
        if (!args.noBelief && args.beliefAbilities.has(q.memoryAbility) && obsSub) {
          bel = await buildBeliefBlock(obsSub, q.gopId, q.question, detectLlm, args.kBelief);
        }
        const prompt = buildAnswerGenerationPromptV2(q.question, ctx.displayStrings, undefined, bel.block ?? undefined);
        const ans = await answerClient.chat({ system: '', user: prompt, maxTokens: 4096 });
        answerCost += ans.costUsd;
        const draftAnswer = stripAns(ans.text);
        const repairPrompt = buildRepairPrompt(q.question, ctx.displayStrings, draftAnswer, undefined, bel.block ?? undefined);
        const rep = await answerClient.chat({ system: '', user: repairPrompt, maxTokens: 8192 });
        repairCost += rep.costUsd;
        const repaired = stripAns(rep.text);
        console.log(`\n════ conv ${conv} · ${q.memoryAbility} · ${q.instanceId}`);
        console.log(`Q: ${q.question}`);
        console.log(`ctx: fused=${ctx.nFused} dated=${ctx.nDated} belief=${bel.block ? `${bel.nChains}c/${bel.nGroups}g` : '—'}`);
        console.log(`\n──── DRAFT ────\n${draftAnswer}`);
        console.log(`\n──── REPAIRED ────\n${repaired}`);
        console.log(`\n[changed=${repaired !== draftAnswer}]  running cost=$${(answerCost + repairCost + detectCost).toFixed(4)}`);
        shown++;
      }
    } finally { rawSub.close(); if (obsSub) obsSub.close(); }
  }
  console.log(`\n[repair-smoke] done — ${shown} question(s), cost=$${(answerCost + repairCost + detectCost).toFixed(4)} (answer=$${answerCost.toFixed(4)} repair=$${repairCost.toFixed(4)} detect=$${detectCost.toFixed(4)})`);
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function run(args: Args): Promise<void> {
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });
  const modelSlug = args.model.replace(/[^a-z0-9.]+/gi, '-');
  const outPath = args.outPath ?? path.join(outDir, `beam-1m-${args.tag}-${modelSlug}.jsonl`);

  const doneIds = new Set<string>();
  if (fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const row = JSON.parse(t) as { instance_id?: string }; if (args.resume && row.instance_id) doneIds.add(row.instance_id); } catch { /* skip */ }
    }
    if (args.resume) console.log(`[multiroute] resume: ${doneIds.size} already answered in ${path.basename(outPath)}`);
    else if (fs.readFileSync(outPath, 'utf-8').trim()) console.warn(`[multiroute] WARNING: ${path.basename(outPath)} exists; appending WITHOUT --resume may duplicate rows.`);
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
  let beliefNonEmpty = 0, beliefEligible = 0;
  let repairCost = 0, repairChanged = 0, repairAbstainToAnswer = 0, repairAnswerToAbstain = 0;
  const ABSTAIN_SENTINEL = "I don't have enough information to answer this question.";
  const isAbstain = (s: string) => s.trim().toLowerCase().startsWith("i don't have enough information");
  const outStream = fs.createWriteStream(outPath, { flags: 'a' });

  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c));
  console.log(`[multiroute] answer=${args.model} judge=${args.judgeModel} detect=${args.detectModel} route=${JSON.stringify(args.route)} belief=${args.noBelief ? 'OFF' : [...args.beliefAbilities].join('+')} kBelief=${args.kBelief} budget=$${args.budget} convs=${convs.length}${args.instanceIds ? ` allowlist=${args.instanceIds.size}` : ''}`);

  for (const conv of convs) {
    if (budgetStopped) break;
    const questions = loadConvQuestions(args.beamChats, conv)
      .filter(q => !doneIds.has(q.instanceId)
        && (!args.instanceIds || args.instanceIds.has(q.instanceId))
        && (!args.abilities || args.abilities.has(q.memoryAbility)));
    if (questions.length === 0) continue;

    const rawSub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
    const obsAvailable = !args.noBelief && isIngested(args.obsMindsDir, conv);
    const obsSub = obsAvailable ? createSubstrate({ dbPath: mindPath(args.obsMindsDir, conv), embedder }) : null;
    const dateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv));
    try {
      for (const q of questions) {
        const spent = answerCost + judgeCost + detectCost;
        if (spent >= args.budget) { budgetStopped = true; console.warn(`[multiroute] budget $${args.budget} hit ($${spent.toFixed(2)})`); break; }

        // 1) multi-route dated context.
        const ctx = await buildMultiRouteContext(rawSub, q.gopId, q.question, dateMap, args.route);

        // 2) ability-gated belief block.
        let bel: BeliefBlock = { block: null, nChains: 0, nGroups: 0 };
        const beliefGated = !args.noBelief && args.beliefAbilities.has(q.memoryAbility);
        if (beliefGated && obsSub) {
          beliefEligible++;
          bel = await buildBeliefBlock(obsSub, q.gopId, q.question, detectLlm, args.kBelief);
          if (bel.block) beliefNonEmpty++;
        }

        // 3) answer (draft).
        const prompt = buildAnswerGenerationPromptV2(q.question, ctx.displayStrings, undefined, bel.block ?? undefined);
        answerPromptToks.push(approxTokens(prompt));
        const ans = await answerClient.chat({ system: '', user: prompt, maxTokens: 4096 });
        answerCost += ans.costUsd;
        const draftAnswer = stripAns(ans.text);

        // 3b) repair pass (E5 self-correction, gold-blind). Same model, same
        //     context; the repaired answer is what gets judged. Draft kept below.
        let answer = draftAnswer;
        if (args.repair) {
          const repairPrompt = buildRepairPrompt(q.question, ctx.displayStrings, draftAnswer, undefined, bel.block ?? undefined);
          // Repair asks for EXHAUSTIVE coverage → longer output than the draft, and
          // Sonnet-via-OpenRouter returns an empty HTTP-200 completion when its budget
          // is exhausted (this client treats non-gpt5 as non-reasoning, no auto-expand).
          // Give the repair pass more headroom so summaries don't come back empty.
          const rep = await answerClient.chat({ system: '', user: repairPrompt, maxTokens: 8192 });
          repairCost += rep.costUsd;
          const repaired = stripAns(rep.text);
          if (repaired) answer = repaired;  // empty repair → keep the draft (safe fallback)
          if (answer !== draftAnswer) repairChanged++;
          const dAbs = isAbstain(draftAnswer), rAbs = isAbstain(answer);
          if (dAbs && !rAbs) repairAbstainToAnswer++;
          if (!dAbs && rAbs) repairAnswerToAbstain++;
        }

        // 4) judge (canonical) — on the repaired answer when --repair, else draft.
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
          n_nuggets: q.rubric.length, cell: 'multiroute', prompt: 'v2',
          route: args.route, entities: ctx.entities, date_window: ctx.dateWindow ? ctx.dateWindow.label : null,
          n_vec: ctx.nVec, n_timeline: ctx.nTimeline, n_entity: ctx.nEntity, n_fused: ctx.nFused, n_dated: ctx.nDated,
          belief_gated: beliefGated, belief_used: !!bel.block, belief_chains: bel.nChains, belief_groups: bel.nGroups,
          answer_model: args.model, judge_model: args.judgeModel, detect_model: args.detectModel,
          ...(bel.block ? { belief_block: bel.block } : {}),
          repair: args.repair, ...(args.repair ? { draft_answer: draftAnswer, repair_changed: answer !== draftAnswer } : {}),
        }) + '\n');
        const flag = bel.block ? `bel(${bel.nChains}c/${bel.nGroups}g)` : (beliefGated ? 'bel(—)' : 'bel(gate)');
        const repFlag = args.repair ? (answer !== draftAnswer ? ' rep✎' : ' rep=') : '';
        process.stdout.write(`  [conv ${conv}] ${q.memoryAbility.padEnd(24)} E=${String(ctx.nEntity).padStart(2)} fuse=${String(ctx.nFused).padStart(2)} ${flag.padEnd(11)}${repFlag} score=${judgement.score.toFixed(2)} $${(answerCost + repairCost + judgeCost + detectCost).toFixed(3)}\n`);
      }
    } finally {
      rawSub.close();
      if (obsSub) obsSub.close();
    }
  }
  outStream.end();

  const metrics = computeBeamMetrics(perQuestion);
  const meanTok = answerPromptToks.length ? Math.round(answerPromptToks.reduce((s, x) => s + x, 0) / answerPromptToks.length) : 0;
  const totalCost = answerCost + repairCost + judgeCost + detectCost;
  const summaryPath = outPath.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    run: {
      cell: 'multiroute', dataset: 'beam-1m', answer_model: args.model, judge_model: args.judgeModel,
      detect_model: args.detectModel, prompt: 'v2', route: args.route, k_belief: args.kBelief,
      belief_abilities: args.noBelief ? [] : [...args.beliefAbilities],
      minds_dir: 'minds-1M (answer) + minds-1M-obs (belief)',
      mean_answer_prompt_tokens: meanTok,
      belief_eligible: beliefEligible, belief_nonempty: beliefNonEmpty, answered_now: perQuestion.length,
      repair: args.repair,
      ...(args.repair ? { repair_changed: repairChanged, repair_abstain_to_answer: repairAbstainToAnswer, repair_answer_to_abstain: repairAnswerToAbstain } : {}),
      budgetStopped,
    },
    metrics: { overall_avg_score: metrics.overall.avgScore, overall_pass_rate_pct: metrics.overall.accuracy, by_ability: metrics.byAbility },
    cost: { total_usd: totalCost, answer_usd: answerCost, repair_usd: repairCost, judge_usd: judgeCost, detect_usd: detectCost },
  }, null, 2) + '\n', 'utf-8');

  console.log('\n════════ BEAM 1M — multiroute ════════');
  console.log(formatBeamMetrics(metrics));
  console.log(`belief eligible ${beliefEligible}, non-empty ${beliefNonEmpty}`);
  if (args.repair) console.log(`repair: ON — changed ${repairChanged}/${perQuestion.length}, abstain→answer ${repairAbstainToAnswer}, answer→abstain ${repairAnswerToAbstain}`);
  console.log(`cost=$${totalCost.toFixed(4)} (answer=$${answerCost.toFixed(3)}${args.repair ? ` repair=$${repairCost.toFixed(3)}` : ''} judge=$${judgeCost.toFixed(3)} detect=$${detectCost.toFixed(3)})  answered_now=${perQuestion.length}  budgetStopped=${budgetStopped}`);
  console.log(`jsonl:   ${outPath}`);
  console.log(`summary: ${summaryPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.smoke && args.repair) { await repairSmoke(args); return; }
  if (args.smoke) { await smoke(args); return; }
  await run(args);
}

main().catch(err => { console.error('[beam-run-multiroute] FATAL:', err); process.exit(1); });
