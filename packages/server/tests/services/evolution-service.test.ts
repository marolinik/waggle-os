/**
 * H-10 G1 tests — EvolutionService.
 *
 * Covers:
 *   - minimum-dataset gate (skips when no target has enough new traces)
 *   - api-key gate (skips when vault is empty)
 *   - target selection (never-run first, then oldest lastRunAt, then most traces)
 *   - baseline resolution (persona + behavioral-spec-section + overrides)
 *   - start/stop/tickInFlight lifecycle
 *   - env flag parsing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB, ExecutionTraceStore, EvolutionRunStore } from '@waggle/core';
import { BEHAVIORAL_SPEC_SECTIONS } from '@waggle/agent';
import {
  EvolutionService,
  isEvolutionAutoEnabled,
  type EvolutionServiceDeps,
  type EvolutionTargetId,
  type TickResult,
} from '../../src/local/services/evolution-service.js';

// ── Shared test fixture ──────────────────────────────────────────

interface Fixture {
  tmpDir: string;
  mind: MindDB;
  traceStore: ExecutionTraceStore;
  runStore: EvolutionRunStore;
  apiKey: string | null;
  activeSpec: Record<string, string>;
  makeDeps: (overrides?: Partial<EvolutionServiceDeps>) => EvolutionServiceDeps;
}

function setupFixture(): Fixture {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-evo-svc-'));
  const mind = new MindDB(path.join(tmpDir, 'test.mind'));
  const traceStore = new ExecutionTraceStore(mind);
  const runStore = new EvolutionRunStore(mind);

  const fx: Fixture = {
    tmpDir,
    mind,
    traceStore,
    runStore,
    apiKey: 'sk-test',
    activeSpec: {},
    makeDeps: (overrides = {}) => ({
      traceStore,
      runStore,
      getApiKey: () => fx.apiKey,
      getActiveBehavioralSpec: () => fx.activeSpec,
      ...overrides,
    }),
  };
  return fx;
}

function teardown(fx: Fixture): void {
  fx.mind.close();
  try { fs.rmSync(fx.tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 */ }
}

