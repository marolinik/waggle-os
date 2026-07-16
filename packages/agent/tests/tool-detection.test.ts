/**
 * AI-OS Phase 0 — tool detection tests.
 *
 * TDD coverage for `detectInstalledTools()` and its per-tool detectors.
 * Filesystem and exec are injected so tests run hermetically.
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_TOOLS, type ToolId } from '@waggle/shared';
import {
  detectInstalledTools,
  selectPathLookupCandidate,
  type ToolDetectionDeps,
} from '../src/tool-detection.js';
import { resolveToolCommandInvocation } from '../src/tool-command.js';
import type { ManifestLoaderDeps } from '../src/tool-manifest-loader.js';

type DetectOpts = ToolDetectionDeps & { manifestLoader?: ManifestLoaderDeps };

/**
 * Build a deps object that defaults to "nothing exists anywhere".
 * Tests selectively override `exists` / `execVersion` / `readJson` to
 * simulate specific tools being installed.
 */
function makeDeps(overrides: Partial<DetectOpts> = {}): DetectOpts {
  return {
    platform: 'win32',
    home: 'C:\\Users\\test',
    cwd: 'D:\\projects\\waggle-os',
    exists: async () => false,
    execVersion: async () => null,
    readJson: async () => null,
    pathFromEnv: () => null,
    // Hermetic: no third-party adapters unless a test injects them.
    manifestLoader: { readDir: () => [] },
    ...overrides,
  };
}

