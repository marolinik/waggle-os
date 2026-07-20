import { execFile, execFileSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { isSensitiveFilePath } from '@waggle/core';

/** Image file extensions (binary, should not be read as text) */
export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

/** Denylist of dangerous binaries that must not appear anywhere in a bash command */
export const DENIED_BINARIES = [
  'powershell', 'pwsh', 'cmd.exe',   // shell escape
  'certutil',                          // Windows download/decode
  'bitsadmin',                         // Windows download
  'mshta',                             // Windows script host
  'regsvr32',                          // DLL registration
  'rundll32',                          // DLL execution
  'wscript', 'cscript',               // Windows Script Host
];

/** Representative secret names retained for compatibility and regression tests. */
export const SENSITIVE_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY',
  'DASHSCOPE_API_KEY',
  'MINIMAX_API_KEY',
  'ZHIPU_API_KEY',
  'MOONSHOT_API_KEY',
  'PERPLEXITY_API_KEY',
  'VOYAGE_API_KEY',
  'TAVILY_API_KEY',
  'BRAVE_API_KEY',
  'CLERK_SECRET_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'DATABASE_URL',
  'REDIS_URL',
];

/** Minimal non-secret process context required by local runtimes. */
const CHILD_ENV_ALLOWLIST = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432',
  'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM', 'TZ',
  'OS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'NUMBER_OF_PROCESSORS',
]);

/** Maximum output size per stream (stdout/stderr) in bytes — 1 MB */
export const MAX_OUTPUT_SIZE = 1024 * 1024;

/**
 * Check if a command contains any denied binary (case-insensitive).
 * Returns the matched binary name or null if the command is safe.
 */
export function checkDeniedBinaries(command: string): string | null {
  const lowerCmd = command.toLowerCase();
  for (const bin of DENIED_BINARIES) {
    if (lowerCmd.includes(bin)) {
      return bin;
    }
  }
  return null;
}

/**
 * Create a fail-closed child environment. Unknown variables are omitted so new
 * provider keys, run tokens, credential helpers, and infrastructure secrets do
 * not silently become available to model-invoked processes.
 */
export function createSanitizedEnv(): Record<string, string | undefined> {
  const sanitizedEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (CHILD_ENV_ALLOWLIST.has(key.toUpperCase())) sanitizedEnv[key] = value;
  }
  return sanitizedEnv;
}

/** Terminate a process and its descendants. Windows requires taskkill /T. */
export function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
      execFileSync(path.join(windowsRoot, 'System32', 'taskkill.exe'), [
        '/PID', String(child.pid), '/T', '/F',
      ], {
        env: createSanitizedEnv(),
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }
    child.kill('SIGTERM');
  } catch {
    try { child.kill('SIGKILL'); } catch { /* process already exited */ }
  }
}

export interface TimedProcessOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  maxBuffer: number;
  windowsHide?: boolean;
  windowsVerbatimArguments?: boolean;
}

