/**
 * Shared helpers for the four hook scripts.
 *
 * Hook scripts run as short-lived Node subprocesses spawned by Claude
 * Code. The contract:
 *   - stdin     : Claude Code writes a JSON event payload (may be empty
 *                 on some hook events).
 *   - stdout    : structured JSON for hooks that influence Claude Code
 *                 behaviour (SessionStart context injection, etc.).
 *   - stderr    : structured logger output (never blocks the host).
 *   - exit code : 0 always — silent capture must not break the IDE.
 *
 * On any internal error, hooks log the error and exit 0. The
 * `runHook` helper wraps the user-supplied hook body with this
 * fail-open contract.
 */

import { createCliBridge, createLogger, type CliBridge, type CliBridgeOptions, type Logger } from '@waggle/hive-mind-shim-core';

export interface HookContext {
  bridge: CliBridge;
  logger: Logger;
}

export interface HookRunOptions {
  /** Component name for the logger. */
  name: string;
  /** Stdin reader override for tests. */
  readStdin?: () => Promise<string>;
  /** Stdout writer override for tests. */
  writeStdout?: (s: string) => void;
  /** Override exit; tests provide a no-op so they don't terminate vitest. */
  exit?: (code: number) => void;
  /** Logger override. */
  logger?: Logger;
  /** Bridge override (tests inject a mock with a fake spawnImpl). */
  bridge?: CliBridge;
  /** Override argv for tests; defaults to `process.argv.slice(2)`. */
  argv?: readonly string[];
}

/**
 * Parse `--cli-path <value>` from argv. Used by hook scripts to thread
 * the install-time-pinned CLI binary path into createCliBridge so a
 * single hook script works on POSIX (where `hive-mind-cli` is on PATH)
 * and on Windows (where the npm `.cmd` shim cannot be exec'd directly).
 */
export function parseHookArgs(argv: readonly string[]): { cliPath?: string } {
  const idx = argv.indexOf('--cli-path');
  if (idx >= 0 && idx + 1 < argv.length) {
    const value = argv[idx + 1];
    if (typeof value === 'string' && value.length > 0) return { cliPath: value };
  }
  return {};
}

export interface HookHandler<TPayload = unknown, TStdoutPayload = unknown> {
  parse(raw: unknown): TPayload;
  run(payload: TPayload, ctx: HookContext): Promise<TStdoutPayload | undefined>;
}

const STDIN_READ_TIMEOUT_MS = 2000;

export async function readStdinAsString(timeoutMs: number = STDIN_READ_TIMEOUT_MS): Promise<string> {
  if (process.stdin.isTTY) return '';
  return new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf-8'));
    }, timeoutMs);
    process.stdin.on('data', (c: Buffer) => chunks.push(c));
    process.stdin.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    process.stdin.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
  });
}

export function safeJsonParse(raw: string): unknown {
  if (!raw || raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function runHook<TPayload, TStdoutPayload>(
  handler: HookHandler<TPayload, TStdoutPayload>,
  opts: HookRunOptions,
): Promise<void> {
  const logger = opts.logger ?? createLogger({ name: `claude-code-hooks/${opts.name}` });
  const writeStdout = opts.writeStdout ?? ((s: string) => process.stdout.write(s));
  const exit = opts.exit ?? ((c: number): void => { process.exit(c); });
  const reader = opts.readStdin ?? readStdinAsString;
  const argv = opts.argv ?? process.argv.slice(2);
  const argvFlags = parseHookArgs(argv);
  const bridgeOpts: CliBridgeOptions = { logger };
  if (argvFlags.cliPath !== undefined) bridgeOpts.cli_path = argvFlags.cliPath;
  const bridge = opts.bridge ?? createCliBridge(bridgeOpts);

  try {
    const raw = await reader();
    const parsed = safeJsonParse(raw);
    const payload = handler.parse(parsed);
    const out = await handler.run(payload, { bridge, logger });
    if (out !== undefined) {
      writeStdout(JSON.stringify(out) + '\n');
    }
    exit(0);
  } catch (err) {
    logger.warn('hook failed open', {
      hook: opts.name,
      error: err instanceof Error ? err.message : String(err),
    });
    exit(0);
  }
}

/**
 * Best-effort accessor for nested string fields on opaque payloads.
 * Returns undefined when the key path doesn't resolve to a non-empty string.
 */
export function pickStringField(payload: unknown, ...keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export function pickStringFromObject(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
