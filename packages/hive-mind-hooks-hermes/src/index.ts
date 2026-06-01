/**
 * @waggle/hive-mind-hooks-hermes — barrel export.
 *
 * Hermes silent-capture shim for hive-mind. A bespoke-YAML installer built
 * on @waggle/hive-mind-hooks-core, with create-if-missing semantics
 * (Hermes's `~/.hermes/config.yaml` is optional). Targets the SHELL-HOOKS
 * system (the top-level `hooks:` block) — NOT the gateway dir-hooks nor the
 * in-process plugin hooks.
 *
 * Three events only (NO PreCompact — Hermes ships no compaction hook):
 *   - SessionStart is SPLIT across `on_session_start` (observer) and
 *     `pre_llm_call` (inject, gated `is_first_turn`).
 *   - UserPromptSubmit → `pre_llm_call`.
 *   - Stop → `post_llm_call`.
 *
 * Because Hermes has no PreCompact event, the `cleanup_frames` maintenance
 * pass is approximated OPT-IN from the per-turn Stop hook
 * (`WAGGLE_HERMES_COMPACT_ON_STOP`, default off; time-gated by
 * `WAGGLE_HERMES_COMPACT_WINDOW_MIN`) — see `compact-on-stop.ts`.
 *
 * YAML round-trip is lossy, so reversibility relies on the literal
 * byte-identical backup written at install time. Programmatic install /
 * uninstall / verify lifecycle; most users invoke the `hermes-hooks` bin.
 */

export type {
  InstallOptions,
  InstallResult,
} from './install.js';
export { install } from './install.js';

export type {
  UninstallOptions,
  UninstallResult,
} from './uninstall.js';
export { uninstall } from './uninstall.js';

export type {
  VerifyOptions,
  VerifyResult,
  VerifyCheck,
} from './verify.js';
export { verify } from './verify.js';

export type {
  HermesPaths,
  ResolvePathsOptions,
  HookBasename,
} from './paths.js';
export {
  resolvePaths,
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
} from './paths.js';

export {
  hermesAdapter,
  HERMES_EVENT_NAME,
  HERMES_SESSION_START_OBSERVE_EVENT,
} from './adapter.js';

export type { MaybeCompactOptions } from './compact-on-stop.js';
export {
  maybeCompactOnStop,
  compactStatePath,
  isCompactEnabled,
  resolveWindowMs,
  DEFAULT_WINDOW_MS,
} from './compact-on-stop.js';

export type {
  HermesHookEntry,
  HermesRegisterEntry,
} from './yaml-merger.js';
export {
  parseConfig,
  serializeConfig,
  yamlRegister,
  yamlUnregister,
  hasHiveEntries,
  isHiveEntry,
  HIVE_MIND_MARKER,
  HOOKS_KEY,
} from './yaml-merger.js';
