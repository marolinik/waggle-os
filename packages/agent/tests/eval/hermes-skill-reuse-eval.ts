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
// Amendment 4 (user-directed, post-Pilot-3): (a) faithful two-phase
// distill — Pilots 1-3's "no skill authored" was a HARNESS artifact
// (single-turn loop ended at the answer; the model never got the
// post-task distill turn that production R1 surfaces). (b) per user's
// option B, a frontier agentic model. Prior "30B won't self-distil"
// finding RETRACTED — it measured the harness bug, not the model.
const MODEL = 'anthropic/claude-sonnet-4.6';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const MAX_TURNS = 25;
const MAX_TOKEN_BUDGET_PER_RUN = 60_000;
const PILOT_N = 3;
const POWERED_N = 20;
const PILOT_CAP_USD = 5;
// Amendment 4: user B ceiling is ≤$40 COMBINED (pilots + powered). The
// harness uses a fresh CostTracker per invocation, so the powered run's
// hard cap is set conservatively to $38 — cumulative pilot spend to date
// is ≪$1 (qwen pilots $0.0385; sonnet validation pilot ≪$1), so
// $38 powered + <$2 pilots is provably ≤ the $40 the user authorized.
const COMBINED_CAP_USD = 38;
const SUCCESS_REDUCTION = 0.40;       // manifest §3
const ESCALATE_MEDIAN_MIN = 0.40;     // manifest §9.1
const ESCALATE_MIN_PASS_FAMILIES = 2; // manifest §9.2 (of 3 pilot)
const COST_SAFETY = 1.3;              // manifest §9.3
// True OpenRouter price for anthropic/claude-sonnet-4.6 ($3/$15 per M);
// the $5 pilot / $40 hard cap are enforced against this.
const MODEL_PRICING = { [MODEL]: { inputPer1k: 0.003, outputPer1k: 0.015 } };

const WAGGLE_DATA_DIR = process.env.WAGGLE_DATA_DIR || path.join(os.homedir(), '.waggle');

// ── Forcing corpus (manifest §7 + Amendment 3) ───────────────────────
// Fictional, project-specific "Floruxa" subsystem. Facts are scattered
// 1-per-file and chained via 'next:' refs, so a correct pipeline trace
// REQUIRES ≥8 grounded tool calls (registry → a → b → gate → c → config
// → d). Names are non-guessable → the model cannot answer from priors;
// it must actually read along the chain. Same traversal method across
// all 3 pipelines, so a distilled recipe genuinely transfers.
const CORPUS: Record<string, string> = {
  'registry.ts':
    'Floruxa pipeline registry. ingest -> stage_ingest_a.ts. export -> stage_export_a.ts. ' +
    'audit -> stage_audit_a.ts. (legacy -> stage_legacy_x.ts, DEPRECATED — not active.)',
  'notes.md':
    'Floruxa internal. Stage/file/env names are project-specific; do NOT assume them — ' +
    'follow each file\'s "next:" reference.',
  // ingest chain
  'stage_ingest_a.ts': "Floruxa stage 'PARSE'. next: stage_ingest_b.ts. gotcha: rejects empty payloads.",
  'stage_ingest_b.ts': "Floruxa stage 'NORMALIZE'. next: stage_ingest_c.ts. gate before next: gate_ingest_bc.ts",
  'gate_ingest_bc.ts': "Floruxa gate 'BC-QUORUM': blocks the B->C handoff until 2 replicas ack.",
  'stage_ingest_c.ts': "Floruxa stage 'ENRICH'. next: stage_ingest_d.ts. disabled by env FLUX_SKIP_ENRICH (see config_ingest.md).",
  'config_ingest.md': 'FLUX_SKIP_ENRICH=1 disables ingest stage ENRICH (stage_ingest_c.ts).',
  'stage_ingest_d.ts': "Floruxa stage 'COMMIT'. terminal. emits flux.ingest.done",
  // export chain
  'stage_export_a.ts': "Floruxa stage 'COLLECT'. next: stage_export_b.ts. gotcha: requires a snapshot lock.",
  'stage_export_b.ts': "Floruxa stage 'SERIALIZE'. next: stage_export_c.ts. gate before next: gate_export_bc.ts",
  'gate_export_bc.ts': "Floruxa gate 'BC-SCHEMA': blocks the B->C handoff until schema v3 validates.",
  'stage_export_c.ts': "Floruxa stage 'REDACT'. next: stage_export_d.ts. disabled by env FLUX_SKIP_REDACT (see config_export.md).",
  'config_export.md': 'FLUX_SKIP_REDACT=1 disables export stage REDACT (stage_export_c.ts).',
  'stage_export_d.ts': "Floruxa stage 'SHIP'. terminal. emits flux.export.done",
  // audit chain
  'stage_audit_a.ts': "Floruxa stage 'SCAN'. next: stage_audit_b.ts. gotcha: skips if no diff.",
  'stage_audit_b.ts': "Floruxa stage 'MATCH'. next: stage_audit_c.ts. gate before next: gate_audit_bc.ts",
  'gate_audit_bc.ts': "Floruxa gate 'BC-ATTEST': blocks the B->C handoff until an attestor signs.",
  'stage_audit_c.ts': "Floruxa stage 'SIGN'. next: stage_audit_d.ts. disabled by env FLUX_SKIP_SIGN (see config_audit.md).",
  'config_audit.md': 'FLUX_SKIP_SIGN=1 disables audit stage SIGN (stage_audit_c.ts).',
  'stage_audit_d.ts': "Floruxa stage 'SEAL'. terminal. emits flux.audit.done",
  // distractor
  'stage_legacy_x.ts': 'Floruxa legacy stage. DEPRECATED. not part of any active pipeline. ignore.',
};

