/**
 * Codex UserPromptSubmit hook — captures the user prompt as a temporary
 * frame scoped to the current Codex session. Thin entrypoint over the
 * shared handler body. No stdout output: pure side-effect on the .mind file.
 */

import {
  makeUserPromptSubmitHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { codexAdapter } from '../adapter.js';

export async function runUserPromptSubmit(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makeUserPromptSubmitHandler(codexAdapter), {
    name: 'user-prompt-submit',
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
  void runUserPromptSubmit();
}
