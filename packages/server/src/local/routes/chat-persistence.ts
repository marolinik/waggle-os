/**
 * chat-persistence.ts — Message persistence functions for the chat route.
 *
 * Extracted from chat.ts to keep files under 800 LOC.
 * These functions depend on `fs`, `path` — no server state.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';

const CHAT_SESSION_STATE_SEPARATOR = '\u0000';
const LEGACY_DEFAULT_CHAT_DIR = 'legacy-chat';
const MANAGED_DEFAULT_CHAT_STATE_ID = '\u0001managed-default';
const CHAT_HISTORY_LAYOUT_FILE = 'chat-history-layout.json';
const DEFAULT_CHAT_SESSION_PREFIX = 'workspaces/default/sessions/';
const DEFAULT_WORKSPACE_CONFIG_PATH = 'workspaces/default/workspace.json';
const CHAT_HISTORY_LAYOUT_VERSION = 1;

export const CHAT_HISTORY_RECOVERY_CODE = 'CHAT_HISTORY_RECOVERY_REQUIRED';

const MAX_CAPABILITY_NEED_CHARS = 2_000;
const MAX_CAPABILITY_RESULT_CHARS = 32_000;
const CAPABILITY_MARKER_AT_END_RE = /<!--\s*waggle:capability_request\s+(\{[^\r\n]*\})\s*-->\s*$/;

export interface PersistedCapabilityReceipt {
  id: string;
  name: 'acquire_capability';
  status: 'done';
  input: { need: string };
  output: string;
}

export interface ChatHistoryMessage {
  role: string;
  content: string;
  model?: string;
  tools?: PersistedCapabilityReceipt[];
}

export type RetryTailExpectation =
  | {
      kind: 'assistant-pair';
      expectedMessageCount: number;
      expectedAssistantContent: string;
    }
  | {
      kind: 'lone-user';
      expectedMessageCount: number;
    };

export type ReplaceRetryTailResult =
  | { ok: true; removed: 1 | 2 }
  | { ok: false; reason: string };

function hasCanonicalCapabilityMarker(result: string): boolean {
  const match = result.match(CAPABILITY_MARKER_AT_END_RE);
  if (!match) return false;
  try {
    const marker = JSON.parse(match[1]) as {
      name?: unknown;
      source?: unknown;
      kind?: unknown;
      packageId?: unknown;
      installType?: unknown;
    };
    const starterRoute = marker.source === 'starter-pack'
      && marker.kind === 'skill'
      && marker.packageId === undefined
      && marker.installType === undefined;
    const marketplaceRoute = marker.source === 'marketplace'
      && marker.kind === 'marketplace'
      && Number.isSafeInteger(marker.packageId)
      && (marker.packageId as number) > 0
      && (marker.installType === 'skill'
        || marker.installType === 'plugin'
        || marker.installType === 'mcp');
    const supportedRoute = starterRoute || marketplaceRoute;
    return typeof marker.name === 'string'
      && marker.name.trim().length > 0
      && marker.name.length <= 200
      && typeof marker.source === 'string'
      && marker.source.trim().length > 0
      && marker.source.length <= 100
      && supportedRoute;
  } catch {
    return false;
  }
}

export function createPersistedCapabilityReceipt(
  input: unknown,
  result: string,
): PersistedCapabilityReceipt | null {
  if (!input || typeof input !== 'object') return null;
  const needValue = (input as { need?: unknown }).need;
  const need = typeof needValue === 'string' ? needValue.trim() : '';
  if (!need || need.length > MAX_CAPABILITY_NEED_CHARS) return null;
  if (!result || result.length > MAX_CAPABILITY_RESULT_CHARS) return null;
  if (result.startsWith('Error:') || result.startsWith('Error ')) return null;
  if (!hasCanonicalCapabilityMarker(result)) return null;
  return {
    id: `capability-${crypto.randomUUID()}`,
    name: 'acquire_capability',
    status: 'done',
    input: { need },
    output: result,
  };
}

export function normalizePersistedCapabilityTools(
  value: unknown,
): PersistedCapabilityReceipt[] | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const receipt = value[0] as Partial<PersistedCapabilityReceipt> | null;
  if (!receipt || receipt.name !== 'acquire_capability' || receipt.status !== 'done') return undefined;
  if (typeof receipt.id !== 'string' || !receipt.id.startsWith('capability-') || receipt.id.length > 128) return undefined;
  if (typeof receipt.output !== 'string') return undefined;
  const normalized = createPersistedCapabilityReceipt(receipt.input, receipt.output);
  if (!normalized) return undefined;
  return [{ ...normalized, id: receipt.id }];
}

export type ChatHistoryLayoutStatus =
  | { status: 'ready' }
  | {
      status: 'recovery-required';
      code: typeof CHAT_HISTORY_RECOVERY_CODE;
      reason: string;
    };

export interface ChatHistoryRestoreEntry {
  relativePath: string;
  content: string;
}

interface ChatHistoryRestoreParticipant {
  isBusy: () => boolean;
  onRestored: () => void;
}

const restoreParticipants = new Map<string, Set<ChatHistoryRestoreParticipant>>();

function restoreParticipantKey(dataDir: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(dataDir);
  } catch {
    resolved = path.resolve(dataDir);
  }
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function registerChatHistoryRestoreParticipant(
  dataDir: string,
  participant: ChatHistoryRestoreParticipant,
): () => void {
  const key = restoreParticipantKey(dataDir);
  const participants = restoreParticipants.get(key) ?? new Set();
  participants.add(participant);
  restoreParticipants.set(key, participants);
  return () => {
    participants.delete(participant);
    if (participants.size === 0) restoreParticipants.delete(key);
  };
}

export function isChatHistoryRestoreBusy(dataDir: string): boolean {
  return [...(restoreParticipants.get(restoreParticipantKey(dataDir)) ?? [])]
    .some((participant) => participant.isBusy());
}

export function notifyChatHistoryRestored(dataDir: string): void {
  for (const participant of restoreParticipants.get(restoreParticipantKey(dataDir)) ?? []) {
    participant.onRestored();
  }
}

/**
 * Classify archive chat paths before restore writes anything. Pre-layout
 * `workspaces/default/sessions` belongs to personal chat only when the archive
 * has no managed-default workspace evidence; otherwise ownership is ambiguous.
 * The archived marker is validated but never restored over the live marker.
 */
