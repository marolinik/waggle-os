import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { install } from '../src/install.js';
import { HIVE_MIND_MARKER } from '../src/adapter.js';

interface TestEnv {
  home: string;
  hooksDir: string;
  configPath: string;
  pointerPath: string;
}

/** Cursor hooks.json is OPTIONAL — `withConfig=false` exercises create-if-missing. */
async function bootstrap(initial: Record<string, unknown> | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmcur-install-'));
  const cursorDir = join(home, '.cursor');
  await mkdir(cursorDir, { recursive: true });
  const configPath = join(cursorDir, 'hooks.json');
  if (initial !== undefined) {
    await writeFile(configPath, JSON.stringify(initial, null, 2) + '\n', 'utf-8');
  }
  const hooksDir = resolve(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  return { home, hooksDir, configPath, pointerPath: join(cursorDir, 'hive-mind-install.json') };
}

describe('install (cursor)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  it('throws on malformed JSON in an existing hooks.json', async () => {
    env = await bootstrap({});
    await writeFile(env.configPath, '{ not valid json', 'utf-8');
    await expect(install({ home: env.home, hooksDir: env.hooksDir }))
      .rejects.toThrow(/parse/);
  });

  // ── pre-existed branch ────────────────────────────────────────────────

  it('writes a byte-identical backup before mutating a pre-existing hooks.json', async () => {
    env = await bootstrap({ version: 1, hooks: {} });
    const original = await readFile(env.configPath, 'utf-8');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.backupPath).not.toBeNull();
    const backupContent = await readFile(result.backupPath as string, 'utf-8');
    expect(backupContent).toBe(original);
  });

  it('records created_by_us=false when hooks.json pre-existed', async () => {
    env = await bootstrap({ version: 1, hooks: {} });
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.createdByUs).toBe(false);
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['created_by_us']).toBe(false);
    expect(pointer['settings_backup']).toBe(result.backupPath);
  });

  it('appends 4 hive groups under the RENAMED cursor event keys + preserves existing structure', async () => {
    const initial = {
      version: 1,
      hooks: {
        sessionStart: [
          { command: 'node /existing/x.js', type: 'command', timeout: 10 },
        ],
      },
    };
    env = await bootstrap(initial);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      version: number;
      hooks: Record<string, Array<{ _hiveMindShim?: string; command: string; type: string }>>;
    };
    expect(after.hooks.sessionStart).toHaveLength(2);
    expect(after.hooks.sessionStart[0].command).toBe('node /existing/x.js');
    expect(after.hooks.sessionStart[1]._hiveMindShim).toBe(HIVE_MIND_MARKER);
    expect(after.hooks.sessionStart[1].type).toBe('command');
    // Renamed events present (NOT the CC PascalCase names).
    expect(after.hooks.beforeSubmitPrompt).toHaveLength(1);
    expect(after.hooks.stop).toHaveLength(1);
    expect(after.hooks.preCompact).toHaveLength(1);
  });

  it('does NOT clobber a user-set version on a pre-existing config', async () => {
    env = await bootstrap({ version: 7, hooks: {} });
    await install({ home: env.home, hooksDir: env.hooksDir });
    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as { version: number };
    expect(after.version).toBe(7);
  });

  // ── create-if-missing branch ──────────────────────────────────────────

  it('creates a skeleton {version:1, hooks:{...}} when hooks.json is absent', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(env.configPath)).toBe(true);
    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      version: number;
      hooks: Record<string, unknown>;
    };
    expect(after.version).toBe(1);
    expect(after.hooks).toBeDefined();
    expect(Object.keys(after.hooks).sort()).toEqual([
      'beforeSubmitPrompt',
      'preCompact',
      'sessionStart',
      'stop',
    ]);
    expect(result.createdByUs).toBe(true);
  });

  it('records created_by_us=true and writes NO backup when hooks.json is absent', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.backupPath).toBeNull();
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['created_by_us']).toBe(true);
    expect(pointer['settings_backup']).toBeNull();
  });

  // ── pointer + cli-path ───────────────────────────────────────────────

  it('drops a pointer file with installed_hooks + version', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(result.pointerPath)).toBe(true);
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['installed_hooks']).toEqual(['session-start', 'user-prompt-submit', 'stop', 'pre-compact']);
    expect(typeof pointer['version']).toBe('string');
  });

  it('respects a custom now() for a deterministic backup filename', async () => {
    env = await bootstrap({ version: 1, hooks: {} });
    const fixedTs = '2026-04-28T10:30:45.123Z';
    const result = await install({
      home: env.home,
      hooksDir: env.hooksDir,
      now: () => new Date(fixedTs),
    });
    expect(result.backupPath).toContain('hive-mind-backup.2026-04-28T10-30-45-123Z');
    const stats = await stat(result.backupPath as string);
    expect(stats.isFile()).toBe(true);
  });

  it('threads --cli-path into every generated hook command + records it in the pointer', async () => {
    env = await bootstrap(undefined);
    const cliPath = '/abs/path/to/dist/index.js';
    const result = await install({ home: env.home, hooksDir: env.hooksDir, cliPath });
    expect(result.cliPath).toBe(cliPath);

    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      hooks: Record<string, Array<{ command: string }>>;
    };
    expect(after.hooks.sessionStart[0].command).toContain(`--cli-path "${cliPath}"`);
    expect(after.hooks.stop[0].command).toContain(`--cli-path "${cliPath}"`);

    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['cli_path']).toBe(cliPath);
  });

  it('rejects --cli-path values containing double-quote characters', async () => {
    env = await bootstrap(undefined);
    await expect(install({
      home: env.home,
      hooksDir: env.hooksDir,
      cliPath: 'malicious" && rm -rf / "',
    })).rejects.toThrow(/double-quote/);
  });
});
