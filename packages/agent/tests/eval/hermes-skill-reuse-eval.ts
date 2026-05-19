/**
 * R6 — Hermes "~40% faster" closed-loop eval (real LLM).
 *
 * Contract: docs/plans/HERMES-40-PREREG-2026-05-19.md (LOCKED @ a7b844a).
 * Tests whether a self-distilled skill makes a *similar later task* cheaper
 * in tool-calls, within-model paired, graded on correctness.
 *
 * Usage:  tsx packages/agent/tests/eval/hermes-skill-reuse-eval.ts
 * Env:    WAGGLE_DATA_DIR (vault location; default ~/.waggle)
 *         HERMES_EVAL_N   (override pair count; default = pilot 3)
 * Output: tmp_hermes-skill-reuse.json (gitignored) + console verdict.
 *
 * No fallback model. Hard cost cap via CostTracker. Pre-registered gate.
 */
import { runAgentLoop } from '../../src/agent-loop.js';
import type { ToolDefinition } from '../../src/tools.js';
import { planSkillDistillation } from '../../src/skill-distillation.js';
import { CostTracker, BudgetExceededError } from '../../src/cost-tracker.js';
import { VaultStore } from '@waggle/core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ── Pinned config (manifest §4, §8) ──────────────────────────────────
const MODEL = 'qwen/qwen3-30b-a3b-instruct-2507';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const MAX_TURNS = 25;
const MAX_TOKEN_BUDGET_PER_RUN = 60_000;
const PILOT_N = 3;
const POWERED_N = 20;
const PILOT_CAP_USD = 5;
const COMBINED_CAP_USD = 45;
const SUCCESS_REDUCTION = 0.40;       // manifest §3
const ESCALATE_MEDIAN_MIN = 0.40;     // manifest §9.1
const ESCALATE_MIN_PASS_FAMILIES = 2; // manifest §9.2 (of 3 pilot)
const COST_SAFETY = 1.3;              // manifest §9.3
// Generous (high) qwen ceiling so the hard cap is conservative but the
// pilot still has headroom; recorded in results.
const QWEN_PRICING = { [MODEL]: { inputPer1k: 0.0004, outputPer1k: 0.0016 } };

const WAGGLE_DATA_DIR = process.env.WAGGLE_DATA_DIR || path.join(os.homedir(), '.waggle');

