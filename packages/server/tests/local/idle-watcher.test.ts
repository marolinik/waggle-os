import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  IdleSessionWatcher,
  countTurns,
  readRecentTranscript,
  buildReviewInstruction,
  NOTHING_TO_DO,
  DEFAULT_CONFIG,
  type SelfEvolutionConfig,
  type ReviewTurnResult,
} from '../../src/local/idle-watcher.js';
import { getNotificationGate } from '../../src/local/notification-gate.js';

// A fixed synthetic "now" so idle math is deterministic.
const NOW = 2_000_000_000_000;
const MIN = 60_000;

describe('idle-watcher', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-idle-'));
  });
  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // ── Fixtures ─────────────────────────────────────────────────────────
  function writeConfig(cfg: Partial<SelfEvolutionConfig> | string): void {
    const body = typeof cfg === 'string' ? cfg : JSON.stringify(cfg);
    fs.writeFileSync(path.join(dataDir, 'self-evolution.json'), body);
  }

  /** Create a session .jsonl with `turns` message lines and a given mtime (ms). */
  function writeSession(workspaceId: string, sessionId: string, turns: number, mtimeMs: number): void {
    const dir = path.join(dataDir, 'workspaces', workspaceId, 'sessions');
    fs.mkdirSync(dir, { recursive: true });
    const lines = [JSON.stringify({ type: 'meta', title: sessionId })];
    for (let i = 0; i < turns; i++) {
      lines.push(JSON.stringify({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` }));
    }
    const filePath = path.join(dir, `${sessionId}.jsonl`);
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
    fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
  }

  function makeWatcher(over?: {
    runReviewTurn?: (i: { sessionId: string; workspaceId: string }) => Promise<ReviewTurnResult>;
  }) {
    const reviewed: Array<{ sessionId: string; workspaceId: string }> = [];
    const emitCalls: Array<{ suppressed: boolean; dedupeKey?: string }> = [];
    const runReviewTurn =
      over?.runReviewTurn ??
      (async (i: { sessionId: string; workspaceId: string }) => {
        reviewed.push(i);
        return { content: NOTHING_TO_DO };
      });
    const runSpy = vi.fn(runReviewTurn);
    const watcher = new IdleSessionWatcher({
      dataDir,
      now: () => NOW,
      runReviewTurn: runSpy,
      // Mirror production emitNotification's gate so suppression is genuinely tested.
      emitNotification: (_event, options) => {
        let suppressed = false;
        if (options?.dedupeKey && options.materialHash) {
          suppressed = !getNotificationGate(dataDir).shouldNotify(options.dedupeKey, options.materialHash);
        }
        emitCalls.push({ suppressed, dedupeKey: options?.dedupeKey });
        return { suppressed };
      },
      log: { info: () => {}, warn: () => {} },
    });
    return { watcher, reviewed, emitCalls, runSpy };
  }

  // ── Fire-condition matrix ────────────────────────────────────────────
  describe('fire condition', () => {
    beforeEach(() => writeConfig({ enabled: true })); // rest of fields default

    it('reviews an idle session with enough turns', async () => {
      writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
      const { watcher, reviewed } = makeWatcher();
      const n = await watcher.tick();
      expect(n).toBe(1);
      expect(reviewed).toEqual([{ sessionId: 'sess-a', workspaceId: 'w1' }]);
    });

    it('does NOT review a still-active session (mtime too recent)', async () => {
      writeSession('w1', 'sess-active', 10, NOW - 5 * MIN); // < 15 min idle
      const { watcher, reviewed } = makeWatcher();
      expect(await watcher.tick()).toBe(0);
      expect(reviewed).toEqual([]);
    });

    it('does NOT review a session below the turn threshold', async () => {
      writeSession('w1', 'sess-short', 3, NOW - 30 * MIN); // idle but only 3 turns
      const { watcher, reviewed } = makeWatcher();
      expect(await watcher.tick()).toBe(0);
      expect(reviewed).toEqual([]);
    });
  });

  // ── Fired-set: no re-fire until mtime advances ───────────────────────
  it('does not re-review the same session until its file advances', async () => {
    writeConfig({ enabled: true });
    writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
    const { watcher, runSpy } = makeWatcher();

    expect(await watcher.tick()).toBe(1);
    expect(await watcher.tick()).toBe(0); // same mtime — already fired
    expect(runSpy).toHaveBeenCalledTimes(1);

    // File advances (a new message lands) → new mtime key → re-fires once.
    writeSession('w1', 'sess-a', 7, NOW - 18 * MIN);
    expect(await watcher.tick()).toBe(1);
    expect(runSpy).toHaveBeenCalledTimes(2);
  });

  // ── Disabled / config handling ───────────────────────────────────────
  it('is a no-op when disabled (default)', async () => {
    writeConfig({ enabled: false });
    writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
    const { watcher, runSpy } = makeWatcher();
    expect(await watcher.tick()).toBe(0);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when the config file is absent (defaults ⇒ disabled)', async () => {
    writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
    const { watcher, runSpy } = makeWatcher();
    expect(await watcher.tick()).toBe(0);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('falls back to defaults on a corrupt config (⇒ disabled)', async () => {
    writeConfig('{ this is not json');
    writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
    const { watcher, runSpy } = makeWatcher();
    expect(await watcher.tick()).toBe(0);
    expect(runSpy).not.toHaveBeenCalled();
    expect(DEFAULT_CONFIG.enabled).toBe(false);
  });

  it('applies partial config over defaults (enabled + custom idle threshold)', async () => {
    writeConfig({ enabled: true, idleMinutes: 60 }); // minTurns/cap default
    writeSession('w1', 'fresh', 6, NOW - 30 * MIN); // idle 30m < 60m ⇒ skipped
    writeSession('w1', 'old', 6, NOW - 90 * MIN); // idle 90m ⇒ reviewed
    const { watcher, reviewed } = makeWatcher();
    expect(await watcher.tick()).toBe(1);
    expect(reviewed).toEqual([{ sessionId: 'old', workspaceId: 'w1' }]);
  });

  // ── Daily cap ────────────────────────────────────────────────────────
  it('enforces maxReviewsPerDay', async () => {
    writeConfig({ enabled: true, maxReviewsPerDay: 2 });
    writeSession('w1', 's1', 6, NOW - 20 * MIN);
    writeSession('w1', 's2', 6, NOW - 21 * MIN);
    writeSession('w1', 's3', 6, NOW - 22 * MIN);
    const { watcher, runSpy } = makeWatcher();
    const n = await watcher.tick();
    expect(n).toBe(2); // capped at 2 even though 3 are eligible
    expect(runSpy).toHaveBeenCalledTimes(2);
    // A later tick in the same day stays capped (the 3rd never runs).
    expect(await watcher.tick()).toBe(0);
    expect(runSpy).toHaveBeenCalledTimes(2);
  });

  // ── Enumeration skips channel-/evolve- prefixes ──────────────────────
  it('skips channel-* and evolve-* sessions', async () => {
    writeConfig({ enabled: true });
    writeSession('w1', 'channel-telegram-123', 6, NOW - 20 * MIN);
    writeSession('w1', 'evolve-sess-a', 6, NOW - 20 * MIN);
    writeSession('w1', 'sess-real', 6, NOW - 20 * MIN);
    const { watcher, reviewed } = makeWatcher();
    expect(await watcher.tick()).toBe(1);
    expect(reviewed).toEqual([{ sessionId: 'sess-real', workspaceId: 'w1' }]);
  });

  // ── Notification gating ──────────────────────────────────────────────
  it('does NOT notify on a NOTHING_TO_DO / empty / error result', async () => {
    writeConfig({ enabled: true });
    writeSession('w1', 'ntd', 6, NOW - 20 * MIN);
    writeSession('w1', 'empty', 6, NOW - 21 * MIN);
    writeSession('w1', 'err', 6, NOW - 22 * MIN);
    const results: Record<string, ReviewTurnResult> = {
      ntd: { content: NOTHING_TO_DO },
      empty: { content: '   ' },
      err: { content: 'partial', error: 'boom' },
    };
    const { watcher, emitCalls } = makeWatcher({
      runReviewTurn: async ({ sessionId }) => results[sessionId],
    });
    await watcher.tick();
    expect(emitCalls).toHaveLength(0);
  });

  it('notifies once on a material finding and suppresses an identical re-finding', async () => {
    writeConfig({ enabled: true });
    writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
    const { watcher, emitCalls } = makeWatcher({
      runReviewTurn: async () => ({ content: 'Finding: the assistant promised a report and never produced it.' }),
    });

    await watcher.tick();
    expect(emitCalls).toHaveLength(1);
    expect(emitCalls[0].suppressed).toBe(false);
    expect(emitCalls[0].dedupeKey).toBe('self-evolution:sess-a');

    // Session advances, same finding recurs → notification suppressed (anti-nag).
    writeSession('w1', 'sess-a', 7, NOW - 18 * MIN);
    await watcher.tick();
    expect(emitCalls).toHaveLength(2);
    expect(emitCalls[1].suppressed).toBe(true);
  });

  // ── Single-flight guard ──────────────────────────────────────────────
  it('tick is single-flight (a re-entrant tick returns 0)', async () => {
    writeConfig({ enabled: true });
    writeSession('w1', 'sess-a', 6, NOW - 20 * MIN);
    let secondResult = -1;
    const { watcher } = makeWatcher({
      runReviewTurn: async () => {
        // Re-enter while the first tick is still in-flight.
        secondResult = await watcher.tick();
        return { content: NOTHING_TO_DO };
      },
    });
    await watcher.tick();
    expect(secondResult).toBe(0);
  });
});

// ── Pure helpers ───────────────────────────────────────────────────────
describe('idle-watcher pure helpers', () => {
  it('countTurns excludes the meta line', () => {
    const raw = [
      JSON.stringify({ type: 'meta', title: 't' }),
      JSON.stringify({ role: 'user', content: 'hi' }),
      JSON.stringify({ role: 'assistant', content: 'yo' }),
    ].join('\n');
    expect(countTurns(raw)).toBe(2);
  });

  it('countTurns counts every non-empty line when there is no meta', () => {
    const raw = [
      JSON.stringify({ role: 'user', content: 'hi' }),
      JSON.stringify({ role: 'assistant', content: 'yo' }),
    ].join('\n');
    expect(countTurns(raw)).toBe(2);
    expect(countTurns('')).toBe(0);
  });

  it('readRecentTranscript formats messages and skips meta; null when unreadable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tr-'));
    try {
      const sessionsDir = path.join(dir, 'workspaces', 'w1', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionsDir, 'sess-a.jsonl'),
        [
          JSON.stringify({ type: 'meta', title: 't' }),
          JSON.stringify({ role: 'user', content: 'build me a report' }),
          JSON.stringify({ role: 'assistant', content: 'on it' }),
        ].join('\n'),
      );
      const t = readRecentTranscript(dir, 'w1', 'sess-a');
      expect(t).toContain('USER: build me a report');
      expect(t).toContain('ASSISTANT: on it');
      expect(t).not.toContain('meta');
      expect(readRecentTranscript(dir, 'w1', 'missing')).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('buildReviewInstruction embeds the transcript and the NOTHING_TO_DO contract', () => {
    const msg = buildReviewInstruction('sess-a', 'USER: hi');
    expect(msg).toContain('sess-a');
    expect(msg).toContain('USER: hi');
    expect(msg).toContain(NOTHING_TO_DO);
    expect(msg).toContain('create_skill');
  });
});
