import { execFileSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
export function resolveSafe(workspace: string, filePath: string): string {
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
  return resolved;
}
