#!/usr/bin/env tsx
/**
 * Agentic Knowledge Work Pilot — N=3 direction validator
 *
 * Pilot ID:           agentic-knowledge-work-pilot-2026-04-26
 * Manifest anchor:    pilot-2026-04-26-v1
 * Cost ceiling:       $7.00 hard / $6.00 halt (per amendment §6)
 * Per-cell halt:      $0.50 (Cells B/D)
 * Wall budget:        7-10h (per amendment §6)
 *
 * Authority:
 *   - cc1-brief.md (predecessor, audit-immutable)
 *   - cc1-brief-amendment-2026-04-26.md (binding execution doc)
 *   - judge-rubric.md (Likert 1-5 × 6 dimensions × trio ensemble)
 *
 * §11 frozen path compliance: this script is a NEW wrapper at scripts/.
 * It does NOT touch any §11 frozen path. It uses @waggle/core (in-tree
 * memory substrate) and direct HTTP to LiteLLM. No imports from
 * benchmarks/harness/src/* (LoCoMo wrapper untouched).
 *
 * Usage:
 *   npx tsx scripts/run-pilot-2026-04-26.ts --smoke                      # Task 1 only, all 4 cells
 *   npx tsx scripts/run-pilot-2026-04-26.ts --task task-2 --all-cells    # Single task, all cells
 *   npx tsx scripts/run-pilot-2026-04-26.ts --task task-3 --cell B       # Single task + single cell
 *   npx tsx scripts/run-pilot-2026-04-26.ts --all-tasks --all-cells      # Full pilot (12 cells)
 *   npx tsx scripts/run-pilot-2026-04-26.ts --dry-run --smoke            # No API calls; sanity-check parsing
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  MindDB,
  FrameStore,
  SessionStore,
  HybridSearch,
  createOllamaEmbedder,
  type Embedder,
} from '@waggle/core';

// Phase 2.2 — pilot wrapper now consumes the unified agent loop from
// @waggle/agent (Phase 2.1 commit a599a07). Local re-implementations of
// runCellSolo / runCellMultiStep / parseAgentAction are removed; this
// wrapper provides only the LlmCallFn + RetrievalSearchFn adapters, plus
// the pilot-specific orchestration (task loading, cell loop, judge ensemble,
// cost accounting, JSONL output, audit chain).
import {
  runSoloAgent,
  runRetrievalAgentLoop,
  type LlmCallFn,
  type LlmCallInput,
  type LlmCallResult as AgentLlmCallResult,
  type RetrievalSearchFn,
  type AgentRunResult,
} from '@waggle/agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const PILOT_ID = 'agentic-knowledge-work-pilot-2026-04-26';
const MANIFEST_ANCHOR = 'pilot-2026-04-26-v1';
const BRIEF_DIR = 'D:/Projects/PM-Waggle-OS/briefs/2026-04-26-agentic-knowledge-work-pilot';
const CC1_BRIEF_PATH = path.join(BRIEF_DIR, 'cc1-brief.md');
const AMENDMENT_PATH = path.join(BRIEF_DIR, 'cc1-brief-amendment-2026-04-26.md');
const JUDGE_RUBRIC_PATH = path.join(BRIEF_DIR, 'judge-rubric.md');

const OUT_DIR = path.join(REPO_ROOT, 'benchmarks', 'results', 'pilot-2026-04-26');
const PROMPTS_ARCHIVE_DIR = path.join(OUT_DIR, 'prompts-archive');
const RUN_LOG_PATH = path.join(OUT_DIR, 'pilot-run.log');
const SCRATCH_DIR = path.join(REPO_ROOT, 'tmp', 'pilot-2026-04-26');

const LITELLM_URL = 'http://localhost:4000';
const OLLAMA_URL = 'http://localhost:11434';
const EMBEDDER_MODEL = 'nomic-embed-text';

// Amendment v2 §4 (PM-revised cost ceiling — methodology priority over budget tightness):
const COST_CAP_USD = 20.0;
const COST_HALT_USD = 17.0;
const PER_CELL_HARD_HALT_USD = 1.0;
const PER_CALL_SANITY_USD = 0.4;  // hard halt + ping (was $0.50 sanity ping in v1)

const MAX_STEPS = 5;
const MAX_RETRIEVALS_PER_STEP = 8;
const MAX_JUDGE_RETRIES = 3;

const TASK_FILES: Record<string, string> = {
  'task-1': path.join(BRIEF_DIR, 'task-1-strategic-synthesis.md'),
  'task-2': path.join(BRIEF_DIR, 'task-2-cross-thread-coordination.md'),
  'task-3': path.join(BRIEF_DIR, 'task-3-decision-support.md'),
};

// Default Qwen config — overridable via --qwen-alias / --qwen-max-tokens / --qwen-thinking.
// Amendment v2 §2 binding: alias=qwen3.6-35b-a3b-via-dashscope-direct, thinking=on, max_tokens=16000.
const DEFAULT_QWEN_ALIAS = 'qwen3.6-35b-a3b-via-dashscope-direct';
const DEFAULT_QWEN_MAX_TOKENS = 16000;
const DEFAULT_QWEN_THINKING_ON = true;

function buildCells(qwenAlias: string) {
  return {
    A: { model: 'claude-opus-4-7', mode: 'solo' as const, label: 'Opus solo' },
    B: { model: 'claude-opus-4-7', mode: 'multistep' as const, label: 'Opus + memory + harness' },
    C: { model: qwenAlias, mode: 'solo' as const, label: 'Qwen solo' },
    D: { model: qwenAlias, mode: 'multistep' as const, label: 'Qwen + memory + harness' },
  };
}
const CELLS = buildCells(DEFAULT_QWEN_ALIAS);

// Module-level mutable Qwen opts — set from CLI args in main(); applied by
// the LlmCallFn adapter when the model alias matches Qwen. Subject calls go
// through the agent loop; judge calls go through llmCall directly with their
// own opts (max_tokens=3000, thinking=false per amendment v2).
const RUNTIME_QWEN_OPTS = {
  maxTokens: DEFAULT_QWEN_MAX_TOKENS,
  thinking: DEFAULT_QWEN_THINKING_ON,
};

const JUDGES = ['claude-opus-4-7', 'gpt-5.4', 'minimax-m27-via-openrouter'] as const;

const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7':                     { in: 15.0,   out: 75.0 },
  'qwen3.6-35b-a3b-via-openrouter':      { in: 0.6,    out: 2.4 },
  'gpt-5.4':                             { in: 2.5,    out: 10.0 },
  'minimax-m27-via-openrouter':          { in: 0.7,    out: 2.8 },
};

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface TaskMaterials {
  taskId: string;
  rawText: string;
  persona: string;
  question: string;
  materialsConcat: string;
  materialFrames: { title: string; body: string }[];
}

interface CellResult {
  taskId: string;
  cellId: 'A' | 'B' | 'C' | 'D';
  model: string;
  configuration: 'solo' | 'memory-harness';
  candidateResponse: string;
  candidateLatencyMs: number;
  candidateTokensIn: number;
  candidateTokensOut: number;
  candidateCostUsd: number;
  loopExhausted: boolean;
  stepsTaken: number;
  retrievalCalls: number;
  errors: string[];
}

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

interface CellJsonlRecord {
  task_id: string;
  cell_id: 'A' | 'B' | 'C' | 'D';
  model: string;
  configuration: 'solo' | 'memory-harness';
  candidate_response: string;
  candidate_latency_ms: number;
  candidate_tokens_in: number;
  candidate_tokens_out: number;
  candidate_cost_usd: number;
  loop_exhausted: boolean;
  steps_taken: number;
  retrieval_calls: number;
  judge_opus: JudgeVerdict;
  judge_gpt: JudgeVerdict;
  judge_minimax: JudgeVerdict;
  trio_mean: number;
  trio_strict_pass: boolean;
  trio_critical_fail: boolean;
  manifest_anchor: string;
  head_sha: string;
  ts_iso: string;
  cell_cost_usd: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────

function logLine(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(RUN_LOG_PATH, line); } catch { /* dir not yet created */ }
  process.stderr.write(line);
}

