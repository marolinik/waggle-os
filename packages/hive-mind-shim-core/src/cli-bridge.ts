/**
 * Bridge to hive-mind-cli — uses `mcp call <tool>` for all MCP tools
 * uniformly. Single chokepoint, no per-command CLI surface drift.
 *
 * Wire format: spawn `hive-mind-cli mcp call <tool> --args <json> --json`
 * as a short-lived child process; parse stdout JSON. The CLI prints the
 * McpCallResult shape (see hive-mind/packages/cli/src/commands/mcp-call.ts).
 *
 * IMPORTANT (Commit 1.4 — MCP surface alignment):
 *   - There is no `switch_workspace` MCP tool. Workspace targeting is
 *     per-call: `save_memory` and `recall_memory` accept a `workspace`
 *     argument naming a workspace id. The bridge tracks an "active
 *     workspace id" via `setWorkspaceById` so callers don't have to
 *     thread it through every call. Pass `undefined` to clear.
 *   - The MCP `save_memory.source` field is a four-value provenance
 *     enum (`'user_stated' | 'tool_verified' | 'agent_inferred' |
 *     'system'`), NOT the IDE name. Hook captures use `'system'`.
 *   - `save_memory` does NOT accept `scope`, `parent`, or `metadata` —
 *     those fields on HookFrame are flattened into a content prefix
 *     by `frameToSavePayload` before reaching the wire.
 *   - `cleanup_frames` is the actual MCP tool name (was `compact_memory`
 *     in the original brief; alias removed in Commit 1.4).
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { frameToSavePayload, type HookFrame, type SaveMemorySource } from './frame-encoder.js';
import { withRetry, type RetryOptions } from './retry-bridge.js';
import { createLogger, type Logger } from './logger.js';

export interface McpCallResultContent {
  type: string;
  text?: string;
  [k: string]: unknown;
}

export interface McpCallResult {
  ok: boolean;
  tool: string;
  content?: McpCallResultContent[];
  isError?: boolean;
  error?: string;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options?: SpawnOptions,
) => ChildProcess;

export type { SaveMemorySource };

export interface CliBridgeOptions {
  /** Path to (or PATH-resolved name of) the hive-mind-cli binary. Default 'hive-mind-cli'. */
  cli_path?: string;
  /** Default per-call timeout in ms. Default 5000. */
  timeout_ms?: number;
  /** Default retry count. Default 3. */
  max_retries?: number;
  /** Initial active workspace id (omit for personal mind). */
  initial_workspace_id?: string;
  /** Logger override. */
  logger?: Logger;
  /** Test hook — overrides child_process.spawn. */
  spawnImpl?: SpawnFn;
}

export interface SaveMemoryResult {
  /** Frame id as returned by the upstream save_memory tool, stringified. */
  id: string;
  success: boolean;
  /** Workspace the frame was saved into ('personal' if no workspace was active). */
  workspace: string;
}

/** Shape returned by `recall_memory` for a single hit. Matches upstream. */
export interface MemoryHit {
  id: number;
  content: string;
  importance: string;
  source: string;
  score: number;
  created_at: string;
  /** 'personal' or `workspace:<id>` depending on origin. */
  from: string;
}

export interface RecallMemoryOptions {
  limit?: number;
  workspace?: string;
  scope?: 'current' | 'personal' | 'all';
  profile?: 'balanced' | 'recent' | 'important' | 'connected';
}

export interface CallMcpOptions {
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
}

export type CleanupMode = 'compact' | 'wipe_imports' | 'wipe_all' | 'reconcile';

export interface CleanupFramesOptions {
  workspace?: string;
  /** Default 'compact' (safe maintenance). 'wipe_all' is destructive. */
  mode?: CleanupMode;
  maxTempAgeDays?: number;
  maxDeprecatedAgeDays?: number;
}

