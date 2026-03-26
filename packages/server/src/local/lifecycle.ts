import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
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
const HEALTH_POLL_MAX = 30;

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
    const res = await fetch(`http://localhost:${port}/health`);
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
 * Otherwise spawns `python -m litellm --port {port}` and polls health.
 * Prefers the bundled Python from app resources; falls back to system PATH.
 */
export async function startLiteLLM(port?: number): Promise<LiteLLMStatus> {
  const p = port ?? DEFAULT_PORT;

  // Already running?
  if (await checkHealth(p)) {
    return { status: 'running', port: p };
  }

  // Prefer bundled Python, fall back to system 'python'
  const pythonBin = getBundledPythonPath() ?? 'python';

  // Spawn LiteLLM
  try {
    litellmProcess = spawn(pythonBin, ['-m', 'litellm', '--port', String(p)], {
      stdio: 'ignore',
      detached: false,
      env: {
        ...process.env,
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