// ── Task families (manifest §7) ──────────────────────────────────────
interface TaskSpec { prompt: string; requiredFacts: RegExp[]; }
interface Family { id: string; a: TaskSpec; b: TaskSpec; }

// Same traversal METHOD for every pipeline (registry → follow 'next:' →
// gate → config → terminal). A skill distilled from task_a transfers to
// task_b's different pipeline. 6 scattered required facts ⇒ a correct
// answer needs ≥8 grounded tool calls (well over the ≥5 R1 trigger).
function traceTask(pipe: 'ingest' | 'export' | 'audit'): TaskSpec {
  return {
    prompt:
      `Trace the Floruxa "${pipe}" pipeline end to end. Start by reading registry.ts, then ` +
      `follow each stage file's "next:" reference until the terminal stage. The names are ` +
      `project-specific — you MUST repo_read each file (do not guess). In your final answer: ` +
      `(1) list, IN ORDER, every stage_${pipe}_*.ts file; (2) name the gate file on the B→C ` +
      `handoff; (3) give the env var that disables stage C.`,
    requiredFacts: [
      new RegExp(`stage_${pipe}_a\\.ts`, 'i'),
      new RegExp(`stage_${pipe}_b\\.ts`, 'i'),
      new RegExp(`gate_${pipe}_bc\\.ts|BC-(QUORUM|SCHEMA|ATTEST)`, 'i'),
      new RegExp(`stage_${pipe}_c\\.ts`, 'i'),
      new RegExp(`FLUX_SKIP_(ENRICH|REDACT|SIGN)`, 'i'),
      new RegExp(`stage_${pipe}_d\\.ts`, 'i'),
    ],
  };
}

const FAMILIES: Family[] = [
  { id: 'F1-trace-ingest→export', a: traceTask('ingest'), b: traceTask('export') },
  { id: 'F2-trace-audit→ingest',  a: traceTask('audit'),  b: traceTask('ingest') },
  { id: 'F3-trace-export→audit',  a: traceTask('export'), b: traceTask('audit')  },
];

