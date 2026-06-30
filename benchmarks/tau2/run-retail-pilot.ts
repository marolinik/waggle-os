/**
 * Retail conforming pilot — paired arms B / B⁻ / A / A⁻ on τ²-bench retail.
 *
 *   B⁻ = Qwen3.6-35B + memory-OFF      A⁻ = Opus 4.8 + memory-OFF
 *   B  = Qwen3.6-35B + memory-ON       A  = Opus 4.8 + memory-ON
 *
 * Mode-1 (02 §4.1): ONE byte-identical frozen mind (hand-authored neutral
 * retail M1/M2 artifacts) is shared by both memory-ON arms ⇒ the model is the
 * only variable between B and A. All four arms run the SAME first-N retail tasks
 * (--num-tasks N is deterministic; every task is held-out vs a hand-authored
 * mind, so no Phase-A run / split is needed at pilot scale — buildPhaseSplit +
 * the SHA'd stratified split are for the pre-registered full study).
 *
 * Per-arm signal:
 *   - accuracy: pass^1 from τ²'s DB-state reward (results.json),
 *   - efficiency: agent tokens / turns from the bridge (one bridge per arm),
 *   - cost: agent tokens × per-model price (the differentiating "Qwen+stack
 *     costs 1/N of Opus+stack" signal; the gpt-5.2 user-sim cost is identical
 *     across arms and excluded).
 *
 * Run (calibrate):  NUM_TASKS=2 npx tsx run-retail-pilot.ts
 * Run (full):       NUM_TASKS=40 npx tsx run-retail-pilot.ts
 * Subset:           ARMS=B-,B NUM_TASKS=2 npx tsx run-retail-pilot.ts
 * Prereqs: ollama :11434 (nomic-embed-text) + proxy :4001 (qwen3.6-35b-a3b,
 *          claude-opus-4-8, gpt-5.2 routes).
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOllamaEmbedder, type Embedder } from '@waggle/core';
import { buildAndFreezeMind } from '../harness/src/continual/mind-build.ts';
import { buildRetailTaskPool } from '../harness/src/continual/retail-pool-builder.ts';
import { RETAIL_PHASE_A_ARTIFACTS } from '../harness/src/continual/retail-phase-a-artifacts.ts';
import { startWaggleBridge } from './bridge/waggle-bridge-server.ts';

const PROXY = process.env.WAGGLE_BENCH_PROXY ?? 'http://localhost:4001';
const KEY = process.env.WAGGLE_BENCH_KEY ?? 'sk-waggle-dev';
const USER_LLM = process.env.USER_LLM ?? 'openai/gpt-5.2';
const USER_EFFORT = process.env.USER_EFFORT ?? 'low';
const N = Number(process.env.NUM_TASKS ?? '40');
const K = Number(process.env.K_TRIALS ?? '1');
const MAX_STEPS = Number(process.env.MAX_STEPS ?? '40') // 40: opus's chattier style needs more than 20 steps to finish retail tasks (calibrated); a lower cap truncates opus and fakes a qwen-beats-opus result;
const CONC = Number(process.env.MAX_CONCURRENCY ?? '3');
const SEED = Number(process.env.SEED ?? '42');
const ARMS_FILTER = process.env.ARMS; // optional CSV subset, e.g. "B-,B"
// Optional explicit task ids (space/comma-separated) — overrides --num-tasks so a
// SECOND batch can extend N without re-running (re-paying for) the first batch.
const TASK_ID_LIST = (process.env.TASK_IDS ?? '').trim()
  ? (process.env.TASK_IDS as string).trim().split(/[\s,]+/).filter(Boolean)
  : null;
const RUN_TAG = TASK_ID_LIST ? `ids${TASK_ID_LIST.length}b2` : `n${N}`;

/** Agent-model price per million tokens [input, output] (litellm-config /
 *  models.json working estimates; opus 4.8 = $5/$25, qwen3.6 dashscope ~ $0.2/$0.8). */
const PRICE: Record<string, [number, number]> = {
  'qwen3.6-35b-a3b': [0.20, 0.80],
  'claude-opus-4-8': [5.0, 25.0],
  'gpt-4o-mini': [0.15, 0.60],
};

interface Arm { id: string; model: string; memory: 'on' | 'off'; }
const ALL_ARMS: readonly Arm[] = [
  { id: 'B-', model: 'qwen3.6-35b-a3b', memory: 'off' },
  { id: 'B', model: 'qwen3.6-35b-a3b', memory: 'on' },
  { id: 'A-', model: 'claude-opus-4-8', memory: 'off' },
  { id: 'A', model: 'claude-opus-4-8', memory: 'on' },
];

const upstreamDir = fileURLToPath(new URL('./upstream', import.meta.url));
const wrapper = fileURLToPath(new URL('./run_waggle.py', import.meta.url));
const tasksJson = path.join(upstreamDir, 'data', 'tau2', 'domains', 'retail', 'tasks.json');
const MIND_PATH = path.join(os.tmpdir(), 'waggle-retail-pilot.mind');
const OUT_DIR = fileURLToPath(new URL('./results-retail-pilot', import.meta.url));

interface ArmResult {
  arm: string; model: string; memory: string; exit: number;
  sims: number; pass: number; passRate: number; infraErrors: number;
  agentInputTokens: number; agentOutputTokens: number; agentTurns: number; agentCostUsd: number;
}

