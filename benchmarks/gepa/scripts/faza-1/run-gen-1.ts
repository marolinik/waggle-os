#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — Gen 1 evaluation runner.
 *
 * Per launch decision §G step 7+ + manifest v7 §gepa + Amendment 5.
 *
 * For each of 5 shapes, evaluate 3 candidates (baseline + 2 mutations) × 8
 * instances = 120 total evaluations. Same instances as NULL-baseline (seed=42)
 * for direct shape-vs-shape comparison.
 *
 * Halt at:
 * - 30 evaluations (Checkpoint B per launch decision §E)
 * - $26 cumulative (cost halt per Amendment 3 + super-linear)
 * - 2 consecutive cell-semantic violations (per brief §5)
 *
 * Mode: MULTI-STEP (retrieval available) per Amendment 5 Ask 1 ratification.
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
  // Amendment 8 §canonical_mutation_api: REGISTRY + registerShape MUST be imported from
  // '@waggle/agent' (same path the agent-loop uses internally). Importing via deep
  // relative paths produces a separate module instance under tsx + Node ESM workspace
  // resolution → mutations would not propagate. Diagnostic probe + Gen 1 partial
  // b5avslp51 confirmed empirically.
  REGISTRY,
  registerShape,
  type PromptShape,
} from '@waggle/agent';

import { type CorpusInstance } from '../../src/faza-1/corpus.js';
import {
  NULL_BASELINE_PER_SHAPE,
  NULL_BASELINE_AGGREGATE,
  type DeltaFloorVerdict,
  type TieredFitnessComponents,
} from '../../src/faza-1/types.js';
import {
  computeTieredFitness,
  computeDeltaFloorVerdict,
  computeTier2RetrievalBonus,
} from '../../src/faza-1/fitness.js';
import {
  validateCandidate,
  type ValidatorVerdict,
} from '../../src/faza-1/mutation-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const CORPUS_JSONL = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl');
const PROMPT_SHAPES_DIR = path.join(REPO_ROOT, 'packages/agent/src/prompt-shapes');
const GEPA_EVOLVED_DIR = path.join(PROMPT_SHAPES_DIR, 'gepa-evolved');
const OUT_DIR = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/gen-1');
const OUT_JSONL = path.join(OUT_DIR, 'gen-1-eval.jsonl');
const RUN_LOG = path.join(OUT_DIR, 'gen-1-run.log');
const SUMMARY_JSON = path.join(OUT_DIR, 'gen-1-summary.json');
const SCRATCH_DIR = path.join(REPO_ROOT, 'tmp/gepa-faza1-gen-1');

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const OLLAMA_URL = 'http://localhost:11434';
const EMBEDDER_MODEL = 'nomic-embed-text';

const SAMPLING_SEED = 42;
const N_PER_SHAPE = 8;
const N_CANDIDATES_PER_SHAPE = 3;  // 1 baseline + 2 mutations

const SHAPES = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'] as const;
type ShapeName = typeof SHAPES[number];

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

// Halt at 30 evals (Checkpoint B) unless --full
const CHECKPOINT_B_HALT_EVALS = 30;
const COST_HALT_USD = 26.0;  // 30% over $20 NULL projection (Amendment 3 envelope basis)

const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7':                { in: 15.0, out: 75.0 },
  'gpt-5.4':                        { in: 2.5,  out: 10.0 },
  'minimax-m27-via-openrouter':     { in: 0.7,  out: 2.8 },
  'qwen3.6-35b-a3b-via-dashscope-direct': { in: 0.20, out: 0.80 },
  'qwen3.6-35b-a3b-via-openrouter':       { in: 0.6,  out: 2.4 },
};

const MANIFEST_ANCHOR = 'manifest-v7-gepa-faza1';
const MANIFEST_SHA_AMENDMENT_5 = '062dfc4935aaa89f0b25595c5dc3ce4af06c95c4c261075a1f0226d8af3f3dee';
const MANIFEST_SHA_AMENDMENT_6 = '0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a';
const MANIFEST_SHA_AMENDMENT_7 = 'bc0bcf9bd8b0c8344b25e5f8ab15b0475039ba28a1f782ebffe4cc1c4ff7d1de';