// ── Fixed corpus (manifest §7; faithful slices of repo @ c87e5b7) ────
// Small on purpose: deterministic, low-token, ≥5-tool to assemble facts.
const CORPUS: Record<string, string> = {
  'packages/agent/src/orchestrator.ts': [
    'async recallMemory(query, limit=10, opts) {',
    '  // normal branch -> this.search.search() (HybridSearch)',
    '  // R2 sign-gate closure (DEFECT-2): enforce authoritative-recall rule',
    "  const isAuthoritativeForRecall = (r) => { const imp = r.frame.importance ?? 'normal';",
    "    return imp !== 'temporary' && imp !== 'deprecated'; };",
    '  personalResults = personalResults.filter(isAuthoritativeForRecall);',
    '  workspaceResults = workspaceResults.filter(isAuthoritativeForRecall);',
    '}',
    'const save = async (content, importance) => {',
    "  if (importance !== 'temporary' && isSelfIncapacityAssertion(content)) {",
    "    importance = 'temporary'; // line ~757: sign-gate coercion at the save() chokepoint",
    '  } ... }',
    'private fetchRecentFrames(db, limit, opts) {',
    "  // WHERE importance != 'deprecated' AND importance != 'temporary' (line ~262)",
    '}',
  ].join('\n'),
  'packages/agent/src/memory-sign-gate.ts': [
    '// R2 / DEFECT-2 structural fix.',
    'export function isSelfIncapacityAssertion(content: string): boolean {',
    '  // flags agent self-incapacity / refusal so autoSaveFromExchange',
    "  // persists them 'temporary' (recall-excluded). Pure + unit-tested.",
    '}',
  ].join('\n'),
  'packages/agent/src/skill-distillation.ts': [
    '// R1 Hermes-parity closed learning loop.',
    'export function shouldDistillSkill(toolCallCount, assistantMsg) { /* >=5 & not refusal */ }',
    'export function planSkillDistillation(toolsUsed, assistantMsg) {',
    '  // returns { directive, patternKey } | null; R2-gated end to end',
    '}',
  ].join('\n'),
  'packages/server/src/local/routes/chat.ts': [
    '// turn-completion seam: planSkillDistillation(result.toolsUsed, result.content)',
    "// on fire: sendEvent('step', directive) + improvementSignals.record('skill_promotion', ...)",
  ].join('\n'),
  'docs/INJECTION-SITES.md': [
    'scanForInjection() is called at these sites:',
    '- packages/agent/src/orchestrator.ts (recalled memory, before prompt)',
    '- packages/agent/src/agent-loop.ts (tool results)',
    '- packages/core/src/harvest/pipeline.ts (harvested frames)',
    '- packages/agent/src/connectors/* (external connector input)',
  ].join('\n'),
  'docs/SUBSYSTEMS.md': [
    'Evolution stack: evolution-orchestrator.ts, iterative-optimizer.ts,',
    '  eval-dataset.ts, judge.ts, evolution-gates.ts, compose-evolution.ts.',
    'Harvest stack: harvest/pipeline.ts, harvest/dedup.ts, adapters for',
    '  chatgpt, claude, claude-code, gemini, perplexity, pdf, url.',
  ].join('\n'),
};

// ── Task families (manifest §7) ──────────────────────────────────────
interface TaskSpec { prompt: string; requiredFacts: RegExp[]; }
interface Family { id: string; a: TaskSpec; b: TaskSpec; }

const FAMILIES: Family[] = [
  {
    id: 'F1-trace-wired-behavior',
    a: {
      prompt:
        'Using only repo_grep and repo_read over this codebase, explain HOW recallMemory ' +
        'avoids returning sign-gated frames. Name the file and the exact importance values excluded.',
      requiredFacts: [/orchestrator\.ts/i, /recallMemory/i, /temporary/i, /deprecated/i],
    },
    b: {
      prompt:
        'Using only the tools, explain HOW a self-incapacity assertion gets coerced so it ' +
        'is not recalled. Name the classifier file and the importance it is coerced to.',
      requiredFacts: [/memory-sign-gate\.ts|isSelfIncapacityAssertion/i, /orchestrator\.ts/i, /temporary/i],
    },
  },
  {
    id: 'F2-audit-pattern',
    a: {
      prompt: 'List every place the authoritative-recall importance filter is applied. Name the file(s).',
      requiredFacts: [/orchestrator\.ts/i, /temporary/i, /deprecated/i],
    },
    b: {
      prompt: 'List every call site of scanForInjection(). Name each file/path.',
      requiredFacts: [/orchestrator\.ts/i, /agent-loop\.ts/i, /harvest\/pipeline\.ts/i, /connectors/i],
    },
  },
  {
    id: 'F3-summarize-subsystem',
    a: {
      prompt: 'Summarize the Evolution stack. Name at least three of its modules.',
      requiredFacts: [/evolution-orchestrator/i, /iterative-optimizer/i, /judge\.ts/i],
    },
    b: {
      prompt: 'Summarize the Harvest stack. Name at least three of its modules/adapters.',
      requiredFacts: [/pipeline\.ts/i, /dedup\.ts/i, /chatgpt|claude-code|gemini|perplexity/i],
    },
  },
];

// Powered pool (manifest §7): the 3 families repeated to N=20 (fixed order).
function pooledPairs(n: number): Family[] {
  const out: Family[] = [];
  for (let i = 0; i < n; i++) out.push(FAMILIES[i % FAMILIES.length]);
  return out;
}

