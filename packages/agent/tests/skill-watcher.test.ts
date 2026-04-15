/**
 * Skills 2.0 Tier 3b — fs.watch-based SKILL.md watcher.
 *
 * fs.watch semantics are OS-dependent (inotify/FSEvents/ReadDirectoryChangesW)
 * so tests verify the public contract rather than exact event counts:
 *   - callback fires for .md changes
 *   - non-.md files are ignored
 *   - callback is debounced (single burst → one call)
 *   - close() is idempotent and silences further events
 *   - unsupported filesystems don't crash
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { watchSkillDirectory } from '../src/skill-watcher.js';

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

describe('watchSkillDirectory — Tier 3b', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skill-watch-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'not-yet-created');
    expect(fs.existsSync(newDir)).toBe(false);
    const handle = watchSkillDirectory(newDir, { onChange: () => {} });
    expect(fs.existsSync(newDir)).toBe(true);
    handle.close();
  });

  it('fires onChange when a .md file is written', async () => {
    const events: string[][] = [];
    const handle = watchSkillDirectory(tmpDir, {
      onChange: (changed) => events.push(changed),
      debounceMs: 50,
    });

    fs.writeFileSync(path.join(tmpDir, 'fresh.md'), 'body');
    await sleep(200); // let the debounced callback fire

    expect(events.length).toBeGreaterThanOrEqual(1);
    const allChanged = events.flat();
    expect(allChanged).toContain('fresh.md');
    handle.close();
  });

  it('ignores non-.md files', async () => {
    const events: string[][] = [];
    const handle = watchSkillDirectory(tmpDir, {
      onChange: (changed) => events.push(changed),
      debounceMs: 50,
    });

    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'body');
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
    await sleep(200);

    const allChanged = events.flat();
    expect(allChanged).not.toContain('notes.txt');
    expect(allChanged).not.toContain('config.json');
    handle.close();
  });

  it('debounces rapid .md writes into a single callback', async () => {
    const events: string[][] = [];
    const handle = watchSkillDirectory(tmpDir, {
      onChange: (changed) => events.push(changed),
      debounceMs: 100,
    });

    fs.writeFileSync(path.join(tmpDir, 'a.md'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'b.md'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'c.md'), 'x');
    await sleep(250);

    // One debounced callback with all changed files
    expect(events.length).toBeLessThanOrEqual(2); // 1 debounce window + possible tail
    const allChanged = new Set(events.flat());
    expect(allChanged.has('a.md')).toBe(true);
    expect(allChanged.has('b.md')).toBe(true);
    expect(allChanged.has('c.md')).toBe(true);
    handle.close();
  });

  it('close() is idempotent and silences further callbacks', async () => {
    let calls = 0;
    const handle = watchSkillDirectory(tmpDir, {
      onChange: () => { calls++; },
      debounceMs: 30,
    });

    handle.close();
    handle.close(); // second close must not throw

    fs.writeFileSync(path.join(tmpDir, 'post-close.md'), 'x');
    await sleep(150);

    expect(calls).toBe(0);
  });

  it('does not throw if onChange callback throws', async () => {
    const handle = watchSkillDirectory(tmpDir, {
      onChange: () => { throw new Error('callback explosion'); },
      debounceMs: 30,
    });

    fs.writeFileSync(path.join(tmpDir, 'explode.md'), 'x');
    // If this crashes the process, the test runner will fail globally.
    await sleep(150);
    handle.close();
    expect(true).toBe(true); // reached without unhandled exception
  });
});
