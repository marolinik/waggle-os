#!/usr/bin/env node
/**
 * ux-gate · warm-interaction  (the hard interaction gate, Playwright)
 * ────────────────────────────────────────────────────────────────────────────
 * path-to-9 v3 §Pillar 2 + §3. The instant-power-feel pillar has a HARD gate:
 * a returning user's warm launch must land on INTERACTIVE content fast, and a
 * cold launch (sidecar down) must still paint from cache and accept typing. This
 * script measures both against a running dev server and mirrors the capture-kit
 * convention of a SEEDED RETURNING USER (onboarding-complete + already-booted +
 * briefing-dismissed in localStorage, no bypass query params — the authentic
 * day-30 morning launch, not the E2E `?skipOnboarding` path). The seed is
 * disclosed in the output so a reader knows exactly what user state was measured.
 *
 * ── WARM gate (v3 §Pillar 2.1/2.2, §3 hard gate) ─ measured against a healthy
 *    sidecar. app-start →
 *      (a) home content visible   — FAIL if > 1000ms  (time-to-content)
 *      (b) brand flash            — FAIL if >  500ms  (boot-screen dwell; a
 *                                   correctly-seeded warm return skips boot → 0)
 *      (c) composer accepts a keystroke — FAIL if the first keystroke is rejected
 *                                   (input-during-warmup: the composer is typable
 *                                   the moment it renders, never gated on connect)
 *    Prints a timing table. Exit 1 on any breach (RED until Pillar 2 lands —
 *    intended; this is the contract written as a test). `--report-only` prints
 *    the table and exits 0 (for the "report the timing table" verify step).
 *
 * ── COLD-START variant (v3 §Pillar 2.2 cold path) ─ warm visit to populate any
 *    disk cache, then ALL `/api/**` aborted (sidecar "down"), reload:
 *      cachedPaint  — cached home content still renders without the sidecar
 *      typingQueues — the composer still accepts typing with the sidecar down
 *    These need Lane H (cache-first paint) + Lane C (input-during-warmup) landed.
 *    Until then the script PROBES and reports which contracts hold; it exits 1
 *    only on a REGRESSION of a contract the baseline records as landed. `--strict`
 *    enforces every cold contract (flip once H+C merge). Ratchet baseline:
 *    `warm-interaction-baseline.json`, seeded with `--update-baseline`.
 *
 * Requires `playwright` (dev dep) + a reachable dev server. Defaults to the vite
 * dev server (WAGGLE_UX_BASE_URL, default http://127.0.0.1:8080) — the live-source
 * app the arc is validated on; point it at the built app (single-origin :3333) for
 * production-representative timing. NOT wired into CI yet (see README).
 *
 *   npm run ux:warm-gate
 *   node scripts/ux-gates/warm-interaction-gate.mjs --report-only
 *   node scripts/ux-gates/warm-interaction-gate.mjs --strict
 *   node scripts/ux-gates/warm-interaction-gate.mjs --update-baseline
 *   node scripts/ux-gates/warm-interaction-gate.mjs --warm-only --json
 *   WAGGLE_UX_BASE_URL=http://127.0.0.1:3333 npm run ux:warm-gate
 *
 * Exit codes: 0 clean · 1 warm breach / cold regression (or any cold fail under
 * --strict) · 2 infra (no server / no playwright / content never reached).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'scripts/ux-gates/warm-interaction-baseline.json');
const REPORT = path.join(ROOT, 'scripts/ux-gates/.warm-interaction-report.json');
const BASE = process.env.WAGGLE_UX_BASE_URL ?? 'http://127.0.0.1:8080';

// Budgets — the v3 §3 hard-gate thresholds (env-overridable for a built-app run).
const HOME_BUDGET_MS = Number(process.env.WARM_HOME_BUDGET_MS ?? 1000);
const BRAND_BUDGET_MS = Number(process.env.WARM_BRAND_BUDGET_MS ?? 500);

// Selectors (verified in HomeCockpit.tsx / ChatApp.tsx).
const SEL = {
  boot: '[data-testid="boot-screen"]',
  homeContent: '[data-testid="home-cockpit"],[data-testid="home-cockpit-empty"]',
  homeLoaded: '[data-testid="home-cockpit"]', // real content (not the skeleton/empty)
  wsTile: '[data-testid^="home-cockpit-ws-"]',
  composer: 'textarea[placeholder^="Reply, or ask Waggle"]',
};

/** The seeded RETURNING power user — pure localStorage, no bypass query params.
 *  `waggle-booted` → AppShell skips the boot screen (initialBooted);
 *  `waggle_onboarding_complete` + `waggle:onboarding` → isOnboardingStatusKnownSync
 *  resolves synchronously so no wizard/boot flash; the briefing is dismissed so it
 *  can't interpose. This is the exact state a day-30 desktop launch carries. */
