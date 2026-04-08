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

/** Environment variables to strip from child processes for security */
export const SENSITIVE_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'CLERK_SECRET_KEY',
  'DATABASE_URL',
  'REDIS_URL',
];

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
 * Create a sanitized copy of the process environment with sensitive vars removed.
 */
export function createSanitizedEnv(): Record<string, string | undefined> {
  const sanitizedEnv = { ...process.env };
  for (const key of SENSITIVE_ENV_VARS) {
    delete sanitizedEnv[key];
  }
  return sanitizedEnv;
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
  const resolved = path.resolve(workspace, filePath);
  if (!resolved.startsWith(path.resolve(workspace))) {
    throw new Error(`Path resolves outside workspace: ${filePath}`);
  }
  return resolved;
}
