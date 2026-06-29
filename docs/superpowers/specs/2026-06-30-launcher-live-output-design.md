# Launcher Live-Output Pane (piped, observed mode) — Design

**Date:** 2026-06-30 · **Author:** Claude Opus 4.8 (1M) · **Owner:** Marko (founder)
**Arc:** AI-OS external-agent launcher · STEAL NOW item **#4** from
`docs/analysis/external-agent-launching-and-memory-comparison-2026-06-29.md`
**Branch:** `feat/launcher-self-enabling-pipeline` (continues the launcher trio shipped in `4ade22f7`)
**Capture model (founder-approved 2026-06-30):** **piped stdio**, not node-pty.

---

## 1. Goal & Non-Goals

**Goal.** Close the launcher's "no eyes" gap. Today `launchTool()` spawns external agents
`detached + stdio:'ignore' + unref()`, so Waggle sees nothing until a Stop-hook frame lands.
Give the user an opt-in way to **watch a launched agent's live stdout/stderr** in the dock.

**Non-goals (YAGNI — explicitly out of scope for v1):**
- No `node-pty` / true terminal emulation, no ANSI/TUI rendering fidelity, no `xterm.js`.
- No **input send** back to the agent (that is the node-pty path; deferred).
- No multi-process tabbed terminal — **one pane per running tool**, opened on demand.
- No auto-ingest of captured output into memory (display-only → no injection surface).
- No change to the default detached launch path or to the #2 persistence guarantee.

---

## 2. The Crux: Two Launch Modes

The feature rides on one inversion of the existing contract:

