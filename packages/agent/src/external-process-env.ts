import { mergePathValue, resolvedShellPath } from './shell-env.js';

/**
 * Non-secret host context required to start CLI and desktop processes.
 * Unknown variables are omitted so newly added provider or infrastructure
 * credentials cannot silently cross the external-process boundary.
 */
const BASE_ENV_ALLOWLIST = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USER', 'USERNAME',
  'LOGNAME', 'SHELL',
  'APPDATA', 'LOCALAPPDATA', 'HERMES_HOME', 'PROGRAMDATA', 'PROGRAMFILES',
  'PROGRAMFILES(X86)', 'PROGRAMW6432',
  'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LANGUAGE', 'LC_ALL', 'LC_ADDRESS', 'LC_COLLATE', 'LC_CTYPE',
  'LC_IDENTIFICATION', 'LC_MEASUREMENT', 'LC_MESSAGES', 'LC_MONETARY',
  'LC_NAME', 'LC_NUMERIC', 'LC_PAPER', 'LC_TELEPHONE', 'LC_TIME',
  'TERM', 'COLORTERM',
  'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'TZ',
  'OS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER',
  'NUMBER_OF_PROCESSORS',
  'DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
  'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  'XDG_STATE_HOME', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP',
  'DESKTOP_SESSION', '__CF_USER_TEXT_ENCODING',
]);

/** Explicit Waggle runtime metadata constructed by trusted launch code. */
const WAGGLE_ENV_ALLOWLIST = new Set([
  'WAGGLE_WORKSPACE_ID', 'WAGGLE_WORKSPACE_PATH',
  'WAGGLE_RUN_ID', 'WAGGLE_ROOM_ID', 'WAGGLE_SENDER_ID',
  'WAGGLE_DANCE_TEAM_ID', 'WAGGLE_DANCE_URL', 'WAGGLE_RUN_TOKEN',
  'WAGGLE_CLI_NODE_PATH', 'WAGGLE_CLI_ENTRY',
  'WAGGLE_SIGNAL_EMIT', 'WAGGLE_SIDECAR_URL',
  'WAGGLE_HOOK_NODE_PATH', 'HIVE_MIND_DATA_DIR', 'NO_COLOR',
]);

/**
 * Build a fail-closed environment for user-installed AI tools and hook bins.
 * Provider keys, credential helpers, proxy credentials, infrastructure
 * secrets, and arbitrary ambient variables are never inherited. The caller
 * may add only the narrow Waggle metadata enumerated above.
 */
export function buildExternalProcessEnv(
  base: NodeJS.ProcessEnv,
  waggleEnv: NodeJS.ProcessEnv = {},
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    const upper = key.toUpperCase();
    if (value !== undefined && BASE_ENV_ALLOWLIST.has(upper)) {
      env[key] = value;
    }
  }

  // GUI-launched POSIX sidecars can inherit a bare PATH. Preserve the existing
  // login-shell recovery without importing any other shell variables.
  if (platform !== 'win32') {
    const shellPath = resolvedShellPath();
    if (shellPath) env.PATH = mergePathValue(shellPath, env.PATH);
  }

  for (const [key, value] of Object.entries(waggleEnv)) {
    if (value !== undefined && WAGGLE_ENV_ALLOWLIST.has(key.toUpperCase())) {
      env[key] = value;
    }
  }
  return env;
}
