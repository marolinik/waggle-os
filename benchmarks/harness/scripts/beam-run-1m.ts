#!/usr/bin/env tsx
/**
 * BEAM 1M — answer + graded-judge runner for the two memory cells.
 *
 *   --cell retrieval       : HybridSearch top-k over the per-conversation mind,
 *                            answer with gpt-4o (mem0 answer prompt), nugget judge.
 *   --cell hive_mind_ipb   : same retrieval, plus our structured I/P/B frame
 *                            writes + a lightweight contradiction check, run on a
 *                            COPY of the mind so the base ingest stays pristine
 *                            and the cell is re-runnable.
 *
 * PROTOCOL: gpt-4o answerer + validated nugget judge (beam-nugget-judge.ts) →
 * Avg Score (micro) + Pass Rate (>=0.5), overall + per-ability. This is the
 * comparable-to-mem0 pipeline. Retrieval reads the resumable minds built by
 * beam-ingest-1m.ts.
 *
 * RESUMABLE: results are appended to a per-cell, per-prompt JSONL as each
 * question finishes (default name carries the `prompt` variant so a v1 and a v2
 * run of the same cell/top-k never collide); on restart, instance_ids already
 * present are skipped, and a run refuses to append to a file whose rows carry a
 * different `prompt` tag. Cost is hard-capped (--budget) with a budgetStopped
 * guard (same as beam-smoke.ts).
 *
 * COST-SAFE PREP: `--estimate` runs retrieval ONLY (no gpt-4o spend) over the
 * already-ingested minds, measures the real assembled-prompt token size at the
 * chosen top-k, and projects full-700 answer + judge cost. Use this to choose
 * top-k before firing a paid run. `--estimate` needs at least one ingested mind.
 *
 * Questions + rubric are read directly from the BEAM repo probing_questions.json
 * (fast; identical instance_id scheme to the canonical), avoiding a 3 GB parse.
 *
 * Usage:
 *   # cost estimate (no spend), using whatever convs are already ingested:
 *   tsx benchmarks/harness/scripts/beam-run-1m.ts --cell retrieval --top-k 30 --estimate
 *   # real run (STOP-gated — only on explicit go):
 *   tsx benchmarks/harness/scripts/beam-run-1m.ts --cell hive_mind_ipb --top-k 30 \
 *       --budget 50 --resume
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import process from 'node:process';

import { createOllamaEmbedder } from '@waggle/core';
import type { SearchResult, MemoryFrame } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import type { Substrate } from '../src/substrate.js';
import { createBeamOpenAiClient, OPENAI_PRICING } from '../src/beam-openai-client.js';
import type { BeamOpenAiClient } from '../src/beam-openai-client.js';
import { buildAnswerGenerationPrompt, buildAnswerGenerationPromptV2, buildAnswerGenerationPromptV3, buildAnswerGenerationPromptV4, buildAnswerGenerationPromptV5, judgeQuestion } from '../src/beam-nugget-judge.js';
import type { BeamLlmResult } from '../src/beam-nugget-judge.js';
import { buildConvDateMap, renderMemories, computeDateHitRate } from '../src/beam-date-map.js';
import { mergeHybrid } from '../src/beam-hybrid.js';
import type { HybridMerge } from '../src/beam-hybrid.js';
import { computeBeamMetrics, formatBeamMetrics } from '../src/beam-metrics.js';
import type { BeamQuestionResult } from '../src/beam-metrics.js';

const CATEGORY_ANSWER_FIELDS = [
  'answer', 'ideal_response', 'ideal_answer', 'expected_compliance', 'ideal_summary',
];

type Cell = 'retrieval' | 'hive_mind_ipb' | 'distill' | 'hybrid';

interface Question {
  instanceId: string;
  conv: number;
  gopId: string;
  memoryAbility: string;
  question: string;
  rubric: string[];
  expected: string;
}

interface Args {
  cell: Cell;
  topK: number;
  /** hybrid only: raw turns retrieved from minds-1M (detail). */
  kRaw: number;
  /** hybrid only: distilled facts retrieved from minds-1M-obs (coverage). */
  kFact: number;
  model: string;
  budget: number;
  prompt: 'v1' | 'v2' | 'v3' | 'v4' | 'v5';
  /** when set, restrict to questions whose memory_ability is in this list. */
  abilities: string[] | null;
  outlineDir: string | null;
  directivesDir: string | null;
  shapeRoute: boolean;
  promptExplicit: boolean;
  estimate: boolean;
  resume: boolean;
  convs: number[];
  beamChats: string;
  mindsDir: string;
  mindsDirExplicit: boolean;
  /** hybrid only: fixed raw-turn + distilled-fact mind dirs (no mindsDir switch). */
  rawMindsDir: string;
  obsMindsDir: string;
  computeTau: boolean;
  perAbility?: number;
  outPath?: string;
  /** gold-blind routing: classify each question and dispatch per the route table. */
  route: boolean;
  /** path to the predicted-ability → {cell,prompt,k...} route table json. */
  routeTablePath: string;
  /** classifier-only mode: predict abilities + report accuracy, no answer/judge. */
  classifyOnly: boolean;
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
    cell: 'retrieval',
    topK: 30,
    kRaw: 15,
    kFact: 60,
    model: 'gpt-4o',
    budget: 50,
    prompt: 'v1',
    abilities: null,
    outlineDir: null,
    directivesDir: null,
    shapeRoute: false,
    promptExplicit: false,
    estimate: false,
    resume: false,
    convs: parseConvSpec('1-35'),
    beamChats: path.resolve(repoRoot, '..', 'BEAM', 'chats'),
    mindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M'),
    mindsDirExplicit: false,
    rawMindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M'),
    obsMindsDir: path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs'),
    computeTau: false,
    route: false,
    routeTablePath: path.join(repoRoot, 'benchmarks', 'results', 'beam', 'route-table-v1.json'),
    classifyOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--cell' && next) { a.cell = next as Cell; i++; }
    else if (f === '--top-k' && next) { a.topK = parseInt(next, 10); i++; }
    else if (f === '--k-raw' && next) { a.kRaw = parseInt(next, 10); i++; }
    else if (f === '--k-fact' && next) { a.kFact = parseInt(next, 10); i++; }
    else if (f === '--model' && next) { a.model = next; i++; }
    else if (f === '--budget' && next) { a.budget = parseFloat(next); i++; }
    else if (f === '--prompt' && next) {
      const v = next.toLowerCase();
      if (v !== 'v1' && v !== 'v2' && v !== 'v3' && v !== 'v4' && v !== 'v5') { console.error(`[beam-run-1m] --prompt must be v1, v2, v3, v4 or v5, got "${next}"`); process.exit(2); }
      a.prompt = v; a.promptExplicit = true; i++;
    }
    else if (f === '--abilities' && next) {
      a.abilities = next.split(',').map(s => s.trim()).filter(Boolean);
      i++;
    }
    else if (f === '--outline') {
      // Optional value: a directory of beam_1M_<conv>.outline.json files.
      if (next && !next.startsWith('--')) { a.outlineDir = path.resolve(next); i++; }
      else { a.outlineDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'outlines-1M'); }
    }
    else if (f === '--directives') {
      if (next && !next.startsWith('--')) { a.directivesDir = path.resolve(next); i++; }
      else { a.directivesDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'directives-1M'); }
    }
    else if (f === '--shape-route') { a.shapeRoute = true; }
    else if (f === '--estimate') { a.estimate = true; }
    else if (f === '--route') { a.route = true; }
    else if (f === '--route-table' && next) { a.routeTablePath = path.resolve(next); i++; }
    else if (f === '--classify-only') { a.classifyOnly = true; }
    else if (f === '--resume') { a.resume = true; }
    else if (f === '--tau') { a.computeTau = true; }
    else if (f === '--per-ability' && next) { a.perAbility = parseInt(next, 10); i++; }
    else if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--minds-dir' && next) { a.mindsDir = path.resolve(next); a.mindsDirExplicit = true; i++; }
    else if (f === '--beam-chats' && next) { a.beamChats = path.resolve(next); i++; }
    else if (f === '--out' && next) { a.outPath = path.resolve(next); i++; }
  }
  // The distill cell reads the observation (facts) minds unless overridden.
  if (a.cell === 'distill' && !a.mindsDirExplicit) {
    a.mindsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M-obs');
  }
  // Hybrid merges dated raw turns + dated facts and renders them chronologically:
  // v1 (undated) makes no sense here. Error if v1 was asked for explicitly;
  // otherwise default hybrid to v2. Hybrid always opens BOTH mind sets directly
  // (rawMindsDir + obsMindsDir), never via mindsDir switching.
  if (a.cell === 'hybrid') {
    if (a.promptExplicit && a.prompt === 'v1') {
      console.error('[beam-run-1m] --cell hybrid requires --prompt v2 (undated hybrid makes no sense); drop --prompt v1.');
      process.exit(2);
    }
    a.prompt = 'v2';
  }
  return a;
}

