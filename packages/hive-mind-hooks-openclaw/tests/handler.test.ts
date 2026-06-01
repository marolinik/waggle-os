import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '@waggle/hive-mind-shim-core';
import type {
  CliBridge,
  HookFrame,
  MemoryHit,
  SaveMemoryResult,
} from '@waggle/hive-mind-shim-core';
import {
  makeOpenclawHandler,
  type HookContext,
  type InternalHookEventLike,
  type OpenclawHandlerInput,
  type SessionStartExtracted,
  type StopExtracted,
  type UserPromptExtracted,
} from '@waggle/hive-mind-hooks-core';
import {
  openclawAdapter,
  OPENCLAW_EVENT_NAME,
  OPENCLAW_PROVENANCE,
} from '../src/adapter.js';

const SILENT = createLogger({ name: 'test', write: () => { /* swallow log output */ } });

/** A recording mock CliBridge — never shells out, never touches ~/.openclaw. */
interface MockBridge extends CliBridge {
  saved: HookFrame[];
  recalls: number;
  cleanups: number;
}

function makeMockBridge(opts: { hits?: MemoryHit[]; throwOn?: 'save' | 'recall' | 'cleanup' } = {}): MockBridge {
  const saved: HookFrame[] = [];
  const bridge = {
    saved,
    recalls: 0,
    cleanups: 0,
    async callMcpTool<T>(): Promise<T> {
      return undefined as unknown as T;
    },
    async saveMemory(frame: HookFrame): Promise<SaveMemoryResult> {
      if (opts.throwOn === 'save') throw new Error('boom: save_memory failed');
      saved.push(frame);
      return { id: String(saved.length), success: true, workspace: 'personal' };
    },
    async recallMemory(): Promise<MemoryHit[]> {
      bridge.recalls += 1;
      if (opts.throwOn === 'recall') throw new Error('boom: recall_memory failed');
      return opts.hits ?? [];
    },
    async cleanupFrames(): Promise<{ pruned: number }> {
      bridge.cleanups += 1;
      if (opts.throwOn === 'cleanup') throw new Error('boom: cleanup_frames failed');
      return { pruned: 0 };
    },
    setWorkspaceById(): void { /* noop */ },
    getActiveWorkspaceId(): undefined { return undefined; },
  } as unknown as MockBridge;
  return bridge;
}

function ctxFor(bridge: CliBridge): HookContext {
  return { bridge, logger: SILENT };
}

function provScope(sessionId: string): string {
  return `${OPENCLAW_PROVENANCE}:${sessionId}`;
}

function hit(content: string): MemoryHit {
  return { id: 1, content, importance: 'important', source: 'openclaw', score: 1, created_at: '2026-06-01', from: 'personal' };
}

describe('openclawAdapter (event map + field extraction over event.context)', () => {
  it('maps the four lifecycles to OpenClaw type:action keys; pre-compact uses the session: prefix', () => {
    expect(OPENCLAW_EVENT_NAME['session-start']).toBe('agent:bootstrap');
    expect(OPENCLAW_EVENT_NAME['user-prompt-submit']).toBe('message:received');
    expect(OPENCLAW_EVENT_NAME['stop']).toBe('message:sent');
    // HOOK.md-form key (prefixed) — the runtime action drops the session: prefix.
    expect(OPENCLAW_EVENT_NAME['pre-compact']).toBe('session:compact:before');
  });

  it('source is openclaw', () => {
    expect(openclawAdapter.source).toBe('openclaw');
  });

  it('extracts cwd / sessionId (channelId-first) / prompt / response / parent from the context object', () => {
    const received = { cwd: '/work', channelId: 'chan-7', content: 'the inbound prompt' };
    expect(openclawAdapter.extractCwd(received)).toBe('/work');
    expect(openclawAdapter.extractSessionId(received)).toBe('chan-7');
    expect(openclawAdapter.extractPrompt(received)).toBe('the inbound prompt');

    const sent = { content: 'the outbound reply', parentId: 'p-1' };
    expect(openclawAdapter.extractResponse(sent, {})).toBe('the outbound reply');
    expect(openclawAdapter.extractParent(sent)).toBe('p-1');
  });

  it('formatInject produces the { additionalContext } shape pushed into bootstrapFiles', () => {
    expect(openclawAdapter.formatInject?.('recalled frames here')).toEqual({ additionalContext: 'recalled frames here' });
  });
});

