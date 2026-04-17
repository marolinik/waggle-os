/**
 * PromptAssembler v5 eval harness.
 *
 * Executes the §11 measurement protocol from the v5 brief:
 *  - 12 conditions (7 primary + 3 secondary-26b + 2 secondary-qwen)
 *  - 6 scenarios from SCENARIOS_V5 (revised priming per §11.4)
 *  - 3 seeds per condition, with variance-triggered retry (§11.5)
 *  - 4-model frontier judge ensemble (§11.2): Gemini 3.1 Pro, GPT-5.4,
 *    Grok 4.20, MiniMax M2.7 — no Claude judge to avoid v4's
 *    same-family bias
 *  - Per-run ensemble mean + disagreement tracking
 *  - WAGGLE_EVAL_MODE=1 tier bypass throughout (§11.3)
 *  - Pre-eval slug probe across all 11 slugs (§17 step 7)
 *
 * Usage (from repo root):
 *   tsx packages/agent/tests/eval/prompt-assembler-v5-eval.ts
 *
 * Environment:
 *   WAGGLE_DATA_DIR       — override ~/.waggle (for non-default installs)
 *   WAGGLE_EVAL_SKIP_SECONDARY=1  — skip Gemma 4 26B MoE + Qwen thinking
 *   WAGGLE_EVAL_SEEDS     — base seeds per condition (default 3)
 *   WAGGLE_EVAL_SKIP_SLUG_PROBE=1 — skip the pre-eval slug probe
 *   WAGGLE_EVAL_MAX_JUDGE_MS=180000 — per-judge-call timeout (ms, default 3 min)
 *
 * Outputs:
 *   tmp_bench_results-v5.json  — full structured results (gitignored)
 *   EVAL-RESULTS-V5.md         — rendered results per §11.8 (committed)
 *
 * Deviation policy: if any judge is unavailable at eval time, continue
 * with the remaining judges (minimum 3). Do NOT substitute Sonnet 4.6
 * — the ensemble must stay outside the Claude family. If fewer than 3
 * judges are reachable, the eval halts and reports partial state.
 */

import { MindDB, VaultStore, type Embedder } from '@waggle/core';
import { Orchestrator } from '../../src/orchestrator.js';
import { type ModelTier } from '../../src/model-tier.js';
import { detectTaskShape } from '../../src/task-shape.js';
import { LLMJudge, type JudgeScore } from '../../src/judge.js';
import type { ScaffoldStyle } from '../../src/prompt-assembler.js';
import { SCENARIOS_V5, type PromptAssemblerScenario } from './scenarios-prompt-assembler-v5.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// ── Eval-mode flag — MUST be set before Orchestrator construction so the
//    embedding-provider tier gate (and any future gates) are bypassed. ──
process.env.WAGGLE_EVAL_MODE = '1';

// ── Config ──────────────────────────────────────────────────────────

const WAGGLE_DATA_DIR = process.env.WAGGLE_DATA_DIR ?? path.join(os.homedir(), '.waggle');
const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(path.join(HARNESS_DIR, '..', '..', '..', '..'));
const RESULTS_JSON = path.join(REPO_ROOT, 'tmp_bench_results-v5.json');
const RESULTS_MD = path.join(REPO_ROOT, 'EVAL-RESULTS-V5.md');

// Candidate + priming slugs (verified live 2026-04-17 via v4 eval run).
const PRIMING_MODEL = 'claude-sonnet-4-6';
const OPUS_4_7_MODEL = 'claude-opus-4-7';
const OPUS_4_6_MODEL = 'claude-opus-4-6';
const GEMMA_31B_MODEL = 'google/gemma-4-31b-it';
const GEMMA_26B_MOE_MODEL = 'google/gemma-4-26b-a4b-it';
// v5 brief §7.1: Qwen thinking variant is the v5 Qwen candidate.
const QWEN_THINKING_MODEL = 'qwen/qwen3-30b-a3b-thinking-2507';
// Kept only for legacy slug probe per §14 — not used in any v5 condition.
const QWEN_INSTRUCT_LEGACY_MODEL = 'qwen/qwen3-30b-a3b-instruct-2507';

// Judge slugs (4 labs, none in Claude family). Verified live 2026-04-17.
const JUDGE_GEMINI = 'gemini-3.1-pro-preview';
const JUDGE_GPT = 'gpt-5.4';
const JUDGE_GROK = 'grok-4.20';
const JUDGE_MINIMAX = 'MiniMax-M2.7';

const TEMPERATURE_GEN = 0.2;
const TEMPERATURE_JUDGE = 0;
const MAX_TOKENS_GEN = 1024;
const MAX_TOKENS_JUDGE = 512;
const BASE_SEEDS = Number.parseInt(process.env.WAGGLE_EVAL_SEEDS ?? '3', 10);
const SKIP_SECONDARY = process.env.WAGGLE_EVAL_SKIP_SECONDARY === '1';
const SKIP_SLUG_PROBE = process.env.WAGGLE_EVAL_SKIP_SLUG_PROBE === '1';
const MAX_JUDGE_MS = Number.parseInt(process.env.WAGGLE_EVAL_MAX_JUDGE_MS ?? '180000', 10);

// Variance-retry threshold — if max-min of per-seed ensemble means
// exceeds this on a condition, add 2 more seeds (total 5).
const VARIANCE_RETRY_THRESHOLD = 0.15;
const RETRY_EXTRA_SEEDS = 2;
const MIN_JUDGES_REACHABLE = 3;

// ── Types ────────────────────────────────────────────────────────────

type JudgeName = typeof JUDGE_GEMINI | typeof JUDGE_GPT | typeof JUDGE_GROK | typeof JUDGE_MINIMAX;
type Provider = 'anthropic' | 'openrouter' | 'openai' | 'xai' | 'minimax' | 'gemini';

interface ConditionSpec {
  code: string;
  label: string;
  model: string;
  provider: Extract<Provider, 'anthropic' | 'openrouter'>;
  usesPromptAssembler: boolean;
  scaffoldStyle?: ScaffoldStyle;
  suite: 'primary' | 'secondary-26b' | 'secondary-qwen';
}

