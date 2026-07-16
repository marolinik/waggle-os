import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  ExternalToolAccess,
  ToolManifest,
  ToolOutputDialect,
  ToolTaskSpec,
} from '@waggle/shared';
import { resolveToolCommandInvocation } from './tool-command.js';
import { stripAnsi } from './tool-output-buffer.js';
import { buildExternalProcessEnv } from './external-process-env.js';

const MAX_STDOUT = 256 * 1024;
const MAX_STDERR = 64 * 1024;
const MAX_EVENT_TEXT = 8_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_TIMEOUT_MS = 30 * 60 * 1_000;
const DEFAULT_STALL_AFTER_MS = 120_000;
const MIN_STALL_AFTER_MS = 30_000;

export type ExternalRunEventType =
  | 'started' | 'progress' | 'message' | 'tool'
  | 'completed' | 'failed' | 'cancelled' | 'timed_out';

export interface ExternalRunEvent {
  runId: string;
  roomId: string;
  workspaceId: string;
  toolId: string;
  seq: number;
  type: ExternalRunEventType;
  timestamp: string;
  text?: string;
  sessionId?: string;
  pid?: number;
  stalled?: boolean;
}

export interface ExternalToolRunRequest {
  manifest: ToolManifest;
  binary: string;
  workspaceId: string;
  workspacePath: string;
  runId: string;
  roomId: string;
  prompt: string;
  access: ExternalToolAccess;
  timeoutMs?: number;
  stallAfterMs?: number;
  /** Native session id for a resume attempt. */
  sessionId?: string;
  /** Required by managed-agent adapters such as OpenClaw. */
  managedAgentId?: string;
  /** Narrow sidecar transport credential for this run's WaggleDance Room. */
  dance?: { url: string; token: string; nodePath: string; cliEntry: string };
  /** Canonical shared memory root used by hooks and the collaboration CLI. */
  dataDir?: string;
  signal?: AbortSignal;
  onEvent?: (event: ExternalRunEvent) => void;
}

export interface ExternalToolRunResult {
  status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
  exitCode: number | null;
  summary: string;
  sessionId?: string;
  stdoutTail: string;
  stderrTail: string;
  durationMs: number;
}

export interface ExternalProcessHandle {
  pid: number;
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): void };
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): void };
  stdin: { write(value: string): void; end(): void };
  once(event: 'error', cb: (error: Error) => void): void;
  once(event: 'exit', cb: (code: number | null) => void): void;
}

export interface ExternalToolRunnerDeps {
  platform?: NodeJS.Platform;
  baseEnv?: NodeJS.ProcessEnv;
  now?: () => number;
  resolveWorkspacePath?: (workspacePath: string) => string;
  createPromptFile?: (prompt: string) => { path: string; cleanup: () => void };
  spawnProcess?: (
    binary: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ) => ExternalProcessHandle;
  killTree?: (pid: number, platform: NodeJS.Platform) => Promise<void>;
}

interface ParseState {
  finalText: string;
  sessionId?: string;
  error?: string;
}

