/**
 * H-06 · CR-2 · Residual hive-950 token guard.
 *
 * Guards against accidental reintroduction of direct hex / utility-class
 * references to `hive-950` inside apps/web/src components. The token
 * itself is legitimate — it is defined per theme in
 * `apps/web/src/index.css` (dark: #08090c, light: #fdfcf9) and consumed
 * via `var(--hive-950)` in `waggle-theme.css`. Components must go
 * through the semantic layer, never directly.
 *
 * This replaces the manual `grep -r "hive-950|#08090c"` sweep the backlog
 * describes (CR-2) with a CI-enforceable static check.
 */
import { describe, it, expect } from 'vitest';
import fg from 'fast-glob';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const WEB_SRC = resolve(REPO_ROOT, 'apps/web/src');

/** Files that are allowed to reference `hive-950` or `#08090c` directly. */
const ALLOW_LIST = new Set([
  'apps/web/src/index.css', //         token definitions per theme
  'apps/web/src/waggle-theme.css', //  consumes var(--hive-950)
].map(p => p.replace(/\//g, '\\')));

/** Normalise to repo-relative path with OS-native separators for ALLOW_LIST lookup. */
function asRepoPath(absolute: string): string {
  return relative(REPO_ROOT, absolute);
}

describe('CR-2 · hive-950 token discipline', () => {
  it('no .tsx / .ts file outside the allow-list contains the #08090c hex literal', async () => {
    const files = await fg(['**/*.{ts,tsx}'], {
      cwd: WEB_SRC,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    });

    const violations: Array<{ file: string; line: number; text: string }> = [];
    for (const file of files) {
      const relPath = asRepoPath(file);
      if (ALLOW_LIST.has(relPath) || ALLOW_LIST.has(relPath.replace(/\\/g, '/'))) continue;
      const content = readFileSync(file, 'utf-8');
      content.split(/\r?\n/).forEach((line, idx) => {
        // Anchor on a quote or `#` character to avoid flagging comments
        // that merely mention `08090c` in prose. This is the same
        // false-positive the manual grep rule would hit.
        if (/['"#]08090c/i.test(line)) {
          violations.push({ file: relPath, line: idx + 1, text: line.trim() });
        }
      });
    }

    expect(violations, `Direct #08090c usage outside allow-list: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });

  it('no .tsx file uses a hive-950 utility class inside className', async () => {
    const files = await fg(['**/*.tsx'], {
      cwd: WEB_SRC,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    const violations: Array<{ file: string; line: number; text: string }> = [];
    for (const file of files) {
      const relPath = asRepoPath(file);
      const content = readFileSync(file, 'utf-8');
      content.split(/\r?\n/).forEach((line, idx) => {
        // `bg-hive-950`, `text-hive-950`, `border-hive-950`, `to-hive-950`,
        // etc. Anything of shape `<prefix>-hive-950`.
        if (/\b(?:bg|text|border|from|to|via|ring|fill|stroke|divide|shadow|outline)-hive-950\b/.test(line)) {
          violations.push({ file: relPath, line: idx + 1, text: line.trim() });
        }
      });
    }

    expect(violations, `Raw hive-950 utility class in component: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });

  it('CSS files outside the allow-list do not redeclare --hive-950 or use #08090c hex', async () => {
    const files = await fg(['**/*.css'], {
      cwd: WEB_SRC,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    const violations: Array<{ file: string; line: number; text: string }> = [];
    for (const file of files) {
      const relPath = asRepoPath(file);
      if (ALLOW_LIST.has(relPath) || ALLOW_LIST.has(relPath.replace(/\\/g, '/'))) continue;
      const content = readFileSync(file, 'utf-8');
      content.split(/\r?\n/).forEach((line, idx) => {
        if (/--hive-950\s*:/.test(line) || /#08090c/i.test(line)) {
          violations.push({ file: relPath, line: idx + 1, text: line.trim() });
        }
      });
    }

    expect(violations, `Hive-950 declared / hex-used outside allow-list: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });
});
