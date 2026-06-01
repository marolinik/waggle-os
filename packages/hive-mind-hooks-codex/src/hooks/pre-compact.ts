/**
 * Codex PreCompact hook — fired just before Codex truncates context.
 * Triggers `cleanup_frames` so superseded P/B frames merge before the
 * native compaction step. Thin entrypoint over the shared handler body.
 * Codex carries the compaction `trigger` (`manual|auto`) on the payload.
 */

import {
  makePreCompactHandler,
  runHook,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { codexAdapter } from '../adapter.js';

export async function runPreCompact(opts: Partial<HookRunOptions> = {}): Promise<void> {
  return runHook(makePreCompactHandler(codexAdapter), {
    name: 'pre-compact',
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
  void runPreCompact();
}
