import { describe, expect, it, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// codex-desktop is a THIN RE-EXPORT — install/uninstall/verify come from the
// codex package via `export * from '@waggle/hive-mind-hooks-codex'`. Importing
// them through the desktop barrel proves the re-export is wired and that the
// SAME installer writes the SAME ~/.codex/hooks.json + pointer as codex.
import { install, uninstall } from '../src/index.js';
import { install as codexInstall } from '@waggle/hive-mind-hooks-codex';
import { HIVE_MIND_MARKER } from '@waggle/hive-mind-hooks-codex';

interface TestEnv {
  home: string;
  hooksDir: string;
  configPath: string;
  pointerPath: string;
}

/** Codex Desktop shares ~/.codex/ — same config + pointer paths as the CLI. */
async function bootstrap(initial: Record<string, unknown> | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmcdxd-parity-'));
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

describe('parity (codex-desktop ↔ codex)', () => {
  let env: TestEnv;

  afterEach(async () => {
    if (env) await rm(env.home, { recursive: true, force: true });
  });

  // ── shared ~/.codex/ surface ──────────────────────────────────────────

  it('installs into the SAME ~/.codex/hooks.json the Codex CLI uses', async () => {
    env = await bootstrap(undefined);
    expect(existsSync(env.configPath)).toBe(false);

    const result = await install({ home: env.home, hooksDir: env.hooksDir });

    // The config + pointer land at the shared ~/.codex/ paths.
    expect(result.paths.configPath).toBe(env.configPath);
    expect(result.pointerPath).toBe(env.pointerPath);
    expect(existsSync(env.configPath)).toBe(true);
    expect(existsSync(env.pointerPath)).toBe(true);
  });

  it('writes the hive group (marker) + all four lifecycle events', async () => {
    env = await bootstrap(undefined);
    await install({ home: env.home, hooksDir: env.hooksDir });

    const after = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      hooks: Record<string, Array<{ _hiveMindShim?: string }>>;
    };
    expect(Object.keys(after.hooks).sort()).toEqual(
      ['PreCompact', 'SessionStart', 'Stop', 'UserPromptSubmit'],
    );
    // Every group we added carries the codex hive marker.
    for (const event of Object.keys(after.hooks)) {
      expect(after.hooks[event][0]._hiveMindShim).toBe(HIVE_MIND_MARKER);
    }
  });

  it('writes a pointer carrying the codex installed_hooks list', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;
    expect(pointer['installed_hooks']).toEqual(
      ['session-start', 'user-prompt-submit', 'stop', 'pre-compact'],
    );
    expect(pointer['config_path']).toBe(env.configPath);
  });

  // ── byte-for-byte identical to the codex installer ────────────────────

  it('produces a byte-identical hooks.json to the codex installer (same inputs)', async () => {
    const initial = {
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'node /existing/ctx.js' }] },
        ],
      },
    };
    const fixedTs = '2026-04-28T10:30:45.123Z';

    // Desktop install into env A.
    env = await bootstrap(initial);
    await install({
      home: env.home,
      hooksDir: env.hooksDir,
      now: () => new Date(fixedTs),
    });
    const desktopConfig = await readFile(env.configPath, 'utf-8');

    // Codex install into env B with IDENTICAL inputs — same hooksDir so the
    // embedded hook command strings (which carry the absolute hooksDir path)
    // match. Only the HOME differs (each install writes to its own ~/.codex/),
    // and HOME does not appear in the emitted config.
    const envB = await bootstrap(initial);
    try {
      await codexInstall({
        home: envB.home,
        hooksDir: env.hooksDir,
        now: () => new Date(fixedTs),
      });
      const codexConfig = await readFile(envB.configPath, 'utf-8');
      expect(sha256(desktopConfig)).toBe(sha256(codexConfig));
    } finally {
      await rm(envB.home, { recursive: true, force: true });
    }
  });

  // ── reversibility: uninstall restores the shared file ─────────────────

  it('uninstall removes the hooks.json we created and leaves NO orphan', async () => {
    env = await bootstrap(undefined);
    const result = await install({ home: env.home, hooksDir: env.hooksDir });
    expect(result.createdByUs).toBe(true);
    expect(existsSync(env.configPath)).toBe(true);

    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.createdRemoved).toBe(true);
    expect(u.restoredFrom).toBeNull();
    expect(existsSync(env.configPath)).toBe(false);
    expect(existsSync(env.pointerPath)).toBe(false);
  });

  it('uninstall restores a pre-existing hooks.json byte-identically', async () => {
    const initial = {
      schemaVersion: 1,
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'node /existing/ctx.js' }] },
        ],
      },
    };
    env = await bootstrap(initial);
    const preInstall = await readFile(env.configPath, 'utf-8');
    const preHash = sha256(preInstall);

    await install({ home: env.home, hooksDir: env.hooksDir });
    const afterInstall = await readFile(env.configPath, 'utf-8');
    expect(sha256(afterInstall)).not.toBe(preHash);

    const u = await uninstall({ home: env.home, hooksDir: env.hooksDir });
    expect(u.createdRemoved).toBe(false);
    const afterUninstall = await readFile(env.configPath, 'utf-8');
    expect(sha256(afterUninstall)).toBe(preHash);
    expect(afterUninstall).toBe(preInstall);
    // backup + pointer cleaned up.
    expect(existsSync(env.pointerPath)).toBe(false);
  });
});
