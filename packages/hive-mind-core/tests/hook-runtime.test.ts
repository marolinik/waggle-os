import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MindDB } from '../src/mind/db.js';
import { reconcileVecIndex } from '../src/mind/reconcile.js';
import { MockEmbedder } from './mind/helpers/mock-embedder.js';
import { recallHookFrames, saveHookFrame } from '../src/hook-runtime.js';

const mockedHome = vi.hoisted(() => ({ value: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => mockedHome.value || actual.homedir(),
  };
});

describe('hook runtime', () => {
  const tempDirs: string[] = [];

  function dataDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'waggle-hook-runtime-'));
    tempDirs.push(dir);
    return dir;
  }

  function createWorkspace(dir: string, id: string): void {
    const workspaceDir = join(dir, 'workspaces', id);
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(
      join(workspaceDir, 'workspace.json'),
      JSON.stringify({ id, name: id, group: 'test', created: new Date().toISOString() }),
      'utf8',
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    mockedHome.value = '';
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('durably saves a personal frame and commits its FTS row before returning', () => {
    const dir = dataDir();
    const result = saveHookFrame({
      dataDir: dir,
      content: '[hm session:test src:claude-code event:stop] durable canary decision',
      importance: 'important',
      source: 'system',
    });

    expect(result).toEqual({ id: '1', success: true, workspace: 'personal' });
    const db = new MindDB(join(dir, 'personal.mind'));
    try {
      const frame = db.getDatabase().prepare(
        'SELECT content, importance, source FROM memory_frames WHERE id = ?',
      ).get(1) as { content: string; importance: string; source: string };
      expect(frame).toEqual({
        content: '[hm session:test src:claude-code event:stop] durable canary decision',
        importance: 'important',
        source: 'system',
      });
      const fts = db.getDatabase().prepare(
        'SELECT rowid FROM memory_frames_fts WHERE memory_frames_fts MATCH ?',
      ).get('durable');
      expect(fts).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('preserves FrameStore deduplication semantics', () => {
    const dir = dataDir();
    const input = {
      dataDir: dir,
      content: '[hm session:a src:claude-code event:stop] same durable content',
      importance: 'important' as const,
      source: 'system' as const,
    };
    const first = saveHookFrame(input);
    const second = saveHookFrame({
      ...input,
      content: '[hm session:b src:claude-code event:stop] same durable content',
    });

    expect(second.id).toBe(first.id);
    const db = new MindDB(join(dir, 'personal.mind'));
    try {
      const count = db.getDatabase().prepare(
        'SELECT COUNT(*) AS count FROM memory_frames',
      ).get() as { count: number };
      expect(count.count).toBe(1);
    } finally {
      db.close();
    }
  });

  it('returns bounded important/recent frames without probing an embedding provider', () => {
    const dir = dataDir();
    const previousOllamaUrl = process.env.OLLAMA_URL;
    const fetchSpy = vi.fn(() => {
      throw new Error('network must not be called');
    });
    vi.stubGlobal('fetch', fetchSpy);
    process.env.OLLAMA_URL = 'http://127.0.0.1:1';
    try {
      saveHookFrame({ dataDir: dir, content: 'temporary recent item', importance: 'temporary', source: 'system' });
      saveHookFrame({ dataDir: dir, content: 'critical user preference', importance: 'critical', source: 'user_stated' });
      saveHookFrame({ dataDir: dir, content: 'important project decision', importance: 'important', source: 'system' });

      const hits = recallHookFrames({ dataDir: dir, limit: 2 });
      expect(hits).toHaveLength(2);
      expect(hits.map((hit) => hit.content)).toEqual([
        'critical user preference',
        'important project decision',
      ]);
      expect(hits.every((hit) => hit.from === 'personal')).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (previousOllamaUrl === undefined) delete process.env.OLLAMA_URL;
      else process.env.OLLAMA_URL = previousOllamaUrl;
    }
  });

  it('keeps personal and validated workspace minds isolated', () => {
    const dir = dataDir();
    createWorkspace(dir, 'project-one');
    saveHookFrame({ dataDir: dir, content: 'personal only memory', importance: 'normal', source: 'system' });
    const saved = saveHookFrame({
      dataDir: dir,
      workspace: 'project-one',
      content: 'workspace only memory',
      importance: 'important',
      source: 'system',
    });

    expect(saved.workspace).toBe('project-one');
    expect(recallHookFrames({ dataDir: dir, limit: 10 }).map((hit) => hit.content))
      .toEqual(['personal only memory']);
    expect(recallHookFrames({ dataDir: dir, workspace: 'project-one', limit: 10 }))
      .toMatchObject([{ content: 'workspace only memory', from: 'workspace:project-one' }]);
  });

  it.each(['../escape', '..', 'missing-workspace'])('fails closed for unsafe or unknown workspace %s', (workspace) => {
    const dir = dataDir();
    expect(() => saveHookFrame({
      dataDir: dir,
      workspace,
      content: 'must never fall back to personal',
      importance: 'important',
      source: 'system',
    })).toThrow(/workspace/i);

    const db = new MindDB(join(dir, 'personal.mind'));
    try {
      const count = db.getDatabase().prepare(
        'SELECT COUNT(*) AS count FROM memory_frames',
      ).get() as { count: number };
      expect(count.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it('rejects a workspace junction that escapes the data directory', () => {
    const dir = dataDir();
    const outside = dataDir();
    createWorkspace(outside, 'linked');
    mkdirSync(join(dir, 'workspaces'), { recursive: true });
    symlinkSync(
      join(outside, 'workspaces', 'linked'),
      join(dir, 'workspaces', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    expect(() => saveHookFrame({
      dataDir: dir,
      workspace: 'linked',
      content: 'must not cross a workspace junction',
      importance: 'important',
      source: 'system',
    })).toThrow(/workspace/i);
    expect(existsSync(join(outside, 'workspaces', 'linked', 'workspace.mind'))).toBe(false);
  });

  it('rejects personal and workspace mind links at the exact database path', () => {
    const outside = dataDir();
    const personalDir = dataDir();
    symlinkSync(outside, join(personalDir, 'personal.mind'), 'junction');
    expect(() => recallHookFrames({ dataDir: personalDir })).toThrow(/personal mind.*link/i);

    const workspaceDir = dataDir();
    createWorkspace(workspaceDir, 'linked-mind');
    symlinkSync(
      outside,
      join(workspaceDir, 'workspaces', 'linked-mind', 'workspace.mind'),
      'junction',
    );
    expect(() => recallHookFrames({
      dataDir: workspaceDir,
      workspace: 'linked-mind',
    })).toThrow(/workspace mind.*link/i);
  });

  it('rejects personal and workspace mind file symlinks when the platform permits them', ({ skip }) => {
    const outside = dataDir();
    saveHookFrame({
      dataDir: outside,
      content: 'outside frame',
      importance: 'normal',
      source: 'system',
    });

    const personalDir = dataDir();
    try {
      symlinkSync(join(outside, 'personal.mind'), join(personalDir, 'personal.mind'), 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }
    expect(() => recallHookFrames({ dataDir: personalDir })).toThrow(/personal mind.*link/i);

    const workspaceDir = dataDir();
    createWorkspace(workspaceDir, 'linked-file');
    symlinkSync(
      join(outside, 'personal.mind'),
      join(workspaceDir, 'workspaces', 'linked-file', 'workspace.mind'),
      'file',
    );
    expect(() => recallHookFrames({
      dataDir: workspaceDir,
      workspace: 'linked-file',
    })).toThrow(/workspace mind.*link/i);
  });

  it('rejects dangling mind symlinks without creating their targets', ({ skip }) => {
    const outside = dataDir();
    const missingPersonal = join(outside, 'missing-personal.mind');
    const personalDir = dataDir();
    try {
      symlinkSync(missingPersonal, join(personalDir, 'personal.mind'), 'file');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
      throw error;
    }
    expect(() => saveHookFrame({
      dataDir: personalDir,
      content: 'must not follow a dangling personal link',
      importance: 'important',
      source: 'system',
    })).toThrow(/personal mind.*link/i);
    expect(existsSync(missingPersonal)).toBe(false);

    const missingWorkspace = join(outside, 'missing-workspace.mind');
    const workspaceDir = dataDir();
    createWorkspace(workspaceDir, 'dangling-file');
    symlinkSync(
      missingWorkspace,
      join(workspaceDir, 'workspaces', 'dangling-file', 'workspace.mind'),
      'file',
    );
    expect(() => saveHookFrame({
      dataDir: workspaceDir,
      workspace: 'dangling-file',
      content: 'must not follow a dangling workspace link',
      importance: 'important',
      source: 'system',
    })).toThrow(/workspace mind.*link/i);
    expect(existsSync(missingWorkspace)).toBe(false);
  });

  it('treats an empty data-dir environment variable as unset and never writes in cwd', () => {
    const cwd = dataDir();
    const home = dataDir();
    const previousCwd = process.cwd();
    const previousDataDir = process.env.HIVE_MIND_DATA_DIR;
    mockedHome.value = home;
    process.env.HIVE_MIND_DATA_DIR = '';
    process.chdir(cwd);
    try {
      saveHookFrame({
        content: 'empty env uses the home default',
        importance: 'normal',
        source: 'system',
      });
      expect(existsSync(join(cwd, 'personal.mind'))).toBe(false);
      expect(existsSync(join(home, '.hive-mind', 'personal.mind'))).toBe(true);
    } finally {
      process.chdir(previousCwd);
      if (previousDataDir === undefined) delete process.env.HIVE_MIND_DATA_DIR;
      else process.env.HIVE_MIND_DATA_DIR = previousDataDir;
    }
  });

  it('rejects a blank explicit data-dir override', () => {
    expect(() => saveHookFrame({
      dataDir: '   ',
      content: 'must never resolve against cwd',
      importance: 'normal',
      source: 'system',
    })).toThrow(/data directory.*blank/i);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'invalid'])(
    'falls back to the default bound for invalid recall limit %s',
    (limit) => {
      const dir = dataDir();
      saveHookFrame({ dataDir: dir, content: 'bounded recall frame', importance: 'normal', source: 'system' });
      expect(recallHookFrames({ dataDir: dir, limit: limit as number })).toHaveLength(1);
    },
  );

  it('writes while a second WAL reader holds the same personal mind open', () => {
    const dir = dataDir();
    saveHookFrame({ dataDir: dir, content: 'seed frame', importance: 'normal', source: 'system' });
    const reader = new MindDB(join(dir, 'personal.mind'));
    const raw = reader.getDatabase();
    raw.exec('BEGIN');
    raw.prepare('SELECT COUNT(*) FROM memory_frames').get();
    try {
      expect(saveHookFrame({
        dataDir: dir,
        content: 'concurrent writer frame',
        importance: 'important',
        source: 'system',
      }).success).toBe(true);
    } finally {
      raw.exec('ROLLBACK');
      reader.close();
    }
  });

  it('leaves vector enrichment to the existing reconciliation path', async () => {
    const dir = dataDir();
    const saved = saveHookFrame({
      dataDir: dir,
      content: 'deferred vector enrichment frame',
      importance: 'important',
      source: 'system',
    });
    const db = new MindDB(join(dir, 'personal.mind'));
    try {
      const before = db.getDatabase().prepare(
        'SELECT COUNT(*) AS count FROM memory_frames_vec WHERE rowid = ?',
      ).get(Number(saved.id)) as { count: number };
      expect(before.count).toBe(0);
      expect(await reconcileVecIndex(db, new MockEmbedder())).toBe(1);
      const after = db.getDatabase().prepare(
        'SELECT COUNT(*) AS count FROM memory_frames_vec WHERE rowid = ?',
      ).get(Number(saved.id)) as { count: number };
      expect(after.count).toBe(1);
    } finally {
      db.close();
    }
  });
});