export function planChatHistoryRestore<T extends ChatHistoryRestoreEntry>(
  entries: readonly T[],
): T[] {
  const normalized = entries.map((entry) => {
    if (typeof entry.relativePath !== 'string' || typeof entry.content !== 'string') {
      throw new Error('Invalid chat history restore entry.');
    }
    const relativePath = entry.relativePath.replace(/\\/g, '/');
    return {
      entry,
      relativePath,
      comparisonPath: relativePath.toLowerCase(),
    };
  });
  const markers = normalized.filter(({ comparisonPath }) =>
    comparisonPath === CHAT_HISTORY_LAYOUT_FILE);
  if (markers.length > 1) {
    throw new Error('Invalid chat history layout: duplicate marker.');
  }

  const hasRecordedLayout = markers.length === 1;
  if (hasRecordedLayout) {
    try {
      const marker = JSON.parse(
        Buffer.from(markers[0].entry.content, 'base64').toString('utf-8'),
      ) as { version?: unknown; status?: unknown };
      if (
        marker.version !== CHAT_HISTORY_LAYOUT_VERSION
        || marker.status !== 'ready'
      ) {
        throw new Error('unsupported marker');
      }
    } catch {
      throw new Error('Invalid chat history layout marker in backup.');
    }
  }

  const hasDefaultSessions = normalized.some(({ comparisonPath }) =>
    comparisonPath.startsWith(DEFAULT_CHAT_SESSION_PREFIX));
  const hasManagedDefaultConfig = normalized.some(({ comparisonPath }) =>
    comparisonPath === DEFAULT_WORKSPACE_CONFIG_PATH);
  if (!hasRecordedLayout && hasDefaultSessions && hasManagedDefaultConfig) {
    throw new Error(
      'Ambiguous markerless default chat history in backup.',
    );
  }
  if (hasRecordedLayout && hasDefaultSessions && !hasManagedDefaultConfig) {
    throw new Error(
      'Invalid chat history layout: managed default sessions lack workspace metadata.',
    );
  }

  const targetPaths = new Set<string>();
  const planned: T[] = [];
  for (const { entry, relativePath, comparisonPath } of normalized) {
    if (comparisonPath === CHAT_HISTORY_LAYOUT_FILE) continue;
    const defaultSessionPath = comparisonPath.startsWith(DEFAULT_CHAT_SESSION_PREFIX)
      ? `${DEFAULT_CHAT_SESSION_PREFIX}${relativePath.slice(DEFAULT_CHAT_SESSION_PREFIX.length)}`
      : null;
    const defaultWorkspaceConfigPath = comparisonPath === DEFAULT_WORKSPACE_CONFIG_PATH
      ? DEFAULT_WORKSPACE_CONFIG_PATH
      : null;
    const targetPath = defaultSessionPath && !hasRecordedLayout
      ? `${LEGACY_DEFAULT_CHAT_DIR}/${defaultSessionPath}`
      : defaultSessionPath ?? defaultWorkspaceConfigPath ?? relativePath;
    const targetKey = targetPath.toLowerCase();
    if (targetPaths.has(targetKey)) {
      throw new Error(`Invalid chat history layout: duplicate target ${targetPath}.`);
    }
    targetPaths.add(targetKey);
    planned.push({ ...entry, relativePath: targetPath });
  }
  return planned;
}

