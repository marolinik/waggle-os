#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — NULL-baseline runner.
 *
 * Per launch decision §G step 6 + §F + §A.5/A.7/A.10.
 *
 * Per Amendment 4 + binding texture-audit verdict, the corpus is 50/50 (PM
 * ratified). NULL-baseline measures each of 5 baseline prompt-shapes against
 * 8 stratified instances from the corpus to establish per-shape trio_strict_pass
 * baseline rate.
 *
 * --------------------------------------------------------------------------
 * MULTI-STEP MODE (vs solo) — design rationale
 * --------------------------------------------------------------------------
 *
 * Brief §2 says "Cell scope Faza 1: H3 only" and pilot Cell C labels H3 as
 * "Qwen solo". HOWEVER, Amendment 2 §3 retrieval_engagement_bonus only makes
 * sense if a retrieval tool is present (in solo mode, retrieval_calls always
 * = 0 → bonus pinned at -0.05 → fitness function cannot discriminate
 * candidates). Amendment 2 §6 Phase 5 forward-record acceptance criteria
 * (engagement parity ≥ Opus + score parity narrowed by ≥0.30 H4 trio_mean
 * delta) explicitly invoke retrieval-mode metrics.
 *
 * Resolution (BINDING for this runner): NULL-baseline runs in MULTI-STEP
 * mode with retrieval tool available. The "H3 cell" in Faza 1 GEPA context
 * means "Qwen-targeted evaluation with retrieval available", not pilot Cell
 * C strict "Qwen solo". This reconciles brief §2 with Amendment 2 + Phase 5
 * forward record, mirrors Phase 4.5 empirical setup (Cells B/D had
 * retrieval), and makes Amendment 2 fitness function meaningful.
 *
 * Documented in Checkpoint A halt-and-PM report for PM ratification or pivot.
 *
 * --------------------------------------------------------------------------
 * Cost projection (PM ratified ~$20):
 * --------------------------------------------------------------------------
 *
 * 5 shapes × 8 instances × ($0.50/eval avg) ≈ $20 expected
 *  - Subject: Qwen 3.6 35B-A3B (DashScope direct, ~$0.001/call × 2-3 calls)
 *  - Trio judges: Opus 4.7 + GPT-5.4 + MiniMax M2.7 × ($0.05/call avg) = $0.15/eval
 *  - Per pilot 2026-04-26 cost average = $0.47/cell
 *
 * Halt threshold (per launch decision §D + Amendment 3): if cumulative > $26
 * (30% over $20 expected), halt-and-PM per super-linear sub-rule.
 *
 * --------------------------------------------------------------------------
 * Sampling design:
 * --------------------------------------------------------------------------
 *
 * Same 8 instances across all 5 shapes (controlled comparison; trio_mean delta
 * is purely shape-attributable). Deterministic Mulberry32 with seed=42, then
 * take first 8 of shuffled corpus. Held-out 5 = next 5 (instances 9-13)
 * after the 8 — kept for Faza 1 §F.4 held-out validation.
 *
 * --------------------------------------------------------------------------
 * Usage:
 * --------------------------------------------------------------------------
 *
 *   npx tsx benchmarks/gepa/scripts/faza-1/run-null-baseline.ts --dry-run
 *     # No LLM call. Validates sampling + shape resolution + substrate setup.
 *
 *   npx tsx benchmarks/gepa/scripts/faza-1/run-null-baseline.ts --probe
 *     # Single (shape=qwen-thinking, instance=0). ~$0.50. Validates round-trip.
 *
 *   npx tsx benchmarks/gepa/scripts/faza-1/run-null-baseline.ts --all
 *     # Full 5×8 = 40 evaluations. ~$20 expected, $26 halt.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MindDB,
  FrameStore,
  SessionStore,
  HybridSearch,
  createOllamaEmbedder,
  type Embedder,
} from '@waggle/core';
import {
  runRetrievalAgentLoop,
  type LlmCallFn,
  type LlmCallInput,
  type LlmCallResult as AgentLlmCallResult,
  type RetrievalSearchFn,
  type AgentRunResult,
} from '@waggle/agent';