// ── LPV-B floundering corpus (LIVE-PREMIUM-VALIDATION-PREREG §4) ──────
// Engineered so a FRESH agent must flounder: registry hides the entry
// behind loader.ts; loader lists many [DECOY]/[deprecated] look-alikes
// + exactly one [ACTIVE]; the ACTIVE chain's 'next:' refs also carry
// dead "see also:" decoys. Naive grep lands in decoys → wasted reads.
// A distilled skill encoding "loader [ACTIVE] only; ignore see-also;
// follow next: on the ACTIVE chain" lets the second task skip it all.
const FLOUNDER = process.env.LPV_FLOUNDER === '1';
const FPIPES = ['alpha', 'bravo', 'charlie'] as const;
const FLOUNDER_CORPUS: Record<string, string> = {
  'registry.ts':
    'Floruxa registry. Pipeline file names are NOT listed here and most on disk are '
    + 'deprecated decoys. Pipelines are resolved ONLY via loader.ts (read it).',
};
for (const p of FPIPES) {
  FLOUNDER_CORPUS['loader.ts'] = (FLOUNDER_CORPUS['loader.ts'] ?? 'Floruxa loader — exactly one [ACTIVE] entry per pipeline; all others are [DECOY].\n')
    + `${p}: stage_${p}_legacy_a.ts [DECOY], stage_${p}_v1_a.ts [DECOY], `
    + `stage_${p}_a.ts [ACTIVE], stage_${p}_old_a.ts [DECOY], stage_${p}_tmp_a.ts [DECOY]\n`;
  // Decoys: plausible, circular, terminal-dead.
  for (const d of ['legacy', 'v1', 'old', 'tmp']) {
    FLOUNDER_CORPUS[`stage_${p}_${d}_a.ts`] =
      `Floruxa ${p} ${d} stage. DEPRECATED decoy. see also: stage_${p}_${d}_b.ts (also deprecated). not active.`;
    FLOUNDER_CORPUS[`stage_${p}_${d}_b.ts`] =
      `Floruxa ${p} ${d} stage. DEPRECATED decoy. dead end — not part of the active pipeline.`;
  }
  // The real ACTIVE chain (each step carries a dead "see also:" decoy).
  FLOUNDER_CORPUS[`stage_${p}_a.ts`] = `Floruxa ${p} stage 'PARSE' [ACTIVE]. next: stage_${p}_b.ts. see also: stage_${p}_legacy_a.ts (ignore — decoy).`;
  FLOUNDER_CORPUS[`stage_${p}_b.ts`] = `Floruxa ${p} stage 'NORMALIZE' [ACTIVE]. next: stage_${p}_c.ts. gate before next: gate_${p}_bc.ts. see also: stage_${p}_v1_b.ts (decoy).`;
  FLOUNDER_CORPUS[`gate_${p}_bc.ts`] = `Floruxa gate 'BC-${p.toUpperCase()}': blocks the B->C handoff.`;
  FLOUNDER_CORPUS[`stage_${p}_c.ts`] = `Floruxa ${p} stage 'ENRICH' [ACTIVE]. next: stage_${p}_d.ts. disabled by env FLUX_SKIP_${p.toUpperCase()} (see config_${p}.md). see also: stage_${p}_old_c.ts (decoy).`;
  FLOUNDER_CORPUS[`config_${p}.md`] = `FLUX_SKIP_${p.toUpperCase()}=1 disables ${p} stage ENRICH (stage_${p}_c.ts).`;
  FLOUNDER_CORPUS[`stage_${p}_d.ts`] = `Floruxa ${p} stage 'COMMIT' [ACTIVE]. terminal. emits flux.${p}.done`;
}

function flounderTask(pipe: typeof FPIPES[number]): TaskSpec {
  return {
    prompt:
      `Trace the Floruxa "${pipe}" pipeline end to end. Names are project-specific and `
      + `MOST files on disk are deprecated decoys — you MUST read the files to tell ACTIVE `
      + `from DECOY (do not guess). In your final answer: (1) list, IN ORDER, every ACTIVE `
      + `stage_${pipe}_*.ts file; (2) name the B→C gate file; (3) give the env var that `
      + `disables stage C.`,
    requiredFacts: [
      new RegExp(`stage_${pipe}_a\\.ts`, 'i'),
      new RegExp(`stage_${pipe}_b\\.ts`, 'i'),
      new RegExp(`gate_${pipe}_bc\\.ts|BC-${pipe.toUpperCase()}`, 'i'),
      new RegExp(`stage_${pipe}_c\\.ts`, 'i'),
      new RegExp(`FLUX_SKIP_${pipe.toUpperCase()}`, 'i'),
      new RegExp(`stage_${pipe}_d\\.ts`, 'i'),
    ],
  };
}

const FLOUNDER_FAMILIES: Family[] = [
  { id: 'L1-flounder-alpha→bravo',   a: flounderTask('alpha'),   b: flounderTask('bravo')   },
  { id: 'L2-flounder-charlie→alpha', a: flounderTask('charlie'), b: flounderTask('alpha')   },
  { id: 'L3-flounder-bravo→charlie', a: flounderTask('bravo'),   b: flounderTask('charlie') },
];

const ACTIVE_CORPUS = FLOUNDER ? FLOUNDER_CORPUS : CORPUS;
const ACTIVE_FAMILIES = FLOUNDER ? FLOUNDER_FAMILIES : FAMILIES;

