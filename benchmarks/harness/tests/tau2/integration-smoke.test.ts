import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startWaggleBridge, type BridgeRunAgentLoopFn } from '../../../tau2/bridge/waggle-bridge-server.js';
import { runTau2, resolveTau2ResultsDir, type Tau2RunSpec } from '../../src/tau2/tau2-cli.js';
import { loadTau2ResultsFile, computeTaskOutcomes } from '../../src/tau2/tau2-results.js';
import { writeTau2Jsonl, type Tau2EmitContext } from '../../src/tau2/tau2-emit.js';
import { resolveUpstreamDir } from '../../src/tau2/vendor-pin.js';
import type { AgentResponse } from '@waggle/agent';
import url from 'node:url';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..', '..');
const UPSTREAM = resolveUpstreamDir(HARNESS_ROOT);

const LIVE = process.env.WAGGLE_TAU2_LIVE === '1';
const LAUNCHER = (process.env.WAGGLE_TAU2_LAUNCHER ?? 'tau2').split(' ');
const USER_LLM = process.env.WAGGLE_TAU2_USER_LLM ?? 'gpt-4.1';

// Deterministic stub: always emits a benign final message. The mock domain's
// oracle will likely score 0 — that's fine; the smoke proves the PLUMBING
// (run → results.json → parse → emit), not task success.
const stubAgent: BridgeRunAgentLoopFn = async (_cfg): Promise<AgentResponse> => ({
  content: 'I have completed the requested action.',
  toolsUsed: [],
  usage: { inputTokens: 5, outputTokens: 5 },
});

describe('τ² integration smoke (mock domain)', () => {
  it('runs end-to-end: bridge → tau2 run → parse → emit', async () => {
    if (!LIVE || !fs.existsSync(UPSTREAM)) {
      // Not a live τ² environment — covered by unit tests. Skip cleanly.
      expect(true).toBe(true);
      return;
    }

    const bridge = await startWaggleBridge({
      port: 8088, runAgentLoopFn: stubAgent,
      litellmUrl: process.env.LITELLM_URL ?? 'http://localhost:4000',
      litellmApiKey: process.env.LITELLM_API_KEY ?? 'sk-waggle-dev',
    });
    try {
      const saveTo = `smoke_${Date.now()}`;
      const spec: Tau2RunSpec = {
        domain: 'mock', agent: 'waggle', agentLlm: 'stub',
        userLlm: USER_LLM, numTrials: 1, seed: 42, saveTo,
        maxSteps: 2, numTasks: 1, maxConcurrency: 1,
      };
      const run = await runTau2(spec, {
        upstreamDir: UPSTREAM,
        launcher: LAUNCHER,
        timeoutMs: 180_000,
        env: {
          WAGGLE_TAU2_BRIDGE_URL: bridge.url,
          // τ² imports our agent via the registration module on PYTHONPATH.
          PYTHONPATH: path.join(HARNESS_ROOT, '..', 'tau2', 'agent'),
        },
      });
      // tau2 may exit non-zero if the oracle fails the task; we still expect a
      // results file to have been written.
      expect(typeof run.exitCode).toBe('number');
      const resultsDir = resolveTau2ResultsDir(UPSTREAM, saveTo);
      // τ² writes results.json (file) or a dir; find the file.
      const candidate = fs.existsSync(path.join(resultsDir, 'results.json'))
        ? path.join(resultsDir, 'results.json')
        : (fs.existsSync(`${resultsDir}.json`) ? `${resultsDir}.json` : resultsDir);
      expect(fs.existsSync(candidate)).toBe(true);

      const results = loadTau2ResultsFile(candidate);
      const outcomes = computeTaskOutcomes(results);
      expect(outcomes.length).toBeGreaterThanOrEqual(1);
      expect(outcomes[0].k).toBe(1);
      expect(typeof outcomes[0].pass1).toBe('number');

      const ctx: Tau2EmitContext = {
        domain: 'mock', agentModelId: 'stub', userSimModelId: USER_LLM,
        seed: 42, arm: 'smoke', memory: 'off', manifestHash: '0'.repeat(64),
      };
      const out = path.join(os.tmpdir(), `${saveTo}.jsonl`);
      const n = writeTau2Jsonl(outcomes, ctx, out);
      expect(n).toBe(outcomes.length);
      const lines = fs.readFileSync(out, 'utf-8').split('\n').filter(l => l.trim());
      expect(JSON.parse(lines[0]).substrate).toBe('tau2');
      fs.rmSync(out, { force: true });
    } finally {
      await bridge.close();
    }
  }, 200_000);
});