import { REGISTRY, selectShape } from '../../../../packages/agent/src/prompt-shapes/selector.js';
import { type PromptShape } from '../../../../packages/agent/src/prompt-shapes/types.js';

import { type CorpusInstance } from '../../src/faza-1/corpus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const CORPUS_JSONL = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl');
const OUT_DIR = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/null-baseline');
const OUT_JSONL = path.join(OUT_DIR, 'null-baseline-eval.jsonl');
const RUN_LOG = path.join(OUT_DIR, 'null-baseline-run.log');
const SUMMARY_JSON = path.join(OUT_DIR, 'null-baseline-summary.json');
const SCRATCH_DIR = path.join(REPO_ROOT, 'tmp/gepa-faza1-null-baseline');

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const OLLAMA_URL = 'http://localhost:11434';
const EMBEDDER_MODEL = 'nomic-embed-text';

const SAMPLING_SEED = 42;
const N_PER_SHAPE = 8;

// Shapes in fixed evaluation order (matches manifest v7 §gepa.shape_scope.targets)
const SHAPES = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'] as const;
type ShapeName = typeof SHAPES[number];

// Subject inheritance per manifest v7 §subject (= pilot 2026-04-26 runner SHA 8a6251e2)
const SUBJECT_ALIAS = 'qwen3.6-35b-a3b-via-dashscope-direct';
const SUBJECT_MAX_TOKENS = 16000;
const SUBJECT_THINKING = true;

// Judges inheritance per manifest v7 §judges (= pilot runner line 626)
const JUDGES = ['claude-opus-4-7', 'gpt-5.4', 'minimax-m27-via-openrouter'] as const;
const JUDGE_MAX_TOKENS = 3000;
const JUDGE_RETRIES = 3;

// Multi-step orchestration
const MAX_STEPS = 5;
const MAX_RETRIEVALS_PER_STEP = 8;
const PER_CALL_HALT_USD = 0.40;
const PER_CELL_HALT_USD = 1.00;

// Cost halt per launch decision §D (super-linear sub-rule per A.7)
const COST_HALT_USD = 26.0;  // 30% over $20 expected

// Pricing (per pilot runner line 128-133)
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7':                { in: 15.0, out: 75.0 },
  'gpt-5.4':                        { in: 2.5,  out: 10.0 },
  'minimax-m27-via-openrouter':     { in: 0.7,  out: 2.8 },
  'qwen3.6-35b-a3b-via-dashscope-direct': { in: 0.20, out: 0.80 },
  'qwen3.6-35b-a3b-via-openrouter':       { in: 0.6, out: 2.4 },
};

const MANIFEST_ANCHOR = 'manifest-v7-gepa-faza1';
const MANIFEST_SHA_AMENDMENT_4 = '1f7a6d6fa01403f6c8d6855893adbfa5e82898a81b7583cfa55628e5eba60196';

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(RUN_LOG, line); } catch { /* dir not yet created */ }
  process.stderr.write(line);
}

// ── CLI ────────────────────────────────────────────────────────────────────

interface Args {
  mode: 'dry-run' | 'probe' | 'all';
  probeShape?: ShapeName;
  probeInstanceIdx?: number;
}

function parseArgs(argv: string[]): Args {
  let mode: Args['mode'] = 'dry-run';
  let probeShape: ShapeName | undefined;
  let probeInstanceIdx: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--dry-run': mode = 'dry-run'; break;
      case '--probe':   mode = 'probe'; break;
      case '--all':     mode = 'all'; break;
      case '--probe-shape': probeShape = next as ShapeName; i++; break;
      case '--probe-instance': probeInstanceIdx = Number(next); i++; break;
    }
  }
  return { mode, probeShape, probeInstanceIdx };
}

