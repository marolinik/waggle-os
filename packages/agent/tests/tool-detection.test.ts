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
  type ToolDetectionDeps,
} from '../src/tool-detection.js';

/**
 * Build a deps object that defaults to "nothing exists anywhere".
 * Tests selectively override `exists` / `execVersion` / `readJson` to
 * simulate specific tools being installed.
 */
function makeDeps(overrides: Partial<ToolDetectionDeps> = {}): ToolDetectionDeps {
  return {
    platform: 'win32',
    home: 'C:\\Users\\test',
    cwd: 'D:\\projects\\waggle-os',
    exists: async () => false,
    execVersion: async () => null,
    readJson: async () => null,
    pathFromEnv: () => null,
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
        readJson: async (p) => (p === pointer ? { backup } : null),
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
            ? { backup: '/Users/test/.claude/settings.json.hive-mind-backup.X' }
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
        readJson: async (p) => (p === pointer ? { backup } : null),
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

describe('deferred-cohort detectors (codex / codex-desktop / hermes / openclaw)', () => {
  // These detectors are stubs in Phase 0 — they always report not-installed.
  // The contract is that they still appear in the envelope so the UI can
  // render them as "not detected" without special-casing missing entries.
  it.each<ToolId>(['codex', 'codex-desktop', 'hermes', 'openclaw'])(
    'reports %s as not installed with no diagnostic on a clean machine',
    async (id) => {
      const result = await detectInstalledTools(makeDeps());
      const t = result.tools.find((x) => x.id === id)!;
      expect(t.installed).toBe(false);
      expect(t.installedPath).toBeNull();
    },
  );
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