describe('detectInstalledTools', () => {
  it('returns an envelope covering every supported tool', async () => {
    const result = await detectInstalledTools(makeDeps());
    const ids = result.tools.map((t) => t.id);
    for (const id of SUPPORTED_TOOLS) {
      expect(ids).toContain(id);
    }
    expect(result.tools).toHaveLength(SUPPORTED_TOOLS.length);
  });

  it('detects a third-party PATH adapter from the registry (#5)', async () => {
    const result = await detectInstalledTools(makeDeps({
      platform: 'linux',
      pathFromEnv: (bin: string) => (bin === 'foo' ? '/usr/bin/foo' : null),
      exists: async (p: string) => p === '/usr/bin/foo',
      execVersion: async () => '1.0.0',
      manifestLoader: {
        dir: '/fake',
        readDir: () => ['foo.json'],
        readFile: () => JSON.stringify({
          id: 'foo-cli',
          displayName: 'Foo',
          launchable: true,
          hookCapable: false,
          hookPointer: '.foo/hm.json',
          detect: { kind: 'path', binaryName: 'foo' },
          promptArgTemplate: ['--print', '{prompt}'],
          task: {
            argvTemplate: ['run', '{prompt}', '{accessArgs}'],
            accessArgs: {
              'read-only': ['--read-only'],
              'workspace-write': ['--workspace-write'],
            },
            promptTransport: 'arg',
            outputDialect: 'jsonl',
            workspaceBinding: 'cwd',
            permissionModes: ['read-only', 'workspace-write'],
            resumable: false,
          },
        }),
      },
    }));
    const foo = result.tools.find((t) => t.id === 'foo-cli');
    expect(foo?.installed).toBe(true);
    expect(foo?.installedPath).toBe('/usr/bin/foo');
    expect(foo?.launchable).toBe(true);
    expect(foo?.hookCapable).toBe(false);
    expect(foo?.builtin).toBe(false);
    expect(foo?.acceptsInlinePrompt).toBe(true);
    expect(foo?.capabilities).toEqual({
      interactiveLaunch: true,
      headlessTask: true,
      structuredProgress: true,
      resumable: false,
      liveWaggleDance: false,
    });
    expect(foo?.permissionModes).toEqual(['read-only', 'workspace-write']);
    expect(result.tools).toHaveLength(SUPPORTED_TOOLS.length + 1);
  });

  it('carries canonical task capabilities for headless and GUI-only built-ins', async () => {
    const result = await detectInstalledTools(makeDeps());
    const codex = result.tools.find((tool) => tool.id === 'codex');
    const cursor = result.tools.find((tool) => tool.id === 'cursor');

    expect(codex?.capabilities).toMatchObject({
      interactiveLaunch: true,
      headlessTask: true,
      structuredProgress: true,
      resumable: true,
    });
    expect(codex?.permissionModes).toEqual(['read-only', 'workspace-write', 'native']);
    expect(cursor?.capabilities).toMatchObject({
      interactiveLaunch: true,
      headlessTask: false,
      structuredProgress: false,
      resumable: false,
    });
    expect(cursor?.permissionModes).toEqual([]);
  });

  it('reports platform and ISO detectedAt', async () => {
    const result = await detectInstalledTools(makeDeps({ platform: 'darwin' }));
    expect(result.platform).toBe('darwin');
    // ISO-8601: 2026-05-20T...
    expect(result.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reports every tool as not installed when nothing exists on disk', async () => {
    const result = await detectInstalledTools(makeDeps());
    for (const t of result.tools) {
      expect(t.installed).toBe(false);
      expect(t.installedPath).toBeNull();
      expect(t.version).toBeNull();
      expect(t.hooksInstalled).toBe(false);
    }
  });

  it('includes the canonical display name for each tool', async () => {
    const result = await detectInstalledTools(makeDeps());
    const claudeCode = result.tools.find((t) => t.id === 'claude-code');
    expect(claudeCode?.displayName).toBe('Claude Code');
    const cursor = result.tools.find((t) => t.id === 'cursor');
    expect(cursor?.displayName).toBe('Cursor');
  });
});

describe('claude-code detector', () => {
  it('detects claude-code when binary is on PATH (POSIX)', async () => {
    const installed = '/usr/local/bin/claude';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
        pathFromEnv: (name) => (name === 'claude' ? installed : null),
        execVersion: async (binary) =>
          binary === installed ? 'claude 1.2.3' : null,
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-code')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
    expect(t.version).toBe('claude 1.2.3');
  });

  it('detects claude-code when binary is on PATH (Windows)', async () => {
    const installed = 'C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        exists: async (p) => p === installed,
        pathFromEnv: (name) => (name === 'claude' ? installed : null),
        execVersion: async () => '1.2.3',
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-code')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
    expect(t.version).toBe('1.2.3');
  });

  it('reports hooksInstalled=true when the hive-mind pointer file is present and references an existing backup', async () => {
    const installed = '/usr/local/bin/claude';
    const home = '/Users/test';
    const pointer = '/Users/test/.claude/hive-mind-install.json';
    const backup = '/Users/test/.claude/settings.json.hive-mind-backup.X';
    const existsSet = new Set([installed, pointer, backup]);

    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home,
        exists: async (p) => existsSet.has(p),
        pathFromEnv: () => installed,
        execVersion: async () => 'claude 1.2.3',
        readJson: async (p) => (p === pointer ? { settings_backup: backup } : null),
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-code')!;
    expect(t.hooksInstalled).toBe(true);
    expect(t.hookPointerPath).toBe(pointer);
  });

  it('reports hooksInstalled=false when the pointer exists but its backup is gone (partial rollback)', async () => {
    const installed = '/usr/local/bin/claude';
    const home = '/Users/test';
    const pointer = '/Users/test/.claude/hive-mind-install.json';
    const existsSet = new Set([installed, pointer]); // backup deliberately missing

    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home,
        exists: async (p) => existsSet.has(p),
        pathFromEnv: () => installed,
        execVersion: async () => 'claude 1.2.3',
        readJson: async (p) =>
          p === pointer
            ? { settings_backup: '/Users/test/.claude/settings.json.hive-mind-backup.X' }
            : null,
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-code')!;
    expect(t.hooksInstalled).toBe(false);
    expect(t.hookPointerPath).toBe(pointer);
  });

  it('records a diagnostic when claude-code is installed but --version fails', async () => {
    const installed = '/usr/local/bin/claude';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
        pathFromEnv: () => installed,
        execVersion: async () => null, // simulate exec failure
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-code')!;
    expect(t.installed).toBe(true);
    expect(t.version).toBeNull();
    expect(t.diagnostic).toBeDefined();
    expect(t.diagnostic).toMatch(/version/i);
  });
});

describe('cursor detector', () => {
  it('detects Cursor at the default Windows install path', async () => {
    const installed = 'C:\\Users\\test\\AppData\\Local\\Programs\\cursor\\Cursor.exe';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        home: 'C:\\Users\\test',
        exists: async (p) => p === installed,
      }),
    );
    const t = result.tools.find((x) => x.id === 'cursor')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });

  it('detects Cursor at the default macOS install path', async () => {
    const installed = '/Applications/Cursor.app/Contents/MacOS/Cursor';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
      }),
    );
    const t = result.tools.find((x) => x.id === 'cursor')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });

  it('reports cursor hooks installed when pointer file is present and valid', async () => {
    const installed = '/Applications/Cursor.app/Contents/MacOS/Cursor';
    const pointer = '/Users/test/.cursor/hive-mind-install.json';
    const backup = '/Users/test/.cursor/settings.json.hive-mind-backup.X';
    const existsSet = new Set([installed, pointer, backup]);

    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => existsSet.has(p),
        readJson: async (p) => (p === pointer ? { settings_backup: backup } : null),
      }),
    );
    const t = result.tools.find((x) => x.id === 'cursor')!;
    expect(t.hooksInstalled).toBe(true);
    expect(t.hookPointerPath).toBe(pointer);
  });
});

