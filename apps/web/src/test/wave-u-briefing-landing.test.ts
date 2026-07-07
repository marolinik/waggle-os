/**
 * Wave U Lane B (item 1) — briefing interruption discipline.
 *
 * The "Catching you up" briefing must fire ONLY on true session start AND only
 * when Home is the landing surface. An in-session navigation to Home (s02:
 * Settings→Home) must never re-pop it. AppShell gates the modal on a
 * `nextBriefingLanding` state machine fed by the pathname stream; these tests
 * pin every transition of that reducer so the discipline holds without mounting
 * the shell.
 */
import { describe, it, expect, vi } from 'vitest';

// AppShell pulls the whole shell import graph; nothing runs at module load, but
// mock the two side-effect-capable leaves defensively so the import is inert.
vi.mock('@/lib/adapter', () => ({ adapter: {}, default: vi.fn() }));
vi.mock('@/lib/tauri-bindings', () => ({
  isTauri: () => false,
  isFirstLaunch: vi.fn().mockResolvedValue(false),
  markFirstLaunchComplete: vi.fn().mockResolvedValue(undefined),
}));

import { nextBriefingLanding, type BriefingLanding } from '@/components/os/AppShell';

describe('nextBriefingLanding (Wave U Lane B item 1)', () => {
  it('the bare index "/" is transitional — never decides the landing', () => {
    expect(nextBriefingLanding('pending', '/')).toBe('pending');
    expect(nextBriefingLanding('armed', '/')).toBe('armed');
    expect(nextBriefingLanding('spent', '/')).toBe('spent');
  });

  it('landing on Home arms the briefing', () => {
    expect(nextBriefingLanding('pending', '/home')).toBe('armed');
    expect(nextBriefingLanding('pending', '/home/anything')).toBe('armed');
  });

  it('landing on a non-Home surface spends it (deep link)', () => {
    expect(nextBriefingLanding('pending', '/settings')).toBe('spent');
    expect(nextBriefingLanding('pending', '/workspaces/w1/chat')).toBe('spent');
  });

  it('staying on Home keeps it armed', () => {
    expect(nextBriefingLanding('armed', '/home')).toBe('armed');
  });

  it('leaving Home spends it — a later return can never re-arm', () => {
    expect(nextBriefingLanding('armed', '/settings')).toBe('spent');
    // terminal: 'spent' is sticky no matter where the user goes next
    expect(nextBriefingLanding('spent', '/home')).toBe('spent');
    expect(nextBriefingLanding('spent', '/settings')).toBe('spent');
  });

  // Replays of the real pathname streams the gate must survive.
  const run = (steps: string[]): BriefingLanding =>
    steps.reduce<BriefingLanding>(nextBriefingLanding, 'pending');

  it('HAPPY PATH: boot "/" → "/home" arms (briefing greets on first landing)', () => {
    expect(run(['/', '/home'])).toBe('armed');
  });

  it('s02: Home landing → Settings → Home never re-arms ("double catch-up" fix)', () => {
    expect(run(['/', '/home', '/settings', '/home'])).toBe('spent');
  });

  it('DEEP LINK: land on Settings first → later Home is spent', () => {
    expect(run(['/', '/settings', '/home'])).toBe('spent');
  });
});