export interface TimedProcessResult {
  cleanupDegraded: boolean;
  errorCode: string | number | null;
  errorMessage: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const WINDOWS_PROCESS_WORKER_SOURCE = String.raw`
void (async () => {
  const [{ parentPort, workerData }, { execFile, execFileSync }] = await Promise.all([
    import('node:worker_threads'),
    import('node:child_process'),
  ]);
  if (!parentPort) throw new Error('Windows process supervisor has no parent port');

  let child;
  let deadlineTimer;
  let outputDrainTimer;
  let settlementTimer;
  let processExited = false;
  let settled = false;
  let timedOut = false;
  let cleanupDegraded = false;
  let outputLimitError;
  const requestedMaxBuffer = Math.max(1, Number(workerData.options.maxBuffer) || 1024 * 1024);
  const outputState = {
    stdout: { chunks: [], capturedBytes: 0, totalBytes: 0 },
    stderr: { chunks: [], capturedBytes: 0, totalBytes: 0 },
  };

  const finish = (result) => {
    if (settled) return;
    settled = true;
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (outputDrainTimer) clearTimeout(outputDrainTimer);
    if (settlementTimer) clearTimeout(settlementTimer);
    parentPort.postMessage({ type: 'result', ...result });
  };

  const killOwnedProcess = () => {
    if (
      !child
      || child.pid === undefined
      || child.exitCode !== null
      || child.signalCode !== null
      || processExited
    ) return 'none';
    try {
      execFileSync(workerData.taskkillPath, [
        '/PID', String(child.pid), '/T', '/F',
      ], {
        env: workerData.options.env,
        stdio: 'ignore',
        timeout: 5000,
        windowsHide: true,
      });
      return 'tree';
    } catch {
      try {
        return child.kill('SIGKILL') ? 'root' : 'none';
      } catch {
        return 'none';
      }
    }
  };

  const capturedOutput = (streamName) => Buffer.concat(outputState[streamName].chunks).toString('utf8');

  const captureOutput = (streamName, chunk) => {
    const state = outputState[streamName];
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    state.totalBytes += buffer.length;
    const remaining = requestedMaxBuffer - state.capturedBytes;
    if (remaining > 0) {
      const captured = buffer.subarray(0, remaining);
      state.chunks.push(captured);
      state.capturedBytes += captured.length;
    }
    if (
      state.totalBytes <= requestedMaxBuffer
      || outputLimitError
      || processExited
      || settled
      || timedOut
    ) return;

    outputLimitError = {
      code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      message: streamName + ' maxBuffer length exceeded',
    };
    if (deadlineTimer) clearTimeout(deadlineTimer);
    const termination = killOwnedProcess();
    cleanupDegraded = termination !== 'tree';
    settlementTimer = setTimeout(() => {
      finish({
        cleanupDegraded,
        errorCode: outputLimitError.code,
        errorMessage: outputLimitError.message,
        stdout: capturedOutput('stdout'),
        stderr: capturedOutput('stderr'),
        timedOut: false,
      });
    }, 2000);
  };

  const recordNaturalExit = () => {
    if (processExited || timedOut || settled) return;
    processExited = true;
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (outputLimitError) return;
    outputDrainTimer = setTimeout(() => {
      finish({
        cleanupDegraded: false,
        errorCode: null,
        errorMessage: 'Process exited but its output streams did not close; descendant processes may still be running',
        stdout: '',
        stderr: '',
        timedOut: false,
      });
    }, 2000);
  };

  try {
    child = execFile(workerData.executable, workerData.args, {
      ...workerData.options,
      encoding: 'utf8',
      maxBuffer: requestedMaxBuffer * 2,
    }, (error) => {
      if (
        !outputLimitError
        && processExited
        && error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      ) return;
      finish({
        cleanupDegraded,
        errorCode: outputLimitError?.code ?? error?.code ?? null,
        errorMessage: outputLimitError?.message ?? (error ? error.message : null),
        stdout: capturedOutput('stdout'),
        stderr: capturedOutput('stderr'),
        timedOut,
      });
    });

    child.stdout?.on('data', (chunk) => captureOutput('stdout', chunk));
    child.stderr?.on('data', (chunk) => captureOutput('stderr', chunk));
    child.once('exit', recordNaturalExit);

    deadlineTimer = setTimeout(() => {
      if (settled || processExited || outputLimitError) return;
      if (child.exitCode !== null || child.signalCode !== null) {
        recordNaturalExit();
        return;
      }
      timedOut = true;
      const termination = killOwnedProcess();
      if (termination === 'none') {
        cleanupDegraded = true;
        settlementTimer = setTimeout(() => {
          finish({
            cleanupDegraded,
            errorCode: null,
            errorMessage: 'Process timeout could not be enforced',
            stdout: '',
            stderr: '',
            timedOut,
          });
        }, 1000);
        return;
      }
      cleanupDegraded = termination === 'root';
      settlementTimer = setTimeout(() => {
        finish({
          cleanupDegraded,
          errorCode: null,
          errorMessage: null,
          stdout: '',
          stderr: '',
          timedOut: true,
        });
      }, 2000);
    }, Math.max(0, workerData.timeoutMs));
  } catch (error) {
    const termination = child ? killOwnedProcess() : 'none';
    finish({
      cleanupDegraded: termination === 'root',
      errorCode: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      stdout: '',
      stderr: '',
      timedOut: false,
    });
  }
})().catch((error) => {
  void import('node:worker_threads').then(({ parentPort }) => {
    parentPort?.postMessage({
      type: 'result',
      cleanupDegraded: false,
      errorCode: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      stdout: '',
      stderr: '',
      timedOut: false,
    });
  });
});
`;

function execFileWithMainThreadTimeout(
  executable: string,
  args: string[],
  options: TimedProcessOptions,
  timeoutMs: number,
): Promise<TimedProcessResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    const timeoutState: {
      forceKillTimer?: ReturnType<typeof setTimeout>;
      timer?: ReturnType<typeof setTimeout>;
    } = {};
    const child = execFile(executable, args, {
      ...options,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (timeoutState.timer) clearTimeout(timeoutState.timer);
      if (timeoutState.forceKillTimer) clearTimeout(timeoutState.forceKillTimer);
      resolve({
        cleanupDegraded: false,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        stdout,
        stderr,
        timedOut,
      });
    });
    timeoutState.timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
      timeoutState.forceKillTimer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        try { child.kill('SIGKILL'); } catch { /* process already exited */ }
      }, 2000);
    }, timeoutMs);
  });
}

