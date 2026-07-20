/**
 * Shared subprocess plumbing for the stdin-JSON / exit-0 lifecycle hook
 * scripts (codex, codex-desktop, cursor, hermes).
 *
 * Re-authored from the frozen Wave 1 `hooks/_shared.ts` so the five new
 * packages import `runHook`/`parseHookArgs` from `hooks-core` and never
 * reach across the frozen claude-code package boundary. The logger name
 * prefix is generic (derived from `opts.name`) rather than hardcoded to
 * `claude-code-hooks`.
 *
 * Hook scripts run as short-lived Node subprocesses spawned by the host
 * tool. The contract:
 *   - stdin     : the host writes a JSON event payload (may be empty on
 *                 some events).
 *   - stdout    : structured JSON for hooks that influence host behaviour
 *                 (SessionStart context injection, etc.).
 *   - stderr    : structured logger output (never blocks the host).
 *   - exit code : 0 always — silent capture must not break the host.
 *
 * On any internal error, hooks log the error and exit 0. The `runHook`
 * helper wraps the supplied hook body with this fail-open contract.
 */

import {
  createCliBridge,
  createLogger,
  type CliBridge,
  type CliBridgeOptions,
  type Logger,
} from '@waggle/hive-mind-shim-core';

export interface HookContext {
  bridge: CliBridge;
  logger: Logger;
}

export interface HookRunOptions {
  /** Component name for the logger (e.g. 'session-start'). */
  name: string;
  /**
   * Logger name prefix; defaults to 'hive-mind-hooks'. Consumers can set
   * their own tool-scoped prefix (e.g. 'codex-hooks') so log lines read
   * like the reference package.
   */
  loggerPrefix?: string;
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

const DEFAULT_LOGGER_PREFIX = 'hive-mind-hooks';
const HOOK_CLI_TIMEOUT_MS = 2_500;

/**
 * Lifecycle hooks must fail open before Codex/Cursor's 5-second host timeout.
 * One bounded attempt prevents the bridge default (four attempts) from keeping
 * the host waiting after a stalled CLI process.
 */
export function buildHookBridgeOptions(
  logger: Logger,
  cliPath?: string,
): CliBridgeOptions {
  return {
    logger,
    timeout_ms: HOOK_CLI_TIMEOUT_MS,
    max_retries: 0,
    ...(cliPath !== undefined ? { cli_path: cliPath } : {}),
  };
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

export async function readStdinAsString(
  timeoutMs: number = STDIN_READ_TIMEOUT_MS,
): Promise<string> {
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
  const prefix = opts.loggerPrefix ?? DEFAULT_LOGGER_PREFIX;
  const logger = opts.logger ?? createLogger({ name: `${prefix}/${opts.name}` });
  const writeStdout = opts.writeStdout ?? ((s: string) => process.stdout.write(s));
  const exit = opts.exit ?? ((c: number): void => { process.exit(c); });
  const reader = opts.readStdin ?? readStdinAsString;
  const argv = opts.argv ?? process.argv.slice(2);
  const argvFlags = parseHookArgs(argv);
  const bridgeOpts = buildHookBridgeOptions(logger, argvFlags.cliPath);
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
