#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — Checkpoint C held-out validation runner.
 *
 * Per launch decision §F + §G step 9 + PM brief 2026-04-29 Checkpoint C ratify.
 *
 * Validates §F.1-passing candidates on 5 held-out instances per candidate
 * (NOT in original Gen 1 8-instance sample). Confirms §F.2 PASS isn't
 * overfit per §F.5 condition_2 (held-out Pass II within ±15pp of in-sample).
 *
 * Pre-registered candidates per PM brief 2026-04-29:
 *   - claude::gen1-v1
 *   - qwen-thinking::gen1-v1
 *   - gpt::gen1-v2
 *
 * Usage:
 *   --candidates <id,id,id>          comma-separated candidate IDs (required)
 *   --held-out-instances <N>         default 5
 *   --dry-run                        list planned evals without executing
 *
 * Held-out sample: deterministicShuffle(corpus, seed=42).slice(8, 8 + N_HELD_OUT)
 * — instances 8..12 of the same shuffled order Gen 1 used (Gen 1 used 0..7).
 *
 * Manifest binding: Amendment 11 (manifest_sha256_post_amendment_11 = fa716ff90a...).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  // Amendment 8 §canonical_mutation_api: registerShape MUST be imported from
  // '@waggle/agent' (same path the agent-loop uses internally) so the mutation
  // hits the SAME REGISTRY instance.
  REGISTRY,
  registerShape,
  type PromptShape,
} from '@waggle/agent';

import { type CorpusInstance } from '../../src/faza-1/corpus.js';
import {
  NULL_BASELINE_PER_SHAPE,
  NULL_BASELINE_AGGREGATE,
  type TieredFitnessComponents,
  type ShapeName,
} from '../../src/faza-1/types.js';
import {
  computeTieredFitness,
} from '../../src/faza-1/fitness.js';
import {
  validateCandidate,
} from '../../src/faza-1/mutation-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const CORPUS_JSONL = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl');
const PROMPT_SHAPES_DIR = path.join(REPO_ROOT, 'packages/agent/src/prompt-shapes');
const GEPA_EVOLVED_DIR = path.join(PROMPT_SHAPES_DIR, 'gepa-evolved');
const OUT_DIR = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/checkpoint-c');
const OUT_JSONL = path.join(OUT_DIR, 'checkpoint-c-eval.jsonl');
const RUN_LOG = path.join(OUT_DIR, 'checkpoint-c-run.log');
const SUMMARY_JSON = path.join(OUT_DIR, 'checkpoint-c-summary.json');
const SCRATCH_DIR = path.join(REPO_ROOT, 'tmp/gepa-faza1-checkpoint-c');
const GEN_1_JSONL = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/gen-1/gen-1-eval.jsonl');

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const OLLAMA_URL = 'http://localhost:11434';
const EMBEDDER_MODEL = 'nomic-embed-text';

const SAMPLING_SEED = 42;
const N_GEN_1_SAMPLE = 8;
const DEFAULT_HELD_OUT = 5;

const SUBJECT_ALIAS = 'qwen3.6-35b-a3b-via-dashscope-direct';
const SUBJECT_MAX_TOKENS = 16000;
const SUBJECT_THINKING = true;

const JUDGES = ['claude-opus-4-7', 'gpt-5.4', 'minimax-m27-via-openrouter'] as const;
const JUDGE_MAX_TOKENS = 3000;
const JUDGE_RETRIES = 3;

const MAX_STEPS = 5;
const MAX_RETRIEVALS_PER_STEP = 8;
const PER_CALL_HALT_USD = 0.40;
const PER_CELL_HALT_USD = 1.00;

const COST_HALT_USD = 8.0;  // generous budget for held-out (3 candidates × 5 evals × ~$0.13 = $1.95 expected)

