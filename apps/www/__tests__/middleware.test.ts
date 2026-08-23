import { describe, expect, it } from 'vitest';
import { config } from '../proxy';

describe('www Clerk proxy boundary', () => {
  it('protects only identity and server-owned flows', () => {
    expect(config.matcher).toEqual([
      '/account(.*)',
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/(api|trpc)(.*)',
    ]);
  });
});
