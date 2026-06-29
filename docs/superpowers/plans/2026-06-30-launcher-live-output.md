# Launcher Live-Output Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user opt-in "observe" an externally launched AI agent (Claude Code, Cursor, Codex…) and watch its live stdout/stderr in the dock, without breaking the default detached/survives-restart launch.

**Architecture:** A new piped-stdio `spawnObserved` seam in `tool-launcher.ts` feeds a bounded per-pid `ToolOutputBuffer` (ring buffer, ANSI-stripped). A new SSE route `GET /api/tools/stream?pid=` (mirroring `chat.ts`'s `reply.hijack()`) replays the tail then live-tails. The dock's existing **Running** badge becomes a progressive-disclosure toggle for a `ToolOutputPane`; a single ⌘K catalog entry deep-links to the launcher's watch mode. Observed pids are in-memory only (never persisted) so the #2 restart guarantee stays honest.

**Tech Stack:** TypeScript, Node `child_process`, Fastify (sidecar), React 19 + Vite, EventSource SSE, Vitest.

## Global Constraints

- **Capture model = piped stdio.** No `node-pty`, no native deps, no `xterm.js`, no input-send.
- **Default launch path unchanged.** `observe` is opt-in; `observe:false`/absent ⇒ today's `spawnDetached`.
- **Observed pids are in-memory only** — `ToolProcessTracker.persist()` must exclude them; the output buffer is in-memory.
- **Bounds:** ring buffer `MAX_LINES = 2000`, `MAX_BYTES = 256*1024` per pid; evict an exited entry after `EVICT_GRACE_MS = 60000`.
- **Output is display-only** — never auto-ingested; ANSI stripped on ingest.
- **DI seams stay hermetic** — every spawn/timer is injectable so tests never launch a real process or wait on a real clock.
- **Gates:** `npx tsc --noEmit` 0 across agent/server/web; new units RED→GREEN; existing launcher suites stay green.
- **SSE auth:** EventSource cannot send headers — `/api/tools/stream` MUST be added to `SSE_QUERY_TOKEN_PATHS`.

---

### Task 1: `spawnObserved` seam + `launchTool` observe option

**Files:**
- Modify: `packages/agent/src/tool-launcher.ts`
- Test: `packages/agent/tests/tool-launcher.test.ts`

**Interfaces:**
- Produces: `ObservedHandle { onData(cb:(chunk:string)=>void):void; onExit(cb:(code:number|null)=>void):void }`; `ToolLauncherDeps.spawnObserved?`; `LaunchOptions.observe?: boolean`; `LaunchResult.output?: ObservedHandle`.

- [ ] **Step 1: Write the failing test** — append to `packages/agent/tests/tool-launcher.test.ts`:

```ts
import { launchTool, type ObservedHandle } from '../src/tool-launcher';

describe('launchTool observe mode', () => {
  it('uses spawnObserved and returns its handle when observe:true', () => {
    let dataCb: ((c: string) => void) | null = null;
    const handle: ObservedHandle = {
      onData: (cb) => { dataCb = cb; },
      onExit: () => {},
    };
    const spawnObserved = vi.fn(() => ({ pid: 4242, handle }));
    const spawnDetached = vi.fn(() => ({ pid: 1 }));

    const res = launchTool({
      id: 'claude-code',
      installedPath: '/usr/bin/claude',
      observe: true,
      deps: { spawnObserved, spawnDetached },
    });

    expect(spawnObserved).toHaveBeenCalledTimes(1);
    expect(spawnDetached).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.pid).toBe(4242);
    expect(res.output).toBe(handle);
    expect(typeof dataCb).toBe('object'); // null until onData wired by consumer
  });

  it('uses spawnDetached and omits output when observe is absent', () => {
    const spawnObserved = vi.fn(() => ({ pid: 9, handle: { onData() {}, onExit() {} } }));
    const spawnDetached = vi.fn(() => ({ pid: 7 }));
    const res = launchTool({
      id: 'claude-code',
      installedPath: '/usr/bin/claude',
      deps: { spawnObserved, spawnDetached },
    });
    expect(spawnDetached).toHaveBeenCalledTimes(1);
    expect(spawnObserved).not.toHaveBeenCalled();
    expect(res.output).toBeUndefined();
  });

  it('reports observe spawn failure as ok:false', () => {
    const res = launchTool({
      id: 'claude-code',
      installedPath: '/usr/bin/claude',
      observe: true,
      deps: { spawnObserved: () => ({ pid: null, error: 'boom' }) },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
    expect(res.output).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-launcher.test.ts -t "observe"`
Expected: FAIL — `observe`/`output`/`spawnObserved` not on the types.

- [ ] **Step 3: Implement** in `packages/agent/src/tool-launcher.ts`:

After the `import { spawn, execFile } ...` block, add the handle type near the deps interface:

```ts
/** Minimal, test-injectable view of a live observed process. */
export interface ObservedHandle {
  /** Subscribe to decoded stdout+stderr text chunks. */
  onData(cb: (chunk: string) => void): void;
  /** Fired once when the process exits. `code` is null on signal-kill. */
  onExit(cb: (code: number | null) => void): void;
}
```

In `interface ToolLauncherDeps`, add:

```ts
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
```

Add the default impl after `defaultSpawnDetached`:

```ts
function defaultSpawnObserved(
  binary: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): { pid: number | null; error?: string; handle?: ObservedHandle } {
  try {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      // NOT detached, NOT unref'd: observation requires holding the pipes.
    });
    if (child.pid == null) return { pid: null, error: 'spawn returned no pid' };
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
    return { pid: null, error: err instanceof Error ? err.message : String(err) };
  }
}
```

In `interface ResolvedDeps` add `spawnObserved: NonNullable<ToolLauncherDeps['spawnObserved']>;` and in `resolveDeps` add `spawnObserved: opts.spawnObserved ?? defaultSpawnObserved,`.

In `interface LaunchOptions` add (near `signalEmit`):

```ts
  /**
   * When true, launch in OBSERVED mode (piped stdio) so stdout/stderr can be
   * streamed to the dock. The process is tethered to the sidecar (dies on
   * restart) and is tracked in-memory only. Default (false/absent) is the
   * detached, survives-restart launch.
   */
  observe?: boolean;
```

In `interface LaunchResult` add `output?: ObservedHandle;`.

In `launchTool`, after the `env` is built and before the existing `spawnDetached` call, branch:

```ts
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
```

(Leave the existing detached `spawnDetached(...)` return as the else path.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/tests/tool-launcher.test.ts`
Expected: PASS (new observe tests + all existing launcher tests).

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
git add packages/agent/src/tool-launcher.ts packages/agent/tests/tool-launcher.test.ts
git commit -m "feat(agent): spawnObserved seam + launchTool observe mode"
```

---

### Task 2: `ToolOutputBuffer` ring buffer

**Files:**
- Create: `packages/agent/src/tool-output-buffer.ts`
- Modify: `packages/agent/src/index.ts` (export)
- Test: `packages/agent/tests/tool-output-buffer.test.ts`

**Interfaces:**
- Consumes: `ObservedHandle` (Task 1).
- Produces: `class ToolOutputBuffer` with `attach(pid:number, handle:ObservedHandle):void`, `has(pid:number):boolean`, `getTail(pid:number):OutputTail|null`, `subscribe(pid:number, onLine:(line:string)=>void, onExit:(code:number|null)=>void):()=>void`; `OutputTail { lines:string[]; exited:boolean; exitCode:number|null }`; `stripAnsi(s:string):string`.

- [ ] **Step 1: Write the failing test** — `packages/agent/tests/tool-output-buffer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ToolOutputBuffer, stripAnsi, type OutputTail } from '../src/tool-output-buffer';
import type { ObservedHandle } from '../src/tool-launcher';

/** Build a controllable fake handle. */
function fakeHandle() {
  let data: ((c: string) => void) | null = null;
  let exit: ((c: number | null) => void) | null = null;
  const handle: ObservedHandle = {
    onData: (cb) => { data = cb; },
    onExit: (cb) => { exit = cb; },
  };
  return { handle, emit: (c: string) => data?.(c), end: (code: number | null) => exit?.(code) };
}

describe('stripAnsi', () => {
  it('removes CSI color sequences', () => {
    expect(stripAnsi('[31mred[0m')).toBe('red');
  });
});

describe('ToolOutputBuffer', () => {
  it('buffers complete lines and replays them via getTail', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(101, f.handle);
    f.emit('hello\nwor');
    f.emit('ld\n');
    const tail = buf.getTail(101) as OutputTail;
    expect(tail.lines).toEqual(['hello', 'world']);
    expect(tail.exited).toBe(false);
  });

  it('caps the ring buffer at maxLines', () => {
    const buf = new ToolOutputBuffer({ maxLines: 3 });
    const f = fakeHandle();
    buf.attach(102, f.handle);
    f.emit('a\nb\nc\nd\ne\n');
    expect(buf.getTail(102)!.lines).toEqual(['c', 'd', 'e']);
  });

  it('flushes the trailing partial line and records exit code on exit', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(103, f.handle);
    f.emit('done-without-newline');
    f.end(0);
    const tail = buf.getTail(103)!;
    expect(tail.lines).toEqual(['done-without-newline']);
    expect(tail.exited).toBe(true);
    expect(tail.exitCode).toBe(0);
  });

  it('subscribe replays existing lines then streams new ones, atomically', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(104, f.handle);
    f.emit('one\n');
    const lines: string[] = [];
    let exitCode: number | null | undefined;
    buf.subscribe(104, (l) => lines.push(l), (c) => { exitCode = c; });
    expect(lines).toEqual(['one']);     // replayed synchronously
    f.emit('two\n');
    expect(lines).toEqual(['one', 'two']); // live
    f.end(3);
    expect(exitCode).toBe(3);
  });

  it('subscribe on an already-exited pid replays + calls onExit immediately', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(105, f.handle);
    f.emit('x\n'); f.end(0);
    const lines: string[] = [];
    let exited = false;
    buf.subscribe(105, (l) => lines.push(l), () => { exited = true; });
    expect(lines).toEqual(['x']);
    expect(exited).toBe(true);
  });

  it('evicts an exited entry after the grace period (injected scheduler)', () => {
    let scheduled: (() => void) | null = null;
    const buf = new ToolOutputBuffer({ scheduleEvict: (cb) => { scheduled = cb; } });
    const f = fakeHandle();
    buf.attach(106, f.handle);
    f.end(0);
    expect(buf.has(106)).toBe(true);
    scheduled!();
    expect(buf.has(106)).toBe(false);
  });

  it('unsubscribe stops further line delivery', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(107, f.handle);
    const lines: string[] = [];
    const off = buf.subscribe(107, (l) => lines.push(l), () => {});
    off();
    f.emit('ignored\n');
    expect(lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-output-buffer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `packages/agent/src/tool-output-buffer.ts`:

```ts
/**
 * AI-OS #4 — bounded per-pid output buffer for OBSERVED tool launches.
 *
 * Owns a ring buffer of stdout/stderr lines for each observed process, capped
 * by line count and byte size (SignalBus-style bound), ANSI-stripped on ingest.
 * In-memory only — like the SignalBus and the tracker's non-persisted state, it
 * is lost on sidecar restart (consistent with observed processes being
 * tethered). `subscribe` replays the current tail then live-tails atomically so
 * an SSE client never misses or double-counts a line across the gap.
 */
import type { ObservedHandle } from './tool-launcher';

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_EVICT_GRACE_MS = 60_000;

// CSI / single-char / OSC escape sequences. Inline (no dependency) — strips the
// vast majority of terminal control output (colors, cursor moves, titles).
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^]*)/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, '');
}

