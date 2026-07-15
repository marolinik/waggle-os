import { describe, it, expect } from 'vitest';
import {
  routeTask,
  type ExecutorCandidate,
  type RouteTask,
} from '../src/executor-router.js';

const NOW = 1_000_000;

function candidate(overrides: Partial<ExecutorCandidate> = {}): ExecutorCandidate {
  return {
    id: 'persona:coder',
    kind: 'persona',
    displayName: 'Coder',
    taskFit: { coding: 0.85 },
    authClass: 'api-key',
    installed: true,
    healthy: true,
    rateLimit: { state: 'available' },
    supportsHeadless: false,
    egressDestination: null,
    ...overrides,
  };
}

const CODING: RouteTask = { category: 'coding', privacy: 'normal' };

describe('routeTask — hard gates', () => {
  it('rejects a not-installed candidate with stable reason', () => {
    const d = routeTask(CODING, [candidate({ installed: false })], NOW);
    expect(d.selected).toBeNull();
    expect(d.rejected).toEqual([{ id: 'persona:coder', reason: 'not installed' }]);
    expect(d.scores).toEqual([]);
  });

  it('rejects an unhealthy candidate', () => {
    const d = routeTask(CODING, [candidate({ healthy: false })], NOW);
    expect(d.rejected).toEqual([{ id: 'persona:coder', reason: 'unhealthy' }]);
  });

  it('rejects an external candidate that cannot run headless', () => {
    const d = routeTask(
      CODING,
      [candidate({ id: 'external:codex', kind: 'external', supportsHeadless: false, egressDestination: 'OpenAI' })],
      NOW,
    );
    expect(d.rejected).toEqual([
      { id: 'external:codex', reason: 'does not support headless execution' },
    ]);
  });

  it('does NOT apply the headless gate to personas', () => {
    // persona with supportsHeadless:false must survive (gate is external-only)
    const d = routeTask(CODING, [candidate({ supportsHeadless: false })], NOW);
    expect(d.selected?.id).toBe('persona:coder');
  });

  it('rejects an egressing candidate for a private task, naming the destination', () => {
    const d = routeTask(
      { category: 'coding', privacy: 'private' },
      [candidate({ id: 'external:claude-code', kind: 'external', supportsHeadless: true, egressDestination: 'Anthropic' })],
      NOW,
    );
    expect(d.rejected).toEqual([
      { id: 'external:claude-code', reason: 'blocked by private-task policy (egress to Anthropic)' },
    ]);
  });

  it('allows a local (no-egress) candidate for a private task', () => {
    const d = routeTask(
      { category: 'coding', privacy: 'private' },
      [candidate({ egressDestination: null })],
      NOW,
    );
    expect(d.selected?.id).toBe('persona:coder');
  });

  it('rejects an observed-exhausted candidate with resume time in the reason', () => {
    const d = routeTask(
      CODING,
      [candidate({ rateLimit: { state: 'observed_exhausted', resumeAtMs: 2_000_000 } })],
      NOW,
    );
    expect(d.rejected).toEqual([
      { id: 'persona:coder', reason: 'rate limit exhausted (resumes at 2000000)' },
    ]);
  });

  it('rejects an observed-exhausted candidate without a resume time', () => {
    const d = routeTask(CODING, [candidate({ rateLimit: { state: 'observed_exhausted' } })], NOW);
    expect(d.rejected).toEqual([{ id: 'persona:coder', reason: 'rate limit exhausted' }]);
  });

  it('rejects a candidate still in cooldown', () => {
    const d = routeTask(CODING, [candidate({ cooldownUntilMs: NOW + 5000 })], NOW);
    expect(d.rejected).toEqual([{ id: 'persona:coder', reason: 'in cooldown until 1005000' }]);
  });

  it('accepts a candidate whose cooldown has expired at nowMs', () => {
    const d = routeTask(CODING, [candidate({ cooldownUntilMs: NOW })], NOW);
    expect(d.selected?.id).toBe('persona:coder');
  });

  it('applies gates in fixed order — not-installed wins over other failures', () => {
    const d = routeTask(
      CODING,
      [candidate({ installed: false, healthy: false, rateLimit: { state: 'observed_exhausted' } })],
      NOW,
    );
    expect(d.rejected[0].reason).toBe('not installed');
  });
});

