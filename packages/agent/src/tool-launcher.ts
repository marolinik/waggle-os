/**
 * AI-OS Phase 2A — tool launcher module.
 *
 * Spawns external AI tools (Claude Code, Cursor, Claude Desktop, …)
 * with workspace-context injection, and invokes the hive-mind hook
 * installers (`npx @waggle/hive-mind-hooks-<tool> [install|verify|
 * uninstall]`).
 *
 * Design parallels `tool-detection.ts`:
 *   - All process spawns go through injectable deps so tests are
 *     hermetic (no actual binaries launched).
 *   - Production defaults use Node `child_process.spawn` (detached
 *     for launch, non-detached for the synchronous installer
 *     commands).
 *   - Cross-platform: the candidate-path resolution + workspace
 *     env conventions mirror what `tool-detection.ts` reports, so
 *     the launch path comes from the detection result whenever
 *     possible.
 *
 * Surface:
 *
 *   launchTool({id, installedPath, workspaceId, ...})
 *     Spawn the tool detached. Returns the spawned PID + cwd or
 *     an error reason.
 *
 *   installHooks({id, cliPath?, ...})
 *     Invoke `npx @waggle/hive-mind-hooks-<id> install [--cli-path
 *     <path>]`. Captures stdout/stderr.
 *
 *   verifyHooks / uninstallHooks
 *     Same as installHooks but the second positional arg is
 *     `verify` / `uninstall`.
 *
 * Phase 2A scope:
 *   - Backend module + sidecar routes only. Frontend dock in 2B.
 *   - LAUNCH cohort: all 7 supported tools may be *launched*.
 *   - HOOK install/verify/uninstall is restricted to claude-code:
 *     it is the only tool with a published hook package that ships a
 *     bin (`@waggle/hive-mind-hooks-claude-code`). The other tools'
 *     hook packages are Wave 2/3 `export {}` stubs with no bin, so
 *     `npx @waggle/hive-mind-hooks-<id>` would always fail for the
 *     user. Hook actions therefore route through HOOKS_COHORT, NOT
 *     LAUNCH_COHORT.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolId } from '@waggle/shared';
import { LAUNCH_COHORT } from '@waggle/shared';

const execFileAsync = promisify(execFile);

/**
 * Tools whose hive-mind hook package is real (ships a `bin`) and can
 * therefore be installed/verified/uninstalled via npx. claude-code, codex,
 * codex-desktop, cursor, hermes, and openclaw qualify (all ship a real bin —
 * codex-desktop is a thin re-export of codex that shares ~/.codex/; cursor is
 * a JSON installer with field renames + degraded events; hermes is a YAML
 * installer with 3 events, no PreCompact; openclaw is a JSON5 + in-process-TS
 * installer with 4 events, Stop debounced); the claude-desktop hook package is
 * still a binless `export {}` stub (deferred MCP-bridge category). Hook code
 * paths gate on THIS cohort, not LAUNCH_COHORT, so the UI never offers a hook
 * action that npx cannot fulfil.
 */
export const HOOKS_COHORT: readonly ToolId[] = ['claude-code', 'codex', 'codex-desktop', 'cursor', 'hermes', 'openclaw'] as const;

// ── Injectable deps ─────────────────────────────────────────────────

export interface ToolLauncherDeps {
  /** Override platform (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /**
   * Detached-spawn implementation. Production uses `child_process.spawn`
   * with `detached: true`. Returns { pid } on success or { error }.
   * Caller is responsible for `unref()` so the child outlives the
   * sidecar — the default does this.
   */
  spawnDetached?: (
    binary: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
  ) => { pid: number | null; error?: string };
  /**
   * Synchronous-style exec with captured stdout/stderr. Production
   * uses promisified execFile with a timeout. Returns null on error.
   */
  execCapture?: (
    binary: string,
    args: string[],
    options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
  ) => Promise<{ stdout: string; stderr: string; code: number } | null>;
}

