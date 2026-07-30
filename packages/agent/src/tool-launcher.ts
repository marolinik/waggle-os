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
 *   - Launch is registry-validated: all built-ins plus launchable
 *     third-party adapters may be launched when the caller supplies the
 *     runtime registry.
 *   - HOOK install/verify/uninstall is restricted to HOOKS_COHORT:
 *     those tools have hook packages that ship a real bin. Hook actions
 *     therefore route through HOOKS_COHORT, not the launchable registry.
 */

import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { ToolId, ToolManifest } from '@waggle/shared';
import { BUILTIN_TOOL_MANIFESTS } from '@waggle/shared';
import {
  resolveToolCommandInvocation,
  type ToolCommandInvocation,
} from './tool-command.js';
import { buildExternalProcessEnv } from './external-process-env.js';

const execFileAsync = promisify(execFile);

/**
 * Tools whose hive-mind integration package ships a real `bin` and can
 * therefore be installed/verified/uninstalled by the bundled runtime. All
 * seven built-ins qualify: Claude Desktop registers the waggle-memory MCP
 * bridge, while the other six install lifecycle hooks. Hook code paths gate on
 * THIS cohort, not LAUNCH_COHORT, so the UI never offers a hook action that the
 * runtime cannot fulfil.
 */
export const HOOKS_COHORT: readonly ToolId[] =
  BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id as ToolId);

// ── Injectable deps ─────────────────────────────────────────────────

/** Minimal, test-injectable view of a live observed process. */
export interface ObservedHandle {
  /** Subscribe to decoded stdout+stderr text chunks. */
  onData(cb: (chunk: string) => void): void;
  /** Fired once when the process exits. `code` is null on signal-kill. */
  onExit(cb: (code: number | null) => void): void;
}