describe('routeTask — scoring & ordering', () => {
  it('scores parts as weighted contributions summing to total', () => {
    const d = routeTask(CODING, [candidate()], NOW);
    const s = d.scores[0];
    // taskFit .85*.5=.425, preference .5*.2=.1, reliability .15, quota 1*.1=.1, latency 1*.05=.05
    expect(s.parts).toEqual({
      taskFit: 0.425,
      preference: 0.1,
      reliability: 0.15,
      quota: 0.1,
      latency: 0.05,
    });
    expect(s.total).toBeCloseTo(0.825, 10);
  });

  it('ranks higher task fit first regardless of input order', () => {
    const weak = candidate({ id: 'persona:general-purpose', displayName: 'GP', taskFit: { coding: 0.6 } });
    const strong = candidate({ id: 'persona:coder', taskFit: { coding: 0.85 } });
    const d = routeTask(CODING, [weak, strong], NOW);
    expect(d.selected?.id).toBe('persona:coder');
    expect(d.alternatives.map((a) => a.id)).toEqual(['persona:general-purpose']);
    expect(d.scores.map((s) => s.id)).toEqual(['persona:coder', 'persona:general-purpose']);
  });

  it('gives an explicit preference match its weighted boost', () => {
    const base = candidate({ id: 'persona:a', taskFit: { coding: 0.8 } });
    const preferred = candidate({ id: 'persona:b', taskFit: { coding: 0.8 } });
    const d = routeTask({ category: 'coding', privacy: 'normal', preferredExecutorId: 'persona:b' }, [base, preferred], NOW);
    expect(d.selected?.id).toBe('persona:b');
  });

  it('scores unknown-quota lower than available-quota', () => {
    const avail = candidate({ id: 'persona:a', rateLimit: { state: 'available' } });
    const unknown = candidate({ id: 'persona:b', rateLimit: { state: 'unknown' } });
    const d = routeTask(CODING, [unknown, avail], NOW);
    expect(d.selected?.id).toBe('persona:a');
  });

  it('scores a missing category fit as 0', () => {
    const d = routeTask({ category: 'ops', privacy: 'normal' }, [candidate({ taskFit: { coding: 0.85 } })], NOW);
    expect(d.scores[0].parts.taskFit).toBe(0);
  });

  it('caps alternatives at 3', () => {
    const cands = ['a', 'b', 'c', 'd', 'e'].map((x, i) =>
      candidate({ id: `persona:${x}`, taskFit: { coding: 0.9 - i * 0.1 } }),
    );
    const d = routeTask(CODING, cands, NOW);
    expect(d.selected?.id).toBe('persona:a');
    expect(d.alternatives).toHaveLength(3);
    expect(d.alternatives.map((a) => a.id)).toEqual(['persona:b', 'persona:c', 'persona:d']);
    expect(d.scores).toHaveLength(5);
  });
});

describe('routeTask — deterministic tie-breaks', () => {
  it('prefers persona over external on an exact score tie', () => {
    // equal task fit; latency weight differs (persona 1.0 vs external 0.7) would
    // already separate them, so force identical latical by same kind is impossible —
    // instead give external a higher fit to offset, producing a true total tie.
    const persona = candidate({ id: 'persona:x', kind: 'persona', taskFit: { coding: 0.6 } });
    // external latency part = .05*.7 = .035 (persona .05) → deficit .015 → +0.03 fit (*.5=.015)
    const external = candidate({
      id: 'external:x',
      kind: 'external',
      supportsHeadless: true,
      egressDestination: 'OpenAI',
      taskFit: { coding: 0.63 },
    });
    const d = routeTask(CODING, [external, persona], NOW);
    expect(d.scores[0].total).toBeCloseTo(d.scores[1].total, 10);
    expect(d.selected?.id).toBe('persona:x'); // persona wins the tie
  });

  it('breaks a persona-vs-persona tie by id ascending', () => {
    const b = candidate({ id: 'persona:bbb', taskFit: { coding: 0.8 } });
    const a = candidate({ id: 'persona:aaa', taskFit: { coding: 0.8 } });
    const d = routeTask(CODING, [b, a], NOW);
    expect(d.scores.map((s) => s.id)).toEqual(['persona:aaa', 'persona:bbb']);
    expect(d.selected?.id).toBe('persona:aaa');
  });
});

describe('routeTask — empty & all-rejected', () => {
  it('returns an all-null decision for no candidates', () => {
    const d = routeTask(CODING, [], NOW);
    expect(d).toEqual({ selected: null, alternatives: [], rejected: [], scores: [] });
  });

  it('returns no selection when every candidate is gated out', () => {
    const d = routeTask(CODING, [candidate({ id: 'persona:a', installed: false }), candidate({ id: 'persona:b', healthy: false })], NOW);
    expect(d.selected).toBeNull();
    expect(d.alternatives).toEqual([]);
    expect(d.scores).toEqual([]);
    expect(d.rejected.map((r) => r.id)).toEqual(['persona:a', 'persona:b']);
  });
});
