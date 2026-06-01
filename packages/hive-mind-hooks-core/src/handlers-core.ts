/**
 * Tool-agnostic lifecycle handler bodies + `HookHandler` factories.
 *
 * The four canonical lifecycle actions (recall+inject, save-temporary,
 * summarize+save-important, compact_memory) mirror the frozen Wave 1
 * claude-code hook bodies (`hooks/session-start.ts`, `user-prompt-submit.ts`,
 * `stop.ts`, `pre-compact.ts`) but read fields through a per-tool
 * `EventAdapter` instead of hardcoded key lists.
 *
 * Two drive paths share ONE set of bodies:
 *   1. The stdin-JSON / exit-0 tools (codex, codex-desktop, cursor, hermes)
 *      use the `make*Handler` factories, which return `HookHandler` objects
 *      consumed by `runHook` (hook-shared.ts).
 *   2. OpenClaw's in-process TypeScript handlers can't use `runHook`
 *      (in-process, not subprocess); `makeOpenclawHandler` wraps the SAME
 *      bodies for the in-process path.
 *
 * The bodies therefore take an ALREADY-EXTRACTED payload (not the raw host
 * event) so both paths can drive them.
 *
 * Immutability: bodies build fresh HookFrame / event objects; they never
 * mutate the bridge, adapter, or incoming payload.
 */

import {
  classifyImportance,
  encodeFrame,
  maybeEmitDiscovery,
  summarizeTurn,
  type HookEvent,
  type MemoryHit,
} from '@waggle/hive-mind-shim-core';
import type { EventAdapter, ExtractContext, Lifecycle } from './event-adapter.js';
import type { HookContext, HookHandler } from './hook-shared.js';

// ── Extracted payloads (the shared bodies operate on these) ────────────

export interface SessionStartExtracted {
  cwd: string;
  sessionId: string | undefined;
  recallLimit: number;
}

export interface UserPromptExtracted {
  prompt: string;
  cwd: string;
  sessionId: string;
}

export interface StopExtracted {
  cwd: string;
  sessionId: string;
  response: string;
  parent: string | undefined;
}

export interface PreCompactExtracted {
  scope: string | undefined;
}

// ── Defaults (mirror the CC bodies) ────────────────────────────────────

const DEFAULT_RECALL_LIMIT = 20;
const PER_HIT_CONTENT_BUDGET = 240;
const DEFAULT_SUMMARY_BUDGET_CHARS = 400;

export interface SessionStartOpts {
  recallLimit?: number;
}

export interface StopOpts {
  summaryBudgetChars?: number;
}

function formatHitsForContext(hits: readonly MemoryHit[]): string {
  if (hits.length === 0) {
    return 'hive-mind: no recalled frames for this workspace yet.';
  }
  const lines: string[] = [`hive-mind: top ${hits.length} recalled frames`];
  for (const h of hits) {
    const from = h.from && h.from !== 'personal' ? ` [${h.from}]` : '';
    const content = h.content.length > PER_HIT_CONTENT_BUDGET
      ? h.content.slice(0, PER_HIT_CONTENT_BUDGET) + '…'
      : h.content;
    lines.push(`- (${h.importance})${from} ${h.created_at}: ${content}`);
  }
  return lines.join('\n');
}

/** Default SessionStart inject shape — the CC hookSpecificOutput convention. */
function defaultFormatInject(source: string, additionalContext: string): unknown {
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      source,
      additionalContext,
    },
  };
}

// ── Shared handler bodies (drive-path agnostic) ────────────────────────

/**
 * SessionStart body — recall top-N frames from personal memory and format
 * them for injection. Returns the tool-shaped inject object, or undefined
 * when the adapter declares no inject seam (`formatInject` absent).
 */
export async function runSessionStartBody(
  a: EventAdapter,
  payload: SessionStartExtracted,
  ctx: HookContext,
): Promise<unknown> {
  ctx.logger.debug('recall starting', { limit: payload.recallLimit });
  const hits = await ctx.bridge.recallMemory('', {
    limit: payload.recallLimit,
    scope: 'personal',
  });
  ctx.logger.debug('recall complete', { hits: hits.length });
  const text = formatHitsForContext(hits);
  if (a.formatInject) return a.formatInject(text);
  return defaultFormatInject(a.source, text);
}

/**
 * UserPromptSubmit body — persist the prompt as a temporary frame. No
 * stdout output; pure side-effect on the .mind file.
 */
