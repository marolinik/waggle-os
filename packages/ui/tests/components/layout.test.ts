/**
 * Common components + layout tests.
 *
 * Tests utility functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import {
  formatTokenCount,
  formatCost,
  getSavedTheme,
  toggleThemeValue,
  Sidebar,
  Tabs,
  StatusBar,
  Modal,
  ThemeProvider,
  ThemeContext,
  useTheme,
  AppShell,
} from '../../src/index.js';
import type { Tab, Theme } from '../../src/index.js';

// ── formatTokenCount ────────────────────────────────────────────────

describe('formatTokenCount', () => {
  it('returns raw number for <1000', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(42)).toBe('42');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats thousands as Xk', () => {
    expect(formatTokenCount(1000)).toBe('1.0k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(45678)).toBe('45.7k');
    expect(formatTokenCount(999999)).toBe('1000.0k');
  });

  it('formats millions as XM', () => {
    expect(formatTokenCount(1000000)).toBe('1.0M');
    expect(formatTokenCount(2500000)).toBe('2.5M');
    expect(formatTokenCount(12345678)).toBe('12.3M');
  });
});

// ── formatCost ──────────────────────────────────────────────────────

describe('formatCost', () => {
  it('formats sub-cent amounts with cent symbol', () => {
    expect(formatCost(0)).toBe('0.0\u00A2');
    expect(formatCost(0.005)).toBe('0.5\u00A2');
    expect(formatCost(0.0099)).toBe('1.0\u00A2');
  });

  it('formats dollar amounts with 2 decimal places', () => {
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(0.123)).toBe('$0.12');
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(42.999)).toBe('$43.00');
  });

  it('formats large amounts with rounding', () => {
    expect(formatCost(100)).toBe('~$100');
    expect(formatCost(234.56)).toBe('~$235');
  });
});

// ── Theme helpers ───────────────────────────────────────────────────

describe('getSavedTheme', () => {
  it('returns dark as default when no storage', () => {
    // Pass a mock storage that has no item
    const mockStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage;
    expect(getSavedTheme(mockStorage)).toBe('dark');
  });

  it('returns saved light theme', () => {
    const mockStorage = {
      getItem: (key: string) => key === 'waggle-theme' ? 'light' : null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage;
    expect(getSavedTheme(mockStorage)).toBe('light');
  });

  it('returns dark for invalid saved value', () => {
    const mockStorage = {
      getItem: () => 'invalid',
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as Storage;
    expect(getSavedTheme(mockStorage)).toBe('dark');
  });
});

describe('toggleThemeValue', () => {
  it('toggles dark to light', () => {
    expect(toggleThemeValue('dark')).toBe('light');
  });

  it('toggles light to dark', () => {
    expect(toggleThemeValue('light')).toBe('dark');
  });
});

// ── Tab type ────────────────────────────────────────────────────────

describe('Tab interface', () => {
  it('supports required fields', () => {
    const tab: Tab = { id: '1', label: 'Chat' };
    expect(tab.id).toBe('1');
    expect(tab.label).toBe('Chat');
    expect(tab.icon).toBeUndefined();
  });

  it('supports optional icon', () => {
    const tab: Tab = { id: '2', label: 'Code', icon: '\u{1F4DD}' };
    expect(tab.icon).toBe('\u{1F4DD}');
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('common component exports', () => {
  it('exports Sidebar as a function', () => {
    expect(typeof Sidebar).toBe('function');
  });

  it('exports Tabs as a function', () => {
    expect(typeof Tabs).toBe('function');
  });

  it('exports StatusBar as a function', () => {
    // StatusBar may be wrapped in React.memo (returns object)
    expect(['function', 'object']).toContain(typeof StatusBar);
  });

  it('exports Modal as a function', () => {
    expect(typeof Modal).toBe('function');
  });

  it('exports ThemeProvider as a function', () => {
    expect(typeof ThemeProvider).toBe('function');
  });

  it('exports ThemeContext as an object', () => {
    expect(ThemeContext).toBeDefined();
  });

  it('exports useTheme as a function', () => {
    expect(typeof useTheme).toBe('function');
  });
});

describe('layout component exports', () => {
  it('exports AppShell as a function', () => {
    expect(typeof AppShell).toBe('function');
  });
});
