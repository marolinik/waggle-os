import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { install } from '../src/install.js';
import { HIVE_MIND_MARKER } from '../src/adapter.js';

const execFileAsync = promisify(execFile);

interface TestEnv {
  home: string;
  hooksDir: string;
  configPath: string;
  pointerPath: string;
}

/** Codex hooks.json is OPTIONAL — `withConfig=false` exercises create-if-missing. */
async function bootstrap(
  initial: Record<string, unknown> | undefined,
): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmcdx-install-'));
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

describe('install (codex)', () => {
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
    env = await bootstrap({ hooks: {} });
    const original = await readFile(env.configPath, 'utf-8');
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.backupPath).not.toBeNull();
    const backupContent = await readFile(result.backupPath as string, 'utf-8');
    expect(backupContent).toBe(original);
  });

  it('records created_by_us=false when hooks.json pre-existed', async () => {
    env = await bootstrap({ hooks: {} });
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.createdByUs).toBe(false);
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['created_by_us']).toBe(false);
    expect(pointer['settings_backup']).toBe(result.backupPath);
  });

  it('appends 4 hive groups and preserves the existing structure', async () => {
    const initial = {
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'node /existing/x.js' }] },
        ],
      },
    };
    env = await bootstrap(initial);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      hooks: Record<string, Array<{ _hiveMindShim?: string; hooks: Array<{ command: string }> }>>;
    };
    expect(after.hooks.SessionStart).toHaveLength(2);
    expect(after.hooks.SessionStart[0].hooks[0].command).toBe('node /existing/x.js');
    expect(after.hooks.SessionStart[1]._hiveMindShim).toBe(HIVE_MIND_MARKER);
    expect(after.hooks.UserPromptSubmit).toHaveLength(1);
    expect(after.hooks.Stop).toHaveLength(1);
    expect(after.hooks.PreCompact).toHaveLength(1);
  });

  // ── create-if-missing branch ──────────────────────────────────────────

  it('creates a skeleton {hooks:{...}} when hooks.json is absent', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(existsSync(env.configPath)).toBe(true);
    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as { hooks: Record<string, unknown> };
    expect(after.hooks).toBeDefined();
    expect(Object.keys(after.hooks).sort()).toEqual(['PreCompact', 'SessionStart', 'Stop', 'UserPromptSubmit']);
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
    env = await bootstrap({ hooks: {} });
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
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    expect(after.hooks.SessionStart[0].hooks[0].command).toContain(`--cli-path "${cliPath}"`);
    expect(after.hooks.Stop[0].hooks[0].command).toContain(`--cli-path "${cliPath}"`);

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

  // ── install UX: the /hooks trust step must be surfaced ────────────────

  it('install output mentions the one-time /hooks trust step', async () => {
    env = await bootstrap(undefined);
    const binPath = resolve(
      fileURLToPath(new URL('../dist/bin/codex-hooks.js', import.meta.url)),
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      [binPath, 'install', '--hooks-dir', env.hooksDir],
      { env: { ...process.env, HOME: env.home, USERPROFILE: env.home } },
    );
    expect(stdout).toContain('/hooks');
    expect(stdout.toLowerCase()).toContain('trust');
  });
});