// Powered pool (manifest §7): the 3 families repeated to N=20 (fixed order).
function pooledPairs(n: number): Family[] {
  const out: Family[] = [];
  for (let i = 0; i < n; i++) out.push(ACTIVE_FAMILIES[i % ACTIVE_FAMILIES.length]);
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
      for (const [p, body] of Object.entries(ACTIVE_CORPUS)) {
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
      return ACTIVE_CORPUS[p] ?? `Not found: ${p}. Known paths: ${Object.keys(ACTIVE_CORPUS).join(', ')}`;
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
  'You are a precise codebase investigation agent for the fictional, project-specific ' +
  '"Floruxa" subsystem. You CANNOT know its file, stage, gate, or env names from prior ' +
  'knowledge — they exist only in this repo. You MUST repo_read each file and follow its ' +
  '"next:" reference along the chain; never answer from assumption. If you have learned ' +
  'skills, call skill_lookup FIRST and follow the recipe to avoid re-discovering the ' +
  'structure. Cite the exact file paths you read. Only after reading the full chain, end ' +
  'with a final answer (no tool call) that explicitly states every required fact.';

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

/**
 * Faithful production R1: chat.ts computes planSkillDistillation AFTER
 * the task turn completes and surfaces .directive into a SUBSEQUENT
 * turn. We replay that — continue the same conversation (task → answer →
 * the real directive) with create_skill available. This is the turn
 * Pilots 1-3 never gave the model (single-turn loop ended at the answer).
 */
async function runDistillTurn(
  taskPrompt: string, priorAnswer: string, directive: string,
  skillDir: string, cost: CostTracker, key: string,
): Promise<void> {
  cost.checkBudget();
  const counter = { n: 0 };
  const resp = await runAgentLoop({
    litellmUrl: OPENROUTER_URL,
    litellmApiKey: key,
    model: MODEL,
    systemPrompt: BASE_SYSTEM + DISTILL_RULE,
    tools: makeTools(skillDir, true, counter),
    messages: [
      { role: 'user', content: taskPrompt },
      { role: 'assistant', content: priorAnswer },
      { role: 'user', content: directive },
    ],
    maxTurns: MAX_TURNS,
    maxTokenBudget: MAX_TOKEN_BUDGET_PER_RUN,
    onToolResult: () => { cost.checkBudget(); },
  });
  cost.addUsage(MODEL, resp.usage.inputTokens, resp.usage.outputTokens);
  cost.checkBudget();
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

  // Phase 1 — clean task_a measurement (NO distill rule in-turn; the
  // model just does the task and answers, exactly as in production).
  const distill = await runTask(fam.a, famSkillDir, false, cost, key);
  // The REAL shipped artifact decides if this turn earned a skill.
  const r1 = planSkillDistillation(Array(distill.toolCalls).fill('repo_grep'), distill.answer);
  if (!distill.pass) return { family: fam.id, counted: false, reason: `task_a grader-FAIL (tools=${distill.toolCalls}, r1=${r1 ? 'would-fire' : 'gated-off'})` };
  if (!r1) return { family: fam.id, counted: false, reason: `R1 correctly gated-off — task_a only ${distill.toolCalls} tools (<5); not a distill-worthy success` };
  // Phase 2 — faithful to production R1: the post-turn seam (chat.ts)
  // surfaces planSkillDistillation().directive into a SUBSEQUENT turn;
  // the model authors the skill there (NOT mid-task). Pilots 1-3's "no
  // skill authored" was this turn being absent — a harness artifact.
  await runDistillTurn(fam.a.prompt, distill.answer, r1.directive, famSkillDir, cost, key);
  const skillFiles = fs.readdirSync(famSkillDir).filter(f => f.endsWith('.md'));
  if (!skillFiles.length) return { family: fam.id, counted: false, reason: `model declined create_skill on the post-task distill turn (task_a ${distill.toolCalls} tools, R1 fired) — genuine model-behavior datum` };

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
  const cost = new CostTracker(MODEL_PRICING);
  cost.setBudget(cap, 'hard');

  const families = escalate ? pooledPairs(N) : ACTIVE_FAMILIES.slice(0, N);
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
    manifest: FLOUNDER
      ? 'docs/plans/LIVE-PREMIUM-VALIDATION-PREREG-2026-05-19.md @ d628120 (LPV-B floundering)'
      : 'docs/plans/HERMES-40-PREREG-2026-05-19.md @ a7b844a',
    startedAt, finishedAt: new Date().toISOString(), model: MODEL, escalatedRun: escalate,
    N, cap, abortedBudget, spendUsd: Number(dailyTotal.toFixed(4)), pricingAssumption: MODEL_PRICING,
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
