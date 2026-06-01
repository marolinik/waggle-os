/**
 * Cursor sessionStart hook — recalls the top-N most relevant frames from
 * personal memory and injects them as additional context for the new
 * Cursor session. Thin entrypoint over the shared handler body. The cursor
 * adapter's `formatInject` shapes the inject response as
 * `{ additional_context: text }` (cursor's `sessionStart` convention).
 *
 * If hive-mind-cli is unreachable, the hook logs and exits 0 with no
 * output (fail-open) — the session starts as it would have without the
 * shim.
 */

import {
  makeSessionStartHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { cursorAdapter } from '../adapter.js';

export async function runSessionStart(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeSessionStartHandler(cursorAdapter), {
    name: 'session-start',
    loggerPrefix: 'cursor-hooks',
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
  void runSessionStart();
}
