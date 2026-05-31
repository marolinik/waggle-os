import { vi } from 'vitest';
import type { CliBridge, Logger, MemoryHit, ShimSource } from '@waggle/hive-mind-shim-core';
import type { EventAdapter, Lifecycle } from '../src/event-adapter.js';
import type { HookContext } from '../src/hook-shared.js';

// ── Mock CliBridge ──────────────────────────────────────────────────────
// Mirrors the CC `_test-helpers.ts` mock bridge so handler tests assert on
// the exact recallMemory / saveMemory / cleanupFrames calls without ever
// spawning hive-mind-cli.

export interface MockBridgeOverrides {
  saveMemoryResult?: { id: string; success: boolean; workspace: string };
  recallMemoryHits?: MemoryHit[];
  cleanupFramesResult?: { pruned: number };
  saveMemoryThrows?: Error;
  recallMemoryThrows?: Error;
  cleanupFramesThrows?: Error;
}

export interface MockBridge extends CliBridge {
  saveMemory: ReturnType<typeof vi.fn>;
  recallMemory: ReturnType<typeof vi.fn>;
  cleanupFrames: ReturnType<typeof vi.fn>;
  callMcpTool: ReturnType<typeof vi.fn>;
  setWorkspaceById: ReturnType<typeof vi.fn>;
  getActiveWorkspaceId: ReturnType<typeof vi.fn>;
}

export function makeMockBridge(overrides: MockBridgeOverrides = {}): MockBridge {
  let activeWorkspaceId: string | undefined;
  const saveMemory = overrides.saveMemoryThrows
    ? vi.fn(async () => { throw overrides.saveMemoryThrows; })
    : vi.fn(async () => overrides.saveMemoryResult ?? { id: 'frame-1', success: true, workspace: 'personal' });
  const recallMemory = overrides.recallMemoryThrows
    ? vi.fn(async () => { throw overrides.recallMemoryThrows; })
    : vi.fn(async () => overrides.recallMemoryHits ?? []);
  const cleanupFrames = overrides.cleanupFramesThrows
    ? vi.fn(async () => { throw overrides.cleanupFramesThrows; })
    : vi.fn(async () => overrides.cleanupFramesResult ?? { pruned: 0 });
  const callMcpTool = vi.fn(async () => ({}));
  const setWorkspaceById = vi.fn((id?: string) => { activeWorkspaceId = id; });
  const getActiveWorkspaceId = vi.fn(() => activeWorkspaceId);
  return {
    saveMemory,
    recallMemory,
    cleanupFrames,
    callMcpTool,
    setWorkspaceById,
    getActiveWorkspaceId,
  } as unknown as MockBridge;
}

// ── Mock Logger ─────────────────────────────────────────────────────────
// The shared handler bodies log via ctx.logger.{debug,warn}. A no-op logger
// keeps test output clean while still satisfying the Logger interface.

export function makeMockLogger(): Logger & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

export function makeCtx(bridge: CliBridge): HookContext {
  return { bridge, logger: makeMockLogger() };
}

// ── Mock EventAdapter ───────────────────────────────────────────────────
// A minimal, configurable adapter that reads snake_case keys off a flat
// payload object — enough to drive every shared handler body.

export interface MockAdapterOverrides {
  source?: ShimSource;
  eventName?: Partial<Record<Lifecycle, string | undefined>>;
  /** Provide a custom formatInject; pass `null` to leave it undefined. */
  formatInject?: ((text: string) => unknown) | null;
  /** Override extractResponse (e.g. to simulate an async transcript read). */
  extractResponse?: EventAdapter['extractResponse'];
}

const DEFAULT_EVENT_NAME: Record<Lifecycle, string | undefined> = {
  'session-start': 'SessionStart',
  'user-prompt-submit': 'UserPromptSubmit',
  stop: 'Stop',
  'pre-compact': 'PreCompact',
};

function pick(payload: unknown, ...keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export function makeMockAdapter(overrides: MockAdapterOverrides = {}): EventAdapter {
  const eventName: Record<Lifecycle, string | undefined> = {
    ...DEFAULT_EVENT_NAME,
    ...overrides.eventName,
  };
  const adapter: EventAdapter = {
    source: overrides.source ?? 'cursor',
    eventName,
    extractCwd: (p) => pick(p, 'cwd'),
    extractSessionId: (p) => pick(p, 'session_id', 'sessionId'),
    extractPrompt: (p) => pick(p, 'prompt'),
    extractResponse:
      overrides.extractResponse ??
      ((p) => pick(p, 'response', 'assistant_message')),
    extractParent: (p) => pick(p, 'parent', 'parent_frame_id'),
  };
  if (overrides.formatInject === undefined) {
    // Default: provide a renamed inject shape so we can assert the seam fires.
    adapter.formatInject = (text: string): unknown => ({ additional_context: text });
  } else if (overrides.formatInject !== null) {
    adapter.formatInject = overrides.formatInject;
  }
  // formatInject === null → leave undefined (no inject seam).
  return adapter;
}

export const HIT_FIXTURE: MemoryHit = {
  id: 1,
  content: '[hm src:cursor event:stop] past observation',
  importance: 'important',
  source: 'system',
  score: 0.87,
  created_at: '2026-05-28T10:00:00.000Z',
  from: 'personal',
};

/** Run `fn` with `process.env[key]` temporarily set, then restore. */
export function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
}
