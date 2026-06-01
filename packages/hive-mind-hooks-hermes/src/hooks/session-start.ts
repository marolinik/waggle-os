/**
 * Hermes session-start hook — recalls the top-N most relevant frames from
 * personal memory and injects them as additional context for the new Hermes
 * session. Thin entrypoint over the shared SessionStart handler body.
 *
 * Hermes SPLITS SessionStart across two native events, and this ONE compiled
 * script is registered under BOTH (spec §5.4):
 *   - `on_session_start` — observer-only (fires once per new session; its
 *     return value is ignored by Hermes).
 *   - `pre_llm_call` — the inject seam, but ONLY on the first turn.
 *
 * Because the same script fires on every `pre_llm_call` (not just turn 1),
 * it gates on the payload's `is_first_turn` flag: when the host indicates a
 * non-first turn, the script emits nothing (the per-turn save is handled by
 * the separate user-prompt-submit hook). On the first turn (or when the flag
 * is absent — e.g. the `on_session_start` observer payload), it recalls +
 * injects via the hermes adapter's `formatInject` (`{ context: text }`).
 *
 * Fail-open: if hive-mind-cli is unreachable the hook logs and exits 0 with
 * no output — the session starts as it would have without the shim.
 */

import {
  makeSessionStartHandler,
  readStdinAsString,
  runHook,
  safeJsonParse,
  type HookRunOptions,
} from '@waggle/hive-mind-hooks-core';
import { hermesAdapter } from '../adapter.js';

/**
 * True unless the host explicitly marks this as a non-first turn. Hermes
 * sets `extra.is_first_turn=false` on subsequent `pre_llm_call`s; the
 * `on_session_start` observer payload omits the flag, so absence ⇒ inject.
 */
function isFirstTurn(raw: unknown): boolean {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const extra = obj['extra'];
    const flag = (extra && typeof extra === 'object'
      ? (extra as Record<string, unknown>)['is_first_turn']
      : undefined) ?? obj['is_first_turn'];
    if (flag === false) return false;
  }
  return true;
}

export async function runSessionStart(opts: Partial<HookRunOptions> = {}): Promise<void> {
  // Read stdin ONCE, then honor Hermes's is_first_turn inject gating without
  // changing the shared handler body. On a non-first turn we exit 0 with no
  // output (so the host pipe drains and the session is never blocked); the
  // per-turn save is owned by the separate user-prompt-submit hook.
  const exit = opts.exit ?? ((c: number): void => { process.exit(c); });
  let raw: string;
  try {
    const reader = opts.readStdin ?? readStdinAsString;
    raw = await reader();
    if (!isFirstTurn(safeJsonParse(raw))) {
      exit(0);
      return;
    }
  } catch {
    // Fail-open: a throwing stdin read must never escape to the host
    // (mirrors runHook's exit-0-always contract for the pre-gate path).
    exit(0);
    return;
  }
  return runHook(makeSessionStartHandler(hermesAdapter), {
    name: 'session-start',
    loggerPrefix: 'hermes-hooks',
    ...opts,
    // Re-feed the already-read payload so runHook does not block on a
    // drained stdin.
    readStdin: async () => raw,
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
