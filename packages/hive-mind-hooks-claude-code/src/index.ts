/**
 * @waggle/hive-mind-hooks-claude-code — barrel export (was @hive-mind/claude-code-hooks pre-monorepo migration).
 *
 * Programmatic API for the install / uninstall / verify lifecycle.
 * Most users invoke the CLI bin (`npx @hive-mind/claude-code-hooks ...`)
 * but the same functions are exposed for embedding in other tooling.
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
  ShimPaths,
  ResolvePathsOptions,
  HookBasename,
} from './paths.js';
export {
  resolvePaths,
  hookCommandFor,
  backupPathFor,
  allHookBasenames,
} from './paths.js';

export type {
  ClaudeCodeSettings,
  HookGroup,
  HookEntrySpec,
} from './settings-merger.js';
export {
  HIVE_MIND_MARKER,
  HOOK_EVENT_BY_BASENAME,
  defaultHookEntries,
  hasHiveHooks,
  mergeHiveHooks,
} from './settings-merger.js';