// ── Amendment 7 — mid-run halt thresholds (binding) ───────────────────────
// Per manifest v7 Amendment 7 §checkpoint_b_tightened.mid_run_halt_thresholds.

/** Per-eval cost projection from Checkpoint A v2 §E (USD). */
const PER_EVAL_COST_PROJECTION_USD = 0.1243;
/** Mid-run halt: per-candidate cost overshoot threshold (>25% over projection = >$0.156/eval). */
const PER_CANDIDATE_COST_OVERSHOOT_THRESHOLD_USD = PER_EVAL_COST_PROJECTION_USD * 1.25;  // 0.155375
/** Mid-run halt: count of candidates with overshoot that triggers halt (>3). */
const MID_RUN_HALT_OVERSHOOT_CANDIDATE_COUNT = 3;
/** Mid-run halt: per-shape variance widens (max-min trio_strict_pass_rate_II range across candidates) >40pp. */
const PER_SHAPE_VARIANCE_HALT_PP = 40;
/** Minimum evals before per-shape variance check runs (avoid noise on N<3). */
const PER_SHAPE_VARIANCE_MIN_EVALS = 3;
/** Minimum Qwen evals before retrieval regression check runs. */
const QWEN_RETRIEVAL_REGRESSION_MIN_EVALS = 3;

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(RUN_LOG, line); } catch { /* dir may not exist */ }
  process.stderr.write(line);
}

interface Args {
  mode: 'dry-run' | 'checkpoint-b' | 'full';
}
function parseArgs(argv: string[]): Args {
  let mode: Args['mode'] = 'dry-run';
  for (const f of argv) {
    if (f === '--dry-run') mode = 'dry-run';
    else if (f === '--checkpoint-b') mode = 'checkpoint-b';
    else if (f === '--full') mode = 'full';
  }
  return { mode };
}

// ── Mulberry32 sampling (same as NULL-baseline) ───────────────────────────

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

// ── Candidate loader (baseline from REGISTRY + 2 mutations dynamic import) ─

interface Candidate {
  candidateId: string;       // e.g., qwen-thinking::baseline | qwen-thinking::gen1-v1
  shape: ShapeName;
  variant: 'baseline' | 'gen1-v1' | 'gen1-v2';
  promptShape: PromptShape;
}

async function loadCandidates(): Promise<Map<ShapeName, Candidate[]>> {
  const out = new Map<ShapeName, Candidate[]>();
  for (const shape of SHAPES) {
    const cands: Candidate[] = [];
    const baseline = REGISTRY[shape];
    if (!baseline) throw new Error(`shape "${shape}" not in REGISTRY`);
    cands.push({ candidateId: `${shape}::baseline`, shape, variant: 'baseline', promptShape: baseline });

    for (let v = 1; v <= 2; v++) {
      const filename = `${shape}-gen1-v${v}.ts`;
      const filepath = path.join(GEPA_EVOLVED_DIR, filename);
      if (!fs.existsSync(filepath)) {
        throw new Error(`mutation file missing: ${filepath}`);
      }
      // Windows ESM requires file:// URL for absolute paths
      const mod: any = await import(pathToFileURL(filepath).href);
      // Find the exported PromptShape (single export per file convention)
      const promptShape = Object.values(mod).find(
        (v: any) => v && typeof v === 'object' && 'name' in v && 'systemPrompt' in v && 'soloUserPrompt' in v,
      ) as PromptShape | undefined;
      if (!promptShape) throw new Error(`no PromptShape export found in ${filepath}`);
      cands.push({
        candidateId: `${shape}::gen1-v${v}`, shape,
        variant: `gen1-v${v}` as 'gen1-v1' | 'gen1-v2', promptShape,
      });
    }
    out.set(shape, cands);
  }
  return out;
}

// ── LLM call adapter (same as NULL-baseline) ──────────────────────────────

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

// ── Trio judging (mirror NULL-baseline) ───────────────────────────────────

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

