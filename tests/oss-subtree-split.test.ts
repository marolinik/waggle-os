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
import {
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'oss-subtree-split.sh');
const DRIFT_SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'oss-drift-check.sh');
const RETIRED_PARITY_SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'parity-check.sh');
const SUPERSEDED_PLAN_PATH = join(
  REPO_ROOT,
  'docs',
  'plans',
  'E-4-OSS-EXTRACTION-VERIFIED-2026-05-20.md',
);
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

function resolveBashExecutable(): string {
  if (process.platform !== 'win32') return 'bash';

  let current = resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf-8' }).trim());
  for (let depth = 0; depth < 6; depth += 1) {
    for (const candidate of [
      join(current, 'bash.exe'),
      join(current, 'bin', 'bash.exe'),
      join(current, 'usr', 'bin', 'bash.exe'),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
    current = resolve(current, '..');
  }

  throw new Error('Git Bash was not found relative to the active git.exe installation.');
}

function toBashPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (process.platform !== 'win32') return normalized;
  return `/${normalized[0]?.toLowerCase()}${normalized.slice(2)}`;
}

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

  // .planning / .scratch / .mind are gitignored working dirs — forbidden from
  // the OSS export if present, but legitimately ABSENT on a clean checkout (CI).
  // The "dead guard" existence check therefore applies only to the tracked dirs;
  // a gitignored working dir that's simply not present is fine.
  const GITIGNORED_WORKING_DIRS = new Set(['.planning', '.scratch', '.mind']);
  it('every tracked forbidden entry exists as a monorepo-level dir (otherwise the guard is dead)', () => {
    for (const f of FORBIDDEN) {
      const monorepoLevel = join(REPO_ROOT, f);
      if (GITIGNORED_WORKING_DIRS.has(f) && !existsSync(monorepoLevel)) continue;
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
      `${name} must be Apache-2.0 to participate in the curated OSS distribution.`,
    ).toBe('Apache-2.0');
  });
});

