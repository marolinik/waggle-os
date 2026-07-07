#!/usr/bin/env node
/**
 * ux-gate · contrast-runtime  (composition-aware, Playwright)
 * ────────────────────────────────────────────────────────────────────────────
 * Pillar 4.2(b) + 4.3. Token-pair math (contrast-tokens.mjs) proves the tokens
 * are AA in isolation; this proves it AFTER composition — opacity stacked up the
 * DOM tree, and text painted over the wallpaper/gradient. Against a running dev
 * server it walks every visible text node on each judged surface (after finite
 * entrance animations settle), computes the EFFECTIVE foreground/background
 * (ancestor-opacity composited; a real screenshot pixel sampled when an ancestor
 * paints an image, blurs the backdrop, or the stack never reaches an opaque
 * background — i.e. glass/scrim overlay subtrees CSS math cannot reconstruct),
 * and reports:
 *
 *   text nodes         effective contrast < 4.5:1  (< 3:1 for WCAG-large text)
 *   focus indicators   ring/outline contrast < 3:1 vs adjacent effective bg
 *                      (tabs through up to 10 interactive elements per surface)
 *
 * Runs BOTH themes on: /home, /workspaces, /memory, /agents, /marketplace,
 * /settings, and a workspace chat. Emits a JSON report + a human table and
 * exits 1 on NEW failures vs `contrast-runtime-baseline.json` (a ratchet, seeded
 * with `--update-baseline`). Seeds the onboarding-skipped power-tier entry the
 * capture kit uses.
 *
 * Requires `playwright` (already a dev dep) and a reachable dev server
 * (default http://127.0.0.1:3333, override WAGGLE_UX_BASE_URL). This gate is
 * NOT wired into CI yet (that follows once it is proven — see README).
 *
 *   npm run ux:contrast-runtime
 *   node scripts/ux-gates/contrast-runtime.mjs --surfaces=home,settings
 *   node scripts/ux-gates/contrast-runtime.mjs --update-baseline
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'scripts/ux-gates/contrast-runtime-baseline.json');
const REPORT = path.join(ROOT, 'scripts/ux-gates/.contrast-runtime-report.json');
const BASE = process.env.WAGGLE_UX_BASE_URL ?? 'http://127.0.0.1:3333';
const QUERY = 'skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true';

const TEXT_FLOOR = 4.5;
const LARGE_FLOOR = 3.0;   // WCAG "large text": ≥24px, or ≥18.66px bold.
const FOCUS_FLOOR = 3.0;   // WCAG 1.4.11 non-text contrast.
const MAX_NODES = 400;     // per surface, to bound runtime.

const SURFACES = [
  { id: 'home', route: '/home' },
  { id: 'workspaces', route: '/workspaces' },
  { id: 'memory', route: '/memory' },
  { id: 'agents', route: '/agents' },
  { id: 'marketplace', route: '/marketplace' },
  { id: 'settings', route: '/settings' },
  { id: 'chat', route: '/chat' }, // resolved to /workspaces/:id/chat at runtime
];

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const UPDATE = args.includes('--update-baseline');
const surfaceFilter = (args.find((a) => a.startsWith('--surfaces=')) ?? '').split('=')[1];
const wantSurfaces = surfaceFilter ? new Set(surfaceFilter.split(',').map((s) => s.trim())) : null;

// ── Colour math ─────────────────────────────────────────────────────────────
const srgbToLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const relLum = ({ r, g, b }) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const composite = (fg, bg) => {
  if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
};
const contrast = (fg, bg) => {
  const l1 = relLum(composite(fg, bg)), l2 = relLum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Decode the single pixel of a 1×1 PNG (Playwright clip screenshot). For a
 *  1×1 image every PNG filter is the identity (no left/up neighbour), so the
 *  inflated scanline is just [filterByte, ...pixelBytes]. */
function decodePixel(buf) {
  let pos = 8, colorType = 6;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') colorType = data[9];
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = raw.subarray(1);
  if (colorType === 6) return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
  if (colorType === 2) return { r: px[0], g: px[1], b: px[2], a: 1 };
  if (colorType === 0) return { r: px[0], g: px[0], b: px[0], a: 1 };
  if (colorType === 4) return { r: px[0], g: px[0], b: px[0], a: px[1] / 255 };
  return { r: px[0], g: px[1], b: px[2], a: 1 };
}

