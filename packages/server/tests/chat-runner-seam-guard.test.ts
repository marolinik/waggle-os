/**
 * Guard for TD-CHAT-16 ruling 1: `server.agentRunner` stays only for the
 * fleet and agent-group routes. No test file that posts to `/api/chat` may
 * install a runner. The allowlist below is a ratchet: a count may only go down, and a file whose count
 * reaches zero must leave the list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SEARCH_ROOTS = ['packages', 'tests', 'app/tests', 'apps'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
const THIS_FILE = 'packages/server/tests/chat-runner-seam-guard.test.ts';

/**
 * Runner installs each file may keep. Built from string parts so this file's
 * own source never matches the patterns it counts.
 */
const RUNNER = 'agent' + 'Runner';
const INSTALL_PATTERNS = [
  new RegExp(`\\.${RUNNER}\\s*=(?!=)\\s*(?=\\S)(?!undefined\\b|original\\w*\\b|previous\\w*\\b)`, 'g'),
  new RegExp(`decorate\\(\\s*'${RUNNER}'`, 'g'),
];

const ALLOWED_INSTALLS: Record<string, { count: number; reason: string }> = {
  'packages/server/tests/local-mode.test.ts': { count: 6, reason: 'fleet and agent-group runs (ruling 1)' },
};

function testFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : testFiles(path.join(dir, entry.name));
    return /\.test\.tsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });
}

function runnerInstalls(source: string): number {
  return INSTALL_PATTERNS.reduce((total, pattern) => total + (source.match(pattern)?.length ?? 0), 0);
}

describe('chat route test seam (TD-CHAT-16)', () => {
  const chatFiles = SEARCH_ROOTS
    .flatMap(root => testFiles(path.join(REPO_ROOT, root)))
    .map(file => ({ file: path.relative(REPO_ROOT, file).split(path.sep).join('/'), source: fs.readFileSync(file, 'utf8') }))
    .filter(({ file, source }) => file !== THIS_FILE && source.includes('/api/chat'));

  it('finds the chat route tests it guards', () => {
    expect(chatFiles.map(({ file }) => file)).toEqual(expect.arrayContaining([
      'packages/server/tests/chat-api.test.ts',
      'tests/behaviors/chat-pipeline.test.ts',
      'app/tests/e2e/chat.test.ts',
    ]));
  });

  it('lets no /api/chat test install server.agentRunner beyond the held allowlist', () => {
    const installs = Object.fromEntries(chatFiles
      .map(({ file, source }) => [file, runnerInstalls(source)] as const)
      .filter(([, count]) => count > 0));
    const allowed = Object.fromEntries(Object.entries(ALLOWED_INSTALLS).map(([file, { count }]) => [file, count]));
    expect(installs).toEqual(allowed);
  });
});
