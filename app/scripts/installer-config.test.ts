import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  getDefaultInstallerConfig,
  generateNsisDefines,
  validateInstallPath,
  isSystemPath,
  getUninstallPrompt,
  getVersionFromPackage,
} from './installer-config.js';

// ─── getDefaultInstallerConfig ──────────────────────────────────────────────

describe('getDefaultInstallerConfig', () => {
  it('returns a valid config with expected defaults', () => {
    const config = getDefaultInstallerConfig();
    expect(config.productName).toBe('Waggle');
    expect(config.version).toBe('0.1.0');
    expect(config.publisher).toBe('Waggle');
    expect(config.defaultInstallDir).toBe('C:\\Program Files\\Waggle');
    expect(config.dataDir).toBe('~/.waggle');
    expect(config.autostart).toBe(true);
    expect(config.desktopShortcut).toBe(true);
    expect(config.startMenuEntry).toBe(true);
    expect(config.launchAfterInstall).toBe(true);
  });

  it('returns a new object each time', () => {
    const a = getDefaultInstallerConfig();
    const b = getDefaultInstallerConfig();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ─── generateNsisDefines ───────────────────────────────────────────────────

describe('generateNsisDefines', () => {
  it('maps all config fields to NSIS defines', () => {
    const config = getDefaultInstallerConfig();
    const defines = generateNsisDefines(config);

    expect(defines.PRODUCT_NAME).toBe('Waggle');
    expect(defines.PRODUCT_VERSION).toBe('0.1.0');
    expect(defines.PRODUCT_PUBLISHER).toBe('Waggle');
    expect(defines.DEFAULT_INSTALL_DIR).toBe('C:\\Program Files\\Waggle');
    expect(defines.DATA_DIR).toBe('~/.waggle');
    expect(defines.AUTOSTART).toBe('1');
    expect(defines.DESKTOP_SHORTCUT).toBe('1');
    expect(defines.START_MENU_ENTRY).toBe('1');
    expect(defines.LAUNCH_AFTER_INSTALL).toBe('1');
  });

  it('sets boolean defines to "0" when disabled', () => {
    const config = getDefaultInstallerConfig();
    config.autostart = false;
    config.desktopShortcut = false;
    config.startMenuEntry = false;
    config.launchAfterInstall = false;

    const defines = generateNsisDefines(config);

    expect(defines.AUTOSTART).toBe('0');
    expect(defines.DESKTOP_SHORTCUT).toBe('0');
    expect(defines.START_MENU_ENTRY).toBe('0');
    expect(defines.LAUNCH_AFTER_INSTALL).toBe('0');
  });

  it('handles custom product names and versions', () => {
    const config = getDefaultInstallerConfig();
    config.productName = 'Waggle Pro';
    config.version = '2.5.0';

    const defines = generateNsisDefines(config);
    expect(defines.PRODUCT_NAME).toBe('Waggle Pro');
    expect(defines.PRODUCT_VERSION).toBe('2.5.0');
  });
});

// ─── validateInstallPath ────────────────────────────────────────────────────

describe('validateInstallPath', () => {
  it('accepts a standard Program Files path', () => {
    const result = validateInstallPath('C:\\Program Files\\Waggle');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a custom install path', () => {
    const result = validateInstallPath('D:\\Apps\\Waggle');
    expect(result.valid).toBe(true);
  });

  it('accepts forward slashes', () => {
    const result = validateInstallPath('C:/Users/test/Waggle');
    expect(result.valid).toBe(true);
  });

  it('accepts UNC paths', () => {
    const result = validateInstallPath('\\\\server\\share\\Waggle');
    expect(result.valid).toBe(true);
  });

  it('rejects empty path', () => {
    const result = validateInstallPath('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects whitespace-only path', () => {
    const result = validateInstallPath('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects relative paths', () => {
    const result = validateInstallPath('Waggle\\bin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('absolute');
  });

  it('rejects paths with invalid characters', () => {
    const result = validateInstallPath('C:\\Program Files\\Waggle<test>');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('invalid characters');
  });

  it('rejects paths that are too long', () => {
    const longPath = 'C:\\' + 'a'.repeat(250);
    const result = validateInstallPath(longPath);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });

  it('rejects bare drive root', () => {
    const result = validateInstallPath('C:\\');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('drive root');
  });

  it('rejects drive letter without backslash', () => {
    const result = validateInstallPath('C:');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── isSystemPath ───────────────────────────────────────────────────────────

describe('isSystemPath', () => {
  it('detects Program Files', () => {
    expect(isSystemPath('C:\\Program Files\\Waggle')).toBe(true);
  });

  it('detects Program Files (x86)', () => {
    expect(isSystemPath('C:\\Program Files (x86)\\Waggle')).toBe(true);
  });

  it('detects Windows directory', () => {
    expect(isSystemPath('C:\\Windows\\System32')).toBe(true);
  });

  it('detects ProgramData', () => {
    expect(isSystemPath('C:\\ProgramData\\Waggle')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSystemPath('c:\\program files\\waggle')).toBe(true);
    expect(isSystemPath('C:\\PROGRAM FILES\\Waggle')).toBe(true);
  });

  it('handles forward slashes', () => {
    expect(isSystemPath('C:/Program Files/Waggle')).toBe(true);
  });

  it('returns false for user directories', () => {
    expect(isSystemPath('C:\\Users\\test\\Waggle')).toBe(false);
  });

  it('returns false for custom paths', () => {
    expect(isSystemPath('D:\\Apps\\Waggle')).toBe(false);
  });
});

// ─── getUninstallPrompt ─────────────────────────────────────────────────────

describe('getUninstallPrompt', () => {
  it('includes the data directory in the prompt', () => {
    const prompt = getUninstallPrompt('~/.waggle');
    expect(prompt).toContain('~/.waggle');
  });

  it('mentions keeping data for future use', () => {
    const prompt = getUninstallPrompt('C:\\Users\\test\\.waggle');
    expect(prompt).toContain('keep it for future use');
  });

  it('mentions deleting all data option', () => {
    const prompt = getUninstallPrompt('~/.waggle');
    expect(prompt).toContain('delete all data');
  });

  it('mentions agents and memories', () => {
    const prompt = getUninstallPrompt('~/.waggle');
    expect(prompt).toContain('agents');
    expect(prompt).toContain('memories');
  });
});

// ─── getVersionFromPackage ──────────────────────────────────────────────────

describe('getVersionFromPackage', () => {
  const tmpDir = path.join(tmpdir(), 'waggle-installer-test-' + Date.now());

  // Setup / teardown
  const setup = () => mkdirSync(tmpDir, { recursive: true });
  const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });

  it('reads the version from a valid package.json', () => {
    setup();
    try {
      const pkgPath = path.join(tmpDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({ name: 'test', version: '1.2.3' }));
      expect(getVersionFromPackage(pkgPath)).toBe('1.2.3');
    } finally {
      cleanup();
    }
  });

  it('throws for package.json without version', () => {
    setup();
    try {
      const pkgPath = path.join(tmpDir, 'package.json');
      writeFileSync(pkgPath, JSON.stringify({ name: 'test' }));
      expect(() => getVersionFromPackage(pkgPath)).toThrow('No valid "version"');
    } finally {
      cleanup();
    }
  });

  it('throws for non-existent file', () => {
    expect(() => getVersionFromPackage('/nonexistent/package.json')).toThrow();
  });

  it('reads the actual app package.json version', () => {
    const appPkgPath = path.resolve(__dirname, '..', 'package.json');
    const version = getVersionFromPackage(appPkgPath);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('throws with a descriptive error for malformed JSON', () => {
    setup();
    try {
      const pkgPath = path.join(tmpDir, 'bad.json');
      writeFileSync(pkgPath, '{ not valid json!!!');
      expect(() => getVersionFromPackage(pkgPath)).toThrow('Failed to parse');
    } finally {
      cleanup();
    }
  });
});
