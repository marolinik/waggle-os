import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
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

/** Dispatch termination for a process and its descendants. */
export function terminateProcessTree(
  child: ChildProcess,
  taskkillTimeoutMs = 5_000,
): boolean {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  if (!child.pid) return false;
  try {
    if (process.platform === 'win32') {
      const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
      execFileSync(path.join(windowsRoot, 'System32', 'taskkill.exe'), [
        '/PID', String(child.pid), '/T', '/F',
      ], {
        env: createSanitizedEnv(),
        stdio: 'ignore',
        windowsHide: true,
        timeout: taskkillTimeoutMs,
      });
      return true;
    }
    return child.kill('SIGTERM');
  } catch {
    // Preserve best-effort parent cleanup for legacy callers, but do not count
    // it as proof that the Windows process tree settled.
    if (process.platform === 'win32') {
      try { child.kill('SIGKILL'); } catch { /* process may already be gone */ }
      return child.exitCode !== null || child.signalCode !== null;
    }
    try {
      return child.kill('SIGKILL');
    } catch {
      return child.exitCode !== null || child.signalCode !== null;
    }
  }
}

/** Terminate a real child and confirm that it actually settled. */
export async function terminateProcessTreeAndWait(
  child: ChildProcess,
  timeoutMs = 5_000,
): Promise<boolean> {
  const hasExited = () => child.exitCode !== null || child.signalCode !== null;
  if (hasExited()) return true;
  if (!child.pid) return false;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;

    const onExit = () => finish(true);
    const finish = (confirmed: boolean) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(confirmed);
    };

    child.once('exit', onExit);
    if (hasExited()) {
      finish(true);
      return;
    }

    const dispatched = terminateProcessTree(child, timeoutMs);
    if (finished) return;
    if (!dispatched || hasExited()) {
      finish(hasExited());
      return;
    }

    const remainingMs = Math.max(0, timeoutMs - (Date.now() - startedAt));
    if (remainingMs === 0) {
      finish(hasExited());
      return;
    }

    if (process.platform === 'win32') {
      timer = setTimeout(() => finish(hasExited()), remainingMs);
      return;
    }

    const gracefulWaitMs = Math.max(1, Math.floor(remainingMs / 2));
    timer = setTimeout(() => {
      if (hasExited()) {
        finish(true);
        return;
      }

      let forceDispatched = false;
      try {
        forceDispatched = child.kill('SIGKILL');
      } catch {
        forceDispatched = false;
      }
      if (finished) return;
      if (!forceDispatched && !hasExited()) {
        finish(false);
        return;
      }
      timer = setTimeout(
        () => finish(hasExited()),
        Math.max(1, remainingMs - gracefulWaitMs),
      );
    }, gracefulWaitMs);
  });
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

const POSIX_PROCESS_SUPERVISOR_SOURCE = String.raw`
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');

const report = (message) => {
  try { fs.writeSync(3, JSON.stringify(message) + '\n'); } catch { /* parent may already be gone */ }
};

const deadlineAt = Number(process.argv[1]);
const executable = process.argv[2];
const args = process.argv.slice(3);
let deadlineTimer;
let managed;
let spawnFailed = false;
let timedOut = false;

const groupMembersRemain = () => {
  const listing = execFileSync('/bin/sh', [
    '-c',
    'printf "%s\\n" "$$"; exec ps -A -o pid= -o pgid=',
  ], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 1000,
  });
  const lines = listing.trim().split(/\r?\n/);
  const probePid = Number(lines.shift());
  return lines.some((line) => {
    const [pidText, pgidText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const pgid = Number(pgidText);
    return pgid === process.pid && pid !== process.pid && pid !== probePid;
  });
};

const enforceTimeout = () => {
  timedOut = true;
  report({ type: 'timeout' });
  try {
    process.kill(-process.pid, 'SIGKILL');
  } catch {
    try { managed?.kill('SIGKILL'); } catch { /* managed root may already be gone */ }
    process.exitCode = 124;
  }
};

try {
  managed = spawn(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const remainingMs = Number.isFinite(deadlineAt) ? Math.max(0, deadlineAt - Date.now()) : 0;
  deadlineTimer = setTimeout(enforceTimeout, remainingMs);
} catch (error) {
  report({ type: 'spawn-error', code: error?.code ?? null, message: error?.message ?? String(error) });
  process.exitCode = 1;
}

if (managed) {
  managed.stdout.pipe(process.stdout);
  managed.stderr.pipe(process.stderr);
  managed.once('error', (error) => {
    spawnFailed = true;
    report({ type: 'spawn-error', code: error.code ?? null, message: error.message });
    process.exitCode = 1;
  });
  managed.once('close', (code) => {
    if (timedOut) {
      process.exitCode = 124;
      return;
    }
    const managedExitCode = spawnFailed ? 1 : (typeof code === 'number' ? code : 1);
    const waitForGroupToSettle = () => {
      let membersRemain;
      try {
        membersRemain = groupMembersRemain();
      } catch (error) {
        report({ type: 'group-probe-failed', message: error?.message ?? String(error) });
        return;
      }
      if (membersRemain) {
        setTimeout(waitForGroupToSettle, 100);
        return;
      }
      if (deadlineTimer) clearTimeout(deadlineTimer);
      process.exitCode = managedExitCode;
    };
    waitForGroupToSettle();
  });
}
`;

