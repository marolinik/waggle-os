/**
 * OpenClaw in-process hook handler — the default export the gateway loads.
 *
 * Unlike the stdin-JSON tools (codex / cursor / hermes), OpenClaw hooks are
 * IN-PROCESS: the gateway dynamically `import()`s this file, grabs the default
 * export, and registers it as an `InternalHookHandler`
 * (`(event) => Promise<void> | void`, run inside the gateway event loop). So
 * there is no `runHook` subprocess wrapper — this module maps `event.context`
 * into the shared extracted-payload shapes and drives the SAME shared handler
 * bodies via `makeOpenclawHandler` (hooks-core).
 *
 * The four lifecycle dispatches (recall+inject / save-temp / summarize+save /
 * compact) are matched on the `(type, action)` PAIR by hooks-core. This module
 * owns the OpenClaw-specific glue:
 *   - SessionStart injects by MUTATING `event.context.bootstrapFiles` (a
 *     mutable array the gateway reads back) — there is no stdout seam.
 *   - Stop (`message:sent`) fires 0..N per turn and is DEBOUNCED in
 *     `makeOpenclawHandler` (stopDebounceMs).
 *   - Provenance: every captured frame is attributed to `openclaw-gateway`
 *     (+ the channel/session key) so gateway captures are distinguishable
 *     from any backend (CC/codex) capture.
 *
 * FAIL-OPEN: the default export wraps the body and NEVER throws / never
 * rejects — it always returns a resolved promise (spec §7.3 invariant 1). The
 * gateway also wraps each handler in try/catch, but we do not rely on that as
 * the only safety net.
 *
 * Live-install caveat (OQ-5): this file is shipped COMPILED (`dist/handler.js`)
 * and copied into `~/.openclaw/hooks/hive-mind/handler.js`. Whether the
 * installed `handler.js` resolves the `@waggle/*` runtime deps on a real
 * OpenClaw install is the ONE remaining needs-a-live-install validation — the
 * gateway must be able to `import()` a file that `require`s node_modules from
 * this package's tree (or have the deps bundled). Documented in the README.
 */

import {
  createCliBridge,
  createLogger,
  type MemoryHit,
} from '@waggle/hive-mind-shim-core';
import {
  buildHookBridgeOptions,
  makeOpenclawHandler,
  type HookContext,
  type InternalHookEventLike,
  type Lifecycle,
  type OpenclawHandlerInput,
  type PreCompactExtracted,
  type SessionStartExtracted,
  type StopExtracted,
  type UserPromptExtracted,
} from '@waggle/hive-mind-hooks-core';
import { openclawAdapter, OPENCLAW_PROVENANCE } from './adapter.js';

/** Default Stop debounce: collapse the 0..N `message:sent` of a turn. */
const DEFAULT_STOP_DEBOUNCE_MS = 750;
const DEFAULT_RECALL_LIMIT = 20;

/**
 * Minimal shape of OpenClaw's runtime `InternalHookEvent`. `bootstrapFiles` is
 * the MUTABLE array the gateway reads back after `agent:bootstrap` to inject
 * recalled context into the system prompt.
 */
interface OpenclawRuntimeContext {
  cwd?: unknown;
  workingDirectory?: unknown;
  channelId?: unknown;
  sessionKey?: unknown;
  content?: unknown;
  /** Mutable array of bootstrap file contents — the SessionStart inject seam. */
  bootstrapFiles?: unknown;
  [key: string]: unknown;
}

interface OpenclawRuntimeEvent extends InternalHookEventLike {
  context?: OpenclawRuntimeContext;
}

function asContext(event: OpenclawRuntimeEvent): OpenclawRuntimeContext {
  return event.context && typeof event.context === 'object' ? event.context : {};
}

/**
 * Build a provenance-stamped session scope so gateway frames are attributable
 * to `openclaw-gateway` and to the originating channel/session. This rides the
 * frame's `session:` content prefix (frame-encoder), which is the only
 * attribution channel the save_memory wire preserves.
 */
function provenanceScope(ctx: OpenclawRuntimeContext): string {
  const sessionId = openclawAdapter.extractSessionId(ctx) ?? 'default';
  return `${OPENCLAW_PROVENANCE}:${sessionId}`;
}