interface JudgeCallResult {
  judge: JudgeName;
  score: JudgeScore | null;
  error?: string;
  durationMs: number;
}

interface EnsembleScore {
  judgeResults: JudgeCallResult[];
  judgesAvailable: number;
  mean: number;      // mean over judges that returned a parsed score
  min: number;
  max: number;
  disagreement: number; // max - min across available judges
}

interface ConditionRun {
  seed: number;
  output: string;
  durationMs: number;
  debug?: {
    tier: ModelTier;
    taskShape: string | null;
    taskShapeConfidence: number;
    scaffoldApplied: boolean;
    scaffoldStyle: ScaffoldStyle;
    sectionsIncluded: string[];
    framesUsed: number;
    totalChars: number;
  };
  ensemble?: EnsembleScore;
  error?: string;
}

interface ScenarioResult {
  scenario: string;
  shape: string;
  language: string;
  primingFrameCount: number;
  primingMatches: Record<string, boolean>;
  primingFailed: boolean;
  primingPartial: boolean;
  primingDurationMs: number;
  effectiveTier: string;
  conditions: Record<string, ConditionRun[]>;
  retriedConditions: string[];
}

interface SlugProbeResult {
  slug: string;
  provider: Provider;
  role: 'priming' | 'candidate' | 'candidate-legacy' | 'judge';
  ok: boolean;
  error?: string;
  durationMs: number;
}

interface EvalResult {
  runDate: string;
  commit: string;
  durationMs: number;
  slugProbe: SlugProbeResult[];
  judgesAvailable: JudgeName[];
  tierBypass: boolean;
  seeds: number;
  scenarios: ScenarioResult[];
}

// ── Vault hydration ─────────────────────────────────────────────────

function hydrateVault(): Record<string, string | null> {
  const vault = new VaultStore(WAGGLE_DATA_DIR);
  const keys: Record<string, string | null> = {
    anthropic: vault.get('anthropic')?.value ?? null,
    openrouter: vault.get('openrouter')?.value ?? null,
    openai: vault.get('openai')?.value ?? null,
    gemini: vault.get('gemini')?.value ?? null,
    xai: vault.get('xai')?.value ?? null,
    minimax: vault.get('minimax')?.value ?? null,
  };
  if (keys.anthropic) process.env.ANTHROPIC_API_KEY = keys.anthropic;
  if (keys.openrouter) process.env.OPENROUTER_API_KEY = keys.openrouter;
  if (keys.openai) process.env.OPENAI_API_KEY = keys.openai;
  if (keys.gemini) process.env.GEMINI_API_KEY = keys.gemini;
  if (keys.xai) process.env.XAI_API_KEY = keys.xai;
  if (keys.minimax) process.env.MINIMAX_API_KEY = keys.minimax;
  return keys;
}

// ── LLM clients ─────────────────────────────────────────────────────

interface CallOpts {
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  /** Judge-only: per-call timeout. */
  timeoutMs?: number;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: CallOpts = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not hydrated from vault');
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_GEN,
    messages: [{ role: 'user', content: userMsg }],
  };
  if (systemPrompt) body.system = systemPrompt;
  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    },
    opts.timeoutMs ?? 120_000,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic ${model} ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.map(c => c.text ?? '').join('');
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: CallOpts = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not hydrated from vault');
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMsg });
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_GEN,
    temperature: opts.temperature ?? TEMPERATURE_GEN,
  };
  if (opts.seed !== undefined) body.seed = opts.seed;
  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'http-referer': 'https://waggle-os.ai',
        'x-title': 'Waggle PromptAssembler v5 eval',
      },
      body: JSON.stringify(body),
    },
    opts.timeoutMs ?? 180_000,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${model} ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function callOpenAICompat(
  baseUrl: string,
  apiKey: string,
  apiKeyName: string,
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: CallOpts = {},
  extraBody: Record<string, unknown> = {},
): Promise<string> {
  if (!apiKey) throw new Error(`${apiKeyName} not hydrated from vault`);
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMsg });
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_JUDGE,
    temperature: opts.temperature ?? TEMPERATURE_JUDGE,
    ...extraBody,
  };
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    opts.timeoutMs ?? MAX_JUDGE_MS,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${apiKeyName} ${model} ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function callGemini(
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: CallOpts = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not hydrated from vault');
  // Use Gemini's OpenAI-compatible shim — same body shape as OpenAI.
  return callOpenAICompat(
    'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey,
    'GEMINI_API_KEY',
    model,
    systemPrompt,
    userMsg,
    opts,
  );
}

async function callGenerationModel(
  provider: 'anthropic' | 'openrouter',
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: CallOpts = {},
): Promise<string> {
  if (provider === 'anthropic') return callAnthropic(model, systemPrompt, userMsg, opts);
  return callOpenRouter(model, systemPrompt, userMsg, opts);
}

// ── Judge wiring ────────────────────────────────────────────────────

interface JudgeWiring {
  name: JudgeName;
  call: (prompt: string) => Promise<string>;
  /** True after a successful slug probe. False → excluded from ensemble. */
  available: boolean;
}

function buildJudgeWirings(): JudgeWiring[] {
  return [
    {
      name: JUDGE_GEMINI,
      available: true,
      call: (p) => callGemini(JUDGE_GEMINI, '', p, { maxTokens: MAX_TOKENS_JUDGE, temperature: TEMPERATURE_JUDGE }),
    },
    {
      name: JUDGE_GPT,
      available: true,
      call: (p) =>
        callOpenAICompat(
          'https://api.openai.com/v1',
          process.env.OPENAI_API_KEY ?? '',
          'OPENAI_API_KEY',
          JUDGE_GPT,
          '',
          p,
          { maxTokens: MAX_TOKENS_JUDGE, temperature: TEMPERATURE_JUDGE },
        ),
    },
    {
      name: JUDGE_GROK,
      available: true,
      call: (p) =>
        callOpenAICompat(
          'https://api.x.ai/v1',
          process.env.XAI_API_KEY ?? '',
          'XAI_API_KEY',
          JUDGE_GROK,
          '',
          p,
          { maxTokens: MAX_TOKENS_JUDGE, temperature: TEMPERATURE_JUDGE },
          // Per §11.2: explicitly enable Grok's reasoning mode for judging.
          { reasoning: { enabled: true } },
        ),
    },
    {
      name: JUDGE_MINIMAX,
      available: true,
      call: (p) =>
        callOpenAICompat(
          'https://api.minimaxi.chat/v1',
          process.env.MINIMAX_API_KEY ?? '',
          'MINIMAX_API_KEY',
          JUDGE_MINIMAX,
          '',
          p,
          { maxTokens: MAX_TOKENS_JUDGE, temperature: TEMPERATURE_JUDGE },
        ),
    },
  ];
}