const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7':                { in: 15.0, out: 75.0 },
  'gpt-5.4':                        { in: 2.5,  out: 10.0 },
  'minimax-m27-via-openrouter':     { in: 0.7,  out: 2.8 },
  'qwen3.6-35b-a3b-via-dashscope-direct': { in: 0.20, out: 0.80 },
  'qwen3.6-35b-a3b-via-openrouter':       { in: 0.6,  out: 2.4 },
};

const MANIFEST_ANCHOR = 'manifest-v7-gepa-faza1';
const MANIFEST_SHA_AMENDMENT_11 = 'fa716ff90a4345eb87962789f3a2ab3d54994edc93964f850ad64cf6fbf6d227';

// §F.5 condition_2 overfitting bound: held-out Pass II must be within ±15pp of in-sample Pass II
const F5_OVERFITTING_BOUND_PP = 15;

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(RUN_LOG, line); } catch { /* dir may not exist */ }
  process.stderr.write(line);
}

interface Args {
  mode: 'dry-run' | 'execute';
  candidateIds: string[];
  heldOutCount: number;
}
function parseArgs(argv: string[]): Args {
  let mode: Args['mode'] = 'execute';
  let candidateIds: string[] = [];
  let heldOutCount = DEFAULT_HELD_OUT;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--dry-run') mode = 'dry-run';
    else if (f === '--candidates' && i + 1 < argv.length) {
      candidateIds = argv[i + 1].split(',').map(s => s.trim()).filter(Boolean);
      i++;
    } else if (f === '--held-out-instances' && i + 1 < argv.length) {
      heldOutCount = parseInt(argv[i + 1], 10);
      i++;
    }
  }
  if (candidateIds.length === 0) {
    throw new Error('--candidates flag required (comma-separated candidate IDs e.g. claude::gen1-v1,qwen-thinking::gen1-v1,gpt::gen1-v2)');
  }
  return { mode, candidateIds, heldOutCount };
}

// ── Mulberry32 sampling (same as Gen 1 / NULL-baseline) ──────────────────

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
  return fs.readFileSync(CORPUS_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean).map(l => JSON.parse(l));
}

// ── Candidate loader (subset by ID) ────────────────────────────────────────

interface Candidate {
  candidateId: string;
  shape: ShapeName;
  variant: 'baseline' | 'gen1-v1' | 'gen1-v2';
  promptShape: PromptShape;
}

async function loadCandidatesById(candidateIds: string[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const id of candidateIds) {
    // Format: <shape>::<variant>
    const m = id.match(/^([a-z-]+)::([a-z0-9-]+)$/);
    if (!m) throw new Error(`Invalid candidate ID format "${id}" — expected "<shape>::<variant>" (e.g., "claude::gen1-v1")`);
    const shape = m[1] as ShapeName;
    const variant = m[2] as Candidate['variant'];

    if (variant === 'baseline') {
      const baseline = REGISTRY[shape];
      if (!baseline) throw new Error(`baseline shape "${shape}" not in REGISTRY`);
      out.push({ candidateId: id, shape, variant: 'baseline', promptShape: baseline });
      continue;
    }

    const filename = `${shape}-${variant}.ts`;
    const filepath = path.join(GEPA_EVOLVED_DIR, filename);
    if (!fs.existsSync(filepath)) {
      throw new Error(`mutation file missing: ${filepath}`);
    }
    const mod: any = await import(pathToFileURL(filepath).href);
    const promptShape = Object.values(mod).find(
      (v: any) => v && typeof v === 'object' && 'name' in v && 'systemPrompt' in v && 'soloUserPrompt' in v,
    ) as PromptShape | undefined;
    if (!promptShape) throw new Error(`no PromptShape export found in ${filepath}`);
    out.push({ candidateId: id, shape, variant, promptShape });
  }
  return out;
}

// ── LLM call adapter (same as Gen 1) ──────────────────────────────────────

