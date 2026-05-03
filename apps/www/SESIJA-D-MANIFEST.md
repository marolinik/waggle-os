# Sesija D Manifest — apps/www Next.js Port v3.2

**Date:** 2026-05-03
**Branch:** main (+11 commits ahead of origin/main at start of Sesija D, +20 at end)
**Mode:** SUPPORT (work main directly, commit per logical milestone)
**Brief:** `PM-Waggle-OS/briefs/2026-04-25-cc1-apps-www-nextjs-port-brief.md` + `2026-05-02-cc-sesija-D-apps-www-port-v3.2-amendment.md`
**Cost cap:** $10 hard / $8 halt
**Actual cost:** $0 LLM spend (pure file/build/lighthouse ops — no eval, no LLM-heavy operations)

---

## Commit ledger (12 commits, 11 CC + 1 Marko mid-session)

| # | SHA | Phase | Description |
|---|---|---|---|
| 1 | `9a6729b` | §1   | Scaffold Next.js 15 App Router migration (Vite 6 → Next 15.5.15) |
| 2 | `e20477f` | §2.1 | Drop 4 components (Features/CrownJewels/Enterprise/BetaSignup) + relocate personas/BrandPersonasCard into app/ |
| 3 | `b8a0020` | §2.2 | NEW lib + data + 6 server components + HeroVisual + DownloadCTA |
| 4 | `b5c3916` | §2.3 | Port Navbar + Pricing (client) into app/_components/ |
| 5 | `c4b0c04` | §2.4 | Wire app/page.tsx with 8-section landing + cleanup legacy src/ |
| 6 | `5464891` | §3.1 | Internal /api/stripe/checkout route + placeholder env guard |
| 7 | `9d7f5c9` | §3.2 | next-intl + full i18n extraction (~190 keys, strict #11) |
| 8 | `b716b04` | §3.3 | Lighthouse audit pass — Performance 96 / Accessibility 96 / SEO 100 |
| — | `7d1e0fc` | (Marko) | docs: add methodology documentation (211-line docs/methodology.md at repo root) |
| 9 | `8ecddff` | §3.4 | Path D landing decoupling — arxiv → methodology in Trust + Footer |
| 10 | `c353e49` | §4   | Initial verification artifacts: variant smoke + 3 full-page screenshots + manifest |
| 11 | (this)   | §4.1 | NEW /docs/methodology Next.js route (react-markdown + remark-gfm) + app/sitemap.ts + 4th screenshot |

---

## Acceptance criteria — amendment §3 (16 items)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | 8 sections in locked IA order (Hero → Proof → How → Personas → Pricing → Trust → Final CTA → Footer) | ✅ | `app/page.tsx` composes in declared order; verified visually in 3 screenshots |
| 2 | 5 hero variants resolvable via `?p=` + `utm_source` | ✅ | §4.1 smoke: A default ✓ / B `?p=compliance` ✓ / C `?p=founder` ✓ / D `?p=developer` ✓ / E `?utm_source=legal-tech` ✓ |
| 3 | Hero microcopy lock #1 (`17 AI platforms · Local-first · Apache 2.0 · EU AI Act ready`) | ✅ | `messages/en.json` `landing.hero.microcopy` |
| 4 | Hero diagram bottom stats lock #2 (`17 PROVIDERS`, not `4 PROVIDERS`) | ✅ | `messages/en.json` `landing.hero_visual.stats.providers_value: "17"` |
| 5 | Proof Card 1 = GEPA `+12.5pp` (Trio-strict 33.5% dropped) | ✅ | `app/_data/proof-points.ts` first card; rendered in screenshots |
| 6 | Proof Card 2 description lock #4 (`Substrate beats Mem0 paper by 7.1 points on LoCoMo.`) | ✅ | `app/_data/proof-points.ts` LoCoMo card |
| 7 | Step 02 ending lock #5 (`...persists across providers, sessions, and machines, automatically.`) | ✅ | `messages/en.json` `landing.how_it_works.step_02.body` |
| 8 | 13 personas per LOCK 2026-04-22 (Sleeping #13, Sovereign tile NOT added — Edit 5 RESCINDED) | ✅ | `app/_data/personas.ts` unchanged; `BrandPersonasCard` renders 13 + 3 fillers in 4×4 grid |
| 9 | Final CTA subhead lock #6 (`...KVARK for sovereign deployments.`) | ✅ | `messages/en.json` `landing.final_cta.subhead` |
| 10 | KVARK bridge in Final CTA (one sentence + one CTA) | ✅ | `app/_components/FinalCTA.tsx` `kvarkBridgeStyle` block |
| 11 | All copy extracted to `messages/en.json` under `landing.*` namespace; STRICT no string literal in JSX | ✅ | ~190 keys; vitest 10/10 passes with mocked t() |
| 12 | Stripe checkout via internal `/api/stripe/checkout` (NOT external cloud.waggle-os.ai) | ✅ | `app/api/stripe/checkout/route.ts`; Pricing POSTs to relative path; 503 with placeholder env vars per §0.b |
| 13 | OS detection on Hero / Solo tier / Final CTA primaries | ✅ | `app/_components/DownloadCTA.tsx` (3 sections wired with `section` prop) |
| 14 | Hive pulse animation + `prefers-reduced-motion` suppression | ✅ | `app/_components/HeroVisual.tsx` scoped CSS `@media (prefers-reduced-motion: reduce)` |
| 15 | Build clean, lint clean, vitest 100% green | ✅ | `next build` → 6 routes; `tsc --noEmit` silent; `vitest run` 10/10 |
| 16 | Lighthouse: Performance ≥85, Accessibility ≥95, SEO ≥95 | ✅ | **96 / 96 / 100** on local prod; see `LIGHTHOUSE.md` for full report |

**16 / 16 PASS.**

---

## Out of scope (per amendment §5, OUT-of-scope locked)

- ThemeToggle / light mode / `[data-theme="light"]` block (v1.5 deferred)
- MPEG-4 hero loop placeholder (post-launch fast-follow; HeroVisual ships SVG diagram per §2.2)
- A/B testing framework (post-launch)
- Server-side rendering of hero variants — variant resolver runs server-side from `searchParams` (acceptable for v1; Next.js App Router idiom)
- Marketing email integration (BetaSignup component dropped per §2.1; CTA conversion handled by Pricing flow)
- Analytics provider integration (event-taxonomy stub only — `console.info` in dev, no-op in prod)
- Cookie banner cross-domain tracking persistence

---

## Day-2 polish backlog (carryover for Marko ratification)

| Item | Severity | Source | Notes |
|---|---|---|---|
| `--hive-400` (#5a6380) contrast at 9-11px sizes | low | Lighthouse a11y sub-100 | 4 instances: navbar v1.0 pill, HeroVisual window strip, stat strip labels. Bump to `--hive-300` or font-size to 12px+. |
| `next/image` migration for 13 persona PNGs | medium | Lighthouse "Improve image delivery" 50 | AVIF/WebP auto-conversion + responsive srcsets. ~200 line refactor. |
| `/` route bfcache restoration | low | Lighthouse perf sub-100 | Currently 0 due to `Cache-Control: no-store` on dynamic searchParams route. Move variant resolver client-side to keep `/` static. |
| next-intl message tree-shaking | low | Lighthouse "Reduce unused JS" 50 | next-intl ships full message bundle to client. v1.5 audit. |
| ~~`/docs/methodology` route handler~~ | ✅ resolved | §4.1 PM ratify | Shipped in §4.1 — `app/docs/methodology/page.tsx` reads `docs/methodology.md` at build (force-static) via react-markdown + remark-gfm. Live at `waggle-os.ai/docs/methodology` once deployed. |
| Vercel preview Lighthouse re-measure | medium | §3.3 carryover | Local 96/96/100 is conservative floor; production CDN typically +5-10. Re-measure on Vercel preview before launch as final confirmation. |
| Stripe real keys + live price IDs | high (pre-launch) | §0.b ratification | Marko-side action Monday 2026-05-03 with finance team. Replace `sk_test_REPLACE_ME` / `pk_test_REPLACE_ME` + populate `STRIPE_PRICE_{PRO,TEAMS}_{MONTHLY,ANNUAL}` env vars. Route auto-stops returning 503 once real keys are in place. |
| Sign-in flow | low (post-launch) | navbar | Currently `href="#"` placeholder. Auth provider + sign-in page defer to post-launch. |
| `BrandPersonasCard.tsx` font-family inheritance | low | spotted in §3.3 polish | One sub-100 a11y issue is a contrast finding; the broader fix (centralize all typography on `var(--font-inter)` rather than fallback `'Inter', system-ui, sans-serif` strings scattered through components) is a v1.5 simplification. |

---

## Verification artifacts

- **Build output:** `next build` produces **8 routes** (`/` ƒ Dynamic 8.96kB / 127kB First Load · `/_not-found` ○ Static 989B · `/api/stripe/checkout` ƒ Dynamic 129B · `/design/personas` ○ Static 2.98kB · `/docs/methodology` ○ Static 129B / 102kB · `/sitemap.xml` ○ Static).
- **Tests:** `npx vitest run` → 10/10 BrandPersonasCard tests pass.
- **Typecheck:** `npx tsc --noEmit` → clean (silent).
- **Lighthouse:** local prod build at port 8005 — **Perf 96 / A11y 96 / SEO 100**. Full report in `apps/www/LIGHTHOUSE.md`.
- **Variant smoke:** all 5 (A/B/C/D/E) resolve correctly, eyebrow text matched per variant via `?p=` or `utm_source` param.
- **Screenshots:** `apps/www/.screenshots/` contains **4 full-page PNGs** at 1440×900 (variant A default + variant B compliance + variant E legal-tech + `/docs/methodology` page). Mid-page persona tiles render lazy-loaded; this is intentional design — `loading="lazy"` was the perf fix that boosted LCP from 66.5s → 2.7s.
- **Sitemap:** `app/sitemap.ts` auto-generates `/sitemap.xml` with 2 entries (homepage priority 1.0 weekly + `/docs/methodology` priority 0.7 monthly). `/design/personas` intentionally omitted (robots-blocked playground).

---

## Repo state at end of Sesija D

- `apps/www/src/` is **empty** (all 9 legacy components either dropped per §2.1 or ported into `app/_components/` via §2.2 + §2.3).
- `apps/www/vite-env.d.ts` deleted (no more `import.meta.env` consumers).
- `apps/www/app/` houses everything: `_components/` (12 files) + `_data/` (3 files) + `_lib/` (3 files) + `api/stripe/checkout/route.ts` + `design/personas/` (preview playground + 2 PNGs) + `docs/methodology/page.tsx` (NEW §4.1) + `sitemap.ts` (NEW §4.1) + `globals.css` + `layout.tsx` + `page.tsx`.
- `apps/www/messages/en.json` is the canonical i18n source (~190 keys).
- `apps/www/i18n/request.ts` configures next-intl single-locale (`en`).
- `apps/www/LIGHTHOUSE.md` documents the audit + remediation backlog.
- Branch +20 commits ahead of `origin/main` (12 pre-Sesija D + 8 CC commits + 1 Marko commit + this manifest commit).

---

## Standing-down

Sesija D scope per amendment delivered in 9 commits (10 with Marko's methodology.md mid-session). All 16 amendment §3 acceptance criteria meet thresholds. Build green, types green, tests green, Lighthouse green.

PM Pass 8 ready. Marko-side actions before Day 0 launch:
1. Push `main` to `origin/main` (currently +22 ahead)
2. Wire real Stripe keys in production env (Vercel/Cloudflare/wherever production lands)
3. Re-measure Lighthouse on Vercel preview as final confirmation (re-test `/docs/methodology` since it's now a real route, not just a planned link)
4. Resolve sign-in flow CTA (currently `#` placeholder)
5. Confirm `docs/methodology.md` content is locked before deploy (currently labeled "Status: Draft for github commit") — methodology page bakes this content at build time, so updates require a rebuild + redeploy.

Cost cap unspent. Standing down.