const SEED_DISCLOSURE = {
  'waggle-booted': 'true',
  'waggle_onboarding_complete': 'true',
  'waggle:onboarding': '{completed:true,step:7,tier:"power",tooltipsDismissed:true}',
  'waggle:login-briefing-dismissed': 'true',
  'waggle-theme': '<theme>',
};
function seedReturningUser(theme) {
  try {
    localStorage.setItem('waggle-booted', 'true');
    localStorage.setItem('waggle_onboarding_complete', 'true');
    localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true, step: 7, tier: 'power', tooltipsDismissed: true }));
    localStorage.setItem('waggle:login-briefing-dismissed', 'true');
    localStorage.setItem('waggle-theme', theme);
  } catch { /* pre-navigation origin — retried on the real origin by the next initScript run */ }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const UPDATE = args.includes('--update-baseline');
const STRICT = args.includes('--strict');
const REPORT_ONLY = args.includes('--report-only');
const JSON_OUT = args.includes('--json');
const WARM_ONLY = args.includes('--warm-only');
const COLD_ONLY = args.includes('--cold-only');

// ── Page-timing helper ─────────────────────────────────────────────────────────
/** Resolve with the in-page `performance.now()` captured in the SAME frame the
 *  predicate first matches (accurate to element appearance, independent of the
 *  Node-side CDP roundtrip). Returns null on timeout. performance.now() is ms
 *  since the document's time origin === navigation start, so the value IS the
 *  time-since-app-start we want. */
async function perfWhen(page, predicate, timeoutMs) {
  try {
    const handle = await page.waitForFunction(predicate, undefined, { timeout: timeoutMs, polling: 'raf' });
    const value = await handle.jsonValue();
    await handle.dispose();
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

// ── WARM pass ───────────────────────────────────────────────────────────────────
async function measureWarm(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(seedReturningUser, 'dark');
  const out = { homeMs: null, homeState: null, brandMs: 0, bootSeen: false, wsId: null, composerAccepted: null, composerMs: null };
  try {
    // PRIME the payload cache first (V1-instant catch): "warm" means the day-30
    // returning launch — localStorage (including waggle:home-cache:*) persists
    // across launches, so the measured run must start with the cache POPULATED.
    // The unprimed first visit is the day-0 path; recorded as info, not gated.
    await page.goto(`${BASE}/home`, { waitUntil: 'commit', timeout: 30000 });
    const day0 = await perfWhen(page, () => {
      const el = document.querySelector('[data-testid="home-cockpit"],[data-testid="home-cockpit-empty"]');
      return el ? performance.now() : false;
    }, 30000);
    out.day0Ms = day0 != null ? Math.round(day0) : null;
    out.cachePrimed = await page.evaluate(() =>
      Object.keys(localStorage).some(k => k.startsWith('waggle:home-cache:')));
    await page.goto('about:blank');

    // One retry absorbs a transient dev-proxy drop (the vite→sidecar proxy can
    // NetworkError under back-to-back context churn). A reload restarts the perf
    // clock, so we measure the retry's paint honestly.
    let homeMs = null;
    for (let attempt = 0; attempt < 2 && homeMs == null; attempt++) {
      await page.goto(`${BASE}/home`, { waitUntil: 'commit', timeout: 30000 });
      const homeP = perfWhen(page, () => {
        const el = document.querySelector('[data-testid="home-cockpit"],[data-testid="home-cockpit-empty"]');
        return el ? performance.now() : false;
      }, 20000);
      // Brand flash: only if a boot screen actually shows for this (warm) user —
      // a correctly-seeded return skips it entirely → 0. If it appears, the flash
      // is how long it dwells. Measured on the first attempt only.
      if (attempt === 0) {
        const bootAppeared = await perfWhen(page, () => document.querySelector('[data-testid="boot-screen"]') ? performance.now() : false, 700);
        if (bootAppeared != null) {
          out.bootSeen = true;
          const gone = await perfWhen(page, () => document.querySelector('[data-testid="boot-screen"]') ? false : performance.now(), 8000);
          out.brandMs = Math.round(gone ?? bootAppeared);
        }
      }
      homeMs = await homeP;
    }
    if (homeMs != null) {
      out.homeMs = Math.round(homeMs);
      out.homeState = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="home-cockpit"],[data-testid="home-cockpit-empty"]');
        return el ? el.getAttribute('data-testid') : null;
      });
      out.wsId = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? (el.getAttribute('data-testid') || '').replace('home-cockpit-ws-', '') : null;
      }, SEL.wsTile);
    }

    // Composer: navigate to the first workspace chat and type the moment the
    // textarea attaches (input-during-warmup — never wait for connect).
    if (out.wsId) {
      const c = await measureComposer(page, out.wsId, /* apiBlocked */ false);
      out.composerAccepted = c.accepted;
      out.composerMs = c.ms;
    }
  } finally {
    await context.close();
  }
  return out;
}

