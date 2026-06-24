# Warm-Hive Redesign — PR8 Build Plan (`apps/www` landing → warm-Hive identity)

> Source design package: `docs/design_handoff_waggle_app/` — esp.
> `design-files/Waggle Landing.html` (648 lines, the canonical landing reference) +
> `design-files/styles/waggle.css` (token master) + `README.md §9` (landing copy notes).
> Roadmap slot: `BUILD-PLAN.md §6` — **PR8, the final roadmap item** (PR1–PR7 all shipped to origin/main @ `58f64f22`).
> Branch: `feature/warm-hive-pr8`. Merge convention: `--no-ff` (PR5/PR6/PR7 pattern).

---

## 0. Strategic gate — scope fork (resolved by evidence, recommend-and-proceed)

PR8's slot in §6 reads "**full content + identity**." Recon resolved this:

- **Content already shipped.** `apps/www` is a complete Next.js 15 (App Router) landing with
  deliberate, current copy — `app/page.tsx:24-28` documents the live structure as the chosen
  **"N2 IA"** with "the committed flat copy" (hero = *"Be the expert. We'll be the AI."*).
  `messages/en.json` (311 lines) holds the full marketing copy, intentionally **evolved past**
  the older `Waggle Landing.html` reference (current = 5 pillars + comparison/wow beats; the
  reference HTML = 6 pillars + BYO-agent + self-evolving sections). The current copy is the
  newer direction and is committed.
- **Identity is stale.** `app/globals.css:4-26` still carries the **pre-redesign cool palette**
  (`--hive-950:#08090c`, `--honey-500:#e5a000`, blue-grey hive greys, saturated `--status-ai
  #a78bfa`/`--status-healthy #34d399`) and **Inter** as the typeface — none of the warm-Hive
  identity PR1 applied to `apps/web`.

**Ratified scope (recommend-and-proceed unless founder objects):**
**PR8 = identity reskin only.** Port the warm-Hive token values + Hanken Grotesk + honey-accent
discipline + honeycomb/hex motifs onto the existing N2 landing. **Do NOT rewrite copy** to the
older reference HTML. **Do NOT touch benchmark/proof claims** (honest-stats — see §5). Treat the
reference HTML as the source of truth for *visual treatment*, `en.json` as the source of truth
for *copy*.

---

## 1. Design contract (what "warm-Hive" means for the landing)

From `waggle.css §7` (and as implemented in `apps/web` PR1):

- **Dark default** surfaces: `--bg #14110b · --surface #1f1a12` (warm graphite, replaces cool `#08090c`).
- **Honey accent**: `#e9a52c` (replaces `#e5a000`), used *sparingly* — primary buttons, active nav,
  key metrics, focus rings, 1–2 highlight words per headline. Never decorative fills.
- **Type**: **Hanken Grotesk** (display+body, 300–800; headings 600 at `-0.02..-0.03em`) +
  **JetBrains Mono** (mono labels). Replaces Inter.
- **Desaturated semantics**: `--intel #b196dd` (was `#a78bfa`), `--healthy #6cb78c` (was `#34d399`).
- **Motifs**: honeycomb `.05` opacity SVG texture (warm line stroke), hexagon clip-path for the W
  mark / persona tiles, warm shadows + honey glow.
- **Dark-only** for the landing (current site has no light theme; the design specifies both, but
  adding a landing theme toggle is out of reskin scope → deferred, §8).

---

## 2. Current state (grounded, file:line)

| Fact | Evidence |
|---|---|
| Next.js 15.1 App Router, React 19, TS 5.9, **vanilla CSS (no Tailwind)** | `apps/www/package.json:14-24`, `globals.css:2` |
| Tokens = old cool palette + Inter | `globals.css:4-40` |
| Components style via inline `var(--hive-*)`/`var(--honey-*)` → value remap cascades | grep across `app/_components/*` |
| **Hardcoded** hex (bypasses vars) — must fix explicitly | `layout.tsx:38-91` (Clerk), `HeroVisual.tsx:62-309` (SVG), `BrandPersonasCard.tsx:343-417` (`<style>`) |
| Honeycomb SVG uses URL-encoded old hex `%231f2433` | `globals.css:54` |
| Honey rgb literal `229,160,0` in glow/selection/shadow | `globals.css:21,22,25,48` |
| Clerk + Stripe + next-intl wired; legal routes + sign-in/up + account exist | `layout.tsx`, `app/api/stripe/*`, `app/(legal)/*` |
| Single FE test (`BrandPersonasCard.test.tsx`); vitest | `__tests__/`, `vitest.config.ts` |

---