export async function runExternalTool(
  request: ExternalToolRunRequest,
  deps: ExternalToolRunnerDeps = {},
): Promise<ExternalToolRunResult> {
  const task = requireTaskSpec(request.manifest, request.access, request.sessionId);
  const platform = deps.platform ?? process.platform;
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const workspacePath = (deps.resolveWorkspacePath ?? defaultResolveWorkspacePath)(request.workspacePath);
  if (task.workspaceBinding === 'managed-agent' && !request.managedAgentId) {
    throw new Error(`Tool ${request.manifest.id} requires a managed workspace agent`);
  }
  const timeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
  const requestedStallAfterMs = Math.max(
    MIN_STALL_AFTER_MS,
    request.stallAfterMs ?? DEFAULT_STALL_AFTER_MS,
  );
  const stallAfterMs = requestedStallAfterMs < timeoutMs ? requestedStallAfterMs : undefined;
  const promptFile = task.promptTransport === 'temp-file'
    ? (deps.createPromptFile ?? defaultCreatePromptFile)(request.prompt)
    : undefined;
  const args = renderArgs(
    request.sessionId && task.resumeArgvTemplate ? task.resumeArgvTemplate : task.argvTemplate,
    task,
    request,
    workspacePath,
    promptFile?.path,
    timeoutMs,
  );
  const env = buildExternalToolEnv(deps.baseEnv ?? process.env, request, workspacePath, platform);
  const spawnProcess = deps.spawnProcess ?? defaultSpawnProcess;
  const killTree = deps.killTree ?? defaultKillTree;
  const parseState: ParseState = { finalText: '' };
  let stdout = '';
  let stderr = '';
  let stdoutRemainder = '';
  let seq = 0;
  let abortRequested = request.signal?.aborted ?? false;
  let timedOut = false;
  let killRequested = false;
  let lastEventAtMs = startedAt;
  let stalledEpisode = false;

  const emit = (type: ExternalRunEventType, text?: string, pid?: number, stalled?: boolean) => {
    const emittedAt = now();
    if (stalled !== true) lastEventAtMs = emittedAt;
    request.onEvent?.({
      runId: request.runId,
      roomId: request.roomId,
      workspaceId: request.workspaceId,
      toolId: request.manifest.id,
      seq: ++seq,
      type,
      timestamp: new Date(emittedAt).toISOString(),
      ...(text ? { text: truncate(redact(text, env), MAX_EVENT_TEXT) } : {}),
      ...(parseState.sessionId ? { sessionId: parseState.sessionId } : {}),
      ...(pid ? { pid } : {}),
      ...(stalled !== undefined ? { stalled } : {}),
    });
  };

  if (abortRequested) {
    promptFile?.cleanup();
    emit('cancelled', 'Cancelled before launch');
    return terminalResult('cancelled', null, '', '', '', now() - startedAt);
  }

  let child: ExternalProcessHandle;
  try {
    child = spawnProcess(request.binary, args, { cwd: workspacePath, env });
  } catch (err) {
    promptFile?.cleanup();
    const message = err instanceof Error ? err.message : String(err);
    emit('failed', message);
    return terminalResult('failed', null, message, '', message, now() - startedAt);
  }
  emit('started', `Started ${request.manifest.displayName}`, child.pid);

  const requestKill = async () => {
    if (killRequested) return;
    killRequested = true;
    try { await killTree(child.pid, platform); }
    catch (err) { stderr = appendTail(stderr, err instanceof Error ? err.message : String(err), MAX_STDERR); }
  };

  const abortHandler = () => {
    abortRequested = true;
    void requestKill();
  };
  request.signal?.addEventListener('abort', abortHandler, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    void requestKill();
  }, timeoutMs);
  const stallTimer = stallAfterMs === undefined ? undefined : setInterval(() => {
    if (abortRequested || timedOut) return;
    const idleMs = now() - lastEventAtMs;
    if (!stalledEpisode && idleMs >= stallAfterMs) {
      stalledEpisode = true;
      emit('progress', `[stalled] no output for ${Math.floor(idleMs / 1_000)}s`, undefined, true);
    }
  }, Math.min(stallAfterMs, 1_000));
  stallTimer?.unref();

  const recordOutputActivity = () => {
    const wasStalled = stalledEpisode;
    lastEventAtMs = now();
    if (wasStalled) {
      stalledEpisode = false;
      emit('progress', '[recovered] output resumed', undefined, false);
    }
  };

  child.stdout.on('data', (chunk) => {
    recordOutputActivity();
    const text = chunk.toString();
    stdout = appendTail(stdout, text, MAX_STDOUT);
    stdoutRemainder += text;
    const lines = stdoutRemainder.split(/\r?\n/);
    stdoutRemainder = lines.pop() ?? '';
    for (const line of lines) parseLine(task.outputDialect, line, parseState, emit);
  });
  child.stderr.on('data', (chunk) => {
    recordOutputActivity();
    const text = chunk.toString();
    stderr = appendTail(stderr, text, MAX_STDERR);
    const progress = stripAnsi(text).trim();
    if (progress) emit('progress', progress);
  });
  if (task.promptTransport === 'stdin') child.stdin.write(request.prompt);
  child.stdin.end();

  return await new Promise<ExternalToolRunResult>((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (stallTimer) clearInterval(stallTimer);
      request.signal?.removeEventListener('abort', abortHandler);
      if (stdoutRemainder.trim()) parseLine(task.outputDialect, stdoutRemainder, parseState, emit);
      if (task.outputDialect === 'json' || task.outputDialect === 'openclaw-json') {
        parseWholeJson(stdout, parseState, emit);
      }
      if (task.outputDialect === 'hermes-text') {
        parseState.sessionId = extractSessionId(stripAnsi(stderr)) ?? parseState.sessionId;
      }
      promptFile?.cleanup();

      const cleanStdout = redact(stdout, env);
      const cleanStderr = redact(stderr, env);
      const summary = truncate(
        stripAnsi(
          redact(parseState.finalText, env) ||
          (cleanStdout.trim() || cleanStderr.trim() || spawnError?.message || ''),
        ).trim(),
        MAX_STDOUT,
      );
      let status: ExternalToolRunResult['status'];
      if (timedOut) status = 'timed_out';
      else if (abortRequested) status = 'cancelled';
      else if (spawnError || exitCode !== 0 || parseState.error) status = 'failed';
      else status = 'completed';
      emit(status, status === 'completed' ? summary : (parseState.error || spawnError?.message || cleanStderr || summary));
      resolve({
        ...terminalResult(status, exitCode, summary, cleanStdout, cleanStderr, now() - startedAt),
        ...(parseState.sessionId ? { sessionId: parseState.sessionId } : {}),
      });
    };
    child.once('error', (error) => finish(null, error));
    child.once('exit', (code) => finish(code));
  });
}

