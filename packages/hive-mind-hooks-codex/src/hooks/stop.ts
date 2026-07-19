/**
 * Codex Stop hook — fired when an assistant turn completes. Summarizes the
 * turn deterministically (no LLM call) and writes it as an `important`
 * frame parented to the originating prompt frame when known. Thin
 * entrypoint over the shared handler body; the adapter reads codex's
 * `last_assistant_message` in the response fallback list.
 */

import {
  isDirectExecution,
  makeStopHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { codexAdapter } from '../adapter.js';

export async function runStop(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeStopHandler(codexAdapter), {
    name: 'stop',
    loggerPrefix: 'codex-hooks',
    ...opts,
  });
}

if (isDirectExecution(import.meta.url)) {
  void runStop();
}
