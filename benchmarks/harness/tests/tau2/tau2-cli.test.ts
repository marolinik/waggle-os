import { describe, expect, it } from 'vitest';
import {
  buildTau2RunArgv,
  type Tau2RunSpec,
} from '../../src/tau2/tau2-cli.js';
import * as tau2 from '../../src/tau2/index.js';

const BASE: Tau2RunSpec = {
  domain: 'retail',
  agent: 'waggle',
  agentLlm: 'qwen3.6-35b-a3b',
  userLlm: 'gpt-5.5',          // the PINNED user simulator
  numTrials: 4,
  seed: 42,
  saveTo: 'qwen_retail',
  maxSteps: 30,
};

describe('buildTau2RunArgv — exact flag contract', () => {
  it('emits run + all required flags in a stable shape', () => {
    const argv = buildTau2RunArgv(BASE);
    expect(argv[0]).toBe('run');
    expect(argv).toContain('--domain'); expect(argv[argv.indexOf('--domain') + 1]).toBe('retail');
    expect(argv).toContain('--agent'); expect(argv[argv.indexOf('--agent') + 1]).toBe('waggle');
    expect(argv).toContain('--agent-llm'); expect(argv[argv.indexOf('--agent-llm') + 1]).toBe('qwen3.6-35b-a3b');
    expect(argv).toContain('--user-llm'); expect(argv[argv.indexOf('--user-llm') + 1]).toBe('gpt-5.5');
    expect(argv).toContain('--num-trials'); expect(argv[argv.indexOf('--num-trials') + 1]).toBe('4');
    expect(argv).toContain('--seed'); expect(argv[argv.indexOf('--seed') + 1]).toBe('42');
    expect(argv).toContain('--save-to'); expect(argv[argv.indexOf('--save-to') + 1]).toBe('qwen_retail');
    expect(argv).toContain('--max-steps'); expect(argv[argv.indexOf('--max-steps') + 1]).toBe('30');
  });

  it('includes --num-tasks only when set', () => {
    expect(buildTau2RunArgv(BASE)).not.toContain('--num-tasks');
    const argv = buildTau2RunArgv({ ...BASE, numTasks: 5 });
    expect(argv).toContain('--num-tasks');
    expect(argv[argv.indexOf('--num-tasks') + 1]).toBe('5');
  });

  it('includes --task-ids as a comma-joined list when set', () => {
    const argv = buildTau2RunArgv({ ...BASE, taskIds: ['t-1', 't-2'] });
    expect(argv).toContain('--task-ids');
    expect(argv[argv.indexOf('--task-ids') + 1]).toBe('t-1,t-2');
  });

  it('includes --max-concurrency when set', () => {
    const argv = buildTau2RunArgv({ ...BASE, maxConcurrency: 1 });
    expect(argv[argv.indexOf('--max-concurrency') + 1]).toBe('1');
  });
});

describe('buildTau2RunArgv — the user-sim pinning invariant', () => {
  it('two arms with different agent-llm MUST share the identical user-llm', () => {
    const PIN = 'gpt-5.5';
    const armQwen = buildTau2RunArgv({ ...BASE, agentLlm: 'qwen3.6-35b-a3b', userLlm: PIN });
    const armOpus = buildTau2RunArgv({ ...BASE, agentLlm: 'claude-opus-4-8', userLlm: PIN });
    const userOf = (a: string[]) => a[a.indexOf('--user-llm') + 1];
    expect(userOf(armQwen)).toBe(PIN);
    expect(userOf(armOpus)).toBe(PIN);
    expect(userOf(armQwen)).toBe(userOf(armOpus));   // the confound guard
  });
});

describe('buildTau2RunArgv — validation', () => {
  it('rejects an empty domain', () => {
    expect(() => buildTau2RunArgv({ ...BASE, domain: '' })).toThrow(/domain/);
  });
  it('rejects an empty userLlm (user-sim MUST be pinned)', () => {
    expect(() => buildTau2RunArgv({ ...BASE, userLlm: '' })).toThrow(/userLlm.*pinned/);
  });
  it('rejects numTrials < 1', () => {
    expect(() => buildTau2RunArgv({ ...BASE, numTrials: 0 })).toThrow(/numTrials/);
  });
  it('rejects a non-integer seed', () => {
    expect(() => buildTau2RunArgv({ ...BASE, seed: 1.5 })).toThrow(/integer seed/);
  });
});

describe('τ² barrel surface', () => {
  it('re-exports the adapter functions + the REWARD_PASS oracle constant', () => {
    expect(typeof tau2.buildTau2RunArgv).toBe('function');
    expect(typeof tau2.computeTaskOutcomes).toBe('function');
    expect(typeof tau2.toTau2JsonlRecords).toBe('function');
    expect(typeof tau2.runTau2).toBe('function');
    expect(tau2.REWARD_PASS).toBe(1.0);
    expect(tau2.TAU2_LICENSE_SPDX).toBe('MIT');
  });
});
