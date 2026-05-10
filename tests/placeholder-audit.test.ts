/**
 * L-17 · production-path placeholder-marker count guard.
 *
 * Prevents silent drift of `// TODO:` / `// MOCK:` / `// FIXME:` /
 * `// XXX:` comments in production code. Current count is pinned to
 * the audit at docs/plans/L-17-placeholder-audit-2026-04-19.md — a
 * contributor adding a new marker must categorise it in that doc and
 * update the pinned count here in the same commit.
 *
 * Test directories, type-declaration files, and build outputs are
 * excluded. HTML `placeholder="..."` attributes are excluded via the
 * regex — only line-comment / block-comment forms match.
 */
import { describe, it, expect } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

/**
 * The pinned count from the 2026-04-19 audit. History:
 * - 2026-05-08: 10 → 0 (DAY0V-01 + DAY0V-02 cleanup; WS gateway TODO removed
 *   + mock-channel-connectors.ts deleted)
 * - 2026-05-10: 0 → 6 (Phase 2 consolidation merge of
 *   feature/hive-mind-monorepo-migration; 6 subtree-split hook packages
 *   carry intentional `// TODO: Wave 2/3 implementation` STUB markers)
 *
 * Update this when the audit doc is bumped; NEVER bump it without documenting
 * the new hit in docs/plans/L-17-placeholder-audit-2026-04-19.md.
 */
const EXPECTED_MARKER_COUNT = 6;

const MARKER_REGEX = /\/\/\s*(?:MOCK|TODO|FIXME|XXX):|\/\*\s*(?:MOCK|TODO|FIXME|XXX):/g;

describe('L-17 · placeholder marker guard', () => {
  it(`production-path TODO/MOCK/FIXME/XXX count is stable at ${EXPECTED_MARKER_COUNT}`, async () => {
    const files = await fg(
      ['apps/web/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      {
        cwd: REPO_ROOT,
        absolute: true,
        ignore: [
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.d.ts',
          '**/node_modules/**',
          '**/dist/**',
          '**/__tests__/**',
        ],
      },
    );

    let total = 0;
    const breakdown: Array<{ file: string; count: number }> = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const matches = content.match(MARKER_REGEX);
      if (!matches || matches.length === 0) continue;
      const relative = file.replace(REPO_ROOT, '').replace(/\\/g, '/');
      breakdown.push({ file: relative, count: matches.length });
      total += matches.length;
    }

    expect(
      total,
      `Expected ${EXPECTED_MARKER_COUNT} production-path placeholder markers; ` +
        `found ${total}. Update docs/plans/L-17-placeholder-audit-2026-04-19.md ` +
        `and bump EXPECTED_MARKER_COUNT in this test.\n\n` +
        `Breakdown:\n${breakdown.map(b => `  ${b.file} : ${b.count}`).join('\n')}`,
    ).toBe(EXPECTED_MARKER_COUNT);
  });
});
