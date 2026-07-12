import { describe, it, expect } from 'vitest';
import { buildCommandCatalog } from './command-catalog';

describe('command catalog watch-agent (#4)', () => {
  it('includes a "Watch a coding agent live" entry deep-linking to watch mode', () => {
    const groups = buildCommandCatalog({ chatHref: '/chat', isPro: false, billingRank: 0 });
    const all = groups.flatMap((g) => g.items);
    const watch = all.find((i) => i.id === 'watch-agent');
    expect(watch).toBeTruthy();
    expect(watch!.name).toMatch(/watch a coding agent live/i);
    expect(watch!.to).toBe('/launcher?watch=1');
    expect(watch!.group).toBe('do');
  });

  it('labels the pinned group without legacy Pro copy', () => {
    const groups = buildCommandCatalog({ chatHref: '/chat', isPro: true, billingRank: 3 });
    const pinned = groups.find((g) => g.key === 'pinned');
    expect(pinned).toBeTruthy();
    expect(pinned!.heading).toBe('Pinned');
    expect(pinned!.heading).not.toMatch(/pro/i);
  });
});