export function legacyDefaultChatDataDir(dataDir: string): string {
  return path.join(dataDir, LEGACY_DEFAULT_CHAT_DIR);
}

export function chatHistoryDataDir(
  dataDir: string,
  isManagedWorkspace: boolean,
): string {
  return isManagedWorkspace ? dataDir : legacyDefaultChatDataDir(dataDir);
}

export function chatHistoryStateWorkspaceId(
  workspaceId: string,
  isManagedWorkspace: boolean,
): string {
  return workspaceId === 'default' && isManagedWorkspace
    ? MANAGED_DEFAULT_CHAT_STATE_ID
    : workspaceId;
}

export interface ChatHistoryTarget {
  workspaceId: string;
  isManagedWorkspace: boolean;
  dataDir: string;
  stateWorkspaceId: string;
}

export function resolveChatHistoryTarget(
  dataDir: string,
  suppliedWorkspaceId: string | undefined,
  managedDefaultExists: boolean,
): ChatHistoryTarget {
  const workspaceId = suppliedWorkspaceId ?? 'default';
  const isManagedWorkspace = !!suppliedWorkspaceId
    && (workspaceId !== 'default' || managedDefaultExists);
  return {
    workspaceId,
    isManagedWorkspace,
    dataDir: chatHistoryDataDir(dataDir, isManagedWorkspace),
    stateWorkspaceId: chatHistoryStateWorkspaceId(
      workspaceId,
      isManagedWorkspace,
    ),
  };
}

function recoveryRequired(reason: string): ChatHistoryLayoutStatus {
  return {
    status: 'recovery-required',
    code: CHAT_HISTORY_RECOVERY_CODE,
    reason,
  };
}