/** Deterministically take the first `perAbility` questions per memory_ability,
 *  in instance_id sort order — reproduces the no-context smoke's 50-instance
 *  sample when convs 1/10/11 are present, for a matched per-ability comparison. */
function sampleByAbility(questions: Question[], perAbility: number): Set<string> {
  const sorted = [...questions].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
  const counts = new Map<string, number>();
  const keep = new Set<string>();
  for (const q of sorted) {
    const n = counts.get(q.memoryAbility) ?? 0;
    if (n < perAbility) { keep.add(q.instanceId); counts.set(q.memoryAbility, n + 1); }
  }
  return keep;
}

// ── Question loading (from BEAM probing_questions.json) ──────────────────────

function normaliseAnswer(pq: Record<string, unknown>): string {
  for (const k of CATEGORY_ANSWER_FIELDS) {
    if (typeof pq[k] === 'string' && pq[k]) return pq[k] as string;
  }
  const rub = extractRubric(pq);
  return rub.join(' | ');
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
        conv,
        gopId: `beam_${conv}`,
        memoryAbility: category,
        question: q,
        rubric: extractRubric(pq),
        expected: normaliseAnswer(pq),
      });
    });
  }
  return out;
}

// ── Mind helpers ─────────────────────────────────────────────────────────────

function mindPath(mindsDir: string, conv: number): string {
  return path.join(mindsDir, `beam_1M_${conv}.mind`);
}
function isIngested(mindsDir: string, conv: number): boolean {
  return fs.existsSync(path.join(mindsDir, `beam_1M_${conv}.done.json`)) && fs.existsSync(mindPath(mindsDir, conv));
}

/** Copy a mind (+ WAL/SHM sidecars) to a scratch path for mutating ipb runs. */
function copyMind(src: string, dst: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const s = src + suffix;
    if (fs.existsSync(s)) fs.copyFileSync(s, dst + suffix);
  }
}

/** Sort retrieved results oldest-first (chronological proxy = frame id asc),
 *  mirroring mem0's created_at sort before answer generation. */
function memoriesFromResults(results: readonly SearchResult[]): string[] {
  return [...results]
    .sort((a, b) => a.frame.id - b.frame.id)
    .map(r => r.frame.content);
}

function approxTokens(s: string): number { return Math.max(1, Math.ceil(s.length / 4)); }

function chatJsonPath(beamChats: string, conv: number): string {
  return path.join(beamChats, '1M', String(conv), 'chat.json');
}

/** Build the answer-generation prompt for the selected variant. v1 leaves the
 *  memories untouched (byte-identical to the original); v2 date-stamps them and
 *  uses the Option-A prompt. */
function buildAnswerPrompt(
  args: Args, question: string, memories: string[], dateMap: Map<string, string> | null,
  outline?: string | null,
): string {
  // v3/v4 date-stamp exactly like v2; renderMemories only distinguishes v1.
  const display = renderMemories(memories, dateMap, args.prompt === 'v1' ? 'v1' : 'v2');
  if (args.prompt === 'v5') return buildAnswerGenerationPromptV5(question, display, outline ?? undefined);
  if (args.prompt === 'v4') return buildAnswerGenerationPromptV4(question, display, outline ?? undefined);
  if (args.prompt === 'v3') return buildAnswerGenerationPromptV3(question, display, outline ?? undefined);
  if (args.prompt === 'v2') return buildAnswerGenerationPromptV2(question, display, outline ?? undefined);
  return buildAnswerGenerationPrompt(question, display);
}

/** Load the per-conv conversation outline (session synopses built by
 *  beam-build-outlines.ts) and render it as the prompt's timeline block.
 *  Returns null when --outline is off or the file is missing (logged once). */
