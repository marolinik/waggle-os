/**
 * Waggle↔τ² MEMORY-ON live smoke — proves recall injects into the agent prompt
 * end-to-end against a live model (the memory-ON / B-arm path).
 *
 * Difference from run-waggle-smoke.ts (memory-OFF / B⁻): this builds a tiny
 * FROZEN retail mind via the production write path (buildAndFreezeMind) with a
 * REAL ollama-nomic embedder, then hands `mindPath` + that embedder to the
 * bridge. On the first user turn the bridge recalls the mind and appends the
 * "# Recalled Memories" block to the agent's systemPrompt. Watch stderr for:
 *     [bridge] memory-ON recall: session=... frames=N q="..."
 * frames>0 = recall injected. (Reward is still ~0 with a weak agent model —
 * this smoke proves the memory-in-prompt PLUMBING, not accuracy. The accuracy
 * signal comes from the priced paired pilot with qwen3.6/opus-4.8.)
 *
 * Run:  cd benchmarks/tau2 && npx tsx run-waggle-smoke-memon.ts
 * Prereqs: (1) ollama up on :11434 with `nomic-embed-text` pulled (1024-d),
 *          (2) bench proxy harness-litellm up on :4001 (gpt-5.2 + gpt-4o-mini).
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOllamaEmbedder } from '@waggle/core';
import { startWaggleBridge } from './bridge/waggle-bridge-server.ts';
import { buildAndFreezeMind, type PhaseAArtifact } from '../harness/src/continual/mind-build.ts';

const PROXY = process.env.WAGGLE_BENCH_PROXY ?? 'http://localhost:4001';
const KEY = process.env.WAGGLE_BENCH_KEY ?? 'sk-waggle-dev';
const AGENT_LLM = process.env.AGENT_LLM ?? 'gpt-4o-mini';      // cheap; plumbing only
const USER_LLM = process.env.USER_LLM ?? 'openai/gpt-5.2';
const NUM_TASKS = process.env.NUM_TASKS ?? '1';
const MAX_STEPS = process.env.MAX_STEPS ?? '15';
const RECALL_LIMIT = Number(process.env.RECALL_LIMIT ?? '10');

const here = fileURLToPath(new URL('.', import.meta.url));
const upstreamDir = fileURLToPath(new URL('./upstream', import.meta.url));
const wrapper = fileURLToPath(new URL('./run_waggle.py', import.meta.url));
const MIND_PATH = path.join(os.tmpdir(), 'waggle-memon-smoke.mind');

/** Re-derivable retail procedures (M1) + domain facts (M2). NO gold answers —
 *  generic policy/procedure the agent can apply to any retail task. */
const ARTIFACTS: PhaseAArtifact[] = [
  { task_id: 'seed-1', mechanism: 'M2', procedure_family: 'returns', recurring_user: null,
    content: 'Retail return policy: delivered items can be exchanged within 30 days; opened electronics carry a 10% restocking fee.' },
  { task_id: 'seed-2', mechanism: 'M1', procedure_family: 'exchange', recurring_user: null,
    content: 'To process an exchange: (1) find the user with find_user_id_by_name_zip, (2) read the order with get_order_details, (3) call exchange_delivered_order_items with the item_id and the new variant item_id.' },
  { task_id: 'seed-3', mechanism: 'M2', procedure_family: 'catalog', recurring_user: null,
    content: 'Product variants share a product but differ by item_id; use get_product_details to list a product’s variants and their item_ids before exchanging.' },
  { task_id: 'seed-4', mechanism: 'M1', procedure_family: 'identity', recurring_user: null,
    content: 'Always confirm the customer identity (full name + zip code) before reading or modifying any order.' },
];

async function main(): Promise<void> {
  console.log(`[memon] building tiny frozen retail mind → ${MIND_PATH}`);
  const embedder = createOllamaEmbedder();           // nomic, 1024-d — must match recall
  const built = await buildAndFreezeMind({
    artifacts: ARTIFACTS,
    goldStrings: [],
    outputPath: MIND_PATH,
    embedder,
    builderId: 'memon-smoke-builder',
  });
  console.log(`[memon] mind frozen: ${built.frameCount} frames, hash=${built.mindHash.slice(0, 12)} mechanisms=${JSON.stringify(built.mechanismCounts)}`);

  const bridge = await startWaggleBridge({
    port: 8088,
    litellmUrl: `${PROXY}/v1`,
    litellmApiKey: KEY,
    mindPath: MIND_PATH,         // ← memory-ON
    embedder,                    // same embedder as the frozen mind
    recallLimit: RECALL_LIMIT,
  });
  console.log(`[memon] bridge up at ${bridge.url} → proxy ${PROXY}/v1 (agent=${AGENT_LLM}, MEMORY-ON, recallLimit=${RECALL_LIMIT})`);

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
    '--save-to', 'waggle_smoke_retail_memon_v1',
  ];
  console.log(`[memon] spawn: uv ${argv.join(' ')}`);

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
    child.on('error', (e) => { console.error('[memon] spawn error', e); resolve(1); });
    child.on('close', (c) => resolve(c ?? 1));
  });

  await bridge.close();
  console.log(`[memon] done — tau2 exit ${code}. Look above for "[bridge] memory-ON recall: ... frames=N" (N>0 = recall injected).`);
  console.log(`[memon] results: ${upstreamDir}\\data\\simulations\\waggle_smoke_retail_memon_v1`);
  process.exit(code);
}

void main();
void here;
