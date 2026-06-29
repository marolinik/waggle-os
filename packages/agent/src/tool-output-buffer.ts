/**
 * AI-OS #4 - bounded per-pid output buffer for OBSERVED tool launches.
 *
 * Owns a ring buffer of stdout/stderr lines for each observed process, capped
 * by line count and byte size (SignalBus-style bound), ANSI-stripped per line.
 * In-memory only - like the SignalBus and the tracker's non-persisted state, it
 * is lost on sidecar restart (consistent with observed processes being
 * tethered). `subscribe` replays the current tail then live-tails atomically so
 * an SSE client never misses or double-counts a line across the gap.
 */
import type { ObservedHandle } from './tool-launcher.js';

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_EVICT_GRACE_MS = 60_000;

// CSI escape sequences (colors, cursor moves) anchored to the ESC control char.
// Built via fromCharCode so neither a raw control char nor a \u/\x escape lands
// in source; anchoring to ESC means plain text (e.g. "arr[0]") is never touched.
const ESC = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(ESC + '\\[[0-9;?]*[ -/]*[@-~]', 'g');

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

  /** Begin buffering a freshly-spawned observed process's output. */
  attach(pid: number, handle: ObservedHandle): void {
    const entry: Entry = {
      lines: [],
      bytes: 0,
      partial: '',
      exited: false,
      exitCode: null,
      lineListeners: new Set(),
      exitListeners: new Set(),
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

  /**
   * Replay the current tail to `onLine` synchronously, then live-tail. If the
   * process has already exited, replay + fire `onExit` and return a no-op
   * unsubscribe. Atomic: no line is missed or double-counted across the gap.
   */
  subscribe(
    pid: number,
    onLine: (line: string) => void,
    onExit: (code: number | null) => void,
  ): () => void {
    const e = this.entries.get(pid);
    if (!e) return () => {};
    for (const line of e.lines) onLine(line);
    if (e.exited) {
      onExit(e.exitCode);
      return () => {};
    }
    e.lineListeners.add(onLine);
    e.exitListeners.add(onExit);
    return () => {
      e.lineListeners.delete(onLine);
      e.exitListeners.delete(onExit);
    };
  }

  private ingest(pid: number, chunk: string): void {
    const e = this.entries.get(pid);
    if (!e || e.exited) return;
    const text = e.partial + chunk;
    const parts = text.split('\n');
    e.partial = parts.pop() ?? '';
    for (const line of parts) this.pushLine(e, stripAnsi(line));
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
    if (e.partial.length > 0) {
      this.pushLine(e, stripAnsi(e.partial));
      e.partial = '';
    }
    e.exited = true;
    e.exitCode = code;
    for (const l of e.exitListeners) l(code);
    e.lineListeners.clear();
    e.exitListeners.clear();
    this.scheduleEvict(() => this.entries.delete(pid), this.evictGraceMs);
  }
}