function loadOutline(args: Args, conv: number): string | null {
  if (!args.outlineDir) return null;
  const p = path.join(args.outlineDir, `beam_1M_${conv}.outline.json`);
  if (!fs.existsSync(p)) {
    console.warn(`[run][conv ${conv}] --outline set but ${p} missing — continuing without timeline`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as { sessions: Array<{ date: string; synopsis: string }> };
  return data.sessions.map(s => `[${s.date}]\n${s.synopsis}`).join('\n');
}

/** Load the per-conv standing directives (built by beam-build-directives.ts).
 *  Small verbatim dated preference/instruction lines — the "personal mind" lane. */
function loadDirectives(args: Args, conv: number): string | null {
  if (!args.directivesDir) return null;
  const p = path.join(args.directivesDir, `beam_1M_${conv}.json`);
  if (!fs.existsSync(p)) {
    console.warn(`[run][conv ${conv}] --directives set but ${p} missing — continuing without directives`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as { directives: Array<{ date: string; text: string }> };
  if (!data.directives.length) return null;
  return data.directives.map(d => `[${d.date}] ${d.text}`).join('\n');
}

/** Compose the labeled prompt preamble from the enabled lanes. */
function buildPreamble(directives: string | null, outline: string | null): string | null {
  const blocks: string[] = [];
  if (directives) {
    blocks.push(
      `USER'S STANDING PREFERENCES AND INSTRUCTIONS (verbatim, dated — honour these in every answer; ` +
      `when two conflict, the most recent wins):\n${directives}`,
    );
  }
  if (outline) {
    blocks.push(
      `CONVERSATION TIMELINE (one synopsis per session, oldest first — use for overview, ordering, and coverage; ` +
      `the retrieved memories below carry the exact details):\n${outline}`,
    );
  }
  return blocks.length ? blocks.join('\n\n') : null;
}

/** Coverage-shaped retrieval for summarization / event_ordering questions:
 *  search wide, then stratify (≤2 turns per date) and order chronologically —
 *  raw verbatim turns arranged for breadth/arc instead of similarity density. */
async function fetchCoverageShaped(
  substrate: Substrate, q: Question, dateMap: Map<string, string> | null, wide: number, cap: number,
): Promise<string[]> {
  const results = await substrate.search.search(q.question, { limit: wide, gopId: q.gopId });
  const dated = results.map(r => ({
    date: dateMap?.get(r.frame.content) ?? '',
    content: r.frame.content,
    id: r.frame.id,
  }));
  const perDate = new Map<string, number>();
  const kept: typeof dated = [];
  for (const e of dated) {
    const n = perDate.get(e.date) ?? 0;
    if (n >= 2) continue;
    perDate.set(e.date, n + 1);
    kept.push(e);
    if (kept.length >= cap) break;
  }
  kept.sort((a, b) => a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1);
  return kept.map(e => e.content);
}

/** For v2 only: build the per-conv date map (raw-turn minds only — the distill
 *  cell reads pre-dated distilled facts) and log the stamping hit-rate once. */
function prepareDateMap(args: Args, substrate: Substrate, conv: number): Map<string, string> | null {
  if (args.prompt === 'v1') return null;
  const dateMap = args.cell === 'distill' ? new Map<string, string>() : buildConvDateMap(chatJsonPath(args.beamChats, conv));
  const contents = substrate.frames.getGopFrames(`beam_${conv}`).map(f => f.content);
  const { dated, total } = computeDateHitRate(contents, dateMap);
  const pct = total ? ((100 * dated) / total).toFixed(1) + '%' : 'n/a (pre-dated)';
  console.log(`  [conv ${conv}] v2 date-stamp: dated ${dated}/${total} frames (${pct}), map=${dateMap.size} entries`);
  return dateMap;
}

/** hybrid: retrieve kRaw raw turns + kFact distilled facts (two minds, ONE
 *  embedder) and merge them into one chronologically-sorted, singly-dated list. */
async function fetchHybrid(
  args: Args, q: Question, rawSub: Substrate, obsSub: Substrate, dateMap: Map<string, string> | null,
): Promise<HybridMerge> {
  const rawResults = await rawSub.search.search(q.question, { limit: args.kRaw, gopId: q.gopId });
  const factResults = await obsSub.search.search(q.question, { limit: args.kFact, gopId: q.gopId });
  return mergeHybrid(rawResults, factResults, dateMap);
}

// ── ipb frame writes (ported from cells-ipb.ts) ──────────────────────────────

const SYSTEM_CONTRADICTION_CHECK =
  'You are a consistency checker. You are given a list of prior prediction statements and a list ' +
  'of retrieved memory excerpts. Respond with EXACTLY one line in the format: CONFLICT: <short ' +
  'description> OR NO_CONFLICT — no other text. A conflict exists only when a retrieved excerpt ' +
  'directly contradicts a specific factual claim in a prior prediction (same entity, incompatible ' +
  'values). Superficial overlap or topic similarity is NOT a conflict.';

function buildContradictionCheckPrompt(priors: readonly MemoryFrame[], retrieved: readonly SearchResult[]): string {
  const p = priors.map((f, i) => `[prior_${i + 1}] ${f.content}`).join('\n');
  const r = retrieved.slice(0, 10).map((x, i) => `[retrieved_${i + 1}] ${x.frame.content}`).join('\n');
  return `## Prior predictions\n${p}\n\n## Retrieved memories\n${r}\n\nDo any retrieved memories directly contradict any prior prediction? Respond with CONFLICT: <description> or NO_CONFLICT.`;
}

// ── Estimate mode (no gpt-4o spend) ──────────────────────────────────────────

/** Is a reasoning model (gpt-5 / o-series)? Reasoning tokens are billed as
 *  output, so a hybrid cost projection must assume a bigger output budget. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model.toLowerCase());
}

/** Hybrid estimate: open BOTH minds per conv, build the merged v2 answer prompt
 *  for every question, measure its token size, and project full-700 answer +
 *  judge cost using the SELECTED model's pricing. No LLM calls (retrieval is
 *  local ollama; token sizing is char/4). */
async function runHybridEstimate(args: Args): Promise<void> {
  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c) && isIngested(args.obsMindsDir, c));
  if (convs.length === 0) {
    console.error('[beam-run-1m estimate] hybrid needs BOTH minds ingested (minds-1M + minds-1M-obs). Found none.');
    process.exit(2);
  }
  console.log(`[estimate] cell=hybrid prompt=${args.prompt} kRaw=${args.kRaw} kFact=${args.kFact} model=${args.model} using ${convs.length} conv(s): ${convs.join(',')}`);

  const embedder = createOllamaEmbedder();
  const promptToks: number[] = [];
  const mergedCounts: number[] = [];
  let rawDatedAll = 0, rawTotalAll = 0, nuggetTotal = 0, qCount = 0;

  for (const conv of convs) {
    const rawSub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
    const obsSub = createSubstrate({ dbPath: mindPath(args.obsMindsDir, conv), embedder });
    try {
      const dateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv));
      const questions = loadConvQuestions(args.beamChats, conv);
      let cRawDated = 0, cRawTotal = 0, cMerged = 0;
      const cTok: number[] = [];
      for (const q of questions) {
        const merged = await fetchHybrid(args, q, rawSub, obsSub, dateMap);
        const prompt = buildAnswerGenerationPromptV2(q.question, merged.displayStrings);
        const t = approxTokens(prompt);
        promptToks.push(t); cTok.push(t);
        mergedCounts.push(merged.entries.length); cMerged += merged.entries.length;
        rawDatedAll += merged.rawDated; rawTotalAll += merged.rawTotal;
        cRawDated += merged.rawDated; cRawTotal += merged.rawTotal;
        nuggetTotal += q.rubric.length; qCount++;
      }
      const hit = cRawTotal ? ((100 * cRawDated) / cRawTotal).toFixed(1) + '%' : 'n/a';
      const meanTok = cTok.length ? Math.round(cTok.reduce((s, x) => s + x, 0) / cTok.length) : 0;
      console.log(`  [conv ${conv}] hybrid kRaw=${args.kRaw} kFact=${args.kFact} raw-date-hit=${hit} merged(mean)=${(cMerged / (questions.length || 1)).toFixed(1)} meanPromptTok=${meanTok}`);
    } finally {
      rawSub.close();
      obsSub.close();
    }
  }

  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const meanPromptTok = mean(promptToks);
  const meanNuggets = nuggetTotal / (qCount || 1);
  const meanMerged = mean(mergedCounts);
  const overallHit = rawTotalAll ? ((100 * rawDatedAll) / rawTotalAll).toFixed(1) + '%' : 'n/a';

  // Project with the SELECTED model's pricing (answerer == judge == args.model).
  const pricing = OPENAI_PRICING[args.model] ?? OPENAI_PRICING['gpt-5'];
  const IN = pricing.inputPerMillion / 1e6, OUT = pricing.outputPerMillion / 1e6;
  const reasoning = isReasoningModel(args.model);
  const answerOutTok = reasoning ? 800 : 200;   // gpt-5 spends hidden reasoning tokens (billed as output)
  const judgeBoilerplateTok = 750;              // nugget judge prompt scaffold
  const judgeOutTok = reasoning ? 400 : 45;
  const perQAnswerUsd = meanPromptTok * IN + answerOutTok * OUT;
  // judge sees question + answer (~15% of the answer prompt) per nugget.
  const perQJudgeUsd = meanNuggets * ((judgeBoilerplateTok + meanPromptTok * 0.15) * IN + judgeOutTok * OUT);
  const perQ = perQAnswerUsd + perQJudgeUsd;
  const full700 = perQ * 700;

  console.log(`\n════════ COST ESTIMATE (hybrid, ${args.model}, 700 questions) ════════`);
  console.log(`sampled questions:         ${qCount}`);
  console.log(`kRaw/kFact:                ${args.kRaw}/${args.kFact}`);
  console.log(`overall raw-date hit-rate: ${overallHit}`);
  console.log(`mean merged entries:       ${meanMerged.toFixed(1)} (raw+facts)`);
  console.log(`mean merged prompt tokens: ${meanPromptTok.toFixed(0)}`);
  console.log(`mean nuggets/question:     ${meanNuggets.toFixed(2)}`);
  console.log(`pricing:                   $${pricing.inputPerMillion}/M in, $${pricing.outputPerMillion}/M out (answerOut≈${answerOutTok}, judgeOut≈${judgeOutTok})`);
  console.log(`per-question answer:  $${perQAnswerUsd.toFixed(4)}`);
  console.log(`per-question judge:   $${perQJudgeUsd.toFixed(4)}`);
  console.log(`per-question TOTAL:   $${perQ.toFixed(4)}`);
  console.log(`──────────────────────────────────────────────────────`);
  console.log(`FULL 700 cell cost:   $${full700.toFixed(2)}`);
}

