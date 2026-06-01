/**
 * Codex Stop hook — fired when an assistant turn completes. Summarizes the
 * turn deterministically (no LLM call) and writes it as an `important`
 * frame parented to the originating prompt frame when known. Thin
 * entrypoint over the shared handler body; the adapter reads codex's
 * `last_assistant_message` in the response fallback list.
 */

import {
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