/** Resolve the lifecycle for an event using the adapter's event-name map. */
function lifecycleFor(event: OpenclawRuntimeEvent): Lifecycle | undefined {
  const joined = `${event.type}:${event.action}`;
  for (const lc of ['session-start', 'user-prompt-submit', 'stop', 'pre-compact'] as Lifecycle[]) {
    const native = openclawAdapter.eventName[lc];
    if (native === undefined) continue;
    if (native === joined) return lc;
    // PreCompact ONLY: runtime action is 'compact:before' while the HOOK.md key
    // is 'session:compact:before' — accept the action-suffix match exclusively
    // for pre-compact (an unrelated type with a colliding action must not map).
    if (lc === 'pre-compact' && native.endsWith(`:${event.action}`) && event.type !== '') return lc;
  }
  return undefined;
}

/**
 * Extract the lifecycle-specific payload from `event.context`, stamping the
 * provenance scope as the session id so saved frames are attributable.
 */
function extractFor(
  lifecycle: Lifecycle,
  ctx: OpenclawRuntimeContext,
): SessionStartExtracted | UserPromptExtracted | StopExtracted | PreCompactExtracted {
  const cwd = openclawAdapter.extractCwd(ctx) ?? process.cwd();
  const scope = provenanceScope(ctx);

  switch (lifecycle) {
    case 'session-start':
      return { cwd, sessionId: scope, recallLimit: DEFAULT_RECALL_LIMIT };
    case 'user-prompt-submit':
      return { prompt: openclawAdapter.extractPrompt(ctx) ?? '', cwd, sessionId: scope };
    case 'stop': {
      const responseRaw = openclawAdapter.extractResponse(ctx, {});
      const response = typeof responseRaw === 'string' ? responseRaw : '';
      const parent = openclawAdapter.extractParent(ctx);
      const stop: StopExtracted = { cwd, sessionId: scope, response, parent };
      return stop;
    }
    case 'pre-compact':
      return { scope };
  }
}

export interface OpenclawHookRuntimeOptions {
  /** Install-pinned CLI path embedded into the managed handler loader. */
  readonly cliPath?: string;
}

/** Build a CliBridge, preferring the loader-pinned path over ambient env. */
function buildBridge(opts: OpenclawHookRuntimeOptions = {}): ReturnType<typeof createCliBridge> {
  const logger = createLogger({ name: 'openclaw-hooks/handler' });
  const envCliPath = process.env.WAGGLE_HIVE_MIND_CLI;
  const cliPath = typeof opts.cliPath === 'string' && opts.cliPath.length > 0
    ? opts.cliPath
    : envCliPath;
  // OpenClaw shares its gateway event loop with hooks, so every bridge call â€”
  // including pre-compact cleanup â€” is intentionally best-effort and bounded.
  // A stalled CLI must release the gateway instead of delaying compaction.
  return createCliBridge(buildHookBridgeOptions(
    logger,
    typeof cliPath === 'string' && cliPath.length > 0 ? cliPath : undefined,
  ));
}

const handler = makeOpenclawHandler(openclawAdapter, {
  stopDebounceMs: DEFAULT_STOP_DEBOUNCE_MS,
});

const pendingPromptSnapshots = new Map<string, Promise<MemoryHit[]>>();
const PENDING_PROMPT_SNAPSHOT_TTL_MS = 5 * 60_000;

function promptSnapshotKey(event: OpenclawRuntimeEvent, fallback: string): string {
  const key = event.sessionKey;
  return typeof key === 'string' && key.length > 0 ? key : fallback;
}

function rememberPromptSnapshot(key: string, snapshot: Promise<MemoryHit[]>): void {
  pendingPromptSnapshots.set(key, snapshot);
  const expiry = setTimeout(() => {
    if (pendingPromptSnapshots.get(key) === snapshot) pendingPromptSnapshots.delete(key);
  }, PENDING_PROMPT_SNAPSHOT_TTL_MS);
  expiry.unref?.();
}

/**
 * The OpenClaw default export. Receives the runtime `InternalHookEvent`, maps
 * `event.context` → the extracted payload, and drives the shared bodies.
 *
 * SessionStart is special-cased: the shared body returns the inject object
 * (`{ additionalContext }`); we push that text onto the mutable
 * `context.bootstrapFiles` array (the gateway's sanctioned injection seam)
 * rather than emitting stdout.
 *
 * NEVER throws — always returns a resolved promise (fail-open).
 */
