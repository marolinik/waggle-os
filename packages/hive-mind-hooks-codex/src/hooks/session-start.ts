/**
 * Codex SessionStart hook — recalls the top-N most relevant frames from
 * personal memory and injects them as additional context for the new
 * Codex session. Thin entrypoint over the shared handler body.
 *
 * If hive-mind-cli is unreachable, the hook logs and exits 0 with no
 * output (fail-open) — the session starts as it would have without the
 * shim.
 */

import {
  isDirectExecution,
  makeSessionStartHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { codexAdapter } from '../adapter.js';

export async function runSessionStart(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeSessionStartHandler(codexAdapter), {
    name: 'session-start',
    loggerPrefix: 'codex-hooks',
    ...opts,
  });
}

if (isDirectExecution(import.meta.url)) {
  void runSessionStart();
}