// ── makeOpenclawHandler drive path (the in-process handler) ─────────────

describe('makeOpenclawHandler — message:received saves a temporary frame', () => {
  it('persists the inbound prompt as a temporary frame, provenance-scoped to openclaw-gateway:<channel>', async () => {
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    const extracted: UserPromptExtracted = {
      prompt: 'hello from the gateway',
      cwd: '/work',
      sessionId: provScope('chan-7'),
    };
    const event: InternalHookEventLike = { type: 'message', action: 'received' };
    await handler.handle({ event, extracted }, ctxFor(bridge));

    expect(bridge.saved).toHaveLength(1);
    const frame = bridge.saved[0];
    expect(frame.importance).toBe('temporary');
    expect(frame.content).toBe('hello from the gateway');
    // Provenance stamp rides the frame scope (the only attribution channel save preserves).
    expect(frame.scope).toBe(provScope('chan-7'));
    expect(frame.scope).toContain('openclaw-gateway');
    expect(frame.source).toBe('openclaw');
  });
});

describe('makeOpenclawHandler — agent:bootstrap recalls + the adapter injects into bootstrapFiles', () => {
  it('mutates the host-owned bootstrapFiles array with the recalled text (the inject seam)', async () => {
    const bridge = makeMockBridge({ hits: [hit('prior decision: ship the thing')] });
    // Replicate the package handler's SessionStart seam: recall, format via the
    // adapter, push onto the MUTABLE bootstrapFiles array the gateway reads back.
    const bootstrapFiles: unknown[] = [];
    const recalled = await bridge.recallMemory('', { limit: 20, scope: 'personal' });
    expect(recalled).toHaveLength(1);
    const injected = openclawAdapter.formatInject?.(recalled.map((h) => h.content).join('\n')) as { additionalContext: string };
    bootstrapFiles.push(injected.additionalContext);

    expect(bootstrapFiles).toHaveLength(1);
    expect(bootstrapFiles[0]).toContain('prior decision: ship the thing');
  });

  it('drives runSessionStartBody through the handler without throwing (recall path executes)', async () => {
    const bridge = makeMockBridge({ hits: [hit('frame a')] });
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    const extracted: SessionStartExtracted = {
      cwd: '/work',
      sessionId: provScope('chan-7'),
      recallLimit: 20,
    };
    const event: InternalHookEventLike = { type: 'agent', action: 'bootstrap' };
    await expect(handler.handle({ event, extracted }, ctxFor(bridge))).resolves.toBeUndefined();
    expect(bridge.recalls).toBe(1);
  });
});