// ── Controlled tools (manifest §5 pre-data amendment) ────────────────
function makeTools(skillDir: string, withCreateSkill: boolean, counter: { n: number }): ToolDefinition[] {
  const grep: ToolDefinition = {
    name: 'repo_grep',
    description: 'Search the repository for a regex. Returns matching "path:line: text".',
    parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
    execute: async (args) => {
      counter.n++;
      let re: RegExp;
      try { re = new RegExp(String(args.pattern), 'i'); } catch { return 'Invalid regex.'; }
      const hits: string[] = [];
      for (const [p, body] of Object.entries(CORPUS)) {
        body.split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${p}:${i + 1}: ${line.trim()}`); });
      }
      return hits.length ? hits.slice(0, 25).join('\n') : 'No matches.';
    },
  };
  const read: ToolDefinition = {
    name: 'repo_read',
    description: 'Read a repository file by exact path.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    execute: async (args) => {
      counter.n++;
      const p = String(args.path);
      return CORPUS[p] ?? `Not found: ${p}. Known paths: ${Object.keys(CORPUS).join(', ')}`;
    },
  };
  const skillLookup: ToolDefinition = {
    name: 'skill_lookup',
    description: 'List and return the content of any reusable skills you have learned.',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async () => {
      counter.n++;
      const files = fs.existsSync(skillDir) ? fs.readdirSync(skillDir).filter(f => f.endsWith('.md')) : [];
      if (!files.length) return 'No skills available.';
      return files.map(f => `# skill: ${f}\n${fs.readFileSync(path.join(skillDir, f), 'utf-8')}`).join('\n\n');
    },
  };
  const tools = [grep, read, skillLookup];
  if (withCreateSkill) {
    tools.push({
      name: 'create_skill',
      description: 'Persist a reusable skill (generalized method, no specifics) for future similar tasks.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' }, content: { type: 'string' } },
        required: ['name', 'content'],
      },
      execute: async (args) => {
        counter.n++;
        const name = String(args.name).replace(/[^a-z0-9-]/gi, '-').slice(0, 60) || 'skill';
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, `${name}.md`), String(args.content ?? ''), 'utf-8');
        return `Skill '${name}' saved.`;
      },
    });
  }
  return tools;
}

// Shipped R1 behavioral rule (behavioral-spec.ts:300-315) — verbatim intent.
const DISTILL_RULE =
  '\n\nSkill Distillation (closed learning loop): if you SUCCESSFULLY complete a task ' +
  'that took several distinct tool calls (~5+), call create_skill to distill the ' +
  'GENERALIZED reusable method (the steps, which tools in what order, how to know it ' +
  'worked) — strip specifics. Only distill successful work, never a failure.';

const BASE_SYSTEM =
  'You are a precise codebase investigation agent. Use the provided tools to gather ' +
  'evidence, then give a final answer that explicitly names the files and facts asked ' +
  'for. If you have learned skills, call skill_lookup FIRST and follow the recipe. ' +
  'Be efficient: do not make redundant tool calls. End with your final answer (no tool call).';

interface RunResult { toolCalls: number; inTok: number; outTok: number; answer: string; pass: boolean; }

async function runTask(
  task: TaskSpec, skillDir: string, withCreateSkill: boolean,
  cost: CostTracker, openrouterKey: string,
): Promise<RunResult> {
  cost.checkBudget(); // hard mode → throws BudgetExceededError before spend
  const counter = { n: 0 };
  const sys = BASE_SYSTEM + (withCreateSkill ? DISTILL_RULE : '');
  const resp = await runAgentLoop({
    litellmUrl: OPENROUTER_URL,
    litellmApiKey: openrouterKey,
    model: MODEL,
    systemPrompt: sys,
    tools: makeTools(skillDir, withCreateSkill, counter),
    messages: [{ role: 'user', content: task.prompt }],
    maxTurns: MAX_TURNS,
    maxTokenBudget: MAX_TOKEN_BUDGET_PER_RUN,
    onToolResult: () => { cost.checkBudget(); },
  });
  cost.addUsage(MODEL, resp.usage.inputTokens, resp.usage.outputTokens);
  cost.checkBudget();
  const answer = resp.content ?? '';
  const pass = task.requiredFacts.every(re => re.test(answer));
  return { toolCalls: counter.n, inTok: resp.usage.inputTokens, outTok: resp.usage.outputTokens, answer, pass };
}

