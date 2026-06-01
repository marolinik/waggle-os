/**
 * Hermes stop hook — fired when an assistant turn completes. Summarizes the
 * turn deterministically (no LLM call) and writes it as an `important` frame
 * parented to the originating prompt frame when known. Thin entrypoint over
 * the shared handler body.
 *
 * Native event: `post_llm_call` (fires once per turn after the loop
 * completes, only if a final response was produced and the turn was not
 * interrupted — the dependable per-turn Stop signal for a single-shot CLI
 * run). The assistant text arrives at `extra.assistant_response`; the hermes
 * adapter's `extractResponse` reads it. NOTE: `on_session_finalize` is the
 * gateway-only path and is deliberately NOT used.
 *
 * Capture-only: emits no stdout (Hermes block/inject is via stdout JSON,
 * not exit codes); fails open on any error and exits 0.
 */

import {
  makeStopHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { hermesAdapter } from '../adapter.js';
import { maybeCompactOnStop } from '../compact-on-stop.js';

export interface HermesStopOptions extends Partial<HookRunOptions> {
  /** Injectable clock for the compact gate (tests). */
  now?: () => number;
  /** $HOME override for the compact state file (tests). */
  home?: string;
  /** Compact window override in ms (tests). */
  compactWindowMs?: number;
}

export async function runStop(opts: HermesStopOptions = {}): Promise<void> {
  const { now, home, compactWindowMs, ...runOpts } = opts;
  const base = makeStopHandler(hermesAdapter);
  const handler: typeof base = {
    parse: base.parse,
    async run(payload, ctx) {
      // Primary save first — unchanged. If this throws, the compact step is
      // skipped and the throw lands in runHook's fail-open catch (exit 0).
      await base.run(payload, ctx);
      // Best-effort maintenance layered after the save. Never throws/rejects,
      // so it cannot affect the already-completed save or the exit code.
      await maybeCompactOnStop(ctx, { now, home, windowMs: compactWindowMs });
      return undefined;
    },
  };
  return runHook(handler, {
    name: 'stop',
    loggerPrefix: 'hermes-hooks',
    ...runOpts,
  });
}

const isMain = (() => {
  try {
    if (typeof process.argv[1] !== 'string') return false;
    const url = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`);
    return url.href === import.meta.url;
  } catch {
    return false;
  }
})();
if (isMain) {
  void runStop();
}
