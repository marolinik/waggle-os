import { describe, expect, it, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../src/install.js';
import { uninstall } from '../src/uninstall.js';

interface TestEnv {
  home: string;
  handlerSource: string;
  configPath: string;
  pointerPath: string;
  hiveHookDir: string;
}

async function bootstrap(initial: string | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmocl-uninstall-'));
  const openclawDir = join(home, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  const configPath = join(openclawDir, 'openclaw.json');
  if (initial !== undefined) {
    await writeFile(configPath, initial, 'utf-8');
  }
  const distDir = join(home, 'fake-dist');
  await mkdir(distDir, { recursive: true });
  const handlerSource = join(distDir, 'handler.js');
  await writeFile(handlerSource, 'export default async () => {};\n', 'utf-8');
  return {
    home,
    handlerSource,
    configPath,
    pointerPath: join(openclawDir, 'hive-mind-install.json'),
    hiveHookDir: join(openclawDir, 'hooks', 'hive-mind'),
  };
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

describe('uninstall (openclaw)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws when no pointer file exists', async () => {
    env = await bootstrap('{ "hooks": {} }');
    await expect(uninstall({ home: env.home, handlerSourcePath: env.handlerSource }))
      .rejects.toThrow(/pointer/);
  });

  // ── created_by_us=false: LITERAL byte-identical restore (§7.3 invariant 2) ─
  // JSON5 round-trip is lossy (comments + trailing commas are dropped on
  // re-serialize), so reversibility relies on restoring the ORIGINAL BYTES.

  it('install + uninstall round-trip is SHA-256 identical to pre-install state (comments preserved)', async () => {
    // Comments + trailing commas a naive JSON re-serialize would NOT reproduce.
    const initial = [
      '{',
      '  // OpenClaw config — hand-edited, comments matter',
      '  model: "claude-opus", /* the good one */',
      '  temperature: 0.2,',
      '  hooks: {',
      '    internal: {',
      '      enabled: false,',
      '      entries: { "user-own": { enabled: true } },',
      '    },',
      '  },',
      '}',
      '',
    ].join('\n');
    env = await bootstrap(initial);
    const preInstall = await readFile(env.configPath, 'utf-8');
    const preHash = sha256(preInstall);

    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const afterInstall = await readFile(env.configPath, 'utf-8');
    expect(sha256(afterInstall)).not.toBe(preHash); // install actually mutated
    // Sanity: the merged write IS lossy — the comment is gone post-install,
    // which is exactly why we need the literal backup to reverse it.
    expect(afterInstall).not.toContain('// OpenClaw config');

    const u = await uninstall({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(u.createdRemoved).toBe(false);
    expect(u.restoredFrom).not.toBeNull();
    expect(u.hookDirRemoved).toBe(true);
    const afterUninstall = await readFile(env.configPath, 'utf-8');
    // Byte-for-byte identical — the comment + trailing commas are back.
    expect(sha256(afterUninstall)).toBe(preHash);
    expect(afterUninstall).toBe(preInstall);
    expect(afterUninstall).toContain('// OpenClaw config — hand-edited, comments matter');
  });

  it('removes the managed hook dir (HOOK.md + handler.js) on uninstall — no orphan', async () => {
    env = await bootstrap('{ "model": "opus", "hooks": {} }');
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(existsSync(join(env.hiveHookDir, 'HOOK.md'))).toBe(true);
    expect(existsSync(join(env.hiveHookDir, 'handler.js'))).toBe(true);

    const u = await uninstall({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(u.hookDirRemoved).toBe(true);
    expect(existsSync(env.hiveHookDir)).toBe(false);
  });

  it('removes backup + pointer by default after a restore', async () => {
    env = await bootstrap('{ "model": "opus", "hooks": {} }');
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(existsSync(result.backupPath as string)).toBe(true);
    const u = await uninstall({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(u.backupRemoved).toBe(true);
    expect(existsSync(result.backupPath as string)).toBe(false);
    expect(existsSync(result.pointerPath)).toBe(false);
  });

  it('keeps the backup when cleanupBackup=false', async () => {
    env = await bootstrap('{ "model": "opus", "hooks": {} }');
    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const u = await uninstall({ home: env.home, handlerSourcePath: env.handlerSource, cleanupBackup: false });
    expect(u.backupRemoved).toBe(false);
    expect(existsSync(result.backupPath as string)).toBe(true);
  });

  // ── created_by_us=true: delete-if-created, no orphan (§7.3 invariant 2) ─

  it('deletes the openclaw.json we created and leaves NO orphan (absent → install → uninstall)', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);

    const result = await install({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(result.createdByUs).toBe(true);
    expect(existsSync(env.configPath)).toBe(true);

    const u = await uninstall({ home: env.home, handlerSourcePath: env.handlerSource });
    expect(u.createdRemoved).toBe(true);
    expect(u.restoredFrom).toBeNull();
    // No orphaned config, no managed dir, no leftover pointer.
    expect(existsSync(env.configPath)).toBe(false);
    expect(existsSync(env.hiveHookDir)).toBe(false);
    expect(existsSync(env.pointerPath)).toBe(false);
  });
});
