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

async function bootstrap(initialYaml: string | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmher-uninstall-'));
  const hermesDir = join(home, '.hermes');
  await mkdir(hermesDir, { recursive: true });
  const configPath = join(hermesDir, 'config.yaml');
  if (initialYaml !== undefined) {
    await writeFile(configPath, initialYaml, 'utf-8');
  }
  const hooksDir = resolve(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  return { home, hooksDir, configPath, pointerPath: join(hermesDir, 'hive-mind-install.json') };
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

describe('uninstall (hermes)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws when no pointer file exists', async () => {
    env = await bootstrap('hooks: {}\n');
    await expect(uninstall({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/pointer/);
  });

  it('throws when the pointer is malformed', async () => {
    env = await bootstrap('hooks: {}\n');
    await writeFile(env.pointerPath, '{}', 'utf-8');
    await expect(uninstall({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/malformed/);
  });

  // ── created_by_us=false: LITERAL byte-identical restore (§7.3 invariant 2) ─
  // YAML round-trip is lossy (comments + ordering are dropped on re-serialize),
  // so reversibility relies on restoring the ORIGINAL BYTES from the backup.

  it('install + uninstall round-trip is SHA-256 identical to pre-install state (comments preserved)', async () => {
    // Deliberately include comments + non-alphabetical key ordering that a
    // naive YAML re-serialize would NOT reproduce.
    const initial = [
      '# Hermes config — hand-edited, comments matter',
      'model: claude-opus   # the good one',
      'temperature: 0.2',
      'hooks:',
      '  pre_llm_call:',
      '    - command: node /existing/ctx.js',
      '      timeout: 10',
      '  post_llm_call:',
      '    - command: node /existing/turn.js',
      '      timeout: 10',
      '',
    ].join('\n');
    env = await bootstrap(initial);
    const preInstall = await readFile(env.configPath, 'utf-8');
    const preHash = sha256(preInstall);

    await install({ home: env.home, hooksDir: env.hooksDir });
    const afterInstall = await readFile(env.configPath, 'utf-8');
    expect(sha256(afterInstall)).not.toBe(preHash); // install actually mutated
    // Sanity: the merged write IS lossy — the comment is gone post-install,
    // which is exactly why we need the literal backup to reverse it.
    expect(afterInstall).not.toContain('# Hermes config');

    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.createdRemoved).toBe(false);
    expect(u.restoredFrom).not.toBeNull();
    const afterUninstall = await readFile(env.configPath, 'utf-8');
    // Byte-for-byte identical — the comment + ordering are back.
    expect(sha256(afterUninstall)).toBe(preHash);
    expect(afterUninstall).toBe(preInstall);
    expect(afterUninstall).toContain('# Hermes config — hand-edited, comments matter');
  });

  it('removes backup + pointer by default after a restore', async () => {
    env = await bootstrap('model: opus\nhooks: {}\n');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(result.backupPath as string)).toBe(true);
    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.backupRemoved).toBe(true);
    expect(existsSync(result.backupPath as string)).toBe(false);
    expect(existsSync(result.pointerPath)).toBe(false);
  });

  it('keeps the backup when cleanupBackup=false', async () => {
    env = await bootstrap('model: opus\nhooks: {}\n');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir, cleanupBackup: false });
    expect(u.backupRemoved).toBe(false);
    expect(existsSync(result.backupPath as string)).toBe(true);
  });

  // ── created_by_us=true: delete-if-created, no orphan (§7.3 invariant 2) ─

  it('deletes the config.yaml we created and leaves NO orphan (absent → install → uninstall)', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);

    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.createdByUs).toBe(true);
    expect(existsSync(env.configPath)).toBe(true);

    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.createdRemoved).toBe(true);
    expect(u.restoredFrom).toBeNull();
    // No orphaned config, no leftover pointer.
    expect(existsSync(env.configPath)).toBe(false);
    expect(existsSync(env.pointerPath)).toBe(false);
  });
});
