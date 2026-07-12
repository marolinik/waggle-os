import { describe, expect, it } from 'vitest';
import { config } from '../middleware';

describe('www Clerk middleware boundary', () => {
  it('protects only identity and server-owned flows', () => {
    expect(config.matcher).toEqual([
      '/account(.*)',
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/(api|trpc)(.*)',
    ]);
  });
});