async function runEstimate(args: Args): Promise<void> {
  if (args.cell === 'hybrid') { await runHybridEstimate(args); return; }
  const ingestedConvs = args.convs.filter(c => isIngested(args.mindsDir, c));
  if (ingestedConvs.length === 0) {
    console.error('[beam-run-1m estimate] no ingested minds found. Ingest at least one conversation first.');
    process.exit(2);
  }
  console.log(`[estimate] cell=${args.cell} prompt=${args.prompt} top-k=${args.topK} using ${ingestedConvs.length} ingested conv(s): ${ingestedConvs.join(',')}`);

  const embedder = createOllamaEmbedder();
  const promptToks: number[] = [];
  let nuggetTotal = 0;
  let qCount = 0;
  const abilitySet = args.abilities ? new Set(args.abilities) : null;
  if (abilitySet) console.log(`[estimate] abilities filter → {${[...abilitySet].join(', ')}}`);

  for (const conv of ingestedConvs) {
    const substrate = createSubstrate({ dbPath: mindPath(args.mindsDir, conv), embedder });
    try {
      const dateMap = prepareDateMap(args, substrate, conv);
      const outline = buildPreamble(loadDirectives(args, conv), loadOutline(args, conv));
      const questions = loadConvQuestions(args.beamChats, conv)
        .filter(q => !abilitySet || abilitySet.has(q.memoryAbility));
      for (const q of questions) {
        const results = await substrate.search.search(q.question, { limit: args.topK, gopId: q.gopId });
        const memories = memoriesFromResults(results);
        const prompt = buildAnswerPrompt(args, q.question, memories, dateMap, outline);
        promptToks.push(approxTokens(prompt));
        nuggetTotal += q.rubric.length;
        qCount++;
      }
    } finally {
      substrate.close();
    }
  }

  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const meanPromptTok = mean(promptToks);
  const meanNuggets = nuggetTotal / (qCount || 1);

  // gpt-4o pricing.
  const IN = 2.5 / 1e6, OUT = 10 / 1e6;
  const answerOutTok = 200;            // mem0-style full-sentence answers
  const judgeBoilerplateTok = 750;     // nugget judge prompt scaffold
  const judgeOutTok = 45;
  const perQAnswerUsd = meanPromptTok * IN + answerOutTok * OUT;
  const perQJudgeUsd = meanNuggets * ((judgeBoilerplateTok + meanPromptTok * 0.15) * IN + judgeOutTok * OUT);
  const perQIpbUsd = args.cell === 'hive_mind_ipb' ? (meanPromptTok * 0.5 * IN + 30 * OUT) : 0; // ~contradiction check on q2..20
  const perQ = perQAnswerUsd + perQJudgeUsd + perQIpbUsd;
  const full700 = perQ * 700;

  console.log('\n════════ COST ESTIMATE (gpt-4o, 700 questions) ════════');
  console.log(`sampled questions:        ${qCount}`);
  console.log(`mean answer-prompt tokens: ${meanPromptTok.toFixed(0)} (top-k=${args.topK} raw turns)`);
  console.log(`mean nuggets/question:     ${meanNuggets.toFixed(2)}`);
  console.log(`per-question answer:  $${perQAnswerUsd.toFixed(4)}`);
  console.log(`per-question judge:   $${perQJudgeUsd.toFixed(4)}`);
  if (perQIpbUsd) console.log(`per-question ipb chk: $${perQIpbUsd.toFixed(4)}`);
  console.log(`per-question TOTAL:   $${perQ.toFixed(4)}`);
  console.log(`──────────────────────────────────────────────────────`);
  console.log(`FULL 700 cell cost:   $${full700.toFixed(2)}`);
  console.log(`(extrapolate other top-k linearly on the answer-prompt token term)`);
}

// ── Real run ─────────────────────────────────────────────────────────────────

async function runCell(args: Args): Promise<void> {
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });
  // The answer-prompt variant is part of the identity of a run: v1 and v2 must
  // NEVER share a JSONL (or its derived .summary.json), or a paid v1-vs-v2
  // comparison is corrupted. Keep `prompt` in the default filename.
  // Hybrid's retrieval budget is (kRaw, kFact), not top-k → name the file by both
  // so a hybrid run never collides with a top-k retrieval/distill file.
  const outPath = args.outPath ?? path.join(
    outDir,
    args.cell === 'hybrid'
      ? `beam-1m-hybrid-${args.prompt}-kraw${args.kRaw}-kfact${args.kFact}.jsonl`
      : `beam-1m-${args.cell}-${args.prompt}-topk${args.topK}.jsonl`,
  );

  // Resume / append safety. When the target file already exists (default path,
  // or an explicit --out), refuse to mix answer-prompt variants into one file:
  // the per-row `prompt` tag makes each row self-describing, but the summary
  // metrics and any whole-file consumer would be silently contaminated. On a
  // matching prompt, collect already-answered instance ids for --resume.
  const doneIds = new Set<string>();
  if (fs.existsSync(outPath)) {
    const existingIds = new Set<string>();
    let existingPrompt: string | null = null;
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      let row: { instance_id?: string; prompt?: string };
      try { row = JSON.parse(t) as { instance_id?: string; prompt?: string }; } catch { continue; }
      if (row.prompt && row.prompt !== args.prompt) {
        console.error(
          `[beam-run-1m] refusing to write ${path.basename(outPath)}: it already contains ` +
          `prompt="${row.prompt}" rows but this run is prompt="${args.prompt}". ` +
          `Pass a fresh --out path (or delete the file) so the v1-vs-v2 comparison stays clean.`,
        );
        process.exit(2);
      }
      if (row.prompt) existingPrompt = row.prompt;
      if (row.instance_id) existingIds.add(row.instance_id);
    }
    if (args.resume) {
      for (const id of existingIds) doneIds.add(id);
      console.log(`[run] resume: ${doneIds.size} questions already answered in ${path.basename(outPath)}`);
    } else if (existingIds.size > 0) {
      console.warn(
        `[run] WARNING: appending to existing ${path.basename(outPath)} ` +
        `(${existingIds.size} rows, prompt=${existingPrompt ?? 'untagged'}) without --resume; ` +
        `rows will be duplicated. Use --resume or a fresh --out.`,
      );
    }
  }

  const client = createBeamOpenAiClient({ model: args.model });
  const embedder = createOllamaEmbedder();
  const perQuestion: BeamQuestionResult[] = [];
  const answerPromptToks: number[] = [];
  let costUsd = 0;
  let budgetStopped = false;
  const acc = (r: BeamLlmResult): void => { costUsd += r.costUsd; };
  const outStream = fs.createWriteStream(outPath, { flags: 'a' });

  const convs = args.cell === 'hybrid'
    ? args.convs.filter(c => isIngested(args.rawMindsDir, c) && isIngested(args.obsMindsDir, c))
    : args.convs.filter(c => isIngested(args.mindsDir, c));

  // Optional memory_ability restriction (e.g. --abilities summarization,event_ordering).
  const abilitySet = args.abilities ? new Set(args.abilities) : null;
  if (abilitySet) console.log(`[run] abilities filter → {${[...abilitySet].join(', ')}}`);

  // Optional per-ability sampling (for the matched-to-smoke pilot): the first
  // N per memory_ability in instance_id order, drawn from the ingested convs.
  let allowed: Set<string> | null = null;
  if (args.perAbility) {
    const allQ = convs.flatMap(c => loadConvQuestions(args.beamChats, c))
      .filter(q => !abilitySet || abilitySet.has(q.memoryAbility));
    allowed = sampleByAbility(allQ, args.perAbility);
    console.log(`[run] per-ability=${args.perAbility} → ${allowed.size} sampled questions`);
  }

  const mindsLabel = args.cell === 'hybrid' ? 'minds-1M+obs' : path.basename(args.mindsDir);
  const budgetLabel = args.cell === 'hybrid' ? `kRaw=${args.kRaw} kFact=${args.kFact}` : `top-k=${args.topK}`;
  console.log(`[run] cell=${args.cell} prompt=${args.prompt} ${budgetLabel} model=${args.model} budget=$${args.budget} minds=${mindsLabel} convs=${convs.length}`);

  for (const conv of convs) {
    if (budgetStopped) break;
    const questions = loadConvQuestions(args.beamChats, conv)
      .filter(q => !doneIds.has(q.instanceId) && (!allowed || allowed.has(q.instanceId)) && (!abilitySet || abilitySet.has(q.memoryAbility)));
    if (questions.length === 0) continue;

    // ── hybrid: open BOTH minds (raw detail + distilled facts), merge each
    // question's retrieval into one chronologically-dated list, answer with v2. ──
    if (args.cell === 'hybrid') {
      const rawSub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
      const obsSub = createSubstrate({ dbPath: mindPath(args.obsMindsDir, conv), embedder });
      const dateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv));
      let cRawDated = 0, cRawTotal = 0, cMerged = 0, cQ = 0;
      const cTok: number[] = [];
      try {
        for (const q of questions) {
          if (costUsd >= args.budget) { budgetStopped = true; console.warn(`[run] budget $${args.budget} hit`); break; }

          const { answer, promptTokens, merged } = await answerQuestionHybrid(args, q, rawSub, obsSub, client, acc, dateMap);
          answerPromptToks.push(promptTokens);
          cTok.push(promptTokens);
          cRawDated += merged.rawDated; cRawTotal += merged.rawTotal;
          cMerged += merged.entries.length; cQ++;

          const { judgement, llmResults } = await judgeQuestion(
            client,
            { question: q.question, rubric: q.rubric, memoryAbility: q.memoryAbility, answer },
            { computeTau: args.computeTau },
          );
          for (const r of llmResults) acc(r);

          perQuestion.push({ instanceId: q.instanceId, memoryAbility: q.memoryAbility, score: judgement.score, ...(judgement.error ? { error: judgement.error } : {}) });
          outStream.write(JSON.stringify({
            instance_id: q.instanceId, conv, memory_ability: q.memoryAbility, question: q.question,
            answer, score: judgement.score, judgment: judgement.judgment, nugget_scores: judgement.nuggetScores,
            ...(judgement.scoreWithTau !== undefined ? { score_with_tau: judgement.scoreWithTau } : {}),
            n_nuggets: q.rubric.length, cell: args.cell, prompt: args.prompt,
            k_raw: args.kRaw, k_fact: args.kFact, merged_entries: merged.entries.length,
          }) + '\n');
          process.stdout.write(`  [conv ${conv}] ${q.memoryAbility.padEnd(24)} score=${judgement.score.toFixed(2)} $${costUsd.toFixed(3)}\n`);
        }
      } finally {
        rawSub.close();
        obsSub.close();
      }
      const hit = cRawTotal ? ((100 * cRawDated) / cRawTotal).toFixed(1) + '%' : 'n/a';
      const meanTok = cTok.length ? Math.round(cTok.reduce((s, x) => s + x, 0) / cTok.length) : 0;
      console.log(`  [conv ${conv}] hybrid kRaw=${args.kRaw} kFact=${args.kFact} raw-date-hit=${hit} merged(mean)=${(cMerged / (cQ || 1)).toFixed(1)} meanPromptTok=${meanTok}`);
      continue;
    }

    // ipb mutates the mind → run on a scratch copy so the base ingest stays pristine.
    let dbPath = mindPath(args.mindsDir, conv);
    let scratch: string | null = null;
    if (args.cell === 'hive_mind_ipb') {
      scratch = path.join(args.mindsDir, `_scratch_ipb_${conv}.mind`);
      for (const s of ['', '-wal', '-shm']) if (fs.existsSync(scratch + s)) fs.rmSync(scratch + s, { force: true });
      copyMind(dbPath, scratch);
      dbPath = scratch;
    }

    const substrate = createSubstrate({ dbPath, embedder });
    try {
      const dateMap = prepareDateMap(args, substrate, conv);
      const preamble = buildPreamble(loadDirectives(args, conv), loadOutline(args, conv));
      for (const q of questions) {
        if (costUsd >= args.budget) { budgetStopped = true; console.warn(`[run] budget $${args.budget} hit`); break; }

        const { answer, promptTokens, shaped } = await answerQuestion(args, q, substrate, client, acc, dateMap, preamble);
        answerPromptToks.push(promptTokens);
        const { judgement, llmResults } = await judgeQuestion(
          client,
          { question: q.question, rubric: q.rubric, memoryAbility: q.memoryAbility, answer },
          { computeTau: args.computeTau },
        );
        for (const r of llmResults) acc(r);

        perQuestion.push({ instanceId: q.instanceId, memoryAbility: q.memoryAbility, score: judgement.score, ...(judgement.error ? { error: judgement.error } : {}) });
        outStream.write(JSON.stringify({
          instance_id: q.instanceId, conv, memory_ability: q.memoryAbility, question: q.question,
          answer, score: judgement.score, judgment: judgement.judgment, nugget_scores: judgement.nuggetScores,
          ...(judgement.scoreWithTau !== undefined ? { score_with_tau: judgement.scoreWithTau } : {}),
          n_nuggets: q.rubric.length, cell: args.cell, prompt: args.prompt, top_k: args.topK,
          ...(shaped ? { shaped } : {}),
          ...(args.directivesDir ? { directives: true } : {}),
        }) + '\n');
        process.stdout.write(`  [conv ${conv}] ${q.memoryAbility.padEnd(24)} score=${judgement.score.toFixed(2)} $${costUsd.toFixed(3)}\n`);
      }
    } finally {
      substrate.close();
      if (scratch) for (const s of ['', '-wal', '-shm']) if (fs.existsSync(scratch + s)) fs.rmSync(scratch + s, { force: true });
    }
  }
  outStream.end();

  const metrics = computeBeamMetrics(perQuestion);
  const meanAnsPromptTok = answerPromptToks.length
    ? Math.round(answerPromptToks.reduce((s, x) => s + x, 0) / answerPromptToks.length) : 0;
  const summaryPath = outPath.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    run: {
      cell: args.cell, dataset: 'beam-1m', model: args.model, judge_model: args.model,
      prompt: args.prompt, outline: args.outlineDir ? path.basename(args.outlineDir) : null,
      directives: args.directivesDir ? path.basename(args.directivesDir) : null,
      shape_route: args.shapeRoute || undefined,
      // Retrieval budget disclosure (mem0 discloses top-200; we disclose unit + token size).
      // Hybrid discloses (kRaw, kFact) instead of a single top-k.
      ...(args.cell === 'hybrid'
        ? { k_raw: args.kRaw, k_fact: args.kFact }
        : { top_k: args.topK }),
      retrieval_unit: args.cell === 'hybrid'
        ? 'raw_turns+distilled_facts'
        : args.cell === 'distill' ? 'distilled_facts' : 'raw_turns',
      mean_answer_prompt_tokens: meanAnsPromptTok,
      minds_dir: args.cell === 'hybrid' ? 'minds-1M+minds-1M-obs' : path.basename(args.mindsDir),
      per_ability: args.perAbility ?? null,
      budgetStopped, answered_now: perQuestion.length,
    },
    metrics: { overall_avg_score: metrics.overall.avgScore, overall_pass_rate_pct: metrics.overall.accuracy, by_ability: metrics.byAbility },
    cost: { total_usd: costUsd },
  }, null, 2) + '\n', 'utf-8');

  console.log('\n════════ BEAM 1M — ' + args.cell + ' ════════');
  console.log(formatBeamMetrics(metrics));
  console.log(`cost=$${costUsd.toFixed(4)}  answered_now=${perQuestion.length}  budgetStopped=${budgetStopped}`);
  console.log(`jsonl:   ${outPath}`);
  console.log(`summary: ${summaryPath}`);
}