/** Seed `count` successful finalized traces for a given personaId. */
function seedTraces(
  fx: Fixture,
  opts: { personaId?: string; count: number; outcome?: 'success' | 'corrected' | 'pending' },
): void {
  for (let i = 0; i < opts.count; i++) {
    const id = fx.traceStore.start({
      personaId: opts.personaId ?? null,
      input: `q${i}`,
    });
    const outcome = opts.outcome ?? 'success';
    if (outcome !== 'pending') {
      fx.traceStore.finalize(id, { outcome, output: `a${i}` });
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe('EvolutionService — H-10 G1', () => {
  let fx: Fixture;
  beforeEach(() => { fx = setupFixture(); });
  afterEach(() => { teardown(fx); });

  describe('dataset gate + target selection', () => {
    const targets: EvolutionTargetId[] = [
      { kind: 'persona-system-prompt', name: 'coder' },
      { kind: 'persona-system-prompt', name: 'writer' },
    ];

    it('pickNextTarget returns null when no persona has enough traces', () => {
      seedTraces(fx, { personaId: 'coder', count: 5 });
      const svc = new EvolutionService(fx.makeDeps(), { targets, minTracesPerTarget: 20 });
      expect(svc.pickNextTarget()).toBeNull();
    });

    it('pickNextTarget picks the never-run target that clears the gate', () => {
      seedTraces(fx, { personaId: 'coder', count: 25 });
      seedTraces(fx, { personaId: 'writer', count: 5 });
      const svc = new EvolutionService(fx.makeDeps(), { targets, minTracesPerTarget: 20 });
      const chosen = svc.pickNextTarget();
      expect(chosen?.name).toBe('coder');
      expect(chosen?.newTraces).toBe(25);
      expect(chosen?.lastRunAt).toBeNull();
    });

    it('prefers never-run targets over those with an older lastRunAt', () => {
      // Both qualify by trace count.
      seedTraces(fx, { personaId: 'coder', count: 30 });
      seedTraces(fx, { personaId: 'writer', count: 30 });
      // coder has a historical run; writer has none.
      fx.runStore.create({
        targetKind: 'persona-system-prompt',
        targetName: 'coder',
        baselineText: 'b', winnerText: 'w',
        deltaAccuracy: 0.05, gateVerdict: 'pass', gateReasons: [],
      });

      const svc = new EvolutionService(fx.makeDeps(), { targets, minTracesPerTarget: 20 });
      expect(svc.pickNextTarget()?.name).toBe('writer');
    });

    it('only counts outcomes in eligibleOutcomes', () => {
      seedTraces(fx, { personaId: 'coder', count: 30, outcome: 'pending' });
      const svc = new EvolutionService(fx.makeDeps(), {
        targets,
        minTracesPerTarget: 20,
        eligibleOutcomes: ['success'],
      });
      // All pending — 0 eligible even though 30 exist.
      expect(svc.pickNextTarget()).toBeNull();
    });

    it('counts only traces created since the last run when computing newTraces', () => {
      // Seed historical traces first.
      seedTraces(fx, { personaId: 'coder', count: 100 });

      // Record a run with a created_at that's strictly AFTER the trace rows.
      // SQLite datetime('now') has second-level precision, so we need to bump
      // the run's timestamp forward by an hour to avoid a same-second
      // collision that would make "since >= lastRunAt" include the seeded
      // traces. Using raw SQL is the least invasive way to simulate time
      // advancing between seed and run creation.
      const run = fx.runStore.create({
        targetKind: 'persona-system-prompt',
        targetName: 'coder',
        baselineText: 'b', winnerText: 'w',
        deltaAccuracy: 0.05, gateVerdict: 'pass', gateReasons: [],
      });
      const futureTs = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
      fx.mind.getDatabase()
        .prepare('UPDATE evolution_runs SET created_at = ? WHERE run_uuid = ?')
        .run(futureTs, run.run_uuid);

      const svc = new EvolutionService(fx.makeDeps(), { targets, minTracesPerTarget: 20 });
      const candidates = svc.enumerateCandidates();
      const coder = candidates.find(c => c.name === 'coder');
      expect(coder?.lastRunAt).toBe(futureTs);
      expect(coder?.newTraces).toBe(0);
    });
  });

  describe('baseline resolution', () => {
    it('resolves a real persona baseline from the registry', () => {
      const svc = new EvolutionService(fx.makeDeps(), { targets: [] });
      const baseline = svc.resolveBaseline({ kind: 'persona-system-prompt', name: 'coder' });
      expect(baseline).toBeTruthy();
      expect(typeof baseline).toBe('string');
    });

    it('returns null for an unknown persona', () => {
      const svc = new EvolutionService(fx.makeDeps(), { targets: [] });
      expect(svc.resolveBaseline({ kind: 'persona-system-prompt', name: 'nope' })).toBeNull();
    });

    it('prefers the active behavioral spec when an override exists', () => {
      const section = BEHAVIORAL_SPEC_SECTIONS[0];
      fx.activeSpec[section] = 'OVERRIDDEN TEXT';
      const svc = new EvolutionService(fx.makeDeps(), { targets: [] });
      expect(svc.resolveBaseline({ kind: 'behavioral-spec-section', name: section }))
        .toBe('OVERRIDDEN TEXT');
    });

    it('falls back to compile-time BEHAVIORAL_SPEC when no override', () => {
      const section = BEHAVIORAL_SPEC_SECTIONS[0];
      const svc = new EvolutionService(fx.makeDeps(), { targets: [] });
      const baseline = svc.resolveBaseline({ kind: 'behavioral-spec-section', name: section });
      expect(baseline).toBeTruthy();
      expect(typeof baseline).toBe('string');
    });

    it('returns null for tool-description / skill-body / generic (not auto-evolvable)', () => {
      const svc = new EvolutionService(fx.makeDeps(), { targets: [] });
      expect(svc.resolveBaseline({ kind: 'tool-description', name: 'anything' })).toBeNull();
      expect(svc.resolveBaseline({ kind: 'skill-body', name: 'anything' })).toBeNull();
      expect(svc.resolveBaseline({ kind: 'generic', name: 'anything' })).toBeNull();
    });
  });

  describe('tick outcomes', () => {
    const targets: EvolutionTargetId[] = [
      { kind: 'persona-system-prompt', name: 'coder' },
    ];

    it('skips when no API key is configured', async () => {
      fx.apiKey = null;
      const svc = new EvolutionService(fx.makeDeps(), { targets, minTracesPerTarget: 1 });
      const result = await svc.tick();
      expect(result.skipped).toBe(true);
      if (result.skipped) expect(result.reason).toMatch(/api key/i);
    });

    it('skips when no target clears the gate', async () => {
      // Zero traces for any target.
      const svc = new EvolutionService(fx.makeDeps(), { targets, minTracesPerTarget: 20 });
      const result = await svc.tick();
      expect(result.skipped).toBe(true);
      if (result.skipped) expect(result.reason).toMatch(/dataset gate/);
    });

    it('invokes the runner for the picked target when gate passes', async () => {
      seedTraces(fx, { personaId: 'coder', count: 25 });
      const runner = vi.fn<Parameters<NonNullable<EvolutionServiceDeps['runner']>>, Promise<TickResult>>()
        .mockResolvedValue({
          skipped: false,
          targetKind: 'persona-system-prompt',
          targetName: 'coder',
          outcome: 'proposed',
          runUuid: 'uuid-stub',
        });

      const svc = new EvolutionService(
        fx.makeDeps({ runner }),
        { targets, minTracesPerTarget: 20 },
      );

      const result = await svc.tick();
      expect(runner).toHaveBeenCalledOnce();
      const [calledTarget, calledBaseline, calledKey] = runner.mock.calls[0];
      // The service passes the full candidate (incl. lastRunAt + newTraces),
      // not just the bare target id.
      expect(calledTarget).toMatchObject({ kind: 'persona-system-prompt', name: 'coder' });
      expect(calledBaseline).toBeTruthy();
      expect(calledKey).toBe('sk-test');

      expect(result.skipped).toBe(false);
      if (!result.skipped) {
        expect(result.outcome).toBe('proposed');
        expect(result.runUuid).toBe('uuid-stub');
      }
    });

    it('surfaces runner errors through the tick return, not a throw', async () => {
      seedTraces(fx, { personaId: 'coder', count: 25 });
      const runner = vi.fn().mockRejectedValue(new Error('boom'));
      const svc = new EvolutionService(
        fx.makeDeps({ runner }),
        { targets, minTracesPerTarget: 20 },
      );

      const result = await svc.tick();
      expect(result.skipped).toBe(true);
      if (result.skipped) expect(result.reason).toMatch(/tick failed: boom/);
    });

    it('reentrancy guard: concurrent tick returns "already in progress"', async () => {
      seedTraces(fx, { personaId: 'coder', count: 25 });
      let resolve: ((v: TickResult) => void) | null = null;
      const runner = vi.fn(() => new Promise<TickResult>(r => { resolve = r; }));

      const svc = new EvolutionService(
        fx.makeDeps({ runner }),
        { targets, minTracesPerTarget: 20 },
      );

      const first = svc.tick();
      const second = await svc.tick(); // before first resolves

      expect(second.skipped).toBe(true);
      if (second.skipped) expect(second.reason).toMatch(/already in progress/);

      // Unblock and let the first finish cleanly.
      resolve!({
        skipped: false,
        targetKind: 'persona-system-prompt',
        targetName: 'coder',
        outcome: 'proposed',
        runUuid: null,
      });
      await first;
    });
  });

  describe('lifecycle', () => {
    it('start/stop toggles isRunning', () => {
      const svc = new EvolutionService(fx.makeDeps(), { targets: [], tickIntervalMs: 60_000 });
      expect(svc.isRunning()).toBe(false);
      svc.start();
      expect(svc.isRunning()).toBe(true);
      svc.stop();
      expect(svc.isRunning()).toBe(false);
    });

    it('start is idempotent — double-start leaves a single timer', () => {
      const svc = new EvolutionService(fx.makeDeps(), { targets: [], tickIntervalMs: 60_000 });
      svc.start();
      const firstTimer = (svc as unknown as { timer: NodeJS.Timeout | null }).timer;
      svc.start();
      const secondTimer = (svc as unknown as { timer: NodeJS.Timeout | null }).timer;
      expect(firstTimer).toBe(secondTimer);
      svc.stop();
    });

    it('clamps tickIntervalMs to at least 60s', () => {
      const svc = new EvolutionService(fx.makeDeps(), { targets: [], tickIntervalMs: 1 });
      expect(svc.config.tickIntervalMs).toBe(60_000);
    });
  });

  describe('isEvolutionAutoEnabled', () => {
    it('returns false when the flag is missing or unrelated', () => {
      expect(isEvolutionAutoEnabled({})).toBe(false);
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: '' })).toBe(false);
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: 'false' })).toBe(false);
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: '0' })).toBe(false);
    });
    it('returns true for "1" / "true" / "yes"', () => {
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: '1' })).toBe(true);
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: 'true' })).toBe(true);
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: 'TRUE' })).toBe(true);
      expect(isEvolutionAutoEnabled({ WAGGLE_EVOLUTION_AUTO_ENABLED: 'yes' })).toBe(true);
    });
  });
});
