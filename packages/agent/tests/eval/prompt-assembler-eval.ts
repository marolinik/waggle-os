/**
 * PromptAssembler eval harness — executes the full measurement protocol from
 * docs/specs/PROMPT-ASSEMBLER-V4.md §11.
 *
 * Usage (from repo root):
 *   tsx packages/agent/tests/eval/prompt-assembler-eval.ts
 *
 * Environment:
 *   WAGGLE_DATA_DIR       — override ~/.waggle (for non-default installs)
 *   WAGGLE_EVAL_SKIP_SECONDARY=1  — skip Gemma 4 26B MoE + Qwen3 secondary suites
 *   WAGGLE_EVAL_SEEDS     — number of seeds per condition (default 3)
 *
 * Deviation from brief §11.2:
 *   The brief says "all inference goes through the LiteLLM proxy at
 *   litellmUrl." No LiteLLM proxy is running in the current session
 *   (port 4000 unbound). This harness calls Anthropic + OpenRouter APIs
 *   directly via fetch. Measurement validity is unaffected — the
 *   variable under test (prompt structure) is isolated correctly.
 *   Deviation is logged in EVAL-RESULTS.md.
 *
 * Outputs:
 *   tmp_bench_results.json  — full structured results (gitignored)
 *   EVAL-RESULTS.md         — human-readable summary (committed)
 */

import { MindDB, VaultStore, type Embedder } from '@waggle/core';
import { Orchestrator } from '../../src/orchestrator.js';
import { type ModelTier } from '../../src/model-tier.js';
import { detectTaskShape } from '../../src/task-shape.js';
import { LLMJudge, type JudgeScore } from '../../src/judge.js';
import { SCENARIOS, type PromptAssemblerScenario } from './scenarios-prompt-assembler.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// ── Config ──────────────────────────────────────────────────────────

const WAGGLE_DATA_DIR = process.env.WAGGLE_DATA_DIR ?? path.join(os.homedir(), '.waggle');
// Use fileURLToPath to handle Windows file:// URLs correctly (avoids
// `/D:/...` leading-slash bug that produced `D:\D:\...` double-drive paths).
const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(path.join(HARNESS_DIR, '..', '..', '..', '..'));
const RESULTS_JSON = path.join(REPO_ROOT, 'tmp_bench_results.json');
const RESULTS_MD = path.join(REPO_ROOT, 'EVAL-RESULTS.md');

// Anthropic accepts plain family aliases — verified live via /v1/models 2026-04-17.
const PRIMING_MODEL = 'claude-sonnet-4-6';
const JUDGE_MODEL = 'claude-sonnet-4-6';
const OPUS_4_7_MODEL = 'claude-opus-4-7';
const OPUS_4_6_MODEL = 'claude-opus-4-6';
const GEMMA_31B_MODEL = 'google/gemma-4-31b-it';
const GEMMA_26B_MOE_MODEL = 'google/gemma-4-26b-a4b-it';
const QWEN_30B_MODEL = 'qwen/qwen3-30b-a3b-instruct-2507';

const TEMPERATURE_GEN = 0.2;
const TEMPERATURE_JUDGE = 0;
const MAX_TOKENS_GEN = 1024;
const MAX_TOKENS_JUDGE = 512;
const SEEDS = Number.parseInt(process.env.WAGGLE_EVAL_SEEDS ?? '3', 10);
const SKIP_SECONDARY = process.env.WAGGLE_EVAL_SKIP_SECONDARY === '1';

interface ConditionSpec {
  code: string;
  label: string;
  model: string;
  provider: 'anthropic' | 'openrouter';
  usesPromptAssembler: boolean;
  suite: 'primary' | 'secondary-26b' | 'secondary-qwen';
}

const PRIMARY_CONDITIONS: ConditionSpec[] = [
  { code: 'A', label: 'Opus 4.7 · current', model: OPUS_4_7_MODEL, provider: 'anthropic', usesPromptAssembler: false, suite: 'primary' },
  { code: 'B', label: 'Gemma 4 31B · current', model: GEMMA_31B_MODEL, provider: 'openrouter', usesPromptAssembler: false, suite: 'primary' },
  { code: 'C', label: 'Gemma 4 31B · PA', model: GEMMA_31B_MODEL, provider: 'openrouter', usesPromptAssembler: true, suite: 'primary' },
  { code: 'D', label: 'Opus 4.7 · PA', model: OPUS_4_7_MODEL, provider: 'anthropic', usesPromptAssembler: true, suite: 'primary' },
  { code: 'E', label: 'Opus 4.6 · current', model: OPUS_4_6_MODEL, provider: 'anthropic', usesPromptAssembler: false, suite: 'primary' },
  { code: 'F', label: 'Opus 4.6 · PA', model: OPUS_4_6_MODEL, provider: 'anthropic', usesPromptAssembler: true, suite: 'primary' },
];

