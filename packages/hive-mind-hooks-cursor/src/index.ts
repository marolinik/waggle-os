/**
 * @waggle/hive-mind-hooks-cursor — barrel export.
 *
 * Cursor silent-capture shim for hive-mind. A JSON installer built on
 * @waggle/hive-mind-hooks-core, with create-if-missing semantics (cursor's
 * `~/.cursor/hooks.json` is optional, and is a SEPARATE file from Cursor's
 * `settings.json`). Field-renamed events (sessionStart / beforeSubmitPrompt
 * / stop / preCompact) with two degraded events (beforeSubmitPrompt is
 * save-only; preCompact is observational; Stop reads the turn from
 * `transcript_path`). Programmatic install / uninstall / verify lifecycle;
 * most users invoke the `cursor-hooks` bin.
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
  CursorPaths,
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
  cursorAdapter,
  cursorRegisterSpec,
  CURSOR_EVENT_NAME,
  HIVE_MIND_MARKER,
} from './adapter.js';
