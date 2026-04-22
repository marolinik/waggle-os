/**
 * Sprint 12 Task 1 Blocker #1 — dataset loader smoke tests.
 *
 * Acceptance criteria (per brief §1):
 *   1. Canonical LoCoMo archive is present at the expected path, loads,
 *      and contains a stable number of instances. (Paper claim: 1540.
 *      Actual non-adversarial-with-evidence count: 1531. Delta documented
 *      in locomo-1540.meta.json.)
 *   2. `getDatasetVersion` returns a deterministic SHA-256 hex across 3
 *      consecutive calls against the same archive.
 *   3. `loadDataset` throws `DatasetMissingError` when the archive path
 *      is absent.
 *   4. `BENCH_SYNTHETIC_DATASET=1` env flag re-enables the synthetic
 *      fallback (dev convenience only).
 *   5. `getDatasetVersion` for synthetic specs returns the static
 *      `synthetic-scaffold-v1` string.
 *   6. The computed hash matches the one written into
 *      `locomo-1540.meta.json` by the build script.
 *
 * Zero LLM calls. Pure loader + hash verification.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DatasetMissingError,
  SYNTHETIC_DATASET_VERSION,
  getDatasetVersion,
  loadDataset,
} from '../src/datasets.js';
import type { DatasetSpec } from '../src/types.js';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..');
const DATA_ROOT = path.resolve(HARNESS_ROOT, '..', 'data');
const LOCOMO_ARCHIVE = path.join(DATA_ROOT, 'locomo', 'locomo-1540.jsonl');
const LOCOMO_META = path.join(DATA_ROOT, 'locomo', 'locomo-1540.meta.json');

const LOCOMO_SPEC: DatasetSpec = {
  id: 'locomo',
  displayName: 'LoCoMo canonical',
  dataPath: 'locomo/locomo-1540.jsonl',
  source: 'external',
};

const SYNTHETIC_SPEC: DatasetSpec = {
  id: 'synthetic',
  displayName: 'Synthetic scaffold',
  dataPath: 'synthetic/placeholder.jsonl',
  source: 'synthetic',
};

describe('canonical LoCoMo archive', () => {
  it('exists at the expected path', () => {
    expect(fs.existsSync(LOCOMO_ARCHIVE)).toBe(true);
  });

  it('loads via loadDataset with a positive instance count', () => {
    const instances = loadDataset(LOCOMO_SPEC, DATA_ROOT);
    // Actual count is 1531 at build time (paper claim 1540 minus 9 edge
    // cases with no resolvable evidence). Assert the known-good number so
    // silent drift is caught; update deliberately if the upstream source
    // is replaced.
    expect(instances.length).toBe(1531);
    for (const inst of instances) {
      expect(inst.instance_id).toMatch(/^locomo_conv-\d+_q\d{3}$/);
      expect(typeof inst.question).toBe('string');
      expect(inst.question.length).toBeGreaterThan(0);
      expect(Array.isArray(inst.expected)).toBe(true);
      expect(inst.expected.length).toBeGreaterThan(0);
    }
  });

  it('sidecar meta.json records the same count and a pinned hash', () => {
    expect(fs.existsSync(LOCOMO_META)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(LOCOMO_META, 'utf-8')) as {
      dataset_version: string;
      instance_count: number;
      paper_total_claim: number;
      actual_count: number;
    };
    expect(meta.instance_count).toBe(1531);
    expect(meta.actual_count).toBe(1531);
    expect(meta.paper_total_claim).toBe(1540);
    expect(meta.dataset_version).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getDatasetVersion determinism', () => {
  it('returns identical SHA-256 hex across 3 consecutive calls', () => {
    const a = getDatasetVersion(LOCOMO_SPEC, DATA_ROOT);
    const b = getDatasetVersion(LOCOMO_SPEC, DATA_ROOT);
    const c = getDatasetVersion(LOCOMO_SPEC, DATA_ROOT);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the hash written to locomo-1540.meta.json', () => {
    const version = getDatasetVersion(LOCOMO_SPEC, DATA_ROOT);
    const meta = JSON.parse(fs.readFileSync(LOCOMO_META, 'utf-8')) as {
      dataset_version: string;
    };
    expect(version).toBe(meta.dataset_version);
  });

  it('reproduces the hash when computed externally from the same bytes', () => {
    const version = getDatasetVersion(LOCOMO_SPEC, DATA_ROOT);
    const buf = fs.readFileSync(LOCOMO_ARCHIVE);
    const manual = crypto.createHash('sha256').update(buf).digest('hex');
    expect(version).toBe(manual);
  });

  it('returns the static string for synthetic specs', () => {
    expect(getDatasetVersion(SYNTHETIC_SPEC, DATA_ROOT)).toBe(SYNTHETIC_DATASET_VERSION);
    expect(SYNTHETIC_DATASET_VERSION).toBe('synthetic-scaffold-v1');
  });
});

describe('missing-archive behaviour', () => {
  let tmpRoot: string;
  const previousEnv = process.env.BENCH_SYNTHETIC_DATASET;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-bench-missing-'));
    delete process.env.BENCH_SYNTHETIC_DATASET;
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    if (previousEnv === undefined) {
      delete process.env.BENCH_SYNTHETIC_DATASET;
    } else {
      process.env.BENCH_SYNTHETIC_DATASET = previousEnv;
    }
  });

  it('loadDataset throws DatasetMissingError when archive is absent', () => {
    expect(() => loadDataset(LOCOMO_SPEC, tmpRoot)).toThrow(DatasetMissingError);
  });

  it('getDatasetVersion throws DatasetMissingError when archive is absent', () => {
    expect(() => getDatasetVersion(LOCOMO_SPEC, tmpRoot)).toThrow(DatasetMissingError);
  });

  it('DatasetMissingError exposes dataset id + resolved path', () => {
    try {
      loadDataset(LOCOMO_SPEC, tmpRoot);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DatasetMissingError);
      const typed = err as DatasetMissingError;
      expect(typed.datasetId).toBe('locomo');
      expect(typed.resolvedPath.endsWith('locomo-1540.jsonl')).toBe(true);
      expect(typed.message).toContain('build-locomo-canonical');
      expect(typed.message).toContain('BENCH_SYNTHETIC_DATASET=1');
    }
  });

  it('BENCH_SYNTHETIC_DATASET=1 re-enables synthetic fallback for loadDataset', () => {
    process.env.BENCH_SYNTHETIC_DATASET = '1';
    const instances = loadDataset(LOCOMO_SPEC, tmpRoot);
    // Synthetic scaffold is 60 deterministic instances.
    expect(instances.length).toBe(60);
    for (const inst of instances) {
      expect(inst.instance_id).toMatch(/^synthetic_\d{3}$/);
    }
  });

  it('BENCH_SYNTHETIC_DATASET=1 returns the synthetic version string', () => {
    process.env.BENCH_SYNTHETIC_DATASET = '1';
    expect(getDatasetVersion(LOCOMO_SPEC, tmpRoot)).toBe(SYNTHETIC_DATASET_VERSION);
  });
});
