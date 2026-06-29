import { describe, it, expect } from 'vitest';
import { ToolOutputBuffer, stripAnsi, type OutputTail } from '../src/tool-output-buffer.js';
import type { ObservedHandle } from '../src/tool-launcher.js';

/** Build a controllable fake handle. */
function fakeHandle() {
  let data: ((c: string) => void) | null = null;
  let exit: ((c: number | null) => void) | null = null;
  const handle: ObservedHandle = {
    onData: (cb) => { data = cb; },
    onExit: (cb) => { exit = cb; },
  };
  return {
    handle,
    emit: (c: string) => data?.(c),
    end: (code: number | null) => exit?.(code),
  };
}

describe('stripAnsi', () => {
  it('removes CSI color sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });
  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain text 123')).toBe('plain text 123');
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

  it('strips ANSI on ingest', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(108, f.handle);
    f.emit('\x1b[32mgreen line\x1b[0m\n');
    expect(buf.getTail(108)!.lines).toEqual(['green line']);
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
    expect(lines).toEqual(['one']);        // replayed synchronously
    f.emit('two\n');
    expect(lines).toEqual(['one', 'two']); // live
    f.end(3);
    expect(exitCode).toBe(3);
  });

  it('subscribe on an already-exited pid replays + calls onExit immediately', () => {
    const buf = new ToolOutputBuffer();
    const f = fakeHandle();
    buf.attach(105, f.handle);
    f.emit('x\n');
    f.end(0);
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

  it('getTail returns null for an unknown pid', () => {
    const buf = new ToolOutputBuffer();
    expect(buf.getTail(404)).toBeNull();
    expect(buf.has(404)).toBe(false);
  });
});
