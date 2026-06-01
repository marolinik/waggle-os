/**
 * @waggle/hive-mind-hooks-openclaw — barrel export.
 *
 * OpenClaw silent-capture shim for hive-mind. Unlike the stdin-JSON tools
 * (codex / cursor / hermes), OpenClaw hooks are IN-PROCESS TypeScript: a hook
 * is a directory `~/.openclaw/hooks/hive-mind/{HOOK.md, handler.js}` whose
 * default export the gateway loads and runs inside its own Node process. So
 * the installer writes that managed dir + minimally touches the JSON5 config,
 * and the handler drives the shared lifecycle bodies via
 * `makeOpenclawHandler` (hooks-core) rather than `runHook`.
 *
 * Four events (matched on the `(type, action)` PAIR):
 *   - SessionStart → `agent:bootstrap` (mutates `context.bootstrapFiles`)
 *   - UserPromptSubmit → `message:received`
 *   - Stop → `message:sent` (0..N/turn — DEBOUNCED; non-replyable)
 *   - PreCompact → `session:compact:before` (runtime action `compact:before`)
 *
 * JSON5 round-trip is lossy, so reversibility relies on the literal
 * byte-identical backup + a recorded managed-dir removal. Programmatic
 * install / uninstall / verify lifecycle; most users invoke the
 * `openclaw-hooks` bin. The in-process `handler.ts` default export is the
 * `./handler` subpath export.
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
  OpenclawPaths,
  ResolvePathsOptions,
  HookBasename,
} from './paths.js';
export {
  resolvePaths,
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
  HIVE_HOOK_DIR_NAME,
  HIVE_HOOK_ENTRY_KEY,
} from './paths.js';

export {
  openclawAdapter,
  OPENCLAW_EVENT_NAME,
  OPENCLAW_PROVENANCE,
} from './adapter.js';

export type {
  HiveEntryEnv,
  RegisterOptions,
} from './json5-merger.js';
export {
  parseConfig,
  serializeConfig,
  jsonRegister,
  jsonUnregister,
  hasHiveEntries,
  HIVE_ENTRY_KEY,
  HOOKS_KEY,
} from './json5-merger.js';

export {
  renderHookMd,
  HOOK_MD_EVENTS,
} from './hook-md.js';

// The in-process handler default export (the gateway loads this). Re-exported
// for tests + programmatic drive; the gateway loads the COMPILED copy from
// `~/.openclaw/hooks/hive-mind/handler.js`.
export { default as openclawHook } from './handler.js';