// ── Deterministic sampling (Mulberry32, seed=42) ───────────────────────────

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(items: ReadonlyArray<T>, seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadCorpus(): CorpusInstance[] {
  const text = fs.readFileSync(CORPUS_JSONL, 'utf-8');
  return text.trim().split(/\n+/).filter(Boolean).map(l => JSON.parse(l) as CorpusInstance);
}

/**
 * Sample N=8 instances deterministically. Same set across all shapes (controlled
 * comparison). Held-out 5 are the next 5 after the sample (instances 9-13).
 */
function sampleInstances(corpus: CorpusInstance[], n: number, seed: number): CorpusInstance[] {
  const shuffled = deterministicShuffle(corpus, seed);
  return shuffled.slice(0, n);
}

// ── LiteLLM call adapter ──────────────────────────────────────────────────

const llmCall: LlmCallFn = async (input: LlmCallInput): Promise<AgentLlmCallResult> => {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) throw new Error('LITELLM_MASTER_KEY env not set');

  const { model, messages } = input;
  const isQwen = model.includes('qwen');
  const maxTokens = input.maxTokens ?? (isQwen ? SUBJECT_MAX_TOKENS : 4096);
  const thinking = input.thinking ?? (isQwen ? SUBJECT_THINKING : true);

  const payload: Record<string, unknown> = { model, messages, max_tokens: maxTokens };

  if (model.startsWith('claude-opus')) {
    payload.temperature = 1.0;
  } else if (model === 'gpt-5.4' || model === 'minimax-m27-via-openrouter') {
    // omit temperature — reasoning-model defaults
  } else {
    payload.temperature = input.temperature ?? 0.3;
  }

  if (isQwen) {
    payload.extra_body = { enable_thinking: thinking };
  }

  const started = Date.now();
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${LITELLM_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterKey}` },
        body: JSON.stringify(payload),
      });
      const d: any = await resp.json();
      if ('error' in d) {
        lastErr = String(d.error?.message ?? JSON.stringify(d.error)).slice(0, 200);
        if (attempt < 1) await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      const content = d.choices?.[0]?.message?.content ?? '';
      const usage = d.usage ?? {};
      const inTok = usage.prompt_tokens ?? 0;
      const outTok = usage.completion_tokens ?? 0;
      const pricing = MODEL_PRICING[model] ?? { in: 1, out: 4 };
      const costUsd = (inTok * pricing.in + outTok * pricing.out) / 1_000_000;
      return { content, inTokens: inTok, outTokens: outTok, costUsd, latencyMs: Date.now() - started };
    } catch (e) {
      lastErr = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 200);
      if (attempt < 1) await new Promise(r => setTimeout(r, 1500));
      continue;
    }
  }
  return { content: '', inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: Date.now() - started, error: lastErr ?? 'unknown error' };
};

// ── Trio judging (mirrors pilot 2026-04-26 runner line 545+) ───────────────

const JUDGE_PROMPT_TEMPLATE = `You are evaluating an AI agent's response to a complex knowledge work task. The persona, scenario, materials, and question are provided. The response was generated under one of four configurations (revealed only after scoring): {model_only | model + memory + agent harness} × {Opus 4.7 | Qwen 3.6 35B-A3B}.

You do NOT know which configuration produced this response. Score blind.

Read the persona/scenario/question (provided), skim the materials (provided), then read the response carefully (provided).

Score the response on six dimensions, Likert 1-5:

1. COMPLETENESS — engagement with all material
2. ACCURACY — faithfulness to source materials, no hallucinations
3. SYNTHESIS — connections across inputs, not isolated treatment
4. JUDGMENT — defensible recommendations, tradeoffs acknowledged
5. ACTIONABILITY — would the persona act on this tomorrow
6. STRUCTURE — organization and readability

Output JSON only:
{
  "completeness": <1-5>,
  "accuracy": <1-5>,
  "synthesis": <1-5>,
  "judgment": <1-5>,
  "actionability": <1-5>,
  "structure": <1-5>,
  "rationale": "<1-2 sentences explaining the lowest scoring dimension>",
  "overall_verdict": "<one of: PASS_STRONG | PASS_ADEQUATE | FAIL_WEAK | FAIL_CRITICAL>"
}

PASS_STRONG: mean >= 4.0
PASS_ADEQUATE: mean 3.5-3.99
FAIL_WEAK: mean 2.5-3.49
FAIL_CRITICAL: mean < 2.5

[PERSONA + SCENARIO + QUESTION]
###PERSONA_SCENARIO_QUESTION###

[MATERIALS]
###MATERIALS###

[RESPONSE TO EVALUATE]
###RESPONSE###`;

interface JudgeVerdict {
  completeness: number;
  accuracy: number;
  synthesis: number;
  judgment: number;
  actionability: number;
  structure: number;
  rationale: string;
  overall_verdict: string;
  mean: number;
}

interface JudgeRecord extends JudgeVerdict {
  judge_model: string;
  judge_cost_usd: number;
  judge_latency_ms: number;
  judge_retries: number;
}

const ZERO_VERDICT: JudgeVerdict = {
  completeness: 0, accuracy: 0, synthesis: 0, judgment: 0, actionability: 0, structure: 0,
  rationale: '__JUDGE_FAILED__', overall_verdict: 'FAIL_CRITICAL', mean: 0,
};

function parseJudgeJson(text: string): JudgeVerdict | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const dims = ['completeness', 'accuracy', 'synthesis', 'judgment', 'actionability', 'structure'] as const;
    for (const d of dims) {
      if (typeof obj[d] !== 'number' || obj[d] < 1 || obj[d] > 5) return null;
    }
    const mean = dims.reduce((s, d) => s + obj[d], 0) / dims.length;
    return {
      completeness: obj.completeness, accuracy: obj.accuracy, synthesis: obj.synthesis,
      judgment: obj.judgment, actionability: obj.actionability, structure: obj.structure,
      rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
      overall_verdict: typeof obj.overall_verdict === 'string' ? obj.overall_verdict : '',
      mean,
    };
  } catch { return null; }
}