/** Navigate to a workspace chat, wait for the composer to ATTACH, type a unique
 *  token immediately, and assert it stuck. Returns { accepted, ms }. A disabled/
 *  gated textarea makes pressSequentially throw → accepted:false (the regression
 *  we guard). `ms` is time-since-chat-nav the composer became interactive. */
async function measureComposer(page, wsId, apiBlocked) {
  const out = { accepted: false, ms: null };
  try {
    await page.goto(`${BASE}/workspaces/${wsId}/chat`, { waitUntil: 'commit', timeout: 30000 });
  } catch {
    return out; // navigation itself failed (only expected when apiBlocked bricks routing)
  }
  const composerAttachMs = await perfWhen(page, () => {
    const t = document.querySelector('textarea[placeholder^="Reply, or ask Waggle"]');
    return t ? performance.now() : false;
  }, apiBlocked ? 12000 : 20000);
  if (composerAttachMs == null) return out;
  out.ms = Math.round(composerAttachMs);
  const token = `gate-${Date.now().toString(36)}`;
  try {
    const box = page.locator(SEL.composer).first();
    await box.click({ timeout: 4000 });
    await box.pressSequentially(token, { delay: 0, timeout: 4000 });
    const val = await box.inputValue();
    out.accepted = typeof val === 'string' && val.includes(token);
  } catch {
    out.accepted = false; // not editable / disabled → the keystroke was rejected
  }
  return out;
}

// ── COLD pass ───────────────────────────────────────────────────────────────────
async function measureCold(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(seedReturningUser, 'dark');
  const out = { cachedPaint: false, cachedPaintMs: null, typingQueues: null, composerRendered: null, wsId: null, reachedWarm: false };
  try {
    // 1) Warm visit — lets any disk cache (Lane H) and the seed settle. One
    //    retry absorbs a transient dev-proxy drop (same as the warm pass).
    let warmHome = null;
    for (let attempt = 0; attempt < 2 && warmHome == null; attempt++) {
      await page.goto(`${BASE}/home`, { waitUntil: 'commit', timeout: 30000 });
      warmHome = await perfWhen(page, () => document.querySelector('[data-testid="home-cockpit"],[data-testid="home-cockpit-empty"]') ? performance.now() : false, 20000);
    }
    out.reachedWarm = warmHome != null;
    out.wsId = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? (el.getAttribute('data-testid') || '').replace('home-cockpit-ws-', '') : null;
    }, SEL.wsTile);

    // 2) Sidecar "down": abort every API call from here on.
    await context.route('**/api/**', (route) => route.abort());

    // 3) Reload home — does cached content still paint without the sidecar?
    await page.goto(`${BASE}/home`, { waitUntil: 'commit', timeout: 30000 });
    const cachedMs = await perfWhen(page, () => document.querySelector('[data-testid="home-cockpit"]') ? performance.now() : false, 6000);
    out.cachedPaint = cachedMs != null;
    out.cachedPaintMs = cachedMs == null ? null : Math.round(cachedMs);

    // 4) Chat with the sidecar down — does the composer still accept typing?
    //    `composerRendered` disambiguates "workspace unreachable, no usable
    //    composer" (ms == null) from "composer present but keystroke rejected".
    if (out.wsId) {
      const c = await measureComposer(page, out.wsId, /* apiBlocked */ true);
      out.typingQueues = c.accepted;
      out.composerRendered = c.ms != null;
    }
  } finally {
    await context.close();
  }
  return out;
}