export default async function openclawHook(
  event: OpenclawRuntimeEvent,
  runtimeOptions: OpenclawHookRuntimeOptions = {},
): Promise<void> {
  try {
    const lifecycle = lifecycleFor(event);
    if (lifecycle === undefined) return;
    const ctx = asContext(event);
    const extracted = extractFor(lifecycle, ctx);

    if (lifecycle === 'user-prompt-submit') {
      const prompt = extracted as UserPromptExtracted;
      const key = promptSnapshotKey(event, prompt.sessionId);
      const previous = pendingPromptSnapshots.get(key);
      const snapshot = (previous ?? Promise.resolve<MemoryHit[]>([]))
        .catch(() => [])
        .then(async () => {
          const bridge = buildBridge(runtimeOptions);
          let hits: MemoryHit[] = [];
          try {
            hits = await bridge.recallMemory('', {
              limit: DEFAULT_RECALL_LIMIT,
              scope: 'personal',
            });
          } catch {
            // Fail open: prompt capture still runs if historical recall fails.
          }
          const hookCtx: HookContext = {
            bridge,
            logger: createLogger({ name: 'openclaw-hooks/handler' }),
          };
          await handler.handle({ event, extracted: prompt }, hookCtx);
          return hits;
        })
        .catch(() => []);
      rememberPromptSnapshot(key, snapshot);
      await snapshot;
      return;
    }

    // SessionStart: drive recall ourselves so we can mutate bootstrapFiles
    // with the injected text (the shared body's stdout return is unused
    // in-process).
    if (lifecycle === 'session-start') {
      const sessionStart = extracted as SessionStartExtracted;
      const key = promptSnapshotKey(event, sessionStart.sessionId ?? provenanceScope(ctx));
      const snapshot = pendingPromptSnapshots.get(key);
      if (snapshot) {
        const hits = await snapshot;
        if (pendingPromptSnapshots.get(key) === snapshot) pendingPromptSnapshots.delete(key);
        await injectBootstrap(ctx, sessionStart, runtimeOptions, hits);
      } else {
        await injectBootstrap(ctx, sessionStart, runtimeOptions);
      }
      return;
    }

    const input: OpenclawHandlerInput = { event, extracted };
    const hookCtx: HookContext = {
      bridge: buildBridge(runtimeOptions),
      logger: createLogger({ name: 'openclaw-hooks/handler' }),
    };
    await handler.handle(input, hookCtx);
  } catch {
    // FAIL-OPEN: swallow — the gateway flow must never be affected.
  }
}

/**
 * Recall top-N frames and push the formatted text onto the mutable
 * `context.bootstrapFiles` array (OpenClaw's sanctioned inject seam). Recall
 * uses the same provenance scope so the injected context is attributable.
 * Fails open.
 */
async function injectBootstrap(
  ctx: OpenclawRuntimeContext,
  extracted: SessionStartExtracted,
  runtimeOptions: OpenclawHookRuntimeOptions = {},
  snapshot?: readonly MemoryHit[],
): Promise<void> {
  const logger = createLogger({ name: 'openclaw-hooks/handler' });
  try {
    const hits: readonly MemoryHit[] = snapshot
      ?? await buildBridge(runtimeOptions).recallMemory('', {
      limit: extracted.recallLimit,
      scope: 'personal',
    });
    if (hits.length === 0) return;
    const text = formatHits(hits);
    const arr = ctx.bootstrapFiles;
    if (Array.isArray(arr)) {
      // Mutate the host-owned array in place — this IS the injection seam.
      (arr as unknown[]).push(createRecallBootstrapFile(text));
    } else {
      // The host did not provide a mutable array; nothing to inject into.
      logger.debug('agent:bootstrap had no bootstrapFiles array — skipping inject');
    }
  } catch {
    // Fail-open: a recall failure must not block bootstrap.
  }
}

export interface OpenclawBootstrapFile {
  path: string;
  name: string;
  content: string;
}

/** Build the virtual context file shape accepted by OpenClaw's sanitizer. */
export function createRecallBootstrapFile(content: string): OpenclawBootstrapFile {
  return {
    path: 'HIVE_MIND_RECALL.md',
    name: 'HIVE_MIND_RECALL.md',
    content,
  };
}

const PER_HIT_BUDGET = 240;

function formatHits(hits: readonly MemoryHit[]): string {
  const lines: string[] = [`hive-mind: top ${hits.length} recalled frames`];
  for (const h of hits) {
    const content = h.content.length > PER_HIT_BUDGET
      ? h.content.slice(0, PER_HIT_BUDGET) + '…'
      : h.content;
    lines.push(`- (${h.importance}) ${h.created_at}: ${content}`);
  }
  return lines.join('\n');
}
