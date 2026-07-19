import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceInstaller } from '../src/installer.js';
import {
  assertSafeGitUrl,
  assertSafeNpmPackageSpec,
  resolveManagedInstallPath,
  resolveNpmInvocation,
} from '../src/install-security.js';
import type { MarketplaceDB } from '../src/db.js';
import type { MarketplacePackage } from '../src/types.js';

const childProcess = vi.hoisted(() => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));
const isolatedHome = vi.hoisted(() => (
  `${process.env.TEMP ?? process.env.TMPDIR ?? process.cwd()}/waggle-marketplace-home-${process.pid}`
));
vi.mock('child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  ...childProcess,
}));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  ...childProcess,
}));
vi.mock('os', async importOriginal => ({
  ...await importOriginal<typeof import('node:os')>(),
  homedir: () => isolatedHome,
}));
vi.mock('node:os', async importOriginal => ({
  ...await importOriginal<typeof import('node:os')>(),
  homedir: () => isolatedHome,
}));

const tempDirs: string[] = [];
const cleanupPaths: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'waggle-marketplace-installer-'));
  tempDirs.push(dir);
  return dir;
}

function packageFixture(overrides: Partial<MarketplacePackage> = {}): MarketplacePackage {
  return {
    id: 1,
    source_id: 1,
    name: 'safe-package',
    display_name: 'Safe package',
    description: 'Test package',
    author: 'tester',
    package_type: 'skill',
    waggle_install_type: 'skill',
    waggle_install_path: '',
    version: '1.0.0',
    license: 'MIT',
    repository_url: '',
    homepage_url: '',
    downloads: 0,
    stars: 0,
    rating: 0,
    rating_count: 0,
    category: 'testing',
    subcategory: '',
    install_manifest: { skill_content: '# safe' },
    platforms: [],
    min_waggle_version: '',
    dependencies: [],
    packs: [],
    created_at: '',
    updated_at: '',
    security_status: 'unscanned',
    security_score: -1,
    last_scanned_at: '',
    content_hash: '',
    scan_engines: [],
    scan_findings: [],
    scan_blocked: false,
    ...overrides,
  };
}

function installerFor(pkg: MarketplacePackage) {
  const recordInstallation = vi.fn();
  const db = {
    getPackage: vi.fn(() => pkg),
    isInstalled: vi.fn(() => false),
    recordInstallation,
    markUninstalled: vi.fn(),
    getRawDb: vi.fn(() => ({ prepare: () => ({ run: vi.fn() }) })),
  } as unknown as MarketplaceDB;
  const installer = new MarketplaceInstaller(db, {
    enable_gen_trust_hub: false,
    enable_cisco_scanner: false,
    enable_mcp_guardian: false,
    enable_heuristics: false,
  });
  return { installer, recordInstallation };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  childProcess.execSync.mockReset();
  childProcess.execFileSync.mockReset();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
  rmSync(isolatedHome, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(isolatedHome, { recursive: true, force: true });
});