| | **Detached (default, unchanged)** | **Observed (new, opt-in)** |
|---|---|---|
| spawn | `detached:true`, `stdio:'ignore'`, `unref()` | `stdio:['ignore','pipe','pipe']`, **no `unref()`** |
| survives sidecar restart | **Yes** (the whole point; #2 reconciles it) | **No** — sidecar holds the pipes; tethered |
| live output | none | streamed to the dock |
| tracker persistence | persisted to pidfile | **in-memory only** (can't survive → must not claim to) |

Making observation a **mode** rather than a replacement is what lets #4 coexist with the
`4ade22f7` persistence (#2) instead of silently breaking its "survives restart" promise.

---

## 3. Backend Design

### 3.1 `spawnObserved` DI seam — `packages/agent/src/tool-launcher.ts`

New injectable dep mirroring `spawnDetached`, kept hermetic so tests never spawn real
processes. It returns the pid **plus an abstract output handle** so the buffer can subscribe
without leaking `ChildProcess` into the pure surface:

```ts
/** Minimal, test-injectable view of a live observed process. */
export interface ObservedHandle {
  /** Subscribe to decoded stdout+stderr text chunks. */
  onData(cb: (chunk: string) => void): void;
  /** Fired once when the process exits. code is null on signal-kill. */
  onExit(cb: (code: number | null) => void): void;
}

spawnObserved?: (
  binary: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
) => { pid: number | null; error?: string; handle?: ObservedHandle };
```

Production default: `spawn(binary, args, { cwd, env, stdio: ['ignore','pipe','pipe'] })`
(no `detached`, no `unref`); wires `child.stdout`/`child.stderr` `'data'` → `onData` (utf8),
and `child` `'exit'` → `onExit`.

`launchTool()` gains `observe?: boolean`. When `observe === true` it calls `spawnObserved`
(falling back to the same `LAUNCH_COHORT`/`installedPath` guards) and returns the existing
`LaunchResult` **plus an optional `output?: ObservedHandle`**. When false/absent the path is
byte-for-byte today's `spawnDetached`. The signal-emit / sidecar-url env injection is shared
across both modes (already in place).

### 3.2 Output buffer — `packages/agent/src/tool-output-buffer.ts` (new)

A `ToolOutputBuffer` class owning a **bounded ring buffer per pid**, modeled on the SignalBus
500-cap philosophy:

- `attach(pid, handle: ObservedHandle)` — subscribe; push chunks (split to lines, **ANSI
  stripped on ingest** via an inline regex — no new dependency) into a ring capped at
  **`MAX_LINES = 2000`** and **`MAX_BYTES = 256 KB`** (whichever first; oldest evicted).
- `getTail(pid): { lines: string[]; exited: boolean; exitCode: number | null }` — replay.
- `subscribe(pid, listener): () => void` — live fan-out to SSE clients; returns an unsubscribe.
- On `onExit`: stamp `exited/exitCode`, emit a terminal event to live listeners, retain the
  tail for late readers, and schedule eviction of the whole entry after a short grace (so a
  pane opened just after exit still shows the final output).

In-memory only — like the tracker's non-persisted state and the SignalBus, it is lost on
sidecar restart (consistent with observed processes being tethered).

### 3.3 Tracker change — `packages/agent/src/tool-process-tracker.ts`

- `TrackedProcess` gains optional `observed?: boolean`.
- `register(pid, toolId, workspaceId?, opts?: { observed?: boolean })`.
- `persist()` writes `records.filter(p => !p.observed)` — **observed pids are never persisted**,
  so a sidecar restart can never resurrect a stale "Running" badge for a tethered (now-dead)
  process or a pid-reused stranger. Observed pids still appear in `list()` while the sidecar
  lives, so the badge + pane work for the whole session.

### 3.4 Routes — `packages/server/src/local/routes/tools.ts`

- **`POST /api/tools/launch`** — `launchBodySchema` gains `observe: z.boolean().optional()`.
  When `observe`, the handler: calls `launchTool({ ..., observe: true })`; on success
  `tracker.register(pid, id, workspaceId, { observed: true })` and
  `outputBuffer.attach(pid, result.output)`. Response unchanged (202 + `{ ok, pid }`).
- **`GET /api/tools/stream?pid=` (new, SSE)** — validates `pid` is **tracked AND observed**
  (404 otherwise); then mirrors the proven `chat.ts:580` pattern: `reply.hijack()` →
  `raw.writeHead(200, text/event-stream + loopback CORS)` → replay `getTail` as
  `event: line` frames → `subscribe` for live `line` frames → on exit emit `event: exit`
  `data: { code }` and `raw.end()`. `reply.raw.on('close', unsubscribe)` cleans up on client
  disconnect. No new buffer/transport primitive — pure composition.
- `outputBuffer` is decorated on the Fastify instance exactly like `toolProcessTracker`
  (lazy-init, `fastify-plugin`-propagated) so `/launch` and `/stream` share one instance.

### 3.5 Security & resource bounds

- Output is **display-only**, never auto-ingested → no LLM/injection surface; React escapes
  all text; ANSI is stripped so no terminal control sequences reach the DOM.
- `/stream` is loopback-bound like every local route; `pid` must be one **we** spawned and
  marked observed (reuses the tracker's "only our pids" guard philosophy).
- Ring-buffer caps (2000 lines / 256 KB / pid) bound memory; entries evicted after exit grace.

---

## 4. Frontend Design

Constraint (founder, 2026-06-30): **keep current UX, progressive disclosure — only basics on
the dock menu, richer entry points on ⌘K.**

### 4.1 `apps/web/src/lib/adapter.ts`

- `launchTool(payload)` gains optional `observe?: boolean` in its body.
- New `streamToolOutput(pid, { onLine, onExit, signal })` — opens `GET /api/tools/stream?pid=`
  via the same auth'd `fetch` + `ReadableStream` reader + `event:/data:` frame parse the chat
  SSE path already uses (no `EventSource`, which can't carry the device token). Returns a
  close handle; aborts via `AbortSignal`.

### 4.2 `LauncherApp.tsx` — dock unchanged, badge becomes the disclosure

- The per-tool **cards and their basic buttons (Launch/Stop/Install/Verify/Uninstall) are
  untouched.** The default dock **Launch** stays **detached** (no behavior change).
- **Progressive disclosure:** the existing **Running** badge becomes clickable. Clicking it
  toggles an inline collapsible `<ToolOutputPane pid=… toolId=… />` beneath that card.
  - Observed launch → pane streams live output (mono scroll area, auto-scroll-to-bottom unless
    the user scrolled up, exit-code footer).
  - Detached launch (no buffer) → pane shows a one-line hint: *"This agent was launched in the
    background (no live output). Use ⌘K → ‘Watch a coding agent live’ to start one you can
    watch."* — honest, no fake stream.
- **Watch mode** (entered via ⌘K deep-link, below): a `?watch=1` route param puts LauncherApp
  in a mode where the per-tool **Launch** action sends `observe:true` and auto-opens that
  tool's pane. No new always-visible buttons — it reuses the existing Launch control's intent.

### 4.3 ⌘K — `lib/command-catalog.ts` (the rich entry point)

Add **one** curated catalog item next to the existing `launch-agent` entry:

```ts
{ id: "watch-agent", group: "do", name: "Watch a coding agent live",
  subtitle: "Claude Code · Cursor · Codex — stream its output", icon: Eye, to: "/launcher?watch=1" }
```

This honors "basics on the dock, depth one keystroke away": the watch path is discoverable in
⌘K and deep-links into LauncherApp's watch mode; the dock itself gains no new buttons. Exact
param plumbing (`useSearchParams` in the launcher host) is a plan detail.

### 4.4 New component — `apps/web/src/components/os/apps/launcher/ToolOutputPane.tsx`

Self-contained: takes `{ pid, toolId }`, opens `adapter.streamToolOutput` on mount, renders a
bounded virtualized-enough mono list (cap render to last N lines to match the server cap),
shows a spinner until first line, an exit-code chip on close, and a copy-all affordance.
Cleans up the stream on unmount. ~one focused file (<200 LOC), one clear purpose.

---

## 5. Data Flow

```
⌘K "Watch a coding agent live"  ──▶ /launcher?watch=1
  └▶ LauncherApp (watch mode): Launch ──▶ adapter.launchTool({ id, …, observe:true })
       └▶ POST /api/tools/launch {observe} ─▶ launchTool({observe:true})
            └▶ spawnObserved → {pid, handle}
                 ├▶ tracker.register(pid, id, ws, {observed:true})   (in-memory, not persisted)
                 └▶ outputBuffer.attach(pid, handle)  ── ring buffer (2000 ln / 256 KB, ANSI-stripped)
  Running badge click ──▶ <ToolOutputPane pid>
       └▶ adapter.streamToolOutput(pid) ─▶ GET /api/tools/stream?pid  (SSE, reply.hijack)
            └▶ replay tail → live `line` frames → `exit` frame → close
```

---

## 6. Error Handling

- `spawnObserved` failure → `launchTool` returns `ok:false` with the spawn error (today's path).
- `/stream` with an unknown/non-observed/dead pid → **404** `{ error }`; pane shows the hint, not a spinner-forever.
- Client disconnect / unmount → `reply.raw.on('close')` unsubscribes; `AbortSignal` tears down the fetch reader.
- Process exits → terminal `exit` event with code; pane freezes the final tail + shows the chip.
- Buffer overflow → oldest lines evicted silently (bounded by design); pane mirrors the server cap.
- Sidecar restart mid-watch → stream errors out; pane shows *"output ended (sidecar restarted)"*; the observed pid is gone from `list()` so the badge clears on next 5s poll.

---

## 7. Testing (TDD — mirror `4ade22f7`'s gate discipline)

**Backend (`packages/agent`, `packages/server`):**
- `spawnObserved` injected fake emits synthetic data/exit → buffer fills, caps at 2000 lines /
  256 KB, finalizes with exit code, evicts after grace.
- `launchTool({observe:true})` returns `output` handle; `observe:false`/absent unchanged (regression-lock).
- `tracker.register(..., {observed:true})` lists the pid but `persist()` excludes it; reconcile never sees it.
- `/api/tools/launch {observe}` registers + attaches; `/api/tools/stream` replays tail, streams
  live frames, emits `exit`, 404s unknown/non-observed pid, unsubscribes on close.

**Frontend (`apps/web`):**
- Running badge toggles the pane; pane renders streamed lines (mocked `streamToolOutput`),
  shows exit chip, shows the detached-launch hint when no buffer.
- ANSI-bearing lines render stripped; ⌘K catalog exposes "Watch a coding agent live".

**Gates:** `tsc --noEmit` 0 across agent/server/web · all new units RED→GREEN · existing
launcher suites stay green (tool-launcher / tool-process-tracker / tools-routes / LauncherApp).

---

## 8. File-by-File Change List

| File | Change |
|---|---|
| `packages/agent/src/tool-launcher.ts` | `ObservedHandle` type, `spawnObserved` dep + default, `launchTool` `observe` option + `output` in result |
| `packages/agent/src/tool-output-buffer.ts` | **new** — `ToolOutputBuffer` ring buffer (attach/getTail/subscribe/exit + ANSI strip) |
| `packages/agent/src/tool-process-tracker.ts` | `observed?` on `TrackedProcess`; `register` opt; `persist()` filters observed |
| `packages/agent/src/index.ts` | export `ToolOutputBuffer`, `ObservedHandle` |
| `packages/server/src/local/routes/tools.ts` | `observe` in launch schema/handler; decorate `toolOutputBuffer`; new `GET /api/tools/stream` (SSE) |
| `apps/web/src/lib/adapter.ts` | `observe` in `launchTool`; new `streamToolOutput` |
| `apps/web/src/components/os/apps/LauncherApp.tsx` | clickable Running badge → pane; `?watch=1` mode |
| `apps/web/src/components/os/apps/launcher/ToolOutputPane.tsx` | **new** — live output pane |
| `apps/web/src/lib/command-catalog.ts` | `watch-agent` ⌘K entry |
| tests (4–6 files) | per §7 |

---

## 9. Open Questions / Decisions

- **None blocking.** All three forks resolved: piped (not pty), observed-mode (not replacement),
  ⌘K-deep-link (not new dock buttons).
- **Deferred to a later arc (noted, not built):** node-pty upgrade for true terminal + input
  send; auto-tail of detached launches via a log file; multi-process terminal tabs.
- **Founder decisions from the analysis doc unaffected by this item** (budget caps #13,
  recall-gate cost #8, tuiui re-recon) — out of scope here.