export async function runUserPromptBody(
  a: EventAdapter,
  payload: UserPromptExtracted,
  ctx: HookContext,
): Promise<undefined> {
  if (!payload.prompt) {
    ctx.logger.debug('no prompt in payload, skipping save');
    return undefined;
  }
  const event: HookEvent = {
    eventType: 'user-prompt-submit',
    source: a.source,
    cwd: payload.cwd,
    timestamp_iso: new Date().toISOString(),
    payload: {
      content: payload.prompt,
      session_id: payload.sessionId,
    },
  };
  const frame = encodeFrame(event, { importance: 'temporary' });
  const result = await ctx.bridge.saveMemory(frame);
  ctx.logger.debug('prompt frame saved', { id: result.id, scope: frame.scope });
  return undefined;
}

/**
 * Stop body — summarize the completed turn deterministically, classify
 * importance, save an important/critical frame, and (opt-in via
 * WAGGLE_SIGNAL_EMIT) emit a discovery signal. Mirrors CC stop.ts:46-108.
 */
export async function runStopBody(
  a: EventAdapter,
  payload: StopExtracted,
  ctx: HookContext,
  opts: StopOpts = {},
): Promise<undefined> {
  if (!payload.response) {
    ctx.logger.debug('no response in payload, skipping save');
    return undefined;
  }
  const summary = summarizeTurn(payload.response, {
    maxChars: opts.summaryBudgetChars ?? DEFAULT_SUMMARY_BUDGET_CHARS,
  });
  const rawImportance = classifyImportance(summary, { eventType: 'stop' });
  const importance = rawImportance === 'critical' ? 'critical' : 'important';

  const event: HookEvent = {
    eventType: 'stop',
    source: a.source,
    cwd: payload.cwd,
    timestamp_iso: new Date().toISOString(),
    payload: {
      content: summary,
      session_id: payload.sessionId,
    },
  };
  const encodeOpts: { importance: typeof importance; parent?: string } = { importance };
  if (payload.parent !== undefined) encodeOpts.parent = payload.parent;
  const frame = encodeFrame(event, encodeOpts);
  const result = await ctx.bridge.saveMemory(frame);
  ctx.logger.debug('stop frame saved', {
    id: result.id,
    importance: frame.importance,
    bytes: summary.length,
  });

  // Opt-in v2 signal emission. Off by default so OSS consumers see no
  // behavior change; flip WAGGLE_SIGNAL_EMIT to broadcast high/critical
  // stops to the local Waggle sidecar. Fails open (never throws).
  const emitFlag = process.env.WAGGLE_SIGNAL_EMIT;
  if (emitFlag && emitFlag !== '0' && emitFlag.toLowerCase() !== 'false') {
    const emitImportance =
      rawImportance === 'critical' ? 'critical'
      : rawImportance === 'important' ? 'high'
      : rawImportance === 'normal' ? 'normal'
      : 'low';
    const emitted = await maybeEmitDiscovery(
      'stop',
      emitImportance,
      {
        tool: a.source,
        sessionId: payload.sessionId,
        topic: summary.slice(0, 160),
        cwd: payload.cwd,
      },
      { senderId: `${a.source}-hook` },
    );
    if (emitted) ctx.logger.debug('stop signal emitted', { id: emitted.id });
  }

  return undefined;
}

/**
 * PreCompact body — trigger upstream frame compaction maintenance before
 * the host truncates context. Mirrors CC pre-compact.ts.
 */
export async function runPreCompactBody(
  _a: EventAdapter,
  payload: PreCompactExtracted,
  ctx: HookContext,
): Promise<undefined> {
  const result = await ctx.bridge.cleanupFrames();
  ctx.logger.debug('cleanup_frames done', { pruned: result.pruned, scope: payload.scope });
  return undefined;
}

// ── Extraction (raw host payload → extracted payload) ──────────────────

function extractSessionStart(a: EventAdapter, raw: unknown, recallLimit: number): SessionStartExtracted {
  return {
    cwd: a.extractCwd(raw) ?? process.cwd(),
    sessionId: a.extractSessionId(raw),
    recallLimit,
  };
}

function resolveRecallLimit(raw: unknown, fallback: number): number {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const val = obj['recall_limit'] ?? obj['recallLimit'];
    if (typeof val === 'number' && val > 0) return Math.floor(val);
  }
  return fallback;
}

function extractUserPrompt(a: EventAdapter, raw: unknown): UserPromptExtracted {
  return {
    prompt: a.extractPrompt(raw) ?? '',
    cwd: a.extractCwd(raw) ?? process.cwd(),
    sessionId: a.extractSessionId(raw) ?? 'default',
  };
}

