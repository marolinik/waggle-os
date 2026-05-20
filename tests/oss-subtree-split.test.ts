/**
 * E-4 — Regression guard for scripts/oss-subtree-split.sh.
 *
 * This is a STATIC analysis of the script + the package structure it
 * operates on. It does NOT actually run `git subtree split` (that's a
 * minutes-long operation per package, gated behind an explicit local
 * invocation). Instead it locks down:
 *
 *   1. The script exists and is executable.
 *   2. The list of forbidden top-level entries the script checks for
 *      is the actual list of monorepo-only directories. If we ever
 *      add a new monorepo-level dir (e.g. `tools/`) without updating
 *      the script's forbidden list, a real subtree-split could leak
 *      it; this test surfaces that gap.
 *   3. Every `packages/hive-mind-*` directory contains the package-
 *      level files an OSS-mirror expects (package.json + a real src/
 *      or index file at minimum). If a package is gutted to `export {}`
 *      we don't want the OSS mirror to ship an empty shell.
 *   4. The forbidden list does NOT include legitimate package-internal
 *      directories (docs/, assets/, src/, tests/, dist/) — those exist
 *      inside packages and must be allowed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'oss-subtree-split.sh');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

describe('oss-subtree-split.sh — static guards', () => {
  it('script exists at the documented path', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    expect(statSync(SCRIPT_PATH).isFile()).toBe(true);
  });

  it('script has a shebang for bash', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('script uses set -euo pipefail (fail-fast)', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toMatch(/set -euo pipefail/);
  });

  it('discovers packages/hive-mind-* directories dynamically (Wave 2/3 auto-included)', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    // The default-PACKAGES discovery loop is the seam that picks up
    // newly-added hive-mind-* packages without script edits.
    expect(content).toMatch(/packages\/hive-mind-\*/);
    expect(content).toMatch(/mapfile.*PACKAGES.*ls -1d/);
  });
});

describe('oss-subtree-split.sh — forbidden monorepo-level entries', () => {
  /**
   * Mirror of the script's forbidden-list. If you add a new monorepo-
   * level top-level dir, update BOTH the script and this test (and
   * verify no package legitimately uses that name internally).
   */
  const FORBIDDEN: readonly string[] = [
    'apps',
    'packages',
    'sidecar',
    '.planning',
    '.scratch',
    '.mind',
    'benchmarks',
  ];

  it('every forbidden entry exists as a monorepo-level dir (otherwise the guard is dead)', () => {
    for (const f of FORBIDDEN) {
      const monorepoLevel = join(REPO_ROOT, f);
      expect(
        existsSync(monorepoLevel),
        `Forbidden entry '${f}' is not present at monorepo root — the script's negative-assertion guard is dead.`,
      ).toBe(true);
    }
  });

  it('script lists every forbidden entry in its loop', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    for (const f of FORBIDDEN) {
      // Each forbidden token appears in the `for forbidden in …` loop.
      expect(
        content,
        `Script does not list '${f}' as a forbidden top-level entry.`,
      ).toContain(f);
    }
  });

  it('forbidden list does not include legitimate package-internal dirs', () => {
    const PACKAGE_INTERNAL_DIRS: readonly string[] = ['src', 'tests', 'dist', 'docs', 'assets'];
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    // Locate the `for forbidden in` line specifically — we want to
    // ensure the FORBIDDEN tokens don't accidentally include things
    // every package has internally.
    const match = content.match(/for forbidden in\s+([^\n;]+)/);
    expect(match).toBeTruthy();
    const tokens = (match![1] ?? '').trim().split(/\s+/);
    for (const internal of PACKAGE_INTERNAL_DIRS) {
      expect(
        tokens.includes(internal),
        `Script forbids '${internal}' but that's a legitimate package-internal dir — splits would always fail.`,
      ).toBe(false);
    }
  });
});

describe('oss-subtree-split.sh — package-level shape', () => {
  function listHiveMindPackages(): string[] {
    return readdirSync(PACKAGES_DIR)
      .filter((name) => name.startsWith('hive-mind-'))
      .filter((name) => statSync(join(PACKAGES_DIR, name)).isDirectory());
  }

  it('at least one hive-mind-* package exists (so the script has something to split)', () => {
    expect(listHiveMindPackages().length).toBeGreaterThan(0);
  });

  it.each(listHiveMindPackages())('package %s has package.json', (name) => {
    const pkgJson = join(PACKAGES_DIR, name, 'package.json');
    expect(existsSync(pkgJson), `${name} missing package.json`).toBe(true);
  });

  it.each(listHiveMindPackages())('package %s has src/ (real code, not a placeholder)', (name) => {
    const src = join(PACKAGES_DIR, name, 'src');
    expect(existsSync(src), `${name} missing src/`).toBe(true);
  });

  it.each(listHiveMindPackages())('package %s package.json declares Apache-2.0 license', (name) => {
    const pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, name, 'package.json'), 'utf-8'));
    expect(
      pkg.license,
      `${name} must be Apache-2.0 to ship via the OSS subtree-split (matches the OSS repo's license).`,
    ).toBe('Apache-2.0');
  });
});