function buildJudgePrompt(instance: CorpusInstance, response: string): string {
  return JUDGE_PROMPT_TEMPLATE
    .replace('###PERSONA_SCENARIO_QUESTION###', `${instance.personaText}\n\nQUESTION: ${instance.question}`)
    .replace('###MATERIALS###', instance.materialsConcat)
    .replace('###RESPONSE###', response);
}

async function runJudge(judgeModel: string, prompt: string): Promise<JudgeRecord> {
  let lastErr = '';
  let totalCost = 0, totalLatency = 0;
  for (let attempt = 0; attempt < JUDGE_RETRIES; attempt++) {
    const r = await llmCall({ model: judgeModel, messages: [{ role: 'user', content: prompt }], maxTokens: JUDGE_MAX_TOKENS, thinking: false });
    totalCost += r.costUsd; totalLatency += r.latencyMs;
    if (r.error) { lastErr = `attempt ${attempt + 1}: ${r.error}`; continue; }
    const parsed = parseJudgeJson(r.content);
    if (parsed) {
      return { ...parsed, judge_model: judgeModel, judge_cost_usd: totalCost, judge_latency_ms: totalLatency, judge_retries: attempt };
    }
    lastErr = `attempt ${attempt + 1}: malformed JSON: ${r.content.slice(0, 100)}`;
  }
  log(`[judge ${judgeModel}] FAILED after ${JUDGE_RETRIES}: ${lastErr}`);
  return { ...ZERO_VERDICT, judge_model: judgeModel, judge_cost_usd: totalCost, judge_latency_ms: totalLatency, judge_retries: JUDGE_RETRIES, rationale: `__JUDGE_FAILED__: ${lastErr}` };
}

interface TrioResult {
  records: JudgeRecord[];
  trioMean: number;
  trioStrictPassII: boolean;  // op (ii) — trio_mean >= 4.0
  trioStrictPassI: boolean;   // op (i) — >=2 of 3 judges with mean >= 3.5
  judgeCostTotal: number;
}

