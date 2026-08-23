/**
 * Cursor beforeSubmitPrompt hook — captures the user prompt as a temporary
 * frame scoped to the current Cursor session. Thin entrypoint over the
 * shared handler body.
 *
 * DEGRADED (spec §5.3): cursor's `beforeSubmitPrompt` is SAVE-ONLY — its
 * stdout is only `{ continue, user_message }`, so it cannot inject recalled
 * context. hive-mind's UserPromptSubmit only persists, so this is fully
 * compatible; the hook emits no stdout and is a pure side-effect on the
 * .mind file.
 */

import {
  isDirectExecution,
  makeUserPromptSubmitHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { cursorAdapter } from '../adapter.js';

export async function runUserPromptSubmit(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeUserPromptSubmitHandler(cursorAdapter), {
    name: 'user-prompt-submit',
    loggerPrefix: 'cursor-hooks',
    ...opts,
  });
}

if (isDirectExecution(import.meta.url)) {
  void runUserPromptSubmit();
}
