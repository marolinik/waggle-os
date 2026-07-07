import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPersonalMind, type CliEnv } from '../setup.js';
import { runMaintenance } from './maintenance.js';

/**
 * Coverage for the reverse-ported maintenance surface (reembed-all,
 * rechunk-all, dedupe-entities, --workspace / --all-workspaces) — the
 * runMaintenanceOnMind refactor. Ported from hive-mind a99ea0e.
 *
 * The embedder is forced to `mock` so the tests are deterministic and never
 * probe Ollama / download the in-process model in CI.
 */
describe('maintenance (per-mind dispatch)', () => {
  let dataDir: string;
  let env: CliEnv;
  let prevProvider: string | undefined;

  beforeEach(() => {
    prevProvider = process.env.HIVE_MIND_EMBEDDING_PROVIDER;
    process.env.HIVE_MIND_EMBEDDING_PROVIDER = 'mock';
    dataDir = mkdtempSync(join(tmpdir(), 'hmind-cli-maint-'));
    env = openPersonalMind(dataDir);
    env.db.getDatabase().prepare(
      "INSERT INTO sessions (gop_id, status, started_at) VALUES ('g-maint', 'active', datetime('now'))",
    ).run();
    env.frames.createIFrame('g-maint', 'Alice works at Acme Corp on Project Alpha', 'important', 'user_stated');
    env.frames.createIFrame('g-maint', 'Bob prefers TypeScript over JavaScript for backend work', 'normal', 'user_stated');
  });

  afterEach(() => {
    env.close();
    if (prevProvider === undefined) delete process.env.HIVE_MIND_EMBEDDING_PROVIDER;
    else process.env.HIVE_MIND_EMBEDDING_PROVIDER = prevProvider;
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('dedupe-entities returns a group/merged result on the personal mind', async () => {
    const result = await runMaintenance({ dedupeEntities: true, env });
    expect(result.dedupeEntities).toBeDefined();
    expect(typeof result.dedupeEntities!.groups).toBe('number');
    expect(typeof result.dedupeEntities!.merged).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reembed-all refuses to run with the mock provider', async () => {
    await expect(runMaintenance({ reembedAll: true, env })).rejects.toThrow(/provider=mock/i);
  });

  it('rechunk-all refuses to run with the mock provider', async () => {
    await expect(runMaintenance({ rechunkAll: true, env })).rejects.toThrow(/provider=mock/i);
  });

  it('--workspace on a non-existent workspace throws', async () => {
    await expect(runMaintenance({ compact: true, workspace: 'does-not-exist', env }))
      .rejects.toThrow(/Workspace not found/i);
  });

  it('--all-workspaces is a no-op (no registered workspaces) and still reports durationMs', async () => {
    const result = await runMaintenance({ compact: true, allWorkspaces: true, env });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // No workspaces registered → no per-mind results aggregated.
    expect(result.compact).toBeUndefined();
  });

  it('compact runs on the personal mind via the refactored per-mind path', async () => {
    const result = await runMaintenance({ compact: true, env });
    expect(result.compact).toBeDefined();
    expect(typeof result.compact!.temporaryPruned).toBe('number');
  });
});