export interface OutputTail {
  lines: string[];
  exited: boolean;
  exitCode: number | null;
}

export interface ToolOutputBufferDeps {
  maxLines?: number;
  maxBytes?: number;
  evictGraceMs?: number;
  /** Injectable eviction scheduler (tests capture the callback). */
  scheduleEvict?: (cb: () => void, ms: number) => void;
}

interface Entry {
  lines: string[];
  bytes: number;
  partial: string;
  exited: boolean;
  exitCode: number | null;
  lineListeners: Set<(line: string) => void>;
  exitListeners: Set<(code: number | null) => void>;
}

function defaultScheduleEvict(cb: () => void, ms: number): void {
  const t = setTimeout(cb, ms);
  // Don't keep the sidecar event loop alive just to evict a buffer.
  (t as { unref?: () => void }).unref?.();
}

export class ToolOutputBuffer {
  private entries = new Map<number, Entry>();
  private readonly maxLines: number;
  private readonly maxBytes: number;
  private readonly evictGraceMs: number;
  private readonly scheduleEvict: (cb: () => void, ms: number) => void;

  constructor(deps: ToolOutputBufferDeps = {}) {
    this.maxLines = deps.maxLines ?? DEFAULT_MAX_LINES;
    this.maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
    this.evictGraceMs = deps.evictGraceMs ?? DEFAULT_EVICT_GRACE_MS;
    this.scheduleEvict = deps.scheduleEvict ?? defaultScheduleEvict;
  }

