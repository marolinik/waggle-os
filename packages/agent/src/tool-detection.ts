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

const execFileAsync = promisify(execFile);
const CODEX_WINDOWS_APPS_DIAGNOSTIC =
  'Codex was found in WindowsApps, but Windows blocks command-line launch from that app alias. Install a PATH CLI build of Codex or launch Codex from Start, then refresh.';

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

async function defaultPathFromEnv(name: string): Promise<string | null> {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, [name], {
      timeout: 3000,
      shell: false,
    });
    return selectPathLookupCandidate(stdout, process.platform);
  } catch {
    return null;
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
  cwd: string;
  exists: (p: string) => Promise<boolean>;
  execVersion: (binary: string, args: string[]) => Promise<string | null>;
  readJson: (p: string) => Promise<unknown>;
  pathFromEnv: (name: string) => Promise<string | null>;
}

function resolveDeps(opts: ToolDetectionDeps): ResolvedDeps {
  const pathFromEnvOpt = opts.pathFromEnv;
  return {
    platform: opts.platform ?? osPlatform(),
    home: opts.home ?? homedir(),
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
  };
}

// ── Hook status (shared across all tools) ───────────────────────────

// Hook-pointer paths + display names now come from each tool's ToolManifest
// (the registry — #5). probeHooks takes the resolved relative pointer directly,
// so third-party adapters work with no per-tool map. (The claude-desktop pointer
// '.config/Claude/...' is still a known-approximate placeholder — see its
// manifest in @waggle/shared; it has no lifecycle-hook surface yet.)

interface HookProbe {
  hooksInstalled: boolean;
  hookPointerPath: string | null;
}

async function probeHooks(rel: string, deps: ResolvedDeps): Promise<HookProbe> {
  if (!rel) return { hooksInstalled: false, hookPointerPath: null };
  const pointerPath = joinForPlatform(deps.platform, deps.home, rel);
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
    return { hooksInstalled: await deps.exists(backup), hookPointerPath: pointerPath };
  }
  // Create-if-missing adapters correctly have no backup. Their pointer is
  // healthy only while the config they created still exists.
  if (backup === null && pointer.created_by_us === true && typeof pointer.config_path === 'string') {
    return {
      hooksInstalled: await deps.exists(pointer.config_path),
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
  if (!resolved) return { ...base, ...(await probeHooks(hookPointer, deps)) };
  if (!(await deps.exists(resolved))) {
    return { ...base, ...(await probeHooks(hookPointer, deps)) };
  }
  const versionRaw = await deps.execVersion(resolved, ['--version']);
  const hookProbe = await probeHooks(hookPointer, deps);
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

function claudeDesktopCandidatePaths(deps: ResolvedDeps): string[] {
  if (deps.platform === 'win32') {
    return [
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

function codexDesktopCandidatePaths(deps: ResolvedDeps): string[] {
  // OpenAI Codex Desktop is unreleased at time of writing (May 2026)
  // but the hook package already targets it. Use the conventional
  // per-platform vendor paths so a future official install is
  // detected automatically.
  if (deps.platform === 'win32') {
    return [
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
      const hookProbe = await probeHooks(hookPointer, deps);
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
  return { ...base, ...(await probeHooks(hookPointer, deps)) };
}

// ── Registry-driven detection ───────────────────────────────────────

/**
 * Built-in candidate-path resolvers (the escape hatch — GUI/desktop tools
 * whose paths are platform-branching code, not declarative data). Keyed by
 * built-in id; third-party adapters are PATH-only so never need an entry.
 */
const CANDIDATE_RESOLVERS: Record<string, (deps: ResolvedDeps) => string[]> = {
  'cursor': cursorCandidatePaths,
  'claude-desktop': claudeDesktopCandidatePaths,
  'codex-desktop': codexDesktopCandidatePaths,
};

function withManifestMetadata(tool: DetectedTool, manifest: ToolManifest): DetectedTool {
  return {
    ...tool,
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
    return withManifestMetadata(
      await detectByPath(m.id, m.detect.binaryName, deps, m.hookPointer, m.displayName),
      m,
    );
  }
  const resolver = CANDIDATE_RESOLVERS[m.id];
  const candidates = resolver ? resolver(deps) : [];
  return withManifestMetadata(
    await detectByCandidates(m.id, candidates, deps, /* withVersion */ false, m.hookPointer, m.displayName),
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
  const registry = getToolRegistry(opts.manifestLoader);
  const tools = await Promise.all(registry.map((m) => detectFromManifest(m, deps)));
  return {
    platform: deps.platform,
    detectedAt: new Date().toISOString(),
    tools,
  };
}
