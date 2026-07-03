# apps/www rebuild — completion report (2026-07-03)

Companion to `2026-07-03-www-marketing-site-design.md` (spec) and `2026-07-03-www-fact-sheet.md` (verified claims). All changes uncommitted, on `main` working tree, awaiting founder go-ahead.

## Shipped

**New landing narrative** (page.tsx): Hero → Problem → How it works → Memory substrate → LoCoMo proof → Feature grid → Sovereignty → Personas (kept BrandPersonasCard) → Open source → Pricing → Final CTA. Every string rewritten in `messages/en.json`; every claim traces to the fact sheet.

**New components** (CSS Modules, server-first): Hero + HeroVisual (zero-JS animated memory-window SVG; replaced fake-stats client version), ProblemTurn, MemoryDiagram, ProofBand (honest 0-100 bar chart: 86.49 / 81.95 / 73.96 + protocol footnote), FeatureGrid (6 real subsystems, custom line icons), SovereigntyBand, OpenSource (verified reproduce-terminal: `node artifacts/w4-n1540/recount.mjs`), rebuilt Navbar/Footer/Pricing/FinalCTA/HowItWorks. New primitives: Reveal (IntersectionObserver, `html.js`-gated for no-JS, reduced-motion safe), BrandMark (SVG replaces JPEG logo), shared `.btn/.eyebrow/.section-*` in globals.css.

**Deleted**: WowBeat, ComparisonBeat, Pillars, TrustBand, ProofPointsBand, hero A/B variant infra (hero-variants.ts, hero-headline-resolver.ts), 105MB unreferenced assets (icon-*.jpeg, bee-*-light.png, stale `dist/`). Public: 145→40MB.

**Claims removed** (were unverifiable): SOC 2, priority sync, 48h SLA, dedicated AM, 14-day trial (→15), SSO/RBAC (deferred per founder), hero fake stats (12,847 edges / 42ms / 17 providers).

**SEO/a11y/perf**: new 1200×630 OG card (public/brand/og.png, sharp-rendered), app/icon.svg favicon, JSON-LD (SoftwareApplication+Organization), app/robots.ts, skip-link, aria-labelled sections, contrast bumps (text-dim→text-muted at small sizes), `/` now **static** (was dynamic — searchParams resolver removed), checkout popup-blocker fix (window.open→location.assign), inline role=alert instead of alert(), mobile grid-blowout fix (minmax(0,1fr)).

## Gates
`npx tsc --noEmit` 0 · `next build` clean (17 routes, / static, 191kB first-load) · vitest 10/10 · `next lint` 0 errors. Visual QA via Playwright at 1440px + 375px (hero, proof, features, pricing, terminal verified; horizontal overflow found and fixed).

## Open / needs founder
1. **Not committed/pushed** — say the word and I'll commit (suggest: single `feat(www): rebuild marketing site` or per-phase).
2. **Download funnel**: all CTAs → github.com/marolinik/waggle-os/releases/latest — verify repo is public with a release, else funnel 404s.
3. **No real product screenshots / social proof** — needs real app captures + quotes; hero uses product-true SVG meanwhile.
4. **Legal pages** still carry "Day-0 placeholder pending legal counsel" copy (untouched).
5. **Analytics** still stubbed (event-taxonomy no-ops in prod; Privacy policy mentions PostHog).
6. Stale historical docs untouched per surgical rule: SESIJA-D/E manifests, LIGHTHOUSE.md (pre-rebuild numbers — re-run post-deploy).
7. `landing.metadata.*` in en.json kept for future locale wiring (layout uses constants).