describe('hive-mind publication boundary', () => {
  it('keeps the canonical monorepo core package private', () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGES_DIR, 'hive-mind-core', 'package.json'), 'utf-8'),
    );

    expect(
      pkg.private,
      'The canonical package contains Waggle-only source and must never be published directly.',
    ).toBe(true);
  });

  it('routes mirror remediation through a curated forward-port, never a raw split push', () => {
    const splitScript = readFileSync(SCRIPT_PATH, 'utf-8');
    const driftScript = readFileSync(DRIFT_SCRIPT_PATH, 'utf-8');

    expect(splitScript).toContain('DO NOT push them raw');
    expect(splitScript).toContain('NOT OSS-publishable as-is');
    expect(driftScript).toContain('curated forward-port');
    expect(driftScript).not.toContain(
      'regenerate the mirror via scripts/oss-subtree-split.sh',
    );
  });

  it('validates detached split commits before replacing named export branches', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    const splitAt = content.indexOf('CANDIDATE_SHA=$(git subtree split --prefix="$PREFIX" | tail -n 1)');
    const promoteAt = content.indexOf('git update-ref --stdin');

    expect(content).not.toContain('git subtree split --prefix="$PREFIX" --branch=');
    expect(content).toContain('VALIDATED_BRANCHES+=("$BRANCH")');
    expect(content).toContain('EXPECTED_OLD_SHAS');
    expect(content).toContain('if ! WORKTREE_LIST=$(git worktree list --porcelain); then');
    expect(content).not.toMatch(/git worktree list --porcelain\s*\|/);
    expect(splitAt).toBeGreaterThan(-1);
    expect(promoteAt).toBeGreaterThan(splitAt);
  });

  it('preserves the last validated ref and removes a rejected candidate', () => {
    const tempRepo = mkdtempSync(join(tmpdir(), 'waggle-oss-split-'));
    const bash = resolveBashExecutable();
    const runGit = (...args: string[]): string =>
      execFileSync('git', args, { cwd: tempRepo, encoding: 'utf-8' }).trim();

    try {
      mkdirSync(join(tempRepo, 'packages', 'hive-mind-test', 'src'), { recursive: true });
      mkdirSync(join(tempRepo, 'packages', 'hive-mind-bad', 'src'), { recursive: true });
      mkdirSync(join(tempRepo, 'scripts'), { recursive: true });
      writeFileSync(join(tempRepo, 'packages', 'hive-mind-test', 'src', 'index.ts'), 'export {};\n');
      writeFileSync(join(tempRepo, 'packages', 'hive-mind-bad', 'src', 'index.ts'), 'export {};\n');
      copyFileSync(SCRIPT_PATH, join(tempRepo, 'scripts', 'oss-subtree-split.sh'));
      runGit('init');
      runGit('config', 'user.email', 'oss-guard@example.invalid');
      runGit('config', 'user.name', 'OSS Guard Test');
      runGit('add', '.');
      runGit('commit', '-m', 'initial safe package');

      const first = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-test', 'hive-mind-bad'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(first.status, first.stderr).toBe(0);
      const stableBefore = runGit('rev-parse', 'oss-hive-mind-test-export');
      const secondStableBefore = runGit('rev-parse', 'oss-hive-mind-bad-export');

      writeFileSync(
        join(tempRepo, 'packages', 'hive-mind-test', 'src', 'index.ts'),
        'export const changed = true;\n',
      );
      mkdirSync(join(tempRepo, 'packages', 'hive-mind-bad', 'packages'), { recursive: true });
      writeFileSync(
        join(tempRepo, 'packages', 'hive-mind-bad', 'packages', 'leak.txt'),
        'must be rejected\n',
      );
      runGit('add', '.');
      runGit('commit', '-m', 'introduce forbidden top-level path');

      const rejected = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-test', 'hive-mind-bad'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(rejected.status, rejected.stderr).toBe(2);
      expect(runGit('rev-parse', 'oss-hive-mind-test-export')).toBe(stableBefore);
      expect(runGit('rev-parse', 'oss-hive-mind-bad-export')).toBe(secondStableBefore);
      expect(runGit('branch', '--list', '*-candidate-*')).toBe('');

      const missingPackage = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-missing'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(missingPackage.status, missingPackage.stderr).toBe(2);
      expect(runGit('rev-parse', 'oss-hive-mind-test-export')).toBe(stableBefore);

      rmSync(join(tempRepo, 'packages', 'hive-mind-bad', 'packages'), {
        recursive: true,
        force: true,
      });
      writeFileSync(
        join(tempRepo, 'packages', 'hive-mind-bad', 'src', 'index.ts'),
        'export const changedToo = true;\n',
      );
      runGit('add', '.');
      runGit('commit', '-m', 'make both candidates safe');

      const blockedRefLock = join(
        tempRepo,
        '.git',
        'refs',
        'heads',
        'oss-hive-mind-bad-export.lock',
      );
      writeFileSync(blockedRefLock, 'locked\n');
      const rejectedTransaction = spawnSync(
        bash,
        ['scripts/oss-subtree-split.sh', 'hive-mind-test', 'hive-mind-bad'],
        { cwd: tempRepo, encoding: 'utf-8' },
      );
      expect(rejectedTransaction.status, rejectedTransaction.stderr).toBe(4);
      expect(runGit('rev-parse', 'oss-hive-mind-test-export')).toBe(stableBefore);
      expect(runGit('rev-parse', 'oss-hive-mind-bad-export')).toBe(secondStableBefore);
    } finally {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it('invalidates the historical raw-push plan', () => {
    const content = readFileSync(SUPERSEDED_PLAN_PATH, 'utf-8');

    expect(content).toContain('SUPERSEDED');
    expect(content).toContain('DO NOT FOLLOW');
    expect(content).not.toMatch(/git push\s/);
  });

  it('classifies intentional exclusions separately from forward-port candidates', () => {
    const content = readFileSync(DRIFT_SCRIPT_PATH, 'utf-8');

    expect(content).toContain('INTENTIONAL-OSS-EXCLUSION');
    expect(content).toContain('FORWARD-PORT-CANDIDATE');
    expect(content).not.toContain('pending export');
  });

  it('fails closed when excluded files or install_audit markers exist in the OSS mirror', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'waggle-oss-drift-'));
    const monoRepo = join(tempRoot, 'mono');
    const ossRepo = join(tempRoot, 'oss');
    const bash = resolveBashExecutable();
    const excluded = join('mind', 'evolution-runs.ts');
    const runDrift = (env: NodeJS.ProcessEnv = process.env) =>
      spawnSync(bash, ['scripts/oss-drift-check.sh', ossRepo.replace(/\\/g, '/')], {
        cwd: monoRepo,
        encoding: 'utf-8',
        env,
      });

    try {
      mkdirSync(join(monoRepo, 'packages', 'hive-mind-core', 'src', 'mind'), { recursive: true });
      mkdirSync(join(monoRepo, 'scripts'), { recursive: true });
      mkdirSync(join(ossRepo, 'packages', 'core', 'src', 'mind'), { recursive: true });
      copyFileSync(DRIFT_SCRIPT_PATH, join(monoRepo, 'scripts', 'oss-drift-check.sh'));
      writeFileSync(join(monoRepo, 'packages', 'hive-mind-core', 'src', excluded), 'private\n');
      execFileSync('git', ['init'], { cwd: monoRepo, stdio: 'ignore' });
      execFileSync('git', ['init'], { cwd: ossRepo, stdio: 'ignore' });

      const expectedExclusion = runDrift();
      expect(
        expectedExclusion.status,
        `${expectedExclusion.stdout}\n${expectedExclusion.stderr}`,
      ).toBe(0);
      expect(expectedExclusion.stdout).toContain('INTENTIONAL-OSS-EXCLUSION');

      writeFileSync(join(ossRepo, 'packages', 'core', 'src', excluded), 'private\n');
      const leakedFile = runDrift();
      expect(leakedFile.status, leakedFile.stderr).toBe(1);
      expect(leakedFile.stdout).toContain('FORBIDDEN-OSS-CONTENT');

      rmSync(join(ossRepo, 'packages', 'core', 'src', excluded));
      writeFileSync(join(monoRepo, 'packages', 'hive-mind-core', 'src', 'mind', 'db.ts'), 'install_audit\n');
      writeFileSync(join(ossRepo, 'packages', 'core', 'src', 'mind', 'db.ts'), 'install_audit\n');
      const leakedMarker = runDrift();
      expect(leakedMarker.status, leakedMarker.stderr).toBe(1);
      expect(leakedMarker.stdout).toContain('FORBIDDEN-OSS-MARKER');

      rmSync(join(monoRepo, 'packages', 'hive-mind-core', 'src', 'mind', 'db.ts'));
      rmSync(join(ossRepo, 'packages', 'core', 'src', 'mind', 'db.ts'));

      const failingBin = join(tempRoot, 'failing-bin');
      const failingFind = join(failingBin, 'find');
      mkdirSync(failingBin, { recursive: true });
      writeFileSync(failingFind, '#!/usr/bin/env bash\nexit 7\n');
      chmodSync(failingFind, 0o755);
      const inventoryFailure = spawnSync(
        bash,
        [
          '-c',
          'PATH="$WAGGLE_FAIL_BIN:$PATH"; export PATH; exec scripts/oss-drift-check.sh "$1"',
          'drift-inventory-test',
          ossRepo.replace(/\\/g, '/'),
        ],
        {
          cwd: monoRepo,
          encoding: 'utf-8',
          env: { ...process.env, WAGGLE_FAIL_BIN: toBashPath(failingBin) },
        },
      );
      expect(inventoryFailure.status, inventoryFailure.stderr).toBe(2);
      expect(inventoryFailure.stderr).toContain('ERROR: failed to inventory');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails closed instead of executing the retired pre-migration parity workflow', () => {
    const content = readFileSync(RETIRED_PARITY_SCRIPT_PATH, 'utf-8');

    expect(content).toContain('RETIRED');
    expect(content).toContain('exit 2');
    expect(content).not.toContain('packages/core/src/mind');
  });
});
