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
  SUPPORTED_TOOLS,
  TOOL_DISPLAY_NAMES,
  type DetectedTool,
  type ToolDetectionResult,
  type ToolId,
} from '@waggle/shared';

const execFileAsync = promisify(execFile);

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
    const { stdout } = await execFileAsync(binary, args, {
      timeout: 5000,
      // Don't allow shell expansion; binary paths must be literal.
      shell: false,
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
    const first = stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
    return first ? first.trim() : null;
  } catch {
    return null;
  }
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

/**
 * Map from tool id to the config-dir (relative to $HOME) where its
 * hive-mind hook pointer file lives. Mirrors the conventions in the
 * `packages/hive-mind-hooks-*` installers.
 *
 * Linux config-dir for Cursor and Claude Desktop is the standard XDG
 * location — `~/.config/<tool>`. Claude Code uses `~/.claude` on every
 * platform (per the existing shim).
 */
const HOOK_POINTER_BY_TOOL: Record<ToolId, string> = {
  'claude-code': '.claude/hive-mind-install.json',
  'claude-desktop': '.config/Claude/hive-mind-install.json',
  'cursor': '.cursor/hive-mind-install.json',
  'codex': '.codex/hive-mind-install.json',
  'codex-desktop': '.config/Codex/hive-mind-install.json',
  'hermes': '.hermes/hive-mind-install.json',
  'openclaw': '.openclaw/hive-mind-install.json',
};

interface HookProbe {
  hooksInstalled: boolean;
  hookPointerPath: string | null;
}

async function probeHooks(toolId: ToolId, deps: ResolvedDeps): Promise<HookProbe> {
  const rel = HOOK_POINTER_BY_TOOL[toolId];
  if (!rel) return { hooksInstalled: false, hookPointerPath: null };
  const pointerPath = joinForPlatform(deps.platform, deps.home, rel);
  if (!(await deps.exists(pointerPath))) {
    return { hooksInstalled: false, hookPointerPath: null };
  }
  const parsed = await deps.readJson(pointerPath);
  if (!parsed || typeof parsed !== 'object') {
    return { hooksInstalled: false, hookPointerPath: pointerPath };
  }
  const backup = (parsed as Record<string, unknown>).backup;
  if (typeof backup !== 'string' || backup.length === 0) {
    return { hooksInstalled: false, hookPointerPath: pointerPath };
  }
  const backupExists = await deps.exists(backup);
  return { hooksInstalled: backupExists, hookPointerPath: pointerPath };
}

// ── Per-tool detectors ──────────────────────────────────────────────

async function detectClaudeCode(deps: ResolvedDeps): Promise<DetectedTool> {
  const id: ToolId = 'claude-code';
  const base: DetectedTool = {
    id,
    displayName: TOOL_DISPLAY_NAMES[id],
    installed: false,
    installedPath: null,
    version: null,
    hooksInstalled: false,
    hookPointerPath: null,
  };
  // PATH lookup is the canonical install signal for the CLI.
  const resolved = await deps.pathFromEnv('claude');
  if (!resolved) return { ...base, ...(await probeHooks(id, deps)) };
  // Defense-in-depth: confirm the resolved path actually exists.
  if (!(await deps.exists(resolved))) {
    return { ...base, ...(await probeHooks(id, deps)) };
  }
  const versionRaw = await deps.execVersion(resolved, ['--version']);
  const hookProbe = await probeHooks(id, deps);
  return {
    ...base,
    installed: true,
    installedPath: resolved,
    version: versionRaw,
    diagnostic: versionRaw ? undefined : '--version exec failed',
    ...hookProbe,
  };
}

async function detectCursor(deps: ResolvedDeps): Promise<DetectedTool> {
  const id: ToolId = 'cursor';
  const candidates = cursorCandidatePaths(deps);
  return await detectByCandidates(id, candidates, deps, /* withVersion */ false);
}

async function detectClaudeDesktop(deps: ResolvedDeps): Promise<DetectedTool> {
  const id: ToolId = 'claude-desktop';
  const candidates = claudeDesktopCandidatePaths(deps);
  return await detectByCandidates(id, candidates, deps, /* withVersion */ false);
}

/**
 * Phase 0 stub for tools outside the launch cohort. Always reports
 * not-installed but still goes through `probeHooks` so an existing
 * hive-mind install of a deferred-cohort tool is still surfaced —
 * we don't *hide* it just because we haven't written its binary
 * detector yet.
 */
async function detectDeferredCohort(
  id: ToolId,
  deps: ResolvedDeps,
): Promise<DetectedTool> {
  const hookProbe = await probeHooks(id, deps);
  return {
    id,
    displayName: TOOL_DISPLAY_NAMES[id],
    installed: false,
    installedPath: null,
    version: null,
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

/**
 * Shared detector body for tools detected by candidate-path probing
 * (i.e. desktop apps that are NOT on the user's PATH).
 */
async function detectByCandidates(
  id: ToolId,
  candidates: string[],
  deps: ResolvedDeps,
  withVersion: boolean,
): Promise<DetectedTool> {
  const base: DetectedTool = {
    id,
    displayName: TOOL_DISPLAY_NAMES[id],
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
      const hookProbe = await probeHooks(id, deps);
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
  return { ...base, ...(await probeHooks(id, deps)) };
}

// ── Orchestrator ────────────────────────────────────────────────────

/**
 * Run every supported tool's detector in parallel and assemble the
 * envelope. Deterministic order (matches SUPPORTED_TOOLS) so the UI
 * doesn't shuffle between calls.
 */
export async function detectInstalledTools(
  opts: ToolDetectionDeps = {},
): Promise<ToolDetectionResult> {
  const deps = resolveDeps(opts);
  const detectorsById: Record<ToolId, () => Promise<DetectedTool>> = {
    'claude-code': () => detectClaudeCode(deps),
    'cursor': () => detectCursor(deps),
    'claude-desktop': () => detectClaudeDesktop(deps),
    'codex': () => detectDeferredCohort('codex', deps),
    'codex-desktop': () => detectDeferredCohort('codex-desktop', deps),
    'hermes': () => detectDeferredCohort('hermes', deps),
    'openclaw': () => detectDeferredCohort('openclaw', deps),
  };
  // Preserve SUPPORTED_TOOLS order in the output envelope.
  const tools = await Promise.all(
    SUPPORTED_TOOLS.map((id) => detectorsById[id]()),
  );
  return {
    platform: deps.platform,
    detectedAt: new Date().toISOString(),
    tools,
  };
}