describe('MarketplaceInstaller security boundaries', () => {
  it('rejects a skill installPath outside the managed skills directory before writing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const outsidePath = join(tempDir(), 'escaped.md');
    const { installer, recordInstallation } = installerFor(packageFixture());

    const result = await installer.install({ packageId: 1, installPath: outsidePath });

    expect(result.success).toBe(false);
    expect(existsSync(outsidePath)).toBe(false);
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('rejects a plugin installPath outside the managed plugins directory before writing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const outsideDir = join(tempDir(), 'escaped-plugin');
    const sentinel = join(outsideDir, 'keep.txt');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(sentinel, 'keep', 'utf8');
    const { installer, recordInstallation } = installerFor(packageFixture({
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: {},
    }));

    const result = await installer.install({ packageId: 1, installPath: outsideDir });

    expect(result.success).toBe(false);
    expect(existsSync(sentinel)).toBe(true);
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('rejects a caller-selected skill path inside the managed directory without overwriting it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const managedPath = join(isolatedHome, '.waggle', 'skills', 'existing.md');
    mkdirSync(join(isolatedHome, '.waggle', 'skills'), { recursive: true });
    writeFileSync(managedPath, '# keep', 'utf8');
    const { installer, recordInstallation } = installerFor(packageFixture());

    const result = await installer.install({ packageId: 1, installPath: managedPath, force: true });

    expect(result.success).toBe(false);
    expect(readFileSync(managedPath, 'utf8')).toBe('# keep');
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('does not clean up a pre-existing plugin directory when a forced reinstall fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `existing-plugin-${randomUUID()}`;
    const pluginDir = join(isolatedHome, '.waggle', 'plugins', name);
    const sentinel = join(pluginDir, 'keep.txt');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(sentinel, 'keep', 'utf8');
    childProcess.execFileSync.mockImplementationOnce(() => {
      throw new Error('clone failed');
    });
    const { installer, recordInstallation } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: { git_url: 'https://github.com/example/safe-plugin.git' },
    }));

    const result = await installer.install({ packageId: 1, force: true });

    expect(result.success).toBe(false);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep');
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('does not delete the plugin registry when a package name collides with it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const registryPath = join(isolatedHome, '.waggle', 'plugins', 'registry.json');
    mkdirSync(join(isolatedHome, '.waggle', 'plugins'), { recursive: true });
    writeFileSync(registryPath, '{"keep":true}', 'utf8');
    const { installer, recordInstallation } = installerFor(packageFixture({
      name: 'registry.json',
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: {},
    }));

    const result = await installer.install({ packageId: 1, force: true });

    expect(result.success).toBe(false);
    expect(readFileSync(registryPath, 'utf8')).toBe('{"keep":true}');
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('rejects a case-insensitive alias of the reserved plugin registry path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const registryPath = join(isolatedHome, '.waggle', 'plugins', 'registry.json');
    mkdirSync(join(isolatedHome, '.waggle', 'plugins'), { recursive: true });
    writeFileSync(registryPath, '{"keep":true}', 'utf8');
    const { installer, recordInstallation } = installerFor(packageFixture({
      name: 'REGISTRY.JSON',
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: {},
    }));

    const result = await installer.install({ packageId: 1, force: true });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Plugin destination conflicts with the marketplace registry');
    expect(readFileSync(registryPath, 'utf8')).toBe('{"keep":true}');
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('rejects a traversal identifier before a plugin can escape the plugins directory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const escapedName = `escaped-${randomUUID()}`;
    const escapedPath = join(homedir(), '.waggle', escapedName);
    cleanupPaths.push(escapedPath);
    const { installer, recordInstallation } = installerFor(packageFixture({
      name: `../${escapedName}`,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: {},
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(false);
    expect(existsSync(escapedPath)).toBe(false);
    expect(recordInstallation).not.toHaveBeenCalled();
  });

  it('passes a trusted git URL and destination as separate process arguments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `git-plugin-${randomUUID()}`;
    cleanupPaths.push(join(homedir(), '.waggle', 'plugins', name));
    const { installer } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: { git_url: 'https://github.com/example/safe-plugin.git' },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(true);
    expect(childProcess.execSync).not.toHaveBeenCalled();
    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth', '1', '--', 'https://github.com/example/safe-plugin.git', expect.any(String)],
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('rejects a plugin git URL containing shell syntax before process launch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `git-injection-${randomUUID()}`;
    cleanupPaths.push(join(homedir(), '.waggle', 'plugins', name));
    const { installer } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: { git_url: 'https://github.com/example/safe.git & calc.exe' },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(false);
    expect(childProcess.execSync).not.toHaveBeenCalled();
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });

  it('passes a trusted npm package as one positional process argument', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `npm-plugin-${randomUUID()}`;
    cleanupPaths.push(join(homedir(), '.waggle', 'plugins', name));
    const { installer } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: { npm_package: '@scope/safe-package@1.2.3' },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(true);
    expect(childProcess.execSync).not.toHaveBeenCalled();
    const npmCall = childProcess.execFileSync.mock.calls[0];
    expect(npmCall).toBeDefined();
    if (process.platform === 'win32') {
      expect(npmCall[0]).not.toMatch(/(?:^|[\\/])(?:cmd\.exe|npm(?:\.cmd)?)$/i);
      expect(npmCall[1][0]).toMatch(/npm-cli\.js$/i);
    }
    expect(npmCall[1]).toEqual(expect.arrayContaining([
      'install', '--save', '--', '@scope/safe-package@1.2.3',
    ]));
  });

  it('preserves GitHub owner/repo npm shorthand as one positional argument', () => {
    expect(assertSafeNpmPackageSpec('example/safe-package')).toBe('example/safe-package');
  });

  it('rejects plugin npm package shell syntax before process launch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `npm-injection-${randomUUID()}`;
    cleanupPaths.push(join(homedir(), '.waggle', 'plugins', name));
    const { installer } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: { npm_package: 'safe-package; calc.exe' },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(false);
    expect(childProcess.execSync).not.toHaveBeenCalled();
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });

  it('rejects MCP npm package shell syntax before process launch or config mutation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    childProcess.execSync.mockImplementationOnce(() => {
      throw new Error('stop before current implementation writes MCP config');
    });
    const { installer } = installerFor(packageFixture({
      package_type: 'mcp_server',
      waggle_install_type: 'mcp',
      install_manifest: {
        npm_package: 'safe-package && calc.exe',
        mcp_config: { name: 'safe-test-mcp', command: 'npx', args: ['safe-package'] },
      },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(false);
    expect(childProcess.execSync).not.toHaveBeenCalled();
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });

  it('rejects custom npm_args instead of treating catalog metadata as npm options', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `npm-args-${randomUUID()}`;
    cleanupPaths.push(join(homedir(), '.waggle', 'plugins', name));
    const { installer } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: { npm_package: 'safe-package', npm_args: ['--prefix', '..'] },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(false);
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });

  it('rejects a create_file post-install hook that escapes the plugin directory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const name = `hook-path-${randomUUID()}`;
    const escapedPath = join(homedir(), '.waggle', `escaped-hook-${randomUUID()}.txt`);
    cleanupPaths.push(join(homedir(), '.waggle', 'plugins', name), escapedPath);
    const { installer } = installerFor(packageFixture({
      name,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: {
        post_install: [{
          type: 'create_file',
          path: join('..', '..', escapedPath.split(/[\\/]/).at(-1)!),
          content: 'must not be written',
        }],
      },
    }));

    const result = await installer.install({ packageId: 1 });

    expect(result.success).toBe(false);
    expect(existsSync(escapedPath)).toBe(false);
  });

  it.each([
    'ext::sh -c calc% C:/repo',
    'file:///C:/repo',
    'ssh://github.com/example/repo.git',
    'https://user:secret@github.com/example/repo.git',
  ])('rejects unsafe git transport %s', value => {
    expect(() => assertSafeGitUrl(value)).toThrow(/Unsupported plugin git URL/);
  });

  it('rejects an existing symlink or junction that resolves outside the managed root', () => {
    const root = tempDir();
    const outside = tempDir();
    const linked = join(root, 'linked');
    symlinkSync(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => resolveManagedInstallPath(root, join('linked', 'escaped.md')))
      .toThrow(/symlink/);
  });

  it('does not delete outside the plugins directory when uninstalling a traversal identifier', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('server offline')));
    const escapedName = `uninstall-sentinel-${randomUUID()}`;
    const escapedPath = join(homedir(), '.waggle', escapedName);
    const sentinel = join(escapedPath, 'keep.txt');
    cleanupPaths.push(escapedPath);
    mkdirSync(escapedPath, { recursive: true });
    writeFileSync(sentinel, 'keep', 'utf8');
    const { installer } = installerFor(packageFixture({
      name: `../${escapedName}`,
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      install_manifest: {},
    }));

    const result = await installer.uninstall(1);

    expect(result.success).toBe(false);
    expect(existsSync(sentinel)).toBe(true);
  });

  it('resolves Windows npm to node plus npm-cli.js without a command shell', () => {
    const invocation = resolveNpmInvocation(['--version']);
    if (process.platform === 'win32') {
      expect(invocation.executable).not.toMatch(/(?:^|[\\/])(?:cmd\.exe|npm(?:\.cmd)?)$/i);
      expect(invocation.args[0]).toMatch(/npm-cli\.js$/i);
    } else {
      expect(invocation).toEqual({ executable: 'npm', args: ['--version'] });
    }
  });
});