export interface ToolLauncherDeps {
  /** Override platform (defaults to process.platform). */
  platform?: NodeJS.Platform;
  /** Test seam for the ambient process environment. */
  baseEnv?: NodeJS.ProcessEnv;
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
   * Piped-stdio spawn for OBSERVED launches. Production uses
   * `child_process.spawn` with `stdio:['ignore','pipe','pipe']` and NO
   * `unref` — the sidecar holds the pipes so output can stream, which
   * means the child is tethered to the sidecar (dies on restart). Returns
   * the pid + an abstract ObservedHandle (or { error }).
   */
  spawnObserved?: (
    binary: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
  ) => { pid: number | null; error?: string; handle?: ObservedHandle };
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
    const invocation = resolveSpawnInvocation(binary, args);
    const child = spawn(invocation.binary, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
    });
    child.once('error', () => {
      // Keep async spawn failures from becoming unhandled process errors.
    });
    if (child.pid) child.unref();
    return {
      pid: child.pid ?? null,
      ...(child.pid == null ? { error: 'spawn returned no pid' } : {}),
    };
  } catch (err) {
    return {
      pid: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function defaultSpawnObserved(
  binary: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): { pid: number | null; error?: string; handle?: ObservedHandle } {
  try {
    const invocation = resolveSpawnInvocation(binary, args);
    const child = spawn(invocation.binary, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      // NOT detached, NOT unref'd: observation requires holding the pipes,
      // so the child is tethered to the sidecar lifecycle.
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
    });
    child.once('error', () => {
      // Keep async spawn failures from becoming unhandled process errors.
    });
    if (child.pid == null) {
      return { pid: null, error: 'spawn returned no pid' };
    }
    const handle: ObservedHandle = {
      onData(cb) {
        child.stdout?.on('data', (d: Buffer) => cb(d.toString('utf8')));
        child.stderr?.on('data', (d: Buffer) => cb(d.toString('utf8')));
      },
      onExit(cb) {
        child.on('exit', (code) => cb(code));
      },
    };
    return { pid: child.pid, handle };
  } catch (err) {
    return {
      pid: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function resolveSpawnInvocation(
  binary: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): ToolCommandInvocation {
  return resolveToolCommandInvocation(binary, args, platform);
}

async function defaultExecCapture(
  binary: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string; code: number } | null> {
  try {
    const invocation = resolveToolCommandInvocation(binary, args);
    const { stdout, stderr } = await execFileAsync(invocation.binary, invocation.args, {
      timeout: options?.timeoutMs ?? 30000,
      env: options?.env,
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
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
  baseEnv: NodeJS.ProcessEnv;
  spawnDetached: NonNullable<ToolLauncherDeps['spawnDetached']>;
  spawnObserved: NonNullable<ToolLauncherDeps['spawnObserved']>;
  execCapture: NonNullable<ToolLauncherDeps['execCapture']>;
}

function resolveDeps(opts: ToolLauncherDeps): ResolvedDeps {
  return {
    platform: opts.platform ?? process.platform,
    baseEnv: opts.baseEnv ?? process.env,
    spawnDetached: opts.spawnDetached ?? defaultSpawnDetached,
    spawnObserved: opts.spawnObserved ?? defaultSpawnObserved,
    execCapture: opts.execCapture ?? defaultExecCapture,
  };
}

// ── Public surface ─────────────────────────────────────────────────

export interface LaunchOptions {
  /** The tool to launch. Must resolve to a launchable manifest. */
  id: string;
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
  /** Canonical Waggle/Hive Mind data root for launched hook processes. */
  dataDir?: string;
  /** Canonical collaboration identity for authenticated hook signals. */
  runId?: string;
  roomId?: string;
  /** Ephemeral credential accepted only by WaggleDance transport routes. */
  runToken?: string;
  /**
   * When true, launch in OBSERVED mode (piped stdio) so stdout/stderr can be
   * streamed to the dock. The process is tethered to the sidecar (dies on
   * restart) and is tracked in-memory only. Default (false/absent) is the
   * detached, survives-restart launch.
   */
  observe?: boolean;
  /** Test deps overrides. */
  deps?: ToolLauncherDeps;
  /** Registry used to validate launchability. Defaults to the built-in tools. */
  toolRegistry?: readonly ToolManifest[];
}

export interface LaunchResult {
  ok: boolean;
  pid: number | null;
  /** What we actually executed (for diagnostics). */
  executed: { binary: string; args: string[]; cwd?: string };
  error?: string;
  /**
   * Present only for observed launches (`observe:true`) — the live output
   * handle the caller (the /launch route) wires into the output buffer.
   */
  output?: ObservedHandle;
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
  const manifest = (opts.toolRegistry ?? BUILTIN_TOOL_MANIFESTS).find((m) => m.id === opts.id);
  if (!manifest) {
    return {
      ok: false,
      pid: null,
      executed: { binary: opts.installedPath, args: opts.args ?? [] },
      error: `Tool '${opts.id}' is not registered for launch.`,
    };
  }
  if (!manifest.launchable) {
    return {
      ok: false,
      pid: null,
      executed: { binary: opts.installedPath, args: opts.args ?? [] },
      error: `Tool '${opts.id}' is registered but not launchable.`,
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
  const waggleEnv: NodeJS.ProcessEnv = {};
  if (opts.workspaceId) {
    waggleEnv.WAGGLE_WORKSPACE_ID = opts.workspaceId;
  }
  // Self-enabling: light the SignalBus this pipeline was built to feed.
  // Opt out with signalEmit:false for a silent launch.
  if (opts.signalEmit !== false) {
    waggleEnv.WAGGLE_SIGNAL_EMIT = '1';
  }
  if (opts.sidecarUrl) {
    waggleEnv.WAGGLE_SIDECAR_URL = opts.sidecarUrl;
  }
  if (opts.dataDir) {
    waggleEnv.HIVE_MIND_DATA_DIR = opts.dataDir;
  }
  if (opts.runId && opts.roomId && opts.runToken) {
    waggleEnv.WAGGLE_RUN_ID = opts.runId;
    waggleEnv.WAGGLE_ROOM_ID = opts.roomId;
    waggleEnv.WAGGLE_DANCE_TEAM_ID = `room::${opts.roomId}`;
    waggleEnv.WAGGLE_SENDER_ID = `run::${opts.runId}`;
    waggleEnv.WAGGLE_RUN_TOKEN = opts.runToken;
  }
  const env = buildExternalProcessEnv(deps.baseEnv, waggleEnv, deps.platform);
  // Observed mode: piped-stdio spawn that surfaces a live output handle.
  // Tethered to the sidecar (not unref'd) and tracked in-memory only.
  if (opts.observe) {
    const { pid, error, handle } = deps.spawnObserved(opts.installedPath, args, {
      cwd: opts.cwd,
      env,
    });
    return {
      ok: pid != null && !error,
      pid,
      executed: { binary: opts.installedPath, args, cwd: opts.cwd },
      error,
      ...(handle ? { output: handle } : {}),
    };
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
  /** Waggle data root injected into hook memory commands. */
  dataDir?: string;
  /** Server-resolved runtime override for tests/embedded hosts. */
  runtime?: HookRuntimePaths;
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
  errorCode?: 'hook_runtime_missing';
}

export interface HookRuntimePaths {
  nodePath: string;
  cliEntry: string;
  hookEntry: string;
}

export interface WaggleRuntimePaths {
  nodePath: string;
  cliEntry: string;
}

interface RuntimeResolveDeps {
  nodePath?: string;
  nodeModulesRoots?: string[];
  fileExists?: (path: string) => boolean;
}

const HOOK_BIN_BY_TOOL: Partial<Record<ToolId, string>> = {
  'claude-code': 'dist/bin/claude-code-hooks-cli.js',
  'claude-desktop': 'dist/bin/claude-desktop-hooks.js',
  codex: 'dist/bin/codex-hooks.js',
  'codex-desktop': 'dist/bin/codex-desktop-hooks.js',
  cursor: 'dist/bin/cursor-hooks.js',
  hermes: 'dist/bin/hermes-hooks.js',
  openclaw: 'dist/bin/openclaw-hooks.js',
};

/**
 * Map ToolId → npm package name of the hive-mind hook installer.
 * Exported so callers (and tests) can reason about the same string
 * the installer uses.
 */
export function hookPackageFor(id: ToolId): string {
  return `@waggle/hive-mind-hooks-${id}`;
}

export function resolveHookRuntime(
  id: ToolId,
  deps: RuntimeResolveDeps = {},
): HookRuntimePaths | undefined {
  const fileExists = deps.fileExists ?? existsSync;
  const hookRelative = HOOK_BIN_BY_TOOL[id];
  if (!hookRelative) return undefined;
  for (const root of runtimeNodeModulesRoots(deps.nodeModulesRoots)) {
    const cliEntry = join(root, '@waggle', 'hive-mind-cli', 'dist', 'index.js');
    const hookEntry = join(root, '@waggle', `hive-mind-hooks-${id}`, ...hookRelative.split('/'));
    if (fileExists(cliEntry) && fileExists(hookEntry)) {
      return { nodePath: deps.nodePath ?? process.execPath, cliEntry, hookEntry };
    }
  }
  return undefined;
}

export function resolveWaggleRuntime(deps: RuntimeResolveDeps = {}): WaggleRuntimePaths | undefined {
  const fileExists = deps.fileExists ?? existsSync;
  for (const root of runtimeNodeModulesRoots(deps.nodeModulesRoots)) {
    const cliEntry = join(root, '@waggle', 'hive-mind-cli', 'dist', 'index.js');
    if (fileExists(cliEntry)) return { nodePath: deps.nodePath ?? process.execPath, cliEntry };
  }
  return undefined;
}

function runtimeNodeModulesRoots(explicit?: string[]): string[] {
  const sourceNodeModules = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'node_modules');
  const roots = explicit ?? [
    ...(process.env.NODE_PATH ?? '').split(delimiter).filter(Boolean),
    join(process.cwd(), 'node_modules'),
    sourceNodeModules,
  ];
  return [...new Set(roots.map((candidate) => resolve(candidate)))];
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
      error: `Hook management for '${opts.id}' is not supported — no built-in hook runtime is registered for this tool.`,
    };
  }
  const deps = resolveDeps(opts.deps ?? {});
  const runtime = opts.runtime ?? resolveHookRuntime(opts.id);
  if (!runtime) {
    return {
      ok: false,
      action: opts.action,
      packageName: hookPackageFor(opts.id),
      stdout: '',
      stderr: '',
      code: -1,
      errorCode: 'hook_runtime_missing',
      error: 'The packaged hook runtime is missing. Reinstall Waggle or run the hook-runtime staging step.',
    };
  }
  const args = [runtime.hookEntry, opts.action];
  if (opts.action === 'install' || (opts.action === 'verify' && opts.id === 'openclaw')) {
    args.push('--cli-path', runtime.cliEntry);
  }
  const result = await deps.execCapture(runtime.nodePath, args, {
    timeoutMs: 60000,
    env: buildExternalProcessEnv(deps.baseEnv, {
      WAGGLE_HOOK_NODE_PATH: runtime.nodePath,
      ...(opts.dataDir ? { HIVE_MIND_DATA_DIR: opts.dataDir } : {}),
    }, deps.platform),
  });
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