interface AnswerOut { answer: string; promptTokens: number; retrieved: number; shaped?: string }

function stripAns(text: string): string {
  return text.includes('ANSWER:') ? text.split('ANSWER:').pop()!.trim() : text.trim();
}

async function answerQuestion(
  args: Args, q: Question, substrate: Substrate, client: BeamOpenAiClient, acc: (r: BeamLlmResult) => void,
  dateMap: Map<string, string> | null, outline: string | null = null,
): Promise<AnswerOut> {
  // Confidence-gated shape routing: ONLY summarization / event_ordering are
  // reliably text-detectable (measured recall 5/5, precision 0.62-0.83); for
  // those, swap similarity-dense top-k for coverage-shaped chronological
  // retrieval. Everything else falls through to the default path unchanged.
  if (args.shapeRoute && args.cell === 'retrieval') {
    const { predicted } = await classifyAbility(client, q.question, acc);
    if (predicted === 'summarization' || predicted === 'event_ordering') {
      const memories = await fetchCoverageShaped(substrate, q, dateMap, 100, 40);
      const ans = await client.chat({ system: '', user: buildAnswerPrompt(args, q.question, memories, dateMap, outline), maxTokens: 4096 });
      acc(ans);
      return { answer: stripAns(ans.text), promptTokens: ans.inputTokens, retrieved: memories.length, shaped: predicted };
    }
  }
  if (args.cell === 'hive_mind_ipb') {
    // P-frame (query intent).
    const latestI = substrate.frames.getLatestIFrame(q.gopId);
    const pFrame = latestI
      ? substrate.frames.createPFrame(q.gopId, `Retrieving to answer: ${q.question}`, latestI.id, 'normal', 'agent_inferred')
      : substrate.frames.createIFrame(q.gopId, `Retrieving to answer: ${q.question}`, 'normal', 'agent_inferred');
    const results = await substrate.search.search(q.question, { limit: args.topK, gopId: q.gopId });
    // Contradiction check when prior P-frames exist.
    const priors = substrate.frames.getGopFrames(q.gopId).filter(f => f.frame_type === 'P' && f.id !== pFrame.id && f.t < pFrame.t);
    if (priors.length > 0 && results.length > 0) {
      const chk = await client.chat({ system: SYSTEM_CONTRADICTION_CHECK, user: buildContradictionCheckPrompt(priors, results), maxTokens: 60 });
      acc(chk);
      if (chk.text.trim().startsWith('CONFLICT:')) {
        substrate.frames.createBFrame(q.gopId, chk.text.trim().slice('CONFLICT:'.length).trim(), pFrame.id, results.slice(0, 5).map(r => r.frame.id));
      }
    }
    const memories = memoriesFromResults(results);
    const ans = await client.chat({ system: '', user: buildAnswerPrompt(args, q.question, memories, dateMap, outline), maxTokens: 4096 });
    acc(ans);
    const answer = stripAns(ans.text);
    substrate.frames.createIFrame(q.gopId, `Q: ${q.question} A: ${answer}`, 'normal', 'import');
    return { answer, promptTokens: ans.inputTokens, retrieved: results.length };
  }
  // retrieval / distill cell (read-only; distill retrieves facts from minds-1M-obs).
  const results = await substrate.search.search(q.question, { limit: args.topK, gopId: q.gopId });
  const memories = memoriesFromResults(results);
  const ans = await client.chat({ system: '', user: buildAnswerPrompt(args, q.question, memories, dateMap, outline), maxTokens: 4096 });
  acc(ans);
  return { answer: stripAns(ans.text), promptTokens: ans.inputTokens, retrieved: results.length };
}