export interface CliBridge {
  /** Generic escape hatch for any MCP tool not covered by a wrapper. */
  callMcpTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
    opts?: CallMcpOptions,
  ): Promise<T>;
  /** Save a HookFrame; lossy fields (scope/parent) flatten into the content prefix. */
  saveMemory(frame: HookFrame, opts?: { workspace?: string }): Promise<SaveMemoryResult>;
  /** Hybrid-search recall against personal mind (default) or a named workspace. */
  recallMemory(query: string, opts?: RecallMemoryOptions): Promise<MemoryHit[]>;
  /** Trigger upstream's frame compaction maintenance pass. Default mode='compact'. */
  cleanupFrames(opts?: CleanupFramesOptions): Promise<{ pruned: number }>;
  /** Set / clear the active workspace id used by save+recall when caller doesn't specify. */
  setWorkspaceById(workspaceId: string | undefined): void;
  /** Read the active workspace id (undefined = personal mind). */
  getActiveWorkspaceId(): string | undefined;
}

const DEFAULT_CLI_PATH = 'hive-mind-cli';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const SPAWN_GRACE_MS = 500;

interface CollectedOutput {
  stdout: string;
  stderr: string;
  code: number;
}

interface SpawnTarget {
  command: string;
  args: readonly string[];
}

/**
 * Resolve a cross-platform `(command, args)` tuple for invoking the
 * hive-mind CLI. If `cliPath` ends with a JavaScript extension we
 * route through Node directly (works everywhere, no shell quoting).
 *
 * Known limitation (Wave 1): on Windows, a bare `cli_path: 'hive-mind-cli'`
 * will fail with ENOENT because npm's bin is a `.cmd` shim that requires
 * a parent shell to launch. Workaround until Wave 1.5: pass an absolute
 * path to `dist/index.js` via `cli_path` so we route through Node.
 */
function buildSpawnTarget(cliPath: string, args: readonly string[]): SpawnTarget {
  if (cliPath.endsWith('.js') || cliPath.endsWith('.mjs') || cliPath.endsWith('.cjs')) {
    return { command: process.execPath, args: [cliPath, ...args] };
  }
  return { command: cliPath, args };
}

