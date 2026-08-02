/**
 * Tool detection — AI-OS Phase 0.
 *
 * Detects which external AI tools (Claude Code, Cursor, Claude Desktop, …)
 * are installed on the user's machine and whether their hive-mind hooks
 * are wired up. Returns a stable envelope (`ToolDetectionResult` in
 * @waggle/shared) consumed by:
 *
 *   - the sidecar route GET /api/tools/detect          (Phase 0)
 *   - the launcher dock + hook-installer UX            (Phase 2)
 *   - the Mission Control inventory tile               (Phase 4)
 *
 * Design notes:
 *
 *   1. All filesystem and exec calls are injected via `ToolDetectionDeps`
 *      so tests run hermetically. The default implementations only
 *      activate when the caller does not provide overrides (production
 *      sidecar path).
 *   2. `pathFromEnv(name)` is a thin shim over PATH lookup. On POSIX it
 *      resolves like `which`; on Windows like `where`. The shim takes
 *      a logical name ('claude'), not a full path, so callers don't
 *      need to know the per-platform extension (.cmd / .exe / none).
 *   3. Hook-install status follows the hive-mind shim-core convention:
 *      `~/<tool-config-dir>/hive-mind-install.json` is the pointer
 *      written at install time. We additionally verify that the
 *      `backup` field still points to an existing file — otherwise the
 *      pointer is stale and the install is effectively rolled back.
 *   4. Detector functions are pure (`(deps) => Promise<DetectedTool>`)
 *      so they can be unit-tested individually and composed in parallel
 *      by the orchestrator.
 */