// ── Reporting ────────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
function fmtMs(v) { return v == null ? '  n/a' : `${v}ms`; }

function printWarmTable(warm) {
  const rows = [
    { name: 'home content visible', measured: fmtMs(warm.homeMs), budget: `≤${HOME_BUDGET_MS}ms`, pass: warm.homeMs != null && warm.homeMs <= HOME_BUDGET_MS, note: warm.homeState || 'not reached' },
    { name: 'brand flash (boot dwell)', measured: warm.bootSeen ? fmtMs(warm.brandMs) : '0ms', budget: `≤${BRAND_BUDGET_MS}ms`, pass: (warm.bootSeen ? warm.brandMs : 0) <= BRAND_BUDGET_MS, note: warm.bootSeen ? 'boot shown' : 'boot skipped (warm)' },
    { name: 'composer accepts keystroke', measured: warm.composerAccepted == null ? 'skipped' : (warm.composerAccepted ? 'accepted' : 'REJECTED'), budget: 'accepted', pass: warm.composerAccepted === true, note: warm.composerMs == null ? (warm.wsId ? 'no composer' : 'no workspace') : `interactive @ ${warm.composerMs}ms` },
  ];
  console.log(`\n  WARM launch — seeded returning power user @ ${BASE}\n`);
  console.log(`  ${pad('check', 30)}${pad('measured', 12)}${pad('budget', 12)}result`);
  console.log('  ' + '─'.repeat(66));
  for (const r of rows) {
    console.log(`  ${pad(r.name, 30)}${pad(r.measured, 12)}${pad(r.budget, 12)}${r.pass ? '✓' : '✗'}  ${r.note}`);
  }
  console.log(`  ${pad('day-0 first paint (info)', 30)}${pad(fmtMs(warm.day0Ms), 12)}${pad('—', 12)}ⓘ  unprimed cache; not gated (cachePrimed=${warm.cachePrimed})`);
  return rows;
}

function printColdTable(cold, baseline) {
  const contracts = [
    { key: 'cachedPaint', name: 'cached paint renders content (sidecar down)', holds: cold.cachedPaint },
    { key: 'typingQueues', name: 'composer accepts typing (sidecar down)', holds: cold.typingQueues === true },
  ];
  console.log(`\n  COLD start — sidecar down (all /api/** aborted)\n`);
  console.log(`  ${pad('contract', 46)}${pad('holds', 8)}baseline`);
  console.log('  ' + '─'.repeat(66));
  for (const c of contracts) {
    const wasLanded = baseline?.[c.key] === true;
    const regressed = wasLanded && !c.holds;
    let tag;
    if (c.key === 'typingQueues' && cold.typingQueues == null) tag = 'skipped (no workspace)';
    else if (regressed) tag = 'REGRESSED (was landed)';
    else if (wasLanded) tag = 'landed';
    else if (c.key === 'typingQueues' && !c.holds) tag = cold.composerRendered ? 'not landed (composer present, keystroke rejected)' : 'not landed (workspace unreachable offline)';
    else tag = 'not landed';
    console.log(`  ${pad(c.name, 46)}${pad(c.holds ? 'yes' : 'no', 8)}${tag}`);
  }
  return contracts;
}

