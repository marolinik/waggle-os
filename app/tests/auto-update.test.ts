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

    // The updater plugin CONFIG was removed for v1 because release.yml published
    // latest.json with EMPTY signatures — with a pubkey present, every client
    // update would fail signature verification (a broken update channel). The
    // dependency remains staged so it can be re-enabled once updater signing is
    // provisioned (TAURI_SIGNING_PRIVATE_KEY + createUpdaterArtifacts + a
    // real-signature latest.json generator), but runtime registration is off.
    it('has the updater plugin config intentionally disabled for v1', () => {
      expect(config.plugins?.updater).toBeUndefined();
    });
  });

  describe('capabilities permissions', () => {
    const caps = readJson('src-tauri/capabilities/default.json') as {
      permissions?: string[];
    };

    it('does not expose updater commands while updater config is disabled', () => {
      expect(caps.permissions).toBeDefined();
      expect(caps.permissions).not.toContain('updater:default');
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

    it('does not import UpdaterExt while updater config is disabled', () => {
      expect(libRs).not.toContain('UpdaterExt');
    });

    it('does not register the updater plugin while updater config is disabled', () => {
      expect(libRs).not.toContain('tauri_plugin_updater::Builder::new().build()');
    });

    it('does not run startup update checks while updater config is disabled', () => {
      expect(libRs).not.toContain('.updater()');
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

    it('uses the app-lockfile-pinned Tauri CLI for builds', () => {
      expect(workflow).toContain('node node_modules/@tauri-apps/cli/tauri.js build');
      expect(workflow).not.toMatch(/^\s*uses:\s+tauri-apps\/tauri-action/m);
    });

    it('does NOT publish a broken (empty-signature) updater manifest', () => {
      // The update-manifest job was removed with the updater config (it published
      // latest.json with empty signatures). Re-add it with real updater signing.
      // A re-enable note in comments may still mention it — assert no active job.
      expect(workflow).not.toMatch(/^\s*update-manifest:/m);
    });

    it('stages sidecar dependencies before packaging (P0-2)', () => {
      // The packaged sidecar require()s esbuild-externalized deps that must be
      // staged into resources/node_modules or it dies with MODULE_NOT_FOUND.
      expect(workflow).toContain('stage-sidecar-deps');
    });
  });

  // Frontend update hook describe block removed — the Tauri app/src/
  // frontend was deprecated in favor of apps/web/ (see commit a883050).
  // apps/web keeps a future `waggle://update-available` notice mapper, but
  // native updater emission stays disabled until signed updater artifacts exist.
});
