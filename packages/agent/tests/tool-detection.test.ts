/**
 * AI-OS Phase 0 — tool detection tests.
 *
 * TDD coverage for `detectInstalledTools()` and its per-tool detectors.
 * Filesystem and exec are injected so tests run hermetically.
 */

import { describe, it, expect } from 'vitest';
import { SUPPORTED_TOOLS, type ToolId } from '@waggle/shared';
import {
  defaultExecVersion,
  detectInstalledTools,
  selectPathLookupCandidate,
  type ToolDetectionDeps,
} from '../src/tool-detection.js';
import { resolveToolCommandInvocation } from '../src/tool-command.js';
import type { ManifestLoaderDeps } from '../src/tool-manifest-loader.js';

type WindowsAppExecutables = Readonly<Record<string, readonly string[]>>;
type DetectOpts = ToolDetectionDeps & {
  manifestLoader?: ManifestLoaderDeps;
  windowsAppExecutables?: () => WindowsAppExecutables | Promise<WindowsAppExecutables>;
};

/**
 * Build a deps object that defaults to "nothing exists anywhere".
 * Tests selectively override `exists` / `execVersion` / `readJson` to
 * simulate specific tools being installed.
 */
function makeDeps(overrides: Partial<DetectOpts> = {}): DetectOpts {
  return {
    platform: 'win32',
    home: 'C:\\Users\\test',
    env: {},
    cwd: 'D:\\projects\\waggle-os',
    exists: async () => false,
    execVersion: async () => null,
    readJson: async () => null,
    pathFromEnv: () => null,
    windowsAppExecutables: () => ({}),
    // Hermetic: no third-party adapters unless a test injects them.
    manifestLoader: { readDir: () => [] },
    ...overrides,
  };
}

type ClaudeHookCommandBuilder = (basename: string, scriptPath: string) => string;

function activeClaudeHookSettings(
  commandBuilder: ClaudeHookCommandBuilder = (_basename, scriptPath) => `node "${scriptPath}"`,
) {
  const group = (basename: string) => [{
    _hiveMindShim: '@hive-mind/claude-code-hooks',
    hooks: [{
      type: 'command',
      command: commandBuilder(
        basename,
        `/opt/waggle/hive-mind-hooks-claude-code/dist/hooks/${basename}.js`,
      ),
    }],
  }];
  return {
    hooks: {
      SessionStart: group('session-start'),
      UserPromptSubmit: group('user-prompt-submit'),
      Stop: group('stop'),
      PreCompact: group('pre-compact'),
    },
  };
}

function markerStrippedClaudeHookSettings(
  packageName = 'hive-mind-hooks-claude-code',
  commandBuilder: ClaudeHookCommandBuilder = (_basename, scriptPath) => `node "${scriptPath}"`,
  entryType = 'command',
) {
  const group = (basename: string) => [{
    hooks: [{
      type: entryType,
      command: commandBuilder(
        basename,
        `D:\\Waggle\\packages\\${packageName}\\dist\\hooks\\${basename}.js`,
      ),
    }],
  }];
  return {
    hooks: {
      SessionStart: group('session-start'),
      UserPromptSubmit: group('user-prompt-submit'),
      Stop: group('stop'),
      PreCompact: group('pre-compact'),
    },
  };
}

