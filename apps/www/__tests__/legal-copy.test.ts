import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const legalFiles = [
  'terms/page.tsx',
  'privacy/page.tsx',
  'cookies/page.tsx',
  'eu-ai-act/page.tsx',
] as const;

const launchBlockingCopy = [
  /Day-0 placeholder text/i,
  /\[Day-0 launch date\]/i,
  /to be filled before public launch/i,
  /Pro or Teams/i,
  /\[to be designated/i,
] as const;

describe('legal pages', () => {
  it('do not expose launch placeholders or retired tier copy', () => {
    for (const file of legalFiles) {
      const source = readFileSync(
        join(process.cwd(), 'app', '(legal)', file),
        'utf8',
      );

      for (const pattern of launchBlockingCopy) {
        expect(source, `${file} should not match ${pattern}`).not.toMatch(
          pattern,
        );
      }
    }
  });
});
