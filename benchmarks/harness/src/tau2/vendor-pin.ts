/**
 * τ²-bench vendoring pin — single source of truth for the pinned commit,
 * repo URL, and license. The vendoring probe (vendor-pin.test.ts) re-asserts
 * the vendored checkout matches these constants so a drifted re-vendor fails.
 *
 * License: τ²-bench (sierra-research/tau2-bench) is MIT (repo LICENSE +
 * leaderboard footer, verified 2026-06-16). Redistribution of the vendored
 * tree must retain the MIT LICENSE file (D6 — clarify license before
 * redistribution; clarified = MIT).
 *
 * Determinism: pure constants + filesystem readers. No network at import.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Sierra τ²-bench upstream. */
export const TAU2_REPO_URL = 'https://github.com/sierra-research/tau2-bench';

/**
 * Pinned commit. Verified HEAD of sierra-research/tau2-bench on 2026-06-16
 * ("feat: make review model configurable (#346)"). The vendored checkout under
 * benchmarks/tau2/upstream is checked out at this exact SHA; the checkout test
 * below re-asserts it. To re-vendor, run scripts/vendor.sh and paste the printed
 * SHA here (and into VENDOR.md).
 */
export const TAU2_PINNED_COMMIT = '5ebebbe827b455b3ed04fcb9294235c6ef4e5fd6';

/** SPDX id of the upstream license. */
export const TAU2_LICENSE_SPDX = 'MIT';

/** Absolute path to the vendored upstream tree, given the harness root. */
export function resolveUpstreamDir(harnessRoot: string): string {
  // harnessRoot = benchmarks/harness; upstream lives at benchmarks/tau2/upstream
  return path.resolve(harnessRoot, '..', 'tau2', 'upstream');
}

/** Reads the vendored checkout's HEAD commit SHA (full 40-hex). Throws if the
 *  directory is not a git checkout. */
export function readVendoredCommit(upstreamDir: string): string {
  if (!fs.existsSync(path.join(upstreamDir, '.git'))) {
    throw new Error(`τ² upstream at ${upstreamDir} is not a git checkout (no .git dir)`);
  }
  const out = execFileSync('git', ['-C', upstreamDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  });
  return out.trim();
}

/** Asserts the vendored tree carries an MIT LICENSE. Throws otherwise. */
export function assertVendoredLicense(upstreamDir: string): void {
  const licensePath = path.join(upstreamDir, 'LICENSE');
  if (!fs.existsSync(licensePath)) {
    throw new Error(
      `τ² vendored LICENSE not found at ${licensePath} — refuse to use an ` +
      `unlicensed checkout (expected ${TAU2_LICENSE_SPDX}).`,
    );
  }
  const text = fs.readFileSync(licensePath, 'utf-8');
  if (!/\bMIT\b/i.test(text) && !/Permission is hereby granted, free of charge/i.test(text)) {
    throw new Error(
      `τ² vendored LICENSE at ${licensePath} does not look like ${TAU2_LICENSE_SPDX} ` +
      `(no "MIT" token nor the canonical MIT grant clause found).`,
    );
  }
}