function readLayoutStatus(markerPath: string): ChatHistoryLayoutStatus | null {
  if (!fs.existsSync(markerPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as {
      version?: unknown;
      status?: unknown;
      reason?: unknown;
    };
    if (parsed.version !== CHAT_HISTORY_LAYOUT_VERSION) {
      return recoveryRequired('Chat history layout marker has an unsupported version.');
    }
    if (parsed.status === 'ready') return { status: 'ready' };
    if (parsed.status === 'recovery-required') {
      return recoveryRequired(
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason
          : 'Chat history layout ownership requires manual recovery.',
      );
    }
    return recoveryRequired('Chat history layout marker is invalid.');
  } catch {
    return recoveryRequired('Chat history layout marker is unreadable.');
  }
}

function recordReadyLayout(markerPath: string): ChatHistoryLayoutStatus {
  const ready: ChatHistoryLayoutStatus = { status: 'ready' };
  const temporaryPath =
    `${markerPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = fs.openSync(temporaryPath, 'wx');
    try {
      fs.writeFileSync(
        handle,
        JSON.stringify({
          version: CHAT_HISTORY_LAYOUT_VERSION,
          ...ready,
          recordedAt: new Date().toISOString(),
        }, null, 2) + '\n',
        'utf-8',
      );
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporaryPath, markerPath);
    return ready;
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // A stale temp file is ignored; only the atomically renamed marker counts.
    }
    const existing = readLayoutStatus(markerPath);
    if (existing) return existing;
    return recoveryRequired(
      `Chat history layout marker could not be recorded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function directoryHasEntries(directory: string): boolean {
  return fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
}

/**
 * Establish durable ownership for the two historical `default` namespaces.
 *
 * Before this layout marker existed, implicit chat and a real managed workspace
 * named `default` could both write `workspaces/default/sessions`. We only move
 * the entire directory when no managed workspace exists, which proves every
 * source file is legacy. If both ownership claims already exist, no timestamps,
 * file contents, or mtimes can safely distinguish them: preserve every byte and
 * fail closed until an operator resolves the ambiguity.
 */
export function isolateLegacyDefaultChatSessions(
  dataDir: string,
): ChatHistoryLayoutStatus {
  const markerPath = path.join(dataDir, CHAT_HISTORY_LAYOUT_FILE);
  const recorded = readLayoutStatus(markerPath);
  if (recorded) return recorded;

  const sourceDir = path.join(dataDir, 'workspaces', 'default', 'sessions');
  const workspaceConfigPath = path.join(
    dataDir,
    'workspaces',
    'default',
    'workspace.json',
  );
  const isolatedDataDir = legacyDefaultChatDataDir(dataDir);
  const targetDir = path.join(isolatedDataDir, 'workspaces', 'default', 'sessions');

  try {
    const sourceHasEntries = directoryHasEntries(sourceDir);
    const targetHasEntries = directoryHasEntries(targetDir);
    const managedDefaultExists = fs.existsSync(workspaceConfigPath);

    if (sourceHasEntries && managedDefaultExists) {
      return recoveryRequired(
        'Existing default-workspace sessions have ambiguous legacy or managed ownership.',
      );
    }
    if (sourceHasEntries && targetHasEntries) {
      return recoveryRequired(
        'Both legacy and pre-layout default chat directories contain sessions.',
      );
    }
    if (sourceHasEntries) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      if (fs.existsSync(targetDir)) fs.rmdirSync(targetDir);
      fs.renameSync(sourceDir, targetDir);
    }
    return recordReadyLayout(markerPath);
  } catch (error) {
    return recoveryRequired(
      `Default chat history layout could not be initialized: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Collision-free process-local key for state that belongs to one chat session.
 * Persisted paths and public session ids remain separate workspace/session fields.
 */
export function chatSessionStateKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}${CHAT_SESSION_STATE_SEPARATOR}${sessionId}`;
}

/** Keep cross-session workflow signals inside their originating workspace. */
export function isChatSessionStateKeyForWorkspace(stateKey: string, workspaceId: string): boolean {
  return stateKey.startsWith(`${workspaceId}${CHAT_SESSION_STATE_SEPARATOR}`);
}

/**
 * Persist a chat message to the session's .jsonl file on disk.
 * This ensures messages survive server restarts.
 */
export function persistMessage(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  msg: ChatHistoryMessage,
): void {
  const sessionsDir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
  const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);

  // Create file with meta line if it doesn't exist
  if (!fs.existsSync(filePath)) {
    const meta = JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() });
    fs.writeFileSync(filePath, meta + '\n', 'utf-8');
  }

  const tools = normalizePersistedCapabilityTools(msg.tools);
  const line = JSON.stringify({
    role: msg.role,
    content: msg.content,
    timestamp: new Date().toISOString(),
    ...(typeof msg.model === 'string' && msg.model.trim() ? { model: msg.model } : {}),
    ...(tools ? { tools } : {}),
  });
  fs.appendFileSync(filePath, line + '\n', 'utf-8');
}

export function retryTailMatches(
  messages: readonly ChatHistoryMessage[],
  userContent: string,
  expectation: RetryTailExpectation,
): boolean {
  if (messages.length !== expectation.expectedMessageCount) return false;
  if (expectation.kind === 'lone-user') {
    const user = messages.at(-1);
    return user?.role === 'user' && user.content === userContent;
  }
  const user = messages.at(-2);
  const assistant = messages.at(-1);
  return user?.role === 'user'
    && user.content === userContent
    && assistant?.role === 'assistant'
    && assistant.content === expectation.expectedAssistantContent;
}

/**
 * Atomically replace the exact durable Retry tail with the fresh user turn.
 * The expected count and content form a compare-and-swap guard: stale tabs or
 * concurrent writers leave the original bytes untouched.
 */
