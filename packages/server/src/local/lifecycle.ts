import { spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSidecarOwnedProcess } from '@waggle/agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LiteLLMStatus {
  status: 'running' | 'started' | 'timeout' | 'error';
  port: number;
  error?: string;
}

const DEFAULT_PORT = 4000;
const HEALTH_POLL_INTERVAL = 1000;
// 819-model runtime configs take >30s to boot uvicorn on a Windows cold
// start; 30 polls killed healthy children mid-startup.
const HEALTH_POLL_MAX = 120;

let litellmProcess: ChildProcess | null = null;
const litellmStopRequests = new WeakSet<ChildProcess>();

async function stopOwnedLiteLLMProcess(
  child: ChildProcess,
  timeoutMs = 6_500,
): Promise<void> {
  const assertCleanExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Error | undefined => {
    if (code === 0 && signal === null) return undefined;
    return new Error(
      `Sidecar-owned LiteLLM supervisor did not confirm cleanup (code=${String(code)}, signal=${String(signal)})`,
    );
  };
  if (child.exitCode !== null || child.signalCode !== null) {
    const error = assertCleanExit(child.exitCode, child.signalCode);
    if (error) throw error;
    return;
  }
  await new Promise<void>((resolveStop, rejectStop) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      if (error) rejectStop(error);
      else resolveStop();
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(assertCleanExit(code, signal));
    };
    const onError = (error: Error): void => finish(error);
    const timer = setTimeout(
      () => finish(new Error('Timed out while stopping the sidecar-owned LiteLLM process tree')),
      timeoutMs,
    );
    timer.unref();
    child.once('exit', onExit);
    child.once('error', onError);

    if (child.exitCode !== null || child.signalCode !== null) {
      finish(assertCleanExit(child.exitCode, child.signalCode));
      return;
    }
    if (!child.connected || typeof child.send !== 'function') return;
    try {
      child.send('shutdown', (error) => {
        if (error) finish(error);
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Look for a bundled Python executable in the app's resources directory.
 * On an installed Tauri app the layout is:
 *   {exe_dir}/resources/python/python.exe
 * During development we also check relative to this source file:
 *   app/src-tauri/resources/python/python.exe
 *
 * Returns the absolute path if found, otherwise null (falls back to system PATH).
 */
export function getBundledPythonPath(): string | null {
  // Installed app: next to the running executable
  const exeDir = path.dirname(process.execPath);
  const installedPath = path.join(exeDir, 'resources', 'python', 'python.exe');
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // Development: relative to this file → ../../app/src-tauri/resources
  const devPath = path.resolve(__dirname, '..', '..', '..', 'app', 'src-tauri', 'resources', 'python', 'python.exe');
  if (existsSync(devPath)) {
    return devPath;
  }

  return null;
}

export function selectLiteLLMPython(
  candidates: readonly string[],
  supportsLiteLLM: (pythonBin: string) => boolean,
): string | null {
  const seen = new Set<string>();
  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.trim();
    if (!candidate) continue;
    const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) continue;
    seen.add(key);
    if (supportsLiteLLM(candidate)) return candidate;
  }
  return null;
}

function discoverSystemPythonPaths(): string[] {
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const args = process.platform === 'win32'
    ? ['python']
    : ['-a', 'python3', 'python'];
  const fallback = process.platform === 'win32'
    ? ['python']
    : ['python3', 'python'];

  try {
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      timeout: 5_000,
      windowsHide: true,
    });
    const output: string = result.stdout ?? '';
    const discovered = output
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    return discovered.length > 0 ? discovered : fallback;
  } catch {
    return fallback;
  }
}

function canImportLiteLLM(pythonBin: string): boolean {
  const probeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONIOENCODING: 'utf-8',
  };
  delete probeEnv['DATABASE_URL'];
  delete probeEnv['REDIS_URL'];

  const result = spawnSync(
    pythonBin,
    ['-c', 'import litellm.proxy.proxy_cli'],
    {
      env: probeEnv,
      stdio: 'ignore',
      timeout: 10_000,
      windowsHide: true,
    },
  );
  return result.status === 0 && !result.error;
}

export function resolveLiteLLMPython(): string | null {
  const bundledPython = getBundledPythonPath();
  const candidates = [
    ...(bundledPython ? [bundledPython] : []),
    ...discoverSystemPythonPaths(),
  ];
  return selectLiteLLMPython(candidates, canImportLiteLLM);
}