async function extractStop(a: EventAdapter, raw: unknown, ctx: ExtractContext): Promise<StopExtracted> {
  const response = (await a.extractResponse(raw, ctx)) ?? '';
  return {
    cwd: a.extractCwd(raw) ?? process.cwd(),
    sessionId: a.extractSessionId(raw) ?? 'default',
    response,
    parent: a.extractParent(raw),
  };
}

function extractPreCompact(a: EventAdapter, raw: unknown): PreCompactExtracted {
  return { scope: a.extractSessionId(raw) };
}

// ── HookHandler factories (stdin-JSON / exit-0 drive path) ─────────────

/**
 * SessionStart `HookHandler` for the `runHook` subprocess path.
 * `recallLimit` resolves from the payload (`recall_limit`/`recallLimit`)
 * else `opts.recallLimit` else 20.
 */
export function makeSessionStartHandler(
  a: EventAdapter,
  opts: SessionStartOpts = {},
): HookHandler<SessionStartExtracted, unknown> {
  const fallbackLimit = opts.recallLimit ?? DEFAULT_RECALL_LIMIT;
  return {
    parse(raw): SessionStartExtracted {
      const limit = resolveRecallLimit(raw, fallbackLimit);
      return extractSessionStart(a, raw, limit);
    },
    run(payload, ctx): Promise<unknown> {
      return runSessionStartBody(a, payload, ctx) as Promise<unknown>;
    },
  };
}

export function makeUserPromptSubmitHandler(
  a: EventAdapter,
): HookHandler<UserPromptExtracted, undefined> {
  return {
    parse(raw): UserPromptExtracted {
      return extractUserPrompt(a, raw);
    },
    run(payload, ctx): Promise<undefined> {
      return runUserPromptBody(a, payload, ctx);
    },
  };
}

/**
 * Stop's `HookHandler.parse` is synchronous, but Stop extraction can be
 * async (cursor reads the completed turn off `transcript_path`). So the
 * parsed value carries the raw payload, and `run` performs the async
 * response extraction. A typed wrapper avoids any intersection abuse.
 */
export interface StopParsed {
  raw: unknown;
}

export function makeStopHandler(
  a: EventAdapter,
  opts: StopOpts = {},
): HookHandler<StopParsed, undefined> {
  return {
    parse(raw): StopParsed {
      return { raw };
    },
    async run(payload, ctx): Promise<undefined> {
      const resolved = await extractStop(a, payload.raw, {});
      return runStopBody(a, resolved, ctx, opts);
    },
  };
}

export function makePreCompactHandler(
  a: EventAdapter,
): HookHandler<PreCompactExtracted, undefined> {
  return {
    parse(raw): PreCompactExtracted {
      return extractPreCompact(a, raw);
    },
    run(payload, ctx): Promise<undefined> {
      return runPreCompactBody(a, payload, ctx);
    },
  };
}

// ── OpenClaw in-process handler factory (spec §5.5) ────────────────────

/**
 * Minimal shape of OpenClaw's `InternalHookEvent` the in-process handler
 * needs. The gateway delivers `(type, action)` plus an opaque `context`
 * carrying cwd / prompt / response / session id. Matching is on the
 * `(type, action)` pair, NOT the joined string (e.g. PreCompact fires on
 * action `'compact:before'`, not `'session:compact:before'`).
 */
export interface InternalHookEventLike {
  type: string;
  action: string;
  sessionKey?: string;
  context?: unknown;
  timestamp?: unknown;
  messages?: unknown;
}

/**
 * Map an OpenClaw `(type, action)` pair to a canonical lifecycle, using
 * the adapter's eventName map (each value is the OpenClaw `type:action`
 * native key, e.g. 'agent:bootstrap', and PreCompact is matched specially
 * on action 'compact:before').
 */
function lifecycleForOpenclawEvent(
  a: EventAdapter,
  ev: InternalHookEventLike,
): Lifecycle | undefined {
  const joined = `${ev.type}:${ev.action}`;
  for (const lc of ['session-start', 'user-prompt-submit', 'stop', 'pre-compact'] as Lifecycle[]) {
    const native = a.eventName[lc];
    if (native === undefined) continue;
    if (native === joined) return lc;
    // PreCompact ONLY: the runtime action is 'compact:before' while the
    // HOOK.md events[] entry is 'session:compact:before'. Accept a match on
    // the action suffix exclusively for pre-compact — applying it to every
    // lifecycle would mis-map an unrelated type whose action suffix collides
    // (e.g. type='gateway' action='sent' must NOT map to stop's 'message:sent').
    if (lc === 'pre-compact' && native.endsWith(`:${ev.action}`) && ev.type !== '') return lc;
  }
  return undefined;
}

