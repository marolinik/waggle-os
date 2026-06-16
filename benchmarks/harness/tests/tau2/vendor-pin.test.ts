/**
 * Vendoring probe — proves the τ²-bench checkout under benchmarks/tau2/upstream
 * is pinned to the recorded commit and carries the recorded (MIT) license.
 *
 * When the checkout is absent (fresh clone / CI without vendor step), the
 * checkout-dependent assertions SKIP rather than fail — the pure-constant
 * assertions always run so the pin metadata itself is regression-locked.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TAU2_REPO_URL,
  TAU2_PINNED_COMMIT,
  TAU2_LICENSE_SPDX,
  resolveUpstreamDir,
  readVendoredCommit,
  assertVendoredLicense,
} from '../../src/tau2/vendor-pin.js';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..', '..');
const UPSTREAM = resolveUpstreamDir(HARNESS_ROOT);

describe('vendor-pin constants', () => {
  it('pins the Sierra τ²-bench repo URL', () => {
    expect(TAU2_REPO_URL).toBe('https://github.com/sierra-research/tau2-bench');
  });

  it('records the license as MIT', () => {
    expect(TAU2_LICENSE_SPDX).toBe('MIT');
  });

  it('pins a 40-char (or 7+) lowercase hex commit', () => {
    expect(TAU2_PINNED_COMMIT).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

describe('vendored checkout (skips when absent)', () => {
  it('the vendored HEAD matches the pinned commit', () => {
    if (!fs.existsSync(path.join(UPSTREAM, '.git'))) {
      // Not vendored in this environment — pin metadata is covered above.
      return;
    }
    const head = readVendoredCommit(UPSTREAM);
    expect(head.startsWith(TAU2_PINNED_COMMIT)).toBe(true);
  });

  it('the vendored LICENSE is MIT', () => {
    if (!fs.existsSync(UPSTREAM)) return;
    expect(() => assertVendoredLicense(UPSTREAM)).not.toThrow();
  });
});

describe('assertVendoredLicense — validation', () => {
  it('throws when the LICENSE file is missing', () => {
    expect(() => assertVendoredLicense('/nonexistent/path-xyz')).toThrow(/LICENSE/);
  });
});
