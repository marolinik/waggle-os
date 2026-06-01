/**
 * AI-OS Phase 4 — HOOKS_COHORT regression (R8-001 / R8-002 / R8-003).
 *
 * Bug (R8-001): hook install/verify/uninstall was gated on LAUNCH_COHORT
 * (all 7 tools), but at the time only @waggle/hive-mind-hooks-claude-code
 * shipped a `bin`; the other hook packages were Wave 2/3 `export {}` stubs
 * with no bin, so `npx @waggle/hive-mind-hooks-<id>` ALWAYS failed for the
 * user. HOOKS_COHORT fixed this by gating hook actions on the tools whose
 * package actually ships a bin. The cohort has since grown as Tier-A/B
 * packages landed (claude-code, codex, codex-desktop, cursor, hermes).
 *
 * The existing tool-launcher tests mock execCapture and only assert the
 * npx command SHAPE, so the binless-stub failure was invisible. These
 * are STATIC tests that:
 *   1. ground HOOKS_COHORT against the real on-disk hook packages
 *      (a tool is hook-capable iff its package.json declares a bin),
 *   2. prove runHookCommand REFUSES stub tools without invoking npx,
 *   3. prove the real targets still route through.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  runHookCommand,
  HOOKS_COHORT,
  type ToolLauncherDeps,
} from '../src/tool-launcher.js';
import { SUPPORTED_TOOLS, LAUNCH_COHORT, type ToolId } from '@waggle/shared';

// packages/agent/tests → packages/
const PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function hookPackageHasBin(id: ToolId): boolean {
  const pkgPath = join(PACKAGES_DIR, `hive-mind-hooks-${id}`, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin?: unknown };
  return pkg.bin != null && Object.keys(pkg.bin as object).length > 0;
}

describe('HOOKS_COHORT grounding (R8-001)', () => {
  it('contains ONLY tools whose hook package ships a real bin', () => {
    for (const id of HOOKS_COHORT) {
      expect(
        hookPackageHasBin(id),
        `${id} is in HOOKS_COHORT but its hook package has no bin`,
      ).toBe(true);
    }
  });

  it('contains every tool that DOES ship a real hook bin (no real target dropped)', () => {
    const realTargets = SUPPORTED_TOOLS.filter((id) => hookPackageHasBin(id));
    expect([...HOOKS_COHORT].sort()).toEqual([...realTargets].sort());
  });

  it('matches the current real-bin cohort (snapshot tripwire)', () => {
    expect([...HOOKS_COHORT].sort()).toEqual(['claude-code', 'codex', 'codex-desktop', 'cursor', 'hermes']);
  });

  it('is a strict subset of LAUNCH_COHORT (all hook targets are launchable, not vice-versa)', () => {
    for (const id of HOOKS_COHORT) {
      expect(LAUNCH_COHORT).toContain(id);
    }
    expect(HOOKS_COHORT.length).toBeLessThan(LAUNCH_COHORT.length);
  });
});

describe('runHookCommand refuses binless stub tools (R8-002)', () => {
  // Every supported tool that is NOT a real hook target. npx against
  // these packages would fail for the user, so the command must be
  // refused BEFORE exec rather than shelling out and surfacing a
  // confusing npx error.
  const stubTools = SUPPORTED_TOOLS.filter((id) => !HOOKS_COHORT.includes(id));

  it.each(stubTools)(
    'does not invoke npx and returns a clear error for stub tool %s',
    async (id) => {
      let invoked = false;
      const execCapture: NonNullable<ToolLauncherDeps['execCapture']> =
        async () => {
          invoked = true;
          return { stdout: 'ok', stderr: '', code: 0 };
        };
      const result = await runHookCommand({
        id,
        action: 'install',
        deps: { execCapture },
      });
      expect(invoked, `npx must NOT be invoked for binless stub ${id}`).toBe(
        false,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/not supported|claude-code/i);
    },
  );

  it.each(stubTools)(
    'refuses every hook action (verify) for stub tool %s, even though it is launchable',
    async (id) => {
      let invoked = false;
      const execCapture: NonNullable<ToolLauncherDeps['execCapture']> =
        async () => {
          invoked = true;
          return { stdout: 'ok', stderr: '', code: 0 };
        };
      const result = await runHookCommand({
        id,
        action: 'verify',
        deps: { execCapture },
      });
      expect(invoked).toBe(false);
      expect(result.ok).toBe(false);
    },
  );
});

describe('runHookCommand still routes the real target (regression guard)', () => {
  it('invokes npx for claude-code install', async () => {
    const calls: string[][] = [];
    const execCapture: NonNullable<ToolLauncherDeps['execCapture']> = async (
      _binary,
      args,
    ) => {
      calls.push(args);
      return { stdout: 'Done.', stderr: '', code: 0 };
    };
    const result = await runHookCommand({
      id: 'claude-code',
      action: 'install',
      deps: { execCapture },
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-claude-code',
      'install',
    ]);
  });
});