import { access, constants, readFile } from 'node:fs/promises';
import { homedir, platform as osPlatform } from 'node:os';
import { posix as pathPosix, win32 as pathWin32 } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Platform-aware path join. The detection envelope's path strings
 * must reflect `deps.platform` (the *target* user's platform), not
 * the host's platform — otherwise tests that simulate macOS on a
 * Windows dev machine end up with mixed-separator paths.
 */
function joinForPlatform(platform: NodeJS.Platform, ...parts: string[]): string {
  return platform === 'win32'
    ? pathWin32.join(...parts)
    : pathPosix.join(...parts);
}
import {
  type DetectedTool,
  type ToolDetectionResult,
  type ToolManifest,
} from '@waggle/shared';
import { resolveToolCommandInvocation } from './tool-command.js';
import { getToolRegistry } from './tool-registry.js';
import type { ManifestLoaderDeps } from './tool-manifest-loader.js';
import { resolveShellEnv, resolvedShellPath, mergePathValue } from './shell-env.js';

const execFileAsync = promisify(execFile);
const CODEX_WINDOWS_APPS_DIAGNOSTIC =
  'Codex was found in WindowsApps, but Windows blocks command-line launch from that app alias. Install a PATH CLI build of Codex or launch Codex from Start, then refresh.';
const HERMES_WINDOWS_HEALTH_DIAGNOSTIC =
  'Hermes is installed but failed its --version health check. Run "hermes doctor" or reinstall Hermes, then refresh.';
type WindowsAppExecutables = Readonly<Record<string, readonly string[]>>;
const EMPTY_WINDOWS_APP_EXECUTABLES: WindowsAppExecutables = {};
const WINDOWS_APPX_QUERY = [
  "$ErrorActionPreference = 'Stop'",
  "$targets = @(@{ Id = 'claude-desktop'; Name = 'Claude' }, @{ Id = 'codex-desktop'; Name = 'OpenAI.Codex' })",
  '$result = @{}',
  'foreach ($target in $targets) {',
  '  $paths = @()',
  '  Get-AppxPackage -Name $target.Name -ErrorAction SilentlyContinue | ForEach-Object {',
  '    $package = $_',
  '    $manifest = Get-AppxPackageManifest -Package $package.PackageFullName',
  '    foreach ($app in @($manifest.Package.Applications.Application)) {',
  '      $executable = [string]$app.Executable',
  '      if (-not [string]::IsNullOrWhiteSpace($executable)) {',
  '        $paths += [IO.Path]::GetFullPath((Join-Path $package.InstallLocation $executable))',
  '      }',
  '    }',
  '  }',
  '  $result[$target.Id] = @($paths)',
  '}',
  '$result | ConvertTo-Json -Compress -Depth 3',
].join('\n');

function isBlockedWindowsAppsCodexPath(
  id: string,
  platform: NodeJS.Platform,
  installedPath: string,
): boolean {
  if (id !== 'codex' || platform !== 'win32') return false;
  const normalized = installedPath.replace(/\//g, '\\').toLowerCase();
  return (
    normalized.includes('\\windowsapps\\openai.codex_')
    && (
      normalized.endsWith('\\app\\resources\\codex.exe')
      || normalized.endsWith('\\app\\resources\\codex')
    )
  );
}

// ── Injectable deps ─────────────────────────────────────────────────

export interface ToolDetectionDeps {
  /** Platform override (defaults to os.platform()). */
  platform?: NodeJS.Platform;
  /** $HOME override (defaults to os.homedir()). */
  home?: string;
  /** Environment override for platform-specific config roots. */
  env?: NodeJS.ProcessEnv;
  /** Working directory override (defaults to process.cwd()). */
  cwd?: string;
  /**
   * Existence probe. Returns true iff the given path exists and is
   * readable by the current process. Production implementation uses
   * `fs.access(p, F_OK)`.
   */
  exists?: (p: string) => Promise<boolean>;
  /**
   * Best-effort version reader. Spawns the binary with the given args
   * and returns trimmed stdout, or null on any failure (non-zero
   * exit, ENOENT, spawn error). The detector layers a fallback on
   * top — `null` here means "could not determine".
   */
  execVersion?: (binary: string, args: string[]) => Promise<string | null>;
  /**
   * Read a JSON file. Returns parsed value, or null on any failure
   * (missing, malformed, permission denied).
   */
  readJson?: (p: string) => Promise<unknown>;
  /**
   * PATH lookup shim. Given a logical binary name ('claude'), returns
   * the resolved absolute path or null. Production implementation uses
   * `where.exe` on win32 and `which` on POSIX.
   */
  pathFromEnv?: (name: string) => string | Promise<string | null> | null;
  /**
   * Registered Windows Store application executables, keyed by built-in tool
   * id. Injected so AppX discovery stays hermetic in tests.
   */
  windowsAppExecutables?: () =>
    WindowsAppExecutables | Promise<WindowsAppExecutables>;
}

// ── Default deps (production-only paths) ────────────────────────────

async function defaultExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function defaultExecVersion(
  binary: string,
  args: string[],
): Promise<string | null> {
  try {
    const invocation = resolveToolCommandInvocation(binary, args);
    const { stdout } = await execFileAsync(invocation.binary, invocation.args, {
      timeout: 5000,
      // Don't allow shell expansion; binary paths must be literal.
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

async function defaultReadJson(p: string): Promise<unknown> {
  try {
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Env for the `which`/`where` lookup. On POSIX, merge the resolved login-shell
 * PATH (GUI-launched sidecars inherit a bare PATH) so `which claude`
 * can find CLIs installed behind shell-profile shims. Returns `undefined` (keep
 * the inherited env) on Windows or when no login-shell PATH is available yet.
 */
export function pathLookupEnv(
  platform: NodeJS.Platform = process.platform,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv | undefined {
  if (platform === 'win32') return undefined;
  const shellPath = resolvedShellPath();
  if (!shellPath) return undefined;
  return { ...base, PATH: mergePathValue(shellPath, base.PATH) };
}

async function defaultPathFromEnv(name: string): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where.exe' : 'which';
  const env = pathLookupEnv(process.platform);
  try {
    const { stdout } = await execFileAsync(cmd, [name], {
      timeout: 3000,
      shell: false,
      ...(env ? { env } : {}),
    });
    return selectPathLookupCandidate(stdout, process.platform);
  } catch {
    return null;
  }
}

async function defaultWindowsAppExecutables(): Promise<WindowsAppExecutables> {
  if (process.platform !== 'win32') return EMPTY_WINDOWS_APP_EXECUTABLES;
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) return EMPTY_WINDOWS_APP_EXECUTABLES;
  const powershell = pathWin32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  try {
    const { stdout } = await execFileAsync(
      powershell,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_APPX_QUERY],
      { timeout: 5000, shell: false, windowsHide: true },
    );
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_WINDOWS_APP_EXECUTABLES;
    }
    const record = parsed as Record<string, unknown>;
    const result: Record<string, string[]> = {};
    for (const id of ['claude-desktop', 'codex-desktop']) {
      const values = record[id];
      result[id] = Array.isArray(values)
        ? values.filter(
            (value): value is string =>
              typeof value === 'string' && pathWin32.isAbsolute(value),
          )
        : [];
    }
    return result;
  } catch {
    return EMPTY_WINDOWS_APP_EXECUTABLES;
  }
}

export function selectPathLookupCandidate(
  stdout: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const candidates = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (platform !== 'win32') return candidates[0] ?? null;
  return (
    candidates.find((candidate) => /\.(?:exe|cmd|bat|com)$/i.test(candidate))
    ?? candidates[0]
    ?? null
  );
}

// ── Resolved deps (caller overrides + production defaults) ──────────

interface ResolvedDeps {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  exists: (p: string) => Promise<boolean>;
  execVersion: (binary: string, args: string[]) => Promise<string | null>;
  readJson: (p: string) => Promise<unknown>;
  pathFromEnv: (name: string) => Promise<string | null>;
  windowsAppExecutables: () => Promise<WindowsAppExecutables>;
}

function resolveDeps(opts: ToolDetectionDeps): ResolvedDeps {
  const pathFromEnvOpt = opts.pathFromEnv;
  let windowsAppExecutablesPromise: Promise<WindowsAppExecutables> | undefined;
  return {
    platform: opts.platform ?? osPlatform(),
    home: opts.home ?? homedir(),
    env: opts.env ?? process.env,
    cwd: opts.cwd ?? process.cwd(),
    exists: opts.exists ?? defaultExists,
    execVersion: opts.execVersion ?? defaultExecVersion,
    readJson: opts.readJson ?? defaultReadJson,
    pathFromEnv:
      pathFromEnvOpt === undefined
        ? defaultPathFromEnv
        : async (name: string) => {
            const result = pathFromEnvOpt(name);
            return result instanceof Promise ? await result : result;
          },
    windowsAppExecutables: () => {
      windowsAppExecutablesPromise ??= Promise.resolve()
        .then(() => opts.windowsAppExecutables?.() ?? defaultWindowsAppExecutables())
        .catch(() => EMPTY_WINDOWS_APP_EXECUTABLES);
      return windowsAppExecutablesPromise;
    },
  };
}

// ── Hook status (shared across all tools) ───────────────────────────

// Hook-pointer paths + roots come from each tool's ToolManifest (the registry —
// #5), so third-party adapters and the Claude Desktop MCP bridge need no map.

interface HookProbe {
  hooksInstalled: boolean;
  hookPointerPath: string | null;
}

const CLAUDE_CODE_HOOKS = [
  ['SessionStart', 'session-start'],
  ['UserPromptSubmit', 'user-prompt-submit'],
  ['Stop', 'stop'],
  ['PreCompact', 'pre-compact'],
] as const;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function tokenizeHookCommand(command: string): string[] | null {
  if (/[\r\n\0]/.test(command)) return null;

  const tokens: string[] = [];
  let index = 0;
  while (index < command.length) {
    while (command[index] === ' ' || command[index] === '\t') index += 1;
    if (index >= command.length) break;

    if (command[index] === '"') {
      const end = command.indexOf('"', index + 1);
      if (end === -1 || end === index + 1) return null;
      const token = command.slice(index + 1, end);
      if (/[$`%!]/.test(token)) return null;
      tokens.push(token);
      index = end + 1;
      if (index < command.length && command[index] !== ' ' && command[index] !== '\t') return null;
      continue;
    }

    const start = index;
    while (index < command.length && command[index] !== ' ' && command[index] !== '\t') {
      if (/['";&|<>`^#$%!*?()[\]{}]/.test(command[index])) return null;
      index += 1;
    }
    if (index === start) return null;
    tokens.push(command.slice(start, index));
  }

  return tokens;
}

function isAbsolutePathForPlatform(platform: NodeJS.Platform, candidate: string): boolean {
  return platform === 'win32'
    ? pathWin32.isAbsolute(candidate)
    : pathPosix.isAbsolute(candidate);
}

function normalizedHookPath(platform: NodeJS.Platform, candidate: string): string {
  const normalized = platform === 'win32' ? candidate.replace(/\\/g, '/') : candidate;
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isNodeExecutable(platform: NodeJS.Platform, candidate: string): boolean {
  const normalized = platform === 'win32' ? candidate.toLowerCase() : candidate;
  const allowedBasenames = platform === 'win32' ? ['node', 'node.exe'] : ['node'];
  if (allowedBasenames.includes(normalized)) return true;
  if (!isAbsolutePathForPlatform(platform, candidate)) return false;
  const basename = platform === 'win32'
    ? pathWin32.basename(candidate).toLowerCase()
    : pathPosix.basename(candidate);
  return allowedBasenames.includes(basename);
}

function isClaudeCodeHookCommand(
  command: string,
  basename: string,
  platform: NodeJS.Platform,
): boolean {
  const tokens = tokenizeHookCommand(command);
  if (!tokens || (tokens.length !== 2 && tokens.length !== 4)) return false;
  if (!isNodeExecutable(platform, tokens[0])) return false;
  if (!isAbsolutePathForPlatform(platform, tokens[1])) return false;
  if (tokens.length === 4) {
    if (tokens[2] !== '--cli-path' || !isAbsolutePathForPlatform(platform, tokens[3])) return false;
  }

  const scriptPath = normalizedHookPath(platform, tokens[1]);
  const expected = `/hive-mind-hooks-claude-code/dist/hooks/${basename}.js`;
  const normalizedExpected = platform === 'win32' ? expected.toLowerCase() : expected;
  return scriptPath.endsWith(normalizedExpected);
}

function hasActiveClaudeCodeHooks(settings: unknown, platform: NodeJS.Platform): boolean {
  const settingsRecord = objectRecord(settings);
  const hooks = objectRecord(settingsRecord?.hooks);
  if (!hooks) return false;

  return CLAUDE_CODE_HOOKS.every(([eventName, basename]) => {
    const groups = hooks[eventName];
    if (!Array.isArray(groups)) return false;
    return groups.some((group) => {
      const groupRecord = objectRecord(group);
      if (!groupRecord) return false;
      const entries = groupRecord.hooks;
      if (!Array.isArray(entries)) return false;
      return entries.some((entry) => {
        const entryRecord = objectRecord(entry);
        const command = entryRecord?.command;
        return entryRecord?.type === 'command'
          && typeof command === 'string'
          && isClaudeCodeHookCommand(command, basename, platform);
      });
    });
  });
}

async function activeClaudeCodeHooksHealthy(deps: ResolvedDeps): Promise<boolean> {
  const settingsPath = joinForPlatform(deps.platform, deps.home, '.claude', 'settings.json');
  if (!(await deps.exists(settingsPath))) return false;
  return hasActiveClaudeCodeHooks(await deps.readJson(settingsPath), deps.platform);
}

async function activeHooksHealthy(
  pointerHealthy: boolean,
  toolId: string | undefined,
  deps: ResolvedDeps,
): Promise<boolean> {
  if (!pointerHealthy) return false;
  return toolId !== 'claude-code' || activeClaudeCodeHooksHealthy(deps);
}

function nonBlankEnv(deps: ResolvedDeps, name: string): string | null {
  const value = deps.env[name]?.trim();
  return value ? value : null;
}

function localAppDataRoot(deps: ResolvedDeps): string {
  return nonBlankEnv(deps, 'LOCALAPPDATA')
    ?? joinForPlatform(deps.platform, deps.home, 'AppData', 'Local');
}

function hermesHome(deps: ResolvedDeps): string {
  const configured = nonBlankEnv(deps, 'HERMES_HOME');
  if (configured) {
    return deps.platform === 'win32'
      ? pathWin32.normalize(configured)
      : pathPosix.normalize(configured);
  }
  return deps.platform === 'win32'
    ? joinForPlatform(deps.platform, localAppDataRoot(deps), 'hermes')
    : joinForPlatform(deps.platform, deps.home, '.hermes');
}

async function probeHooks(
  rel: string,
  deps: ResolvedDeps,
  hookRoot: ToolManifest['hookRoot'] = 'user-home',
  toolId?: string,
): Promise<HookProbe> {
  if (!rel) return { hooksInstalled: false, hookPointerPath: null };
  const root = hookRoot === 'hermes-home' ? hermesHome(deps) : deps.home;
  const pointerPath = joinForPlatform(deps.platform, root, rel);
  if (!(await deps.exists(pointerPath))) {
    return { hooksInstalled: false, hookPointerPath: null };
  }
  const parsed = await deps.readJson(pointerPath);
  if (!parsed || typeof parsed !== 'object') {
    return { hooksInstalled: false, hookPointerPath: pointerPath };
  }
  const pointer = parsed as Record<string, unknown>;
  // Current installers use settings_backup. Keep the legacy `backup` alias so
  // older installs remain detectable during upgrade.
  const backup = Object.hasOwn(pointer, 'settings_backup')
    ? pointer.settings_backup
    : pointer.backup;
  const hooksDir = pointer.hooks_dir;
  const hooksDirValid = hooksDir === undefined || hooksDir === null
    ? true
    : typeof hooksDir === 'string' && hooksDir.length > 0 && await deps.exists(hooksDir);
  if (!hooksDirValid) return { hooksInstalled: false, hookPointerPath: pointerPath };
  if (typeof backup === 'string' && backup.length > 0) {
    return {
      hooksInstalled: await activeHooksHealthy(await deps.exists(backup), toolId, deps),
      hookPointerPath: pointerPath,
    };
  }
  // Create-if-missing adapters correctly have no backup. Their pointer is
  // healthy only while the config they created still exists.
  if (backup === null && pointer.created_by_us === true && typeof pointer.config_path === 'string') {
    return {
      hooksInstalled: await activeHooksHealthy(
        await deps.exists(pointer.config_path),
        toolId,
        deps,
      ),
      hookPointerPath: pointerPath,
    };
  }
  return { hooksInstalled: false, hookPointerPath: pointerPath };
}

// ── Per-tool detectors ──────────────────────────────────────────────

/**
 * Generic PATH-lookup detector for CLI-shaped tools. Mirrors the
 * claude-code detector but parameterised by binary name. Used by
 * codex, hermes, and openclaw — they all ship as CLIs reachable
 * via PATH (PATH installer or symlink).
 *
 * If --version exec fails the tool is still reported `installed`
 * with `diagnostic` set (some CLIs don't accept --version).
 */
async function detectByPath(
  id: string,
  binaryName: string,
  deps: ResolvedDeps,
  hookPointer: string,
  displayName: string,
  hookRoot?: ToolManifest['hookRoot'],
): Promise<DetectedTool> {
  const base: DetectedTool = {
    id,
    displayName,
    installed: false,
    installedPath: null,
    version: null,
    hooksInstalled: false,
    hookPointerPath: null,
  };
  const resolved = await deps.pathFromEnv(binaryName);
  if (!resolved) return { ...base, ...(await probeHooks(hookPointer, deps, hookRoot, id)) };
  if (!(await deps.exists(resolved))) {
    return { ...base, ...(await probeHooks(hookPointer, deps, hookRoot, id)) };
  }
  const versionRaw = await deps.execVersion(resolved, ['--version']);
  const hookProbe = await probeHooks(hookPointer, deps, hookRoot, id);
  const blockedWindowsAppsCodex =
    versionRaw === null && isBlockedWindowsAppsCodexPath(id, deps.platform, resolved);
  return {
    ...base,
    installed: true,
    installedPath: resolved,
    version: versionRaw,
    launchable: blockedWindowsAppsCodex ? false : undefined,
    diagnostic: blockedWindowsAppsCodex
      ? CODEX_WINDOWS_APPS_DIAGNOSTIC
      : versionRaw ? undefined : '--version exec failed',
    ...hookProbe,
  };
}

function hermesWindowsCandidatePaths(deps: ResolvedDeps): string[] {
  const base = hermesHome(deps);
  return [
    joinForPlatform(deps.platform, base, 'bin', 'hermes.cmd'),
    joinForPlatform(deps.platform, base, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
    joinForPlatform(deps.platform, base, 'hermes-agent', 'venv', 'Scripts', 'hermes-agent.exe'),
  ];
}

async function detectHealthyWindowsHermes(
  binaryName: string,
  deps: ResolvedDeps,
  hookPointer: string,
  displayName: string,
  hookRoot?: ToolManifest['hookRoot'],
): Promise<DetectedTool> {
  const pathCandidate = await deps.pathFromEnv(binaryName);
  const candidates = [pathCandidate, ...hermesWindowsCandidatePaths(deps)]
    .filter((candidate): candidate is string => Boolean(candidate));
  const uniqueCandidates = candidates.filter((candidate, index) =>
    candidates.findIndex((value) => value.toLowerCase() === candidate.toLowerCase()) === index);
  let firstExisting: string | null = null;

  for (const candidate of uniqueCandidates) {
    if (!(await deps.exists(candidate))) continue;
    firstExisting ??= candidate;
    const version = await deps.execVersion(candidate, ['--version']);
    if (version) {
      return {
        id: 'hermes',
        displayName,
        installed: true,
        installedPath: candidate,
        version,
        ...(await probeHooks(hookPointer, deps, hookRoot, 'hermes')),
      };
    }
  }

  return {
    id: 'hermes',
    displayName,
    installed: firstExisting !== null,
    installedPath: firstExisting,
    version: null,
    launchable: firstExisting ? false : undefined,
    diagnostic: firstExisting ? HERMES_WINDOWS_HEALTH_DIAGNOSTIC : undefined,
    ...(await probeHooks(hookPointer, deps, hookRoot, 'hermes')),
  };
}

// ── Candidate-path helpers (per platform) ───────────────────────────

function cursorCandidatePaths(deps: ResolvedDeps): string[] {
  if (deps.platform === 'win32') {
    return [
      joinForPlatform(deps.platform, deps.home, 'AppData', 'Local', 'Programs', 'cursor', 'Cursor.exe'),
      'C:\\Program Files\\Cursor\\Cursor.exe',
    ];
  }
  if (deps.platform === 'darwin') {
    return ['/Applications/Cursor.app/Contents/MacOS/Cursor'];
  }
  // Linux — AppImage is the common shape; users typically symlink.
  return [
    joinForPlatform(deps.platform, deps.home, '.local', 'share', 'cursor', 'cursor'),
    '/usr/bin/cursor',
    '/usr/local/bin/cursor',
  ];
}

async function claudeDesktopCandidatePaths(deps: ResolvedDeps): Promise<string[]> {
  if (deps.platform === 'win32') {
    const registered = await deps.windowsAppExecutables();
    return [
      ...(registered['claude-desktop'] ?? []),
      joinForPlatform(deps.platform, deps.home, 'AppData', 'Local', 'AnthropicClaude', 'Claude.exe'),
      'C:\\Program Files\\AnthropicClaude\\Claude.exe',
    ];
  }
  if (deps.platform === 'darwin') {
    return ['/Applications/Claude.app/Contents/MacOS/Claude'];
  }
  // Linux — Anthropic does not ship an official Linux client at time
  // of writing (May 2026); we still surface the would-be path so a
  // user-installed AppImage at the expected location is detected.
  return [
    joinForPlatform(deps.platform, deps.home, '.local', 'share', 'claude-desktop', 'claude'),
    '/usr/bin/claude-desktop',
  ];
}

function hermesDesktopCandidatePaths(deps: ResolvedDeps): string[] {
  if (deps.platform === 'win32') {
    const localAppData = localAppDataRoot(deps);
    return [
      joinForPlatform(
        deps.platform,
        hermesHome(deps),
        'hermes-agent',
        'apps',
        'desktop',
        'release',
        'win-unpacked',
        'Hermes.exe',
      ),
      joinForPlatform(deps.platform, localAppData, 'Programs', 'Hermes', 'Hermes.exe'),
      joinForPlatform(deps.platform, localAppData, 'Programs', 'hermes', 'Hermes.exe'),
      'C:\\Program Files\\Hermes\\Hermes.exe',
    ];
  }
  if (deps.platform === 'darwin') {
    return ['/Applications/Hermes.app/Contents/MacOS/Hermes'];
  }
  return [
    joinForPlatform(deps.platform, deps.home, '.local', 'share', 'Hermes', 'Hermes'),
    '/opt/Hermes/Hermes',
  ];
}

async function codexDesktopCandidatePaths(deps: ResolvedDeps): Promise<string[]> {
  if (deps.platform === 'win32') {
    const registered = await deps.windowsAppExecutables();
    const codexPath = await deps.pathFromEnv('codex');
    const normalized = codexPath?.replace(/\//g, '\\') ?? '';
    const storeDesktopPath = /\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\resources\\codex(?:\.exe)?$/i.test(normalized)
      ? pathWin32.join(pathWin32.dirname(pathWin32.dirname(normalized)), 'ChatGPT.exe')
      : null;
    return [
      ...(registered['codex-desktop'] ?? []),
      ...(storeDesktopPath ? [storeDesktopPath] : []),
      joinForPlatform(deps.platform, deps.home, 'AppData', 'Local', 'OpenAI', 'Codex.exe'),
      'C:\\Program Files\\OpenAI\\Codex.exe',
    ];
  }
  if (deps.platform === 'darwin') {
    return ['/Applications/Codex.app/Contents/MacOS/Codex'];
  }
  return [
    joinForPlatform(deps.platform, deps.home, '.local', 'share', 'codex-desktop', 'codex'),
    '/usr/bin/codex-desktop',
  ];
}

/**
 * Shared detector body for tools detected by candidate-path probing
 * (i.e. desktop apps that are NOT on the user's PATH).
 */
async function detectByCandidates(
  id: string,
  candidates: string[],
  deps: ResolvedDeps,
  withVersion: boolean,
  hookPointer: string,
  displayName: string,
  hookRoot?: ToolManifest['hookRoot'],
): Promise<DetectedTool> {
  const base: DetectedTool = {
    id,
    displayName,
    installed: false,
    installedPath: null,
    version: null,
    hooksInstalled: false,
    hookPointerPath: null,
  };
  for (const candidate of candidates) {
    if (await deps.exists(candidate)) {
      const versionRaw = withVersion
        ? await deps.execVersion(candidate, ['--version'])
        : null;
      const hookProbe = await probeHooks(hookPointer, deps, hookRoot, id);
      return {
        ...base,
        installed: true,
        installedPath: candidate,
        version: versionRaw,
        diagnostic:
          withVersion && versionRaw === null ? '--version exec failed' : undefined,
        ...hookProbe,
      };
    }
  }
  return { ...base, ...(await probeHooks(hookPointer, deps, hookRoot, id)) };
}

// ── Registry-driven detection ───────────────────────────────────────

/**
 * Built-in candidate-path resolvers (the escape hatch — GUI/desktop tools
 * whose paths are platform-branching code, not declarative data). Keyed by
 * built-in id; third-party adapters are PATH-only so never need an entry.
 */
const CANDIDATE_RESOLVERS: Record<string, (deps: ResolvedDeps) => string[] | Promise<string[]>> = {
  'cursor': cursorCandidatePaths,
  'claude-desktop': claudeDesktopCandidatePaths,
  'codex-desktop': codexDesktopCandidatePaths,
  'hermes-desktop': hermesDesktopCandidatePaths,
};

function withManifestMetadata(tool: DetectedTool, manifest: ToolManifest): DetectedTool {
  return {
    ...tool,
    releaseStatus: manifest.releaseStatus,
    launchable: tool.launchable ?? manifest.launchable,
    hookCapable: manifest.hookCapable,
    builtin: manifest.builtin === true,
    acceptsInlinePrompt: Boolean(manifest.promptArgTemplate?.length),
    capabilities: manifest.capabilities,
    permissionModes: manifest.task?.permissionModes ?? [],
  };
}

/** Detect one tool from its manifest: PATH lookup, or the candidate resolver. */
async function detectFromManifest(m: ToolManifest, deps: ResolvedDeps): Promise<DetectedTool> {
  if (m.detect.kind === 'path') {
    if (m.id === 'hermes' && deps.platform === 'win32') {
      return withManifestMetadata(
        await detectHealthyWindowsHermes(
          m.detect.binaryName,
          deps,
          m.hookPointer,
          m.displayName,
          m.hookRoot,
        ),
        m,
      );
    }
    return withManifestMetadata(
      await detectByPath(m.id, m.detect.binaryName, deps, m.hookPointer, m.displayName, m.hookRoot),
      m,
    );
  }
  const resolver = CANDIDATE_RESOLVERS[m.id];
  const candidates = resolver ? await resolver(deps) : [];
  return withManifestMetadata(
    await detectByCandidates(
      m.id,
      candidates,
      deps,
      /* withVersion */ false,
      m.hookPointer,
      m.displayName,
      m.hookRoot,
    ),
    m,
  );
}

/**
 * Run every registered tool's detector in parallel and assemble the envelope.
 * The registry = built-in manifests (source of truth in @waggle/shared) +
 * validated third-party adapters from ~/.waggle/adapters/*.json (#5). Order is
 * deterministic (registry order) so the UI doesn't shuffle between calls.
 */
export async function detectInstalledTools(
  opts: ToolDetectionDeps & { manifestLoader?: ManifestLoaderDeps } = {},
): Promise<ToolDetectionResult> {
  const deps = resolveDeps(opts);
  // POSIX GUI sidecars: wait for the login-shell PATH before the first lookup,
  // otherwise every probe runs against the bare PATH and misses shim-installed
  // CLIs (and callers cache that empty result). Cached after the first call.
  if (deps.platform !== 'win32') await resolveShellEnv();
  const registry = getToolRegistry(opts.manifestLoader);
  const tools = await Promise.all(registry.map((m) => detectFromManifest(m, deps)));
  return {
    platform: deps.platform,
    detectedAt: new Date().toISOString(),
    tools,
  };
}
