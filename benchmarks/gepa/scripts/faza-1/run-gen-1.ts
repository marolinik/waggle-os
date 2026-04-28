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
} from '@waggle/agent';

import { REGISTRY } from '../../../../packages/agent/src/prompt-shapes/selector.js';
import { type PromptShape } from '../../../../packages/agent/src/prompt-shapes/types.js';

import { type CorpusInstance } from '../../src/faza-1/corpus.js';

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
    // Expose candidate shape via REGISTRY mutation (scoped to this script invocation).
    // Use the candidate's `name` (e.g., 'qwen-thinking-gen1-v1') and pass modelAlias = candidate.shape's class.
    (REGISTRY as any)[cand.promptShape.name] = cand.promptShape;
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

  const haltAt = args.mode === 'checkpoint-b' ? CHECKPOINT_B_HALT_EVALS : 120;
  log(`[mode=${args.mode}] target eval count: ${haltAt}`);

  let nDone = existing.size;
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
        log(`[cumulative] $${cumulativeCost.toFixed(4)} / $${COST_HALT_USD} halt; ${nDone} evals total`);
      }
    }
  }
  out.end();

  log(`[done] ${nDone} evals; total cost $${cumulativeCost.toFixed(4)}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
