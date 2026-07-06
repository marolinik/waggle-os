/**
 * Lane D (Wave V) — signature theme crossfade ("sunset over the hive").
 *
 * Two guarantees:
 *  1. CSS: the `.theme-transition` rule is motion-safe gated
 *     (`prefers-reduced-motion: no-preference`) and animates COLOR properties
 *     only — never a layout property (width/inset/transform), so the swap can
 *     never reflow.
 *  2. ThemeProvider stamps `.theme-transition` on <html> for a REAL swap, skips
 *     it on the initial apply (no crossfade on load), and honours reduced motion.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider, useTheme, applyStoredThemeEarly } from '@/providers/ThemeProvider';

// ── 1. CSS shape (static, browser-free) ──────────────────────────────────────
const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');

/** Body of the first `selector { ... }` rule (flat blocks — no nesting). */
function rule(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('theme crossfade — CSS shape', () => {
  const body = rule('html.theme-transition');

  it('lives inside a prefers-reduced-motion: no-preference block', () => {
    const guardIdx = css.lastIndexOf('prefers-reduced-motion: no-preference', css.indexOf('html.theme-transition'));
    expect(guardIdx).toBeGreaterThan(-1);
  });

  it('animates color-family properties only', () => {
    for (const prop of ['background-color', 'border-color', 'color', 'fill', 'stroke']) {
      expect(body).toContain(prop);
    }
  });

  it('never animates a layout property (no reflow)', () => {
    for (const layout of ['width', 'height', 'transform', 'inset', 'top:', 'left:', 'margin', 'padding']) {
      expect(body).not.toContain(layout);
    }
  });

  it('uses a 300-400ms duration', () => {
    const m = body.match(/transition-duration:\s*(\d+)ms/);
    expect(m).not.toBeNull();
    const ms = Number(m![1]);
    expect(ms).toBeGreaterThanOrEqual(300);
    expect(ms).toBeLessThanOrEqual(400);
  });
});

// ── 2. ThemeProvider stamping behaviour ──────────────────────────────────────
function ToggleProbe() {
  const { toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>toggle</button>;
}

const realMatchMedia = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
  window.matchMedia = realMatchMedia; // default mock (matches:false everywhere)
});

afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

describe('theme crossfade — ThemeProvider', () => {
  it('does NOT stamp .theme-transition on the initial apply (no crossfade on load)', () => {
    localStorage.setItem('waggle-theme', 'dark');
    applyStoredThemeEarly(); // mirrors main.tsx pre-paint apply
    render(
      <ThemeProvider>
        <ToggleProbe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('theme-transition')).toBe(false);
  });

  it('stamps .theme-transition on a real toggle (motion allowed)', () => {
    localStorage.setItem('waggle-theme', 'dark');
    applyStoredThemeEarly();
    render(
      <ThemeProvider>
        <ToggleProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('toggle'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('theme-transition')).toBe(true);
  });

  it('keeps the instant swap under reduced motion (no class stamped)', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    localStorage.setItem('waggle-theme', 'dark');
    applyStoredThemeEarly();
    render(
      <ThemeProvider>
        <ToggleProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('toggle'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('theme-transition')).toBe(false);
  });
});
