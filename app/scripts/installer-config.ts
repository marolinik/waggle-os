/**
 * installer-config.ts — Testable utility functions for NSIS installer configuration.
 * No side effects — safe to import in tests.
 */

import { readFileSync } from 'node:fs';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InstallerConfig {
  productName: string;
  version: string;
  publisher: string;
  defaultInstallDir: string;
  dataDir: string; // ~/.waggle
  autostart: boolean;
  desktopShortcut: boolean;
  startMenuEntry: boolean;
  launchAfterInstall: boolean;
}

// ─── Default config ─────────────────────────────────────────────────────────

export function getDefaultInstallerConfig(): InstallerConfig {
  return {
    productName: 'Waggle',
    version: '0.1.0',
    publisher: 'Waggle',
    defaultInstallDir: 'C:\\Program Files\\Waggle',
    dataDir: '~/.waggle',
    autostart: true,
    desktopShortcut: true,
    startMenuEntry: true,
    launchAfterInstall: true,
  };
}

// ─── NSIS defines ───────────────────────────────────────────────────────────

/**
 * Generate NSIS !define statements from an InstallerConfig.
 * These become compile-time constants in the NSIS script.
 */
export function generateNsisDefines(
  config: InstallerConfig,
): Record<string, string> {
  return {
    PRODUCT_NAME: config.productName,
    PRODUCT_VERSION: config.version,
    PRODUCT_PUBLISHER: config.publisher,
    DEFAULT_INSTALL_DIR: config.defaultInstallDir,
    DATA_DIR: config.dataDir,
    AUTOSTART: config.autostart ? '1' : '0',
    DESKTOP_SHORTCUT: config.desktopShortcut ? '1' : '0',
    START_MENU_ENTRY: config.startMenuEntry ? '1' : '0',
    LAUNCH_AFTER_INSTALL: config.launchAfterInstall ? '1' : '0',
  };
}

// ─── Path validation ────────────────────────────────────────────────────────

/**
 * Validate a Windows install directory path.
 * Returns { valid, error? }.
 */
export function validateInstallPath(
  installPath: string,
): { valid: boolean; error?: string } {
  if (!installPath || installPath.trim().length === 0) {
    return { valid: false, error: 'Install path cannot be empty' };
  }

  const trimmed = installPath.trim();

  // Must be an absolute path (drive letter or UNC)
  const isAbsolute =
    /^[A-Za-z]:[/\\]/.test(trimmed) || trimmed.startsWith('\\\\');
  if (!isAbsolute) {
    return { valid: false, error: 'Install path must be an absolute path' };
  }

  // Check for invalid characters (Windows filename restrictions)
  // Drive prefix and backslashes/forward slashes are allowed
  // For UNC paths (\\server\share\...), skip the leading \\; for drive paths, skip "C:\"
  const pathBody = trimmed.startsWith('\\\\')
    ? trimmed.slice(2) // skip leading "\\" for UNC
    : trimmed.slice(3); // skip "C:\" for drive paths
  if (/[<>"|?*:]/.test(pathBody)) {
    return {
      valid: false,
      error: 'Install path contains invalid characters: < > " | ? * :',
    };
  }

  // Path should not be too long (Windows MAX_PATH = 260, but allow some room)
  if (trimmed.length > 240) {
    return {
      valid: false,
      error: 'Install path is too long (max 240 characters)',
    };
  }

  // Should not be a root drive path alone
  if (/^[A-Za-z]:[/\\]?$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Cannot install directly to a drive root',
    };
  }

  return { valid: true };
}

// ─── System path detection ──────────────────────────────────────────────────

/**
 * Check if a path is under a system-protected directory (requires admin/elevation).
 */
export function isSystemPath(installPath: string): boolean {
  const normalized = installPath.replace(/\//g, '\\').toLowerCase();
  const systemPrefixes = [
    'c:\\program files\\',
    'c:\\program files (x86)\\',
    'c:\\windows\\',
    'c:\\programdata\\',
  ];
  return systemPrefixes.some((prefix) => normalized.startsWith(prefix));
}

// ─── Uninstall prompt ───────────────────────────────────────────────────────

/**
 * Generate the uninstaller prompt text for data directory removal.
 */
export function getUninstallPrompt(dataDir: string): string {
  return (
    `Waggle stores your personal data (agents, memories, configuration) in:\n\n` +
    `  ${dataDir}\n\n` +
    `Do you want to remove this data as well?\n\n` +
    `Choose "Yes" to delete all data, or "No" to keep it for future use.`
  );
}

// ─── Version from package.json ──────────────────────────────────────────────

/**
 * Read the version string from a package.json file.
 * Throws if the file cannot be read or has no version field.
 */
export function getVersionFromPackage(packageJsonPath: string): string {
  const raw = readFileSync(packageJsonPath, 'utf-8');
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${packageJsonPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!pkg.version || typeof pkg.version !== 'string') {
    throw new Error(`No valid "version" field in ${packageJsonPath}`);
  }
  return pkg.version;
}