## 3. Decisions (recommend-and-proceed)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Scope | **Reskin, not rebuild** | Content is current/committed (N2 IA, `page.tsx:24`); only identity is stale |
| D2 | Token strategy | **Remap var VALUES 1:1 by scale stop**, keep var NAMES | Components reference vars → one cascade restyles all (PR1 method) |
| D3 | Hardcoded hex | **Literal remap table** applied to `app/**/*.{tsx,ts,css}` | Catches Clerk/SVG/style-block hex + stale fallbacks in one auditable pass |
| D4 | Font | **Hanken Grotesk + JetBrains Mono** via `next/font/google` | Design typeface; `next/font` keeps SSR/perf |
| D5 | Light theme | **Defer** (keep dark-only) | Landing has no toggle today; adding one is out of reskin scope (§8) |
| D6 | Proof/benchmark copy | **Untouched** | Honest-stats — conservative framing is deliberate; upgrading to 87.66 SOTA is a founder call |
| D7 | Deploy/env (Clerk/Stripe prod keys, Vercel) | **Documented, not executed** | EXTERNAL-DEP, founder-provisioned at deploy (§6) |

### Token remap table (old cool → warm-Hive, verbatim from `waggle.css`/`apps/web` PR1)
```
hive  950 #08090c→#0e0c07  900 #0c0e14→#14110b  850 #11141c→#1a160f  800 #171b26→#1f1a12
      700 #1f2433→#272117  600 #2a3044→#4a4030  500 #3d4560→#6b6250  400 #5a6380→#948a73
      300 #7d869e→#c8bfa9  200 #b0b7cc→#d8cfba  100 #dce0eb→#ece3d0   50 #f0f2f7→#f6f1e4
honey 600 #b87a00→#c07e16  500 #e5a000→#e9a52c  400 #f5b731→#f6c45a  300 #fcd34d→#f9d27e
sem   status-ai #a78bfa→#b196dd   status-healthy #34d399→#6cb78c
rgb   honey 229,160,0 → 233,165,44
```

---

## 4. Architecture (do NOT recreate)

- Keep next-intl/Clerk/Stripe wiring, the hero A/B variant resolver infra, the `_data`/`_lib`
  modules, legal routes, sitemap, event taxonomy — all untouched by a reskin.
- Reuse the existing inline-CSSProperties + global-CSS pattern. No Tailwind, no new CSS framework.
- Named warm tokens (`--bg`,`--surface`,`--text`,`--line`, semantics) are *added* alongside the
  remapped `--hive-*`/`--honey-*` scales for future use, but components keep using the scale vars.

---

## 5. No-fabrication contract (F-traps gated off)

| F | Trap | Gate |
|---|---|---|
| F1 | Upgrading proof copy to 87.66 SOTA under cover of "reskin" | Benchmark/proof strings in `en.json` **left byte-identical** |
| F2 | Inventing testimonials (`proof.human_quote` is intentionally empty) | Leave empty |
| F3 | Claiming light theme works when not added | Don't add toggle; note as deferred |
| F4 | Drifting tier prices/names while editing | Pricing copy untouched (color-only) |
| F5 | "Deployed/live" claims | Smoke is local `next dev`; deploy is EXTERNAL-DEP, documented not executed |

---

## 6. EXTERNAL-DEP (founder-provisioned at deploy — not build blockers)

| Dep | Needed by | Absent behavior |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + secret | prod sign-in/up | Build/dev render; auth round-trip needs real keys |
| Stripe live keys + 4 price IDs + webhook secret | prod checkout | `checkout` route already fails honestly without |
| Vercel project + `waggle-os.ai` DNS | go-live | per `docs/launch/drafts/2026-05-12-apps-www-deployment-readiness.md` |

---

## 7. Phased plan + gates

- **A — Tokens & type** (`globals.css`, `layout.tsx`): remap `:root` values, honeycomb stroke,
  honey rgb, font Inter→Hanken+JetBrains Mono, heading styles, Clerk appearance hex→warm.
- **B — Hardcoded-hex sweep** (`HeroVisual.tsx`, `BrandPersonasCard.tsx`, page-level fallbacks,
  `methodology/page.tsx`): apply remap table; re-grep proves zero old-palette hex remains in `app/`.
- **C — Verify**: `tsc --noEmit` (apps/www) 0 · `next build` green · `next lint` clean · `vitest run` green.
- **D — Adversarial review** (workflow): design-fidelity/leak, honest-stats, security(keys), correctness, a11y/contrast. Fix HIGH+MEDIUM.
- **E — Live smoke**: `next dev`, screenshot landing + sign-in, **0 console errors**; commit
  `smoke-pr8-<date>/REPORT.md` + PNGs.
- **F — Ship**: merge `--no-ff`, push origin, handoff + MEMORY.md START HERE.

**Gate (before merge):** tsc 0 · build green · lint clean · vitest green · review HIGH/MEDIUM clear · smoke 0 console errors.

---

## 8. Honesty log / deferred
- Landing stays **dark-only**; warm light-paper theme + a nav theme toggle deferred (design supports it; out of reskin scope).
- Proof copy stays conservative (67.8% AND-of-3); upgrading to the now-public 87.66 SOTA headline is a founder content decision, not this PR.
- Older `Waggle Landing.html` has 6 pillars + BYO-agent + self-evolving sections the live N2 IA folds/omits; reconciling content to the reference is a separate content PR, not this reskin.
- `methodology/page.tsx` + page fallbacks updated for hex consistency though vars already cascade.
