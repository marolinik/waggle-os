/**
 * 9D-1/9D-2/9D-7: Tauri configuration tests.
 *
 * Validates tauri.conf.json, Cargo.toml, lib.rs, and build scripts
 * are properly configured for production desktop builds.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const TAURI_DIR = path.join(ROOT, 'app', 'src-tauri');

describe('Tauri Production Configuration', () => {
  it('tauri.conf.json exists and has v1.0.0', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.productName).toBe('Waggle');
    expect(conf.version).toBe('1.0.0');
    expect(conf.identifier).toBe('com.waggle.app');
  });

  it('tauri.conf.json has bundle targets configured', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    // targets: "all" builds for the current platform (NSIS on Windows, DMG on macOS, etc.)
    expect(conf.bundle.targets).toBe('all');
    expect(conf.bundle.active).toBe(true);
  });

  it('tauri.conf.json bundles resources directory', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.bundle.resources).toContain('resources/*');
  });

  it('tauri.conf.json has correct window settings', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    const win = conf.app.windows[0];
    expect(win.title).toBe('Waggle');
    expect(win.width).toBe(1200);
    expect(win.height).toBe(800);
    expect(win.minWidth).toBe(800);
    expect(win.minHeight).toBe(600);
    expect(win.resizable).toBe(true);
  });

  it('tauri.conf.json has updater configured', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.plugins.updater).toBeDefined();
    expect(conf.plugins.updater.endpoints).toBeDefined();
    expect(conf.plugins.updater.endpoints.length).toBeGreaterThan(0);
  });

  it('tauri.conf.json has tray icon configured', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.app.trayIcon).toBeDefined();
    expect(conf.app.trayIcon.tooltip).toContain('Waggle');
  });

  it('tauri.conf.json has CSP that allows localhost connections', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    const csp = conf.app.security.csp;
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('ws://localhost:*');
  });

  it('Cargo.toml has updater plugin dependency', () => {
    const cargo = fs.readFileSync(path.join(TAURI_DIR, 'Cargo.toml'), 'utf-8');
    expect(cargo).toContain('tauri-plugin-updater');
    expect(cargo).toContain('tauri-plugin-notification');
    expect(cargo).toContain('tauri-plugin-single-instance');
  });

  it('lib.rs initializes updater plugin', () => {
    const lib = fs.readFileSync(path.join(TAURI_DIR, 'src', 'lib.rs'), 'utf-8');
    expect(lib).toContain('tauri_plugin_updater');
    expect(lib).toContain('update-available');
  });

  it('NSIS installer template exists', () => {
    const nsis = fs.readFileSync(path.join(TAURI_DIR, 'nsis', 'installer.nsi'), 'utf-8');
    expect(nsis).toContain('NSIS_HOOK_PREINSTALL');
    expect(nsis).toContain('Desktop shortcut');
    expect(nsis).toContain('Start Menu');
  });

  it('icon.ico exists', () => {
    expect(fs.existsSync(path.join(TAURI_DIR, 'icons', 'icon.ico'))).toBe(true);
  });

  it('build-sidecar script exists', () => {
    const script = path.join(ROOT, 'scripts', 'build-sidecar.mjs');
    expect(fs.existsSync(script)).toBe(true);
    const content = fs.readFileSync(script, 'utf-8');
    expect(content).toContain('esbuild');
    expect(content).toContain('service.ts');
    expect(content).toContain('resources/service.js');
  });
});

describe('CI/CD Configuration', () => {
  it('release workflow exists for Windows + macOS builds', () => {
    const workflow = path.join(ROOT, '.github', 'workflows', 'release.yml');
    expect(fs.existsSync(workflow)).toBe(true);
    const content = fs.readFileSync(workflow, 'utf-8');
    expect(content).toContain('build-windows');
    expect(content).toContain('build-macos');
    expect(content).toContain('tauri-action');
    expect(content).toContain('aarch64-apple-darwin');
    expect(content).toContain('x86_64-apple-darwin');
  });

  it('release workflow generates updater manifest', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    expect(workflow).toContain('latest.json');
    expect(workflow).toContain('update-manifest');
  });
});

describe('Playwright Visual Regression Setup', () => {
  it('playwright.config.ts exists', () => {
    const conf = path.join(ROOT, 'playwright.config.ts');
    expect(fs.existsSync(conf)).toBe(true);
    const content = fs.readFileSync(conf, 'utf-8');
    expect(content).toContain('maxDiffPixelRatio');
    expect(content).toContain('localhost:3333');
  });

  it('visual test spec exists with 14 test cases (7 views x 2 themes)', () => {
    const spec = path.join(ROOT, 'tests', 'visual', 'views.spec.ts');
    expect(fs.existsSync(spec)).toBe(true);
    const content = fs.readFileSync(spec, 'utf-8');
    expect(content).toContain('Dark Mode');
    expect(content).toContain('Light Mode');
    // 7 views defined
    expect(content).toContain('chat');
    expect(content).toContain('memory');
    expect(content).toContain('events');
    expect(content).toContain('capabilities');
    expect(content).toContain('cockpit');
    expect(content).toContain('mission-control');
    expect(content).toContain('settings');
  });
});
