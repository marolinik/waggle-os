import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Prefers the bundled Python from app resources; falls back to system PATH.
 */
export async function startLiteLLM(port?: number, configPath?: string): Promise<LiteLLMStatus> {
  const p = port ?? DEFAULT_PORT;

  // Already running?
  if (await checkHealth(p)) {
    return { status: 'running', port: p };
  }

  // Prefer bundled Python, fall back to system 'python'
  const pythonBin = getBundledPythonPath() ?? 'python';

  // Spawn LiteLLM
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
    litellmProcess = spawn(pythonBin, args, {
      cwd: runDir,
      stdio: ['ignore', logFd, logFd],
      detached: false,
      env: {
        ...childEnv,
        // F3 fix: Prevent UnicodeEncodeError on Windows cp1252 during
        // LiteLLM startup banner (Python defaults to the system code page)
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });

    // Handle spawn errors
    litellmProcess.on('error', () => {
      litellmProcess = null;
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
    if (litellmProcess && litellmProcess.exitCode !== null) {
      return {
        status: 'error',
        port: p,
        error: `LiteLLM exited with code ${litellmProcess.exitCode}`,
      };
    }
  }

  // Timed out — kill process
  if (litellmProcess) {
    litellmProcess.kill();
    litellmProcess = null;
  }
  return { status: 'timeout', port: p };
}

/**
 * Stop the spawned LiteLLM process, if any.
 */
export async function stopLiteLLM(): Promise<void> {
  if (litellmProcess) {
    litellmProcess.kill();
    litellmProcess = null;
  }
}
