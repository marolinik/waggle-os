import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  getNodeDownloadUrl,
  getPythonDownloadUrl,
  getResourcePaths,
  getBundleStatus,
  parseVersion,
  isValidVersion,
} from './bundle-utils.js';

// ─── getNodeDownloadUrl ──────────────────────────────────────────────────────

describe('getNodeDownloadUrl', () => {
  it('returns Windows x64 URL by default', () => {
    const url = getNodeDownloadUrl('20.11.1');
    expect(url).toBe('https://nodejs.org/dist/v20.11.1/win-x64/node.exe');
  });

  it('returns Windows arm64 URL', () => {
    const url = getNodeDownloadUrl('20.11.1', 'win32', 'arm64');
    expect(url).toBe('https://nodejs.org/dist/v20.11.1/win-arm64/node.exe');
  });

  it('returns macOS tar.gz URL', () => {
    const url = getNodeDownloadUrl('20.11.1', 'darwin', 'x64');
    expect(url).toContain('darwin-x64.tar.gz');
  });

  it('returns Linux tar.xz URL', () => {
    const url = getNodeDownloadUrl('20.11.1', 'linux', 'x64');
    expect(url).toContain('linux-x64.tar.xz');
  });

  it('includes the version in the URL', () => {
    const url = getNodeDownloadUrl('18.19.0');
    expect(url).toContain('v18.19.0');
  });
});

// ─── getPythonDownloadUrl ────────────────────────────────────────────────────

describe('getPythonDownloadUrl', () => {
  it('returns Windows amd64 embed URL by default', () => {
    const url = getPythonDownloadUrl('3.11.8');
    expect(url).toBe(
      'https://www.python.org/ftp/python/3.11.8/python-3.11.8-embed-amd64.zip',
    );
  });

  it('returns Windows arm64 URL', () => {
    const url = getPythonDownloadUrl('3.11.8', 'win32', 'arm64');
    expect(url).toContain('embed-arm64.zip');
  });

  it('returns macOS pkg URL', () => {
    const url = getPythonDownloadUrl('3.11.8', 'darwin', 'x64');
    expect(url).toContain('macos11.pkg');
  });

  it('returns Linux source URL', () => {
    const url = getPythonDownloadUrl('3.11.8', 'linux', 'x64');
    expect(url).toContain('Python-3.11.8.tar.xz');
  });

  it('includes the version in the URL', () => {
    const url = getPythonDownloadUrl('3.12.1');
    expect(url).toContain('3.12.1');
  });
});

// ─── getResourcePaths ────────────────────────────────────────────────────────

describe('getResourcePaths', () => {
  it('returns correct Windows paths when platform is win32', () => {
    const dir = '/app/src-tauri/resources';
    const paths = getResourcePaths(dir, 'win32');

    expect(paths.node).toBe(path.join(dir, 'node', 'node.exe'));
    expect(paths.python).toBe(path.join(dir, 'python', 'python.exe'));
    expect(paths.litellm).toBe(
      path.join(dir, 'python', 'Lib', 'site-packages', 'litellm'),
    );
  });

  it('handles Windows-style paths', () => {
    const dir = 'C:\\Users\\user\\app\\resources';
    const paths = getResourcePaths(dir, 'win32');

    expect(paths.node).toContain('node.exe');
    expect(paths.python).toContain('python.exe');
    expect(paths.litellm).toContain('litellm');
  });

  it('returns correct Unix paths when platform is darwin', () => {
    const dir = '/app/src-tauri/resources';
    const paths = getResourcePaths(dir, 'darwin');

    expect(paths.node).toBe(path.join(dir, 'node', 'bin', 'node'));
    expect(paths.python).toBe(path.join(dir, 'python', 'bin', 'python3'));
    expect(paths.litellm).toBe(
      path.join(dir, 'python', 'lib', 'python3.11', 'site-packages', 'litellm'),
    );
  });

  it('returns correct Unix paths when platform is linux', () => {
    const dir = '/app/src-tauri/resources';
    const paths = getResourcePaths(dir, 'linux');

    expect(paths.node).toBe(path.join(dir, 'node', 'bin', 'node'));
    expect(paths.python).toBe(path.join(dir, 'python', 'bin', 'python3'));
    expect(paths.litellm).toBe(
      path.join(dir, 'python', 'lib', 'python3.11', 'site-packages', 'litellm'),
    );
  });
});

// ─── getBundleStatus ─────────────────────────────────────────────────────────

describe('getBundleStatus', () => {
  it('reports all missing when nothing exists', () => {
    const mockExists = () => false;
    const status = getBundleStatus('/fake/dir', mockExists);

    expect(status.nodeReady).toBe(false);
    expect(status.pythonReady).toBe(false);
    expect(status.litellmReady).toBe(false);
  });

  it('reports all ready when all exist', () => {
    const mockExists = () => true;
    const status = getBundleStatus('/fake/dir', mockExists);

    expect(status.nodeReady).toBe(true);
    expect(status.pythonReady).toBe(true);
    expect(status.litellmReady).toBe(true);
  });

  it('reports partial status correctly', () => {
    const paths = getResourcePaths('/fake/dir', process.platform);
    const existingPaths = new Set([paths.node, paths.python]);
    const mockExists = (p: string) => existingPaths.has(p);

    const status = getBundleStatus('/fake/dir', mockExists);

    expect(status.nodeReady).toBe(true);
    expect(status.pythonReady).toBe(true);
    expect(status.litellmReady).toBe(false);
  });
});

// ─── parseVersion ────────────────────────────────────────────────────────────

describe('parseVersion', () => {
  it('parses a standard semver string', () => {
    const v = parseVersion('20.11.1');
    expect(v).toEqual({ major: 20, minor: 11, patch: 1 });
  });

  it('parses a version with zeros', () => {
    const v = parseVersion('3.0.0');
    expect(v).toEqual({ major: 3, minor: 0, patch: 0 });
  });
});

// ─── isValidVersion ──────────────────────────────────────────────────────────

describe('isValidVersion', () => {
  it('accepts a valid version', () => {
    expect(isValidVersion('20.11.1')).toBe(true);
    expect(isValidVersion('3.11.8')).toBe(true);
  });

  it('rejects invalid versions', () => {
    expect(isValidVersion('20.11')).toBe(false);
    expect(isValidVersion('abc')).toBe(false);
    expect(isValidVersion('20.11.1.2')).toBe(false);
    expect(isValidVersion('')).toBe(false);
  });
});