/** hybrid: shared answer step (dual-mind retrieve → merge → v2 answer). Extracted
 *  so BOTH the plain `--cell hybrid` run and the router dispatch the SAME code
 *  path — the caller keeps ownership of judging/logging. Byte-identical to the
 *  former inline block. Uses args.kRaw/args.kFact (route passes an effArgs). */
async function answerQuestionHybrid(
  args: Args, q: Question, rawSub: Substrate, obsSub: Substrate,
  client: BeamOpenAiClient, acc: (r: BeamLlmResult) => void, dateMap: Map<string, string> | null,
): Promise<{ answer: string; promptTokens: number; merged: HybridMerge }> {
  const merged = await fetchHybrid(args, q, rawSub, obsSub, dateMap);
  const ans = await client.chat({ system: '', user: buildAnswerGenerationPromptV2(q.question, merged.displayStrings), maxTokens: 4096 });
  acc(ans);
  return { answer: stripAns(ans.text), promptTokens: ans.inputTokens, merged };
}

// ── Gold-blind router (classifier + route table) ─────────────────────────────

/** The 10 BEAM abilities — the classifier's closed label set AND the true-label
 *  space. Kept identical to the dataset `memory_ability` category keys. */
const ROUTE_ABILITIES = [
  'abstention', 'contradiction_resolution', 'event_ordering', 'information_extraction',
  'instruction_following', 'knowledge_update', 'multi_session_reasoning',
  'preference_following', 'summarization', 'temporal_reasoning',
] as const;
const ABILITY_SET = new Set<string>(ROUTE_ABILITIES);

/** Classifier system prompt: one-line definition per ability. The router sees
 *  ONLY the question text (never the stored memory_ability / gold), so routing is
 *  gold-blind. It must return strict JSON: {"ability":"<one of the 10 labels>"}. */
const CLASSIFIER_SYSTEM = [
  'You are a query router for a long-term-memory benchmark. Read ONLY the user question below and decide which SINGLE memory ability it primarily tests.',
  'Respond with STRICT JSON and nothing else: {"ability":"<label>"}. The label MUST be exactly one of these 10:',
  '- abstention: asks for information the user never provided / that is not in memory; the correct behaviour is to admit not knowing rather than fabricate.',
  '- contradiction_resolution: targets a fact the user stated inconsistently over time; requires detecting and reconciling the conflicting statements.',
  '- event_ordering: asks for the chronological order or sequence in which multiple events, steps, or discussions happened.',
  '- information_extraction: asks to retrieve one or more specific factual details (names, versions, numbers, configs) that were explicitly stated earlier.',
  '- instruction_following: asks for advice, steps, or a response that must obey the user\'s previously stated instructions, rules, or constraints.',
  '- knowledge_update: asks for the current value of a fact that changed over time; requires using the latest update, not a stale earlier value.',
  '- multi_session_reasoning: requires combining facts spread across multiple sessions or topics to infer an answer not stated verbatim in any single place.',
  '- preference_following: asks for a recommendation or choice that should honour the user\'s previously stated preferences.',
  '- summarization: asks for a summary or overview of a topic, a process, or the overall conversation.',
  '- temporal_reasoning: asks about durations, dates, or time spans between events (e.g. how many days/weeks between X and Y).',
].join('\n');

function normaliseLabel(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Parse the classifier's JSON reply into a normalised ability label. Tolerant:
 *  JSON → regex-extract → substring-match; returns the raw normalised string if
 *  it names no known ability (that row counts as a miss / falls to _default). */
function parseAbility(text: string): string {
  const trimmed = (text ?? '').trim();
  let raw: string | null = null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    if (o && typeof o.ability === 'string') raw = o.ability;
  } catch { /* fall through */ }
  if (raw === null) {
    const m = trimmed.match(/"ability"\s*:\s*"([^"]+)"/i);
    if (m) raw = m[1];
  }
  if (raw === null) {
    const lower = trimmed.toLowerCase();
    for (const ab of ROUTE_ABILITIES) if (lower.includes(ab)) return ab;
    return 'unknown';
  }
  const norm = normaliseLabel(raw);
  if (ABILITY_SET.has(norm)) return norm;
  for (const ab of ROUTE_ABILITIES) if (norm.includes(ab) || ab.includes(norm)) return ab;
  return norm;
}

/** Gold-blind classify: one gpt-5 call over the question TEXT only. */
async function classifyAbility(
  client: BeamOpenAiClient, question: string, acc: (r: BeamLlmResult) => void,
): Promise<{ predicted: string; result: BeamLlmResult }> {
  const result = await client.chat({
    system: CLASSIFIER_SYSTEM,
    user: `QUESTION:\n${question}`,
    jsonMode: true,
    maxTokens: 200,
  });
  acc(result);
  return { predicted: parseAbility(result.text), result };
}

interface RouteEntry { cell: Cell; prompt: 'v1' | 'v2'; kRaw?: number; kFact?: number; topK?: number }
type RouteTable = Record<string, RouteEntry>;

const VALID_CELLS = new Set<Cell>(['retrieval', 'hive_mind_ipb', 'distill', 'hybrid']);

/** Load + validate the predicted-ability → cell/prompt/k route table. Must carry
 *  a `_default` entry; each entry names a valid cell and prompt (hybrid ⇒ v2). */
function loadRouteTable(p: string): RouteTable {
  if (!fs.existsSync(p)) { console.error(`[route] route table not found: ${p}`); process.exit(2); }
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { console.error(`[route] route table is not valid JSON: ${(e as Error).message}`); process.exit(2); }
  if (!parsed || typeof parsed !== 'object') { console.error('[route] route table must be a JSON object'); process.exit(2); }
  const table = parsed as Record<string, unknown>;
  if (!table['_default']) { console.error('[route] route table must contain a "_default" entry'); process.exit(2); }
  const out: RouteTable = {};
  for (const [key, v] of Object.entries(table)) {
    if (!v || typeof v !== 'object') { console.error(`[route] entry "${key}" must be an object`); process.exit(2); }
    const e = v as Record<string, unknown>;
    const cell = String(e.cell) as Cell;
    if (!VALID_CELLS.has(cell)) { console.error(`[route] entry "${key}" has invalid cell "${String(e.cell)}"`); process.exit(2); }
    const prompt = String(e.prompt ?? 'v2');
    if (prompt !== 'v1' && prompt !== 'v2') { console.error(`[route] entry "${key}" prompt must be v1|v2`); process.exit(2); }
    if (cell === 'hybrid' && prompt !== 'v2') { console.error(`[route] entry "${key}": hybrid requires prompt v2`); process.exit(2); }
    out[key] = {
      cell, prompt,
      ...(typeof e.kRaw === 'number' ? { kRaw: e.kRaw } : {}),
      ...(typeof e.kFact === 'number' ? { kFact: e.kFact } : {}),
      ...(typeof e.topK === 'number' ? { topK: e.topK } : {}),
    };
  }
  return out;
}

/** Build a per-question effective Args from a route entry (immutable copy). The
 *  EXISTING per-cell answer functions read cell/prompt/topK/kRaw/kFact off Args,
 *  so this is how routing reuses them without forking any answer logic. */