export function buildExternalToolEnv(
  base: NodeJS.ProcessEnv,
  request: Pick<ExternalToolRunRequest, 'runId' | 'roomId' | 'workspaceId' | 'dance' | 'dataDir'>,
  workspacePath: string,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  return buildExternalProcessEnv(base, {
    WAGGLE_RUN_ID: request.runId,
    WAGGLE_ROOM_ID: request.roomId,
    WAGGLE_WORKSPACE_ID: request.workspaceId,
    WAGGLE_WORKSPACE_PATH: workspacePath,
    WAGGLE_SENDER_ID: `run::${request.runId}`,
    WAGGLE_DANCE_TEAM_ID: `room::${request.roomId}`,
    ...(request.dance ? {
      WAGGLE_DANCE_URL: request.dance.url,
      WAGGLE_RUN_TOKEN: request.dance.token,
      WAGGLE_CLI_NODE_PATH: request.dance.nodePath,
      WAGGLE_CLI_ENTRY: request.dance.cliEntry,
    } : {}),
    ...(request.dataDir ? { HIVE_MIND_DATA_DIR: request.dataDir } : {}),
    WAGGLE_SIGNAL_EMIT: '0',
    NO_COLOR: '1',
  }, platform);
}

function requireTaskSpec(
  manifest: ToolManifest,
  access: ExternalToolAccess,
  sessionId?: string,
): ToolTaskSpec {
  if (!manifest.capabilities?.headlessTask || !manifest.task) {
    throw new Error(`TOOL_NOT_HEADLESS: ${manifest.displayName} can only be opened interactively`);
  }
  if (!manifest.task.permissionModes.includes(access)) {
    throw new Error(`ACCESS_MODE_UNSUPPORTED: ${manifest.displayName} does not support ${access}`);
  }
  if (sessionId && (!manifest.task.resumable || !manifest.task.resumeArgvTemplate)) {
    throw new Error(`RUN_NOT_RESUMABLE: ${manifest.displayName}`);
  }
  return manifest.task;
}

function renderArgs(
  template: readonly string[],
  task: ToolTaskSpec,
  request: ExternalToolRunRequest,
  workspacePath: string,
  promptFile: string | undefined,
  timeoutMs: number,
): string[] {
  const values: Record<string, string> = {
    prompt: request.prompt,
    workspacePath,
    workspaceId: request.workspaceId,
    runId: request.runId,
    sessionId: request.sessionId ?? '',
    promptFile: promptFile ?? '',
    agentId: request.managedAgentId ?? '',
    timeoutSeconds: String(Math.max(1, Math.ceil(timeoutMs / 1_000))),
  };
  const out: string[] = [];
  for (const part of template) {
    if (part === '{accessArgs}') {
      out.push(...(task.accessArgs[request.access] ?? []));
      continue;
    }
    let rendered = part;
    for (const [name, value] of Object.entries(values)) {
      rendered = rendered.split(`{${name}}`).join(value);
    }
    if (/\{[^{}]+\}/.test(rendered)) throw new Error(`Unresolved adapter placeholder: ${rendered}`);
    out.push(rendered);
  }
  return out;
}

function parseLine(
  dialect: ToolOutputDialect,
  line: string,
  state: ParseState,
  emit: (type: ExternalRunEventType, text?: string) => void,
): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (dialect === 'hermes-text') {
    const plain = stripAnsi(trimmed).trim();
    const session = extractSessionId(plain);
    if (session) state.sessionId = session;
    else if (hasHermesReasoningStyle(trimmed)) emit('progress', plain);
    else if (plain) state.finalText = `${state.finalText}${state.finalText ? '\n' : ''}${plain}`;
    return;
  }
  if (dialect === 'text') {
    const plain = stripAnsi(trimmed).trim();
    const session = extractSessionId(plain);
    if (session) state.sessionId = session;
    else if (plain) state.finalText = `${state.finalText}${state.finalText ? '\n' : ''}${plain}`;
    return;
  }
  let value: unknown;
  try { value = JSON.parse(trimmed); }
  catch {
    if (dialect === 'jsonl' || dialect === 'claude-stream-json' || dialect === 'codex-jsonl') {
      emit('progress', trimmed);
    }
    return;
  }
  parseJsonValue(value, dialect, state, emit);
}

