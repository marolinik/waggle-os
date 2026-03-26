/**
 * Keyboard shortcut utility tests.
 */
import { describe, it, expect } from 'vitest';
import {
  KEYBOARD_SHORTCUTS,
  matchesShortcut,
  formatShortcut,
  matchesNamedShortcut,
} from '../../src/components/common/keyboard-utils.js';
import type { KeyCombo, KeyEventLike } from '../../src/components/common/keyboard-utils.js';

// Helper to build a mock KeyboardEvent-like object
function mkEvent(overrides: Partial<KeyEventLike> & { key: string }): KeyEventLike {
  return {
    key: overrides.key,
    ctrlKey: overrides.ctrlKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    altKey: overrides.altKey ?? false,
    metaKey: overrides.metaKey ?? false,
  };
}

// ── KEYBOARD_SHORTCUTS constant ──────────────────────────────────────

describe('KEYBOARD_SHORTCUTS', () => {
  it('contains all expected shortcut names', () => {
    const names = Object.keys(KEYBOARD_SHORTCUTS);
    expect(names).toContain('send');
    expect(names).toContain('newline');
    expect(names).toContain('closeModal');
    expect(names).toContain('toggleWorkspace');
    expect(names).toContain('newTab');
    expect(names).toContain('closeTab');
  });

  it('send is plain Enter', () => {
    expect(KEYBOARD_SHORTCUTS.send).toEqual({ key: 'Enter' });
  });

  it('newline is Shift+Enter', () => {
    expect(KEYBOARD_SHORTCUTS.newline).toEqual({ key: 'Enter', shift: true });
  });

  it('toggleWorkspace is Ctrl+Shift+W', () => {
    expect(KEYBOARD_SHORTCUTS.toggleWorkspace).toEqual({ key: 'w', ctrl: true, shift: true });
  });
});

// ── matchesShortcut ──────────────────────────────────────────────────

describe('matchesShortcut', () => {
  it('matches Enter key with no modifiers', () => {
    const combo: KeyCombo = { key: 'Enter' };
    expect(matchesShortcut(mkEvent({ key: 'Enter' }), combo)).toBe(true);
  });

  it('does not match Enter when Shift is held but not required', () => {
    const combo: KeyCombo = { key: 'Enter' };
    expect(matchesShortcut(mkEvent({ key: 'Enter', shiftKey: true }), combo)).toBe(false);
  });

  it('matches Shift+Enter', () => {
    const combo: KeyCombo = { key: 'Enter', shift: true };
    expect(matchesShortcut(mkEvent({ key: 'Enter', shiftKey: true }), combo)).toBe(true);
  });

  it('matches Ctrl+Shift+W (case-insensitive key)', () => {
    const combo: KeyCombo = { key: 'w', ctrl: true, shift: true };
    expect(matchesShortcut(mkEvent({ key: 'W', ctrlKey: true, shiftKey: true }), combo)).toBe(true);
  });

  it('rejects when wrong key', () => {
    const combo: KeyCombo = { key: 'Escape' };
    expect(matchesShortcut(mkEvent({ key: 'Enter' }), combo)).toBe(false);
  });

  it('rejects when extra modifier is pressed', () => {
    const combo: KeyCombo = { key: 't', ctrl: true };
    expect(matchesShortcut(mkEvent({ key: 't', ctrlKey: true, altKey: true }), combo)).toBe(false);
  });

  it('rejects when required modifier is missing', () => {
    const combo: KeyCombo = { key: 'w', ctrl: true, shift: true };
    expect(matchesShortcut(mkEvent({ key: 'w', ctrlKey: true }), combo)).toBe(false);
  });

  it('handles meta key', () => {
    const combo: KeyCombo = { key: 'k', meta: true };
    expect(matchesShortcut(mkEvent({ key: 'k', metaKey: true }), combo)).toBe(true);
    expect(matchesShortcut(mkEvent({ key: 'k' }), combo)).toBe(false);
  });
});

// ── formatShortcut ───────────────────────────────────────────────────

describe('formatShortcut', () => {
  it('formats plain Enter', () => {
    expect(formatShortcut({ key: 'Enter' })).toBe('Enter');
  });

  it('formats Shift+Enter', () => {
    expect(formatShortcut({ key: 'Enter', shift: true })).toBe('Shift+Enter');
  });

  it('formats Ctrl+Shift+W', () => {
    expect(formatShortcut({ key: 'w', ctrl: true, shift: true })).toBe('Ctrl+Shift+W');
  });

  it('formats Ctrl+T', () => {
    expect(formatShortcut({ key: 't', ctrl: true })).toBe('Ctrl+T');
  });

  it('formats Escape as-is (multi-char key)', () => {
    expect(formatShortcut({ key: 'Escape' })).toBe('Escape');
  });

  it('formats Alt+Meta+X', () => {
    expect(formatShortcut({ key: 'x', alt: true, meta: true })).toBe('Alt+Meta+X');
  });

  it('orders modifiers Ctrl, Shift, Alt, Meta', () => {
    const result = formatShortcut({ key: 'a', ctrl: true, shift: true, alt: true, meta: true });
    expect(result).toBe('Ctrl+Shift+Alt+Meta+A');
  });
});

// ── matchesNamedShortcut ─────────────────────────────────────────────

describe('matchesNamedShortcut', () => {
  it('matches send shortcut', () => {
    expect(matchesNamedShortcut(mkEvent({ key: 'Enter' }), 'send')).toBe(true);
  });

  it('matches closeModal shortcut', () => {
    expect(matchesNamedShortcut(mkEvent({ key: 'Escape' }), 'closeModal')).toBe(true);
  });

  it('does not match unknown name', () => {
    expect(matchesNamedShortcut(mkEvent({ key: 'x' }), 'nonexistent' as any)).toBe(false);
  });

  it('matches closeTab (Ctrl+W)', () => {
    expect(matchesNamedShortcut(mkEvent({ key: 'w', ctrlKey: true }), 'closeTab')).toBe(true);
  });

  it('distinguishes closeTab from toggleWorkspace', () => {
    // Ctrl+W should match closeTab but NOT toggleWorkspace (which needs Shift too)
    expect(matchesNamedShortcut(mkEvent({ key: 'w', ctrlKey: true }), 'closeTab')).toBe(true);
    expect(matchesNamedShortcut(mkEvent({ key: 'w', ctrlKey: true }), 'toggleWorkspace')).toBe(false);
  });
});