function execFileWithMainThreadTimeout(
  executable: string,
  args: string[],
  options: TimedProcessOptions,
  timeoutMs: number,
): Promise<TimedProcessResult> {
  return new Promise((resolve) => {
    const requestedMaxBuffer = Math.max(1, options.maxBuffer);
    const outputState = {
      stdout: { chunks: [] as Buffer[], capturedBytes: 0, totalBytes: 0 },
      stderr: { chunks: [] as Buffer[], capturedBytes: 0, totalBytes: 0 },
    };
    const { maxBuffer: _maxBuffer, ...spawnOptions } = options;
    const child = spawn(process.execPath, [
      '-e',
      POSIX_PROCESS_SUPERVISOR_SOURCE,
      String(Date.now() + Math.max(0, timeoutMs)),
      executable,
      ...args,
    ], {
      ...spawnOptions,
      // The supervisor stays alive as the owned POSIX process-group leader
      // until the managed command and every inherited output pipe settle.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });

    let cleanupDegraded = false;
    let managedSpawnError: { code: string | number | null; message: string } | undefined;
    let outputLimitError: { code: string; message: string } | undefined;
    let processExited = false;
    let settled = false;
    let timedOut = false;
    const timeoutState: {
      settlementTimer?: ReturnType<typeof setTimeout>;
    } = {};

    const capturedOutput = (streamName: 'stdout' | 'stderr') => (
      Buffer.concat(outputState[streamName].chunks).toString('utf8')
    );
    const finish = (
      errorCode: string | number | null,
      errorMessage: string | null,
      includeOutput = true,
    ) => {
      if (settled) return;
      settled = true;
      if (timeoutState.settlementTimer) clearTimeout(timeoutState.settlementTimer);
      resolve({
        cleanupDegraded,
        errorCode,
        errorMessage,
        stdout: includeOutput ? capturedOutput('stdout') : '',
        stderr: includeOutput ? capturedOutput('stderr') : '',
        timedOut,
      });
    };
    const killOwnedProcessGroup = (): 'tree' | 'root' | 'none' => {
      if (processExited || child.exitCode !== null || child.signalCode !== null) return 'none';
      const pid = child.pid;
      if (pid && pid > 0 && pid !== process.pid) {
        try {
          process.kill(-pid, 'SIGKILL');
          return 'tree';
        } catch {
          // The process group may already have settled; try the root handle.
        }
      }
      try {
        return child.kill('SIGKILL') ? 'root' : 'none';
      } catch {
        return 'none';
      }
    };
    const finishIfStreamsDoNotClose = (errorMessage: string | null) => {
      if (timeoutState.settlementTimer) clearTimeout(timeoutState.settlementTimer);
      timeoutState.settlementTimer = setTimeout(() => {
        cleanupDegraded = true;
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(outputLimitError?.code ?? null, outputLimitError?.message ?? errorMessage);
      }, 2000);
    };
    const captureOutput = (streamName: 'stdout' | 'stderr', chunk: Buffer) => {
      const state = outputState[streamName];
      state.totalBytes += chunk.length;
      const remaining = requestedMaxBuffer - state.capturedBytes;
      if (remaining > 0) {
        const captured = chunk.subarray(0, remaining);
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
        message: `${streamName} maxBuffer length exceeded`,
      };
      killOwnedProcessGroup();
      cleanupDegraded = true;
      finishIfStreamsDoNotClose(null);
    };

    let controlBuffer = '';
    child.stdio[3]?.on('data', (chunk: Buffer) => {
      controlBuffer += chunk.toString('utf8');
      const lines = controlBuffer.split('\n');
      controlBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        try {
          const message = JSON.parse(line) as {
            code?: string | number | null;
            message?: string;
            type?: string;
          };
          if (message.type === 'timeout') {
            timedOut = true;
            cleanupDegraded = true;
            finishIfStreamsDoNotClose(null);
          }
          if (message.type === 'group-probe-failed') cleanupDegraded = true;
          if (message.type === 'spawn-error' && message.message) {
            managedSpawnError = {
              code: message.code ?? null,
              message: message.message,
            };
          }
        } catch {
          // Ignore malformed supervisor diagnostics; normal exit still fails closed.
        }
      }
    });
    child.stdout?.on('data', (chunk: Buffer) => captureOutput('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => captureOutput('stderr', chunk));
    child.once('error', (error) => {
      finish((error as NodeJS.ErrnoException).code ?? null, error.message);
    });
    child.once('exit', () => {
      if (processExited || settled || timedOut) return;
      processExited = true;
      if (outputLimitError) return;
      timeoutState.settlementTimer = setTimeout(() => {
        cleanupDegraded = true;
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(
          null,
          'Process exited but its output streams did not close; descendant processes may still be running',
          false,
        );
      }, 2000);
    });
    child.once('close', (code, signal) => {
      if (managedSpawnError) {
        finish(managedSpawnError.code, managedSpawnError.message);
        return;
      }
      if (outputLimitError) {
        finish(outputLimitError.code, outputLimitError.message);
        return;
      }
      if (timedOut) {
        finish(null, null);
        return;
      }
      if (code !== 0) {
        const errorCode = code ?? signal ?? null;
        finish(errorCode, `Process exited with ${signal ? `signal ${signal}` : `code ${String(code)}`}`);
        return;
      }
      finish(null, null);
    });
  });
}

/**
 * Execute a foreground process with a wall-clock timeout. The POSIX child
 * supervisor and Windows worker own their deadlines independently of caller
 * main-event-loop starvation.
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
