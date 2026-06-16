/**
 * Pre-registration checklist tests (01-DESIGN-SPEC §9: code frozen at a SHA).
 * Wraps preregistration.ts. We inject a git-state probe + an emit spy so the
 * test never shells out to git and never logs.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  runPreregChecklist,
  type PreregChecklistInput,
  type GitState,
} from '../../src/gate/prereg-checklist.js';
import type { PreregistrationManifestPayload } from '../../src/preregistration.js';

function payload(): PreregistrationManifestPayload {
  return {
    manifest_hash: 'a'.repeat(64),
    manifest_path: 'decisions/x.manifest.yaml',
    manifest_locked_at: '2026-06-16T00:00:00Z',
    dataset_version: 'b'.repeat(64),
    dataset_path: 'data/tau2/retail.jsonl',
    dataset_instance_count: 50,
    per_cell: ['agentic'],
    judge_tiebreak: 'quadri-vendor',
    judge_models: [],
    emitted_at: '2026-06-16T00:00:00Z',
    runner_version: 'deadbee',
    runner_invocation: { argv: ['node', 'runner'], cwd: '/x' },
  };
}

function input(over: Partial<PreregChecklistInput>): PreregChecklistInput {
  const emit = vi.fn();
  const probeGit = vi.fn<[], GitState>(() => ({ clean: true, sha: 'deadbeef' }));
  return { manifest: payload(), emit, probeGit, ...over };
}

describe('runPreregChecklist — clean tree', () => {
  it('PASS when the tree is clean; echoes the frozen SHA and emits the manifest event', () => {
    const emit = vi.fn();
    const probeGit = vi.fn<[], GitState>(() => ({ clean: true, sha: 'cafe1234' }));
    const r = runPreregChecklist(input({ emit, probeGit }));
    expect(r.pass).toBe(true);
    expect(r.frozen_sha).toBe('cafe1234');
    expect(r.tree_clean).toBe(true);
    expect(r.manifest_hash).toBe('a'.repeat(64));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(probeGit).toHaveBeenCalledTimes(1);
  });
});

describe('runPreregChecklist — dirty tree blocks', () => {
  it('FAIL when the working tree is dirty; does NOT emit the manifest event', () => {
    const emit = vi.fn();
    const probeGit = vi.fn<[], GitState>(() => ({ clean: false, sha: 'cafe1234' }));
    const r = runPreregChecklist(input({ emit, probeGit }));
    expect(r.pass).toBe(false);
    expect(r.tree_clean).toBe(false);
    expect(r.reason).toMatch(/working tree is not clean/);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('runPreregChecklist — validation', () => {
  it('rejects a manifest_hash that is not 64-hex', () => {
    const m = { ...payload(), manifest_hash: 'nope' };
    expect(() => runPreregChecklist(input({ manifest: m }))).toThrow(/manifest_hash/);
  });
});