// ─────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────

interface Args {
  smoke: boolean;
  allTasks: boolean;
  allCells: boolean;
  task?: string;
  cell?: 'A' | 'B' | 'C' | 'D';
  dryRun: boolean;
  help: boolean;
  // Amendment v2 §7 flags
  qwenAlias: string;
  qwenMaxTokens: number;
  qwenThinking: boolean;
  retryCellAMinimax: boolean;
  restartCells?: string;  // e.g. "task-1-C,task-1-D"
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    smoke: false, allTasks: false, allCells: false, dryRun: false, help: false,
    qwenAlias: DEFAULT_QWEN_ALIAS,
    qwenMaxTokens: DEFAULT_QWEN_MAX_TOKENS,
    qwenThinking: DEFAULT_QWEN_THINKING_ON,
    retryCellAMinimax: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--smoke': out.smoke = true; break;
      case '--all-tasks': out.allTasks = true; break;
      case '--all-cells': out.allCells = true; break;
      case '--task': out.task = next; i++; break;
      case '--cell': out.cell = next as Args['cell']; i++; break;
      case '--dry-run': out.dryRun = true; break;
      case '--qwen-alias': out.qwenAlias = next; i++; break;
      case '--qwen-max-tokens': out.qwenMaxTokens = Number(next); i++; break;
      case '--qwen-thinking': out.qwenThinking = (next ?? '').toLowerCase() !== 'off'; i++; break;
      case '--retry-cell-a-minimax': out.retryCellAMinimax = true; break;
      case '--restart-cells': out.restartCells = next; i++; break;
      case '--help': case '-h': out.help = true; break;
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`
Agentic Knowledge Work Pilot — N=3 direction validator

Flags:
  --smoke              Run Task 1 only, all 4 cells (A/B/C/D). HALT after.
  --all-tasks          Run tasks 1, 2, 3
  --all-cells          Run cells A, B, C, D for the selected task(s)
  --task <id>          Run a specific task (task-1, task-2, task-3)
  --cell <id>          Run a specific cell (A, B, C, D)
  --dry-run            Skip API calls; verify parsing + scaffolding only

Amendment v2 §7 flags:
  --qwen-alias <a>     Override Qwen alias (default: ${DEFAULT_QWEN_ALIAS})
  --qwen-max-tokens N  Override Qwen max_tokens (default: ${DEFAULT_QWEN_MAX_TOKENS})
  --qwen-thinking on|off  Explicit Qwen thinking flag (default: on)
  --retry-cell-a-minimax  Surgical MiniMax retry against existing Cell A response
  --restart-cells <list>  Comma list e.g. "task-1-C,task-1-D" — invalidate + re-run

  -h, --help           This text
`);
}

