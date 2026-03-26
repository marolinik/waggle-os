import { describe, it, expect } from 'vitest';
import { checkResponseQuality } from '../src/quality-controller.js';

describe('Quality Controller', () => {
  it('passes concise responses', () => {
    expect(checkResponseQuality('The answer is 42.')).toHaveLength(0);
  });

  it('flags overly verbose responses', () => {
    const verbose = Array(20).fill('This is a long sentence with lots of filler.').join('\n');
    const issues = checkResponseQuality(verbose);
    expect(issues.some(i => i.type === 'verbose')).toBe(true);
  });

  it('flags emoji spam', () => {
    const issues = checkResponseQuality('Great! \u{1F389}\u{1F680}\u{2728}\u{1F31F}\u{1F4A1}');
    expect(issues.some(i => i.type === 'emoji_spam')).toBe(true);
  });

  it('flags generic filler phrases', () => {
    const issues = checkResponseQuality("That's a great question! I'd be happy to help.");
    expect(issues.some(i => i.type === 'filler')).toBe(true);
  });

  it('flags bullet point overuse', () => {
    const bullets = Array(8).fill('- Point here').join('\n');
    expect(checkResponseQuality(bullets).some(i => i.type === 'too_many_bullets')).toBe(true);
  });
});