async function judgeTrio(instance: CorpusInstance, response: string): Promise<TrioResult> {
  const prompt = buildJudgePrompt(instance, response);
  const records = await Promise.all(JUDGES.map(j => runJudge(j, prompt)));
  const validMeans = records.filter(r => r.mean > 0).map(r => r.mean);
  const trioMean = validMeans.length > 0 ? validMeans.reduce((s, m) => s + m, 0) / validMeans.length : 0;
  const trioStrictPassII = trioMean >= 4.0;
  const trioStrictPassI = records.filter(r => r.mean >= 3.5).length >= 2;
  const judgeCostTotal = records.reduce((s, r) => s + r.judge_cost_usd, 0);
  return { records, trioMean, trioStrictPassII, trioStrictPassI, judgeCostTotal };
}

// ── Per-eval orchestration: run shape × instance via multi-step ───────────

interface EvalRecord {
  shape: ShapeName;
  instanceId: string;
  instanceCell: CorpusInstance['cell'];
  candidateResponse: string;
  candidateLatencyMs: number;
  candidateTokensIn: number;
  candidateTokensOut: number;
  candidateCostUsd: number;
  loopExhausted: boolean;
  stepsTaken: number;
  retrievalCalls: number;
  judges: { records: JudgeRecord[]; trioMean: number; trioStrictPassII: boolean; trioStrictPassI: boolean; judgeCostTotal: number };
  evalCostUsd: number;
  manifestAnchor: string;
  manifestShaAmendment4: string;
  tsIso: string;
}