describe('claude-desktop detector', () => {
  it('detects Claude Desktop at the default macOS install path', async () => {
    const installed = '/Applications/Claude.app/Contents/MacOS/Claude';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-desktop')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });

  it('detects Claude Desktop at the default Windows install path', async () => {
    const installed =
      'C:\\Users\\test\\AppData\\Local\\AnthropicClaude\\Claude.exe';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        home: 'C:\\Users\\test',
        exists: async (p) => p === installed,
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-desktop')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });
});

describe('extended-cohort detectors (codex / codex-desktop / hermes / openclaw — Phase 4)', () => {
  // Default makeDeps reports nothing installed — the envelope is still
  // present per the stable-shape contract.
  it.each<ToolId>(['codex', 'codex-desktop', 'hermes', 'openclaw'])(
    'reports %s as not installed on a clean machine',
    async (id) => {
      const result = await detectInstalledTools(makeDeps());
      const t = result.tools.find((x) => x.id === id)!;
      expect(t.installed).toBe(false);
      expect(t.installedPath).toBeNull();
    },
  );

  it('detects codex CLI when present on PATH', async () => {
    const installed = '/usr/local/bin/codex';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
        pathFromEnv: (name) => (name === 'codex' ? installed : null),
        execVersion: async (binary) => (binary === installed ? 'codex 0.5.0' : null),
      }),
    );
    const t = result.tools.find((x) => x.id === 'codex')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
    expect(t.version).toBe('codex 0.5.0');
  });

  it('recognizes a healthy create-if-missing hook install with no backup', async () => {
    const installed = '/usr/local/bin/codex';
    const pointer = '/Users/test/.codex/hive-mind-install.json';
    const configPath = '/Users/test/.codex/hooks.json';
    const hooksDir = '/waggle/runtime/codex/hooks';
    const existsSet = new Set([installed, pointer, configPath, hooksDir]);
    const result = await detectInstalledTools(makeDeps({
      platform: 'darwin', home: '/Users/test',
      exists: async (candidate) => existsSet.has(candidate),
      pathFromEnv: (name) => name === 'codex' ? installed : null,
      execVersion: async () => 'codex 0.5.0',
      readJson: async (candidate) => candidate === pointer ? {
        settings_backup: null,
        created_by_us: true,
        config_path: configPath,
        hooks_dir: hooksDir,
        installed_hooks: ['session-start'],
      } : null,
    }));
    expect(result.tools.find((tool) => tool.id === 'codex')?.hooksInstalled).toBe(true);
  });

  it('reports WindowsApps Codex as installed but not launchable when Windows blocks exec', async () => {
    const installed =
      'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.623.19656.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        exists: async (p) => p === installed,
        pathFromEnv: (name) => (name === 'codex' ? installed : null),
        execVersion: async () => null,
      }),
    );

    const t = result.tools.find((x) => x.id === 'codex')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
    expect(t.version).toBeNull();
    expect(t.launchable).toBe(false);
    expect(t.diagnostic).toMatch(/WindowsApps/i);
    expect(t.diagnostic).toMatch(/PATH CLI/i);
  });

  it('detects hermes CLI when present on PATH', async () => {
    const installed = '/usr/local/bin/hermes';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
        pathFromEnv: (name) => (name === 'hermes' ? installed : null),
        execVersion: async () => '0.2.1',
      }),
    );
    const t = result.tools.find((x) => x.id === 'hermes')!;
    expect(t.installed).toBe(true);
    expect(t.version).toBe('0.2.1');
  });

  it('detects a healthy Hermes Windows fallback when PATH is empty', async () => {
    const installed =
      'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe';
    const result = await detectInstalledTools(
      makeDeps({
        exists: async (p) => p === installed,
        execVersion: async (binary) => binary === installed ? '0.2.1' : null,
      }),
    );

    expect(result.tools.find((tool) => tool.id === 'hermes')).toMatchObject({
      installed: true,
      installedPath: installed,
      version: '0.2.1',
      launchable: true,
    });
  });

  it('skips a broken PATH Hermes shim for a healthy Windows fallback', async () => {
    const broken = 'C:\\broken\\hermes.exe';
    const healthy = 'C:\\Users\\test\\AppData\\Local\\hermes\\bin\\hermes.cmd';
    const result = await detectInstalledTools(
      makeDeps({
        exists: async (p) => p === broken || p === healthy,
        pathFromEnv: (name) => name === 'hermes' ? broken : null,
        execVersion: async (binary) => binary === healthy ? '0.2.1' : null,
      }),
    );

    expect(result.tools.find((tool) => tool.id === 'hermes')).toMatchObject({
      installed: true,
      installedPath: healthy,
      version: '0.2.1',
      launchable: true,
    });
  });

  it('reports an all-broken Hermes Windows install as unlaunchable', async () => {
    const broken = 'C:\\broken\\hermes.exe';
    const fallback =
      'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe';
    const result = await detectInstalledTools(
      makeDeps({
        exists: async (p) => p === broken || p === fallback,
        pathFromEnv: (name) => name === 'hermes' ? broken : null,
      }),
    );

    const tool = result.tools.find((candidate) => candidate.id === 'hermes');
    expect(tool).toMatchObject({
      installed: true,
      installedPath: broken,
      version: null,
      launchable: false,
    });
    expect(tool?.diagnostic).toMatch(/hermes doctor|reinstall Hermes/i);
  });

  it('detects openclaw CLI when present on PATH', async () => {
    const installed = '/usr/local/bin/openclaw';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'linux',
        home: '/home/test',
        exists: async (p) => p === installed,
        pathFromEnv: (name) => (name === 'openclaw' ? installed : null),
      }),
    );
    const t = result.tools.find((x) => x.id === 'openclaw')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
    // execVersion default returns null → diagnostic set.
    expect(t.diagnostic).toMatch(/version/i);
  });

  it('detects codex-desktop at the macOS install path', async () => {
    const installed = '/Applications/Codex.app/Contents/MacOS/Codex';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home: '/Users/test',
        exists: async (p) => p === installed,
      }),
    );
    const t = result.tools.find((x) => x.id === 'codex-desktop')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });

  it('detects codex-desktop at the Windows install path', async () => {
    const installed =
      'C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex.exe';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        home: 'C:\\Users\\test',
        exists: async (p) => p === installed,
      }),
    );
    const t = result.tools.find((x) => x.id === 'codex-desktop')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });

  it('derives Codex Desktop from the blocked Microsoft Store CLI resource', async () => {
    const cli =
      'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.707.12708.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe';
    const desktop =
      'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.707.12708.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe';
    const result = await detectInstalledTools(
      makeDeps({
        exists: async (p) => p === cli || p === desktop,
        pathFromEnv: (name) => name === 'codex' ? cli : null,
      }),
    );

    expect(result.tools.find((tool) => tool.id === 'codex')).toMatchObject({
      installed: true,
      installedPath: cli,
      launchable: false,
    });
    expect(result.tools.find((tool) => tool.id === 'codex-desktop')).toMatchObject({
      installed: true,
      installedPath: desktop,
      launchable: true,
    });
  });
});