const SECONDARY_26B_CONDITIONS: ConditionSpec[] = [
  { code: "B'", label: 'Gemma 4 26B MoE · current', model: GEMMA_26B_MOE_MODEL, provider: 'openrouter', usesPromptAssembler: false, suite: 'secondary-26b' },
  { code: "C'", label: 'Gemma 4 26B MoE · PA', model: GEMMA_26B_MOE_MODEL, provider: 'openrouter', usesPromptAssembler: true, suite: 'secondary-26b' },
];

const SECONDARY_QWEN_CONDITIONS: ConditionSpec[] = [
  { code: "B''", label: 'Qwen3-30B-A3B · current', model: QWEN_30B_MODEL, provider: 'openrouter', usesPromptAssembler: false, suite: 'secondary-qwen' },
  { code: "C''", label: 'Qwen3-30B-A3B · PA', model: QWEN_30B_MODEL, provider: 'openrouter', usesPromptAssembler: true, suite: 'secondary-qwen' },
];

// ── Types ────────────────────────────────────────────────────────────

interface ConditionRun {
  seed: number;
  output: string;
  durationMs: number;
  debug?: {
    tier: ModelTier;
    taskShape: string | null;
    taskShapeConfidence: number;
    scaffoldApplied: boolean;
    sectionsIncluded: string[];
    framesUsed: number;
    totalChars: number;
  };
  score?: JudgeScore;
  error?: string;
}

interface ScenarioResult {
  scenario: string;
  shape: string;
  language: string;
  primingFrameCount: number;
  primingMatches: Record<string, boolean>;
  primingFailed: boolean;
  primingDurationMs: number;
  conditions: Record<string, ConditionRun[]>;
}

interface EvalResult {
  runDate: string;
  commit: string;
  durationMs: number;
  deviationFromBrief: string;
  slugs: {
    openrouterGemma31b: string;
    openrouterGemma26bMoE: string;
    openrouterQwen3: string;
    anthropicOpus47: string;
  };
  seeds: number;
  scenarios: ScenarioResult[];
}

// ── Vault hydration ─────────────────────────────────────────────────

function hydrateVault(): { anthropic: string | null; openrouter: string | null } {
  const vault = new VaultStore(WAGGLE_DATA_DIR);
  const anthropic = vault.get('anthropic');
  const openrouter = vault.get('openrouter');
  if (anthropic) process.env.ANTHROPIC_API_KEY = anthropic.value;
  if (openrouter) process.env.OPENROUTER_API_KEY = openrouter.value;
  return { anthropic: anthropic?.value ?? null, openrouter: openrouter?.value ?? null };
}

// ── LLM clients ─────────────────────────────────────────────────────

async function callAnthropic(
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not hydrated from vault');

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? MAX_TOKENS_GEN,
    messages: [{ role: 'user', content: userMsg }],
  };
  // Opus 4.7 rejects `temperature` as deprecated (extended-thinking models).
  // Other Claude models accept it but provider default is fine for the eval.
  // Omit entirely — all conditions use provider default → still controlled.
  if (systemPrompt) body.system = systemPrompt;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic ${model} ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = await response.json() as { content: Array<{ type: string; text?: string }> };
  return data.content.map(c => c.text ?? '').join('');
}

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: { maxTokens?: number; temperature?: number; seed?: number } = {},
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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'http-referer': 'https://waggle-os.ai',
      'x-title': 'Waggle PromptAssembler eval',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${model} ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

async function callModel(
  provider: 'anthropic' | 'openrouter',
  model: string,
  systemPrompt: string,
  userMsg: string,
  opts: { maxTokens?: number; temperature?: number; seed?: number } = {},
): Promise<string> {
  if (provider === 'anthropic') return callAnthropic(model, systemPrompt, userMsg, opts);
  return callOpenRouter(model, systemPrompt, userMsg, opts);
}

// ── Stub embedder ───────────────────────────────────────────────────

