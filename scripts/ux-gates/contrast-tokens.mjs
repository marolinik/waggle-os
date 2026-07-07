#!/usr/bin/env node
/**
 * ux-gate · contrast-tokens
 * ────────────────────────────────────────────────────────────────────────────
 * Pillar 4.2 (token-pair math). Parses the app's CSS custom-property graph
 * (apps/web/src/index.css + waggle-theme.css), resolves every text and surface
 * token to a concrete sRGB colour for BOTH themes, and asserts the documented
 * WCAG contrast floors:
 *
 *   --text / --text-2 / --text-muted / --text-tertiary   ≥ 4.5:1  (AA body text)
 *   --focus-ring / --line-affordance                     ≥ 3.0:1  (WCAG 1.4.11)
 *
 * over each allowed surface token (--bg, --bg-2, --surface, --surface-2,
 * --surface-3) in dark AND light. Exits 1 on any DEFINED token that fails its
 * floor. Tokens the spec expects but that are not yet defined (e.g. Lane T's
 * --text-tertiary/--focus-ring/--line-affordance land in a parallel lane) are
 * reported as PENDING — loud, but non-fatal — so this gate is green today and
 * automatically enforces them the moment they exist.
 *
 * `--text-dim` is INFORMATIONAL only: it is the intentional sub-AA "dim" tier
 * that Lane T's --text-tertiary supersedes; it is measured and printed but not
 * enforced (enforcing it would fail by design).
 *
 * No dependencies. Run: `npm run ux:contrast` or `node scripts/ux-gates/contrast-tokens.mjs`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CSS_FILES = [
  path.join(ROOT, 'apps/web/src/index.css'),
  path.join(ROOT, 'apps/web/src/waggle-theme.css'),
];

// ── Enforcement config ──────────────────────────────────────────────────────
const SURFACES = ['--bg', '--bg-2', '--surface', '--surface-2', '--surface-3'];
const TEXT_ENFORCED = ['--text', '--text-2', '--text-muted', '--text-tertiary'];
const TEXT_INFO = ['--text-dim']; // measured, not enforced (dim tier by design)
const AFFORDANCE_ENFORCED = ['--focus-ring', '--line-affordance'];
const TEXT_FLOOR = 4.5;
const AFFORDANCE_FLOOR = 3.0;

// ── Colour math (WCAG 2.x relative luminance) ───────────────────────────────
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a: 1 };
}

function parseHex(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 4) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function relLuminance({ r, g, b }) { return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b); }

/** Composite a (possibly translucent) foreground over an opaque background. */
function composite(fg, bg) {
  if (fg.a >= 1) return fg;
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

function contrast(fg, bg) {
  const effFg = composite(fg, bg);
  const l1 = relLuminance(effFg), l2 = relLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── CSS custom-property extraction ──────────────────────────────────────────
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

/** Brace-match the block that opens at `openIdx` (index of the `{`). */
function blockBody(css, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(openIdx + 1, i); }
  }
  return '';
}

/** Collect every `--name: value` declaration from all blocks whose selector
 *  matches `selectorRe` (anchored so `:root` never captures `:root .child`). */
function collectDecls(css, selectorRe) {
  const out = {};
  let m;
  const re = new RegExp(selectorRe.source, 'g');
  while ((m = re.exec(css)) !== null) {
    const openIdx = css.indexOf('{', m.index);
    if (openIdx === -1) continue;
    const body = blockBody(css, openIdx);
    const declRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let d;
    while ((d = declRe.exec(body)) !== null) out[d[1]] = d[2].trim();
    re.lastIndex = openIdx + 1;
  }
  return out;
}

function buildMaps() {
  let dark = {}, light = {};
  for (const file of CSS_FILES) {
    const css = stripComments(readFileSync(file, 'utf8'));
    Object.assign(dark, collectDecls(css, /:root\s*\{/));
    Object.assign(light, collectDecls(css, /:root\[data-theme="light"\]\s*\{/));
  }
  // light inherits every dark declaration then applies its overrides.
  return { dark, light: { ...dark, ...light } };
}

// ── Value resolution ────────────────────────────────────────────────────────
/** Textually expand every `var(--x, fallback)` into its raw value. */
function expandVars(value, map, seen = new Set()) {
  let out = value;
  for (let guard = 0; guard < 50 && out.includes('var('); guard++) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name, fb) => {
      if (seen.has(name)) return fb ? fb.trim() : '';
      if (map[name] !== undefined) { seen.add(name); return map[name]; }
      return fb ? fb.trim() : '';
    });
  }
  return out.trim();
}