function effArgsFrom(base: Args, e: RouteEntry): Args {
  return {
    ...base,
    cell: e.cell,
    prompt: e.prompt,
    topK: e.topK ?? base.topK,
    kRaw: e.kRaw ?? base.kRaw,
    kFact: e.kFact ?? base.kFact,
  };
}

// ── --classify-only (cheap; no retrieval / answer / judge) ────────────────────

function printConfusion(rows: { true_ability: string; predicted_ability: string }[]): void {
  if (rows.length === 0) { console.log('[classify] no rows classified'); return; }
  const correct = rows.filter(r => r.true_ability === r.predicted_ability).length;
  const acc = (100 * correct) / rows.length;
  console.log('\n════════ CLASSIFIER ACCURACY ════════');
  console.log(`overall: ${acc.toFixed(1)}% (${correct}/${rows.length})`);
  const byTrue = new Map<string, { n: number; ok: number }>();
  for (const r of rows) {
    const e = byTrue.get(r.true_ability) ?? { n: 0, ok: 0 };
    e.n++; if (r.true_ability === r.predicted_ability) e.ok++;
    byTrue.set(r.true_ability, e);
  }
  console.log('per-true-ability recall:');
  for (const ab of [...byTrue.keys()].sort()) {
    const e = byTrue.get(ab)!;
    console.log(`  ${ab.padEnd(26)} ${e.ok}/${e.n}`);
  }
  const miss = rows.filter(r => r.true_ability !== r.predicted_ability);
  if (miss.length) {
    console.log('misclassifications (true → predicted):');
    for (const r of miss) console.log(`  ${r.true_ability.padEnd(26)} → ${r.predicted_ability}`);
  }
}

async function runClassifyOnly(args: Args): Promise<void> {
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = args.outPath ?? path.join(outDir, `beam-1m-classify-${args.model}.jsonl`);

  // classify-only needs NO minds — load questions straight from the probing json.
  let questions = args.convs.flatMap(c => loadConvQuestions(args.beamChats, c));
  if (args.perAbility) {
    const keep = sampleByAbility(questions, args.perAbility);
    questions = questions.filter(q => keep.has(q.instanceId));
  }

  const doneIds = new Set<string>();
  if (args.resume && fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const row = JSON.parse(t) as { instance_id?: string }; if (row.instance_id) doneIds.add(row.instance_id); } catch { /* skip */ }
    }
    console.log(`[classify] resume: ${doneIds.size} already classified in ${path.basename(outPath)}`);
  }
  questions = questions.filter(q => !doneIds.has(q.instanceId));

  const classifier = createBeamOpenAiClient({ model: args.model });
  const outStream = fs.createWriteStream(outPath, { flags: 'a' });
  const rows: { instance_id: string; true_ability: string; predicted_ability: string }[] = [];
  let costUsd = 0;
  const acc = (r: BeamLlmResult): void => { costUsd += r.costUsd; };

  console.log(`[classify-only] model=${args.model} questions=${questions.length} budget=$${args.budget}`);
  for (const q of questions) {
    if (costUsd >= args.budget) { console.warn(`[classify] budget $${args.budget} hit`); break; }
    const { predicted } = await classifyAbility(classifier, q.question, acc);
    const row = { instance_id: q.instanceId, true_ability: q.memoryAbility, predicted_ability: predicted };
    outStream.write(JSON.stringify(row) + '\n');
    rows.push(row);
    const hit = predicted === q.memoryAbility ? 'ok  ' : 'MISS';
    process.stdout.write(`  ${q.memoryAbility.padEnd(24)} → ${predicted.padEnd(24)} ${hit} $${costUsd.toFixed(3)}\n`);
  }
  outStream.end();

  printConfusion(rows);
  console.log(`cost=$${costUsd.toFixed(4)}  classified=${rows.length}`);
  console.log(`jsonl: ${outPath}`);
}

// ── --route (classify → dispatch through existing per-cell logic) ─────────────

async function runRoute(args: Args): Promise<void> {
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });

  const table = loadRouteTable(args.routeTablePath);
  const outPath = args.outPath ?? path.join(outDir, `beam-1m-route-${args.model}.jsonl`);

  // Routed rows carry MIXED prompts by design → no prompt-tag guard; just collect
  // already-answered instance_ids when --resume.
  const doneIds = new Set<string>();
  if (fs.existsSync(outPath)) {
    const existing = new Set<string>();
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const row = JSON.parse(t) as { instance_id?: string }; if (row.instance_id) existing.add(row.instance_id); } catch { /* skip */ }
    }
    if (args.resume) { for (const id of existing) doneIds.add(id); console.log(`[route] resume: ${doneIds.size} already answered in ${path.basename(outPath)}`); }
    else if (existing.size > 0) console.warn(`[route] WARNING: appending to existing ${path.basename(outPath)} (${existing.size} rows) without --resume; rows may duplicate.`);
  }

  const client = createBeamOpenAiClient({ model: args.model });
  const classifier = createBeamOpenAiClient({ model: args.model }); // fresh, gold-blind router
  const embedder = createOllamaEmbedder();
  const outStream = fs.createWriteStream(outPath, { flags: 'a' });

  const perQuestion: BeamQuestionResult[] = [];
  const answerPromptToks: number[] = [];
  const cellCounts: Record<string, number> = {};
  let routerCorrect = 0, routerTotal = 0;
  let costUsd = 0, budgetStopped = false;
  const acc = (r: BeamLlmResult): void => { costUsd += r.costUsd; };

  // Routed cells span raw (retrieval/hybrid), obs (distill/hybrid) and a mutating
  // ipb scratch copy → require BOTH base minds ingested (matches the hybrid cell).
  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c) && isIngested(args.obsMindsDir, c));

  let allowed: Set<string> | null = null;
  if (args.perAbility) {
    const allQ = convs.flatMap(c => loadConvQuestions(args.beamChats, c));
    allowed = sampleByAbility(allQ, args.perAbility);
    console.log(`[route] per-ability=${args.perAbility} → ${allowed.size} sampled questions`);
  }

  console.log(`[route] table=${path.basename(args.routeTablePath)} model=${args.model} budget=$${args.budget} convs=${convs.length}`);

  for (const conv of convs) {
    if (budgetStopped) break;
    const questions = loadConvQuestions(args.beamChats, conv)
      .filter(q => !doneIds.has(q.instanceId) && (!allowed || allowed.has(q.instanceId)));
    if (questions.length === 0) continue;

    // Lazily-opened per-conv substrates (correct-over-optimal; all closed below).
    let rawSub: Substrate | null = null;   // minds-1M     (retrieval + hybrid raw)
    let obsSub: Substrate | null = null;   // minds-1M-obs (distill + hybrid facts)
    let ipbSub: Substrate | null = null;   // scratch COPY of minds-1M (hive_mind_ipb mutates)
    let ipbScratch: string | null = null;
    let rawDateMap: Map<string, string> | null = null;
    let rawDateMapBuilt = false;
    const emptyDateMap = new Map<string, string>(); // distill facts are pre-dated

    const getRaw = (): Substrate => (rawSub ??= createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder }));
    const getObs = (): Substrate => (obsSub ??= createSubstrate({ dbPath: mindPath(args.obsMindsDir, conv), embedder }));
    const getIpb = (): Substrate => {
      if (!ipbSub) {
        ipbScratch = path.join(args.rawMindsDir, `_scratch_route_ipb_${conv}.mind`);
        for (const s of ['', '-wal', '-shm']) if (fs.existsSync(ipbScratch + s)) fs.rmSync(ipbScratch + s, { force: true });
        copyMind(mindPath(args.rawMindsDir, conv), ipbScratch);
        ipbSub = createSubstrate({ dbPath: ipbScratch, embedder });
      }
      return ipbSub;
    };
    const getRawDateMap = (): Map<string, string> => {
      if (!rawDateMapBuilt) { rawDateMap = buildConvDateMap(chatJsonPath(args.beamChats, conv)); rawDateMapBuilt = true; }
      return rawDateMap!;
    };

    try {
      for (const q of questions) {
        if (costUsd >= args.budget) { budgetStopped = true; console.warn(`[route] budget $${args.budget} hit`); break; }

        // gold-blind classify (question text only) → predicted → route entry.
        const { predicted } = await classifyAbility(classifier, q.question, acc);
        const entry = table[predicted] ?? table['_default'];
        const eff = effArgsFrom(args, entry);
        routerTotal++;
        if (predicted === q.memoryAbility) routerCorrect++;
        cellCounts[eff.cell] = (cellCounts[eff.cell] ?? 0) + 1;

        // Dispatch through the EXISTING per-cell answer logic (no answer fork).
        let answer: string; let promptTokens: number; let mergedEntries: number | null = null;
        if (eff.cell === 'hybrid') {
          const r = await answerQuestionHybrid(eff, q, getRaw(), getObs(), client, acc, getRawDateMap());
          answer = r.answer; promptTokens = r.promptTokens; mergedEntries = r.merged.entries.length;
        } else {
          const substrate = eff.cell === 'retrieval' ? getRaw() : eff.cell === 'distill' ? getObs() : getIpb();
          const dateMap = eff.prompt === 'v2' ? (eff.cell === 'distill' ? emptyDateMap : getRawDateMap()) : null;
          const r = await answerQuestion(eff, q, substrate, client, acc, dateMap);
          answer = r.answer; promptTokens = r.promptTokens;
        }
        answerPromptToks.push(promptTokens);

        const { judgement, llmResults } = await judgeQuestion(
          client,
          { question: q.question, rubric: q.rubric, memoryAbility: q.memoryAbility, answer },
          { computeTau: args.computeTau },
        );
        for (const r of llmResults) acc(r);

        perQuestion.push({ instanceId: q.instanceId, memoryAbility: q.memoryAbility, score: judgement.score, ...(judgement.error ? { error: judgement.error } : {}) });
        outStream.write(JSON.stringify({
          instance_id: q.instanceId, conv, memory_ability: q.memoryAbility, question: q.question,
          answer, score: judgement.score, judgment: judgement.judgment, nugget_scores: judgement.nuggetScores,
          ...(judgement.scoreWithTau !== undefined ? { score_with_tau: judgement.scoreWithTau } : {}),
          n_nuggets: q.rubric.length, cell: eff.cell, prompt: eff.prompt,
          ...(eff.cell === 'hybrid'
            ? { k_raw: eff.kRaw, k_fact: eff.kFact, merged_entries: mergedEntries }
            : { top_k: eff.topK }),
          // ── routing diagnostics ──
          predicted_ability: predicted, true_ability: q.memoryAbility, routed_cell: eff.cell, routed_prompt: eff.prompt,
        }) + '\n');
        const hit = predicted === q.memoryAbility ? 'ok  ' : 'MISS';
        process.stdout.write(`  [conv ${conv}] ${q.memoryAbility.padEnd(22)} pred=${predicted.padEnd(22)} ${hit} → ${eff.cell}/${eff.prompt} score=${judgement.score.toFixed(2)} $${costUsd.toFixed(3)}\n`);
      }
    } finally {
      if (rawSub) rawSub.close();
      if (obsSub) obsSub.close();
      if (ipbSub) ipbSub.close();
      if (ipbScratch) for (const s of ['', '-wal', '-shm']) if (fs.existsSync(ipbScratch + s)) fs.rmSync(ipbScratch + s, { force: true });
    }
  }
  outStream.end();

  const metrics = computeBeamMetrics(perQuestion);
  const meanAnsPromptTok = answerPromptToks.length ? Math.round(answerPromptToks.reduce((s, x) => s + x, 0) / answerPromptToks.length) : 0;
  const routerAcc = routerTotal ? (100 * routerCorrect) / routerTotal : 0;
  const summaryPath = outPath.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    run: {
      cell: 'route', dataset: 'beam-1m', model: args.model, judge_model: args.model,
      route_table: path.basename(args.routeTablePath),
      router_accuracy_pct: Math.round(routerAcc * 10) / 10, router_correct: routerCorrect, router_total: routerTotal,
      cell_distribution: cellCounts,
      mean_answer_prompt_tokens: meanAnsPromptTok,
      per_ability: args.perAbility ?? null,
      budgetStopped, answered_now: perQuestion.length,
    },
    metrics: { overall_avg_score: metrics.overall.avgScore, overall_pass_rate_pct: metrics.overall.accuracy, by_ability: metrics.byAbility },
    cost: { total_usd: costUsd },
  }, null, 2) + '\n', 'utf-8');

  console.log('\n════════ BEAM 1M — route ════════');
  console.log(`router accuracy: ${routerAcc.toFixed(1)}% (${routerCorrect}/${routerTotal})  cell_dist=${JSON.stringify(cellCounts)}`);
  console.log(formatBeamMetrics(metrics));
  console.log(`cost=$${costUsd.toFixed(4)}  answered_now=${perQuestion.length}  budgetStopped=${budgetStopped}`);
  console.log(`jsonl:   ${outPath}`);
  console.log(`summary: ${summaryPath}`);
}