export interface OpenclawHandlerOptions {
  /** Stop debounce window (ms) for the 0..N `message:sent` per turn. */
  stopDebounceMs?: number;
  /** Stop summary budget. */
  summaryBudgetChars?: number;
  /** SessionStart recall limit. */
  recallLimit?: number;
}

export interface OpenclawHandler {
  /**
   * In-process entrypoint. Receives an already-extracted payload object
   * (the OpenClaw `handler.ts` adapter extracts `event.context` into the
   * shared extracted-payload shapes before calling) plus the lifecycle.
   * Shells to hive-mind-cli via the supplied bridge. FAIL-OPEN: wraps the
   * body in try/catch and NEVER throws — the returned promise always
   * resolves.
   */
  handle(input: OpenclawHandlerInput, ctx: HookContext): Promise<void>;
}

/**
 * The in-process driver input: an OpenClaw event-shaped object plus the
 * already-extracted lifecycle payload. The shared bodies run on the
 * extracted payload; the event is carried for lifecycle resolution +
 * debounce keying.
 */
export interface OpenclawHandlerInput {
  event: InternalHookEventLike;
  /** Already-extracted payload, shaped per the resolved lifecycle. */
  extracted:
    | SessionStartExtracted
    | UserPromptExtracted
    | StopExtracted
    | PreCompactExtracted;
}

/**
 * Build an OpenClaw in-process handler that drives the SAME shared bodies
 * the subprocess path uses. The host (`triggerInternalHook`) already wraps
 * each handler in try/catch, but per spec §7.3 invariant 1 the openclaw
 * fail-open contract is "the default-exported handler must not throw" — so
 * we wrap the body here too and never rely on the host's catch as the only
 * safety net.
 */
export function makeOpenclawHandler(
  a: EventAdapter,
  opts: OpenclawHandlerOptions = {},
): OpenclawHandler {
  // Debounce state for message:sent (0..N per turn): keep only the last
  // outbound payload of a turn by deferring the save behind a short timer.
  const stopTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; resolve: () => void }>();
  const debounceMs = opts.stopDebounceMs ?? 0;

  async function dispatch(input: OpenclawHandlerInput, ctx: HookContext): Promise<void> {
    const lifecycle = lifecycleForOpenclawEvent(a, input.event);
    if (lifecycle === undefined) {
      ctx.logger.debug('openclaw event ignored (no lifecycle match)', {
        type: input.event.type,
        action: input.event.action,
      });
      return;
    }

    switch (lifecycle) {
      case 'session-start':
        // Recall+inject: the OpenClaw adapter mutates bootstrapFiles with
        // the returned text; the body returns it.
        await runSessionStartBody(a, input.extracted as SessionStartExtracted, ctx);
        return;
      case 'user-prompt-submit':
        await runUserPromptBody(a, input.extracted as UserPromptExtracted, ctx);
        return;
      case 'stop': {
        const stopPayload = input.extracted as StopExtracted;
        if (debounceMs <= 0) {
          await runStopBody(a, stopPayload, ctx, { summaryBudgetChars: opts.summaryBudgetChars });
          return;
        }
        // Debounce: keep only the last message:sent of a turn.
        const key = input.event.sessionKey ?? stopPayload.sessionId;
        const existing = stopTimers.get(key);
        if (existing) {
          // Supersede the prior message:sent of this turn (last-writer-wins).
          // Cancel its pending save AND resolve its awaiting handle() so the
          // host's sequential await of the superseded dispatch never hangs
          // (fail-open invariant §7.3.1 — a hook must never block the host).
          clearTimeout(existing.timer);
          existing.resolve();
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            stopTimers.delete(key);
            // FAIL-OPEN §7.3.1: this save is DETACHED (fires after dispatch's
            // try/catch has returned), so a rejection here would escape as an
            // unhandled rejection. Catch it explicitly before resolving.
            void runStopBody(a, stopPayload, ctx, {
              summaryBudgetChars: opts.summaryBudgetChars,
            })
              .catch((err) => {
                ctx.logger.warn('openclaw debounced stop save failed open', {
                  error: err instanceof Error ? err.message : String(err),
                });
              })
              .finally(() => resolve());
          }, debounceMs);
          stopTimers.set(key, { timer, resolve });
        });
        return;
      }
      case 'pre-compact':
        await runPreCompactBody(a, input.extracted as PreCompactExtracted, ctx);
        return;
    }
  }

  return {
    async handle(input, ctx): Promise<void> {
      try {
        await dispatch(input, ctx);
      } catch (err) {
        // FAIL-OPEN: swallow — never throw to the host event loop.
        ctx.logger.warn('openclaw hook failed open', {
          type: input.event.type,
          action: input.event.action,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