async function runOneEval(shape: PromptShape, instance: CorpusInstance, embedder: Embedder): Promise<EvalRecord | { error: string }> {
  const evalId = `${shape.name}__${instance.instanceId}`;
  log(`[${evalId}] start`);

  // Per-eval SQLite + HybridSearch substrate (per pilot runner pattern)
  const dbPath = path.join(SCRATCH_DIR, `eval-${shape.name}-${instance.instanceId}.sqlite`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new MindDB(dbPath);
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const hybrid = new HybridSearch(db, embedder);

  const gopId = `gepa-faza1-null-${shape.name}-${instance.instanceId}`;
  sessions.ensure(gopId, undefined, `NULL-baseline ${shape.name} on ${instance.instanceId}`);

  // Ingest source documents
  for (const doc of instance.sourceDocuments) {
    const content = `## ${doc.title}\n\n${doc.body}`;
    frames.createIFrame(gopId, content, 'important', 'system');
  }
  log(`[${evalId}] ingested ${instance.sourceDocuments.length} frames`);

  // Retrieval adapter
  const searchAdapter: RetrievalSearchFn = async ({ query, limit }) => {
    const hits = await hybrid.search(query, { limit, gopId });
    const formatted = hits.length > 0
      ? hits.map((sr, i) => `[result ${i + 1}, score ${sr.finalScore.toFixed(3)}]\n${sr.frame.content}`).join('\n\n---\n\n')
      : '';
    return { formattedResults: formatted, resultCount: hits.length };
  };

  // Run multi-step retrieval agent loop
  let agentResult: AgentRunResult;
  try {
    agentResult = await runRetrievalAgentLoop({
      modelAlias: SUBJECT_ALIAS,
      persona: instance.personaText,
      question: instance.question,
      llmCall,
      search: searchAdapter,
      maxSteps: MAX_STEPS,
      maxRetrievalsPerStep: MAX_RETRIEVALS_PER_STEP,
      perCallHaltUsd: PER_CALL_HALT_USD,
      perCellHaltUsd: PER_CELL_HALT_USD,
      contextTag: evalId,
    });
  } catch (e) {
    const msg = `agent loop failed: ${(e as Error).message}`;
    log(`[${evalId}] ${msg}`);
    return { error: msg };
  }

  if (agentResult.errors.length > 0) {
    log(`[${evalId}] agent errors: ${agentResult.errors.join('; ').slice(0, 200)}`);
  }

  log(`[${evalId}] subject_done; retrievals=${agentResult.retrievalCalls} steps=${agentResult.stepsTaken} cost=$${agentResult.totalCostUsd.toFixed(4)} loop_exhausted=${agentResult.loopExhausted}`);

  // Judge response
  const judges = await judgeTrio(instance, agentResult.rawResponse);
  const evalCostUsd = agentResult.totalCostUsd + judges.judgeCostTotal;
  log(`[${evalId}] judged; trio_mean=${judges.trioMean.toFixed(3)} pass_ii=${judges.trioStrictPassII} pass_i=${judges.trioStrictPassI} eval_cost=$${evalCostUsd.toFixed(4)}`);

  return {
    shape: shape.name as ShapeName,
    instanceId: instance.instanceId,
    instanceCell: instance.cell,
    candidateResponse: agentResult.rawResponse,
    candidateLatencyMs: agentResult.totalLatencyMs,
    candidateTokensIn: agentResult.totalTokensIn,
    candidateTokensOut: agentResult.totalTokensOut,
    candidateCostUsd: agentResult.totalCostUsd,
    loopExhausted: agentResult.loopExhausted,
    stepsTaken: agentResult.stepsTaken,
    retrievalCalls: agentResult.retrievalCalls,
    judges,
    evalCostUsd,
    manifestAnchor: MANIFEST_ANCHOR,
    manifestShaAmendment4: MANIFEST_SHA_AMENDMENT_4,
    tsIso: new Date().toISOString(),
  };
}

// ── Aggregate per-shape metrics + κ across batch ──────────────────────────

interface ShapeAggregate {
  shape: ShapeName;
  nEvals: number;
  trioStrictPassRateII: number;       // op (ii) primary
  trioStrictPassRateI: number;        // op (i) supplementary
  meanRetrievalCallsPerTask: number;
  meanCandidateCostUsd: number;
  meanJudgeCostUsd: number;
  meanEvalCostUsd: number;
  totalEvalCostUsd: number;
  loopExhaustedRate: number;
  meanStepsTaken: number;
}

function aggregatePerShape(records: EvalRecord[]): ShapeAggregate[] {
  const byShape = new Map<ShapeName, EvalRecord[]>();
  for (const r of records) {
    if (!byShape.has(r.shape)) byShape.set(r.shape, []);
    byShape.get(r.shape)!.push(r);
  }
  const out: ShapeAggregate[] = [];
  for (const shape of SHAPES) {
    const rs = byShape.get(shape) ?? [];
    if (rs.length === 0) continue;
    const passII = rs.filter(r => r.judges.trioStrictPassII).length;
    const passI = rs.filter(r => r.judges.trioStrictPassI).length;
    const meanRetr = rs.reduce((s, r) => s + r.retrievalCalls, 0) / rs.length;
    const meanCandCost = rs.reduce((s, r) => s + r.candidateCostUsd, 0) / rs.length;
    const meanJudgeCost = rs.reduce((s, r) => s + r.judges.judgeCostTotal, 0) / rs.length;
    const meanEvalCost = rs.reduce((s, r) => s + r.evalCostUsd, 0) / rs.length;
    const totalEvalCost = rs.reduce((s, r) => s + r.evalCostUsd, 0);
    const exhaustedRate = rs.filter(r => r.loopExhausted).length / rs.length;
    const meanSteps = rs.reduce((s, r) => s + r.stepsTaken, 0) / rs.length;
    out.push({
      shape, nEvals: rs.length,
      trioStrictPassRateII: passII / rs.length,
      trioStrictPassRateI: passI / rs.length,
      meanRetrievalCallsPerTask: meanRetr,
      meanCandidateCostUsd: meanCandCost,
      meanJudgeCostUsd: meanJudgeCost,
      meanEvalCostUsd: meanEvalCost,
      totalEvalCostUsd: totalEvalCost,
      loopExhaustedRate: exhaustedRate,
      meanStepsTaken: meanSteps,
    });
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  if (!fs.existsSync(RUN_LOG)) fs.writeFileSync(RUN_LOG, '');

  const corpus = loadCorpus();
  log(`[loaded] corpus = ${corpus.length} instances from ${CORPUS_JSONL}`);

  const sample = sampleInstances(corpus, N_PER_SHAPE, SAMPLING_SEED);
  log(`[sampled] N=${N_PER_SHAPE} via seed=${SAMPLING_SEED}: ${sample.map(i => i.instanceId).join(', ')}`);

  if (args.mode === 'dry-run') {
    log(`[dry-run] would run ${SHAPES.length} shapes × ${N_PER_SHAPE} instances = ${SHAPES.length * N_PER_SHAPE} evals`);
    for (const shapeName of SHAPES) {
      const shape = REGISTRY[shapeName];
      const sysPrompt = shape.systemPrompt({ persona: sample[0].personaText, question: sample[0].question, isMultiStep: true });
      log(`[dry-run] shape=${shapeName} systemPrompt(multi-step)=${sysPrompt.length}c`);
    }
    log(`[dry-run] OK; no LLM call; cost: $0.00`);
    return;
  }

  // Resume support: skip evals already in JSONL
  const existing = new Set<string>();
  let cumulativeCost = 0;
  let allRecords: EvalRecord[] = [];
  if (fs.existsSync(OUT_JSONL)) {
    for (const line of fs.readFileSync(OUT_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean)) {
      try {
        const r = JSON.parse(line) as EvalRecord;
        const key = `${r.shape}__${r.instanceId}`;
        existing.add(key);
        cumulativeCost += r.evalCostUsd;
        allRecords.push(r);
      } catch { /* skip */ }
    }
    log(`[resume] loaded ${existing.size} existing evals; cumulative cost $${cumulativeCost.toFixed(4)}`);
  }

  const out = fs.createWriteStream(OUT_JSONL, { flags: existing.size > 0 ? 'a' : 'w' });

  const embedder = createOllamaEmbedder({ baseUrl: OLLAMA_URL, model: EMBEDDER_MODEL });

  const targetShapes = args.mode === 'probe' ? [args.probeShape ?? 'qwen-thinking'] : SHAPES;
  const targetInstances = args.mode === 'probe'
    ? [sample[args.probeInstanceIdx ?? 0]]
    : sample;

  for (const shapeName of targetShapes) {
    const shape = REGISTRY[shapeName];
    if (!shape) { log(`[error] shape "${shapeName}" not in REGISTRY`); continue; }
    for (const instance of targetInstances) {
      const key = `${shapeName}__${instance.instanceId}`;
      if (existing.has(key)) {
        log(`[skip] ${key} already in JSONL`);
        continue;
      }
      if (cumulativeCost >= COST_HALT_USD) {
        log(`[HALT] cumulative $${cumulativeCost.toFixed(4)} >= $${COST_HALT_USD} cost halt — stopping`);
        break;
      }
      const result = await runOneEval(shape, instance, embedder);
      if ('error' in result) {
        log(`[skip] ${key} due to: ${result.error}`);
        continue;
      }
      out.write(JSON.stringify(result) + '\n');
      cumulativeCost += result.evalCostUsd;
      allRecords.push(result);
      log(`[cumulative] $${cumulativeCost.toFixed(4)} / $${COST_HALT_USD} halt; ${allRecords.length} evals total`);
    }
  }
  out.end();

  // Aggregate + summary
  const aggregates = aggregatePerShape(allRecords);
  const summary = {
    manifestAnchor: MANIFEST_ANCHOR,
    manifestShaAmendment4: MANIFEST_SHA_AMENDMENT_4,
    samplingSeed: SAMPLING_SEED,
    nPerShape: N_PER_SHAPE,
    sampledInstanceIds: sample.map(i => i.instanceId),
    totalEvals: allRecords.length,
    totalCostUsd: +cumulativeCost.toFixed(6),
    perShape: aggregates,
    completedAtIso: new Date().toISOString(),
  };
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2), 'utf-8');
  log(`[done] ${allRecords.length} evals; total cost $${cumulativeCost.toFixed(4)}; summary written`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(2);
});
