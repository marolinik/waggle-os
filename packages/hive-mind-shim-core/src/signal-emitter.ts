/**
 * AI-OS Phase 1D — Signal emitter shim.
 *
 * Hook packages (claude-code / cursor / claude-desktop / …) call
 * `emitSignalToWaggleDance()` to push a WaggleDance v2 signal into
 * the user's local Waggle sidecar. The sidecar persists the signal
 * to its in-memory bus and re-emits it through the legacy UI stream
 * so the WaggleDanceApp shows cross-tool activity in real time.
 *
 * Design contract:
 *
 *   1. **Fail open.** The hook chain must never block on a sidecar
 *      that's not running. Any error (ENOTFOUND, ECONNREFUSED,
 *      non-2xx, JSON parse) returns null and logs a single warning
 *      to stderr. The host AI tool (Claude Code, Cursor) never sees
 *      a hook failure.
 *
 *   2. **No external deps.** This module uses only Node 20's built-in
 *      `fetch` — no node-fetch / undici install. Hook packages run
 *      in the user's environment with whatever lockfile they have;
 *      we minimize footprint.
 *
 *   3. **Timeout-bounded.** A 2-second default timeout protects
 *      against a hung sidecar. The hook chain has its own outer
 *      timeout; this is defense in depth.
 *
 *   4. **Opt-in by default.** The emitter is a library function
 *      (not a side effect on import). Hooks must call it explicitly.
 *      Phase 1E wires the claude-code Stop hook to invoke this when
 *      the importance classifier returns 'high' or 'critical'.
 *
 * URL resolution:
 *
 *   options.url > env.WAGGLE_SIDECAR_URL > http://127.0.0.1:3333
 *
 * The default port matches packages/launcher/src/cli.ts.
 */

import type { EventType } from './hook-event-types.js';

/** Allowed v2 subtypes — matches the protocol enum on the server. */
export type SignalSubtype =
  | 'knowledge_check'
  | 'task_delegation'
  | 'skill_request'
  | 'model_recommendation'
  | 'knowledge_match'
  | 'task_claim'
  | 'discovery'
  | 'routed_share'
  | 'skill_share'
  | 'model_recipe';

/** Allowed types — matches the protocol enum. */
export type SignalType = 'broadcast' | 'request' | 'response';

export interface EmitSignalOptions {
  /** Top-level Waggle Dance protocol type. */
  type: SignalType;
  /** Protocol subtype. Must be valid for the chosen type. */
  subtype: SignalSubtype;
  /** Free-form structured content. The server preserves this verbatim. */
  content: Record<string, unknown>;
  /** Logical sender ('claude-code-hook', 'cursor-hook', …). Defaults to 'hook'. */
  senderId?: string;
  /** Optional team id. Defaults server-side to `personal::<senderId>`. */
  teamId?: string;
  /** Optional reference to a prior message (for responses). */
  referenceId?: string;
  /** Optional routing list (for routed_share). */
  routing?: Array<{ userId: string; reason: string }>;
  /**
   * Override the sidecar URL. Resolution order:
   *   options.url > env.WAGGLE_SIDECAR_URL > http://127.0.0.1:3333
   */
  url?: string;
  /** Narrow collaboration credential. Defaults to env.WAGGLE_RUN_TOKEN. */
  runToken?: string;
  /** Override the request timeout (default 2000ms). */
  timeoutMs?: number;
  /**
   * Test hook — injects a custom fetch implementation. Production
   * uses Node 20's global fetch.
   */
  fetchImpl?: typeof fetch;
  /**
   * Test hook — captures stderr lines instead of writing to
   * process.stderr. Returns the emitted message.
   */
  onWarn?: (message: string) => void;
}

export interface EmittedSignal {
  /** Server-assigned message id (UUID). */
  id: string;
  /** Resolved team id (`personal::<senderId>` if not provided). */
  teamId: string;
  /** Resolved sender id. */
  senderId: string;
  /** Echoed type. */
  type: SignalType;
  /** Echoed subtype. */
  subtype: SignalSubtype;
  /** Echoed content. */
  content: Record<string, unknown>;
  /** Echoed referenceId. */
  referenceId: string | null;
  /** Echoed routing. */
  routing: Array<{ userId: string; reason: string }> | null;
  /** Server-assigned ISO timestamp. */
  createdAt: string;
}

function resolveUrl(opts: EmitSignalOptions): string {
  if (opts.url) return opts.url;
  const fromEnv = typeof process !== 'undefined' && process.env
    ? process.env.WAGGLE_SIDECAR_URL
    : undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : 'http://127.0.0.1:3333';
}

function resolveRunToken(opts: EmitSignalOptions): string | undefined {
  const value = opts.runToken ?? (
    typeof process !== 'undefined' && process.env ? process.env.WAGGLE_RUN_TOKEN : undefined
  );
  if (!value || value.length < 32 || value.length > 200 || /[\r\n]/.test(value)) return undefined;
  return value;
}

function warn(opts: EmitSignalOptions, message: string): void {
  if (opts.onWarn) {
    opts.onWarn(message);
    return;
  }
  try {
    process.stderr.write(`[waggle-signal-emitter] ${message}\n`);
  } catch {
    /* nothing we can do; bail */
  }
}

/**
 * POST a v2 signal to the local Waggle sidecar.
 *
 * Returns the server-persisted signal on success, or null on any
 * failure (network, timeout, non-2xx, parse). Always fail open —
 * the host AI tool's hook chain must continue.
 */
export async function emitSignalToWaggleDance(
  opts: EmitSignalOptions,
): Promise<EmittedSignal | null> {
  const url = resolveUrl(opts);
  const timeoutMs = opts.timeoutMs ?? 2000;
  const fetchFn = opts.fetchImpl ?? fetch;
  const runToken = resolveRunToken(opts);

  const body = {
    type: opts.type,
    subtype: opts.subtype,
    content: opts.content,
    senderId: opts.senderId ?? 'hook',
    ...(opts.teamId !== undefined ? { teamId: opts.teamId } : {}),
    ...(opts.referenceId !== undefined ? { referenceId: opts.referenceId } : {}),
    ...(opts.routing !== undefined ? { routing: opts.routing } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(`${url}/api/waggle-dance/signal`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(runToken ? { 'x-waggle-run-token': runToken } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      warn(opts, `non-2xx response (${res.status}) — signal dropped`);
      return null;
    }
    const json = (await res.json()) as { message?: unknown };
    if (!json || typeof json !== 'object' || !('message' in json) || !json.message) {
      warn(opts, 'malformed response body — signal dropped');
      return null;
    }
    return json.message as EmittedSignal;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    warn(opts, `sidecar unreachable (${reason}) — signal dropped`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience: classify a hook lifecycle event and decide whether
 * to emit a discovery signal. Returns the emitted signal or null
 * (no emission necessary, or emission failed).
 *
 * The default policy is: emit on `stop` and `pre-compact` if
 * `importance` is 'high' or 'critical'. Hook packages override
 * with their own policy when they need to emit other subtypes.
 */
export async function maybeEmitDiscovery(
  eventType: EventType,
  importance: 'low' | 'normal' | 'high' | 'critical',
  payload: Record<string, unknown>,
  opts: Omit<EmitSignalOptions, 'type' | 'subtype' | 'content'>,
): Promise<EmittedSignal | null> {
  if (importance !== 'high' && importance !== 'critical') return null;
  if (eventType !== 'stop' && eventType !== 'pre-compact') return null;
  return emitSignalToWaggleDance({
    ...opts,
    type: 'broadcast',
    subtype: 'discovery',
    content: { ...payload, eventType, importance },
  });
}