export function replaceRetryTailWithUser(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  userContent: string,
  expectation: RetryTailExpectation,
): ReplaceRetryTailResult {
  const filePath = path.join(
    dataDir,
    'workspaces',
    workspaceId,
    'sessions',
    `${sessionId}.jsonl`,
  );
  if (!fs.existsSync(filePath)) return { ok: false, reason: 'history-missing' };

  let original: string;
  try {
    original = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { ok: false, reason: 'history-unreadable' };
  }
  const lines = original.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0 || lines.some(line => line.trim() === '')) {
    return { ok: false, reason: 'history-malformed' };
  }

  const messages: ChatHistoryMessage[] = [];
  const messageLineIndexes: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(lines[index]) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: 'history-malformed' };
    }
    if (parsed.type === 'meta') continue;
    if (typeof parsed.role !== 'string' || typeof parsed.content !== 'string') {
      return { ok: false, reason: 'history-malformed' };
    }
    messages.push({ role: parsed.role, content: parsed.content });
    messageLineIndexes.push(index);
  }
  if (!retryTailMatches(messages, userContent, expectation)) {
    return { ok: false, reason: 'history-stale' };
  }

  const removed: 1 | 2 = expectation.kind === 'lone-user' ? 1 : 2;
  const firstRemovedLineIndex = messageLineIndexes[messages.length - removed];
  if (firstRemovedLineIndex !== lines.length - removed) {
    return { ok: false, reason: 'history-malformed' };
  }
  const replacement = JSON.stringify({
    role: 'user',
    content: userContent,
    timestamp: new Date().toISOString(),
  });
  const next = [...lines.slice(0, firstRemovedLineIndex), replacement].join('\n') + '\n';
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle: number | undefined;
  try {
    handle = fs.openSync(temporaryPath, 'wx');
    fs.writeFileSync(handle, next, 'utf-8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;

    if (fs.readFileSync(filePath, 'utf-8') !== original) {
      return { ok: false, reason: 'history-changed' };
    }
    const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        fs.renameSync(temporaryPath, filePath);
        return { ok: true, removed };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
        if (!transient || attempt === 4) {
          return { ok: false, reason: 'history-replace-failed' };
        }
        Atomics.wait(waitBuffer, 0, 0, 25 * attempt);
      }
    }
    return { ok: false, reason: 'history-replace-failed' };
  } catch {
    return { ok: false, reason: 'history-write-failed' };
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* already closed */ }
    }
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

/**
 * Strip a trailing failed user+assistant pair from a session's .jsonl file.
 *
 * A chat error persists the user turn followed by an assistant turn whose
 * content begins with GENERATION_FAILED_PREFIX. A client Retry re-issues the
 * same user message, which would leave the old failed pair duplicated on
 * reload. Call this before persisting the retried turn to drop that pair.
 *
 * Only rewrites when the tail is exactly a failed pair (assistant-failure line
 * preceded by a user line). Idempotent and safe otherwise. Returns whether it
 * stripped anything.
 */
export function stripTrailingFailedPair(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
  expectedUserContent?: string,
): boolean {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return false;

  const parse = (line: string): { role?: unknown; content?: unknown; type?: unknown } | null => {
    try { return JSON.parse(line); } catch { return null; }
  };

  const lastIdx = lines.length - 1;
  const last = parse(lines[lastIdx]);
  if (!last || last.type === 'meta' || last.role !== 'assistant'
    || typeof last.content !== 'string' || !last.content.startsWith(GENERATION_FAILED_PREFIX)) {
    return false;
  }
  const prev = parse(lines[lastIdx - 1]);
  if (!prev || prev.type === 'meta' || prev.role !== 'user') return false;
  if (expectedUserContent !== undefined && prev.content !== expectedUserContent) return false;

  const kept = lines.slice(0, lastIdx - 1);
  fs.writeFileSync(filePath, kept.length ? kept.join('\n') + '\n' : '', 'utf-8');
  return true;
}

/**
 * Load chat messages from a session's .jsonl file on disk.
 * Returns messages in the format expected by the agent loop.
 */
export function loadSessionMessages(
  dataDir: string,
  workspaceId: string,
  sessionId: string,
): ChatHistoryMessage[] {
  const filePath = path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) return [];

  const messages: ChatHistoryMessage[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'meta') continue; // skip metadata line
      if (parsed.role && parsed.content !== undefined) {
        const model = typeof parsed.model === 'string' && parsed.model.trim()
          ? parsed.model
          : undefined;
        const tools = normalizePersistedCapabilityTools(parsed.tools);
        messages.push({
          role: parsed.role,
          content: parsed.content,
          ...(model ? { model } : {}),
          ...(tools ? { tools } : {}),
        });
      }
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}
