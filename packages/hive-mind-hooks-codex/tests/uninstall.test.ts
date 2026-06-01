import { describe, expect, it, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { install } from '../src/install.js';
import { uninstall } from '../src/uninstall.js';

interface TestEnv {
  home: string;
  hooksDir: string;
  configPath: string;
  pointerPath: string;
}

async function bootstrap(initial: Record<string, unknown> | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmcdx-uninstall-'));
  const codexDir = join(home, '.codex');
  await mkdir(codexDir, { recursive: true });
  const configPath = join(codexDir, 'hooks.json');
  if (initial !== undefined) {
    await writeFile(configPath, JSON.stringify(initial, null, 2) + '\n', 'utf-8');
  }
  const hooksDir = resolve(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  return { home, hooksDir, configPath, pointerPath: join(codexDir, 'hive-mind-install.json') };
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

describe('uninstall (codex)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws when no pointer file exists', async () => {
    env = await bootstrap({ hooks: {} });
    await expect(uninstall({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/pointer/);
  });

  it('throws when the pointer is malformed', async () => {
    env = await bootstrap({ hooks: {} });
    await writeFile(env.pointerPath, '{}', 'utf-8');
    await expect(uninstall({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/malformed/);
  });

  // ── created_by_us=false: byte-identical restore (§7.3 invariant 2) ─────

  it('install + uninstall round-trip is SHA-256 identical to pre-install state', async () => {
    const initial = {
      schemaVersion: 1,
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'node /existing/ctx.js' }] },
        ],
        PreCompact: [
          { hooks: [{ type: 'command', command: 'node /existing/pre-compact.js', timeout: 10 }] },
        ],
      },
    };
    env = await bootstrap(initial);
    const preInstall = await readFile(env.configPath, 'utf-8');
    const preHash = sha256(preInstall);

    await install({ home: env.home, hooksDir: env.hooksDir });
    const afterInstall = await readFile(env.configPath, 'utf-8');
    expect(sha256(afterInstall)).not.toBe(preHash); // install actually mutated

    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.createdRemoved).toBe(false);
    const afterUninstall = await readFile(env.configPath, 'utf-8');
    expect(sha256(afterUninstall)).toBe(preHash);
    expect(afterUninstall).toBe(preInstall);
  });

  it('removes backup + pointer by default after a restore', async () => {
    env = await bootstrap({ hooks: {} });
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(result.backupPath as string)).toBe(true);
    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.backupRemoved).toBe(true);
    expect(existsSync(result.backupPath as string)).toBe(false);
    expect(existsSync(result.pointerPath)).toBe(false);
  });

  it('keeps the backup when cleanupBackup=false', async () => {
    env = await bootstrap({ hooks: {} });
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir, cleanupBackup: false });
    expect(u.backupRemoved).toBe(false);
    expect(existsSync(result.backupPath as string)).toBe(true);
  });

  // ── created_by_us=true: delete-if-created, no orphan (§7.3 invariant 2) ─

  it('deletes the hooks.json we created and leaves NO orphan (absent → install → uninstall)', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);

    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.createdByUs).toBe(true);
    expect(existsSync(env.configPath)).toBe(true);

    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.createdRemoved).toBe(true);
    expect(u.restoredFrom).toBeNull();
    // No orphaned config, no leftover backup, no leftover pointer.
    expect(existsSync(env.configPath)).toBe(false);
    expect(existsSync(env.pointerPath)).toBe(false);
  });
});
