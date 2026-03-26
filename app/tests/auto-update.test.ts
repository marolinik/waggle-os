/**
 * Auto-update configuration validation tests.
 *
 * Verifies the Tauri updater config, release workflow, and capability
 * permissions are correctly set up for the auto-update flow.
 *
 * These tests validate static config only — no network calls.
 *
 * Release flow:
 *   git tag v1.0.1 && git push --tags
 *   This triggers release.yml which builds + signs + publishes to GitHub Releases.
 *   Tauri updater fetches latest.json from the release assets.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(ROOT, '..');

function readJson(relPath: string): unknown {
  const content = readFileSync(resolve(ROOT, relPath), 'utf-8');
  return JSON.parse(content);
}

function readText(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf-8');
}

describe('auto-update configuration', () => {
  describe('tauri.conf.json updater section', () => {
    const config = readJson('src-tauri/tauri.conf.json') as {
      plugins?: {
        updater?: {
          endpoints?: string[];
          pubkey?: string;
        };
      };
    };

    it('has an updater plugin section', () => {
      expect(config.plugins?.updater).toBeDefined();
    });

    it('has a non-empty pubkey', () => {
      const pubkey = config.plugins?.updater?.pubkey;
      expect(pubkey).toBeDefined();
      expect(typeof pubkey).toBe('string');
      expect(pubkey!.length).toBeGreaterThan(10);
    });

    it('has at least one endpoint URL', () => {
      const endpoints = config.plugins?.updater?.endpoints;
      expect(endpoints).toBeDefined();
      expect(Array.isArray(endpoints)).toBe(true);
      expect(endpoints!.length).toBeGreaterThanOrEqual(1);
    });

    it('endpoint URL points to GitHub releases latest.json', () => {
      const url = config.plugins!.updater!.endpoints![0];
      expect(url).toMatch(/^https:\/\/github\.com\/.+\/releases\/.+\/latest\.json$/);
    });

    it('endpoint URL uses HTTPS', () => {
      const url = config.plugins!.updater!.endpoints![0];
      expect(url.startsWith('https://')).toBe(true);
    });
  });

  describe('capabilities permissions', () => {
    const caps = readJson('src-tauri/capabilities/default.json') as {
      permissions?: string[];
    };

    it('includes updater:default permission', () => {
      expect(caps.permissions).toBeDefined();
      expect(caps.permissions).toContain('updater:default');
    });
  });

  describe('Cargo.toml dependencies', () => {
    const cargo = readFileSync(resolve(ROOT, 'src-tauri/Cargo.toml'), 'utf-8');

    it('includes tauri-plugin-updater dependency', () => {
      expect(cargo).toContain('tauri-plugin-updater');
    });
  });

  describe('Rust updater plugin registration', () => {
    const libRs = readFileSync(resolve(ROOT, 'src-tauri/src/lib.rs'), 'utf-8');

    it('imports UpdaterExt', () => {
      expect(libRs).toContain('UpdaterExt');
    });

    it('registers the updater plugin', () => {
      expect(libRs).toContain('tauri_plugin_updater');
    });

    it('emits waggle://update-available event', () => {
      expect(libRs).toContain('waggle://update-available');
    });
  });

  describe('release workflow (release.yml)', () => {
    const workflow = readText('.github/workflows/release.yml');

    it('triggers on tag push', () => {
      expect(workflow).toContain("- 'v*'");
    });

    it('builds for Windows', () => {
      expect(workflow).toContain('windows-latest');
    });

    it('builds for macOS (both architectures)', () => {
      expect(workflow).toContain('aarch64-apple-darwin');
      expect(workflow).toContain('x86_64-apple-darwin');
    });

    it('generates latest.json manifest', () => {
      expect(workflow).toContain('latest.json');
    });

    it('uses tauri-action for builds', () => {
      expect(workflow).toContain('tauri-apps/tauri-action');
    });

    it('uploads latest.json to the release', () => {
      expect(workflow).toContain('softprops/action-gh-release');
      expect(workflow).toContain('files: latest.json');
    });

    it('includes platform URLs in the manifest template', () => {
      expect(workflow).toContain('windows-x86_64');
      expect(workflow).toContain('darwin-aarch64');
      expect(workflow).toContain('darwin-x86_64');
    });
  });

  describe('frontend update hook', () => {
    const hookSource = readFileSync(
      resolve(ROOT, 'src/hooks/useAutoUpdate.ts'),
      'utf-8',
    );

    it('exists and imports from react', () => {
      expect(hookSource).toContain("from 'react'");
    });

    it('guards with __TAURI_INTERNALS__ for web mode', () => {
      expect(hookSource).toContain('__TAURI_INTERNALS__');
    });

    it('listens for waggle://update-available event', () => {
      expect(hookSource).toContain('waggle://update-available');
    });

    it('exports useAutoUpdate function', () => {
      expect(hookSource).toContain('export function useAutoUpdate');
    });
  });
});
