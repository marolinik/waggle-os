/**
 * Waggle↔τ² live smoke — proves the bridge carries an agent turn end-to-end:
 *   τ² retail task → user-sim (gpt-5.2 via proxy) ⇄ waggle agent (runAgentLoop
 *   via the bridge → proxy) → τ² executes tools + scores reward.
 *
 * This is the first END-TO-END exercise of the bridge against a live model
 * (the unit tests use a fake runAgentLoop; the ruler used the stock agent).
 * Agent model = gpt-4o-mini (cheap; plumbing only — the real arms swap in
 * qwen3.6-35b-a3b / opus-4.8 / gpt-5.5). Memory is OFF here (no mind wired),
 * so this is effectively the B⁻ (memory-off) path — the simplest plumbing test.
 *
 * Run:  cd benchmarks/tau2 && npx tsx run-waggle-smoke.ts   (NUM_TASKS=1 default)
 * Prereq: bench proxy harness-litellm up on :4001 (gpt-5.2 + gpt-4o-mini routes).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startWaggleBridge } from './bridge/waggle-bridge-server.ts';

const PROXY = process.env.WAGGLE_BENCH_PROXY ?? 'http://localhost:4001';
const KEY = process.env.WAGGLE_BENCH_KEY ?? 'sk-waggle-dev';
const AGENT_LLM = process.env.AGENT_LLM ?? 'gpt-4o-mini';     // bare proxy model name
const USER_LLM = process.env.USER_LLM ?? 'openai/gpt-5.2';     // litellm-prefixed (tau2-side)
const NUM_TASKS = process.env.NUM_TASKS ?? '1';
const MAX_STEPS = process.env.MAX_STEPS ?? '15';

const here = fileURLToPath(new URL('.', import.meta.url));
const upstreamDir = fileURLToPath(new URL('./upstream', import.meta.url));
const wrapper = fileURLToPath(new URL('./run_waggle.py', import.meta.url));

async function main(): Promise<void> {
  const bridge = await startWaggleBridge({
    port: 8088,
    litellmUrl: `${PROXY}/v1`,           // runAgentLoop posts `${litellmUrl}/chat/completions`
    litellmApiKey: KEY,
  });
  console.log(`[smoke] bridge up at ${bridge.url} → proxy ${PROXY}/v1 (agent=${AGENT_LLM})`);

  const argv = [
    'run', 'python', wrapper, 'run',
    '--domain', 'retail',
    '--agent', 'waggle',
    '--agent-llm', AGENT_LLM,
    '--user-llm', USER_LLM, '--user-llm-args', '{"reasoning_effort":"low"}',
    '--num-tasks', NUM_TASKS,
    '--num-trials', '1',
    '--max-concurrency', '1',
    '--max-steps', MAX_STEPS,
    '--max-errors', '5',
    '--seed', '42',
    '--save-to', 'waggle_smoke_retail_v1',
  ];
  console.log(`[smoke] spawn: uv ${argv.join(' ')}`);

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

  const code: number = await new Promise((resolve) => {
    child.on('error', (e) => { console.error('[smoke] spawn error', e); resolve(1); });
    child.on('close', (c) => resolve(c ?? 1));
  });

  await bridge.close();
  console.log(`[smoke] done — tau2 exit ${code}. results: ${upstreamDir}\\data\\simulations\\waggle_smoke_retail_v1`);
  process.exit(code);
}

void main();
void here;
