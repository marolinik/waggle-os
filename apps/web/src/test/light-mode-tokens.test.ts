/**
 * R5-006 — light-mode token contrast ratchet.
 *
 * Parses index.css and asserts that every --status-* and --kg-* token has a
 * value in BOTH the dark `:root` block and the light `:root[data-theme="light"]`
 * block, and that the light values meet WCAG AA (>=4.5:1) against the light
 * --background surface.
 *
 * This is a STATIC contrast check (computable without a browser) — it does NOT
 * replace the independent visual QA the GA plan requires for the broader
 * hardcoded-Tailwind migration. It locks in the token-level guarantee so a
 * future edit that regresses a token below AA fails CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// __dirname resolves under this vitest config (see skill-recommendations.test.ts).
const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');

/** Extract the body of a `selector { ... }` block (first match). */
function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf('{', start);
  // Walk to the matching close brace (blocks here are flat — no nesting).
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated block: ${selector}`);
}

function tokens(body: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const match of body.matchAll(/(--(?:status|kg)-[a-z]+)\s*:\s*([^;]+);/g)) {
    m.set(match[1], match[2].trim());
  }
  return m;
}

// ── WCAG contrast (sRGB relative luminance) ──
function hexToRgb(x: string): [number, number, number] {
  const h = x.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}
function lum([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(c1: [number, number, number], c2: [number, number, number]): number {
  const L1 = lum(c1), L2 = lum(c2);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

const darkTokens = tokens(block(':root'));
const lightTokens = tokens(block(':root[data-theme="light"]'));

// Light --background: `40 18% 97%` (HSL components, Tailwind hsl() convention).
const lightBgMatch = block(':root[data-theme="light"]').match(/--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
const lightBg: [number, number, number] = lightBgMatch
  ? hslToRgb(Number(lightBgMatch[1]), Number(lightBgMatch[2]), Number(lightBgMatch[3]))
  : hslToRgb(40, 18, 97);

const SEMANTIC = ['--status-healthy', '--status-warning', '--status-error', '--status-info', '--status-ai',
  '--kg-person', '--kg-project', '--kg-concept', '--kg-org', '--kg-default'];

describe('R5-006 light-mode token contrast', () => {
  it('defines every status/kg token in the dark :root block', () => {
    for (const t of SEMANTIC) expect(darkTokens.has(t), `dark missing ${t}`).toBe(true);
  });

  it('defines every status/kg token in the light block (no dark-color bleed)', () => {
    for (const t of SEMANTIC) expect(lightTokens.has(t), `light missing ${t}`).toBe(true);
  });

  it.each(SEMANTIC)('light %s meets WCAG AA (>=4.5:1) on the cream surface', (token) => {
    const val = lightTokens.get(token)!;
    expect(val, `${token} must be a hex color`).toMatch(/^#[0-9a-fA-F]{6}$/);
    const r = ratio(lightBg, hexToRgb(val));
    expect(r, `${token} = ${val} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

// ── Honey button text contrast (--primary-foreground on --primary) ──
// The default shadcn button/badge render `bg-primary text-primary-foreground`,
// and the design mandates dark ink (#1a1407) on the honey accent. Guard the
// ratio in BOTH themes so a light-mode regression (white-on-honey ≈ 3.6:1)
// can't ship green again.
function hslTriple(body: string, name: string): [number, number, number] | null {
  const m = body.match(new RegExp(`${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  return m ? hslToRgb(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

describe('honey button text contrast (--primary-foreground on --primary)', () => {
  it.each([
    ['dark', ':root'],
    ['light', ':root[data-theme="light"]'],
  ])('%s primary button text meets WCAG AA (>=4.5:1)', (label, selector) => {
    const body = block(selector);
    const primary = hslTriple(body, '--primary');
    const fg = hslTriple(body, '--primary-foreground');
    expect(primary, `${selector} --primary must be HSL`).not.toBeNull();
    expect(fg, `${selector} --primary-foreground must be HSL`).not.toBeNull();
    const r = ratio(primary!, fg!);
    expect(r, `${label} primary-foreground → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