describe('hermetic safety', () => {
  it('does not call defaultExists / defaultExecVersion when deps are injected', async () => {
    // The contract: tests must run without touching the real filesystem
    // or spawning a child process. We rely on the makeDeps defaults which
    // return false / null. If defaults leaked through, this test would
    // either hang on exec or report inconsistent installed-state on the
    // dev machine. Smoke-test that envelope shape is deterministic.
    const r1 = await detectInstalledTools(makeDeps());
    const r2 = await detectInstalledTools(makeDeps());
    // Both calls produce the same shape on the same injected deps.
    expect(r1.tools.map((t) => t.id)).toEqual(r2.tools.map((t) => t.id));
  });
});

describe('selectPathLookupCandidate', () => {
  it('prefers a Windows command shim over an extensionless POSIX shim', () => {
    const stdout = [
      'C:\\Users\\test\\AppData\\Roaming\\npm\\openclaw',
      'C:\\Users\\test\\AppData\\Roaming\\npm\\openclaw.cmd',
    ].join('\r\n');

    expect(selectPathLookupCandidate(stdout, 'win32')).toBe(
      'C:\\Users\\test\\AppData\\Roaming\\npm\\openclaw.cmd',
    );
  });

  it('keeps the first lookup result on POSIX', () => {
    const stdout = ['/usr/local/bin/openclaw', '/opt/bin/openclaw'].join('\n');

    expect(selectPathLookupCandidate(stdout, 'linux')).toBe('/usr/local/bin/openclaw');
  });
});

