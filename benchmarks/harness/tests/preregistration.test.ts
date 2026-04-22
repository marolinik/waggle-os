/**
 * Sprint 12 Task 1 Blocker #3 — pre-registration emitter tests.
 *
 * Acceptance criteria (per brief § 4.1):
 *   1. Payload schema valid — every required field present and typed right.
 *   2. Emitter fires exactly once when called.
 *   3. Payload includes canonical dataset SHA-256.
 *   4. Payload includes manifest hash (CLI override OR auto-computed).
 *   5. Manifest hash deterministic across 3 reads.
 *   6. `resolveManifestPath` honors `BENCH_SPEC_MANIFEST_PATH` env var.
 *   7. `ManifestNotFoundError` thrown when path absent + no override.
 *   8. `readManifestLockedDate` normalises YAML `locked_date: YYYY-MM-DD`
 *      to ISO-8601 `YYYY-MM-DDT00:00:00Z`.
 *   9. `sanitizeArgv` redacts API-key-shaped arguments.
 *   10. Event name matches the canonical `bench.preregistration.manifest_hash`.
 *
 * No LLM calls. No real manifest — uses tmp-dir fixture YAML.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import {
  CANONICAL_MANIFEST_PATH,
  ManifestNotFoundError,
  PREREGISTRATION_EVENT_NAME,
  RUNNER_VERSION_FALLBACK,
  computeBenchSpecManifestHash,
  emitPreregistrationManifest,
  getRunnerVersion,
  readManifestLockedDate,
  resolveManifestPath,
  sanitizeArgv,
  type PreregistrationManifestPayload,
} from '../src/preregistration.js';

// Fixture YAML that mirrors the A3 LOCK v1 `locked_date:` line exactly
// so the regex extractor + hash functions get real-shape input. Kept
// minimal — tests don't need the full 250-line canonical doc.
const FIXTURE_YAML = `# Bench-Spec LOCK v1 — machine-readable twin (test fixture)
manifest_version: v1.0.0
manifest_type: bench_spec_lock_parent
locked_date: 2026-04-22
authority: PM (Marko Marković) — A3 interview 7/7 closed 2026-04-22
sprint: 11
track: A
task: A3
`;

// Known-good SHA-256 of FIXTURE_YAML bytes. Computed once here and
// asserted in determinism tests — any accidental fixture mutation
// surfaces as a test break, not silent drift.
const FIXTURE_HASH = crypto.createHash('sha256').update(FIXTURE_YAML, 'utf-8').digest('hex');

function makeValidPayload(overrides: Partial<PreregistrationManifestPayload> = {}): PreregistrationManifestPayload {
  return {
    manifest_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    manifest_path: CANONICAL_MANIFEST_PATH,
    manifest_locked_at: '2026-04-22T00:00:00Z',
    dataset_version: '39e415e2f3a0fa1bd3cb1804a58d0b440b50d3070b2100698437e4ec402a5b24',
    dataset_path: 'locomo/locomo-1540.jsonl',
    dataset_instance_count: 1531,
    per_cell: ['raw', 'filtered', 'compressed', 'full-context'],
    judge_tiebreak: 'quadri-vendor',
    judge_models: [],
    emitted_at: '2026-04-22T12:00:00.000Z',
    runner_version: 'abc1234',
    runner_invocation: { argv: ['node', 'runner.ts'], cwd: '/tmp/test' },
    ...overrides,
  };
}

describe('PreregistrationManifestPayload schema (criterion 1)', () => {
  it('accepts a fully-populated payload', () => {
    const payload = makeValidPayload();
    // Compile-time proof: TS picks up the interface. Runtime proof: every
    // required field is a string/number/array of the right shape.
    expect(typeof payload.manifest_hash).toBe('string');
    expect(payload.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload.manifest_path).toBe('string');
    expect(typeof payload.manifest_locked_at).toBe('string');
    expect(typeof payload.dataset_version).toBe('string');
    expect(typeof payload.dataset_path).toBe('string');
    expect(typeof payload.dataset_instance_count).toBe('number');
    expect(Array.isArray(payload.per_cell)).toBe(true);
    expect(typeof payload.judge_tiebreak).toBe('string');
    expect(Array.isArray(payload.judge_models)).toBe(true);
    expect(typeof payload.emitted_at).toBe('string');
    expect(typeof payload.runner_version).toBe('string');
    expect(typeof payload.runner_invocation.cwd).toBe('string');
    expect(Array.isArray(payload.runner_invocation.argv)).toBe(true);
  });

  it('carries the canonical manifest path constant', () => {
    expect(CANONICAL_MANIFEST_PATH).toBe('decisions/2026-04-22-bench-spec-locked.manifest.yaml');
  });
});

describe('emitPreregistrationManifest (criteria 2, 10)', () => {
  let infoSpy: MockInstance;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    infoSpy.mockRestore();
  });

  it('emits exactly once per call with the canonical event name', () => {
    emitPreregistrationManifest(makeValidPayload());
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const call = infoSpy.mock.calls[0];
    // createCoreLogger('bench.preregistration') emits
    //   `[waggle:bench.preregistration] <msg>` as first arg, then payload.
    expect(String(call[0])).toContain('[waggle:bench.preregistration]');
    expect(String(call[0])).toContain(PREREGISTRATION_EVENT_NAME);
    const payload = call[1] as Record<string, unknown>;
    expect(payload.event).toBe(PREREGISTRATION_EVENT_NAME);
    expect(PREREGISTRATION_EVENT_NAME).toBe('bench.preregistration.manifest_hash');
  });

  it('payload carries canonical dataset SHA + instance count verbatim', () => {
    emitPreregistrationManifest(makeValidPayload({
      dataset_version: 'abc123',
      dataset_instance_count: 1531,
    }));
    const payload = infoSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.dataset_version).toBe('abc123');
    expect(payload.dataset_instance_count).toBe(1531);
  });
});

describe('resolveManifestPath (criteria 6, 7)', () => {
  let tmp: string;
  const savedEnv = process.env.BENCH_SPEC_MANIFEST_PATH;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-prereg-'));
    delete process.env.BENCH_SPEC_MANIFEST_PATH;
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (savedEnv === undefined) {
      delete process.env.BENCH_SPEC_MANIFEST_PATH;
    } else {
      process.env.BENCH_SPEC_MANIFEST_PATH = savedEnv;
    }
  });

  it('resolves explicit override path when it exists', () => {
    const fixturePath = path.join(tmp, 'bench-spec.manifest.yaml');
    fs.writeFileSync(fixturePath, FIXTURE_YAML, 'utf-8');
    expect(resolveManifestPath(fixturePath)).toBe(fixturePath);
  });

  it('throws ManifestNotFoundError when explicit override is absent', () => {
    const missing = path.join(tmp, 'does-not-exist.yaml');
    expect(() => resolveManifestPath(missing)).toThrow(ManifestNotFoundError);
  });

  it('honors BENCH_SPEC_MANIFEST_PATH env var when set', () => {
    const fixturePath = path.join(tmp, 'env-driven.yaml');
    fs.writeFileSync(fixturePath, FIXTURE_YAML, 'utf-8');
    process.env.BENCH_SPEC_MANIFEST_PATH = fixturePath;
    expect(resolveManifestPath()).toBe(fixturePath);
  });

  it('ManifestNotFoundError exposes the attempted paths', () => {
    const missing = path.join(tmp, 'missing.yaml');
    try {
      resolveManifestPath(missing);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ManifestNotFoundError);
      const typed = err as ManifestNotFoundError;
      expect(typed.attemptedPaths.length).toBeGreaterThan(0);
      expect(typed.message).toContain('BENCH_SPEC_MANIFEST_PATH');
      expect(typed.message).toContain('--manifest-hash');
    }
  });
});

describe('computeBenchSpecManifestHash (criteria 4, 5)', () => {
  let tmp: string;
  let fixturePath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-hash-'));
    fixturePath = path.join(tmp, 'manifest.yaml');
    fs.writeFileSync(fixturePath, FIXTURE_YAML, 'utf-8');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns deterministic SHA-256 hex (matches byte hash)', () => {
    const h = computeBenchSpecManifestHash(fixturePath);
    expect(h).toBe(FIXTURE_HASH);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic across 3 consecutive calls', () => {
    const a = computeBenchSpecManifestHash(fixturePath);
    const b = computeBenchSpecManifestHash(fixturePath);
    const c = computeBenchSpecManifestHash(fixturePath);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('changes when the manifest YAML bytes change', () => {
    const h1 = computeBenchSpecManifestHash(fixturePath);
    fs.writeFileSync(fixturePath, FIXTURE_YAML + '# a single-byte change\n', 'utf-8');
    const h2 = computeBenchSpecManifestHash(fixturePath);
    expect(h1).not.toBe(h2);
  });
});

describe('readManifestLockedDate (criterion 8)', () => {
  let tmp: string;
  let fixturePath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-locked-date-'));
    fixturePath = path.join(tmp, 'manifest.yaml');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('normalises YYYY-MM-DD to ISO-8601 midnight UTC', () => {
    fs.writeFileSync(fixturePath, FIXTURE_YAML, 'utf-8');
    expect(readManifestLockedDate(fixturePath)).toBe('2026-04-22T00:00:00Z');
  });

  it('passes through full ISO-8601 timestamps unchanged', () => {
    fs.writeFileSync(fixturePath, 'locked_date: 2026-04-22T14:30:00Z\n', 'utf-8');
    expect(readManifestLockedDate(fixturePath)).toBe('2026-04-22T14:30:00Z');
  });

  it('returns "unknown" when the field is absent', () => {
    fs.writeFileSync(fixturePath, 'other_field: value\n', 'utf-8');
    expect(readManifestLockedDate(fixturePath)).toBe('unknown');
  });
});

describe('sanitizeArgv (criterion 9)', () => {
  it('redacts values after --api-key / --bearer / --token / --key', () => {
    const argv = ['node', 'runner.ts', '--api-key', 'secret-key-123', '--token', 'bearer-abc'];
    const result = sanitizeArgv(argv);
    expect(result).toEqual([
      'node', 'runner.ts', '--api-key', '[REDACTED]', '--token', '[REDACTED]',
    ]);
  });

  it('redacts sk-* and Bearer * tokens inline', () => {
    const argv = ['node', 'runner.ts', 'sk-proj-abcdef0123', 'Bearer xyz789'];
    const result = sanitizeArgv(argv);
    expect(result).toEqual(['node', 'runner.ts', '[REDACTED]', '[REDACTED]']);
  });

  it('passes through normal arguments unchanged', () => {
    const argv = ['node', 'runner.ts', '--cell', 'raw', '--seed', '42'];
    expect(sanitizeArgv(argv)).toEqual(argv);
  });
});

describe('getRunnerVersion', () => {
  it('returns a string — either git short SHA or the fallback', () => {
    const v = getRunnerVersion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
    // Either looks like a short SHA (7-40 hex chars) or is the fallback.
    expect(/^[0-9a-f]{7,40}$/.test(v) || v === RUNNER_VERSION_FALLBACK).toBe(true);
  });
});