// ── Default deps ────────────────────────────────────────────────────

function defaultSpawnDetached(
  binary: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): { pid: number | null; error?: string } {
  try {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      detached: true,
      stdio: 'ignore',
    });
    if (child.pid) child.unref();
    return { pid: child.pid ?? null };
  } catch (err) {
    return {
      pid: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function defaultExecCapture(
  binary: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string; code: number } | null> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: options?.timeoutMs ?? 30000,
      env: { ...process.env, ...(options?.env ?? {}) },
      shell: false,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { stdout?: string; stderr?: string; code?: number | string };
      const code = typeof e.code === 'number' ? e.code : 1;
      return {
        stdout: e.stdout ?? '',
        stderr:
          e.stderr ?? (err instanceof Error ? err.message : String(err)),
        code,
      };
    }
    return null;
  }
}

interface ResolvedDeps {
  platform: NodeJS.Platform;
  spawnDetached: NonNullable<ToolLauncherDeps['spawnDetached']>;
  execCapture: NonNullable<ToolLauncherDeps['execCapture']>;
}

function resolveDeps(opts: ToolLauncherDeps): ResolvedDeps {
  return {
    platform: opts.platform ?? process.platform,
    spawnDetached: opts.spawnDetached ?? defaultSpawnDetached,
    execCapture: opts.execCapture ?? defaultExecCapture,
  };
}

// ── Public surface ─────────────────────────────────────────────────

export interface LaunchOptions {
  /** The tool to launch. Must be in LAUNCH_COHORT. */
  id: ToolId;
  /**
   * Absolute path to the binary. Typically supplied from a prior
   * `detectInstalledTools()` call. Required because Phase 0
   * detection is the source of truth for where the tool lives.
   */
  installedPath: string;
  /**
   * Workspace id to inject as `WAGGLE_WORKSPACE_ID` in the spawned
   * tool's environment. Hooks pick this up via workspace-resolver
   * for context-aware capture.
   */
  workspaceId?: string;
  /**
   * Working directory for the spawned process. Defaults to the
   * directory containing the binary (`path.dirname(installedPath)`).
   */
  cwd?: string;
  /** Extra arguments to pass to the binary. */
  args?: string[];
  /**
   * When true (default), inject `WAGGLE_SIGNAL_EMIT='1'` so the launched
   * tool's hive-mind hook emits discovery signals back to the sidecar
   * bus. This is what turns the detect→launch→hook→bus→UI pipeline on:
   * without it a dock-launched tool saves memory but stays silent on the
   * bus it was built to feed. Set `false` for a silent launch.
   */
  signalEmit?: boolean;
  /**
   * Sidecar base URL injected as `WAGGLE_SIDECAR_URL` so the launched
   * tool's hook posts signals to the right loopback port (the emitter's
   * fallback is `http://127.0.0.1:3333`). Omit to let the hook use that
   * default. Callers (the /launch route) derive this from the loopback
   * address the UI itself reached.
   */
  sidecarUrl?: string;
  /** Test deps overrides. */
  deps?: ToolLauncherDeps;
}

export interface LaunchResult {
  ok: boolean;
  pid: number | null;
  /** What we actually executed (for diagnostics). */
  executed: { binary: string; args: string[]; cwd?: string };
  error?: string;
}

/**
 * Spawn an external AI tool detached from the sidecar. The spawned
 * process outlives the sidecar (`unref` on success) and gets a
 * workspace-context env injected.
 *
 * Phase 2A behavior:
 *   - Only launch-cohort tools (claude-code / cursor / claude-desktop)
 *     are supported. Others return ok=false with a clear reason.
 *   - The binary path must be supplied (no PATH lookup here — the
 *     caller is expected to pass through a fresh detection result).
 */
