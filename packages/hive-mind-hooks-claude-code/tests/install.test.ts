import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { install } from '../src/install.js';
import { HIVE_MIND_MARKER, type ClaudeCodeSettings } from '../src/settings-merger.js';

interface TestEnv {
  home: string;
  hooksDir: string;
  settingsPath: string;
  pointerPath: string;
}

async function bootstrap(initial: ClaudeCodeSettings): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmc-install-'));
  const claudeDir = join(home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  await writeFile(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
  const hooksDir = resolve(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  return { home, hooksDir, settingsPath, pointerPath: join(claudeDir, 'hive-mind-install.json') };
}

async function cleanup(env: TestEnv): Promise<void> {
  await rm(env.home, { recursive: true, force: true });
}

describe('install', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await cleanup(env);
  });

  it('throws when settings.json is missing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hmc-install-no-settings-'));
    try {
      await expect(install({
        home,
        hooksDir: join(home, 'dist', 'hooks'),
      })).rejects.toThrow(/settings/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('throws on malformed JSON in settings.json', async () => {
    env = await bootstrap({} as ClaudeCodeSettings);
    await writeFile(env.settingsPath, '{ not valid json', 'utf-8');
    await expect(install({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/parse/);
  });

  it('writes a byte-identical backup before mutating', async () => {
    env = await bootstrap({ env: { FOO: '1' } } as ClaudeCodeSettings);
    const original = await readFile(env.settingsPath, 'utf-8');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    const backupContent = await readFile(result.backupPath, 'utf-8');
    expect(backupContent).toBe(original);
  });

  it('appends 4 hive entries and preserves existing structure', async () => {
    const initial: ClaudeCodeSettings = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'node /existing/x.js' }] },
        ],
      },
    };
    env = await bootstrap(initial);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const after = JSON.parse(await readFile(env.settingsPath, 'utf-8')) as ClaudeCodeSettings;
    expect(after.hooks?.SessionStart).toHaveLength(2);
    expect(after.hooks?.SessionStart?.[0].hooks[0].command).toBe('node /existing/x.js');
    expect(after.hooks?.SessionStart?.[1]._hiveMindShim).toBe(HIVE_MIND_MARKER);
    expect(after.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(after.hooks?.Stop).toHaveLength(1);
    expect(after.hooks?.PreCompact).toHaveLength(1);
  });

  it('drops a pointer file with the backup path + version', async () => {
    env = await bootstrap({});
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(result.pointerPath)).toBe(true);
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['settings_backup']).toBe(result.backupPath);
    expect(pointer['installed_hooks']).toEqual(['session-start', 'user-prompt-submit', 'stop', 'pre-compact']);
    expect(typeof pointer['version']).toBe('string');
  });

  it('respects a custom now() for deterministic backup filename', async () => {
    env = await bootstrap({});
    const fixedTs = '2026-04-28T10:30:45.123Z';
    const result = await install({
      home: env.home,
      hooksDir: env.hooksDir,
      now: () => new Date(fixedTs),
    });
    expect(result.backupPath).toContain('hive-mind-backup.2026-04-28T10-30-45-123Z');
    const stats = await stat(result.backupPath);
    expect(stats.isFile()).toBe(true);
  });

  it('threads --cli-path into every generated hook command', async () => {
    env = await bootstrap({});
    const cliPath = '/abs/path/to/dist/index.js';
    const result = await install({ home: env.home, hooksDir: env.hooksDir, cliPath });
    expect(result.cliPath).toBe(cliPath);

    const after = JSON.parse(await readFile(env.settingsPath, 'utf-8')) as ClaudeCodeSettings;
    const sessionStart = after.hooks?.SessionStart?.[0];
    expect(sessionStart?.hooks[0].command).toContain(`--cli-path "${cliPath}"`);
    const stop = after.hooks?.Stop?.[0];
    expect(stop?.hooks[0].command).toContain(`--cli-path "${cliPath}"`);
  });

  it('records cli_path in the install pointer for verify to pick up', async () => {
    env = await bootstrap({});
    const cliPath = '/abs/cli.js';
    const result = await install({ home: env.home, hooksDir: env.hooksDir, cliPath });
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['cli_path']).toBe(cliPath);
  });

  it('records cli_path: null when --cli-path is omitted', async () => {
    env = await bootstrap({});
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.cliPath).toBeUndefined();
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['cli_path']).toBeNull();
  });

  it('rejects --cli-path values that contain double-quote characters', async () => {
    env = await bootstrap({});
    await expect(install({
      home: env.home,
      hooksDir: env.hooksDir,
      cliPath: 'malicious" && rm -rf / "',
    })).rejects.toThrow(/double-quote/);
  });

  it('treats whitespace-only --cli-path as unset', async () => {
    env = await bootstrap({});
    const result = await install({ home: env.home, hooksDir: env.hooksDir, cliPath: '   ' });
    expect(result.cliPath).toBeUndefined();
  });
});