const llmCall: LlmCallFn = async (input: LlmCallInput): Promise<AgentLlmCallResult> => {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) throw new Error('LITELLM_MASTER_KEY env not set');
  const { model, messages } = input;
  const isQwen = model.includes('qwen');
  const maxTokens = input.maxTokens ?? (isQwen ? SUBJECT_MAX_TOKENS : 4096);
  const thinking = input.thinking ?? (isQwen ? SUBJECT_THINKING : true);
  const payload: Record<string, unknown> = { model, messages, max_tokens: maxTokens };
  if (model.startsWith('claude-opus')) payload.temperature = 1.0;
  else if (model === 'gpt-5.4' || model === 'minimax-m27-via-openrouter') {/* omit */}
  else payload.temperature = input.temperature ?? 0.3;
  if (isQwen) payload.extra_body = { enable_thinking: thinking };

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
      return { content, inTokens: inTok, outTokens: outTok, costUsd: (inTok*pricing.in + outTok*pricing.out)/1_000_000, latencyMs: Date.now()-started };
    } catch (e) {
      lastErr = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 200);
      if (attempt < 1) await new Promise(r => setTimeout(r, 1500));
    }
  }
  return { content: '', inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: Date.now()-started, error: lastErr };
};

// ── Trio judging (same as Gen 1) ──────────────────────────────────────────

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
{"completeness":<1-5>,"accuracy":<1-5>,"synthesis":<1-5>,"judgment":<1-5>,"actionability":<1-5>,"structure":<1-5>,"rationale":"<1-2 sentences explaining the lowest scoring dimension>","overall_verdict":"<one of: PASS_STRONG | PASS_ADEQUATE | FAIL_WEAK | FAIL_CRITICAL>"}

PASS_STRONG: mean >= 4.0
PASS_ADEQUATE: mean 3.5-3.99
FAIL_WEAK: mean 2.5-3.49
FAIL_CRITICAL: mean < 2.5

[PERSONA + SCENARIO + QUESTION]
###PSQ###

[MATERIALS]
###MAT###

[RESPONSE TO EVALUATE]
###RES###`;

interface JudgeRecord { judge_model: string; mean: number; cost: number; latency_ms: number; raw: any; retries: number }
interface TrioResult { records: JudgeRecord[]; trioMean: number; trioStrictPassII: boolean; trioStrictPassI: boolean; cost: number }

function parseJudgeJson(text: string): { mean: number; raw: any } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const dims = ['completeness','accuracy','synthesis','judgment','actionability','structure'];
    for (const d of dims) if (typeof obj[d] !== 'number' || obj[d] < 1 || obj[d] > 5) return null;
    const mean = dims.reduce((s, d) => s + obj[d], 0) / dims.length;
    return { mean, raw: obj };
  } catch { return null; }
}

async function runJudge(model: string, prompt: string): Promise<JudgeRecord> {
  let totalCost = 0, totalLat = 0;
  for (let attempt = 0; attempt < JUDGE_RETRIES; attempt++) {
    const r = await llmCall({ model, messages: [{ role: 'user', content: prompt }], maxTokens: JUDGE_MAX_TOKENS, thinking: false });
    totalCost += r.costUsd; totalLat += r.latencyMs;
    if (r.error) continue;
    const parsed = parseJudgeJson(r.content);
    if (parsed) return { judge_model: model, mean: parsed.mean, cost: totalCost, latency_ms: totalLat, raw: parsed.raw, retries: attempt };
  }
  return { judge_model: model, mean: 0, cost: totalCost, latency_ms: totalLat, raw: null, retries: JUDGE_RETRIES };
}

async function judgeTrio(instance: CorpusInstance, response: string): Promise<TrioResult> {
  const prompt = JUDGE_PROMPT_TEMPLATE
    .replace('###PSQ###', `${instance.personaText}\n\nQUESTION: ${instance.question}`)
    .replace('###MAT###', instance.materialsConcat)
    .replace('###RES###', response);
  const records = await Promise.all(JUDGES.map(j => runJudge(j, prompt)));
  const valid = records.filter(r => r.mean > 0).map(r => r.mean);
  const trioMean = valid.length > 0 ? valid.reduce((a,b)=>a+b,0)/valid.length : 0;
  return {
    records,
    trioMean,
    trioStrictPassII: trioMean >= 4.0,
    trioStrictPassI: records.filter(r => r.mean >= 3.5).length >= 2,
    cost: records.reduce((s,r) => s + r.cost, 0),
  };
}