export function launchTool(opts: LaunchOptions): LaunchResult {
  if (!LAUNCH_COHORT.includes(opts.id)) {
    return {
      ok: false,
      pid: null,
      executed: { binary: opts.installedPath, args: opts.args ?? [] },
      error: `Tool '${opts.id}' is outside the Phase 2 launch cohort (claude-code, cursor, claude-desktop).`,
    };
  }
  if (!opts.installedPath) {
    return {
      ok: false,
      pid: null,
      executed: { binary: '', args: opts.args ?? [] },
      error: 'installedPath is required (run /api/tools/detect first).',
    };
  }
  const deps = resolveDeps(opts.deps ?? {});
  const args = opts.args ?? [];
  const env: NodeJS.ProcessEnv = {};
  if (opts.workspaceId) {
    env.WAGGLE_WORKSPACE_ID = opts.workspaceId;
  }
  // Self-enabling: light the SignalBus this pipeline was built to feed.
  // Opt out with signalEmit:false for a silent launch.
  if (opts.signalEmit !== false) {
    env.WAGGLE_SIGNAL_EMIT = '1';
  }
  if (opts.sidecarUrl) {
    env.WAGGLE_SIDECAR_URL = opts.sidecarUrl;
  }
  const { pid, error } = deps.spawnDetached(opts.installedPath, args, {
    cwd: opts.cwd,
    env,
  });
  return {
    ok: pid != null && !error,
    pid,
    executed: { binary: opts.installedPath, args, cwd: opts.cwd },
    error,
  };
}

// ── Hook installer surface ──────────────────────────────────────────

export type HookAction = 'install' | 'verify' | 'uninstall';

export interface HookCommandOptions {
  /** The tool whose hooks to manage. */
  id: ToolId;
  /** install / verify / uninstall. */
  action: HookAction;
  /**
   * Optional `--cli-path <path>` for Windows installs where the
   * default `hive-mind-cli` resolution fails (see the claude-code
   * hook README). Falls through verbatim to the installer.
   */
  cliPath?: string;
  /** Test deps overrides. */
  deps?: ToolLauncherDeps;
}

export interface HookCommandResult {
  ok: boolean;
  action: HookAction;
  packageName: string;
  stdout: string;
  stderr: string;
  /** Process exit code (0 = success). */
  code: number;
  error?: string;
}

/**
 * Map ToolId → npm package name of the hive-mind hook installer.
 * Exported so callers (and tests) can reason about the same string
 * the installer uses.
 */
export function hookPackageFor(id: ToolId): string {
  return `@waggle/hive-mind-hooks-${id}`;
}

/**
 * Run `npx @waggle/hive-mind-hooks-<id> <install|verify|uninstall>`.
 *
 * Captures stdout/stderr/exitCode. Failure returns ok=false but the
 * full output is still in the result so the UI can show it to the
 * user (the hook installers emit human-readable progress).
 *
 * On Windows, callers SHOULD provide `cliPath` for `install` —
 * see the claude-code hook README for why.
 */
export async function runHookCommand(
  opts: HookCommandOptions,
): Promise<HookCommandResult> {
  if (!HOOKS_COHORT.includes(opts.id)) {
    return {
      ok: false,
      action: opts.action,
      packageName: hookPackageFor(opts.id),
      stdout: '',
      stderr: '',
      code: -1,
      error: `Hook management for '${opts.id}' is not supported yet — only claude-code and codex ship functional hook packages today.`,
    };
  }
  const deps = resolveDeps(opts.deps ?? {});
  const args = ['--yes', hookPackageFor(opts.id), opts.action];
  if (opts.cliPath && opts.action === 'install') {
    args.push('--cli-path', opts.cliPath);
  }
  const result = await deps.execCapture('npx', args, { timeoutMs: 60000 });
  if (!result) {
    return {
      ok: false,
      action: opts.action,
      packageName: hookPackageFor(opts.id),
      stdout: '',
      stderr: '',
      code: -1,
      error: 'exec failed (binary not found or unknown error)',
    };
  }
  return {
    ok: result.code === 0,
    action: opts.action,
    packageName: hookPackageFor(opts.id),
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
  };
}
