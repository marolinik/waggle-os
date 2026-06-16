import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  toTau2JsonlRecords,
  writeTau2Jsonl,
  type Tau2EmitContext,
  type Tau2JsonlRecord,
} from '../../src/tau2/tau2-emit.js';
import type { Tau2TaskOutcome } from '../../src/tau2/tau2-results.js';

const CTX: Tau2EmitContext = {
  domain: 'retail',
  agentModelId: 'qwen3.6-35b-a3b',
  userSimModelId: 'gpt-5.5',
  seed: 42,
  arm: 'B',
  memory: 'on',
  manifestHash: 'a'.repeat(64),
};

const OUTCOME: Tau2TaskOutcome = {
  task_id: 'task-A', k: 3, trialPasses: [true, false, true],
  pass1: 2 / 3, passK: false, rewardBasis: ['DB', 'ACTION'],
  meanTokens: 266.6667, meanTurns: 2, meanToolCalls: 1,
  meanCostUsd: 0.011, meanDurationSec: 3.3333, trajectoryDiversity: 2 / 3,
};

describe('toTau2JsonlRecords', () => {
  it('emits exactly one record per outcome', () => {
    const recs = toTau2JsonlRecords([OUTCOME], CTX);
    expect(recs).toHaveLength(1);
  });

  it('carries the arm-identifying + oracle + efficiency fields', () => {
    const r = toTau2JsonlRecords([OUTCOME], CTX)[0];
    expect(r.substrate).toBe('tau2');
    expect(r.domain).toBe('retail');
    expect(r.task_id).toBe('task-A');
    expect(r.model).toBe('qwen3.6-35b-a3b');
    expect(r.user_sim_model).toBe('gpt-5.5');   // confound-record field
    expect(r.arm).toBe('B');
    expect(r.memory).toBe('on');
    expect(r.seed).toBe(42);
    expect(r.k).toBe(3);
    expect(r.pass1).toBeCloseTo(2 / 3, 6);
    expect(r.passK).toBe(false);
    expect(r.reward_basis).toEqual(['DB', 'ACTION']);
    expect(r.tokens_per_task).toBeCloseTo(266.6667, 4);
    expect(r.turns_per_task).toBe(2);
    expect(r.tool_calls_per_task).toBe(1);
    expect(r.usd_per_task).toBeCloseTo(0.011, 10);
    expect(r.trajectory_diversity).toBeCloseTo(2 / 3, 6);
    expect(r.cluster_id).toBe('task-A');       // default cluster = task
    expect(r.manifest_hash).toBe('a'.repeat(64));
  });

  it('uses a pre-registered cluster map when provided', () => {
    const r = toTau2JsonlRecords([OUTCOME], { ...CTX, clusterMap: { 'task-A': 'returns-family' } })[0];
    expect(r.cluster_id).toBe('returns-family');
  });

  it('validates the context (empty userSimModelId throws — pinning is mandatory)', () => {
    expect(() => toTau2JsonlRecords([OUTCOME], { ...CTX, userSimModelId: '' })).toThrow(/userSimModelId/);
  });
});

describe('writeTau2Jsonl', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tau2-emit-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes one JSON object per line', () => {
    const out = path.join(dir, 'tau2.jsonl');
    const n = writeTau2Jsonl([OUTCOME], CTX, out);
    expect(n).toBe(1);
    const lines = fs.readFileSync(out, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as Tau2JsonlRecord;
    expect(parsed.task_id).toBe('task-A');
  });
});