// ─────────────────────────────────────────────────────────────────────────
// Pre-flight + audit-trail SHAs
// ─────────────────────────────────────────────────────────────────────────

function sha256File(filepath: string): string {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function gitHead(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return 'UNKNOWN';
  }
}

function preflight(): { headSha: string; amendmentSha: string; briefSha: string; rubricSha: string } {
  return {
    headSha: gitHead(),
    amendmentSha: sha256File(AMENDMENT_PATH),
    briefSha: sha256File(CC1_BRIEF_PATH),
    rubricSha: sha256File(JUDGE_RUBRIC_PATH),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Task materials loader
// ─────────────────────────────────────────────────────────────────────────

function loadTaskMaterials(taskId: string): TaskMaterials {
  const filepath = TASK_FILES[taskId];
  if (!filepath) throw new Error(`unknown task: ${taskId}`);
  const raw = fs.readFileSync(filepath, 'utf-8');
  const endIdx = raw.indexOf('## End of materials');
  if (endIdx < 0) throw new Error(`task ${taskId}: no '## End of materials' delimiter`);
  const stripped = raw.slice(0, endIdx).trimEnd();

  const personaMatch = stripped.match(/\*\*Persona:\*\*\s*([\s\S]*?)\n\n\*\*Scenario:\*\*/);
  const scenarioMatch = stripped.match(/\*\*Scenario:\*\*\s*([\s\S]*?)\n\n\*\*Question to answer:\*\*/);
  const questionMatch = stripped.match(/\*\*Question to answer:\*\*\s*\n>?\s*([\s\S]*?)(?:\n\n|\n\*\*Materials)/);

  const persona = personaMatch ? personaMatch[1].trim() : '';
  const scenario = scenarioMatch ? scenarioMatch[1].trim() : '';
  const question = questionMatch ? questionMatch[1].replace(/^"|"$/g, '').trim() : '';

  const sectionRegex = /^##\s+(DOC|THREAD|MEMO)\s+(\d+)\s*[—-]?\s*(.*?)$/gm;
  const materialFrames: { title: string; body: string }[] = [];
  const matches = [...stripped.matchAll(sectionRegex)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const title = `${m[1]} ${m[2]}${m[3] ? ' — ' + m[3] : ''}`;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? stripped.length) : stripped.length;
    const body = stripped.slice(start, end).trim();
    materialFrames.push({ title, body });
  }

  const materialsConcat = materialFrames.map(f => `## ${f.title}\n\n${f.body}`).join('\n\n---\n\n');

  return {
    taskId,
    rawText: stripped,
    persona: `Persona: ${persona}\n\nScenario: ${scenario}`,
    question,
    materialsConcat,
    materialFrames,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// LiteLLM HTTP client with cost tracking
// ─────────────────────────────────────────────────────────────────────────

// LlmCallFn adapter — Phase 2.2 refactor. Conforms to @waggle/agent's
// LlmCallFn signature so the agent loop can call it directly. Handles
// per-model accommodations (Opus temp=1.0, GPT/MiniMax omit temperature,
// Qwen extra_body.enable_thinking explicit per amendment v2 §2).
//
// For Qwen subject calls, applies RUNTIME_QWEN_OPTS (set from CLI flags)
// when the caller doesn't override. Judge callers pass thinking=false and
// maxTokens=3000 explicitly.
const llmCall: LlmCallFn = async (input: LlmCallInput): Promise<AgentLlmCallResult> => {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) throw new Error('LITELLM_MASTER_KEY env not set');

  const { model, messages } = input;
  const isQwen = model.includes('qwen');
  const maxTokens = input.maxTokens ?? (isQwen ? RUNTIME_QWEN_OPTS.maxTokens : 4096);
  const thinking = input.thinking ?? (isQwen ? RUNTIME_QWEN_OPTS.thinking : true);
  const temperature = input.temperature ?? 0.3;

  const payload: Record<string, unknown> = { model, messages, max_tokens: maxTokens };

  if (model.startsWith('claude-opus')) {
    payload.temperature = 1.0;
  } else if (model === 'gpt-5.4' || model === 'minimax-m27-via-openrouter') {
    // omit temperature — reasoning model defaults
  } else {
    payload.temperature = temperature;
  }

  // Amendment v2 §2: ALWAYS pass enable_thinking explicitly for Qwen — do not rely on default.
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
  return {
    content: '', inTokens: 0, outTokens: 0, costUsd: 0,
    latencyMs: Date.now() - started,
    error: lastErr ?? 'unknown error',
  };
};

// ─────────────────────────────────────────────────────────────────────────
// Cell A/C: solo single-shot
// ─────────────────────────────────────────────────────────────────────────

async function runCellSolo(cell: 'A' | 'C', task: TaskMaterials): Promise<CellResult> {
  const config = CELLS[cell];
  logLine(`[cell ${task.taskId}/${cell}] solo call → ${config.model} (via @waggle/agent runSoloAgent)`);

  // Delegate to the unified agent loop from packages/agent (Phase 2.1 a599a07).
  // Prompt assembly + per-model framing is handled by the prompt-shape selected
  // for config.model. Pilot wrapper provides only the LlmCallFn adapter.
  const result: AgentRunResult = await runSoloAgent({
    modelAlias: config.model,
    persona: task.persona,
    question: task.question,
    materials: task.materialsConcat,
    llmCall,
    contextTag: `${task.taskId}/${cell}`,
    // No normalization-side schema change — keep raw response in JSONL for
    // backwards compat with original pilot artifacts.
  });

  return {
    taskId: task.taskId,
    cellId: cell,
    model: config.model,
    configuration: 'solo',
    candidateResponse: result.rawResponse,
    candidateLatencyMs: result.totalLatencyMs,
    candidateTokensIn: result.totalTokensIn,
    candidateTokensOut: result.totalTokensOut,
    candidateCostUsd: result.totalCostUsd,
    loopExhausted: result.loopExhausted,
    stepsTaken: result.stepsTaken,
    retrievalCalls: result.retrievalCalls,
    errors: [...result.errors],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Cell B/D: multi-step retrieval-augmented loop
// ─────────────────────────────────────────────────────────────────────────

async function runCellMultiStep(cell: 'B' | 'D', task: TaskMaterials, embedder: Embedder): Promise<CellResult> {
  const config = CELLS[cell];

  // Per-cell SessionStore + HybridSearch setup — this scaffolding stays in
  // the pilot wrapper because per-task corpus isolation is pilot-specific.
  const dbPath = path.join(SCRATCH_DIR, `per-task-${task.taskId}-cell-${cell}.sqlite`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = new MindDB(dbPath);
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const hybrid = new HybridSearch(db, embedder);

  const gopId = `${PILOT_ID}-${task.taskId}-${cell}`;
  sessions.ensure(gopId, undefined, `Pilot session for ${task.taskId} cell ${cell}`);

  for (const m of task.materialFrames) {
    const content = `## ${m.title}\n\n${m.body}`;
    frames.createIFrame(gopId, content, 'important', 'system');
  }
  logLine(`[cell ${task.taskId}/${cell}] ingested ${task.materialFrames.length} frames into ${dbPath}`);

  // RetrievalSearchFn adapter — wraps HybridSearch.search for the agent loop.
  // The agent loop calls this via config.search; the adapter formats the hits
  // into a single string for prompt injection.
  const searchAdapter: RetrievalSearchFn = async ({ query, limit }) => {
    const hits = await hybrid.search(query, { limit, gopId });
    const formatted = hits.length > 0
      ? hits.map((sr, i) => `[result ${i + 1}, score ${sr.finalScore.toFixed(3)}]\n${sr.frame.content}`).join('\n\n---\n\n')
      : '';
    return { formattedResults: formatted, resultCount: hits.length };
  };

  // Delegate to the unified agent loop from packages/agent (Phase 2.1 a599a07).
  // Per-call halt + per-cell halt + MAX_STEPS + force-finalize all enforced inside.
  const result: AgentRunResult = await runRetrievalAgentLoop({
    modelAlias: config.model,
    persona: task.persona,
    question: task.question,
    llmCall,
    search: searchAdapter,
    maxSteps: MAX_STEPS,
    maxRetrievalsPerStep: MAX_RETRIEVALS_PER_STEP,
    perCallHaltUsd: PER_CALL_SANITY_USD,
    perCellHaltUsd: PER_CELL_HARD_HALT_USD,
    contextTag: `${task.taskId}/${cell}`,
  });

  // MindDB does not expose a public close() — let GC reclaim. The sqlite file
  // remains on disk in tmp/ for post-run inspection (gitignored).
  return {
    taskId: task.taskId,
    cellId: cell,
    model: config.model,
    configuration: 'memory-harness',
    candidateResponse: result.rawResponse,
    candidateLatencyMs: result.totalLatencyMs,
    candidateTokensIn: result.totalTokensIn,
    candidateTokensOut: result.totalTokensOut,
    candidateCostUsd: result.totalCostUsd,
    loopExhausted: result.loopExhausted,
    stepsTaken: result.stepsTaken,
    retrievalCalls: result.retrievalCalls,
    errors: [...result.errors],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Trio judging
// ─────────────────────────────────────────────────────────────────────────

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

function buildJudgePrompt(task: TaskMaterials, response: string): string {
  return JUDGE_PROMPT_TEMPLATE
    .replace('###PERSONA_SCENARIO_QUESTION###', `${task.persona}\n\nQUESTION: ${task.question}`)
    .replace('###MATERIALS###', task.materialsConcat)
    .replace('###RESPONSE###', response);
}

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
  } catch {
    return null;
  }
}

const ZERO_VERDICT: JudgeVerdict = {
  completeness: 0, accuracy: 0, synthesis: 0, judgment: 0, actionability: 0, structure: 0,
  rationale: '__JUDGE_FAILED__', overall_verdict: 'FAIL_CRITICAL', mean: 0,
};

async function runJudge(judgeModel: string, prompt: string): Promise<JudgeRecord> {
  let lastError = '';
  let totalCost = 0, totalLatency = 0;
  // Amendment v2 PM-decision (post second-smoke): max_tokens 1024 → 3000 to address
  // MiniMax solo-cell failure pattern (dense memo responses likely overflowed 1024 mid-JSON).
  for (let attempt = 0; attempt < MAX_JUDGE_RETRIES; attempt++) {
    const r = await llmCall({ model: judgeModel, messages: [{ role: 'user', content: prompt }], maxTokens: 3000, thinking: false });
    totalCost += r.costUsd; totalLatency += r.latencyMs;
    if (r.error) { lastError = `attempt ${attempt + 1}: ${r.error}`; continue; }
    const parsed = parseJudgeJson(r.content);
    if (parsed) {
      return {
        ...parsed,
        judge_model: judgeModel, judge_cost_usd: totalCost,
        judge_latency_ms: totalLatency, judge_retries: attempt,
      };
    }
    lastError = `attempt ${attempt + 1}: malformed JSON: ${r.content.slice(0, 100)}`;
  }
  logLine(`[judge ${judgeModel}] FAILED after ${MAX_JUDGE_RETRIES}: ${lastError}`);
  return {
    ...ZERO_VERDICT,
    judge_model: judgeModel, judge_cost_usd: totalCost,
    judge_latency_ms: totalLatency, judge_retries: MAX_JUDGE_RETRIES,
    rationale: `__JUDGE_FAILED__: ${lastError}`,
  };
}

async function judgeWithTrio(task: TaskMaterials, response: string): Promise<{
  records: JudgeRecord[]; trioMean: number; strictPass: boolean; criticalFail: boolean; cost: number;
}> {
  const prompt = buildJudgePrompt(task, response);
  const records = await Promise.all(JUDGES.map(j => runJudge(j, prompt)));
  const validMeans = records.filter(r => r.mean > 0).map(r => r.mean);
  const trioMean = validMeans.length === 3
    ? validMeans.reduce((s, m) => s + m, 0) / 3
    : validMeans.length > 0 ? validMeans.reduce((s, m) => s + m, 0) / validMeans.length : 0;
  const strictPass = records.filter(r => r.mean >= 3.5).length >= 2;
  const criticalFail = records.filter(r => r.mean < 2.0 && r.mean > 0).length >= 2;
  const cost = records.reduce((s, r) => s + r.judge_cost_usd, 0);
  return { records, trioMean, strictPass, criticalFail, cost };
}

// ─────────────────────────────────────────────────────────────────────────
// Output writers
// ─────────────────────────────────────────────────────────────────────────

function stripJudge(j: JudgeRecord): JudgeVerdict {
  return {
    completeness: j.completeness, accuracy: j.accuracy, synthesis: j.synthesis,
    judgment: j.judgment, actionability: j.actionability, structure: j.structure,
    rationale: j.rationale, overall_verdict: j.overall_verdict, mean: j.mean,
  };
}

function findJudge(records: JudgeRecord[], model: string): JudgeRecord {
  const r = records.find(x => x.judge_model === model);
  if (!r) throw new Error(`judge record missing for ${model}`);
  return r;
}

function writeCellJsonl(
  cell: CellResult,
  judges: { records: JudgeRecord[]; trioMean: number; strictPass: boolean; criticalFail: boolean; cost: number },
  audit: { headSha: string }
): CellJsonlRecord {
  const rec: CellJsonlRecord = {
    task_id: cell.taskId,
    cell_id: cell.cellId,
    model: cell.model,
    configuration: cell.configuration,
    candidate_response: cell.candidateResponse,
    candidate_latency_ms: cell.candidateLatencyMs,
    candidate_tokens_in: cell.candidateTokensIn,
    candidate_tokens_out: cell.candidateTokensOut,
    candidate_cost_usd: cell.candidateCostUsd,
    loop_exhausted: cell.loopExhausted,
    steps_taken: cell.stepsTaken,
    retrieval_calls: cell.retrievalCalls,
    judge_opus: stripJudge(findJudge(judges.records, 'claude-opus-4-7')),
    judge_gpt: stripJudge(findJudge(judges.records, 'gpt-5.4')),
    judge_minimax: stripJudge(findJudge(judges.records, 'minimax-m27-via-openrouter')),
    trio_mean: judges.trioMean,
    trio_strict_pass: judges.strictPass,
    trio_critical_fail: judges.criticalFail,
    manifest_anchor: MANIFEST_ANCHOR,
    head_sha: audit.headSha,
    ts_iso: new Date().toISOString(),
    cell_cost_usd: cell.candidateCostUsd + judges.cost,
  };
  const outPath = path.join(OUT_DIR, `pilot-${cell.taskId}-${cell.cellId}.jsonl`);
  fs.writeFileSync(outPath, JSON.stringify(rec) + '\n', 'utf-8');
  logLine(`[cell ${cell.taskId}/${cell.cellId}] wrote ${path.basename(outPath)} trio_mean=${judges.trioMean.toFixed(2)} strict=${judges.strictPass} critical=${judges.criticalFail} cell_cost=$${rec.cell_cost_usd.toFixed(4)}`);
  return rec;
}

function writeSummary(records: CellJsonlRecord[], cumulativeCost: number, startTs: string, endTs: string): void {
  const byTask: Record<string, Record<string, number>> = {};
  let criticalFailures = 0;
  for (const r of records) {
    byTask[r.task_id] = byTask[r.task_id] ?? {};
    byTask[r.task_id][`cell_${r.cell_id}_trio_mean`] = r.trio_mean;
    if (r.trio_critical_fail) criticalFailures += 1;
  }
  const perTask: Record<string, unknown> = {};
  let h2Pass = 0, h3Pass = 0, h4Pass = 0;
  for (const tid of Object.keys(byTask)) {
    const t = byTask[tid];
    const a = t.cell_A_trio_mean ?? 0;
    const b = t.cell_B_trio_mean ?? 0;
    const c = t.cell_C_trio_mean ?? 0;
    const d = t.cell_D_trio_mean ?? 0;
    const h2 = b - a, h3 = d - c, h4 = d - a;
    const h2Dir = h2 >= 0.30, h3Dir = h3 >= 0.30, h4Dir = d >= a;
    if (h2Dir) h2Pass += 1; if (h3Dir) h3Pass += 1; if (h4Dir) h4Pass += 1;
    perTask[tid] = {
      cell_A_trio_mean: a, cell_B_trio_mean: b, cell_C_trio_mean: c, cell_D_trio_mean: d,
      h2_delta_opus: +h2.toFixed(4), h3_delta_qwen: +h3.toFixed(4), h4_delta_sovereignty: +h4.toFixed(4),
      h2_directional_pass: h2Dir, h3_directional_pass: h3Dir, h4_directional_pass: h4Dir,
    };
  }
  const verdict = (h2Pass >= 2 && h3Pass >= 2 && h4Pass >= 2 && criticalFailures === 0) ? 'PASS' : 'FAIL';
  const summary = {
    pilot_id: PILOT_ID,
    manifest_anchor: MANIFEST_ANCHOR,
    execution_window_utc: `${startTs} to ${endTs}`,
    total_cost_usd: +cumulativeCost.toFixed(6),
    total_judge_calls: records.length * 3,
    total_candidate_calls: records.length,
    n_cells: records.length,
    results_per_task: perTask,
    aggregate: {
      h2_pass_count: h2Pass,
      h3_pass_count: h3Pass,
      h4_pass_count: h4Pass,
      critical_failures: criticalFailures,
      pilot_verdict: verdict,
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'pilot-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  logLine(`[summary] verdict=${verdict} h2=${h2Pass}/3 h3=${h3Pass}/3 h4=${h4Pass}/3 critical=${criticalFailures} cost=$${cumulativeCost.toFixed(4)}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Amendment v2 §3.1 — Cell A MiniMax surgical retry
// ─────────────────────────────────────────────────────────────────────────

async function retryCellAMinimax(audit: { headSha: string }): Promise<void> {
  const jsonlPath = path.join(OUT_DIR, 'pilot-task-1-A.jsonl');
  if (!fs.existsSync(jsonlPath)) {
    logLine(`[retry-minimax] FAIL: ${jsonlPath} not found — Cell A must exist first`);
    return;
  }
  const rec: CellJsonlRecord = JSON.parse(fs.readFileSync(jsonlPath, 'utf-8').trim());
  const task = loadTaskMaterials('task-1');
  const prompt = buildJudgePrompt(task, rec.candidate_response);
  logLine(`[retry-minimax] Cell A — calling minimax-m27-via-openrouter against existing candidate (${rec.candidate_response.length}c)`);
  const newJudge = await runJudge('minimax-m27-via-openrouter', prompt);
  if (newJudge.mean > 0) {
    rec.judge_minimax = stripJudge(newJudge);
    const validMeans = [rec.judge_opus.mean, rec.judge_gpt.mean, rec.judge_minimax.mean].filter(m => m > 0);
    rec.trio_mean = validMeans.length > 0 ? validMeans.reduce((s, m) => s + m, 0) / validMeans.length : 0;
    const strictCount = [rec.judge_opus, rec.judge_gpt, rec.judge_minimax].filter(j => j.mean >= 3.5).length;
    const criticalCount = [rec.judge_opus, rec.judge_gpt, rec.judge_minimax].filter(j => j.mean < 2.0 && j.mean > 0).length;
    rec.trio_strict_pass = strictCount >= 2;
    rec.trio_critical_fail = criticalCount >= 2;
    (rec as unknown as Record<string, unknown>).judge_minimax_retried_at = new Date().toISOString();
    rec.cell_cost_usd += newJudge.judge_cost_usd;
    rec.head_sha = audit.headSha;
    fs.writeFileSync(jsonlPath, JSON.stringify(rec) + '\n', 'utf-8');
    logLine(`[retry-minimax] SUCCESS — Cell A judge_minimax=${newJudge.mean.toFixed(2)} new trio_mean=${rec.trio_mean.toFixed(3)} cost=$${newJudge.judge_cost_usd.toFixed(4)}`);
  } else {
    logLine(`[retry-minimax] FAIL again — Cell A retains 2-judge fallback. cost=$${newJudge.judge_cost_usd.toFixed(4)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Amendment v2 §3 — Restart cells (invalidate + re-run)
// ─────────────────────────────────────────────────────────────────────────

async function restartCells(
  cellList: string,
  embedder: Embedder,
  audit: { headSha: string }
): Promise<{ records: CellJsonlRecord[]; cost: number }> {
  const invalidatedDir = path.join(OUT_DIR, 'invalidated');
  fs.mkdirSync(invalidatedDir, { recursive: true });

  const targets = cellList.split(',').map(s => s.trim()).filter(Boolean);
  let totalCost = 0;
  const records: CellJsonlRecord[] = [];
  for (const target of targets) {
    const m = target.match(/^(task-\d+)-([ABCD])$/);
    if (!m) {
      logLine(`[restart] skip malformed target: ${target}`);
      continue;
    }
    const taskId = m[1];
    const cellId = m[2] as 'A' | 'B' | 'C' | 'D';
    const original = path.join(OUT_DIR, `pilot-${taskId}-${cellId}.jsonl`);
    const dest = path.join(invalidatedDir, `pilot-${taskId}-${cellId}.invalidated-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    if (fs.existsSync(original)) {
      fs.renameSync(original, dest);
      logLine(`[restart] moved original to ${path.basename(dest)}`);
    }
    const task = loadTaskMaterials(taskId);
    const cellResult = (cellId === 'A' || cellId === 'C')
      ? await runCellSolo(cellId, task)
      : await runCellMultiStep(cellId, task, embedder);
    const judges = await judgeWithTrio(task, cellResult.candidateResponse);
    totalCost += cellResult.candidateCostUsd + judges.cost;
    const rec = writeCellJsonl(cellResult, judges, { headSha: audit.headSha });
    records.push(rec);
  }
  return { records, cost: totalCost };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { printHelp(); return; }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PROMPTS_ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });

  // Amendment v2 §7 (PM-revised post second-smoke): always append to run log; only
  // create on first run. JSONLs are atomic per-cell so log loss is recoverable, but
  // multi-kick pilot requires log continuity across phases (smoke → restart → tasks 2+3).
  if (!fs.existsSync(RUN_LOG_PATH)) fs.writeFileSync(RUN_LOG_PATH, '');

  // Apply amendment v2 §2 Qwen config (or CLI overrides).
  RUNTIME_QWEN_OPTS.maxTokens = args.qwenMaxTokens;
  RUNTIME_QWEN_OPTS.thinking = args.qwenThinking;
  CELLS.C.model = args.qwenAlias;
  CELLS.D.model = args.qwenAlias;

  const startTs = new Date().toISOString();
  const audit = preflight();
  // Amendment v2 §8: capture v2 SHA in addition to v1 + brief + rubric + HEAD.
  const amendmentV2Path = path.join(BRIEF_DIR, 'cc1-brief-amendment-v2-2026-04-26.md');
  const amendmentV2Sha = fs.existsSync(amendmentV2Path) ? sha256File(amendmentV2Path) : 'NOT_PRESENT';
  logLine(`[pilot] amendment_v2_doc_sha256 = ${amendmentV2Sha}`);
  logLine(`[pilot] amendment_v1_doc_sha256 = ${audit.amendmentSha}`);
  logLine(`[pilot] cc1_brief_sha256 = ${audit.briefSha}`);
  logLine(`[pilot] judge_rubric_sha256 = ${audit.rubricSha}`);
  logLine(`[pilot] head_sha = ${audit.headSha}`);
  logLine(`[pilot] manifest_anchor = ${MANIFEST_ANCHOR}`);
  logLine(`[pilot] cost_cap = $${COST_CAP_USD}, halt = $${COST_HALT_USD}, per_cell_halt = $${PER_CELL_HARD_HALT_USD}`);
  logLine(`[pilot] qwen_alias = ${args.qwenAlias}`);
  logLine(`[pilot] qwen_max_tokens = ${args.qwenMaxTokens}`);
  logLine(`[pilot] qwen_thinking = ${args.qwenThinking ? 'on' : 'off'}`);

  // Amendment v2 §7 partial-run paths (no full pilot loop).
  if (args.retryCellAMinimax || args.restartCells) {
    const embedder = createOllamaEmbedder({ baseUrl: OLLAMA_URL, model: EMBEDDER_MODEL });
    let partialCost = 0;
    if (args.retryCellAMinimax) {
      await retryCellAMinimax({ headSha: audit.headSha });
    }
    if (args.restartCells) {
      const r = await restartCells(args.restartCells, embedder, { headSha: audit.headSha });
      partialCost += r.cost;
    }
    logLine(`[partial-run] complete; partial_cost=$${partialCost.toFixed(4)}`);
    // Re-emit summary from current JSONL set (covers retained + restarted records).
    const allFiles = fs.readdirSync(OUT_DIR).filter(f => f.match(/^pilot-task-\d+-[ABCD]\.jsonl$/));
    const allRecords: CellJsonlRecord[] = [];
    for (const f of allFiles) {
      const r = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf-8').trim());
      allRecords.push(r);
    }
    const cumCost = allRecords.reduce((s, r) => s + r.cell_cost_usd, 0);
    writeSummary(allRecords, cumCost, startTs, new Date().toISOString());
    return;
  }

  let taskIds: string[];
  if (args.smoke) taskIds = ['task-1'];
  else if (args.allTasks) taskIds = ['task-1', 'task-2', 'task-3'];
  else if (args.task) taskIds = [args.task];
  else { console.error('Specify one of: --smoke, --all-tasks, --task <id>, --retry-cell-a-minimax, --restart-cells <list>'); process.exit(1); }

  const cellIds: ('A' | 'B' | 'C' | 'D')[] = (args.allCells || args.smoke)
    ? ['A', 'B', 'C', 'D']
    : args.cell ? [args.cell] : ['A', 'B', 'C', 'D'];

  if (args.dryRun) {
    logLine(`[dry-run] would run ${taskIds.length} task(s) × ${cellIds.length} cell(s) = ${taskIds.length * cellIds.length} cells`);
    for (const tid of taskIds) {
      const t = loadTaskMaterials(tid);
      logLine(`[dry-run] ${tid}: frames=${t.materialFrames.length} persona=${t.persona.length}c materials=${t.materialsConcat.length}c question=${t.question.length}c`);
      for (const f of t.materialFrames) logLine(`  - frame: ${f.title} (${f.body.length}c)`);
    }
    return;
  }

  const embedder = createOllamaEmbedder({ baseUrl: OLLAMA_URL, model: EMBEDDER_MODEL });

  let cumulativeCost = 0;
  const allRecords: CellJsonlRecord[] = [];

  for (const tid of taskIds) {
    const task = loadTaskMaterials(tid);
    logLine(`[task ${tid}] loaded ${task.materialFrames.length} frames`);
    for (const cid of cellIds) {
      if (cumulativeCost >= COST_HALT_USD) {
        logLine(`[HALT] cumulative $${cumulativeCost.toFixed(4)} >= $${COST_HALT_USD}`);
        break;
      }
      const cellResult = (cid === 'A' || cid === 'C')
        ? await runCellSolo(cid, task)
        : await runCellMultiStep(cid, task, embedder);
      const judges = await judgeWithTrio(task, cellResult.candidateResponse);
      cumulativeCost += cellResult.candidateCostUsd + judges.cost;
      const rec = writeCellJsonl(cellResult, judges, { headSha: audit.headSha });
      allRecords.push(rec);
      logLine(`[cumulative] $${cumulativeCost.toFixed(4)} / $${COST_CAP_USD}`);
    }
  }

  const endTs = new Date().toISOString();
  writeSummary(allRecords, cumulativeCost, startTs, endTs);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
