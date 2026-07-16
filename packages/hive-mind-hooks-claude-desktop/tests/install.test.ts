import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, MCP_SERVER_NAME } from '../src/install.js';
import { resolvePaths } from '../src/paths.js';

interface TestEnv {
  home: string;
  mcpEntry: string;
}

async function bootstrap(initial?: Record<string, unknown>): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hm-claude-desktop-install-'));
  const mcpEntry = join(home, 'memory-mcp.js');
  await writeFile(mcpEntry, 'export {};\n', 'utf-8');
  if (initial !== undefined) {
    const paths = resolvePaths({ home, platform: 'linux' });
    await mkdir(paths.claudeConfigDir, { recursive: true });
    await writeFile(paths.configPath, JSON.stringify(initial, null, 2) + '\n', 'utf-8');
  }
  return { home, mcpEntry };
}

function installOpts(env: TestEnv, mcpEntry = env.mcpEntry) {
  return {
    home: env.home,
    platform: 'linux' as const,
    mcpEntry,
  };
}

describe('install (claude-desktop)', () => {
  const homes: string[] = [];

  afterEach(async () => {
    for (const home of homes.splice(0)) {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('creates a config and ownership pointer on a fresh install', async () => {
    const env = await bootstrap();
    homes.push(env.home);

    const result = await install({
      ...installOpts(env),
      cliPath: ' /opt/hive-mind-cli/dist/index.js ',
    });
    const config = JSON.parse(await readFile(result.paths.configPath, 'utf-8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const pointer = JSON.parse(await readFile(result.pointerPath, 'utf-8')) as Record<string, unknown>;

    expect(result.createdByUs).toBe(true);
    expect(result.backupPath).toBeNull();
    expect(config.mcpServers[MCP_SERVER_NAME]).toEqual({
      command: process.env.WAGGLE_HOOK_NODE_PATH?.trim() || process.execPath,
      args: [env.mcpEntry],
    });
    expect(Object.keys(config.mcpServers[MCP_SERVER_NAME])).toEqual(['command', 'args']);
    expect(pointer['created_by_us']).toBe(true);
    expect(pointer['settings_backup']).toBeNull();
    expect(pointer['hooks_dir']).toBeNull();
    expect(pointer['installed_hooks']).toEqual(['mcp:waggle-memory']);
    expect(pointer['cli_path']).toBe('/opt/hive-mind-cli/dist/index.js');
  });

  it('backs up a pre-existing config byte-identically and preserves other servers', async () => {
    const existingServer = {
      command: 'python',
      args: ['server.py'],
      env: { KEEP_ME: 'yes' },
    };
    const env = await bootstrap({
      theme: 'dark',
      mcpServers: { userServer: existingServer },
    });
    homes.push(env.home);
    const paths = resolvePaths({ home: env.home, platform: 'linux' });
    const originalBytes = await readFile(paths.configPath);

    const result = await install(installOpts(env));
    const config = JSON.parse(await readFile(paths.configPath, 'utf-8')) as {
      theme: string;
      mcpServers: Record<string, unknown>;
    };

    expect(result.createdByUs).toBe(false);
    expect(result.backupPath).not.toBeNull();
    expect(await readFile(result.backupPath as string)).toEqual(originalBytes);
    expect(config.theme).toBe('dark');
    expect(config.mcpServers['userServer']).toEqual(existingServer);
    expect(config.mcpServers[MCP_SERVER_NAME]).toBeDefined();
  });

  it("refuses to clobber a foreign 'waggle-memory' entry without a pointer", async () => {
    const foreignEntry = { command: 'node', args: ['/user/server.js'] };
    const env = await bootstrap({ mcpServers: { [MCP_SERVER_NAME]: foreignEntry } });
    homes.push(env.home);

    await expect(install(installOpts(env))).rejects.toThrow(
      /was not installed by this tool; remove or rename it first/,
    );
    const paths = resolvePaths({ home: env.home, platform: 'linux' });
    const config = JSON.parse(await readFile(paths.configPath, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(config.mcpServers[MCP_SERVER_NAME]).toEqual(foreignEntry);
    expect(existsSync(paths.pointerPath)).toBe(false);
  });

  it('replaces its entry on reinstall without replacing the original backup or ownership', async () => {
    const env = await bootstrap({ mcpServers: { userServer: { command: 'user', args: [] } } });
    homes.push(env.home);
    const first = await install(installOpts(env));
    const firstPointer = JSON.parse(await readFile(first.pointerPath, 'utf-8')) as Record<string, unknown>;
    const replacementEntry = join(env.home, 'memory-mcp-v2.js');
    await writeFile(replacementEntry, 'export const version = 2;\n', 'utf-8');

    const second = await install(installOpts(env, replacementEntry));
    const secondPointer = JSON.parse(await readFile(second.pointerPath, 'utf-8')) as Record<string, unknown>;
    const config = JSON.parse(await readFile(second.paths.configPath, 'utf-8')) as {
      mcpServers: Record<string, { args: string[] }>;
    };
    const backups = (await readdir(second.paths.claudeConfigDir))
      .filter((name) => name.includes('hive-mind-backup'));

    expect(config.mcpServers[MCP_SERVER_NAME].args).toEqual([replacementEntry]);
    expect(Object.keys(config.mcpServers).filter((name) => name === MCP_SERVER_NAME)).toHaveLength(1);
    expect(second.backupPath).toBe(first.backupPath);
    expect(secondPointer['settings_backup']).toBe(firstPointer['settings_backup']);
    expect(secondPointer['created_by_us']).toBe(firstPointer['created_by_us']);
    expect(backups).toHaveLength(1);
  });

  it('throws when the MCP entry cannot be resolved', async () => {
    const env = await bootstrap();
    homes.push(env.home);

    await expect(install({
      home: env.home,
      platform: 'linux',
      mcpEntry: '   ',
    })).rejects.toThrow(/cannot resolve waggle-memory-mcp\/dist\/index\.js/);
  });
});