/** Parse `H S% L% [/ A]` (space- or comma-separated) into an {h,s,l,a}. */
function parseHslChannels(inner) {
  const [chan, alphaPart] = inner.split('/');
  const parts = chan.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]);
  const l = parseFloat(parts[2]);
  if ([h, s, l].some((n) => Number.isNaN(n))) return null;
  const rgb = hslToRgb(h, s, l);
  if (alphaPart !== undefined) rgb.a = clamp(parseFloat(alphaPart), 0, 1);
  return rgb;
}

/** Resolve a token name to a concrete colour, or null if undefined/unparseable. */
function resolveColor(name, map) {
  if (map[name] === undefined) return null;
  const v = expandVars(map[name], map);
  if (!v) return null;
  if (v.startsWith('#')) return parseHex(v);
  const hslM = v.match(/hsla?\(([^)]*)\)/i);
  if (hslM) return parseHslChannels(hslM[1]);
  const rgbM = v.match(/rgba?\(([^)]*)\)/i);
  if (rgbM) {
    const p = rgbM[1].split(/[\s,/]+/).map(Number).filter((n) => !Number.isNaN(n));
    if (p.length >= 3) return { r: p[0], g: p[1], b: p[2], a: p.length >= 4 ? p[3] : 1 };
  }
  // Bare `H S% L%` channels (e.g. a token that stores raw HSL for hsl()).
  if (/%/.test(v)) { const c = parseHslChannels(v); if (c) return c; }
  return null;
}

// ── Run ─────────────────────────────────────────────────────────────────────
function run() {
  const maps = buildMaps();
  const rows = [];
  const pending = [];
  let failures = 0;

  const checkGroup = (tokens, floor, enforced) => {
    for (const token of tokens) {
      for (const theme of ['dark', 'light']) {
        const map = maps[theme];
        const fg = resolveColor(token, map);
        if (!fg) {
          if (theme === 'dark' && enforced) pending.push(token);
          continue;
        }
        for (const surfaceName of SURFACES) {
          const bg = resolveColor(surfaceName, map);
          if (!bg) continue;
          const ratio = contrast(fg, bg);
          const pass = ratio >= floor;
          const status = !enforced ? 'info' : pass ? 'pass' : 'FAIL';
          if (enforced && !pass) failures++;
          rows.push({ token, surface: surfaceName, theme, ratio, floor, status });
        }
      }
    }
  };

  checkGroup(TEXT_ENFORCED, TEXT_FLOOR, true);
  checkGroup(TEXT_INFO, TEXT_FLOOR, false);
  checkGroup(AFFORDANCE_ENFORCED, AFFORDANCE_FLOOR, true);

  // ── Report ────────────────────────────────────────────────────────────────
  const pad = (s, n) => String(s).padEnd(n);
  const header = `${pad('token', 18)}${pad('surface', 13)}${pad('theme', 7)}${pad('ratio', 8)}${pad('floor', 7)}status`;
  console.log('\nux-gate · contrast-tokens — WCAG token-pair floors\n');
  console.log(header);
  console.log('─'.repeat(header.length + 4));
  let lastKey = '';
  for (const r of rows) {
    const key = r.token + r.theme;
    if (lastKey && key !== lastKey) console.log('');
    lastKey = key;
    const mark = r.status === 'FAIL' ? '✗ FAIL' : r.status === 'info' ? '· info' : '✓ pass';
    console.log(`${pad(r.token, 18)}${pad(r.surface, 13)}${pad(r.theme, 7)}${pad(r.ratio.toFixed(2), 8)}${pad(r.floor.toFixed(1), 7)}${mark}`);
  }

  if (pending.length) {
    const uniq = [...new Set(pending)];
    console.log(`\n⚠ PENDING (expected by spec, not yet defined — will enforce once present): ${uniq.join(', ')}`);
    console.log('  (Lane T owns --text-tertiary/--focus-ring/--line-affordance; this gate is a no-op for them until they land.)');
  }

  if (failures > 0) {
    console.error(`\n✗ contrast-tokens FAILED — ${failures} token/surface pair(s) below floor.\n`);
    process.exit(1);
  }
  const enforcedRows = rows.filter((r) => r.status !== 'info').length;
  console.log(`\n✓ contrast-tokens PASSED — ${enforcedRows} enforced pair(s) meet their floor.${pending.length ? ` (${new Set(pending).size} token(s) pending.)` : ''}\n`);
}

run();