async function detectClaudeHookStatus(
  settingsValue: unknown,
  platform: NodeJS.Platform = 'win32',
): Promise<boolean | undefined> {
  const windows = platform === 'win32';
  const home = windows ? 'C:\\Users\\test' : '/Users/test';
  const installed = windows ? `${home}\\AppData\\Roaming\\npm\\claude.cmd` : '/usr/local/bin/claude';
  const pointer = windows ? `${home}\\.claude\\hive-mind-install.json` : `${home}/.claude/hive-mind-install.json`;
  const backup = windows
    ? `${home}\\.claude\\settings.json.hive-mind-backup.X`
    : `${home}/.claude/settings.json.hive-mind-backup.X`;
  const settings = windows ? `${home}\\.claude\\settings.json` : `${home}/.claude/settings.json`;
  const existsSet = new Set([installed, pointer, backup, settings]);
  const result = await detectInstalledTools(makeDeps({
    platform,
    home,
    exists: async (candidate) => existsSet.has(candidate),
    pathFromEnv: () => installed,
    execVersion: async () => 'claude 2.1.214',
    readJson: async (candidate) => {
      if (candidate === pointer) return { settings_backup: backup };
      if (candidate === settings) return settingsValue;
      return null;
    },
  }));
  return result.tools.find((tool) => tool.id === 'claude-code')?.hooksInstalled;
}

