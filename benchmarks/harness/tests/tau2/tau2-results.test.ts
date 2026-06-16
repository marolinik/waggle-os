import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseTau2Results,
  computeTaskOutcomes,
  REWARD_PASS,
  type Tau2TaskOutcome,
} from '../../src/tau2/tau2-results.js';
import type { Tau2Results } from '../../src/tau2/tau2-types.js';

const HERE = url.fileURLToPath(import.meta.url);
const FIXTURE = path.resolve(path.dirname(HERE), 'fixtures', 'mock-results.json');

function loadFixture(): Tau2Results {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf-8')) as Tau2Results;
}

describe('parseTau2Results — structural validation', () => {
  it('parses the fixture and returns 6 simulations', () => {
    const r = parseTau2Results(loadFixture());
    expect(r.simulations).toHaveLength(6);
  });
  it('throws when simulations is missing', () => {
    expect(() => parseTau2Results({} as Tau2Results)).toThrow(/simulations/);
  });
  it('throws when a simulation lacks task_id', () => {
    expect(() =>
      parseTau2Results({ simulations: [{ id: 'x' } as never] } as Tau2Results),
    ).toThrow(/task_id/);
  });
});

describe('computeTaskOutcomes — the state/action oracle (NOT substring)', () => {
  it('groups by task_id into one outcome per task', () => {
    const outcomes = computeTaskOutcomes(parseTau2Results(loadFixture()));
    expect(outcomes.map(o => o.task_id).sort()).toEqual(['task-A', 'task-B']);
  });

  it('per-trial pass uses reward >= REWARD_PASS (1.0), not text match', () => {
    const a = outcome(outcomes(), 'task-A');
    // task-A trials: reward 1.0, 0.0, 1.0 → 2 of 3 pass.
    expect(a.trialPasses).toEqual([true, false, true]);
    expect(REWARD_PASS).toBe(1.0);
  });

  it('pass^1 = mean trial pass rate', () => {
    const a = outcome(outcomes(), 'task-A');
    expect(a.pass1).toBeCloseTo(2 / 3, 10);
    const b = outcome(outcomes(), 'task-B');
    expect(b.pass1).toBe(1);
  });

  it('pass^k = ALL k trials pass (the τ² reliability metric)', () => {
    const a = outcome(outcomes(), 'task-A'); // 2/3 pass → NOT all → passK false
    expect(a.k).toBe(3);
    expect(a.passK).toBe(false);
    const b = outcome(outcomes(), 'task-B'); // 3/3 pass → passK true
    expect(b.passK).toBe(true);
  });

  it('captures the reward_basis that drove the oracle', () => {
    expect(outcome(outcomes(), 'task-A').rewardBasis).toEqual(['DB', 'ACTION']);
    expect(outcome(outcomes(), 'task-B').rewardBasis).toEqual(['COMMUNICATE']);
  });

  it('averages tokens / turns / tool-calls / $ over trials (efficiency)', () => {
    const a = outcome(outcomes(), 'task-A');
    // turns = assistant messages per trial: trial0=2, trial1=2, trial2=2 → mean 2
    expect(a.meanTurns).toBe(2);
    // tool-calls per trial: 1,1,1 → mean 1
    expect(a.meanToolCalls).toBe(1);
    // tokens per trial (sum of usage prompt+completion across that trial's msgs):
    //   trial0 = (100+20)+(130+10)=260 ; trial1 = (100+25)+(140+8)=273 ; trial2 = (105+21)+(132+9)=267
    //   mean = (260+273+267)/3 = 266.666...
    expect(a.meanTokens).toBeCloseTo((260 + 273 + 267) / 3, 6);
    // $ per trial: 0.0100, 0.0120, 0.0110 → mean 0.0110
    expect(a.meanCostUsd).toBeCloseTo(0.011, 10);
  });

  it('reports inter-trial trajectory diversity (B5 variance-collapse guard)', () => {
    // task-B: all three final answers identical → diversity 0.
    expect(outcome(outcomes(), 'task-B').trajectoryDiversity).toBe(0);
    // task-A: final contents "done","give up","done" → 2 distinct of 3.
    expect(outcome(outcomes(), 'task-A').trajectoryDiversity).toBeCloseTo(2 / 3, 10);
  });
});

// ── helpers ──
function outcomes(): Tau2TaskOutcome[] {
  return computeTaskOutcomes(parseTau2Results(loadFixture()));
}
function outcome(list: Tau2TaskOutcome[], id: string): Tau2TaskOutcome {
  const o = list.find(x => x.task_id === id);
  if (!o) throw new Error(`no outcome for ${id}`);
  return o;
}