/** Approximate route estimate (no paid calls): classifier overhead + the
 *  _default cell's answer/judge cost, sized on ingested minds. Not exact — the
 *  true mix depends on the (unrun) classifier — but bounds the spend. */
async function runRouteEstimate(args: Args): Promise<void> {
  const table = loadRouteTable(args.routeTablePath);
  const def = effArgsFrom(args, table['_default']);
  const convs = args.convs.filter(c => isIngested(args.rawMindsDir, c));
  if (convs.length === 0) { console.error('[route estimate] no ingested minds found (minds-1M).'); process.exit(2); }

  const embedder = createOllamaEmbedder();
  const promptToks: number[] = []; const qToks: number[] = [];
  let nuggetTotal = 0, qCount = 0;
  for (const conv of convs) {
    const sub = createSubstrate({ dbPath: mindPath(args.rawMindsDir, conv), embedder });
    try {
      const dateMap = def.prompt === 'v2' ? buildConvDateMap(chatJsonPath(args.beamChats, conv)) : null;
      for (const q of loadConvQuestions(args.beamChats, conv)) {
        const results = await sub.search.search(q.question, { limit: def.topK, gopId: q.gopId });
        const memories = memoriesFromResults(results);
        promptToks.push(approxTokens(buildAnswerPrompt(def, q.question, memories, dateMap)));
        qToks.push(approxTokens(q.question));
        nuggetTotal += q.rubric.length; qCount++;
      }
    } finally { sub.close(); }
  }

  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
  const meanPromptTok = mean(promptToks), meanQTok = mean(qToks), meanNuggets = nuggetTotal / (qCount || 1);
  const pricing = OPENAI_PRICING[args.model] ?? OPENAI_PRICING['gpt-5'];
  const IN = pricing.inputPerMillion / 1e6, OUT = pricing.outputPerMillion / 1e6;
  const reasoning = isReasoningModel(args.model);
  const classifierIn = approxTokens(CLASSIFIER_SYSTEM) + meanQTok;
  const classifierOut = reasoning ? 200 : 20;
  const answerOut = reasoning ? 800 : 200, judgeBoiler = 750, judgeOut = reasoning ? 400 : 45;
  const perQClassify = classifierIn * IN + classifierOut * OUT;
  const perQAnswer = meanPromptTok * IN + answerOut * OUT;
  const perQJudge = meanNuggets * ((judgeBoiler + meanPromptTok * 0.15) * IN + judgeOut * OUT);
  const perQ = perQClassify + perQAnswer + perQJudge;

  console.log(`\n════════ COST ESTIMATE (route, ${args.model}, 700 questions, approx) ════════`);
  console.log(`sampled questions:          ${qCount} (answer/judge sized on _default cell=${def.cell} top-k=${def.topK})`);
  console.log(`mean answer-prompt tokens:  ${meanPromptTok.toFixed(0)}`);
  console.log(`mean nuggets/question:      ${meanNuggets.toFixed(2)}`);
  console.log(`per-question classify: $${perQClassify.toFixed(4)}`);
  console.log(`per-question answer:   $${perQAnswer.toFixed(4)}`);
  console.log(`per-question judge:    $${perQJudge.toFixed(4)}`);
  console.log(`per-question TOTAL:    $${perQ.toFixed(4)}`);
  console.log('──────────────────────────────────────────────────────');
  console.log(`FULL 700 route cost:  $${(perQ * 700).toFixed(2)}  (approx; classifier + _default-sized answer/judge)`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.classifyOnly) { await runClassifyOnly(args); return; }
  if (args.estimate) { if (args.route) { await runRouteEstimate(args); } else { await runEstimate(args); } return; }
  if (args.route) { await runRoute(args); return; }
  await runCell(args);
}

main().catch(err => { console.error('[beam-run-1m] FATAL:', err); process.exit(1); });
