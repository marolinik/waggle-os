import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');
const sourceFilePattern = /\.(tsx?|css)$/;
const ignoredDirs = new Set(['node_modules', 'dist']);
const ambiguousMotionTokenPattern = /\b(?:duration|ease)-\[var\(--mo-[^\]]+\)\]/;

function collectSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) collectSourceFiles(fullPath, files);
      continue;
    }
    if (sourceFilePattern.test(entry)) files.push(fullPath);
  }
  return files;
}

describe('motion class hygiene', () => {
  it('defines named utilities for tokenized CSS motion timing', () => {
    const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');

    expect(css).toContain('.duration-mo-fast');
    expect(css).toContain('transition-duration: var(--mo-fast)');
    expect(css).toContain('.duration-mo-base');
    expect(css).toContain('transition-duration: var(--mo-base)');
    expect(css).toContain('.ease-mo');
    expect(css).toContain('transition-timing-function: var(--mo-ease)');
  });

  it('uses named motion utilities instead of Tailwind-ambiguous arbitrary motion tokens', () => {
    const offenders = collectSourceFiles(sourceRoot).flatMap(file => {
      const text = readFileSync(file, 'utf8');
      return text
        .split(/\r?\n/)
        .map((line, index) => ({ file, line, index: index + 1 }))
        .filter(({ line }) => ambiguousMotionTokenPattern.test(line));
    });

    expect(offenders).toEqual([]);
  });
});
