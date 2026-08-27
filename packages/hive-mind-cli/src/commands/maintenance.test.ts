import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('rejects consolidate limits outside the detector contract before model work', async () => {
    for (const consolidateLimit of [-1, 0, 1.5, 401, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(runMaintenance({ consolidate: true, consolidateLimit, env }))
        .rejects.toThrow(/consolidate-limit.*1.*400/i);
    }
  });

  it('rejects an invalid consolidate limit before workspace dispatch or earlier mutations', async () => {
    await expect(runMaintenance({
      allWorkspaces: true,
      consolidate: true,
      consolidateLimit: 0,
      env,
    })).rejects.toThrow(/consolidate-limit.*1.*400/i);

    const temporary = env.frames.createIFrame(
      'g-maint',
      'must survive rejected combined maintenance',
      'temporary',
      'agent_inferred',
    );
    env.db.getDatabase().prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2020-01-01 00:00:00', temporary.id);

    await expect(runMaintenance({
      compact: true,
      consolidate: true,
      consolidateLimit: 0,
      maxTempAgeDays: 1,
      env,
    })).rejects.toThrow(/consolidate-limit.*1.*400/i);
    expect(env.frames.getById(temporary.id)?.content)
      .toBe('must survive rejected combined maintenance');
  });

  it('anchors consolidation output to the newest collected observation session', async () => {
    env.db.getDatabase().prepare(
      "INSERT INTO sessions (gop_id, status, started_at) VALUES ('g-excluded', 'active', datetime('now'))",
    ).run();
    const older = env.frames.createIFrame(
      'g-maint',
      'role was analyst',
      'normal',
      'agent_inferred',
    );
    const newer = env.frames.createIFrame(
      'g-maint',
      'role is director',
      'normal',
      'agent_inferred',
    );
    const excluded = env.frames.createIFrame(
      'g-excluded',
      'user-stated note from an unrelated session',
      'normal',
      'user_stated',
    );
    const raw = env.db.getDatabase();
    raw.prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2026-01-01 00:00:00', older.id);
    raw.prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2026-03-01T01:00:00+0100', newer.id);
    raw.prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2099-04-01 00:00:00', excluded.id);

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-only-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ content: string }>;
      };
      const isChainRequest = body.messages[0]?.content.includes('UPDATE CHAINS');
      const content = isChainRequest
        ? '{"chains":[{"attribute":"role","current_value":"director","ids":[1,2]}]}'
        : '{"groups":[]}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });

    try {
      const result = await runMaintenance({
        consolidate: true,
        consolidateModel: 'gpt-test',
        env,
      });
      expect(result.consolidate?.pframes).toBe(1);
      const pframe = raw.prepare(
        "SELECT gop_id FROM memory_frames WHERE frame_type = 'P' ORDER BY id DESC LIMIT 1",
      ).get() as { gop_id: string };
      expect(pframe.gop_id).toBe('g-maint');
    } finally {
      fetchMock.mockRestore();
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