// ── Main ─────────────────────────────────────────────────────────────────────────
async function main() {
  // Reachability.
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok && res.status >= 500) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`\n✗ warm-interaction — dev server not reachable at ${BASE} (${e.message}).`);
    console.error('  Start it (npm run dev on :8080, sidecar on :3333) then re-run. Exit 2.\n');
    process.exit(2);
  }

  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    console.error('\n✗ warm-interaction — `playwright` is not installed. Exit 2.\n');
    process.exit(2);
  }

  const browser = await chromium.launch();
  let warm = null, cold = null;
  try {
    // A discarded warm-up navigation compiles the vite modules server-side so the
    // measured pass reflects the PRODUCT's warm feel (React mount + sidecar), not
    // vite's one-time on-demand compile. No-op cost on the built app (:3333).
    {
      const warmup = await browser.newContext();
      const wp = await warmup.newPage();
      await wp.addInitScript(seedReturningUser, 'dark');
      await wp.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
      await wp.waitForSelector(SEL.homeContent, { timeout: 25000 }).catch(() => {});
      await warmup.close();
    }

    if (!COLD_ONLY) warm = await measureWarm(browser);
    if (!WARM_ONLY) cold = await measureCold(browser);
  } finally {
    await browser.close();
  }

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};

  // ── Update baseline (freeze the cold contract hold-state) ─────────────────────
  if (UPDATE) {
    if (!cold) { console.error('\n✗ --update-baseline needs the cold pass (do not combine with --warm-only). Exit 2.\n'); process.exit(2); }
    const next = {
      generatedAt: new Date().toISOString().slice(0, 10),
      base: BASE,
      note: 'Frozen cold-start contract hold-state. The gate fails on a contract that REGRESSES from true→false (or, under --strict, any false).',
      cachedPaint: cold.cachedPaint,
      typingQueues: cold.typingQueues === true,
    };
    writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`\nux-gate · warm-interaction — baseline written (cachedPaint=${next.cachedPaint}, typingQueues=${next.typingQueues}).`);
    process.exit(0);
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  let warmRows = [], coldContracts = [];
  console.log(`\nux-gate · warm-interaction`);
  console.log(`  seed (returning user, no bypass params): ${Object.keys(SEED_DISCLOSURE).join(', ')}`);
  if (warm) warmRows = printWarmTable(warm);
  if (cold) coldContracts = printColdTable(cold, baseline);

  writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, budgets: { HOME_BUDGET_MS, BRAND_BUDGET_MS }, warm, cold }, null, 2) + '\n');
  console.log(`\n  full report → ${path.relative(ROOT, REPORT)}`);

  // ── Verdict ─────────────────────────────────────────────────────────────────────
  const warmBreaches = warm ? warmRows.filter((r) => !r.pass) : [];
  // Infra: the app never reached home content at all → we cannot measure.
  const warmInfra = warm && warm.homeMs == null;

  const coldRegressions = cold ? coldContracts.filter((c) => baseline?.[c.key] === true && !c.holds) : [];
  const coldStrictFails = cold && STRICT ? coldContracts.filter((c) => !c.holds && !(c.key === 'typingQueues' && cold.typingQueues == null)) : [];

  // --report-only never gates: print the table + summary and exit 0, even if the
  // app never reached content (the orchestrator's "report the timing table" use).
  if (REPORT_ONLY) {
    const infraNote = warmInfra ? ' (home content never reached — auth/sidecar)' : '';
    console.log(`\nⓘ --report-only: ${warmBreaches.length} warm breach(es), ${coldRegressions.length} cold regression(s)${infraNote}. Exit 0 (not gating).\n`);
    process.exit(0);
  }

  if (warmInfra) {
    console.error(`\n✗ warm-interaction — home content never rendered at ${BASE} (auth/sidecar problem). Cannot measure. Exit 2.\n`);
    process.exit(2);
  }

  if (!existsSync(BASELINE) && cold) {
    console.log('\n  ⓘ No cold baseline yet. Review the contracts above, then seed the ratchet with');
    console.log('    `node scripts/ux-gates/warm-interaction-gate.mjs --update-baseline`.');
  }

  const fails = warmBreaches.length + coldRegressions.length + coldStrictFails.length;
  if (fails > 0) {
    const parts = [];
    if (warmBreaches.length) parts.push(`${warmBreaches.length} warm threshold breach(es): ${warmBreaches.map((r) => r.name).join(', ')}`);
    if (coldRegressions.length) parts.push(`${coldRegressions.length} cold contract regression(s): ${coldRegressions.map((c) => c.key).join(', ')}`);
    if (coldStrictFails.length) parts.push(`${coldStrictFails.length} cold contract not holding (--strict): ${coldStrictFails.map((c) => c.key).join(', ')}`);
    console.error(`\n✗ warm-interaction FAILED — ${parts.join('; ')}.\n`);
    process.exit(1);
  }
  console.log('\n✓ warm-interaction PASSED — warm thresholds met, no cold-contract regressions.\n');
}

main().catch((e) => { console.error('warm-interaction crashed:', e); process.exit(2); });