// ── Per-eval orchestration ────────────────────────────────────────────────

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
  manifestShaAmendment5: string;
  tsIso: string;
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
  const gopId = `gen1-${cand.candidateId.replace(/[:]/g,'_')}-${instance.instanceId}`;
  sessions.ensure(gopId, undefined, `Gen 1 ${cand.candidateId} on ${instance.instanceId}`);
  for (const doc of instance.sourceDocuments) frames.createIFrame(gopId, `## ${doc.title}\n\n${doc.body}`, 'important', 'system');

  const search: RetrievalSearchFn = async ({ query, limit }) => {
    const hits = await hybrid.search(query, { limit, gopId });
    return {
      formattedResults: hits.length > 0 ? hits.map((s,i)=>`[result ${i+1}, score ${s.finalScore.toFixed(3)}]\n${s.frame.content}`).join('\n\n---\n\n') : '',
      resultCount: hits.length,
    };
  };

  // Inject the candidate's prompt shape via custom orchestration: we use runRetrievalAgentLoop
  // with the candidate's modelAlias + prompt-shape. The agent loop internally selects shape via
  // selector; we override by passing the candidate's shape directly. Since runRetrievalAgentLoop
  // uses selectShape internally, we override REGISTRY at runtime by name match.
  // For Faza 1 simplicity, we register candidate as override under its unique name:
  let agentResult: AgentRunResult;
  try {
    // Amendment 8 §canonical_mutation_api: register the candidate via the sanctioned
    // mutation path. registerShape() is imported from '@waggle/agent' so it mutates
    // the SAME REGISTRY instance the agent-loop's selectShape() reads from. Direct
    // (REGISTRY as any)[name] = shape is forbidden post-Amendment-8 (would mutate a
    // separate module instance under tsx + Node ESM workspace resolution).
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
      promptShapeOverride: cand.promptShape.name,  // if supported
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
    manifestShaAmendment5: MANIFEST_SHA_AMENDMENT_5,
    tsIso: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

// ── Amendment 7 — per-candidate accumulator ───────────────────────────────

interface CandidateAcc {
  candidateId: string;
  shape: ShapeName;
  variant: 'baseline' | 'gen1-v1' | 'gen1-v2';
  evalCount: number;
  passIICount: number;          // count of trioStrictPassII = true
  totalCostUsd: number;
  totalRetrievalCalls: number;
  trioMeans: number[];          // per-eval trioMean for variance + audit
  retrievalCalls: number[];     // per-eval retrieval calls for audit
  mutationValidatorPassed: boolean;  // computed from validateCandidate at startup
}

function makeCandidateAcc(cand: Candidate, validatorPassed: boolean): CandidateAcc {
  return {
    candidateId: cand.candidateId,
    shape: cand.shape,
    variant: cand.variant,
    evalCount: 0,
    passIICount: 0,
    totalCostUsd: 0,
    totalRetrievalCalls: 0,
    trioMeans: [],
    retrievalCalls: [],
    mutationValidatorPassed: validatorPassed,
  };
}

function ingestEvalIntoAcc(acc: CandidateAcc, r: EvalRecord): void {
  acc.evalCount++;
  if (r.trioStrictPassII) acc.passIICount++;
  acc.totalCostUsd += r.evalCostUsd;
  acc.totalRetrievalCalls += r.retrievalCalls;
  acc.trioMeans.push(r.trioMean);
  acc.retrievalCalls.push(r.retrievalCalls);
}

function accMeanCostPerEval(acc: CandidateAcc): number {
  return acc.evalCount > 0 ? acc.totalCostUsd / acc.evalCount : 0;
}
function accPassRateII(acc: CandidateAcc): number {
  return acc.evalCount > 0 ? acc.passIICount / acc.evalCount : 0;
}
function accMeanRetrievalCallsPerTask(acc: CandidateAcc): number {
  return acc.evalCount > 0 ? acc.totalRetrievalCalls / acc.evalCount : 0;
}

// ── Amendment 7 — mid-run halt check (binding) ────────────────────────────

interface MidRunHaltCheckResult {
  shouldHalt: boolean;
  reason: string | null;
}

function checkMidRunHalts(accs: Map<string, CandidateAcc>): MidRunHaltCheckResult {
  // Threshold A — per-candidate cost overshoot >25% on >3 candidates
  let overshootCount = 0;
  const overshootCandidates: string[] = [];
  for (const acc of accs.values()) {
    if (acc.evalCount === 0) continue;
    if (accMeanCostPerEval(acc) > PER_CANDIDATE_COST_OVERSHOOT_THRESHOLD_USD) {
      overshootCount++;
      overshootCandidates.push(`${acc.candidateId}=$${accMeanCostPerEval(acc).toFixed(4)}/eval`);
    }
  }
  if (overshootCount > MID_RUN_HALT_OVERSHOOT_CANDIDATE_COUNT) {
    return {
      shouldHalt: true,
      reason: `Amendment 7 §checkpoint_b_tightened.per_candidate_cost_overshoot: ${overshootCount} candidates >$${PER_CANDIDATE_COST_OVERSHOOT_THRESHOLD_USD.toFixed(4)}/eval (threshold >${MID_RUN_HALT_OVERSHOOT_CANDIDATE_COUNT}); offenders=[${overshootCandidates.join(', ')}]`,
    };
  }

  // Threshold B — per-shape variance widens >40pp range (max-min trio_strict_pass_rate_II) on any shape
  for (const shape of SHAPES) {
    const shapeAccs = [...accs.values()].filter(a => a.shape === shape && a.evalCount >= PER_SHAPE_VARIANCE_MIN_EVALS);
    if (shapeAccs.length < 2) continue;
    const passRates = shapeAccs.map(accPassRateII);
    const max = Math.max(...passRates);
    const min = Math.min(...passRates);
    const rangePP = (max - min) * 100;
    if (rangePP > PER_SHAPE_VARIANCE_HALT_PP) {
      return {
        shouldHalt: true,
        reason: `Amendment 7 §checkpoint_b_tightened.per_shape_variance_widens: shape=${shape} range=${rangePP.toFixed(1)}pp > ${PER_SHAPE_VARIANCE_HALT_PP}pp; rates=${passRates.map(r => r.toFixed(2)).join(',')}`,
      };
    }
  }

  // Threshold C — Qwen-targeted retrieval engagement drops below per-shape NULL baseline
  for (const shape of ['qwen-thinking', 'qwen-non-thinking'] as const) {
    const baseline = NULL_BASELINE_PER_SHAPE[shape].meanRetrievalCallsPerTask;
    const shapeAccs = [...accs.values()].filter(a => a.shape === shape && a.evalCount >= QWEN_RETRIEVAL_REGRESSION_MIN_EVALS);
    if (shapeAccs.length === 0) continue;
    const totalRetr = shapeAccs.reduce((s, a) => s + a.totalRetrievalCalls, 0);
    const totalEvals = shapeAccs.reduce((s, a) => s + a.evalCount, 0);
    if (totalEvals === 0) continue;
    const aggMean = totalRetr / totalEvals;
    if (aggMean < baseline) {
      return {
        shouldHalt: true,
        reason: `Amendment 7 §checkpoint_b_tightened.qwen_retrieval_engagement_regression: shape=${shape} mean=${aggMean.toFixed(3)} < NULL baseline ${baseline.toFixed(3)} (n=${totalEvals})`,
      };
    }
  }

  return { shouldHalt: false, reason: null };
}

// ── Amendment 7 — Checkpoint B summary writer (binding extensions) ────────

interface PerCandidateTierBreakdown {
  candidateId: string;
  shape: ShapeName;
  variant: string;
  evalCount: number;
  trioStrictPassRateII: number;
  meanRetrievalCallsPerTask: number;
  meanEvalCostUsd: number;
  costOvershoot: boolean;
  tieredFitness: TieredFitnessComponents;
}

interface CheckpointBSummary {
  manifestAnchor: string;
  manifestShaAmendment7: string;
  generated_at: string;
  mode: string;
  totalEvals: number;
  totalCostUsd: number;
  haltReason: string | null;
  perCandidateTierBreakdown: PerCandidateTierBreakdown[];
  retrievalEngagementDeltasPerQwenShape: {
    'qwen-thinking': { nullBaselineMean: number; gen1PartialMean: number | null; deltaAbsolute: number | null };
    'qwen-non-thinking': { nullBaselineMean: number; gen1PartialMean: number | null; deltaAbsolute: number | null };
  };
  cellSemanticAnchorInvarianceCountPerCandidate: Record<string, number>;
  preRegisteredDeltaFloorVerdict: DeltaFloorVerdict;
  midRunHaltsBindingThresholds: {
    perCandidateCostOvershoot: { threshold: number; candidatesOvershoot: number };
    perShapeVariance: { thresholdPP: number; maxRangeObservedPP: number };
    qwenRetrievalRegression: { triggered: boolean; details: string };
  };
}

function buildCheckpointBSummary(
  args: ReturnType<typeof parseArgs>,
  accs: Map<string, CandidateAcc>,
  totalEvals: number,
  totalCostUsd: number,
  haltReason: string | null,
): CheckpointBSummary {
  const perCandidate: PerCandidateTierBreakdown[] = [];
  for (const acc of accs.values()) {
    if (acc.evalCount === 0) continue;
    const passRate = accPassRateII(acc);
    const meanRetr = accMeanRetrievalCallsPerTask(acc);
    const meanCost = accMeanCostPerEval(acc);
    const candidateMetrics = {
      candidateId: acc.candidateId,
      shape: acc.shape,
      evaluations: [],
      trioStrictPassRateII: passRate,
      trioStrictPassRateI: 0,            // not tracked here; reported in JSONL
      meanRetrievalCallsPerTask: meanRetr,
      meanCostUsd: meanCost,
    };
    const tieredFitness = computeTieredFitness({
      candidate: candidateMetrics,
      nullBaselinePassRateII: NULL_BASELINE_PER_SHAPE[acc.shape].trioStrictPassRateII,
      nullBaselineMeanRetrievalCallsPerTask: NULL_BASELINE_PER_SHAPE[acc.shape].meanRetrievalCallsPerTask,
      mutationValidatorPassed: acc.mutationValidatorPassed,
      saturatedRegime: true,  // 5/5 shapes ≥75% per Checkpoint A v2 §B.2
    });
    perCandidate.push({
      candidateId: acc.candidateId,
      shape: acc.shape,
      variant: acc.variant,
      evalCount: acc.evalCount,
      trioStrictPassRateII: passRate,
      meanRetrievalCallsPerTask: meanRetr,
      meanEvalCostUsd: meanCost,
      costOvershoot: meanCost > PER_CANDIDATE_COST_OVERSHOOT_THRESHOLD_USD,
      tieredFitness,
    });
  }

  // Aggregate Tier 1: mean trio_strict_pass_rate_II across all evals
  const totalEvalsAcc = perCandidate.reduce((s, c) => s + c.evalCount, 0);
  const aggregateTrioStrictPassRateII =
    totalEvalsAcc > 0
      ? perCandidate.reduce((s, c) => s + c.trioStrictPassRateII * c.evalCount, 0) / totalEvalsAcc
      : 0;

  // Per-shape Qwen retrieval means (across that shape's candidates)
  function qwenShapeAggregate(shape: 'qwen-thinking' | 'qwen-non-thinking'):
    { gen1PartialMean: number | null; deltaAbsolute: number | null } {
    const shapeAccs = [...accs.values()].filter(a => a.shape === shape && a.evalCount > 0);
    if (shapeAccs.length === 0) return { gen1PartialMean: null, deltaAbsolute: null };
    const totalRetr = shapeAccs.reduce((s, a) => s + a.totalRetrievalCalls, 0);
    const totalEvalsLocal = shapeAccs.reduce((s, a) => s + a.evalCount, 0);
    const mean = totalEvalsLocal > 0 ? totalRetr / totalEvalsLocal : null;
    const baseline = NULL_BASELINE_PER_SHAPE[shape].meanRetrievalCallsPerTask;
    return { gen1PartialMean: mean, deltaAbsolute: mean === null ? null : mean - baseline };
  }
  const qwenThinkingAgg = qwenShapeAggregate('qwen-thinking');
  const qwenNonThinkingAgg = qwenShapeAggregate('qwen-non-thinking');

  const qwenShapeRetrievalMeans: Partial<Record<ShapeName, number>> = {};
  if (qwenThinkingAgg.gen1PartialMean !== null) qwenShapeRetrievalMeans['qwen-thinking'] = qwenThinkingAgg.gen1PartialMean;
  if (qwenNonThinkingAgg.gen1PartialMean !== null) qwenShapeRetrievalMeans['qwen-non-thinking'] = qwenNonThinkingAgg.gen1PartialMean;

  // Aggregate Tier 2 bonus across Qwen-targeted candidates (mean across qwen candidates with data)
  const qwenCandidates = perCandidate.filter(c => c.shape === 'qwen-thinking' || c.shape === 'qwen-non-thinking');
  const qwenAggregateTier2Bonus =
    qwenCandidates.length > 0
      ? qwenCandidates.reduce((s, c) => s + c.tieredFitness.tier2RetrievalBonus, 0) / qwenCandidates.length
      : 0;

  const deltaFloorVerdict = computeDeltaFloorVerdict({
    aggregateTrioStrictPassRateII,
    aggregateNullBaselinePassRateII: NULL_BASELINE_AGGREGATE.trioStrictPassRateII,
    qwenShapeRetrievalMeans,
    qwenShapeNullBaselineRetrievalMeans: {
      'qwen-thinking': NULL_BASELINE_PER_SHAPE['qwen-thinking'].meanRetrievalCallsPerTask,
      'qwen-non-thinking': NULL_BASELINE_PER_SHAPE['qwen-non-thinking'].meanRetrievalCallsPerTask,
    },
    qwenAggregateTier2Bonus,
  });

  // Per-shape variance maxRange snapshot
  let maxRangeObservedPP = 0;
  for (const shape of SHAPES) {
    const shapeAccs = perCandidate.filter(c => c.shape === shape);
    if (shapeAccs.length < 2) continue;
    const rates = shapeAccs.map(c => c.trioStrictPassRateII);
    const range = (Math.max(...rates) - Math.min(...rates)) * 100;
    if (range > maxRangeObservedPP) maxRangeObservedPP = range;
  }
  const overshootCount = perCandidate.filter(c => c.costOvershoot).length;

  // Qwen retrieval regression check (binary informational; halt logic in checkMidRunHalts)
  let qwenRegressionDetails = 'no_regression';
  let qwenRegressionTriggered = false;
  for (const shape of ['qwen-thinking', 'qwen-non-thinking'] as const) {
    const agg = shape === 'qwen-thinking' ? qwenThinkingAgg : qwenNonThinkingAgg;
    if (agg.gen1PartialMean !== null && agg.gen1PartialMean < NULL_BASELINE_PER_SHAPE[shape].meanRetrievalCallsPerTask) {
      qwenRegressionTriggered = true;
      qwenRegressionDetails = `${shape} mean=${agg.gen1PartialMean.toFixed(3)} < NULL ${NULL_BASELINE_PER_SHAPE[shape].meanRetrievalCallsPerTask}`;
      break;
    }
  }

  const cellSemanticAnchorInvarianceCountPerCandidate: Record<string, number> = {};
  for (const c of perCandidate) {
    cellSemanticAnchorInvarianceCountPerCandidate[c.candidateId] = c.tieredFitness.cellSemanticAnchorInvarianceCount;
  }

  return {
    manifestAnchor: MANIFEST_ANCHOR,
    manifestShaAmendment7: MANIFEST_SHA_AMENDMENT_7,
    generated_at: new Date().toISOString(),
    mode: args.mode,
    totalEvals,
    totalCostUsd,
    haltReason,
    perCandidateTierBreakdown: perCandidate,
    retrievalEngagementDeltasPerQwenShape: {
      'qwen-thinking': {
        nullBaselineMean: NULL_BASELINE_PER_SHAPE['qwen-thinking'].meanRetrievalCallsPerTask,
        gen1PartialMean: qwenThinkingAgg.gen1PartialMean,
        deltaAbsolute: qwenThinkingAgg.deltaAbsolute,
      },
      'qwen-non-thinking': {
        nullBaselineMean: NULL_BASELINE_PER_SHAPE['qwen-non-thinking'].meanRetrievalCallsPerTask,
        gen1PartialMean: qwenNonThinkingAgg.gen1PartialMean,
        deltaAbsolute: qwenNonThinkingAgg.deltaAbsolute,
      },
    },
    cellSemanticAnchorInvarianceCountPerCandidate,
    preRegisteredDeltaFloorVerdict: deltaFloorVerdict,
    midRunHaltsBindingThresholds: {
      perCandidateCostOvershoot: {
        threshold: PER_CANDIDATE_COST_OVERSHOOT_THRESHOLD_USD,
        candidatesOvershoot: overshootCount,
      },
      perShapeVariance: {
        thresholdPP: PER_SHAPE_VARIANCE_HALT_PP,
        maxRangeObservedPP,
      },
      qwenRetrievalRegression: {
        triggered: qwenRegressionTriggered,
        details: qwenRegressionDetails,
      },
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  if (!fs.existsSync(RUN_LOG)) fs.writeFileSync(RUN_LOG, '');

  const corpus = loadCorpus();
  const sample = deterministicShuffle(corpus, SAMPLING_SEED).slice(0, N_PER_SHAPE);
  log(`[loaded] corpus=${corpus.length}; sample=${N_PER_SHAPE} via seed=${SAMPLING_SEED}`);

  const candidates = await loadCandidates();
  log(`[loaded] ${SHAPES.length} shapes × ${N_CANDIDATES_PER_SHAPE} candidates each`);

  // Amendment 7 — pre-validate all candidates against cell-semantic anchors (Tier 3 input)
  const candidateValidatorVerdicts = new Map<string, ValidatorVerdict | null>();
  const TYPES_FILE_PATH = path.join(PROMPT_SHAPES_DIR, 'types.ts');
  for (const shape of SHAPES) {
    for (const cand of candidates.get(shape)!) {
      if (cand.variant === 'baseline') {
        // Baselines pass by definition (they ARE the pinned shape file)
        candidateValidatorVerdicts.set(cand.candidateId, null); // null = baseline (Tier 3 = 0.10 by anchor invariance)
        continue;
      }
      const filename = `${shape}-${cand.variant}.ts`;
      const candPath = path.join(GEPA_EVOLVED_DIR, filename);
      try {
        const verdict = validateCandidate({
          candidateShapeFilePath: candPath,
          baselineShapeName: `${shape}.ts`,
          typesFilePath: TYPES_FILE_PATH,
          expectShapeDiff: true,
        });
        candidateValidatorVerdicts.set(cand.candidateId, verdict);
        log(`[validator] ${cand.candidateId} valid=${verdict.valid} violations=${verdict.violations.length}`);
      } catch (e) {
        log(`[validator] ${cand.candidateId} ERROR ${(e as Error).message}`);
        candidateValidatorVerdicts.set(cand.candidateId, null);
      }
    }
  }

  if (args.mode === 'dry-run') {
    log(`[dry-run] would run 5×3×8 = 120 evals (or halt at 30 = Checkpoint B)`);
    for (const shape of SHAPES) {
      for (const cand of candidates.get(shape)!) {
        log(`[dry-run] candidate=${cand.candidateId} variant=${cand.variant} shape.name=${cand.promptShape.name}`);
      }
    }
    return;
  }

  // Resume support
  const existing = new Set<string>();
  let cumulativeCost = 0;

  // Amendment 7 — per-candidate accumulator (rebuilt from JSONL on resume)
  const accs = new Map<string, CandidateAcc>();
  for (const shape of SHAPES) {
    for (const cand of candidates.get(shape)!) {
      const verdict = candidateValidatorVerdicts.get(cand.candidateId);
      // Baselines: validatorPassed = true (anchor invariant by definition).
      // Mutations: validatorPassed = verdict.valid (or false if validator threw).
      const validatorPassed = cand.variant === 'baseline' ? true : verdict?.valid ?? false;
      accs.set(cand.candidateId, makeCandidateAcc(cand, validatorPassed));
    }
  }

  if (fs.existsSync(OUT_JSONL)) {
    for (const line of fs.readFileSync(OUT_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean)) {
      try {
        const r = JSON.parse(line) as EvalRecord;
        existing.add(`${r.candidateId}__${r.instanceId}`);
        cumulativeCost += r.evalCostUsd;
        const acc = accs.get(r.candidateId);
        if (acc) ingestEvalIntoAcc(acc, r);
      } catch { /* skip */ }
    }
    log(`[resume] loaded ${existing.size} existing evals; cumulative $${cumulativeCost.toFixed(4)}`);
  }

  const out = fs.createWriteStream(OUT_JSONL, { flags: existing.size > 0 ? 'a' : 'w' });
  const embedder = createOllamaEmbedder({ baseUrl: OLLAMA_URL, model: EMBEDDER_MODEL });

  const haltAt = args.mode === 'checkpoint-b' ? CHECKPOINT_B_HALT_EVALS : 120;
  log(`[mode=${args.mode}] target eval count: ${haltAt}`);

  let nDone = existing.size;
  let amendment7HaltReason: string | null = null;

  outer: for (const shape of SHAPES) {
    for (const cand of candidates.get(shape)!) {
      for (const inst of sample) {
        const key = `${cand.candidateId}__${inst.instanceId}`;
        if (existing.has(key)) { log(`[skip] ${key} already in JSONL`); continue; }
        if (nDone >= haltAt) { log(`[HALT] reached ${haltAt} evals (Checkpoint B)`); break outer; }
        if (cumulativeCost >= COST_HALT_USD) { log(`[HALT] cumulative $${cumulativeCost.toFixed(4)} >= $${COST_HALT_USD}`); break outer; }
        const r = await runOneEval(cand, inst, embedder);
        if ('error' in r) { log(`[skip] ${key}: ${r.error}`); continue; }
        out.write(JSON.stringify(r) + '\n');
        cumulativeCost += r.evalCostUsd;
        nDone++;
        // Amendment 7 — update accumulator + check mid-run halts
        const acc = accs.get(cand.candidateId);
        if (acc) ingestEvalIntoAcc(acc, r);
        const haltCheck = checkMidRunHalts(accs);
        if (haltCheck.shouldHalt) {
          amendment7HaltReason = haltCheck.reason;
          log(`[HALT-A7] ${haltCheck.reason}`);
          break outer;
        }
        log(`[cumulative] $${cumulativeCost.toFixed(4)} / $${COST_HALT_USD} halt; ${nDone} evals total`);
      }
    }
  }
  out.end();

  // Amendment 7 — write Checkpoint B summary (binding extension per §checkpoint_b_tightened.report_extensions)
  const summary = buildCheckpointBSummary(args, accs, nDone, cumulativeCost, amendment7HaltReason);
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  log(`[summary] wrote ${SUMMARY_JSON}`);
  log(`[delta-floor] verdict=${summary.preRegisteredDeltaFloorVerdict.overallVerdict}`);
  log(`[delta-floor]   threshold_1_aggregate_tier_1=${summary.preRegisteredDeltaFloorVerdict.threshold1AggregateTier1} (value=${summary.preRegisteredDeltaFloorVerdict.threshold1ValuePP.toFixed(2)}pp)`);
  log(`[delta-floor]   threshold_2_qwen_retrieval_absolute=${summary.preRegisteredDeltaFloorVerdict.threshold2QwenRetrievalAbsolute} (max_delta=${summary.preRegisteredDeltaFloorVerdict.threshold2MaxDeltaAbsolute.toFixed(3)})`);
  log(`[delta-floor]   threshold_3_compound_tier_1_plus_tier_2=${summary.preRegisteredDeltaFloorVerdict.threshold3CompoundTier1PlusTier2} (tier1=${summary.preRegisteredDeltaFloorVerdict.threshold3Tier1ValuePP.toFixed(2)}pp tier2_agg=${summary.preRegisteredDeltaFloorVerdict.threshold3Tier2Aggregate.toFixed(3)})`);

  log(`[done] ${nDone} evals; total cost $${cumulativeCost.toFixed(4)}; halt_reason=${amendment7HaltReason ?? 'none (Checkpoint B reached or completed)'}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
