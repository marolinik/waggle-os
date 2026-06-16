/**
 * τ²-bench `tau2 run` CLI argv builder + shell-out runner.
 *
 * Flag names verified against sierra-research/tau2-bench src/tau2/cli.py:
 *   --domain --agent --agent-llm --user-llm --num-trials --num-tasks
 *   --max-concurrency --save-to --max-steps --seed --task-ids
 *
 * The user simulator is itself an LLM. Per 01-DESIGN-SPEC §4.1 + 03 Confound,
 * it MUST be pinned IDENTICALLY across every arm (Qwen-agent vs Opus-agent),
 * else the user-sim becomes an uncontrolled variable. `userLlm` is therefore
 * required + non-empty; callers pass the SAME value to every arm and record it
 * in the manifest. Determinism: argv is a pure function of the spec.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface Tau2RunSpec {
  /** τ² domain: mock | retail | airline | telecom | banking_knowledge. */
  domain: string;
  /** Registered agent name (our custom agent registers as 'waggle'). */
  agent: string;
  /** LiteLLM model id for the AGENT (the system under test). */
  agentLlm: string;
  /** LiteLLM model id for the USER SIMULATOR. MUST be identical across arms. */
  userLlm: string;
  /** k for pass^k — τ² runs this many trials per task. Pre-register k. */
  numTrials: number;
  /** PRNG seed forwarded to τ². */
  seed: number;
  /** τ² results bucket name (saved under data/simulations/<saveTo>). */
  saveTo: string;
  /** Max agent steps per task. */
  maxSteps: number;
  /** Optional task cap (NOT recommended by τ² for leaderboard runs). */
  numTasks?: number;
  /** Optional explicit task id allowlist (joined with commas). */
  taskIds?: string[];
  /** Optional concurrency cap. Smoke runs pin this to 1. */
  maxConcurrency?: number;
}

export interface Tau2RunResult {
  /** Process exit code. */
  exitCode: number;
  /** Absolute path to the τ² results directory (data/simulations/<saveTo>). */
  resultsDir: string;
  /** Captured stdout + stderr (last 64KB) for forensic logging. */
  output: string;
}

export interface Tau2RunOptions {
  /** Working directory = the vendored τ² upstream tree. */
  upstreamDir: string;
  /** The τ² CLI launcher. Default ['tau2']; tests/CI may use
   *  ['uv', 'run', 'tau2'] or ['python', '-m', 'tau2']. */
  launcher?: string[];
  /** Env overlay (LITELLM_API_KEY, OPENAI_API_KEY, WAGGLE_TAU2_BRIDGE_URL …). */
  env?: NodeJS.ProcessEnv;
  /** Hard wall-clock timeout in ms. */
  timeoutMs?: number;
}

/** Build the exact `tau2 run ...` argv (without the launcher prefix). */
export function buildTau2RunArgv(spec: Tau2RunSpec): string[] {
  if (!spec.domain || spec.domain.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty domain');
  }
  if (!spec.agent || spec.agent.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty agent name');
  }
  if (!spec.agentLlm || spec.agentLlm.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty agentLlm');
  }
  if (!spec.userLlm || spec.userLlm.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty userLlm — the user simulator MUST be pinned identically across arms');
  }
  if (!Number.isInteger(spec.numTrials) || spec.numTrials < 1) {
    throw new Error(`tau2 run requires numTrials ≥ 1 (integer); got ${spec.numTrials}`);
  }
  if (!Number.isInteger(spec.seed)) {
    throw new Error(`tau2 run requires an integer seed; got ${spec.seed}`);
  }
  if (!Number.isInteger(spec.maxSteps) || spec.maxSteps < 1) {
    throw new Error(`tau2 run requires maxSteps ≥ 1 (integer); got ${spec.maxSteps}`);
  }
  if (!spec.saveTo || spec.saveTo.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty saveTo');
  }

  const argv: string[] = [
    'run',
    '--domain', spec.domain,
    '--agent', spec.agent,
    '--agent-llm', spec.agentLlm,
    '--user-llm', spec.userLlm,
    '--num-trials', String(spec.numTrials),
    '--seed', String(spec.seed),
    '--save-to', spec.saveTo,
    '--max-steps', String(spec.maxSteps),
  ];
  if (spec.numTasks !== undefined) {
    if (!Number.isInteger(spec.numTasks) || spec.numTasks < 1) {
      throw new Error(`tau2 run numTasks must be an integer ≥ 1; got ${spec.numTasks}`);
    }
    argv.push('--num-tasks', String(spec.numTasks));
  }
  if (spec.maxConcurrency !== undefined) {
    if (!Number.isInteger(spec.maxConcurrency) || spec.maxConcurrency < 1) {
      throw new Error(`tau2 run maxConcurrency must be an integer ≥ 1; got ${spec.maxConcurrency}`);
    }
    argv.push('--max-concurrency', String(spec.maxConcurrency));
  }
  if (spec.taskIds !== undefined && spec.taskIds.length > 0) {
    argv.push('--task-ids', spec.taskIds.join(','));
  }
  return argv;
}

/**
 * Resolve the τ² results dir for a given saveTo. τ² writes under
 * `<upstreamDir>/data/simulations/<saveTo>` (results.json[/ dir format]).
 */
export function resolveTau2ResultsDir(upstreamDir: string, saveTo: string): string {
  return path.join(upstreamDir, 'data', 'simulations', saveTo);
}

/** Shell out to `tau2 run`. Returns exit code + results dir + captured output.
 *  Never throws on a non-zero exit — the caller decides (a failed run still
 *  may have written partial results worth parsing). Throws only on spawn
 *  failure (launcher missing) so misconfiguration is loud. */
export function runTau2(spec: Tau2RunSpec, opts: Tau2RunOptions): Promise<Tau2RunResult> {
  const launcher = opts.launcher ?? ['tau2'];
  if (launcher.length === 0) {
    throw new Error('runTau2 requires a non-empty launcher (e.g. ["tau2"])');
  }
  if (!fs.existsSync(opts.upstreamDir)) {
    throw new Error(`runTau2 upstreamDir does not exist: ${opts.upstreamDir}`);
  }
  const argv = [...launcher.slice(1), ...buildTau2RunArgv(spec)];
  const cmd = launcher[0];
  const resultsDir = resolveTau2ResultsDir(opts.upstreamDir, spec.saveTo);

  return new Promise<Tau2RunResult>((resolve, reject) => {
    const child = spawn(cmd, argv, {
      cwd: opts.upstreamDir,
      env: { ...process.env, ...opts.env },
    });
    let buf = '';
    const append = (chunk: Buffer): void => {
      buf += chunk.toString('utf-8');
      if (buf.length > 64_000) buf = buf.slice(buf.length - 64_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
    }
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`runTau2 failed to spawn '${cmd}': ${err.message}`));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code ?? -1, resultsDir, output: buf });
    });
  });
}
