/**
 * Responsive layout utility tests.
 */
import { describe, it, expect } from 'vitest';
import {
  BREAKPOINTS,
  getLayoutMode,
  shouldShowSidebar,
  shouldCollapseSidebar,
  getContentMaxWidth,
  getSidebarWidth,
} from '../../src/components/layout/responsive-utils.js';

// ── BREAKPOINTS constant ─────────────────────────────────────────────

describe('BREAKPOINTS', () => {
  it('has expected values', () => {
    expect(BREAKPOINTS.compact).toBe(800);
    expect(BREAKPOINTS.medium).toBe(1024);
    expect(BREAKPOINTS.wide).toBe(1440);
    expect(BREAKPOINTS.ultrawide).toBe(1920);
  });
});

// ── getLayoutMode ────────────────────────────────────────────────────

describe('getLayoutMode', () => {
  it('returns compact for small widths', () => {
    expect(getLayoutMode(640)).toBe('compact');
    expect(getLayoutMode(799)).toBe('compact');
  });

  it('returns compact at exactly 800 (below medium)', () => {
    expect(getLayoutMode(800)).toBe('compact');
  });

  it('returns medium at exactly 1024', () => {
    expect(getLayoutMode(1024)).toBe('medium');
  });

  it('returns medium between 1024 and 1439', () => {
    expect(getLayoutMode(1280)).toBe('medium');
  });

  it('returns wide at exactly 1440', () => {
    expect(getLayoutMode(1440)).toBe('wide');
  });

  it('returns wide between 1440 and 1919', () => {
    expect(getLayoutMode(1600)).toBe('wide');
  });

  it('returns ultrawide at exactly 1920', () => {
    expect(getLayoutMode(1920)).toBe('ultrawide');
  });

  it('returns ultrawide for very large widths', () => {
    expect(getLayoutMode(3840)).toBe('ultrawide');
  });
});

// ── shouldShowSidebar ────────────────────────────────────────────────

describe('shouldShowSidebar', () => {
  it('hides sidebar below compact breakpoint', () => {
    expect(shouldShowSidebar(640)).toBe(false);
    expect(shouldShowSidebar(799)).toBe(false);
  });

  it('shows sidebar at compact breakpoint (collapsed icon mode)', () => {
    expect(shouldShowSidebar(800)).toBe(true);
    expect(shouldShowSidebar(1023)).toBe(true);
  });

  it('shows sidebar at medium breakpoint and above', () => {
    expect(shouldShowSidebar(1024)).toBe(true);
    expect(shouldShowSidebar(1440)).toBe(true);
    expect(shouldShowSidebar(1920)).toBe(true);
  });
});

// ── shouldCollapseSidebar ────────────────────────────────────────────

describe('shouldCollapseSidebar', () => {
  it('does not collapse below compact (sidebar hidden entirely)', () => {
    expect(shouldCollapseSidebar(640)).toBe(false);
    expect(shouldCollapseSidebar(799)).toBe(false);
  });

  it('collapses in compact range (800-1023)', () => {
    expect(shouldCollapseSidebar(800)).toBe(true);
    expect(shouldCollapseSidebar(1023)).toBe(true);
  });

  it('does not collapse at medium (fully expanded)', () => {
    expect(shouldCollapseSidebar(1024)).toBe(false);
  });

  it('does not collapse above medium', () => {
    expect(shouldCollapseSidebar(1920)).toBe(false);
  });
});

// ── getContentMaxWidth ───────────────────────────────────────────────

describe('getContentMaxWidth', () => {
  it('returns 760 for compact', () => {
    expect(getContentMaxWidth('compact')).toBe(760);
  });

  it('returns 720 for medium', () => {
    expect(getContentMaxWidth('medium')).toBe(720);
  });

  it('returns 960 for wide', () => {
    expect(getContentMaxWidth('wide')).toBe(960);
  });

  it('returns 1200 for ultrawide', () => {
    expect(getContentMaxWidth('ultrawide')).toBe(1200);
  });
});

// ── getSidebarWidth ──────────────────────────────────────────────────

describe('getSidebarWidth', () => {
  it('returns 48 for compact (icon-only sidebar)', () => {
    expect(getSidebarWidth('compact')).toBe(48);
  });

  it('returns 240 for medium', () => {
    expect(getSidebarWidth('medium')).toBe(240);
  });

  it('returns 280 for wide', () => {
    expect(getSidebarWidth('wide')).toBe(280);
  });

  it('returns 320 for ultrawide', () => {
    expect(getSidebarWidth('ultrawide')).toBe(320);
  });
});