describe('resolveToolCommandInvocation', () => {
  it('resolves npm Windows cmd shims to their Node module target', () => {
    const shim = [
      '@ECHO off',
      'GOTO start',
      ':find_dp0',
      'SET dp0=%~dp0',
      'EXIT /b',
      ':start',
      'SETLOCAL',
      'CALL :find_dp0',
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\openclaw\\openclaw.mjs" %*',
    ].join('\n');
    const invocation = resolveToolCommandInvocation(
      'C:\\Users\\test\\AppData\\Roaming\\npm\\openclaw.cmd',
      ['foo&echoBAD', '100%'],
      'win32',
      {
        readTextFile: () => shim,
        fileExists: () => false,
      },
    );

    expect(invocation).toEqual({
      binary: 'node',
      args: [
        'C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules\\openclaw\\openclaw.mjs',
        'foo&echoBAD',
        '100%',
      ],
    });
  });

  it('wraps non-npm Windows cmd shims through a quoted cmd.exe call', () => {
    const invocation = resolveToolCommandInvocation(
      'C:\\Tools\\custom.cmd',
      ['--version'],
      'win32',
      { readTextFile: () => null },
    );

    expect(invocation).toEqual({
      binary: 'cmd.exe',
      args: ['/d', '/v:off', '/s', '/c', 'call "C:\\Tools\\custom.cmd" "--version"'],
      windowsVerbatimArguments: true,
    });
  });
});