function readPassRate(saveTo: string): { sims: number; pass: number; infra: number } {
  const p = path.join(upstreamDir, 'data', 'simulations', saveTo, 'results.json');
  if (!fs.existsSync(p)) return { sims: 0, pass: 0, infra: 0 };
  const r = JSON.parse(fs.readFileSync(p, 'utf-8')) as { simulations?: unknown[] };
  let pass = 0, infra = 0, counted = 0;
  for (const raw of r.simulations ?? []) {
    const s = raw as { termination_reason?: string; reward_info?: { reward?: number } };
    if (String(s.termination_reason ?? '').toLowerCase().includes('error')) { infra++; continue; }
    counted++;
    if ((s.reward_info?.reward ?? 0) >= 0.999) pass++;
  }
  return { sims: counted, pass, infra };
}

async function runArm(arm: Arm, embedder: Embedder): Promise<ArmResult> {
  const bridge = await startWaggleBridge({
    port: 0, litellmUrl: `${PROXY}/v1`, litellmApiKey: KEY,
    mindPath: arm.memory === 'on' ? MIND_PATH : undefined,
    embedder: arm.memory === 'on' ? embedder : undefined,
    recallLimit: 10,
  });
  const saveTo = `retail_pilot_${arm.id.replace('-', 'm')}_${RUN_TAG}k${K}`;
  // Clear any prior run for this arm so τ² doesn't block on an interactive
  // "resume the run?" prompt (no stdin under spawn → EOFError).
  fs.rmSync(path.join(upstreamDir, 'data', 'simulations', saveTo), { recursive: true, force: true });
  const argv = [
    'run', 'python', wrapper, 'run',
    '--domain', 'retail', '--agent', 'waggle',
    '--agent-llm', arm.model,
    '--user-llm', USER_LLM, '--user-llm-args', `{"reasoning_effort":"${USER_EFFORT}"}`,
    ...(TASK_ID_LIST ? ['--task-ids', ...TASK_ID_LIST] : ['--num-tasks', String(N)]),
    '--num-trials', String(K),
    '--max-concurrency', String(CONC), '--max-steps', String(MAX_STEPS),
    '--max-errors', '10', '--seed', String(SEED), '--save-to', saveTo,
  ];
  console.log(`\n[pilot ${arm.id}] ${arm.model} memory=${arm.memory} bridge=${bridge.url} → ${saveTo}`);
  const child = spawn('uv', argv, {
    cwd: upstreamDir,
    env: {
      ...process.env,
      OPENAI_API_BASE: PROXY, OPENAI_BASE_URL: PROXY, OPENAI_API_KEY: KEY,
      WAGGLE_TAU2_BRIDGE_URL: bridge.url,
      PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', NO_COLOR: '1', TERM: 'dumb',
    },
    stdio: 'inherit',
  });
  const exit = await new Promise<number>((res) => {
    child.on('error', (e) => { console.error(`[pilot ${arm.id}] spawn error`, e); res(1); });
    child.on('close', (c) => res(c ?? 1));
  });
  const stats = bridge.stats();
  await bridge.close();
  const pr = readPassRate(saveTo);
  const [pin, pout] = PRICE[arm.model] ?? [0, 0];
  const agentCostUsd = Number(((stats.inputTokens / 1e6) * pin + (stats.outputTokens / 1e6) * pout).toFixed(4));
  const result: ArmResult = {
    arm: arm.id, model: arm.model, memory: arm.memory, exit,
    sims: pr.sims, pass: pr.pass, passRate: pr.sims ? pr.pass / pr.sims : 0, infraErrors: pr.infra,
    agentInputTokens: stats.inputTokens, agentOutputTokens: stats.outputTokens, agentTurns: stats.turns, agentCostUsd,
  };
  console.log(`[pilot ${arm.id}] pass^1=${(result.passRate * 100).toFixed(1)}% (${pr.pass}/${pr.sims}) infra=${pr.infra} turns=${stats.turns} agentCost=$${agentCostUsd}`);
  return result;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Golds for the firewall: no task's gold may appear in the frozen mind.
  const pool = buildRetailTaskPool({ tasksJsonPath: tasksJson });
  const golds = pool.map(t => t.gold);
  const embedder = createOllamaEmbedder();
  console.log(`[pilot] freezing Mode-1 mind: ${RETAIL_PHASE_A_ARTIFACTS.length} artifacts vs ${golds.length}-gold firewall`);
  const mind = await buildAndFreezeMind({
    artifacts: [...RETAIL_PHASE_A_ARTIFACTS], goldStrings: golds,
    outputPath: MIND_PATH, embedder, builderId: 'retail-pilot-neutral-v1',
  });
  console.log(`[pilot] mind frozen: frames=${mind.frameCount} hash=${mind.mindHash.slice(0, 12)} mechanisms=${JSON.stringify(mind.mechanismCounts)}`);

  const arms = ARMS_FILTER ? ALL_ARMS.filter(a => ARMS_FILTER.split(',').includes(a.id)) : [...ALL_ARMS];
  const results: ArmResult[] = [];
  for (const arm of arms) results.push(await runArm(arm, embedder));

  const summary = {
    config: { N, K, USER_LLM, USER_EFFORT, MAX_STEPS, CONC, SEED, mindHash: mind.mindHash, mindFrames: mind.frameCount },
    arms: results,
  };
  const outPath = path.join(OUT_DIR, `summary_${RUN_TAG}k${K}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\n[pilot] ===== SUMMARY (N=${N} k=${K}, user-sim=${USER_LLM}/${USER_EFFORT}) =====`);
  for (const r of results) {
    console.log(`  ${r.arm.padEnd(3)} ${r.model.padEnd(20)} mem=${r.memory.padEnd(3)} pass^1=${(r.passRate * 100).toFixed(1).padStart(5)}% turns=${String(r.agentTurns).padStart(4)} agentCost=$${r.agentCostUsd}`);
  }
  console.log(`[pilot] summary → ${outPath}`);
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