  attach(pid: number, handle: ObservedHandle): void {
    const entry: Entry = {
      lines: [], bytes: 0, partial: '', exited: false, exitCode: null,
      lineListeners: new Set(), exitListeners: new Set(),
    };
    this.entries.set(pid, entry);
    handle.onData((chunk) => this.ingest(pid, chunk));
    handle.onExit((code) => this.finalize(pid, code));
  }

  has(pid: number): boolean {
    return this.entries.has(pid);
  }

  getTail(pid: number): OutputTail | null {
    const e = this.entries.get(pid);
    if (!e) return null;
    return { lines: [...e.lines], exited: e.exited, exitCode: e.exitCode };
  }

  subscribe(
    pid: number,
    onLine: (line: string) => void,
    onExit: (code: number | null) => void,
  ): () => void {
    const e = this.entries.get(pid);
    if (!e) return () => {};
    for (const line of e.lines) onLine(line);       // atomic replay
    if (e.exited) { onExit(e.exitCode); return () => {}; }
    e.lineListeners.add(onLine);
    e.exitListeners.add(onExit);
    return () => { e.lineListeners.delete(onLine); e.exitListeners.delete(onExit); };
  }

  private ingest(pid: number, chunk: string): void {
    const e = this.entries.get(pid);
    if (!e || e.exited) return;
    const text = e.partial + stripAnsi(chunk);
    const parts = text.split('\n');
    e.partial = parts.pop() ?? '';
    for (const line of parts) this.pushLine(e, line);
  }

  private pushLine(e: Entry, line: string): void {
    e.lines.push(line);
    e.bytes += Buffer.byteLength(line, 'utf8') + 1;
    while (e.lines.length > this.maxLines || e.bytes > this.maxBytes) {
      const removed = e.lines.shift();
      if (removed === undefined) break;
      e.bytes -= Buffer.byteLength(removed, 'utf8') + 1;
    }
    for (const l of e.lineListeners) l(line);
  }

