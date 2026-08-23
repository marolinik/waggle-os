/**
 * Hermes user-prompt-submit hook — captures the user prompt as a temporary
 * frame scoped to the current Hermes session. Thin entrypoint over the
 * shared handler body.
 *
 * Native event: `pre_llm_call` (fires once per turn before the tool loop).
 * The user text arrives at `extra.user_message`; the hermes adapter's
 * `extractPrompt` reads it. This hook is registered alongside the
 * session-start inject hook on the same `pre_llm_call` event — the two are
 * independent: session-start injects only on the first turn, this one saves
 * on every turn.
 *
 * Save-only: Hermes block/inject control flows through stdout JSON (no
 * exit-code-2 contract), and this hook is capture-only — it emits no stdout
 * and is a pure side-effect on the .mind file.
 */

import {
  isDirectExecution,
  makeUserPromptSubmitHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { hermesAdapter } from '../adapter.js';

export async function runUserPromptSubmit(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeUserPromptSubmitHandler(hermesAdapter), {
    name: 'user-prompt-submit',
    loggerPrefix: 'hermes-hooks',
    ...opts,
  });
}

if (isDirectExecution(import.meta.url)) {
  void runUserPromptSubmit();
}
