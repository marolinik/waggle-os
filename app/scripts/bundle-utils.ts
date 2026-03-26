/**
 * bundle-utils.ts — Pure utility functions for runtime bundling.
 * No side effects — safe to import in tests.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

// ─── URL builders ────────────────────────────────────────────────────────────

/**
 * Build the download URL for a Node.js binary.
 */
export function getNodeDownloadUrl(
  version: string,
  platform: string = 'win32',
  arch: string = 'x64',
): string {
  if (platform === 'win32') {
    return `https://nodejs.org/dist/v${version}/win-${arch}/node.exe`;
  }
  if (platform === 'darwin') {
    return `https://nodejs.org/dist/v${version}/node-v${version}-darwin-${arch}.tar.gz`;
  }
  // linux
  return `https://nodejs.org/dist/v${version}/node-v${version}-linux-${arch}.tar.xz`;
}

/**
 * Build the download URL for an embeddable Python zip.
 */
export function getPythonDownloadUrl(
  version: string,
  platform: string = 'win32',
  arch: string = 'x64',
): string {
  if (platform === 'win32') {
    const archSuffix = arch === 'x64' ? 'amd64' : arch;
    return `https://www.python.org/ftp/python/${version}/python-${version}-embed-${archSuffix}.zip`;
  }
  if (platform === 'darwin') {
    return `https://www.python.org/ftp/python/${version}/python-${version}-macos11.pkg`;
  }
  return `https://www.python.org/ftp/python/${version}/Python-${version}.tar.xz`;
}

// ─── Path helpers ────────────────────────────────────────────────────────────

export interface ResourcePaths {
  node: string;
  python: string;
  litellm: string;
}

/**
 * Return the expected file paths for each bundled component.
 */
export function getResourcePaths(resourcesDir: string, platform: string = process.platform): ResourcePaths {
  if (platform === 'win32') {
    return {
      node: path.join(resourcesDir, 'node', 'node.exe'),
      python: path.join(resourcesDir, 'python', 'python.exe'),
      litellm: path.join(resourcesDir, 'python', 'Lib', 'site-packages', 'litellm'),
    };
  }
  // darwin / linux
  return {
    node: path.join(resourcesDir, 'node', 'bin', 'node'),
    python: path.join(resourcesDir, 'python', 'bin', 'python3'),
    litellm: path.join(resourcesDir, 'python', 'lib', 'python3.11', 'site-packages', 'litellm'),
  };
}

// ─── Status ──────────────────────────────────────────────────────────────────

export interface BundleStatus {
  nodeReady: boolean;
  pythonReady: boolean;
  litellmReady: boolean;
}

/**
 * Check which runtimes are already present and ready.
 * Accepts an optional existsSync override for testing.
 */
export function getBundleStatus(
  resourcesDir: string,
  _existsSync: (p: string) => boolean = existsSync,
): BundleStatus {
  const paths = getResourcePaths(resourcesDir);
  return {
    nodeReady: _existsSync(paths.node),
    pythonReady: _existsSync(paths.python),
    litellmReady: _existsSync(paths.litellm),
  };
}

// ─── Version helpers ─────────────────────────────────────────────────────────

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse a version string like '20.11.1' into { major, minor, patch }.
 */
export function parseVersion(version: string): ParsedVersion {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
  };
}

/**
 * Validate a version string (must be X.Y.Z with numeric parts).
 */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}