function parseWholeJson(
  text: string,
  state: ParseState,
  emit: (type: ExternalRunEventType, text?: string) => void,
): void {
  try { parseJsonValue(JSON.parse(text), 'json', state, emit); }
  catch { /* the line parser already retained diagnostics */ }
}

function parseJsonValue(
  value: unknown,
  dialect: ToolOutputDialect,
  state: ParseState,
  emit: (type: ExternalRunEventType, text?: string) => void,
): void {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const type = String(record.type ?? record.event ?? record.status ?? '');
  const sessionId = stringValue(record.session_id ?? record.sessionId ?? record.thread_id ?? record.threadId);
  if (sessionId) state.sessionId = sessionId;

  if (dialect === 'claude-stream-json') {
    if (type === 'result') {
      state.finalText = stringValue(record.result) ?? state.finalText;
      if (record.is_error === true) state.error = state.finalText || 'Claude Code reported an error';
      return;
    }
    const blocks = ((record.message as Record<string, unknown> | undefined)?.content ?? record.content) as unknown;
    for (const block of Array.isArray(blocks) ? blocks : []) {
      if (!block || typeof block !== 'object') continue;
      const item = block as Record<string, unknown>;
      if (item.type === 'text' && typeof item.text === 'string') emit('message', item.text);
      if (item.type === 'tool_use') emit('tool', String(item.name ?? 'tool'));
    }
    return;
  }
  if (dialect === 'codex-jsonl') {
    const item = record.item as Record<string, unknown> | undefined;
    if (type.includes('failed') || type === 'error') state.error = extractText(record) || type;
    if (item?.type === 'agent_message') {
      const text = extractText(item);
      if (text) { state.finalText = text; emit('message', text); }
    } else if (item?.type) {
      emit(item.type === 'command_execution' ? 'tool' : 'progress', extractText(item) || String(item.type));
    }
    return;
  }
  const text = extractText(record);
  if (text) state.finalText = text;
  if (type.includes('fail') || type === 'error') state.error = text || type;
}

function extractText(record: Record<string, unknown>): string {
  for (const key of ['result', 'output', 'text', 'message', 'final', 'response', 'content']) {
    const value = record[key];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const nested = extractText(value as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  if (Array.isArray(record.payloads)) {
    for (const value of record.payloads) {
      if (value && typeof value === 'object') {
        const nested = extractText(value as Record<string, unknown>);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractSessionId(value: string): string | undefined {
  return value.match(/(?:session(?:\s+id)?|session_id)\s*[:=]\s*([\w-]+)/i)?.[1];
}

const ANSI_SGR_PATTERN = new RegExp(String.fromCharCode(27) + '\\[([0-9;]*)m', 'g');

function hasHermesReasoningStyle(value: string): boolean {
  ANSI_SGR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANSI_SGR_PATTERN.exec(value)) !== null) {
    if (match[1].split(';').some((code) => code === '2' || code === '3')) return true;
  }
  return false;
}

function appendTail(current: string, chunk: string, max: number): string {
  const next = current + chunk;
  return next.length <= max ? next : next.slice(next.length - max);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function redact(value: string, env: NodeJS.ProcessEnv): string {
  let clean = value;
  for (const [key, secret] of Object.entries(env)) {
    if (!secret || secret.length < 8 || !/(?:KEY|TOKEN|SECRET)$/i.test(key)) continue;
    clean = clean.split(secret).join('[REDACTED]');
  }
  return clean;
}

function terminalResult(
  status: ExternalToolRunResult['status'],
  exitCode: number | null,
  summary: string,
  stdoutTail: string,
  stderrTail: string,
  durationMs: number,
): ExternalToolRunResult {
  return { status, exitCode, summary, stdoutTail, stderrTail, durationMs };
}

function defaultResolveWorkspacePath(workspacePath: string): string {
  const resolved = fs.realpathSync(workspacePath);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Workspace path is not a directory: ${workspacePath}`);
  return resolved;
}

function defaultCreatePromptFile(prompt: string): { path: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-prompt-'));
  const file = path.join(dir, 'prompt.txt');
  fs.writeFileSync(file, prompt, { encoding: 'utf8', mode: 0o600 });
  return { path: file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function defaultSpawnProcess(
  binary: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ExternalProcessHandle {
  const invocation = resolveToolCommandInvocation(binary, args);
  const child = spawn(invocation.binary, invocation.args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    detached: process.platform !== 'win32',
    windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return child as unknown as ExternalProcessHandle;
}

async function defaultKillTree(pid: number, platform: NodeJS.Platform): Promise<void> {
  if (platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], (error) => error ? reject(error) : resolve());
    });
    return;
  }
  try { process.kill(-pid, 'SIGTERM'); }
  catch { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
}