  private finalize(pid: number, code: number | null): void {
    const e = this.entries.get(pid);
    if (!e || e.exited) return;
    if (e.partial.length > 0) { this.pushLine(e, e.partial); e.partial = ''; }
    e.exited = true;
    e.exitCode = code;
    for (const l of e.exitListeners) l(code);
    e.lineListeners.clear();
    e.exitListeners.clear();
    this.scheduleEvict(() => this.entries.delete(pid), this.evictGraceMs);
  }
}
```

- [ ] **Step 4: Export + run** — add to `packages/agent/src/index.ts` (alongside the existing `tool-process-tracker` / `tool-launcher` re-exports):

```ts
export {
  ToolOutputBuffer,
  stripAnsi,
  type OutputTail,
  type ToolOutputBufferDeps,
} from './tool-output-buffer';
export type { ObservedHandle } from './tool-launcher';
```

Run: `npx vitest run packages/agent/tests/tool-output-buffer.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
git add packages/agent/src/tool-output-buffer.ts packages/agent/src/index.ts packages/agent/tests/tool-output-buffer.test.ts
git commit -m "feat(agent): ToolOutputBuffer bounded per-pid ring buffer"
```

---

### Task 3: Tracker `observed` flag + persist exclusion

**Files:**
- Modify: `packages/agent/src/tool-process-tracker.ts`
- Test: `packages/agent/tests/tool-process-tracker.test.ts`

**Interfaces:**
- Produces: `TrackedProcess.observed?: boolean`; `register(pid, toolId, workspaceId?, opts?: { observed?: boolean }): TrackedProcess`.

- [ ] **Step 1: Write the failing test** — append to `packages/agent/tests/tool-process-tracker.test.ts`:

```ts
describe('observed processes are in-memory only', () => {
  it('lists observed pids but never persists them', () => {
    const saved: TrackedProcess[][] = [];
    const tracker = new ToolProcessTracker({
      savePersisted: (recs) => saved.push([...recs]),
      isAlive: () => true,
      now: () => new Date('2026-06-30T00:00:00Z'),
    });
    tracker.register(11, 'claude-code', 'ws1');                 // detached
    tracker.register(22, 'cursor', 'ws1', { observed: true });  // observed

    // Both are live in memory:
    expect(tracker.list().map((p) => p.pid).sort()).toEqual([11, 22]);
    // But the most recent persisted snapshot excludes the observed pid:
    const last = saved[saved.length - 1];
    expect(last.map((p) => p.pid)).toEqual([11]);
  });
});
```

(`TrackedProcess` is already imported in this test file; if not, add `import type { TrackedProcess } from '../src/tool-process-tracker';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-process-tracker.test.ts -t "observed"`
Expected: FAIL — `register` rejects the 4th arg / observed pid is persisted.

- [ ] **Step 3: Implement** in `packages/agent/src/tool-process-tracker.ts`:

Add to `interface TrackedProcess`: `observed?: boolean;`

In `isTrackedProcess`, allow the field (add before the final `)`):

```ts
    (r.observed === undefined || typeof r.observed === 'boolean') &&
```

Change `register`:

```ts
  register(
    pid: number,
    toolId: ToolId,
    workspaceId?: string,
    opts?: { observed?: boolean },
  ): TrackedProcess {
    const record: TrackedProcess = {
      pid,
      toolId,
      startedAt: this.now().toISOString(),
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(opts?.observed ? { observed: true } : {}),
    };
    this.processes.set(pid, record);
    this.persist();
    return record;
  }