// Exact one-sided binomial: P(X >= k | n, 0.5), H1: treatment<baseline more often.
function signTestP(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const choose = (a: number, b: number): number => {
    let r = 1;
    for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1);
    return r;
  };
  let p = 0;
  for (let k = wins; k <= n; k++) p += choose(n, k) * Math.pow(0.5, n);
  return p;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface PairOutcome {
  family: string; counted: boolean; reason?: string;
  tcBase?: number; tcTreat?: number; reduction?: number; skillBytes?: number;
}

async function runPair(fam: Family, idx: number, cost: CostTracker, key: string): Promise<PairOutcome> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `hermes-${fam.id}-${idx}-`));
  const famSkillDir = path.join(tmp, 'fam-skill');     // distilled skill lives here
  const emptyDir = path.join(tmp, 'empty');            // baseline: provably no skill
  fs.mkdirSync(famSkillDir, { recursive: true });
  fs.mkdirSync(emptyDir, { recursive: true });

  // Distill-source run (manifest §5 A0≡D: first task, may author skill_i).
  const distill = await runTask(fam.a, famSkillDir, true, cost, key);
  const skillFiles = fs.readdirSync(famSkillDir).filter(f => f.endsWith('.md'));
  // Tie to the shipped artifact: would the real R1 seam have fired here?
  const r1 = planSkillDistillation(Array(distill.toolCalls).fill('repo_grep'), distill.answer);
  if (!distill.pass) return { family: fam.id, counted: false, reason: `distill task_a grader-FAIL (tools=${distill.toolCalls}, r1=${r1 ? 'would-fire' : 'gated-off'})` };
  if (!skillFiles.length) return { family: fam.id, counted: false, reason: `no skill authored despite ${r1 ? 'R1 would-fire' : 'R1 gated-off'} (tools=${distill.toolCalls})` };

  // Skill isolation assertion (manifest §5).
  if (fs.readdirSync(emptyDir).length) throw new Error('isolation violation: baseline dir not empty');

  const base = await runTask(fam.b, emptyDir, false, cost, key);        // baseline_b: no skill
  const treat = await runTask(fam.b, famSkillDir, false, cost, key);    // treatment_b: skill_i present

  if (!base.pass || !treat.pass) {
    return { family: fam.id, counted: false, reason: `pair not PASS-PASS (base=${base.pass} treat=${treat.pass})`, tcBase: base.toolCalls, tcTreat: treat.toolCalls };
  }
  const reduction = (base.toolCalls - treat.toolCalls) / Math.max(1, base.toolCalls);
  return {
    family: fam.id, counted: true, tcBase: base.toolCalls, tcTreat: treat.toolCalls,
    reduction, skillBytes: fs.statSync(path.join(famSkillDir, skillFiles[0])).size,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  // Key hydrate (manifest §4) — vault first, env fallback.
  let key = process.env.OPENROUTER_API_KEY ?? '';
  try { key = new VaultStore(WAGGLE_DATA_DIR).get('openrouter')?.value ?? key; } catch { /* env fallback */ }
  if (!key) { console.error('ABORT: no OpenRouter key (vault or env).'); process.exit(2); }

  // Mandatory slug probe — abort, no fallback (manifest §4).
  try {
    const r = await fetch(`${OPENROUTER_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'ok' }], max_tokens: 4 }),
    });
    if (!r.ok) { console.error(`ABORT: slug probe failed (${r.status} ${await r.text()}). No fallback (manifest §4).`); process.exit(2); }
  } catch (e) { console.error(`ABORT: slug probe error: ${(e as Error).message}`); process.exit(2); }

  const escalate = process.env.HERMES_EVAL_ESCALATED === '1';
  const N = process.env.HERMES_EVAL_N ? Number(process.env.HERMES_EVAL_N) : (escalate ? POWERED_N : PILOT_N);
  const cap = escalate ? COMBINED_CAP_USD : PILOT_CAP_USD;
  const cost = new CostTracker(QWEN_PRICING);
  cost.setBudget(cap, 'hard');

  const families = escalate ? pooledPairs(N) : FAMILIES.slice(0, N);
  const outcomes: PairOutcome[] = [];
  let abortedBudget = false;
  for (let i = 0; i < families.length; i++) {
    try {
      outcomes.push(await runPair(families[i], i, cost, key));
    } catch (e) {
      if (e instanceof BudgetExceededError) { abortedBudget = true; console.error(`HARD CAP HIT: ${e.message}`); break; }
      outcomes.push({ family: families[i].id, counted: false, reason: `run error: ${(e as Error).message}` });
    }
  }

  const counted = outcomes.filter(o => o.counted);
  const reductions = counted.map(o => o.reduction!);
  const wins = counted.filter(o => (o.tcTreat ?? 0) < (o.tcBase ?? 0)).length;
  const losses = counted.filter(o => (o.tcTreat ?? 0) > (o.tcBase ?? 0)).length;
  const med = median(reductions);
  const p = signTestP(wins, losses);
  const dailyTotal = cost.getDailyTotal();

  // Pre-registered gate (manifest §9) — pilot only.
  const passFamilies = new Set(counted.map(o => o.family)).size;
  const projected = counted.length ? (dailyTotal / Math.max(1, outcomes.length)) * POWERED_N * COST_SAFETY : Infinity;
  const gate = !escalate ? {
    medianOk: med >= ESCALATE_MEDIAN_MIN,
    passFamiliesOk: passFamilies >= ESCALATE_MIN_PASS_FAMILIES,
    costOk: projected <= (COMBINED_CAP_USD - dailyTotal),
    projectedUsd: projected,
  } : null;
  const escalateDecision = gate ? (gate.medianOk && gate.passFamiliesOk && gate.costOk) : null;

  let verdict: string;
  if (escalate) {
    verdict = (med >= SUCCESS_REDUCTION && p < 0.05 && counted.length > 0) ? 'PROVEN' : 'NOT-PROVEN';
  } else {
    verdict = escalateDecision ? 'PILOT-PASS → ESCALATE' : 'INCONCLUSIVE-STOPPED';
  }

  const result = {
    manifest: 'docs/plans/HERMES-40-PREREG-2026-05-19.md @ a7b844a',
    startedAt, finishedAt: new Date().toISOString(), model: MODEL, escalatedRun: escalate,
    N, cap, abortedBudget, spendUsd: Number(dailyTotal.toFixed(4)), pricingAssumption: QWEN_PRICING,
    counted: counted.length, totalPairs: outcomes.length, passFamilies,
    medianReduction: Number((med || 0).toFixed(4)), wins, losses, signTestP: Number(p.toFixed(5)),
    gate, escalateDecision, verdict, outcomes,
  };
  const outPath = path.join(process.cwd(), 'tmp_hermes-skill-reuse.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('\n==== HERMES-40 EVAL RESULT ====');
  console.log(JSON.stringify({ verdict, medianReduction: result.medianReduction, signTestP: result.signTestP,
    counted: result.counted, totalPairs: result.totalPairs, spendUsd: result.spendUsd, gate, escalateDecision }, null, 2));
  console.log(`Full result → ${outPath}`);
  console.log('Pre-registered: median≥0.40 AND sign-test p<0.05 (escalated) ⇒ PROVEN; else honest.');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
