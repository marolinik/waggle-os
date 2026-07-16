import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePaths } from '../src/paths.js';

describe('resolvePaths (claude-desktop)', () => {
  const homes: string[] = [];

  afterEach(async () => {
    for (const home of homes.splice(0)) {
      await rm(home, { recursive: true, force: true });
    }
  });

  async function tempHome(): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), 'hm-claude-desktop-paths-'));
    homes.push(home);
    return home;
  }

  it('uses the Windows Claude Desktop config path', async () => {
    const home = await tempHome();
    const paths = resolvePaths({ home, platform: 'win32' });
    expect(paths.configPath).toBe(join(
      home,
      'AppData',
      'Roaming',
      'Claude',
      'claude_desktop_config.json',
    ));
  });

  it('uses the macOS Claude Desktop config path', async () => {
    const home = await tempHome();
    const paths = resolvePaths({ home, platform: 'darwin' });
    expect(paths.configPath).toBe(join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    ));
  });

  it('uses the Linux Claude Desktop config path', async () => {
    const home = await tempHome();
    const paths = resolvePaths({ home, platform: 'linux' });
    expect(paths.configPath).toBe(join(
      home,
      '.config',
      'Claude',
      'claude_desktop_config.json',
    ));
  });

  it('lets configDir override the platform default', async () => {
    const home = await tempHome();
    const configDir = join(home, 'custom-claude-config');
    const paths = resolvePaths({ home, platform: 'linux', configDir });
    expect(paths.claudeConfigDir).toBe(configDir);
    expect(paths.configPath).toBe(join(configDir, 'claude_desktop_config.json'));
  });

  it('uses one platform-neutral home-relative pointer path', async () => {
    const home = await tempHome();
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      expect(resolvePaths({ home, platform }).pointerPath).toBe(join(
        home,
        '.waggle',
        'claude-desktop',
        'hive-mind-install.json',
      ));
    }
  });
});