function spawnAndCollect(
  cliPath: string,
  args: readonly string[],
  timeoutMs: number,
  spawnImpl: SpawnFn,
): Promise<CollectedOutput> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const target = buildSpawnTarget(cliPath, args);
    const child = spawnImpl(target.command, target.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      reject(new Error(`hive-mind-cli timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        code: code ?? 0,
      });
    });
  });
}

function parseMcpCallOutput(stdout: string): McpCallResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { ok: false, tool: '', error: 'empty CLI output' };
  }
  try {
    return JSON.parse(trimmed) as McpCallResult;
  } catch (err) {
    return {
      ok: false,
      tool: '',
      error: `failed to parse CLI JSON output: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function unwrapTextContent(result: McpCallResult): string {
  if (!result.content || result.content.length === 0) return '';
  const first = result.content.find((c) => c.type === 'text' && typeof c.text === 'string');
  return typeof first?.text === 'string' ? first.text : '';
}

function tryParseJson<T>(text: string): T | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export function createCliBridge(opts: CliBridgeOptions = {}): CliBridge {
  const cliPath = opts.cli_path ?? DEFAULT_CLI_PATH;
  const defaultTimeout = opts.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const defaultMaxRetries = opts.max_retries ?? DEFAULT_MAX_RETRIES;
  const log = opts.logger ?? createLogger({ name: 'shim-core/cli-bridge' });
  const spawnImpl: SpawnFn = opts.spawnImpl ?? (spawn as unknown as SpawnFn);
  let activeWorkspaceId: string | undefined = opts.initial_workspace_id;

  async function callMcpTool<T>(
    toolName: string,
    args: Record<string, unknown>,
    callOpts: CallMcpOptions = {},
  ): Promise<T> {
    const callTimeout = callOpts.timeoutMs ?? defaultTimeout;
    const retryCfg: RetryOptions = {
      maxRetries: defaultMaxRetries,
      timeoutMs: callTimeout + SPAWN_GRACE_MS * 2,
      ...callOpts.retry,
    };

    return withRetry<T>(async () => {
      const cliArgs = [
        'mcp', 'call', toolName,
        '--args', JSON.stringify(args),
        '--json',
        '--timeout-ms', String(callTimeout),
      ];
      log.debug('hive-mind-cli mcp call', { tool: toolName, cliPath });
      const { stdout, stderr, code } = await spawnAndCollect(
        cliPath,
        cliArgs,
        callTimeout + SPAWN_GRACE_MS,
        spawnImpl,
      );
      if (code !== 0) {
        log.warn('hive-mind-cli exited non-zero', { code, stderr: stderr.slice(0, 500) });
        throw new Error(`hive-mind-cli exited with code ${code}: ${stderr.slice(0, 200)}`);
      }
      const result = parseMcpCallOutput(stdout);
      if (!result.ok) {
        throw new Error(`mcp tool ${toolName} failed: ${result.error ?? 'unknown error'}`);
      }
      if (result.isError) {
        throw new Error(`mcp tool ${toolName} reported isError: ${unwrapTextContent(result)}`);
      }
      const text = unwrapTextContent(result);
      const parsed = tryParseJson<T>(text);
      if (parsed !== undefined) return parsed;
      return result as unknown as T;
    }, retryCfg);
  }

  function setWorkspaceById(workspaceId: string | undefined): void {
    activeWorkspaceId = workspaceId;
  }

  function getActiveWorkspaceId(): string | undefined {
    return activeWorkspaceId;
  }

  async function saveMemory(
    frame: HookFrame,
    opts: { workspace?: string } = {},
  ): Promise<SaveMemoryResult> {
    const payload = frameToSavePayload(frame);
    const wireArgs: Record<string, unknown> = {
      content: payload.content,
      importance: payload.importance,
      source: payload.source,
    };
    const targetWorkspace = opts.workspace ?? activeWorkspaceId;
    if (targetWorkspace) wireArgs['workspace'] = targetWorkspace;

    const result = await callMcpTool<{
      id?: number | string;
      workspace?: string;
    }>('save_memory', wireArgs);
    const rawId = result.id;
    const id = typeof rawId === 'string' ? rawId : (rawId === undefined || rawId === null ? '' : String(rawId));
    return {
      id,
      success: true,
      workspace: result.workspace ?? targetWorkspace ?? 'personal',
    };
  }

  async function recallMemory(
    query: string,
    recallOpts: RecallMemoryOptions = {},
  ): Promise<MemoryHit[]> {
    const wireArgs: Record<string, unknown> = { query };
    if (recallOpts.limit !== undefined) wireArgs['limit'] = recallOpts.limit;
    const targetWorkspace = recallOpts.workspace ?? activeWorkspaceId;
    if (targetWorkspace) wireArgs['workspace'] = targetWorkspace;
    if (recallOpts.scope !== undefined) wireArgs['scope'] = recallOpts.scope;
    if (recallOpts.profile !== undefined) wireArgs['profile'] = recallOpts.profile;

    const raw = await callMcpTool<unknown>('recall_memory', wireArgs);
    if (Array.isArray(raw)) {
      return raw as MemoryHit[];
    }
    // Empty result case: upstream returns plain text "No memories found for query: ..."
    // which our JSON parser falls through on, returning the raw McpCallResult.
    return [];
  }

  async function cleanupFrames(
    cleanupOpts: CleanupFramesOptions = {},
  ): Promise<{ pruned: number }> {
    const wireArgs: Record<string, unknown> = {
      mode: cleanupOpts.mode ?? 'compact',
    };
    const targetWorkspace = cleanupOpts.workspace ?? activeWorkspaceId;
    if (targetWorkspace) wireArgs['workspace'] = targetWorkspace;
    if (cleanupOpts.maxTempAgeDays !== undefined) wireArgs['max_temp_age_days'] = cleanupOpts.maxTempAgeDays;
    if (cleanupOpts.maxDeprecatedAgeDays !== undefined) wireArgs['max_deprecated_age_days'] = cleanupOpts.maxDeprecatedAgeDays;
    const result = await callMcpTool<{ pruned?: number; deleted?: number }>('cleanup_frames', wireArgs);
    return { pruned: result.pruned ?? result.deleted ?? 0 };
  }

  return {
    callMcpTool,
    saveMemory,
    recallMemory,
    cleanupFrames,
    setWorkspaceById,
    getActiveWorkspaceId,
  };
}
