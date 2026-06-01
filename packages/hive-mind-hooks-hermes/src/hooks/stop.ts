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

export async function runStop(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeStopHandler(hermesAdapter), {
    name: 'stop',
    loggerPrefix: 'hermes-hooks',
    ...opts,
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