describe('makeOpenclawHandler — message:sent (Stop) DEBOUNCE collapses 0..N/turn to one save', () => {
  it('fires 3 message:sent in a turn → exactly ONE save of the LAST payload', async () => {
    vi.useFakeTimers();
    try {
      const bridge = makeMockBridge();
      const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 750 });
      const sessionKey = 'turn-key';

      const mk = (response: string): OpenclawHandlerInput => {
        const extracted: StopExtracted = {
          cwd: '/work',
          sessionId: provScope('chan-7'),
          response,
          parent: undefined,
        };
        const event: InternalHookEventLike = { type: 'message', action: 'sent', sessionKey };
        return { event, extracted };
      };

      // Fire three message:sent rapidly (same turn). The first two are superseded.
      const p1 = handler.handle(mk('partial reply 1'), ctxFor(bridge));
      const p2 = handler.handle(mk('partial reply 2'), ctxFor(bridge));
      const p3 = handler.handle(mk('FINAL DECISION: we will ship the feature on Friday'), ctxFor(bridge));

      // Superseded dispatches resolve immediately (fail-open: a hook must never block the host).
      await Promise.all([p1, p2]);
      expect(bridge.saved).toHaveLength(0); // nothing saved yet — still debouncing

      // Advance past the debounce window; the last save fires.
      await vi.advanceTimersByTimeAsync(800);
      await p3;

      // Exactly one frame saved, carrying the LAST payload.
      expect(bridge.saved).toHaveLength(1);
      const frame = bridge.saved[0];
      expect(frame.content).toContain('FINAL DECISION');
      expect(frame.content).not.toContain('partial reply 1');
      // Stop frames are important/critical (never temporary), provenance-scoped.
      expect(['important', 'critical']).toContain(frame.importance);
      expect(frame.scope).toBe(provScope('chan-7'));
      expect(frame.source).toBe('openclaw');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('makeOpenclawHandler — PreCompact matches on the action SUFFIX, not the joined string', () => {
  it('fires cleanup_frames when the runtime action is "compact:before" (session: prefix dropped at runtime)', async () => {
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    // Runtime event: type 'session', action 'compact:before' — joined would be
    // 'session:compact:before' (matches), but the suffix-match is what the
    // design relies on (CORRECTION 2). Use a non-joined type to prove suffix.
    const event: InternalHookEventLike = { type: 'lifecycle', action: 'compact:before' };
    await handler.handle({ event, extracted: { scope: provScope('chan-7') } }, ctxFor(bridge));
    expect(bridge.cleanups).toBe(1);
  });

  it('ignores an unmapped (type, action) pair', async () => {
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    const event: InternalHookEventLike = { type: 'tool', action: 'invoked' };
    await handler.handle({ event, extracted: { scope: undefined } }, ctxFor(bridge));
    expect(bridge.saved).toHaveLength(0);
    expect(bridge.cleanups).toBe(0);
    expect(bridge.recalls).toBe(0);
  });
});

describe('§7.3 invariant 1 — FAIL-OPEN (handler swallows a bridge error, never throws)', () => {
  it('a save error during message:received resolves (never rejects)', async () => {
    const bridge = makeMockBridge({ throwOn: 'save' });
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    const extracted: UserPromptExtracted = { prompt: 'p', cwd: '/w', sessionId: provScope('c') };
    const event: InternalHookEventLike = { type: 'message', action: 'received' };
    await expect(handler.handle({ event, extracted }, ctxFor(bridge))).resolves.toBeUndefined();
    expect(bridge.saved).toHaveLength(0);
  });

  it('a recall error during agent:bootstrap resolves (never rejects)', async () => {
    const bridge = makeMockBridge({ throwOn: 'recall' });
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    const extracted: SessionStartExtracted = { cwd: '/w', sessionId: provScope('c'), recallLimit: 20 };
    const event: InternalHookEventLike = { type: 'agent', action: 'bootstrap' };
    await expect(handler.handle({ event, extracted }, ctxFor(bridge))).resolves.toBeUndefined();
  });

  it('a cleanup error during compact:before resolves (never rejects)', async () => {
    const bridge = makeMockBridge({ throwOn: 'cleanup' });
    const handler = makeOpenclawHandler(openclawAdapter, { stopDebounceMs: 0 });
    const event: InternalHookEventLike = { type: 'lifecycle', action: 'compact:before' };
    await expect(handler.handle({ event, extracted: { scope: provScope('c') } }, ctxFor(bridge)))
      .resolves.toBeUndefined();
  });
});

// ── the package's own default-export handler (in-process entrypoint) ─────

describe('openclawHook default export — fail-open over the live bridge path', () => {
  it('never throws on a garbage event (no matching lifecycle, no env CLI configured)', async () => {
    const { default: openclawHook } = await import('../src/handler.js');
    // Unmapped event — must resolve to undefined without touching any CLI.
    await expect(openclawHook({ type: 'noop', action: 'noop' })).resolves.toBeUndefined();
  });

  it('never throws even when the recall path would fail (no real hive-mind-cli on PATH)', async () => {
    const { default: openclawHook } = await import('../src/handler.js');
    // agent:bootstrap drives recall through a real (unconfigured) bridge; the
    // handler's try/catch must swallow any failure and resolve.
    const event = { type: 'agent', action: 'bootstrap', context: { channelId: 'c', bootstrapFiles: [] } };
    await expect(openclawHook(event)).resolves.toBeUndefined();
  });
});