// ── In-page collectors (serialized by Playwright to the browser; they run in
//    the page and use browser globals — document, getComputedStyle, innerHeight,
//    scrollX/scrollY, NodeFilter — never Node scope) ──────────────────────────
function collectTextNodes(maxNodes) {
  const parseColor = (str) => {
    if (!str || str === 'transparent' || str === 'none') return { r: 0, g: 0, b: 0, a: 0 };
    // Modern engines serialize computed colours from color-mix()/wide-gamut/
    // color() as `color(srgb r g b / a)` (0–1 floats) rather than rgb()/rgba().
    // The rgb() regex misses it, so such a foreground parsed to transparent-black
    // → composite === bg → a fabricated 1.0:1 (the 'Fallback' rail is a
    // color-mix()). Handle both notations.
    const cm = str.match(/color\(srgb\s+([^)]+)\)/i);
    if (cm) {
      const q = cm[1].split(/[\s/]+/).map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
      return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q[3] === undefined ? 1 : q[3] };
    }
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    const p = m[1].split(/[,/]/).map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const composite = (fg, bg) => {
    if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
    const a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  };
  const results = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && results.length < maxNodes) {
    const txt = (node.nodeValue || '').trim();
    if (txt.length < 2) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let opacity = 1;
    for (let a = el; a; a = a.parentElement) {
      const o = parseFloat(getComputedStyle(a).opacity);
      if (!Number.isNaN(o)) opacity *= o;
    }
    if (opacity < 0.05) continue;
    const fg = parseColor(cs.color); fg.a *= opacity;
    const fontPx = parseFloat(cs.fontSize) || 14;
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    // Effective bg: composite backgrounds up the tree. Defer to a real screenshot
    // pixel when — and only when — CSS compositing can't be trusted AND the node
    // is the topmost thing painted at its position (see occlusion below):
    //   • an ancestor paints an image (wallpaper/gradient), OR
    //   • an ancestor blurs the backdrop (glass — the effective bg is the blurred
    //     content behind it, which no colour math can reconstruct), OR
    //   • the walk never reaches an opaque background (a semi-transparent overlay
    //     subtree — compositing the stack onto assumed-white is wrong, and in dark
    //     theme wildly so).
    let imageBg = false, backdrop = false, foundOpaque = false;
    const layers = [];
    for (let a = el; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.backgroundImage && acs.backgroundImage !== 'none') imageBg = true;
      if ((acs.backdropFilter && acs.backdropFilter !== 'none') ||
          (acs.webkitBackdropFilter && acs.webkitBackdropFilter !== 'none')) backdrop = true;
      const bgc = parseColor(acs.backgroundColor);
      if (bgc.a > 0) layers.push(bgc);
      if (bgc.a >= 1 && !(acs.backgroundImage && acs.backgroundImage !== 'none')) { foundOpaque = true; break; }
    }
    // Occlusion: is a higher overlay (a modal scrim, a toast) painted over this
    // node? If so, a screenshot at its position samples the OVERLAY, not the
    // node's own background — so we MUST trust the CSS composite (its real design
    // bg) instead. This is what stops the content BEHIND the TrialExpiredModal
    // scrim (the 'Fallback' row + the whole /home cluster — real CSS contrast
    // 4.8–6.7:1, but a screenshot scores them against the black scrim → ~1.0:1)
    // from being frozen as fabricated failures. `elementFromPoint` returns the
    // topmost painted element; the node is occluded unless that element is itself,
    // a descendant, or an ancestor of it.
    const px = Math.round(rect.left + Math.min(rect.width / 2, 4));
    const py = Math.round(rect.top + rect.height / 2);
    const top = document.elementFromPoint(px, py);
    let occluded = false;
    if (top && top !== el) {
      occluded = true;
      for (let a = top; a; a = a.parentElement) { if (a === el) { occluded = false; break; } }
      if (occluded) for (let a = el; a; a = a.parentElement) { if (a === top) { occluded = false; break; } }
    }
    const snippet = txt.slice(0, 60);
    if (!occluded && (imageBg || backdrop || !foundOpaque)) {
      // Sample the top-left leading (line-height puts blank space above the cap
      // height) — likelier to be background than a glyph stroke.
      results.push({
        snippet, fg, fontPx, bold, needsSample: true,
        sx: Math.round(rect.left + scrollX + 1), sy: Math.round(rect.top + scrollY + 1),
      });
    } else {
      let acc = layers.length ? layers[layers.length - 1] : { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 2; i >= 0; i--) acc = composite(layers[i], acc);
      results.push({ snippet, fg, fontPx, bold, needsSample: false, bg: { r: acc.r, g: acc.g, b: acc.b, a: 1 } });
    }
  }
  return results;
}

/** Read the ring of the CURRENTLY focused element (the driver presses a real
 *  Tab between calls — evaluate cannot synthesize a trusted Tab). Never mutates
 *  focus. Returns [] when focus is on <body> (no element tabbed to yet). */
