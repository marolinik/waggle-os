import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install, MCP_SERVER_NAME } from '../src/install.js';
import { resolvePaths } from '../src/paths.js';
import { uninstall } from '../src/uninstall.js';

interface TestEnv {
  home: string;
  mcpEntry: string;
}

async function bootstrap(initial?: Record<string, unknown>): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hm-claude-desktop-uninstall-'));
  const mcpEntry = join(home, 'memory-mcp.js');
  await writeFile(mcpEntry, 'export {};\n', 'utf-8');
  if (initial !== undefined) {
    const paths = resolvePaths({ home, platform: 'linux' });
    await mkdir(paths.claudeConfigDir, { recursive: true });
    await writeFile(paths.configPath, JSON.stringify(initial, null, 2) + '\n', 'utf-8');
  }
  return { home, mcpEntry };
}

function installOpts(env: TestEnv) {
  return {
    home: env.home,
    platform: 'linux' as const,
    mcpEntry: env.mcpEntry,
  };
}

describe('uninstall (claude-desktop)', () => {
  const homes: string[] = [];

  afterEach(async () => {
    for (const home of homes.splice(0)) {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('restores an untouched config byte-identically and removes backup and pointer', async () => {
    const env = await bootstrap({
      mcpServers: { userServer: { command: 'python', args: ['server.py'] } },
      setting: true,
    });
    homes.push(env.home);
    const paths = resolvePaths({ home: env.home, platform: 'linux' });
    const before = await readFile(paths.configPath);
    const installed = await install(installOpts(env));

    const result = await uninstall({ home: env.home, platform: 'linux' });
    const after = await readFile(paths.configPath);

    expect(after).toEqual(before);
    expect(result.surgical).toBe(false);
    expect(result.backupRemoved).toBe(true);
    expect(result.createdRemoved).toBe(false);
    expect(existsSync(installed.backupPath as string)).toBe(false);
    expect(existsSync(installed.pointerPath)).toBe(false);
  });

  it('deletes a config created by the installer', async () => {
    const env = await bootstrap();
    homes.push(env.home);
    const installed = await install(installOpts(env));

    const result = await uninstall({ home: env.home, platform: 'linux' });

    expect(result.createdRemoved).toBe(true);
    expect(result.restoredFrom).toBeNull();
    expect(result.surgical).toBe(false);
    expect(existsSync(installed.paths.configPath)).toBe(false);
    expect(existsSync(installed.pointerPath)).toBe(false);
  });

  it('surgically removes only waggle-memory when the config changed after install', async () => {
    const originalServer = { command: 'python', args: ['original.py'] };
    const env = await bootstrap({ mcpServers: { originalServer } });
    homes.push(env.home);
    const installed = await install(installOpts(env));
    const edited = JSON.parse(await readFile(installed.paths.configPath, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    const userAddedServer = { command: 'node', args: ['/user/added.js'] };
    edited.mcpServers['userAddedServer'] = userAddedServer;
    await writeFile(installed.paths.configPath, JSON.stringify(edited, null, 2) + '\n', 'utf-8');

    const result = await uninstall({ home: env.home, platform: 'linux' });
    const after = JSON.parse(await readFile(installed.paths.configPath, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };

    expect(result.surgical).toBe(true);
    expect(result.backupRemoved).toBe(false);
    expect(after.mcpServers[MCP_SERVER_NAME]).toBeUndefined();
    expect(after.mcpServers['originalServer']).toEqual(originalServer);
    expect(after.mcpServers['userAddedServer']).toEqual(userAddedServer);
    expect(existsSync(installed.backupPath as string)).toBe(true);
    expect(existsSync(installed.pointerPath)).toBe(false);
  });

  it('throws when the install pointer is missing', async () => {
    const env = await bootstrap({});
    homes.push(env.home);

    await expect(uninstall({ home: env.home, platform: 'linux' }))
      .rejects.toThrow(/no install pointer/);
  });
});