```

Change `persist` to exclude observed entries (they cannot survive a restart, so persisting them risks a stale Running badge / pid-reuse false positive):

```ts
  private persist(): void {
    if (this.persists) {
      this.savePersisted(Array.from(this.processes.values()).filter((p) => !p.observed));
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/tests/tool-process-tracker.test.ts`
Expected: PASS (new + all existing tracker tests, including persistence/reconcile).

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
git add packages/agent/src/tool-process-tracker.ts packages/agent/tests/tool-process-tracker.test.ts
git commit -m "feat(agent): tracker observed flag — in-memory only, excluded from pidfile"
```

---

### Task 4: Server — observe launch, buffer decoration, SSE stream route

**Files:**
- Modify: `packages/server/src/local/routes/tools.ts`
- Modify: `packages/server/src/local/security-middleware.ts:249` (`SSE_QUERY_TOKEN_PATHS`)
- Test: `packages/server/tests/tools-routes-launch.test.ts` (extend) or new `packages/server/tests/tools-routes-stream.test.ts`

**Interfaces:**
- Consumes: `launchTool({observe})`, `ToolOutputBuffer`, `ToolProcessTracker.register(...,{observed})` (Tasks 1–3).
- Produces: `POST /api/tools/launch` accepts `observe?`; `GET /api/tools/stream?pid=` (SSE: `event: line` `data:{line}`, `event: exit` `data:{code}`).

- [ ] **Step 1: Write the failing test** — `packages/server/tests/tools-routes-stream.test.ts` (use the same Fastify build harness the existing `tools-routes-launch.test.ts` uses — import its `buildTestServer`/`registerToolsRoutes` helper; mirror its setup):

```ts
import { describe, it, expect } from 'vitest';
// NOTE during execution: import the SAME app/builder helper that
// tools-routes-launch.test.ts uses; inject ToolLauncher deps so no real
// process spawns. Pattern below assumes a `buildToolsApp({ launcherDeps })`.

describe('GET /api/tools/stream', () => {
  it('404s when the pid has no observed output buffer', async () => {
    const app = await buildToolsApp();
    const res = await app.inject({ method: 'GET', url: '/api/tools/stream?pid=999999' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('400s on a missing/invalid pid', async () => {
    const app = await buildToolsApp();
    const res = await app.inject({ method: 'GET', url: '/api/tools/stream?pid=abc' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('launch with observe:true registers + attaches a buffer the stream can read', async () => {
    // Inject a fake spawnObserved that emits one line then exits, so the
    // buffer is populated synchronously; then assert the SSE body replays it.
    const { app, emit, end } = await buildToolsAppWithObservable(); // see execution note
    const launch = await app.inject({
      method: 'POST', url: '/api/tools/launch',
      payload: { id: 'claude-code', installedPath: '/usr/bin/claude', observe: true },
    });
    expect(launch.statusCode).toBe(202);
    const pid = launch.json().pid as number;
    emit('hello\n'); end(0);
    const stream = await app.inject({ method: 'GET', url: `/api/tools/stream?pid=${pid}` });
    expect(stream.statusCode).toBe(200);
    expect(stream.payload).toContain('event: line');
    expect(stream.payload).toContain('hello');
    expect(stream.payload).toContain('event: exit');
    await app.close();
  });
});
```

> **Execution note (no placeholder):** `tools-routes-launch.test.ts` already constructs the Fastify app with injectable launcher deps. Reuse that exact builder. For `buildToolsAppWithObservable`, inject `spawnObserved: () => ({ pid: 4242, handle })` where `handle` is the controllable `fakeHandle()` from Task 2's test, and have the route construct its `ToolOutputBuffer` from a deps factory so the test shares the same instance. If the route owns a private buffer, expose it for tests the same way the tracker is exposed via `server.toolProcessTracker` (decorate `server.toolOutputBuffer`), and read it through `app.toolOutputBuffer`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/tests/tools-routes-stream.test.ts`
Expected: FAIL — route + schema field absent.

- [ ] **Step 3: Implement** in `packages/server/src/local/routes/tools.ts`:

(a) Imports — add `ToolOutputBuffer`:

```ts
import {
  detectInstalledTools,
  launchTool,
  runHookCommand,
  ToolProcessTracker,
  ToolOutputBuffer,
  type HookAction,
} from '@waggle/agent';
```

(b) Decoration — extend the module augmentation and lazy-init beside the tracker:

```ts
declare module 'fastify' {
  interface FastifyInstance {
    toolProcessTracker?: ToolProcessTracker;
    /** AI-OS #4 — bounded per-pid output buffer for observed launches. */
    toolOutputBuffer?: ToolOutputBuffer;
  }
}
```

```ts
  if (!server.toolOutputBuffer) {
    server.decorate('toolOutputBuffer', new ToolOutputBuffer());
  }
  const outputBuffer = server.toolOutputBuffer!;
```

(c) Schema — add `observe` to `launchBodySchema`:

```ts
  observe: z.boolean().optional(),
```

(d) Launch handler — thread observe through and attach the buffer:

```ts
    const result = launchTool({
      id: body.id,
      installedPath: body.installedPath,
      workspaceId: body.workspaceId,
      cwd: body.cwd,
      args: body.args,
      signalEmit: true,
      sidecarUrl: loopbackSidecarUrl(request.headers.host),
      observe: body.observe,
    });
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    if (result.pid != null) {
      tracker.register(result.pid, body.id, body.workspaceId, { observed: body.observe === true });
      if (body.observe && result.output) {
        outputBuffer.attach(result.pid, result.output);
      }
    }
    return reply.code(202).send(result);
```

(e) New SSE route — add after `/api/tools/kill`:

```ts
  // ── GET /api/tools/stream?pid= (AI-OS #4) ────────────────────────
  // Live stdout/stderr for an OBSERVED launch. Validates against the
  // output buffer (the only place observed pids land), then mirrors the
  // chat.ts hijack-SSE pattern: replay the tail, then live-tail, then a
  // terminal `exit` event. Loopback-only; auth via ?token= (SSE allowlist).
  server.get('/api/tools/stream', async (request, reply) => {
    const raw = (request.query as { pid?: string } | undefined)?.pid;
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) {
      return reply.code(400).send({ error: 'pid query param required' });
    }
    if (!outputBuffer.has(pid)) {
      return reply.code(404).send({ error: 'no observed output for pid' });
    }
    await reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const unsubscribe = outputBuffer.subscribe(
      pid,
      (line) => send('line', { line }),
      (code) => { send('exit', { code }); res.end(); },
    );
    res.on('close', () => unsubscribe());
  });
```

(f) `packages/server/src/local/security-middleware.ts` — add to `SSE_QUERY_TOKEN_PATHS` (line ~249):

```ts
  '/api/tools/stream', // AI-OS #4 — observed-launch live output (named line/exit events)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/server/tests/tools-routes-stream.test.ts packages/server/tests/tools-routes-launch.test.ts`
Expected: PASS (new stream tests + existing launch tests unaffected).

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit --project packages/server/tsconfig.json
git add packages/server/src/local/routes/tools.ts packages/server/src/local/security-middleware.ts packages/server/tests/tools-routes-stream.test.ts
git commit -m "feat(server): /api/tools/stream SSE + observe launch wiring"
```

---

### Task 5: Adapter — `observe` param + `streamToolOutput`

**Files:**
- Modify: `apps/web/src/lib/adapter.ts`
- Test: `apps/web/src/lib/adapter.launcher.test.ts` (new) — assert the request body carries `observe` (mirror the mocking style of `adapter.authgate.test.ts`).

**Interfaces:**
- Produces: `launchTool({ ..., observe?: boolean })`; `streamToolOutput(pid:number, handlers:{ onLine:(line:string)=>void; onExit:(code:number|null)=>void }): () => void`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/adapter.launcher.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { adapter } from './adapter';

describe('adapter.launchTool observe', () => {
  it('forwards observe:true in the POST body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, pid: 5 }), { status: 202 }),
    );
    await adapter.launchTool({ id: 'claude-code', installedPath: '/x', observe: true });
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.observe).toBe(true);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/adapter.launcher.test.ts`
Expected: FAIL — `observe` not in the `launchTool` payload type.

- [ ] **Step 3: Implement** in `apps/web/src/lib/adapter.ts`:

Add `observe?: boolean;` to the `launchTool` `payload` parameter type (the existing object after `cwd?`). The body is already `JSON.stringify(payload)`, so the field flows through automatically.

Add the streamer method right after `getToolProcesses` (it reuses the private `openSSE` EventSource lifecycle — token-attached, reconnecting):

```ts
  /**
   * AI-OS #4 — subscribe to an observed launch's live output. Opens a
   * dedicated EventSource on /api/tools/stream?pid= (two named events:
   * `line` and `exit`). Returns an unsubscribe handle. No-ops in jsdom
   * (no EventSource) — unit tests drive the pane via the callbacks directly.
   */
  streamToolOutput(
    pid: number,
    handlers: { onLine: (line: string) => void; onExit: (code: number | null) => void },
  ): () => void {
    return this.openSSE(`/api/tools/stream?pid=${pid}`, (es) => {
      es.addEventListener('line', (e) => {
        try { handlers.onLine(JSON.parse((e as MessageEvent).data).line); } catch { /* skip */ }
      });
      es.addEventListener('exit', (e) => {
        try { handlers.onExit(JSON.parse((e as MessageEvent).data).code ?? null); } catch { /* skip */ }
      });
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/lib/adapter.launcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/lib/adapter.ts apps/web/src/lib/adapter.launcher.test.ts
git commit -m "feat(web): adapter observe param + streamToolOutput SSE"
```

---

### Task 6: `ToolOutputPane` component

**Files:**
- Create: `apps/web/src/components/os/apps/launcher/ToolOutputPane.tsx`
- Test: `apps/web/src/components/os/apps/launcher/ToolOutputPane.test.tsx`

**Interfaces:**
- Consumes: `adapter.streamToolOutput` (Task 5).
- Produces: `ToolOutputPane({ pid, toolId, observed })` — `observed=false` ⇒ render the detached-launch hint instead of opening a stream.

- [ ] **Step 1: Write the failing test**:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToolOutputPane } from './ToolOutputPane';
import { adapter } from '@/lib/adapter';

describe('ToolOutputPane', () => {
  it('renders streamed lines and the exit chip', () => {
    let onLine!: (l: string) => void;
    let onExit!: (c: number | null) => void;
    vi.spyOn(adapter, 'streamToolOutput').mockImplementation((_pid, h) => {
      onLine = h.onLine; onExit = h.onExit; return () => {};
    });
    render(<ToolOutputPane pid={5} toolId="claude-code" observed />);
    act(() => { onLine('building…'); onLine('done'); onExit(0); });
    expect(screen.getByText('building…')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText(/exit 0/i)).toBeInTheDocument();
  });

  it('shows the detached-launch hint when not observed (no stream opened)', () => {
    const spy = vi.spyOn(adapter, 'streamToolOutput');
    render(<ToolOutputPane pid={6} toolId="cursor" observed={false} />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/Watch a coding agent live/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/components/os/apps/launcher/ToolOutputPane.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `ToolOutputPane.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Loader2, Terminal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { adapter } from '@/lib/adapter';

interface ToolOutputPaneProps {
  pid: number;
  toolId: string;
  /** True only for launches started in observed mode (piped stdio). */
  observed: boolean;
}

const RENDER_CAP = 2000; // mirror the server ring-buffer cap

export const ToolOutputPane = ({ pid, toolId, observed }: ToolOutputPaneProps) => {
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!observed) return;
    const off = adapter.streamToolOutput(pid, {
      onLine: (line) => setLines((prev) => {
        const next = prev.length >= RENDER_CAP ? prev.slice(prev.length - RENDER_CAP + 1) : prev;
        return [...next, line];
      }),
      onExit: (code) => setExitCode(code),
    });
    return off;
  }, [pid, observed]);

  // Auto-scroll to bottom on new output.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!observed) {
    return (
      <div className="mt-2 rounded-lg border border-border/40 bg-card/30 p-3 text-[11px] text-muted-foreground">
        This agent was launched in the background (no live output). Use{' '}
        <span className="font-medium text-foreground">⌘K → “Watch a coding agent live”</span> to
        start one you can watch.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border/40 bg-[var(--bg-2,#0a0b0e)] overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/30 text-[11px] text-muted-foreground">
        <Terminal className="w-3 h-3" />
        <span>{toolId} · live output</span>
        {exitCode === undefined ? (
          <Loader2 className="w-3 h-3 animate-spin ml-auto" />
        ) : (
          <span
            className="ml-auto rounded px-1.5 py-0.5 text-[10px]"
            style={
              exitCode === 0
                ? { background: 'var(--healthy-wash)', color: 'var(--healthy)' }
                : { background: 'var(--risk-wash)', color: 'var(--risk)' }
            }
          >
            exit {exitCode ?? 'signal'}
          </span>
        )}
      </div>
      <ScrollArea className="max-h-56">
        <div ref={scrollRef} className="p-2.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap break-all text-[var(--text-2)]">
          {lines.length === 0 && exitCode === undefined ? (
            <span className="text-muted-foreground">Waiting for output…</span>
          ) : (
            lines.map((l, i) => <div key={i}>{l || ' '}</div>)
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ToolOutputPane;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/components/os/apps/launcher/ToolOutputPane.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/components/os/apps/launcher/ToolOutputPane.tsx apps/web/src/components/os/apps/launcher/ToolOutputPane.test.tsx
git commit -m "feat(web): ToolOutputPane live-output component"
```

---

### Task 7: `LauncherApp` — clickable Running badge + pane + watch mode

**Files:**
- Modify: `apps/web/src/components/os/apps/LauncherApp.tsx`
- Test: `apps/web/src/components/os/apps/LauncherApp.test.tsx` (extend)

**Interfaces:**
- Consumes: `ToolOutputPane` (Task 6), `adapter.launchTool({observe})` (Task 5), `?watch=1` route param.
- Produces: badge-click reveals `<ToolOutputPane>`; in watch mode the per-tool Launch sends `observe:true`.

- [ ] **Step 1: Write the failing test** — extend `LauncherApp.test.tsx` with one case (mirror the file's existing adapter-mocking setup; key the running tool so the badge shows):

```tsx
it('reveals the output pane when a running tool badge is clicked', async () => {
  // Arrange: detect returns one installed tool; processes poll returns it running observed.
  // (Reuse the file's existing mock helpers for detectTools/getToolProcesses.)
  render(<LauncherApp activeWorkspaceId="ws1" />);
  const badge = await screen.findByText('Running');
  await userEvent.click(badge);
  expect(await screen.findByText(/live output|Waiting for output/i)).toBeInTheDocument();
});
```

> **Execution note:** read the existing `LauncherApp.test.tsx` mock setup and reuse its `adapter` mocks; add `observed: true` to the mocked `getToolProcesses` record so the pane opens a stream (mock `adapter.streamToolOutput` to a no-op returning `() => {}`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/components/os/apps/LauncherApp.test.tsx -t "output pane"`
Expected: FAIL — badge is not interactive; pane absent.

- [ ] **Step 3: Implement** in `LauncherApp.tsx`:

(a) Imports: `import { ToolOutputPane } from './launcher/ToolOutputPane';` and `useState` is already imported.

(b) Track which pids are observed (extend the existing process poll). Add state:

```ts
  const [observedPids, setObservedPids] = useState<Set<number>>(new Set());
  const [openPaneToolId, setOpenPaneToolId] = useState<string | null>(null);
```

In the `pollOnce` of the processes `useEffect` (and in `stopTool`'s re-poll), populate observed pids from the record's `observed` flag:

```ts
      setObservedPids(new Set(result.processes.filter((p) => p.observed).map((p) => p.pid)));
```

(Extend the `getToolProcesses` return type in `adapter.ts` Task 5 with `observed?: boolean` on the process entries so this typechecks — add it there.)

(c) `?watch=1` mode — read the param once (the launcher host route is `/launcher`; use the same router hook the app uses, e.g. `useSearchParams` from react-router if present, else parse `window.location.search`). Minimal, framework-agnostic:

```ts
  const watchMode = useMemo(
    () => new URLSearchParams(window.location.search).get('watch') === '1',
    [],
  );
```

In `doAction`'s `launch` branch, pass observe in watch mode and auto-open the pane:

```ts
          const r = await adapter.launchTool({
            id: tool.id,
            installedPath: tool.installedPath,
            workspaceId: activeWorkspaceId,
            ...(args ? { args } : {}),
            ...(watchMode ? { observe: true } : {}),
          });
```

After a successful watch-mode launch, `if (r.ok && watchMode) setOpenPaneToolId(tool.id);`.

(d) Make the Running badge a button that toggles the pane:

```tsx
                      {runningTools.has(tool.id) && (
                        <button
                          type="button"
                          onClick={() => setOpenPaneToolId((cur) => (cur === tool.id ? null : tool.id))}
                          aria-expanded={openPaneToolId === tool.id}
                          className="text-[10px] px-1.5 py-0 h-4 inline-flex items-center rounded"
                          style={{ background: 'var(--work-wash)', color: 'var(--work)' }}
                          title="Show live output"
                        >
                          <span className="w-1.5 h-1.5 rounded-full inline-block mr-1 animate-pulse" style={{ background: 'var(--work)' }} />
                          Running
                        </button>
                      )}
```

(e) Render the pane under the actions row when open, choosing the first running pid for the tool:

```tsx
                {openPaneToolId === tool.id && (() => {
                  const pid = (pidsByTool.get(tool.id) ?? [])[0];
                  if (pid == null) return null;
                  return <ToolOutputPane pid={pid} toolId={tool.id} observed={observedPids.has(pid)} />;
                })()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/components/os/apps/LauncherApp.test.tsx`
Expected: PASS (new + existing 5 LauncherApp tests).

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/components/os/apps/LauncherApp.tsx apps/web/src/components/os/apps/LauncherApp.test.tsx apps/web/src/lib/adapter.ts
git commit -m "feat(web): launcher Running-badge reveals live output + watch mode"
```

---

### Task 8: ⌘K "Watch a coding agent live" catalog entry

**Files:**
- Modify: `apps/web/src/lib/command-catalog.ts`
- Test: `apps/web/src/lib/command-catalog.test.ts` (new or extend)

**Interfaces:**
- Produces: a curated catalog item `{ id:'watch-agent', name:'Watch a coding agent live', to:'/launcher?watch=1' }` in the `do` group.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/command-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCommandCatalog } from './command-catalog'; // use the file's actual exported builder name

describe('command catalog watch-agent', () => {
  it('includes a "Watch a coding agent live" entry deep-linking to watch mode', () => {
    const groups = buildCommandCatalog(/* pass the same args the app passes; see execution note */);
    const all = groups.flatMap((g) => g.items);
    const watch = all.find((i) => i.id === 'watch-agent');
    expect(watch).toBeTruthy();
    expect(watch!.to).toBe('/launcher?watch=1');
  });
});
```

> **Execution note:** open `command-catalog.ts`, confirm the exported builder's real name and signature (the spec references the `launch-agent` item near line 76), and call it with the minimal valid args. If the catalog is a plain exported array rather than a builder fn, assert against that array instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/command-catalog.test.ts`
Expected: FAIL — no `watch-agent` item.

- [ ] **Step 3: Implement** — in `command-catalog.ts`, add `Eye` to the lucide import and insert next to the `launch-agent` item:

```ts
    { id: "watch-agent", group: "do", name: "Watch a coding agent live",
      subtitle: "Claude Code · Cursor · Codex — stream its output", icon: Eye, to: "/launcher?watch=1" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/lib/command-catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
git add apps/web/src/lib/command-catalog.ts apps/web/src/lib/command-catalog.test.ts
git commit -m "feat(web): ⌘K 'Watch a coding agent live' catalog entry"
```

---

### Final Gate (after Task 8)

- [ ] **Full typecheck** — `npx tsc --noEmit --project packages/agent/tsconfig.json && npx tsc --noEmit --project packages/server/tsconfig.json && npx tsc --noEmit -p apps/web/tsconfig.json` → 0 errors.
- [ ] **Touched suites green** — `npx vitest run packages/agent/tests/tool-launcher.test.ts packages/agent/tests/tool-output-buffer.test.ts packages/agent/tests/tool-process-tracker.test.ts packages/server/tests/tools-routes-stream.test.ts packages/server/tests/tools-routes-launch.test.ts apps/web/src/lib/adapter.launcher.test.ts apps/web/src/components/os/apps/launcher/ToolOutputPane.test.tsx apps/web/src/components/os/apps/LauncherApp.test.tsx apps/web/src/lib/command-catalog.test.ts`
- [ ] **Lint touched files** — `npm run lint` (or scoped) clean.
- [ ] Update CLAUDE.md §10 sprint status with the #4 ship line (optional, do at handoff).

---

## Self-Review

**Spec coverage:** §3.1 spawnObserved → Task 1 · §3.2 buffer → Task 2 · §3.3 tracker → Task 3 · §3.4 routes + SSE allowlist → Task 4 · §4.1 adapter → Task 5 · §4.4 pane → Task 6 · §4.2 LauncherApp badge/watch → Task 7 · §4.3 ⌘K → Task 8 · §7 testing → each task's TDD steps + Final Gate. No spec section is unmapped.

**Placeholder scan:** the three "execution notes" point at *existing* code to mirror (test builders / exported names) rather than leaving logic undefined — every code step ships real code. No TBD/TODO.

**Type consistency:** `ObservedHandle`/`spawnObserved`/`output` (Task 1) match their use in Tasks 2/4. `register(...,{observed})` (Task 3) matches the Task 4 call. `streamToolOutput(pid,{onLine,onExit})` (Task 5) matches Task 6's mock and the SSE `line`/`exit` events from Task 4. `getToolProcesses` gains `observed?` in Task 5, consumed in Task 7. `OutputTail`/`has`/`subscribe`/`getTail` names are consistent across Tasks 2 and 4.
