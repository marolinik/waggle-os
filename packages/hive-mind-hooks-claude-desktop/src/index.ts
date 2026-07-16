/**
 * @waggle/hive-mind-hooks-claude-desktop — public MCP-bridge API.
 */

export { MCP_SERVER_NAME } from './install.js';

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
  ClaudeDesktopPaths,
  ResolvePathsOptions,
} from './paths.js';
export {
  resolvePaths,
  resolveMcpEntry,
} from './paths.js';
