import { describe, expect, it, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { install } from '../src/install.js';
import { uninstall } from '../src/uninstall.js';
import type { ClaudeCodeSettings } from '../src/settings-merger.js';

interface TestEnv {
  home: string;
  hooksDir: string;
  settingsPath: string;
  pointerPath: string;
}

async function bootstrap(initial: ClaudeCodeSettings): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmc-uninstall-'));
  const claudeDir = join(home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  await writeFile(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
  const hooksDir = resolve(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  return { home, hooksDir, settingsPath, pointerPath: join(claudeDir, 'hive-mind-install.json') };
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

describe('uninstall', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws when no pointer file exists', async () => {
    env = await bootstrap({});
    await expect(uninstall({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/install pointer/);
  });

  it('throws when pointer is malformed', async () => {
    env = await bootstrap({});
    await writeFile(env.pointerPath, '{}', 'utf-8');
    await expect(uninstall({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/malformed/);
  });

  it('install + uninstall round-trip is SHA-256 identical to pre-install state', async () => {
    const initialSettings: ClaudeCodeSettings = {
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'node /existing/gsd-context.js' }] },
        ],
        PreCompact: [
          { hooks: [{ type: 'command', command: 'node /existing/pre-compact.js', timeout: 10 }] },
        ],
      },
    };
    env = await bootstrap(initialSettings);
    const preInstall = await readFile(env.settingsPath, 'utf-8');
    const preHash = sha256(preInstall);

    await install({ home: env.home, hooksDir: env.hooksDir });
    const afterInstall = await readFile(env.settingsPath, 'utf-8');
    expect(sha256(afterInstall)).not.toBe(preHash);

    await uninstall({ home: env.home, hooksDir: env.hooksDir });
    const afterUninstall = await readFile(env.settingsPath, 'utf-8');
    expect(sha256(afterUninstall)).toBe(preHash);
    expect(afterUninstall).toBe(preInstall);
  });

  it('removes the backup file by default after restore', async () => {
    env = await bootstrap({});
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(result.backupPath)).toBe(true);
    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.backupRemoved).toBe(true);
    expect(existsSync(result.backupPath)).toBe(false);
    expect(existsSync(result.pointerPath)).toBe(false);
  });

  it('keeps the backup when cleanupBackup=false', async () => {
    env = await bootstrap({});
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    const u = await uninstall({
      home: env.home,
      hooksDir: env.hooksDir,
      cleanupBackup: false,
    });
    expect(u.backupRemoved).toBe(false);
    expect(existsSync(result.backupPath)).toBe(true);
  });
});