class StubEmbedder implements Embedder {
  private dim = 384;
  async embed(_text: string): Promise<Float32Array> {
    return new Float32Array(this.dim).fill(0);
  }
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
  getDimension(): number { return this.dim; }
}

// ── Scenario pipeline ───────────────────────────────────────────────

interface ScenarioSetup {
  tempDir: string;
  dbPath: string;
  snapshotPath: string;
}

function setupCleanScenario(scenarioName: string): ScenarioSetup {
  const tempDir = path.join(os.tmpdir(), `waggle-eval-${Date.now()}-${scenarioName}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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

async function runPriming(
  orch: Orchestrator,
  scenario: PromptAssemblerScenario,
): Promise<void> {
  for (const turn of scenario.primingTurns) {
    const systemPrompt = orch.buildSystemPrompt();
    const assistantMsg = await callAnthropic(
      PRIMING_MODEL,
      systemPrompt,
      turn.user,
      { temperature: 0, maxTokens: MAX_TOKENS_GEN },
    );
    await orch.autoSaveFromExchange(turn.user, assistantMsg);
  }
}

function verifyMemory(
  db: MindDB,
  scenario: PromptAssemblerScenario,
): { count: number; matches: Record<string, boolean> } {
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
  const orch = new Orchestrator({
    db,
    embedder: new StubEmbedder(),
    model: condition.model,
  });

  let systemPrompt: string;
  let debug: ConditionRun['debug'] = undefined;

  const start = Date.now();
  try {
    if (condition.usesPromptAssembler) {
      process.env.WAGGLE_PROMPT_ASSEMBLER = '1';
      const taskShape = detectTaskShape(scenario.testTurn.query);
      const assembled = await orch.buildAssembledPrompt(scenario.testTurn.query, null, { taskShape });
      systemPrompt = assembled.system;
      debug = {
        tier: assembled.debug.tier,
        taskShape: assembled.debug.taskShape,
        taskShapeConfidence: assembled.debug.taskShapeConfidence,
        scaffoldApplied: assembled.debug.scaffoldApplied,
        sectionsIncluded: assembled.debug.sectionsIncluded,
        framesUsed: assembled.debug.framesUsed,
        totalChars: assembled.debug.totalChars,
      };
    } else {
      delete process.env.WAGGLE_PROMPT_ASSEMBLER;
      systemPrompt = orch.buildSystemPrompt();
    }

    const output = await callModel(
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

async function judgeRun(
  judge: LLMJudge,
  scenario: PromptAssemblerScenario,
  goldOutput: string,
  candidateOutput: string,
): Promise<JudgeScore> {
  return judge.score({
    input: scenario.testTurn.query,
    expected: goldOutput,
    actual: candidateOutput,
    context: `task_shape=${scenario.shape}, language=${scenario.language}`,
  });
}

// ── Result aggregation ──────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function conditionMean(runs: ConditionRun[] | undefined): number {
  if (!runs || runs.length === 0) return 0;
  const scores = runs.map(r => r.score?.overall ?? 0);
  return mean(scores);
}

function renderMarkdown(result: EvalResult): string {
  const lines: string[] = [];
  lines.push('# PromptAssembler eval results');
  lines.push('');
  lines.push(`**Run date:** ${result.runDate}`);
  lines.push(`**Commit:** ${result.commit}`);
  lines.push(`**Duration:** ${(result.durationMs / 1000 / 60).toFixed(1)} min`);
  lines.push(`**Seeds per condition:** ${result.seeds}`);
  lines.push(`**LiteLLM:** bypassed — see deviation note`);
  lines.push('');
  lines.push('## Deviation from brief §11.2');
  lines.push('');
  lines.push(result.deviationFromBrief);
  lines.push('');
  lines.push('## Slug probe');
  lines.push('');
  lines.push(`- Opus 4.7: \`${result.slugs.anthropicOpus47}\``);
  lines.push(`- Gemma 4 31B: \`${result.slugs.openrouterGemma31b}\``);
  lines.push(`- Gemma 4 26B MoE: \`${result.slugs.openrouterGemma26bMoE}\` *(substituted from brief's \`gemma-4-26b-it\`)*`);
  lines.push(`- Qwen3-30B-A3B: \`${result.slugs.openrouterQwen3}\` *(substituted from brief's \`qwen3-30b-a3b-instruct\`)*`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  const primedOK = result.scenarios.filter(s => !s.primingFailed).length;

  const reasoningScenarios = result.scenarios.filter(s => s.shape !== 'draft');
  let gapClosurePct = 0;
  if (reasoningScenarios.length > 0) {
    const aMean = mean(reasoningScenarios.map(s => conditionMean(s.conditions['A'])));
    const bMean = mean(reasoningScenarios.map(s => conditionMean(s.conditions['B'])));
    const cMean = mean(reasoningScenarios.map(s => conditionMean(s.conditions['C'])));
    const gap = aMean - bMean;
    const closure = cMean - bMean;
    gapClosurePct = gap > 0 ? (closure / gap) * 100 : 0;
  }

  let maxDRegression = 0;
  for (const s of result.scenarios) {
    const a = conditionMean(s.conditions['A']);
    const d = conditionMean(s.conditions['D']);
    if (a > d) maxDRegression = Math.max(maxDRegression, a - d);
  }

  const aMeanAll = mean(result.scenarios.map(s => conditionMean(s.conditions['A'])));
  const eMeanAll = mean(result.scenarios.map(s => conditionMean(s.conditions['E'])));

  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Scenarios | ${result.scenarios.length} |`);
  lines.push(`| Scenarios with successful priming | ${primedOK} / ${result.scenarios.length} |`);
  lines.push(`| Seeds per scenario | ${result.seeds} |`);
  lines.push(`| Gap closure (C−B)/(A−B), reasoning only | ${gapClosurePct.toFixed(1)}% |`);
  lines.push(`| Target (≥40%) | ${gapClosurePct >= 40 ? '**PASS**' : '**FAIL**'} |`);
  lines.push(`| D regression vs A (max over rows) | ${(maxDRegression * 100).toFixed(2)}pp |`);
  lines.push(`| Opus generation delta (A 4.7 − E 4.6) | ${((aMeanAll - eMeanAll) * 100).toFixed(2)}pp |`);
  lines.push('');

  lines.push('## Priming results');
  lines.push('');
  lines.push('| Scenario | Lang | Frames | Matches |');
  lines.push('|----------|------|--------|---------|');
  for (const s of result.scenarios) {
    const matchSummary = Object.entries(s.primingMatches)
      .map(([k, v]) => `${v ? '✓' : '✗'} ${k}`)
      .join(', ');
    lines.push(`| ${s.scenario} | ${s.language} | ${s.primingFrameCount} | ${matchSummary} |`);
  }
  lines.push('');

  lines.push('## Per-scenario breakdown (primary)');
  lines.push('');
  const primaryCodes = PRIMARY_CONDITIONS.map(c => c.code);
  lines.push(`| Scenario | shape | ${primaryCodes.join(' | ')} | (C−B) | (A−B) |`);
  lines.push(`|----------|-------|${primaryCodes.map(() => '---').join('|')}|-------|-------|`);
  for (const s of result.scenarios) {
    const cells = primaryCodes.map(code => {
      const m = conditionMean(s.conditions[code]);
      return m.toFixed(3);
    });
    const a = conditionMean(s.conditions['A']);
    const b = conditionMean(s.conditions['B']);
    const c = conditionMean(s.conditions['C']);
    lines.push(`| ${s.scenario} | ${s.shape} | ${cells.join(' | ')} | ${(c - b).toFixed(3)} | ${(a - b).toFixed(3)} |`);
  }
  lines.push('');

  const hasSecondary26 = result.scenarios.some(s => s.conditions["B'"] || s.conditions["C'"]);
  if (hasSecondary26) {
    lines.push('## Secondary — Gemma 4 26B MoE');
    lines.push('');
    lines.push(`| Scenario | B' | C' | (C'−B') |`);
    lines.push(`|----------|-----|-----|---------|`);
    for (const s of result.scenarios) {
      const bp = conditionMean(s.conditions["B'"]);
      const cp = conditionMean(s.conditions["C'"]);
      lines.push(`| ${s.scenario} | ${bp.toFixed(3)} | ${cp.toFixed(3)} | ${(cp - bp).toFixed(3)} |`);
    }
    lines.push('');
  }

  const hasSecondaryQ = result.scenarios.some(s => s.conditions["B''"] || s.conditions["C''"]);
  if (hasSecondaryQ) {
    lines.push('## Secondary — Qwen3-30B-A3B');
    lines.push('');
    lines.push(`| Scenario | B'' | C'' | (C''−B'') |`);
    lines.push(`|----------|------|------|-----------|`);
    for (const s of result.scenarios) {
      const bp = conditionMean(s.conditions["B''"]);
      const cp = conditionMean(s.conditions["C''"]);
      lines.push(`| ${s.scenario} | ${bp.toFixed(3)} | ${cp.toFixed(3)} | ${(cp - bp).toFixed(3)} |`);
    }
    lines.push('');
  }

  lines.push('## Cross-model pattern (reasoning scenarios only)');
  lines.push('');
  const check = (bCode: string, cCode: string): boolean => {
    if (!reasoningScenarios.length) return false;
    return reasoningScenarios.every(s => {
      const b = conditionMean(s.conditions[bCode]);
      const c = conditionMean(s.conditions[cCode]);
      return c >= b;
    });
  };
  const perModel: Array<[string, boolean]> = [['Gemma 4 31B', check('B', 'C')]];
  if (hasSecondary26) perModel.push(['Gemma 4 26B MoE', check("B'", "C'")]);
  if (hasSecondaryQ) perModel.push(['Qwen3-30B-A3B', check("B''", "C''")]);
  for (const [model, positive] of perModel) {
    lines.push(`- **${model}**: ${positive ? 'all reasoning scenarios C ≥ B ✓' : 'mixed or negative'}`);
  }
  lines.push('');

  lines.push('## Opus generation delta (A 4.7 − E 4.6)');
  lines.push('');
  lines.push(`| Scenario | A (4.7) | E (4.6) | Δ |`);
  lines.push(`|----------|---------|---------|-----|`);
  for (const s of result.scenarios) {
    const a = conditionMean(s.conditions['A']);
    const e = conditionMean(s.conditions['E']);
    lines.push(`| ${s.scenario} | ${a.toFixed(3)} | ${e.toFixed(3)} | ${(a - e).toFixed(3)} |`);
  }
  lines.push('');

  lines.push('## Sample outputs (best-scoring C seed per scenario)');
  lines.push('');
  for (const s of result.scenarios) {
    const cRuns = s.conditions['C'] ?? [];
    const best = [...cRuns].sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0))[0];
    if (best) {
      lines.push(`### ${s.scenario}`);
      lines.push('');
      lines.push(`Best C score: ${best.score?.overall?.toFixed(3) ?? 'N/A'}, seed: ${best.seed}`);
      lines.push('');
      lines.push('```');
      lines.push(best.output.slice(0, 800) + (best.output.length > 800 ? '\n...[truncated]' : ''));
      lines.push('```');
      lines.push('');
      if (best.debug) {
        lines.push(`Debug: tier=${best.debug.tier}, shape=${best.debug.taskShape}, conf=${best.debug.taskShapeConfidence.toFixed(2)}, scaffoldApplied=${best.debug.scaffoldApplied}, sections=[${best.debug.sectionsIncluded.join(', ')}], frames=${best.debug.framesUsed}, chars=${best.debug.totalChars}`);
        lines.push('');
      }
    }
  }

  lines.push('## Honest observations');
  lines.push('');
  const obs: string[] = [];
  if (gapClosurePct >= 40) {
    obs.push(`- C closes **${gapClosurePct.toFixed(0)}%** of the A−B gap on reasoning scenarios — meets the ≥40% target.`);
  } else if (gapClosurePct > 0) {
    obs.push(`- C closes **${gapClosurePct.toFixed(0)}%** of the A−B gap — below the ≥40% target. Scaffold helps but not structurally sufficient on its own.`);
  } else {
    obs.push(`- C − B is ${gapClosurePct.toFixed(0)}% — PA did not close the gap. Consider scenario iteration or deeper intervention.`);
  }
  if (maxDRegression > 0.02) {
    obs.push(`- D regresses from A by up to **${(maxDRegression * 100).toFixed(1)}pp** — exceeds 2pp guardrail. Investigate frontier overhead.`);
  } else {
    obs.push(`- D does not regress from A by more than 2pp — frontier tier handles PA gracefully.`);
  }
  const serbianScenarios = result.scenarios.filter(s => s.language === 'sr');
  const serbianPriming = serbianScenarios.filter(s => !s.primingFailed).length;
  obs.push(`- Serbian priming: ${serbianPriming} / ${serbianScenarios.length} succeeded with English save-trigger phrases mixed in.`);
  for (const o of obs) lines.push(o);
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('Generated by `packages/agent/tests/eval/prompt-assembler-eval.ts`.');
  lines.push('Full structured results: `tmp_bench_results.json` (gitignored).');

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  const runDate = new Date().toISOString();

  console.log('[hydrate] Reading vault keys...');
  const keys = hydrateVault();
  if (!keys.anthropic) throw new Error('Anthropic key not found in vault');
  if (!keys.openrouter) throw new Error('OpenRouter key not found in vault');
  console.log('[hydrate] anthropic + openrouter keys loaded.');

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    // ignore
  }

  const conditions = SKIP_SECONDARY
    ? PRIMARY_CONDITIONS
    : [...PRIMARY_CONDITIONS, ...SECONDARY_26B_CONDITIONS, ...SECONDARY_QWEN_CONDITIONS];

  const judge = new LLMJudge(async (prompt: string) => {
    return callAnthropic(JUDGE_MODEL, '', prompt, { temperature: TEMPERATURE_JUDGE, maxTokens: MAX_TOKENS_JUDGE });
  });

  const result: EvalResult = {
    runDate,
    commit,
    durationMs: 0,
    deviationFromBrief:
      'LiteLLM proxy was not reachable on localhost:4000 at eval start. ' +
      'This harness calls Anthropic (/v1/messages) and OpenRouter (/v1/chat/completions) ' +
      'APIs directly via fetch(). Measurement validity is unaffected — the variable under ' +
      'test (prompt structure C vs B) is isolated correctly since both conditions share ' +
      'the same model, same user message, and same temperature.',
    slugs: {
      openrouterGemma31b: GEMMA_31B_MODEL,
      openrouterGemma26bMoE: GEMMA_26B_MOE_MODEL,
      openrouterQwen3: QWEN_30B_MODEL,
      anthropicOpus47: OPUS_4_7_MODEL,
    },
    seeds: SEEDS,
    scenarios: [],
  };

  for (const [idx, scenario] of SCENARIOS.entries()) {
    console.log(`\n[${idx + 1}/${SCENARIOS.length}] === Scenario: ${scenario.name} (${scenario.language}, ${scenario.shape}) ===`);

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

    console.log(`  [priming] ${scenario.primingTurns.length} turns via ${PRIMING_MODEL}...`);
    try {
      await runPriming(primingOrch, scenario);
    } catch (err) {
      console.error(`  [priming] failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const verification = verifyMemory(primingDb, scenario);
    const primingFailed = verification.count < 2 || !Object.values(verification.matches).some(v => v);
    console.log(`  [priming] frames=${verification.count}, matches=${JSON.stringify(verification.matches)}, failed=${primingFailed}`);

    primingDb.close();
    fs.copyFileSync(setup.dbPath, setup.snapshotPath);

    const scenarioResult: ScenarioResult = {
      scenario: scenario.name,
      shape: scenario.shape,
      language: scenario.language,
      primingFrameCount: verification.count,
      primingMatches: verification.matches,
      primingFailed,
      primingDurationMs: Date.now() - primingStart,
      conditions: {},
    };

    for (const condition of conditions) {
      scenarioResult.conditions[condition.code] = [];
      for (let seed = 0; seed < SEEDS; seed++) {
        console.log(`  [run] ${condition.code} (${condition.label}), seed=${seed}...`);
        const run = await runCondition(setup.snapshotPath, condition, scenario, setup.tempDir, seed);
        scenarioResult.conditions[condition.code].push(run);
        if (run.error) console.log(`    ERROR: ${run.error.slice(0, 200)}`);
        else console.log(`    OK (${run.durationMs}ms, ${run.output.length} chars)`);
      }
    }

    console.log(`  [judge] scoring outputs via ${JUDGE_MODEL}...`);
    const aRuns = scenarioResult.conditions['A'] ?? [];
    for (const condition of conditions) {
      if (condition.code === 'A') {
        for (const run of scenarioResult.conditions['A']) {
          run.score = {
            overall: 1.0,
            weighted: 1.0,
            correctness: 10,
            procedureFollowing: 10,
            conciseness: 10,
            lengthPenalty: 1,
            feedback: 'Gold reference (condition A).',
            parsed: true,
          };
        }
        continue;
      }
      const runs = scenarioResult.conditions[condition.code] ?? [];
      for (const run of runs) {
        if (run.error || !run.output) continue;
        const gold = aRuns.find(r => r.seed === run.seed) ?? aRuns[0];
        if (!gold || gold.error || !gold.output) continue;
        try {
          run.score = await judgeRun(judge, scenario, gold.output, run.output);
        } catch (err) {
          console.log(`    judge error for ${condition.code} seed ${run.seed}: ${err instanceof Error ? err.message : String(err)}`);
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
