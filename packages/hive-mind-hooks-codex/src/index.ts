/**
 * @waggle/hive-mind-hooks-codex — barrel export.
 *
 * OpenAI Codex silent-capture shim for hive-mind. The second reference
 * shape: a CC-clone JSON installer built on @waggle/hive-mind-hooks-core,
 * with create-if-missing semantics (codex's `~/.codex/hooks.json` is
 * optional). Programmatic install / uninstall / verify lifecycle; most
 * users invoke the `codex-hooks` bin.
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
  CodexPaths,
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
  codexAdapter,
  codexRegisterSpec,
  extractTrigger,
  CODEX_EVENT_NAME,
  HIVE_MIND_MARKER,
  SESSION_START_MATCHER,
} from './adapter.js';
