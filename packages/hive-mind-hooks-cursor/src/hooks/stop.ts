/**
 * Cursor stop hook — fired when an assistant turn completes. Summarizes the
 * turn deterministically (no LLM call) and writes it as an `important`
 * frame parented to the originating prompt frame when known. Thin
 * entrypoint over the shared handler body.
 *
 * DEGRADED (spec §5.3): cursor delivers the completed turn via the base
 * field `transcript_path` (NOT inline). The cursor adapter's
 * `extractResponse` is async, reads that file defensively (tolerates a
 * missing path when transcripts are disabled, does not assume JSONL), and
 * fails open — returning undefined rather than throwing.
 */

import {
  isDirectExecution,
  makeStopHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { cursorAdapter } from '../adapter.js';

export async function runStop(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeStopHandler(cursorAdapter), {
    name: 'stop',
    loggerPrefix: 'cursor-hooks',
    ...opts,
  });
}

if (isDirectExecution(import.meta.url)) {
  void runStop();
}