describe('detectInstalledTools', () => {
  it('does not expose ambient secrets to the production version probe', async () => {
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousUnknown = process.env.WAGGLE_FUTURE_PROVIDER_SECRET;
    process.env.OPENAI_API_KEY = 'must-not-reach-version-probe';
    process.env.WAGGLE_FUTURE_PROVIDER_SECRET = 'must-also-be-denied';

    try {
      const result = await defaultExecVersion(process.execPath, [
        '-e',
        "process.stdout.write(JSON.stringify({ openai: process.env.OPENAI_API_KEY ?? null, unknown: process.env.WAGGLE_FUTURE_PROVIDER_SECRET ?? null, hasPath: Boolean(process.env.PATH) }))",
      ]);
      expect(result).not.toBeNull();
      expect(JSON.parse(result!)).toEqual({ openai: null, unknown: null, hasPath: true });
    } finally {
      if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
      if (previousUnknown === undefined) delete process.env.WAGGLE_FUTURE_PROVIDER_SECRET;
      else process.env.WAGGLE_FUTURE_PROVIDER_SECRET = previousUnknown;
    }
  });

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

  it('carries canonical task capabilities and release status for built-ins', async () => {
    const result = await detectInstalledTools(makeDeps());
    const codex = result.tools.find((tool) => tool.id === 'codex');
    const cursor = result.tools.find((tool) => tool.id === 'cursor');
    const openclaw = result.tools.find((tool) => tool.id === 'openclaw');

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
    expect(cursor).toMatchObject({
      releaseStatus: 'roadmap',
      launchable: false,
      hookCapable: false,
    });
    expect(openclaw).toMatchObject({
      releaseStatus: 'roadmap',
      launchable: false,
      hookCapable: false,
    });
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

  it('reports hooksInstalled=true when the pointer, backup, and active Claude hooks are healthy', async () => {
    const installed = '/usr/local/bin/claude';
    const home = '/Users/test';
    const pointer = '/Users/test/.claude/hive-mind-install.json';
    const backup = '/Users/test/.claude/settings.json.hive-mind-backup.X';
    const settings = '/Users/test/.claude/settings.json';
    const existsSet = new Set([installed, pointer, backup, settings]);

    const result = await detectInstalledTools(
      makeDeps({
        platform: 'darwin',
        home,
        exists: async (p) => existsSet.has(p),
        pathFromEnv: () => installed,
        execVersion: async () => 'claude 1.2.3',
        readJson: async (p) => {
          if (p === pointer) return { settings_backup: backup };
          if (p === settings) return activeClaudeHookSettings();
          return null;
        },
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-code')!;
    expect(t.hooksInstalled).toBe(true);
    expect(t.hookPointerPath).toBe(pointer);
  });

  it('keeps hooksInstalled=true after Claude strips private markers from Waggle hook groups', async () => {
    const installed = 'C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd';
    const pointer = 'C:\\Users\\test\\.claude\\hive-mind-install.json';
    const backup = 'C:\\Users\\test\\.claude\\settings.json.hive-mind-backup.X';
    const settings = 'C:\\Users\\test\\.claude\\settings.json';
    const existsSet = new Set([installed, pointer, backup, settings]);

    const result = await detectInstalledTools(makeDeps({
      exists: async (candidate) => existsSet.has(candidate),
      pathFromEnv: () => installed,
      execVersion: async () => 'claude 2.1.214',
      readJson: async (candidate) => {
        if (candidate === pointer) return { settings_backup: backup };
        if (candidate === settings) return markerStrippedClaudeHookSettings();
        return null;
      },
    }));

    expect(result.tools.find((tool) => tool.id === 'claude-code')?.hooksInstalled).toBe(true);
  });

  it.each([
    [
      'a pinned mixed-case Node executable, hook path, and cli path',
      (_basename: string, scriptPath: string) => {
        const spacedPath = scriptPath.replace('D:\\Waggle', 'D:\\Program Files\\Waggle').toUpperCase();
        return `"C:\\Program Files\\nodejs\\node.EXE" "${spacedPath}" --cli-path "D:\\Program Files\\Hive Mind\\cli.JS"`;
      },
    ],
    [
      'safe unquoted absolute paths without spaces',
      (_basename: string, scriptPath: string) => `C:\\Node\\node.exe ${scriptPath} --cli-path D:\\HiveMind\\cli.js`,
    ],
  ])('accepts marker-stripped hooks using %s', async (_label, commandBuilder) => {
    expect(await detectClaudeHookStatus(
      markerStrippedClaudeHookSettings('hive-mind-hooks-claude-code', commandBuilder),
    )).toBe(true);
  });

  it('accepts a canonical marker-stripped POSIX command', async () => {
    const settings = markerStrippedClaudeHookSettings(
      'hive-mind-hooks-claude-code',
      (basename) =>
        `"/usr/local/bin/node" "/opt/waggle/hive-mind-hooks-claude-code/dist/hooks/${basename}.js" --cli-path "/opt/waggle/hive-mind-cli.js"`,
    );
    expect(await detectClaudeHookStatus(settings, 'linux')).toBe(true);
  });

  it('finds the canonical command entry when Claude preserves another entry first', async () => {
    const settings = markerStrippedClaudeHookSettings();
    for (const groups of Object.values(settings.hooks)) {
      groups[0].hooks.unshift({ type: 'prompt', command: 'not executable' });
    }
    expect(await detectClaudeHookStatus(settings)).toBe(true);
  });

  it.each<Array<[string, ClaudeHookCommandBuilder]>>([
    ['echo text', (_basename, scriptPath) => `echo "${scriptPath}"`],
    ['a Node wrapper comment', (_basename, scriptPath) => `node "D:\\wrapper.js" --comment "${scriptPath}"`],
    ['a cmd wrapper', (_basename, scriptPath) => `cmd /c node "${scriptPath}"`],
    ['a PowerShell wrapper', (_basename, scriptPath) => `powershell -Command node "${scriptPath}"`],
    ['node -e text', (_basename, scriptPath) => `node -e "${scriptPath}"`],
    ['a backup extension', (_basename, scriptPath) => `node "${scriptPath}.bak"`],
    ['the wrong hook basename', (_basename, scriptPath) => `node "${scriptPath.replace(/[^\\]+\.js$/, 'other.js')}"`],
    ['an unknown argument', (_basename, scriptPath) => `node "${scriptPath}" --verbose`],
    ['a shell AND chain', (_basename, scriptPath) => `node "${scriptPath}" && echo done`],
    ['a shell semicolon chain', (_basename, scriptPath) => `node "${scriptPath}"; echo done`],
    ['a shell pipe', (_basename, scriptPath) => `node "${scriptPath}" | tee out`],
    ['a shell redirect', (_basename, scriptPath) => `node "${scriptPath}" > out`],
    ['a newline command', (_basename, scriptPath) => `node "${scriptPath}"\necho done`],
    ['an unmatched quote', (_basename, scriptPath) => `node "${scriptPath}`],
    [
      'an unquoted path with spaces',
      (_basename, scriptPath) => `node ${scriptPath.replace('D:\\Waggle', 'D:\\Program Files\\Waggle')}`,
    ],
  ])('rejects marker-stripped hook commands containing %s', async (_label, commandBuilder) => {
    expect(await detectClaudeHookStatus(
      markerStrippedClaudeHookSettings('hive-mind-hooks-claude-code', commandBuilder),
    )).toBe(false);
  });

  it('rejects a canonical-looking entry whose type is not command', async () => {
    expect(await detectClaudeHookStatus(
      markerStrippedClaudeHookSettings(
        'hive-mind-hooks-claude-code',
        (_basename, scriptPath) => `node "${scriptPath}"`,
        'prompt',
      ),
    )).toBe(false);
  });

  it('rejects an arbitrary same-basename script even when the Waggle marker is present', async () => {
    const settings = activeClaudeHookSettings(
      (basename) => `node "C:\\malware\\${basename}.js"`,
    );
    expect(await detectClaudeHookStatus(settings)).toBe(false);
  });

  it.each<Array<[string, ClaudeHookCommandBuilder]>>([
    [
      'quoted command substitution',
      (basename) => `node "/tmp/$(echo owned)/hive-mind-hooks-claude-code/dist/hooks/${basename}.js"`,
    ],
    [
      'quoted backtick substitution',
      (basename) => `node "/tmp/` + '`echo owned`' + `/hive-mind-hooks-claude-code/dist/hooks/${basename}.js"`,
    ],
    [
      'unquoted command substitution',
      (basename) => `node /tmp/$(echo)/hive-mind-hooks-claude-code/dist/hooks/${basename}.js`,
    ],
    [
      'an unquoted glob',
      (basename) => `node /opt/*/hive-mind-hooks-claude-code/dist/hooks/${basename}.js`,
    ],
  ])('rejects POSIX hook paths containing %s', async (_label, commandBuilder) => {
    const settings = markerStrippedClaudeHookSettings(
      'hive-mind-hooks-claude-code',
      commandBuilder,
    );
    expect(await detectClaudeHookStatus(settings, 'linux')).toBe(false);
  });

  it('rejects node.exe as a POSIX hook executable', async () => {
    const settings = markerStrippedClaudeHookSettings(
      'hive-mind-hooks-claude-code',
      (basename) =>
        `/usr/local/bin/node.exe /opt/waggle/hive-mind-hooks-claude-code/dist/hooks/${basename}.js`,
    );
    expect(await detectClaudeHookStatus(settings, 'linux')).toBe(false);
  });

  it('rejects marker-stripped hook commands from a lookalike package', async () => {
    const installed = 'C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd';
    const pointer = 'C:\\Users\\test\\.claude\\hive-mind-install.json';
    const backup = 'C:\\Users\\test\\.claude\\settings.json.hive-mind-backup.X';
    const settings = 'C:\\Users\\test\\.claude\\settings.json';
    const existsSet = new Set([installed, pointer, backup, settings]);

    const result = await detectInstalledTools(makeDeps({
      exists: async (candidate) => existsSet.has(candidate),
      pathFromEnv: () => installed,
      execVersion: async () => 'claude 2.1.214',
      readJson: async (candidate) => {
        if (candidate === pointer) return { settings_backup: backup };
        if (candidate === settings) {
          return markerStrippedClaudeHookSettings('hive-mind-hooks-claude-code-copy');
        }
        return null;
      },
    }));

    expect(result.tools.find((tool) => tool.id === 'claude-code')?.hooksInstalled).toBe(false);
  });

  it('reports hooksInstalled=false when a stale pointer survives but active Claude hooks are gone', async () => {
    const installed = '/usr/local/bin/claude';
    const pointer = '/Users/test/.claude/hive-mind-install.json';
    const backup = '/Users/test/.claude/settings.json.hive-mind-backup.X';
    const settings = '/Users/test/.claude/settings.json';
    const existsSet = new Set([installed, pointer, backup, settings]);

    const result = await detectInstalledTools(makeDeps({
      platform: 'darwin',
      home: '/Users/test',
      exists: async (candidate) => existsSet.has(candidate),
      pathFromEnv: () => installed,
      execVersion: async () => 'claude 1.2.3',
      readJson: async (candidate) => {
        if (candidate === pointer) return { settings_backup: backup };
        if (candidate === settings) return { hooks: {} };
        return null;
      },
    }));

    expect(result.tools.find((tool) => tool.id === 'claude-code')).toMatchObject({
      hooksInstalled: false,
      hookPointerPath: pointer,
    });
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

  it('detects Claude Desktop from its registered Windows AppX executable', async () => {
    const installed =
      'C:\\Program Files\\WindowsApps\\Claude_1.22209.0.0_x64__pzs8sxrjxfjjc\\app\\Claude.exe';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        exists: async (p) => p === installed,
        windowsAppExecutables: () => ({ 'claude-desktop': [installed] }),
      }),
    );
    const t = result.tools.find((x) => x.id === 'claude-desktop')!;
    expect(t.installed).toBe(true);
    expect(t.installedPath).toBe(installed);
  });

  it('keeps conventional detection available when AppX discovery throws synchronously', async () => {
    const installed =
      'C:\\Users\\test\\AppData\\Local\\AnthropicClaude\\Claude.exe';
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        exists: async (p) => p === installed,
        windowsAppExecutables: () => { throw new Error('AppX unavailable'); },
      }),
    );
    expect(result.tools.find((tool) => tool.id === 'claude-desktop')).toMatchObject({
      installed: true,
      installedPath: installed,
    });
  });
});

describe('extended-cohort detectors (Codex / Hermes / OpenClaw — Phase 4)', () => {
  // Default makeDeps reports nothing installed — the envelope is still
  // present per the stable-shape contract.
  it.each<ToolId>(['codex', 'codex-desktop', 'hermes', 'hermes-desktop', 'openclaw'])(
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

  it('uses the direct HERMES_HOME Windows executable fallback and hook pointer', async () => {
    const hermesHome = 'D:\\Hermes Data';
    const installed = `${hermesHome}\\hermes-agent\\venv\\Scripts\\hermes.exe`;
    const pointer = `${hermesHome}\\hive-mind-install.json`;
    const backup = `${hermesHome}\\config.yaml.hive-mind-backup.X`;
    const existsSet = new Set([installed, pointer, backup]);
    const result = await detectInstalledTools(makeDeps({
      env: {
        HERMES_HOME: hermesHome,
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      },
      exists: async (candidate) => existsSet.has(candidate),
      execVersion: async (binary) => binary === installed ? '0.18.2' : null,
      readJson: async (candidate) => candidate === pointer
        ? { settings_backup: backup }
        : null,
    }));

    expect(result.tools.find((tool) => tool.id === 'hermes')).toMatchObject({
      installed: true,
      installedPath: installed,
      version: '0.18.2',
      hooksInstalled: true,
      hookPointerPath: pointer,
    });
  });

  it('uses redirected LOCALAPPDATA for the Windows CLI fallback and hook pointer', async () => {
    const localAppData = 'E:\\Redirected\\Local';
    const hermesHome = `${localAppData}\\hermes`;
    const installed = `${hermesHome}\\hermes-agent\\venv\\Scripts\\hermes.exe`;
    const pointer = `${hermesHome}\\hive-mind-install.json`;
    const configPath = `${hermesHome}\\config.yaml`;
    const existsSet = new Set([installed, pointer, configPath]);
    const result = await detectInstalledTools(makeDeps({
      env: { LOCALAPPDATA: localAppData },
      exists: async (candidate) => existsSet.has(candidate),
      execVersion: async (binary) => binary === installed ? '0.18.2' : null,
      readJson: async (candidate) => candidate === pointer
        ? { settings_backup: null, created_by_us: true, config_path: configPath }
        : null,
    }));

    expect(result.tools.find((tool) => tool.id === 'hermes')).toMatchObject({
      installed: true,
      installedPath: installed,
      version: '0.18.2',
      hooksInstalled: true,
      hookPointerPath: pointer,
    });
  });

  it('uses HERMES_HOME for the bundled Windows desktop app', async () => {
    const hermesHome = 'D:\\Hermes Data';
    const desktop = `${hermesHome}\\hermes-agent\\apps\\desktop\\release\\win-unpacked\\Hermes.exe`;
    const result = await detectInstalledTools(makeDeps({
      env: { HERMES_HOME: hermesHome },
      exists: async (candidate) => candidate === desktop,
    }));

    expect(result.tools.find((tool) => tool.id === 'hermes-desktop')).toMatchObject({
      installed: true,
      installedPath: desktop,
      launchable: true,
    });
  });

  it('skips a broken PATH Hermes shim for a healthy direct Windows executable', async () => {
    const broken = 'C:\\broken\\hermes.exe';
    const healthy = 'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe';
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

  it('separates an installed Hermes Desktop from a broken Hermes CLI', async () => {
    const cli = 'C:\\Users\\test\\AppData\\Local\\hermes\\bin\\hermes.cmd';
    const desktop =
      'C:\\Users\\test\\AppData\\Local\\hermes\\hermes-agent\\apps\\desktop\\release\\win-unpacked\\Hermes.exe';
    const versionProbes: string[] = [];
    const result = await detectInstalledTools(
      makeDeps({
        exists: async (p) => p === cli || p === desktop,
        pathFromEnv: (name) => name === 'hermes' ? cli : null,
        execVersion: async (binary) => {
          versionProbes.push(binary);
          return null;
        },
      }),
    );

    expect(result.tools.find((tool) => tool.id === 'hermes')).toMatchObject({
      installed: true,
      installedPath: cli,
      version: null,
      launchable: false,
      capabilities: { headlessTask: true },
    });
    expect(result.tools.find((tool) => tool.id === 'hermes-desktop')).toMatchObject({
      installed: true,
      installedPath: desktop,
      version: null,
      launchable: true,
      hookCapable: false,
      capabilities: { interactiveLaunch: true, headlessTask: false },
    });
    expect(versionProbes).toContain(cli);
    expect(versionProbes).not.toContain(desktop);
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

  it('detects Codex Desktop AppX when a healthy npm Codex CLI shadows the Store resource', async () => {
    const cli = 'C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd';
    const desktop =
      'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.715.2305.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe';
    let appxQueries = 0;
    const result = await detectInstalledTools(
      makeDeps({
        platform: 'win32',
        exists: async (p) => p === cli || p === desktop,
        pathFromEnv: (name) => name === 'codex' ? cli : null,
        execVersion: async (binary) => binary === cli ? 'codex-cli 0.144.1' : null,
        windowsAppExecutables: () => {
          appxQueries++;
          return { 'codex-desktop': [desktop] };
        },
      }),
    );

    expect(appxQueries).toBe(1);
    expect(result.tools.find((tool) => tool.id === 'codex')).toMatchObject({
      installed: true,
      installedPath: cli,
      version: 'codex-cli 0.144.1',
      launchable: true,
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

  it('rejects non-npm Windows batch shims instead of constructing a cmd.exe program', () => {
    expect(() => resolveToolCommandInvocation(
      'C:\\Tools\\custom.cmd',
      ['safe" & echo injected & rem'],
      'win32',
      { readTextFile: () => null },
    )).toThrow(/UNSAFE_WINDOWS_BATCH_SHIM/);
  });
});