/**
 * Execute a foreground process with a wall-clock timeout. On Windows the
 * worker owns both the ChildProcess handle and its deadline, so process exit
 * and timeout are ordered independently of main-event-loop starvation.
 */
export function execFileWithTreeTimeout(
  executable: string,
  args: string[],
  options: TimedProcessOptions,
  timeoutMs: number,
): Promise<TimedProcessResult> {
  if (process.platform !== 'win32') {
    return execFileWithMainThreadTimeout(executable, args, options, timeoutMs);
  }

  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
  let worker: Worker;
  try {
    worker = new Worker(WINDOWS_PROCESS_WORKER_SOURCE, {
      eval: true,
      workerData: {
        args,
        executable,
        options,
        taskkillPath: path.join(windowsRoot, 'System32', 'taskkill.exe'),
        timeoutMs,
      },
    });
  } catch (error) {
    return Promise.resolve({
      cleanupDegraded: false,
      errorCode: null,
      errorMessage: `Windows process supervisor could not start: ${error instanceof Error ? error.message : String(error)}`,
      stdout: '',
      stderr: '',
      timedOut: false,
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TimedProcessResult) => {
      if (settled) return;
      settled = true;
      worker.removeAllListeners();
      void worker.terminate().catch(() => { /* worker already exited */ });
      resolve(result);
    };
    worker.once('message', (message: TimedProcessResult & { type?: string }) => {
      if (message.type !== 'result') return;
      finish(message);
    });
    worker.once('error', (error) => {
      finish({
        cleanupDegraded: false,
        errorCode: null,
        errorMessage: `Windows process supervisor failed: ${error.message}`,
        stdout: '',
        stderr: '',
        timedOut: false,
      });
    });
    worker.once('exit', (code) => {
      finish({
        cleanupDegraded: false,
        errorCode: null,
        errorMessage: `Windows process supervisor exited with code ${code} before reporting a result`,
        stdout: '',
        stderr: '',
        timedOut: false,
      });
    });
  });
}

/**
 * Truncate output to MAX_OUTPUT_SIZE, appending a warning if truncated.
 */
export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_SIZE) return output;
  return output.slice(0, MAX_OUTPUT_SIZE) + '\n[output truncated — exceeded 1 MB limit]';
}

/**
 * Resolve a relative path within a workspace, rejecting traversal outside it.
 * Returns the resolved absolute path or throws.
 */
export interface ResolveSafeOptions {
  /** Deny well-known secret material when the workspace is linked to user storage. */
  denySensitiveFiles?: boolean;
}

export class SensitiveFileAccessError extends Error {
  constructor() {
    super('Access to sensitive file denied');
    this.name = 'SensitiveFileAccessError';
  }
}

export function assertNonSensitiveFilePath(filePath: string): void {
  if (isSensitiveFilePath(filePath)) throw new SensitiveFileAccessError();
}

export function resolveSafe(
  workspace: string,
  filePath: string,
  options: ResolveSafeOptions = {},
): string {
  const workspaceRoot = path.resolve(workspace);
  const resolved = path.resolve(workspaceRoot, filePath);
  const relative = path.relative(workspaceRoot, resolved);
  const escapesLexically = relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative);
  if (escapesLexically) {
    throw new Error(`Path resolves outside workspace: ${filePath}`);
  }

  if (process.platform === 'win32' && relative.split(path.sep).some((part) => part.includes(':'))) {
    throw new Error(`NTFS alternate data streams are not allowed: ${filePath}`);
  }

  const realWorkspace = fs.realpathSync.native(workspaceRoot);
  let existingAncestor = resolved;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realAncestor = fs.realpathSync.native(existingAncestor);
  const realRelative = path.relative(realWorkspace, realAncestor);
  const escapesThroughLink = realRelative === '..'
    || realRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(realRelative);
  if (escapesThroughLink) {
    throw new Error(`Path resolves outside workspace through a link or junction: ${filePath}`);
  }

  if (options.denySensitiveFiles) {
    assertNonSensitiveFilePath(relative);
    assertNonSensitiveFilePath(path.relative(realWorkspace, realAncestor));
  }
  return resolved;
}