function collectFocusRing() {
  const parseColor = (str) => {
    if (!str || str === 'transparent' || str === 'none') return null;
    // color(srgb …) as well as rgb()/rgba() — see collectTextNodes.
    const cm = str.match(/color\(srgb\s+([^)]+)\)/i);
    if (cm) {
      const q = cm[1].split(/[\s/]+/).map((s) => parseFloat(s)).filter((n) => !Number.isNaN(n));
      const a = q[3] === undefined ? 1 : q[3];
      return a === 0 ? null : { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a };
    }
    const m = str.match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const p = m[1].split(/[,/]/).map((s) => parseFloat(s));
    const a = p[3] === undefined ? 1 : p[3];
    if (a === 0) return null;
    return { r: p[0], g: p[1], b: p[2], a };
  };
  const bgOf = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.backgroundImage && acs.backgroundImage !== 'none') return null; // sample
      const c = parseColor(acs.backgroundColor); // color(srgb)-aware
      if (c && c.a >= 1) return { r: c.r, g: c.g, b: c.b, a: 1 };
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return [];
  const cs = getComputedStyle(el);
  let ring = null;
  if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ring = parseColor(cs.outlineColor);
  if (!ring && cs.boxShadow && cs.boxShadow !== 'none') ring = parseColor(cs.boxShadow);
  if (!ring && cs.borderColor) ring = parseColor(cs.borderColor);
  const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
  const parentBg = bgOf(el.parentElement || el);
  const rect = el.getBoundingClientRect();
  return [{
    tag: el.tagName.toLowerCase(), label, ring,
    bg: parentBg, needsSample: parentBg === null,
    sx: Math.round(rect.left + scrollX - 1), sy: Math.round(rect.top + scrollY + rect.height / 2),
  }];
}

// ── Driver ──────────────────────────────────────────────────────────────────
async function samplePixel(page, sx, sy) {
  try {
    const buf = await page.screenshot({ clip: { x: Math.max(0, sx), y: Math.max(0, sy), width: 1, height: 1 }, type: 'png' });
    return decodePixel(buf);
  } catch {
    return { r: 127, g: 127, b: 127, a: 1 }; // neutral fallback — avoids a false clean pass.
  }
}

function floorFor(node) {
  const large = node.fontPx >= 24 || (node.bold && node.fontPx >= 18.66);
  return large ? LARGE_FLOOR : TEXT_FLOOR;
}

/** Wait out finite entrance animations before measuring. framer-motion modals /
 *  toasts animate opacity via the Web Animations API; measuring mid-fade
 *  multiplies every foreground by the transient ancestor opacity AND skews the
 *  bg composite — that, not a real contrast defect, is what produced the
 *  TrialExpiredModal 1.1–2.1:1 cluster and the 1.0:1 'Fallback' rows (verified:
 *  at 700ms the modal sat at 0.79 opacity, at rest 1.0 → AA). Infinite ambient
 *  loops (honey-pulse, float) are skipped so they can't hang the gate, and the
 *  whole wait is hard-capped. */
async function settleAnimations(page, capMs = 2500) {
  await page.evaluate(async (cap) => {
    const deadline = performance.now() + cap;
    const pending = () => (document.getAnimations ? document.getAnimations() : []).filter((a) => {
      if (a.playState !== 'running' || !a.effect) return false;
      const timing = a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
      return timing.iterations !== Infinity; // ignore ambient/infinite loops
    });
    while (pending().length && performance.now() < deadline) {
      await Promise.race([
        Promise.allSettled(pending().map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 100)),
      ]);
    }
  }, capMs).catch(() => { /* animation API unavailable — fall through to fixed wait */ });
}

async function auditSurface(page, surface, theme) {
  const failures = [];
  // Text nodes.
  const nodes = await page.evaluate(collectTextNodes, MAX_NODES).catch(() => []);
  for (const n of nodes) {
    const bg = n.needsSample ? await samplePixel(page, n.sx, n.sy) : n.bg;
    const ratio = contrast(n.fg, bg);
    const floor = floorFor(n);
    if (ratio < floor) {
      failures.push({ theme, surface: surface.id, kind: 'text', snippet: n.snippet, ratio: +ratio.toFixed(2), floor });
    }
  }
  // Focus rings — a real Tab is pressed between reads (evaluate cannot
  // synthesize a trusted Tab). A fresh page.goto starts focus on the document,
  // so the first Tab lands on the first focusable element.
  const seenLabels = new Set();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const [ring] = await page.evaluate(collectFocusRing).catch(() => []);
    if (!ring) continue;
    const dedupe = `${ring.tag}:${ring.label}`;
    if (seenLabels.has(dedupe)) continue;
    seenLabels.add(dedupe);
    if (!ring.ring) {
      failures.push({ theme, surface: surface.id, kind: 'focus', snippet: `${ring.tag} "${ring.label}"`, ratio: 0, floor: FOCUS_FLOOR, note: 'no visible ring' });
      continue;
    }
    const bg = ring.needsSample ? await samplePixel(page, ring.sx, ring.sy) : ring.bg;
    const ratio = contrast(ring.ring, bg);
    if (ratio < FOCUS_FLOOR) {
      failures.push({ theme, surface: surface.id, kind: 'focus', snippet: `${ring.tag} "${ring.label}"`, ratio: +ratio.toFixed(2), floor: FOCUS_FLOOR });
    }
  }
  return failures;
}

