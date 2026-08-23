/**
 * Cursor preCompact hook — fired around Cursor's context truncation.
 * Triggers `cleanup_frames` so superseded P/B frames merge before the
 * native compaction step. Thin entrypoint over the shared handler body.
 *
 * DEGRADED (spec §5.3): cursor's `preCompact` is OBSERVATIONAL only — it
 * cannot block or reorder, so "run compact_memory BEFORE the host
 * truncates" is best-effort, not guaranteed-before. `cleanup_frames` runs
 * fire-and-forget; if hive-mind-cli is unreachable the hook exits 0.
 */

import {
  isDirectExecution,
  makePreCompactHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { cursorAdapter } from '../adapter.js';

export async function runPreCompact(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makePreCompactHandler(cursorAdapter), {
    name: 'pre-compact',
    loggerPrefix: 'cursor-hooks',
    ...opts,
  });
}

if (isDirectExecution(import.meta.url)) {
  void runPreCompact();
}