// ── Slug probe ──────────────────────────────────────────────────────

interface SlugProbeSpec {
  slug: string;
  provider: Provider;
  role: SlugProbeResult['role'];
  probe: () => Promise<string>;
}

function buildSlugProbeSpecs(): SlugProbeSpec[] {
  const trivial = 'Reply with exactly: OK';
  return [
    { slug: PRIMING_MODEL, provider: 'anthropic', role: 'priming', probe: () => callAnthropic(PRIMING_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: OPUS_4_7_MODEL, provider: 'anthropic', role: 'candidate', probe: () => callAnthropic(OPUS_4_7_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: OPUS_4_6_MODEL, provider: 'anthropic', role: 'candidate', probe: () => callAnthropic(OPUS_4_6_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: GEMMA_31B_MODEL, provider: 'openrouter', role: 'candidate', probe: () => callOpenRouter(GEMMA_31B_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: GEMMA_26B_MOE_MODEL, provider: 'openrouter', role: 'candidate', probe: () => callOpenRouter(GEMMA_26B_MOE_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: QWEN_THINKING_MODEL, provider: 'openrouter', role: 'candidate', probe: () => callOpenRouter(QWEN_THINKING_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: QWEN_INSTRUCT_LEGACY_MODEL, provider: 'openrouter', role: 'candidate-legacy', probe: () => callOpenRouter(QWEN_INSTRUCT_LEGACY_MODEL, '', trivial, { maxTokens: 20 }) },
    { slug: JUDGE_GEMINI, provider: 'gemini', role: 'judge', probe: () => callGemini(JUDGE_GEMINI, '', trivial, { maxTokens: 20 }) },
    {
      slug: JUDGE_GPT,
      provider: 'openai',
      role: 'judge',
      probe: () =>
        callOpenAICompat(
          'https://api.openai.com/v1',
          process.env.OPENAI_API_KEY ?? '',
          'OPENAI_API_KEY',
          JUDGE_GPT,
          '',
          trivial,
          { maxTokens: 20 },
        ),
    },
    {
      slug: JUDGE_GROK,
      provider: 'xai',
      role: 'judge',
      probe: () =>
        callOpenAICompat(
          'https://api.x.ai/v1',
          process.env.XAI_API_KEY ?? '',
          'XAI_API_KEY',
          JUDGE_GROK,
          '',
          trivial,
          { maxTokens: 20 },
        ),
    },
    {
      slug: JUDGE_MINIMAX,
      provider: 'minimax',
      role: 'judge',
      probe: () =>
        callOpenAICompat(
          'https://api.minimaxi.chat/v1',
          process.env.MINIMAX_API_KEY ?? '',
          'MINIMAX_API_KEY',
          JUDGE_MINIMAX,
          '',
          trivial,
          { maxTokens: 20 },
        ),
    },
  ];
}

async function runSlugProbe(): Promise<SlugProbeResult[]> {
  const specs = buildSlugProbeSpecs();
  const results: SlugProbeResult[] = [];
  for (const spec of specs) {
    const t0 = Date.now();
    try {
      await spec.probe();
      results.push({ slug: spec.slug, provider: spec.provider, role: spec.role, ok: true, durationMs: Date.now() - t0 });
      console.log(`  [probe] ✓ ${spec.role.padEnd(18)} ${spec.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ slug: spec.slug, provider: spec.provider, role: spec.role, ok: false, error: msg.slice(0, 200), durationMs: Date.now() - t0 });
      console.log(`  [probe] ✗ ${spec.role.padEnd(18)} ${spec.slug}  [${msg.slice(0, 100)}]`);
    }
  }
  return results;
}

// ── Conditions ──────────────────────────────────────────────────────

const PRIMARY_CONDITIONS: ConditionSpec[] = [
  { code: 'A', label: 'Opus 4.7 · current', model: OPUS_4_7_MODEL, provider: 'anthropic', usesPromptAssembler: false, suite: 'primary' },
  { code: 'B', label: 'Gemma 4 31B · current', model: GEMMA_31B_MODEL, provider: 'openrouter', usesPromptAssembler: false, suite: 'primary' },
  { code: 'C1', label: 'Gemma 4 31B · PA (compression)', model: GEMMA_31B_MODEL, provider: 'openrouter', usesPromptAssembler: true, scaffoldStyle: 'compression', suite: 'primary' },
  { code: 'C2', label: 'Gemma 4 31B · PA (expansion)', model: GEMMA_31B_MODEL, provider: 'openrouter', usesPromptAssembler: true, scaffoldStyle: 'expansion', suite: 'primary' },
  { code: 'D', label: 'Opus 4.7 · PA (compression)', model: OPUS_4_7_MODEL, provider: 'anthropic', usesPromptAssembler: true, scaffoldStyle: 'compression', suite: 'primary' },
  { code: 'E', label: 'Opus 4.6 · current', model: OPUS_4_6_MODEL, provider: 'anthropic', usesPromptAssembler: false, suite: 'primary' },
  { code: 'F', label: 'Opus 4.6 · PA (compression)', model: OPUS_4_6_MODEL, provider: 'anthropic', usesPromptAssembler: true, scaffoldStyle: 'compression', suite: 'primary' },
];

const SECONDARY_26B_CONDITIONS: ConditionSpec[] = [
  { code: "B'", label: 'Gemma 4 26B MoE · current', model: GEMMA_26B_MOE_MODEL, provider: 'openrouter', usesPromptAssembler: false, suite: 'secondary-26b' },
  { code: "C1'", label: 'Gemma 4 26B MoE · PA (compression)', model: GEMMA_26B_MOE_MODEL, provider: 'openrouter', usesPromptAssembler: true, scaffoldStyle: 'compression', suite: 'secondary-26b' },
  { code: "C2'", label: 'Gemma 4 26B MoE · PA (expansion)', model: GEMMA_26B_MOE_MODEL, provider: 'openrouter', usesPromptAssembler: true, scaffoldStyle: 'expansion', suite: 'secondary-26b' },
];

const SECONDARY_QWEN_CONDITIONS: ConditionSpec[] = [
  { code: 'G', label: 'Qwen3-30B thinking · current', model: QWEN_THINKING_MODEL, provider: 'openrouter', usesPromptAssembler: false, suite: 'secondary-qwen' },
  { code: 'H', label: 'Qwen3-30B thinking · PA (compression)', model: QWEN_THINKING_MODEL, provider: 'openrouter', usesPromptAssembler: true, scaffoldStyle: 'compression', suite: 'secondary-qwen' },
];

// ── Stub embedder (reuse v4 pattern) ────────────────────────────────

class StubEmbedder implements Embedder {
  private dim = 384;
  async embed(_text: string): Promise<Float32Array> { return new Float32Array(this.dim).fill(0); }
  async embedBatch(texts: string[]): Promise<Float32Array[]> { return Promise.all(texts.map(t => this.embed(t))); }
  getDimension(): number { return this.dim; }
}

// ── Scenario pipeline ───────────────────────────────────────────────

interface ScenarioSetup {
  tempDir: string;
  dbPath: string;
  snapshotPath: string;
}

function setupCleanScenario(scenarioName: string): ScenarioSetup {
  const tempDir = path.join(os.tmpdir(), `waggle-v5eval-${Date.now()}-${scenarioName}`);
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  const dbPath = path.join(tempDir, 'mind.db');
  const snapshotPath = path.join(tempDir, 'snapshot.db');
  const db = new MindDB(dbPath);
  const raw = db.getDatabase();
  const count = (raw.prepare('SELECT COUNT(*) as c FROM memory_frames').get() as { c: number }).c;
  if (count !== 0) {
    db.close();
    throw new Error(`CLEAN SLATE VIOLATION for ${scenarioName}: ${count} frames in fresh DB`);
  }
  db.close();
  return { tempDir, dbPath, snapshotPath };
}

async function runPriming(orch: Orchestrator, scenario: PromptAssemblerScenario): Promise<void> {
  for (const turn of scenario.primingTurns) {
    const systemPrompt = orch.buildSystemPrompt();
    const assistantMsg = await callAnthropic(PRIMING_MODEL, systemPrompt, turn.user, {
      temperature: 0,
      maxTokens: MAX_TOKENS_GEN,
    });
    await orch.autoSaveFromExchange(turn.user, assistantMsg);
  }
}

function verifyMemory(db: MindDB, scenario: PromptAssemblerScenario): { count: number; matches: Record<string, boolean> } {
  const raw = db.getDatabase();
  const count = (raw.prepare('SELECT COUNT(*) as c FROM memory_frames').get() as { c: number }).c;
  const matches: Record<string, boolean> = {};
  for (const sub of scenario.memoryVerificationSubstrings) {
    const row = raw.prepare('SELECT 1 FROM memory_frames WHERE content LIKE ? LIMIT 1').get(`%${sub}%`);
    matches[sub] = !!row;
  }
  return { count, matches };
}

async function runCondition(
  snapshotPath: string,
  condition: ConditionSpec,
  scenario: PromptAssemblerScenario,
  workDir: string,
  seed: number,
): Promise<ConditionRun> {
  const safeCode = condition.code.replace(/[^\w]/g, '_');
  const workDbPath = path.join(workDir, `work-${safeCode}-seed${seed}.db`);
  fs.copyFileSync(snapshotPath, workDbPath);

  const db = new MindDB(workDbPath);
  const orch = new Orchestrator({ db, embedder: new StubEmbedder(), model: condition.model });

  let systemPrompt: string;
  let debug: ConditionRun['debug'] = undefined;
  const start = Date.now();

  try {
    if (condition.usesPromptAssembler) {
      process.env.WAGGLE_PROMPT_ASSEMBLER = '1';
      const taskShape = detectTaskShape(scenario.testTurn.query);
      const assembled = await orch.buildAssembledPrompt(scenario.testTurn.query, null, {
        taskShape,
        scaffoldStyle: condition.scaffoldStyle ?? 'compression',
      });
      systemPrompt = assembled.system;
      debug = {
        tier: assembled.debug.tier,
        taskShape: assembled.debug.taskShape,
        taskShapeConfidence: assembled.debug.taskShapeConfidence,
        scaffoldApplied: assembled.debug.scaffoldApplied,
        scaffoldStyle: assembled.debug.scaffoldStyle,
        sectionsIncluded: assembled.debug.sectionsIncluded,
        framesUsed: assembled.debug.framesUsed,
        totalChars: assembled.debug.totalChars,
      };
    } else {
      delete process.env.WAGGLE_PROMPT_ASSEMBLER;
      systemPrompt = orch.buildSystemPrompt();
    }

    const output = await callGenerationModel(
      condition.provider,
      condition.model,
      systemPrompt,
      scenario.testTurn.query,
      { temperature: TEMPERATURE_GEN, seed },
    );
    db.close();
    return { seed, output, durationMs: Date.now() - start, debug };
  } catch (err) {
    db.close();
    return {
      seed,
      output: '',
      durationMs: Date.now() - start,
      debug,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Ensemble judging ────────────────────────────────────────────────

async function judgeWithEnsemble(
  judges: JudgeWiring[],
  scenario: PromptAssemblerScenario,
  goldOutput: string,
  candidateOutput: string,
): Promise<EnsembleScore> {
  // Fire all available judges in parallel; Promise.allSettled so a single
  // rate-limit doesn't lose the whole ensemble row.
  const active = judges.filter(j => j.available);
  const judgeInput = {
    input: scenario.testTurn.query,
    expected: goldOutput,
    actual: candidateOutput,
    context: `task_shape=${scenario.shape}, language=${scenario.language}`,
  };

  const results = await Promise.allSettled(
    active.map(async (judge) => {
      const t0 = Date.now();
      const llmJudge = new LLMJudge(judge.call);
      try {
        const score = await llmJudge.score(judgeInput);
        return { judge: judge.name, score, durationMs: Date.now() - t0 } satisfies JudgeCallResult;
      } catch (err) {
        return {
          judge: judge.name,
          score: null,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
          durationMs: Date.now() - t0,
        } satisfies JudgeCallResult;
      }
    }),
  );

  const judgeResults: JudgeCallResult[] = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { judge: active[i].name, score: null, error: String(r.reason).slice(0, 200), durationMs: 0 },
  );

  const validScores = judgeResults.filter(r => r.score !== null && r.score.parsed).map(r => r.score!.overall);
  const mean = validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
  const min = validScores.length ? Math.min(...validScores) : 0;
  const max = validScores.length ? Math.max(...validScores) : 0;
  return {
    judgeResults,
    judgesAvailable: validScores.length,
    mean,
    min,
    max,
    disagreement: max - min,
  };
}

function conditionMeanFromRuns(runs: ConditionRun[] | undefined): number {
  if (!runs || runs.length === 0) return 0;
  const validMeans = runs.map(r => r.ensemble?.mean ?? 0).filter(x => x > 0);
  if (!validMeans.length) return 0;
  return validMeans.reduce((a, b) => a + b, 0) / validMeans.length;
}

function perSeedDisagreement(runs: ConditionRun[]): number {
  const means = runs.map(r => r.ensemble?.mean ?? 0).filter(x => x > 0);
  if (means.length < 2) return 0;
  return Math.max(...means) - Math.min(...means);
}

// ── Markdown renderer (§11.8) ───────────────────────────────────────

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function renderMarkdown(result: EvalResult): string {
  const lines: string[] = [];
  lines.push('# PromptAssembler v5 eval results');
  lines.push('');
  lines.push(`**Run date:** ${result.runDate}`);
  lines.push(`**Commit:** ${result.commit}`);
  lines.push(`**Duration:** ${(result.durationMs / 1000 / 60).toFixed(1)} min`);
  lines.push(`**Base seeds per condition:** ${result.seeds} (5 on variance retry)`);
  lines.push(`**Judge ensemble:** ${result.judgesAvailable.join(', ')} (mean across ${result.judgesAvailable.length} judges = primary score)`);
  lines.push(`**Tier bypass:** ${result.tierBypass ? 'WAGGLE_EVAL_MODE=1 (confirmed enterprise-equivalent throughout)' : 'NOT ACTIVE — results may be tier-confounded'}`);
  lines.push('');

  // Slug probe summary
  lines.push('## Slug probe');
  lines.push('');
  lines.push('| Slug | Role | Result |');
  lines.push('|------|------|--------|');
  for (const p of result.slugProbe) {
    lines.push(`| \`${p.slug}\` | ${p.role} | ${p.ok ? '✓' : `✗ ${(p.error ?? '').slice(0, 60)}`} |`);
  }
  lines.push('');

  // Aggregate disagreement
  const allRuns: ConditionRun[] = [];
  for (const s of result.scenarios) for (const runs of Object.values(s.conditions)) allRuns.push(...runs);
  const allDisagreements = allRuns.map(r => r.ensemble?.disagreement ?? 0).filter(x => x > 0);
  const meanDisagreement = mean(allDisagreements);

  lines.push(`**Mean inter-judge disagreement (max − min across ${result.judgesAvailable.length} judges, per output):** ${meanDisagreement.toFixed(3)}`);
  lines.push(meanDisagreement > 0.25
    ? '⚠️  FLAG: mean disagreement > 0.25 — findings reported but not claimed as robust.'
    : '✓ Disagreement below 0.25 threshold — findings are methodologically sound.');
  lines.push('');

  const reasoningScenarios = result.scenarios.filter(s => s.shape !== 'draft' && s.shape !== 'mixed');

  // ── Hypothesis outcomes ──
  lines.push('## Hypothesis outcomes');
  lines.push('');

  // H1: PA helps frontier (F > E)
  lines.push('### H1 — PA helps frontier (F > E)');
  lines.push('');
  lines.push('| Scenario | F | E | F − E |');
  lines.push('|----------|-----|-----|-------|');
  let h1Wins = 0;
  let h1Regressions: number[] = [];
  for (const s of result.scenarios) {
    const f = conditionMeanFromRuns(s.conditions['F']);
    const e = conditionMeanFromRuns(s.conditions['E']);
    const delta = f - e;
    if (delta > 0) h1Wins++;
    else if (delta < -0.05) h1Regressions.push(delta);
    lines.push(`| ${s.scenario} | ${f.toFixed(3)} | ${e.toFixed(3)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} |`);
  }
  const h1Pass = h1Wins >= 4 && h1Regressions.length === 0;
  lines.push(`Result: **${h1Pass ? 'PASS' : 'FAIL'}** — F > E on ${h1Wins}/${result.scenarios.length} scenarios; ${h1Regressions.length} regressions > 5pp.`);
  lines.push('');

  // H2: PA helps reasoning-tuned small on analytical (H > G)
  lines.push('### H2 — PA helps reasoning-tuned small (H > G on analytical)');
  lines.push('');
  const analyticalShapes = ['compare', 'decide', 'review'] as const;
  const analytical = result.scenarios.filter(s => (analyticalShapes as readonly string[]).includes(s.shape));
  lines.push('| Scenario (analytical) | H | G | H − G |');
  lines.push('|----------|-----|-----|-------|');
  let h2Wins = 0;
  let h2MaxGain = 0;
  for (const s of analytical) {
    const h = conditionMeanFromRuns(s.conditions['H']);
    const g = conditionMeanFromRuns(s.conditions['G']);
    const delta = h - g;
    if (delta > 0) h2Wins++;
    if (delta > h2MaxGain) h2MaxGain = delta;
    lines.push(`| ${s.scenario} | ${h.toFixed(3)} | ${g.toFixed(3)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} |`);
  }
  const h2Pass = h2Wins >= 3 && h2MaxGain >= 0.1;
  lines.push(`Result: **${h2Pass ? 'PASS' : analytical.length ? 'FAIL' : 'N/A (no analytical scenarios)'}** — H > G on ${h2Wins}/${analytical.length} analytical scenarios; max gain ${(h2MaxGain * 100).toFixed(1)}pp.`);
  lines.push('');

  // H3: expansion closes ≥40% for Gemma (C2 vs B)
  lines.push('### H3 — Expansion scaffold helps Gemma (C2 closes ≥40% of A − B on reasoning)');
  lines.push('');
  lines.push('| Scenario (reasoning) | A | B | C2 | (C2 − B) | (A − B) | closure |');
  lines.push('|----------|-----|-----|-----|----------|---------|---------|');
  let h3ClosureSum = 0;
  let h3Count = 0;
  for (const s of reasoningScenarios) {
    const a = conditionMeanFromRuns(s.conditions['A']);
    const b = conditionMeanFromRuns(s.conditions['B']);
    const c2 = conditionMeanFromRuns(s.conditions['C2']);
    const gap = a - b;
    const closure = c2 - b;
    const closurePct = gap > 0 ? (closure / gap) * 100 : 0;
    h3ClosureSum += closurePct;
    h3Count++;
    lines.push(`| ${s.scenario} | ${a.toFixed(3)} | ${b.toFixed(3)} | ${c2.toFixed(3)} | ${closure >= 0 ? '+' : ''}${closure.toFixed(3)} | ${gap.toFixed(3)} | ${closurePct.toFixed(1)}% |`);
  }
  const h3MeanClosure = h3Count ? h3ClosureSum / h3Count : 0;
  const h3Pass = h3MeanClosure >= 40;
  lines.push(`Result: **${h3Pass ? 'PASS' : 'FAIL'}** — mean closure ${h3MeanClosure.toFixed(1)}% of the A−B gap (target ≥40%).`);
  lines.push('');

  // H4: compression regresses Gemma (C1 vs B)
  lines.push('### H4 — Compression scaffold regresses Gemma (replication of v4)');
  lines.push('');
  lines.push('| Scenario (reasoning) | B | C1 | (C1 − B) |');
  lines.push('|----------|-----|-----|----------|');
  let h4Neg = 0;
  for (const s of reasoningScenarios) {
    const b = conditionMeanFromRuns(s.conditions['B']);
    const c1 = conditionMeanFromRuns(s.conditions['C1']);
    const delta = c1 - b;
    if (delta <= 0) h4Neg++;
    lines.push(`| ${s.scenario} | ${b.toFixed(3)} | ${c1.toFixed(3)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} |`);
  }
  const h4Pass = reasoningScenarios.length ? h4Neg >= reasoningScenarios.length - 1 : false;
  lines.push(`Result: **${h4Pass ? 'REPLICATED' : 'NOT REPLICATED'}** — C1 ≤ B on ${h4Neg}/${reasoningScenarios.length} reasoning scenarios.`);
  lines.push('');

  // Priming verification
  lines.push('## Priming verification');
  lines.push('');
  lines.push('| Scenario | Lang | Frames | Substrings | Failed | Partial |');
  lines.push('|----------|------|--------|------------|--------|---------|');
  for (const s of result.scenarios) {
    const matchStr = Object.entries(s.primingMatches)
      .map(([k, v]) => `${v ? '✓' : '✗'} ${k}`)
      .join(', ');
    lines.push(`| ${s.scenario} | ${s.language} | ${s.primingFrameCount} | ${matchStr} | ${s.primingFailed ? '✗' : '—'} | ${s.primingPartial ? '⚠' : '—'} |`);
  }
  lines.push('');

  // Full condition grid — primary
  lines.push('## Full condition grid — Gemma 4 31B (primary)');
  lines.push('');
  const primaryCodes = PRIMARY_CONDITIONS.map(c => c.code);
  lines.push(`| Scenario | shape | ${primaryCodes.join(' | ')} |`);
  lines.push(`|----------|-------|${primaryCodes.map(() => '---').join('|')}|`);
  for (const s of result.scenarios) {
    const cells = primaryCodes.map(code => conditionMeanFromRuns(s.conditions[code]).toFixed(3));
    lines.push(`| ${s.scenario} | ${s.shape} | ${cells.join(' | ')} |`);
  }
  lines.push('');

  // Secondary 26B
  const hasSecondary26 = result.scenarios.some(s => s.conditions["B'"] || s.conditions["C1'"] || s.conditions["C2'"]);
  if (hasSecondary26) {
    lines.push('## Secondary — Gemma 4 26B MoE');
    lines.push('');
    lines.push(`| Scenario | B' | C1' | C2' | (C2'−B') |`);
    lines.push(`|----------|------|------|------|----------|`);
    for (const s of result.scenarios) {
      const bp = conditionMeanFromRuns(s.conditions["B'"]);
      const c1p = conditionMeanFromRuns(s.conditions["C1'"]);
      const c2p = conditionMeanFromRuns(s.conditions["C2'"]);
      lines.push(`| ${s.scenario} | ${bp.toFixed(3)} | ${c1p.toFixed(3)} | ${c2p.toFixed(3)} | ${(c2p - bp >= 0 ? '+' : '') + (c2p - bp).toFixed(3)} |`);
    }
    lines.push('');
  }

  // Secondary Qwen
  const hasSecondaryQ = result.scenarios.some(s => s.conditions['G'] || s.conditions['H']);
  if (hasSecondaryQ) {
    lines.push('## Secondary — Qwen3-30B thinking');
    lines.push('');
    lines.push('| Scenario | G | H | (H − G) |');
    lines.push('|----------|-----|-----|---------|');
    for (const s of result.scenarios) {
      const g = conditionMeanFromRuns(s.conditions['G']);
      const h = conditionMeanFromRuns(s.conditions['H']);
      lines.push(`| ${s.scenario} | ${g.toFixed(3)} | ${h.toFixed(3)} | ${(h - g >= 0 ? '+' : '') + (h - g).toFixed(3)} |`);
    }
    lines.push('');
  }

  // Opus generation delta
  lines.push('## Opus generation delta (A 4.7 − E 4.6)');
  lines.push('');
  lines.push('| Scenario | A (4.7) | E (4.6) | Δ |');
  lines.push('|----------|---------|---------|-----|');
  for (const s of result.scenarios) {
    const a = conditionMeanFromRuns(s.conditions['A']);
    const e = conditionMeanFromRuns(s.conditions['E']);
    lines.push(`| ${s.scenario} | ${a.toFixed(3)} | ${e.toFixed(3)} | ${(a - e >= 0 ? '+' : '') + (a - e).toFixed(3)} |`);
  }
  lines.push('');

  // Judge disagreement analysis
  lines.push('## Judge ensemble disagreement analysis');
  lines.push('');
  lines.push('| Judge | Mean score (all outputs) | Scores parsed / total |');
  lines.push('|-------|--------------------------|-----------------------|');
  for (const judgeName of result.judgesAvailable) {
    const all = allRuns.flatMap(r => r.ensemble?.judgeResults.filter(j => j.judge === judgeName) ?? []);
    const parsed = all.filter(r => r.score && r.score.parsed);
    const m = parsed.length ? mean(parsed.map(r => r.score!.overall)) : 0;
    lines.push(`| ${judgeName} | ${m.toFixed(3)} | ${parsed.length} / ${all.length} |`);
  }
  lines.push('');

  // Retry-triggered conditions
  const retryScenarios = result.scenarios.filter(s => s.retriedConditions.length > 0);
  if (retryScenarios.length > 0) {
    lines.push('## Variance-retry-triggered conditions');
    lines.push('');
    for (const s of retryScenarios) {
      lines.push(`- **${s.scenario}**: ${s.retriedConditions.join(', ')} (5-seed run due to max-min > ${VARIANCE_RETRY_THRESHOLD * 100}pp across first 3 seeds)`);
    }
    lines.push('');
  }

  lines.push('## Honest observations');
  lines.push('');
  lines.push('<!-- Fill in after reviewing the full grid. -->');
  lines.push('');
  lines.push('## What v5 does NOT tell us');
  lines.push('');
  lines.push('- Whether expansion scaffolds help Qwen thinking (not tested; G/H use compression only).');
  lines.push('- Whether the pattern generalizes to Llama or other open families (not tested).');
  lines.push('- Whether GEPA-evolved scaffolds would close remaining gaps (phase 3+ work).');
  lines.push('- Statistical significance beyond 3–5 seeds (would need dozens).');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Generated by `packages/agent/tests/eval/prompt-assembler-v5-eval.ts`.');
  lines.push('Full structured results: `tmp_bench_results-v5.json` (gitignored).');
  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  const runDate = new Date().toISOString();

  console.log('[setup] WAGGLE_EVAL_MODE=1 set for tier bypass.');
  console.log('[hydrate] Reading vault keys...');
  const keys = hydrateVault();
  const hydrated = Object.entries(keys).filter(([, v]) => v).map(([k]) => k);
  const missing = Object.entries(keys).filter(([, v]) => !v).map(([k]) => k);
  console.log(`[hydrate] loaded: ${hydrated.join(', ') || '(none)'}`);
  if (missing.length) console.log(`[hydrate] missing: ${missing.join(', ')}`);
  if (!keys.anthropic) throw new Error('Anthropic key is required (priming + A/D/E/F conditions).');
  if (!keys.openrouter) throw new Error('OpenRouter key is required (B/C/secondary Gemma/Qwen).');

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch { /* ignore */ }

  // ── Slug probe ──
  let slugProbe: SlugProbeResult[] = [];
  if (!SKIP_SLUG_PROBE) {
    console.log('\n[probe] Running pre-eval slug probe (11 slugs)...');
    slugProbe = await runSlugProbe();
  } else {
    console.log('\n[probe] SKIPPED (WAGGLE_EVAL_SKIP_SLUG_PROBE=1).');
  }

  // Determine which judges are available.
  const judges = buildJudgeWirings();
  if (!SKIP_SLUG_PROBE) {
    for (const j of judges) {
      const probed = slugProbe.find(p => p.slug === j.name);
      if (probed && !probed.ok) j.available = false;
    }
  }
  const judgesAvailable = judges.filter(j => j.available).map(j => j.name);
  console.log(`\n[judges] available: ${judgesAvailable.join(', ')} (${judgesAvailable.length}/4)`);

  if (judgesAvailable.length < MIN_JUDGES_REACHABLE) {
    throw new Error(
      `Only ${judgesAvailable.length} judges reachable; minimum ${MIN_JUDGES_REACHABLE} required. Halting.`,
    );
  }

  // ── Condition list ──
  const conditions: ConditionSpec[] = SKIP_SECONDARY
    ? PRIMARY_CONDITIONS
    : [...PRIMARY_CONDITIONS, ...SECONDARY_26B_CONDITIONS, ...SECONDARY_QWEN_CONDITIONS];

  console.log(`\n[plan] ${SCENARIOS_V5.length} scenarios × ${conditions.length} conditions × ${BASE_SEEDS} seeds (+5 on retry)`);
  console.log(`[plan] Output: ${RESULTS_JSON} + ${RESULTS_MD}`);

  const result: EvalResult = {
    runDate,
    commit,
    durationMs: 0,
    slugProbe,
    judgesAvailable,
    tierBypass: process.env.WAGGLE_EVAL_MODE === '1',
    seeds: BASE_SEEDS,
    scenarios: [],
  };

  for (const [idx, scenario] of SCENARIOS_V5.entries()) {
    console.log(`\n[${idx + 1}/${SCENARIOS_V5.length}] === ${scenario.name} (${scenario.language}, ${scenario.shape}) ===`);

    const setup = setupCleanScenario(scenario.name);
    const primingStart = Date.now();

    const primingDb = new MindDB(setup.dbPath);
    const primingOrch = new Orchestrator({
      db: primingDb,
      embedder: new StubEmbedder(),
      model: PRIMING_MODEL,
    });
    primingOrch.getIdentity().create({
      name: 'Marko',
      role: 'CEO',
      department: 'Egzakta Group',
      personality: 'Direct, pragmatic, sovereignty-focused',
      capabilities: 'Strategic decisions, technical oversight',
      system_prompt: '',
    });

    const effectiveTier = process.env.WAGGLE_EVAL_MODE === '1' ? 'bypassed (enterprise-equivalent)' : 'default (tier-enforced)';
    console.log(`  [priming] ${scenario.primingTurns.length} turns via ${PRIMING_MODEL} | tier: ${effectiveTier}`);

    try {
      await runPriming(primingOrch, scenario);
    } catch (err) {
      console.error(`  [priming] failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const verification = verifyMemory(primingDb, scenario);
    const primingFailed = verification.count < 2 || !Object.values(verification.matches).some(v => v);
    const primingPartial = !primingFailed && Object.values(verification.matches).some(v => !v);
    console.log(`  [priming] frames=${verification.count}, matches=${JSON.stringify(verification.matches)}, failed=${primingFailed}, partial=${primingPartial}`);

    primingDb.close();
    fs.copyFileSync(setup.dbPath, setup.snapshotPath);

    const scenarioResult: ScenarioResult = {
      scenario: scenario.name,
      shape: scenario.shape,
      language: scenario.language,
      primingFrameCount: verification.count,
      primingMatches: verification.matches,
      primingFailed,
      primingPartial,
      primingDurationMs: Date.now() - primingStart,
      effectiveTier,
      conditions: {},
      retriedConditions: [],
    };

    // ── Per-condition generation + ensemble judging ──
    for (const condition of conditions) {
      scenarioResult.conditions[condition.code] = [];

      // Initial 3 seeds.
      for (let seed = 0; seed < BASE_SEEDS; seed++) {
        process.stdout.write(`  [run] ${condition.code.padEnd(4)} seed=${seed}... `);
        const run = await runCondition(setup.snapshotPath, condition, scenario, setup.tempDir, seed);
        scenarioResult.conditions[condition.code].push(run);
        if (run.error) console.log(`ERROR: ${run.error.slice(0, 120)}`);
        else console.log(`OK (${run.durationMs}ms, ${run.output.length}ch)`);
      }
    }

    // ── Judge the non-gold runs (A is gold; skip judging) ──
    const aRuns = scenarioResult.conditions['A'] ?? [];
    for (const condition of conditions) {
      if (condition.code === 'A') {
        // Perfect gold reference.
        for (const run of scenarioResult.conditions['A']) {
          run.ensemble = {
            judgeResults: [],
            judgesAvailable: 0,
            mean: 1.0,
            min: 1.0,
            max: 1.0,
            disagreement: 0,
          };
        }
        continue;
      }
      const runs = scenarioResult.conditions[condition.code] ?? [];
      for (const run of runs) {
        if (run.error || !run.output) continue;
        const gold = aRuns.find(r => r.seed === run.seed) ?? aRuns[0];
        if (!gold || gold.error || !gold.output) continue;
        process.stdout.write(`  [judge] ${condition.code.padEnd(4)} seed=${run.seed} ensemble... `);
        run.ensemble = await judgeWithEnsemble(judges, scenario, gold.output, run.output);
        console.log(`μ=${run.ensemble.mean.toFixed(3)} Δ=${run.ensemble.disagreement.toFixed(3)} (${run.ensemble.judgesAvailable}/${judgesAvailable.length})`);
      }

      // ── Variance-triggered retry (§11.5) ──
      if (condition.code !== 'A' && runs.length >= BASE_SEEDS) {
        const disagree = perSeedDisagreement(runs);
        if (disagree > VARIANCE_RETRY_THRESHOLD) {
          console.log(`  [retry] ${condition.code} seed disagreement ${disagree.toFixed(3)} > ${VARIANCE_RETRY_THRESHOLD}; running ${RETRY_EXTRA_SEEDS} more seeds...`);
          scenarioResult.retriedConditions.push(condition.code);
          for (let seed = BASE_SEEDS; seed < BASE_SEEDS + RETRY_EXTRA_SEEDS; seed++) {
            process.stdout.write(`  [run] ${condition.code.padEnd(4)} seed=${seed}... `);
            const run = await runCondition(setup.snapshotPath, condition, scenario, setup.tempDir, seed);
            scenarioResult.conditions[condition.code].push(run);
            if (run.error) {
              console.log(`ERROR: ${run.error.slice(0, 120)}`);
              continue;
            }
            console.log(`OK (${run.durationMs}ms, ${run.output.length}ch)`);
            const gold = aRuns[0];
            if (gold && gold.output) {
              process.stdout.write(`  [judge] ${condition.code.padEnd(4)} seed=${seed} ensemble... `);
              run.ensemble = await judgeWithEnsemble(judges, scenario, gold.output, run.output);
              console.log(`μ=${run.ensemble.mean.toFixed(3)} Δ=${run.ensemble.disagreement.toFixed(3)}`);
            }
          }
        }
      }
    }

    result.scenarios.push(scenarioResult);
    fs.writeFileSync(RESULTS_JSON, JSON.stringify(result, null, 2));
    fs.rmSync(setup.tempDir, { recursive: true, force: true });
  }

  result.durationMs = Date.now() - startTime;
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(result, null, 2));
  fs.writeFileSync(RESULTS_MD, renderMarkdown(result));

  console.log(`\n[done] ${result.scenarios.length} scenarios in ${(result.durationMs / 1000 / 60).toFixed(1)} min.`);
  console.log(`[done] JSON: ${RESULTS_JSON}`);
  console.log(`[done] MD:   ${RESULTS_MD}`);
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