async function checkHealth(port: number): Promise<boolean> {
  try {
    // /health/liveliness: unauthenticated process-liveness probe. The bare
    // /health endpoint requires the master key and calls every configured
    // provider, so polling it reports 401/slow forever.
    const res = await fetch(`http://localhost:${port}/health/liveliness`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check LiteLLM health status without starting it.
 */
export async function getLiteLLMStatus(port?: number): Promise<LiteLLMStatus> {
  const p = port ?? DEFAULT_PORT;
  const healthy = await checkHealth(p);
  if (healthy) {
    return { status: 'running', port: p };
  }
  return { status: 'error', port: p, error: 'LiteLLM is not running' };
}

/**
 * Start LiteLLM proxy. If already running, returns immediately.
 * Otherwise spawns `python -m litellm.proxy.proxy_cli --port {port}` and polls health.
 * Prefers a compatible bundled Python, then probes every Python on system PATH.
 */
export async function startLiteLLM(port?: number, configPath?: string): Promise<LiteLLMStatus> {
  const p = port ?? DEFAULT_PORT;

  if (litellmProcess && litellmStopRequests.has(litellmProcess)) {
    return {
      status: 'error',
      port: p,
      error: 'Previous LiteLLM process-tree cleanup is not confirmed',
    };
  }
  // Already running?
  if (await checkHealth(p)) {
    return { status: 'running', port: p };
  }
  if (litellmProcess) {
    return {
      status: 'error',
      port: p,
      error: 'LiteLLM is already starting under sidecar ownership',
    };
  }

  const pythonBin = resolveLiteLLMPython();
  if (!pythonBin) {
    return {
      status: 'error',
      port: p,
      error: 'No Python interpreter with litellm.proxy.proxy_cli installed was found',
    };
  }

  // Spawn LiteLLM
  let child: ChildProcess;
  try {
    // litellm ships no __main__ module (`python -m litellm` fails); the
    // console-script entry point is litellm.proxy.proxy_cli.
    const args = ['-m', 'litellm.proxy.proxy_cli'];
    if (configPath) args.push('--config', configPath);
    args.push('--port', String(p));
    // Managed LiteLLM runs stateless (in-memory master key). Inheriting the
    // sidecar's DATABASE_URL/REDIS_URL flips it into DB mode, which exits
    // with code 3 at startup when prisma isn't installed. LiteLLM ALSO
    // dotenv-loads .env from its cwd, so the child must not run from the
    // repo root either — anchor it to the config's directory instead.
    const { DATABASE_URL: _db, REDIS_URL: _redis, ...childEnv } = process.env;
    // Capture child output for post-mortems — silent exits (bad env, missing
    // deps) are undiagnosable with stdio: 'ignore'.
    const runDir = configPath ? path.dirname(configPath) : os.homedir();
    const logFd = openSync(path.join(runDir, 'litellm.child.log'), 'a');
    child = spawnSidecarOwnedProcess(pythonBin, args, {
      cwd: runDir,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
      env: {
        ...childEnv,
        // F3 fix: Prevent UnicodeEncodeError on Windows cp1252 during
        // LiteLLM startup banner (Python defaults to the system code page)
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });
    litellmProcess = child;

    // Handle spawn errors
    child.on('error', () => {
      if (litellmProcess === child && !litellmStopRequests.has(child)) {
        litellmProcess = null;
      }
    });
    child.once('exit', () => {
      if (litellmProcess === child && !litellmStopRequests.has(child)) {
        litellmProcess = null;
      }
    });
  } catch (err) {
    return {
      status: 'error',
      port: p,
      error: `Failed to spawn LiteLLM: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Poll health check
  for (let i = 0; i < HEALTH_POLL_MAX; i++) {
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL));
    if (await checkHealth(p)) {
      return { status: 'started', port: p };
    }
    // If process exited, stop polling
    if (child.exitCode !== null) {
      if (litellmProcess === child && !litellmStopRequests.has(child)) {
        litellmProcess = null;
      }
      return {
        status: 'error',
        port: p,
        error: `LiteLLM exited with code ${child.exitCode}`,
      };
    }
  }

  // Timed out — require the supervisor to confirm process-tree cleanup.
  litellmStopRequests.add(child);
  try {
    await stopOwnedLiteLLMProcess(child);
  } catch (error) {
    return {
      status: 'error',
      port: p,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (litellmProcess === child) litellmProcess = null;
  return { status: 'timeout', port: p };
}

/**
 * Stop the spawned LiteLLM process, if any.
 */
export async function stopLiteLLM(): Promise<void> {
  const child = litellmProcess;
  if (!child) return;
  litellmStopRequests.add(child);
  await stopOwnedLiteLLMProcess(child);
  if (litellmProcess === child) litellmProcess = null;
}