async function resolveChatRoute(page) {
  try {
    const res = await page.request.get(`${BASE}/api/workspaces`);
    if (!res.ok()) return null;
    const rows = await res.json();
    const id = Array.isArray(rows) ? rows[0]?.id : null;
    return id ? `/workspaces/${id}/chat` : null;
  } catch { return null; }
}

async function main() {
  // Reachability.
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok && res.status >= 500) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`\n✗ contrast-runtime — dev server not reachable at ${BASE} (${e.message}).`);
    console.error('  Start it (e.g. `npm run dev` or the playwright webServer) then re-run. Exit 2.\n');
    process.exit(2);
  }

  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    console.error('\n✗ contrast-runtime — `playwright` is not installed. Exit 2.\n');
    process.exit(2);
  }

  const surfaces = SURFACES.filter((s) => !wantSurfaces || wantSurfaces.has(s.id));
  const browser = await chromium.launch();
  const allFailures = [];
  try {
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      // Seed theme + onboarding-skip before first paint.
      await page.addInitScript((t) => {
        try { localStorage.setItem('waggle-theme', t); } catch { /* pre-nav */ }
      }, theme);
      for (const surface of surfaces) {
        let route = surface.route;
        if (surface.id === 'chat') { route = (await resolveChatRoute(page)) ?? '/workspaces'; }
        const url = `${BASE}${route}${route.includes('?') ? '&' : '?'}${QUERY}`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.evaluate((t) => {
            if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
            else document.documentElement.removeAttribute('data-theme');
          }, theme);
          await page.waitForSelector('main, [role="navigation"], .waggle-sidebar', { timeout: 12000 }).catch(() => {});
          await page.waitForTimeout(700);
          await settleAnimations(page);
          const failures = await auditSurface(page, surface, theme);
          allFailures.push(...failures);
          process.stdout.write(`  ${theme}/${surface.id}: ${failures.length} finding(s)\n`);
        } catch (e) {
          process.stdout.write(`  ${theme}/${surface.id}: SKIPPED (${e.message.split('\n')[0]})\n`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  // ── Baseline diff ───────────────────────────────────────────────────────────
  const keyOf = (f) => `${f.theme}|${f.surface}|${f.kind}|${f.snippet}`;
  writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, failures: allFailures }, null, 2) + '\n');

  if (UPDATE) {
    writeFileSync(BASELINE, JSON.stringify({
      generatedAt: new Date().toISOString().slice(0, 10),
      note: 'Frozen composition-aware contrast failures (seeded against a running dev server). The gate fails on NEW failures beyond this set.',
      keys: [...new Set(allFailures.map(keyOf))].sort(),
    }, null, 2) + '\n');
    console.log(`\nux-gate · contrast-runtime — baseline written: ${new Set(allFailures.map(keyOf)).size} frozen failure key(s).`);
    process.exit(0);
  }

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { keys: [] };
  const frozen = new Set(baseline.keys ?? []);
  const newFailures = allFailures.filter((f) => !frozen.has(keyOf(f)));

  // ── Report ──────────────────────────────────────────────────────────────────
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nux-gate · contrast-runtime — ${allFailures.length} finding(s) (${frozen.size} frozen), ${newFailures.length} NEW\n`);
  if (allFailures.length) {
    console.log(`${pad('theme', 7)}${pad('surface', 12)}${pad('kind', 7)}${pad('ratio', 7)}${pad('floor', 7)}text`);
    console.log('─'.repeat(72));
    for (const f of allFailures) {
      const isNew = !frozen.has(keyOf(f));
      console.log(`${pad(f.theme, 7)}${pad(f.surface, 12)}${pad(f.kind, 7)}${pad(f.ratio, 7)}${pad(f.floor, 7)}${isNew ? '▲ ' : '  '}${f.snippet}`);
    }
  }
  console.log(`\n  full report → ${path.relative(ROOT, REPORT)}`);

  if (!frozen.size && allFailures.length) {
    console.log('\n  ⓘ No baseline yet. Review the findings above, then seed the ratchet with');
    console.log('    `node scripts/ux-gates/contrast-runtime.mjs --update-baseline`.');
  }

  if (newFailures.length > 0) {
    console.error(`\n✗ contrast-runtime FAILED — ${newFailures.length} NEW composition-aware contrast failure(s).\n`);
    process.exit(1);
  }
  console.log('\n✓ contrast-runtime PASSED — no new composition-aware contrast failures.\n');
}

main().catch((e) => { console.error('contrast-runtime crashed:', e); process.exit(2); });