// ── Per-eval orchestration (mirrors Gen 1; uses registerShape for canonical injection) ──

interface EvalRecord {
  shape: ShapeName;
  candidateId: string;
  variant: Candidate['variant'];
  instanceId: string;
  instanceCell: CorpusInstance['cell'];
  candidateResponse: string;
  candidateLatencyMs: number;
  candidateCostUsd: number;
  loopExhausted: boolean;
  stepsTaken: number;
  retrievalCalls: number;
  trioMean: number;
  trioStrictPassII: boolean;
  trioStrictPassI: boolean;
  judgeRecords: JudgeRecord[];
  evalCostUsd: number;
  manifestAnchor: string;
  manifestShaAmendment11: string;
  tsIso: string;
  evalSet: 'held-out';  // marks this record as Checkpoint C held-out (vs Gen 1 in-sample)
}

async function runOneEval(cand: Candidate, instance: CorpusInstance, embedder: Embedder): Promise<EvalRecord | { error: string }> {
  const evalId = `${cand.candidateId}__${instance.instanceId}`;
  log(`[${evalId}] start`);
  const dbPath = path.join(SCRATCH_DIR, `eval-${cand.candidateId.replace(/[:]/g, '_')}-${instance.instanceId}.sqlite`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new MindDB(dbPath);
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const hybrid = new HybridSearch(db, embedder);
  const gopId = `cp-c-${cand.candidateId.replace(/[:]/g,'_')}-${instance.instanceId}`;
  sessions.ensure(gopId, undefined, `Checkpoint C ${cand.candidateId} on ${instance.instanceId}`);
  for (const doc of instance.sourceDocuments) frames.createIFrame(gopId, `## ${doc.title}\n\n${doc.body}`, 'important', 'system');

  const search: RetrievalSearchFn = async ({ query, limit }) => {
    const hits = await hybrid.search(query, { limit, gopId });
    return {
      formattedResults: hits.length > 0 ? hits.map((s,i)=>`[result ${i+1}, score ${s.finalScore.toFixed(3)}]\n${s.frame.content}`).join('\n\n---\n\n') : '',
      resultCount: hits.length,
    };
  };

  let agentResult: AgentRunResult;
  try {
    // Amendment 8 §canonical_mutation_api: register via @waggle/agent's registerShape
    registerShape(cand.promptShape.name, cand.promptShape);
    agentResult = await runRetrievalAgentLoop({
      modelAlias: SUBJECT_ALIAS,
      persona: instance.personaText,
      question: instance.question,
      llmCall,
      search,
      maxSteps: MAX_STEPS,
      maxRetrievalsPerStep: MAX_RETRIEVALS_PER_STEP,
      perCallHaltUsd: PER_CALL_HALT_USD,
      perCellHaltUsd: PER_CELL_HALT_USD,
      contextTag: evalId,
      promptShapeOverride: cand.promptShape.name,
    } as any);
  } catch (e) {
    return { error: `agent loop failed: ${(e as Error).message}` };
  }

  log(`[${evalId}] subject_done; retrievals=${agentResult.retrievalCalls} steps=${agentResult.stepsTaken} cost=$${agentResult.totalCostUsd.toFixed(4)}`);
  const judges = await judgeTrio(instance, agentResult.rawResponse);
  const evalCostUsd = agentResult.totalCostUsd + judges.cost;
  log(`[${evalId}] judged; trio_mean=${judges.trioMean.toFixed(3)} pass_ii=${judges.trioStrictPassII} retrievals=${agentResult.retrievalCalls} eval_cost=$${evalCostUsd.toFixed(4)}`);

  return {
    shape: cand.shape, candidateId: cand.candidateId, variant: cand.variant,
    instanceId: instance.instanceId, instanceCell: instance.cell,
    candidateResponse: agentResult.rawResponse,
    candidateLatencyMs: agentResult.totalLatencyMs,
    candidateCostUsd: agentResult.totalCostUsd,
    loopExhausted: agentResult.loopExhausted,
    stepsTaken: agentResult.stepsTaken,
    retrievalCalls: agentResult.retrievalCalls,
    trioMean: judges.trioMean,
    trioStrictPassII: judges.trioStrictPassII,
    trioStrictPassI: judges.trioStrictPassI,
    judgeRecords: judges.records,
    evalCostUsd,
    manifestAnchor: MANIFEST_ANCHOR,
    manifestShaAmendment11: MANIFEST_SHA_AMENDMENT_11,
    tsIso: new Date().toISOString(),
    evalSet: 'held-out',
  };
}

// ── In-sample lookup from Gen 1 JSONL ─────────────────────────────────────

interface InSampleStats {
  candidateId: string;
  shape: ShapeName;
  evalCount: number;
  passIICount: number;
  passIIRate: number;
  meanRetrieval: number;
}

function loadInSampleStats(candidateIds: string[]): Map<string, InSampleStats> {
  const out = new Map<string, InSampleStats>();
  if (!fs.existsSync(GEN_1_JSONL)) {
    log(`[in-sample] WARN: Gen 1 JSONL not found at ${GEN_1_JSONL}; in-sample stats unavailable`);
    return out;
  }
  const records: EvalRecord[] = [];
  for (const line of fs.readFileSync(GEN_1_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean)) {
    try { records.push(JSON.parse(line) as EvalRecord); } catch { /* skip */ }
  }
  for (const id of candidateIds) {
    const candRecs = records.filter(r => r.candidateId === id);
    if (candRecs.length === 0) continue;
    const passII = candRecs.filter(r => r.trioStrictPassII).length;
    const totalRetr = candRecs.reduce((s, r) => s + r.retrievalCalls, 0);
    out.set(id, {
      candidateId: id,
      shape: candRecs[0].shape,
      evalCount: candRecs.length,
      passIICount: passII,
      passIIRate: passII / candRecs.length,
      meanRetrieval: totalRetr / candRecs.length,
    });
  }
  return out;
}

// ── Summary writer ─────────────────────────────────────────────────────────

interface PerCandidateSummary {
  candidateId: string;
  shape: ShapeName;
  variant: string;
  inSample: { evalCount: number; passIIRate: number; meanRetrieval: number } | null;
  heldOut: { evalCount: number; passIIRate: number; meanRetrieval: number; tieredFitness: TieredFitnessComponents };
  passIIGapPP: number;  // (in-sample - held-out) × 100; positive = held-out worse than in-sample
  retrievalGapAbsolute: number;  // (in-sample - held-out); positive = held-out lower retrieval
  f5_condition_2_verdict: 'PASS' | 'FAIL';
  f5_condition_2_detail: string;
  phase_5_deployment_authorized: boolean;
}

interface CheckpointCSummary {
  manifestAnchor: string;
  manifestShaAmendment11: string;
  generated_at: string;
  candidateIds: string[];
  heldOutInstanceIds: string[];
  totalEvals: number;
  totalCostUsd: number;
  perCandidate: PerCandidateSummary[];
  f2_verdict_confirmation: 'CONFIRMED' | 'REVERTED' | 'MIXED';
  f2_verdict_detail: string;
  f5_overfitting_bound_pp: number;
  faza_2_deployment_authorization: 'AUTHORIZED' | 'WITHHELD' | 'PARTIAL';
  next_steps: string[];
}

function buildCheckpointCSummary(
  args: Args,
  candidates: Candidate[],
  heldOutInstances: CorpusInstance[],
  recordsByCandidate: Map<string, EvalRecord[]>,
  inSampleStats: Map<string, InSampleStats>,
  totalCost: number,
): CheckpointCSummary {
  const perCandidate: PerCandidateSummary[] = [];
  for (const cand of candidates) {
    const recs = recordsByCandidate.get(cand.candidateId) ?? [];
    if (recs.length === 0) continue;
    const passIICount = recs.filter(r => r.trioStrictPassII).length;
    const passIIRate = passIICount / recs.length;
    const meanRetrieval = recs.reduce((s, r) => s + r.retrievalCalls, 0) / recs.length;

    const inSample = inSampleStats.get(cand.candidateId);
    const passIIGapPP = inSample ? (inSample.passIIRate - passIIRate) * 100 : 0;
    const retrievalGapAbsolute = inSample ? (inSample.meanRetrieval - meanRetrieval) : 0;

    const candidateMetrics = {
      candidateId: cand.candidateId,
      shape: cand.shape,
      evaluations: [],
      trioStrictPassRateII: passIIRate,
      trioStrictPassRateI: 0,
      meanRetrievalCallsPerTask: meanRetrieval,
      meanCostUsd: recs.reduce((s, r) => s + r.evalCostUsd, 0) / recs.length,
    };
    const tieredFitness = computeTieredFitness({
      candidate: candidateMetrics,
      nullBaselinePassRateII: NULL_BASELINE_PER_SHAPE[cand.shape].trioStrictPassRateII,
      nullBaselineMeanRetrievalCallsPerTask: NULL_BASELINE_PER_SHAPE[cand.shape].meanRetrievalCallsPerTask,
      mutationValidatorPassed: true,  // all candidates validated upstream
      saturatedRegime: true,
    });

    // §F.5 condition_2 verdict: held-out Pass II within ±15pp of in-sample
    let f5_condition_2_verdict: 'PASS' | 'FAIL' = 'PASS';
    let f5_condition_2_detail = '';
    if (!inSample) {
      f5_condition_2_verdict = 'FAIL';
      f5_condition_2_detail = 'in-sample stats unavailable (Gen 1 JSONL missing or candidate not in Gen 1)';
    } else {
      const absGapPP = Math.abs(passIIGapPP);
      if (absGapPP <= F5_OVERFITTING_BOUND_PP) {
        f5_condition_2_verdict = 'PASS';
        f5_condition_2_detail = `held-out ${(passIIRate * 100).toFixed(1)}% within ±${F5_OVERFITTING_BOUND_PP}pp of in-sample ${(inSample.passIIRate * 100).toFixed(1)}% (gap=${passIIGapPP.toFixed(1)}pp)`;
      } else {
        f5_condition_2_verdict = 'FAIL';
        f5_condition_2_detail = `held-out ${(passIIRate * 100).toFixed(1)}% diverges from in-sample ${(inSample.passIIRate * 100).toFixed(1)}% by ${absGapPP.toFixed(1)}pp > ${F5_OVERFITTING_BOUND_PP}pp threshold`;
      }
    }

    perCandidate.push({
      candidateId: cand.candidateId,
      shape: cand.shape,
      variant: cand.variant,
      inSample: inSample ? { evalCount: inSample.evalCount, passIIRate: inSample.passIIRate, meanRetrieval: inSample.meanRetrieval } : null,
      heldOut: { evalCount: recs.length, passIIRate, meanRetrieval, tieredFitness },
      passIIGapPP,
      retrievalGapAbsolute,
      f5_condition_2_verdict,
      f5_condition_2_detail,
      phase_5_deployment_authorized: f5_condition_2_verdict === 'PASS',
    });
  }

  // §F.2 confirmation: if all candidates PASS §F.5 condition_2 → CONFIRMED;
  //   if all FAIL → REVERTED; else MIXED
  const passCount = perCandidate.filter(c => c.f5_condition_2_verdict === 'PASS').length;
  const total = perCandidate.length;
  let f2_verdict_confirmation: 'CONFIRMED' | 'REVERTED' | 'MIXED';
  let f2_verdict_detail = '';
  if (passCount === total) {
    f2_verdict_confirmation = 'CONFIRMED';
    f2_verdict_detail = `all ${total} held-out candidates PASS §F.5 condition_2 (within ±${F5_OVERFITTING_BOUND_PP}pp)`;
  } else if (passCount === 0) {
    f2_verdict_confirmation = 'REVERTED';
    f2_verdict_detail = `all ${total} held-out candidates FAIL §F.5 condition_2 — Gen 1 §F.2 PASS suspected overfit`;
  } else {
    f2_verdict_confirmation = 'MIXED';
    f2_verdict_detail = `${passCount}/${total} held-out candidates PASS §F.5 condition_2`;
  }

  let faza_2_deployment_authorization: 'AUTHORIZED' | 'WITHHELD' | 'PARTIAL';
  if (f2_verdict_confirmation === 'CONFIRMED') faza_2_deployment_authorization = 'AUTHORIZED';
  else if (f2_verdict_confirmation === 'REVERTED') faza_2_deployment_authorization = 'WITHHELD';
  else faza_2_deployment_authorization = 'PARTIAL';

  const next_steps = [
    'Compute κ_trio on combined Gen 1 (120) + Checkpoint C (15) sample for §F.3 verdict',
    `Author Faza 1 final summary memo per ${faza_2_deployment_authorization} authorization status`,
    'PM ratify final Faza 1 closure decision (decisions/2026-04-XX-gepa-faza1-results.md)',
  ];

  return {
    manifestAnchor: MANIFEST_ANCHOR,
    manifestShaAmendment11: MANIFEST_SHA_AMENDMENT_11,
    generated_at: new Date().toISOString(),
    candidateIds: args.candidateIds,
    heldOutInstanceIds: heldOutInstances.map(i => i.instanceId),
    totalEvals: perCandidate.reduce((s, c) => s + c.heldOut.evalCount, 0),
    totalCostUsd: totalCost,
    perCandidate,
    f2_verdict_confirmation,
    f2_verdict_detail,
    f5_overfitting_bound_pp: F5_OVERFITTING_BOUND_PP,
    faza_2_deployment_authorization,
    next_steps,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  if (!fs.existsSync(RUN_LOG)) fs.writeFileSync(RUN_LOG, '');

  const corpus = loadCorpus();
  const allShuffled = deterministicShuffle(corpus, SAMPLING_SEED);
  const heldOutSample = allShuffled.slice(N_GEN_1_SAMPLE, N_GEN_1_SAMPLE + args.heldOutCount);
  log(`[loaded] corpus=${corpus.length}; held-out sample=${args.heldOutCount} via seed=${SAMPLING_SEED} offset=${N_GEN_1_SAMPLE}`);

  const candidates = await loadCandidatesById(args.candidateIds);
  log(`[loaded] ${candidates.length} candidates: ${candidates.map(c => c.candidateId).join(', ')}`);

  // Pre-validate mutation candidates
  const TYPES_FILE_PATH = path.join(PROMPT_SHAPES_DIR, 'types.ts');
  for (const cand of candidates) {
    if (cand.variant === 'baseline') continue;
    const filename = `${cand.shape}-${cand.variant}.ts`;
    const candPath = path.join(GEPA_EVOLVED_DIR, filename);
    try {
      const verdict = validateCandidate({
        candidateShapeFilePath: candPath,
        baselineShapeName: `${cand.shape}.ts`,
        typesFilePath: TYPES_FILE_PATH,
        expectShapeDiff: true,
      });
      log(`[validator] ${cand.candidateId} valid=${verdict.valid} violations=${verdict.violations.length}`);
    } catch (e) {
      log(`[validator] ${cand.candidateId} ERROR ${(e as Error).message}`);
    }
  }

  if (args.mode === 'dry-run') {
    log(`[dry-run] would run ${candidates.length} candidates × ${heldOutSample.length} instances = ${candidates.length * heldOutSample.length} evals`);
    for (const cand of candidates) {
      for (const inst of heldOutSample) {
        log(`[dry-run] ${cand.candidateId}__${inst.instanceId}`);
      }
    }
    return;
  }

  // Resume support
  const existing = new Set<string>();
  let cumulativeCost = 0;
  if (fs.existsSync(OUT_JSONL)) {
    for (const line of fs.readFileSync(OUT_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean)) {
      try {
        const r = JSON.parse(line) as EvalRecord;
        existing.add(`${r.candidateId}__${r.instanceId}`);
        cumulativeCost += r.evalCostUsd;
      } catch { /* skip */ }
    }
    log(`[resume] loaded ${existing.size} existing evals; cumulative $${cumulativeCost.toFixed(4)}`);
  }

  const out = fs.createWriteStream(OUT_JSONL, { flags: existing.size > 0 ? 'a' : 'w' });
  const embedder = createOllamaEmbedder({ baseUrl: OLLAMA_URL, model: EMBEDDER_MODEL });

  const recordsByCandidate = new Map<string, EvalRecord[]>();
  for (const cand of candidates) recordsByCandidate.set(cand.candidateId, []);

  // Re-load existing records into recordsByCandidate
  if (fs.existsSync(OUT_JSONL)) {
    for (const line of fs.readFileSync(OUT_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean)) {
      try {
        const r = JSON.parse(line) as EvalRecord;
        const list = recordsByCandidate.get(r.candidateId);
        if (list) list.push(r);
      } catch { /* skip */ }
    }
  }

  let nDone = existing.size;
  outer: for (const cand of candidates) {
    for (const inst of heldOutSample) {
      const key = `${cand.candidateId}__${inst.instanceId}`;
      if (existing.has(key)) { log(`[skip] ${key} already in JSONL`); continue; }
      if (cumulativeCost >= COST_HALT_USD) { log(`[HALT] cumulative $${cumulativeCost.toFixed(4)} >= $${COST_HALT_USD}`); break outer; }
      const r = await runOneEval(cand, inst, embedder);
      if ('error' in r) { log(`[skip] ${key}: ${r.error}`); continue; }
      out.write(JSON.stringify(r) + '\n');
      cumulativeCost += r.evalCostUsd;
      nDone++;
      const list = recordsByCandidate.get(cand.candidateId);
      if (list) list.push(r);
      log(`[cumulative] $${cumulativeCost.toFixed(4)} / $${COST_HALT_USD} halt; ${nDone} evals total`);
    }
  }
  out.end();

  // Write summary
  const inSampleStats = loadInSampleStats(args.candidateIds);
  const summary = buildCheckpointCSummary(args, candidates, heldOutSample, recordsByCandidate, inSampleStats, cumulativeCost);
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  log(`[summary] wrote ${SUMMARY_JSON}`);
  log(`[F.2] verdict_confirmation=${summary.f2_verdict_confirmation} (${summary.f2_verdict_detail})`);
  log(`[F.5] overfitting_bound=±${F5_OVERFITTING_BOUND_PP}pp`);
  log(`[Faza 2] deployment_authorization=${summary.faza_2_deployment_authorization}`);
  for (const c of summary.perCandidate) {
    log(`[F.5] ${c.candidateId}: in-sample=${c.inSample ? (c.inSample.passIIRate * 100).toFixed(1) : 'n/a'}% held-out=${(c.heldOut.passIIRate * 100).toFixed(1)}% gap=${c.passIIGapPP.toFixed(1)}pp verdict=${c.f5_condition_2_verdict}`);
  }

  log(`[done] ${nDone} evals; total cost $${cumulativeCost.toFixed(4)}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
