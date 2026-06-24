# PR8 Live Smoke — Warm-Hive `apps/www` landing reskin (2026-06-24)

**Branch:** `feature/warm-hive-pr8` @ `e44c83e9` (+ this report)
**Server:** `next dev -p 3100` (fresh restart on clean `.next`; loaded `apps/www/.env.local`, Clerk `pk_test_` dev key present)
**Viewport:** 1440×900 (Chrome DevTools MCP)

## Result: PASS — warm-Hive identity rendered on all surfaces, 0 console errors

| Surface | URL | Console | Evidence |
|---|---|---|---|
| Landing (hero) | `/` | **0 errors** (1 expected Clerk dev-key *warning*) | `01-landing-hero.png` |
| Clerk sign-in | `/sign-in` | **0 errors** (1 expected Clerk dev-key *warning*) | `02-signin-clerk-warm.png` |
| Pricing | `/#pricing` | — | `03-pricing.png` |

> The only console message on each page is Clerk's benign "loaded with development keys" warning — expected with the `pk_test_` dev key; production uses live keys (EXTERNAL-DEP). **Zero errors.**

## What the screenshots confirm

**01 — Landing hero:** warm graphite background (was cool `#08090c`), honey `#e9a52c`
highlight on "We'll be the AI." + the eyebrow + Download CTA + the hive-viz hexagon and
its four provider nodes (claude·sonnet / gpt·5 / qwen·local / gemini·2.5); **Hanken Grotesk**
display type; JetBrains Mono in the viz chrome (`~/.waggle/hive · live`, `local · signed · 42ms`,
stat labels via the now-live `var(--mono)`); subtle warm honeycomb texture. No cool blue-grey.

**02 — Clerk sign-in:** the prebuilt `<SignIn/>` card is fully warm — warm graphite card +
border, honey `#e9a52c` **Continue** button with near-black text, honey "Sign up" link,
GitHub + Google social buttons (dashboard-driven; Apple off, matching the apps/web instance),
warm body text. Confirms the `layout.tsx` Clerk `appearance` hex remap.

**03 — Pricing:** honey "PRICING" eyebrow + "Honest pricing" highlight; three warm tier cards
(Solo $0 / **Pro $19/mo — honey-bordered "MOST POPULAR"** / Teams $49/seat/mo · 3-seat min);
honey checkmarks + "save 17%" annual pill; warm CTAs. **Prices/copy byte-identical to pre-PR8.**

## Honest-stats held (no-fabrication contract §5)
- Proof section still shows the **conservative** framing (67.8% "three rivals agree", 0.3-pt
  convergence, 87.5% trio-strict single-hop) — **not** upgraded to the 87.66 SOTA headline.
- `proof.human_quote` still empty; tiers/prices unchanged; all section copy intact (verified
  live in the accessibility snapshot + `git diff` shows `messages/en.json` unchanged).

## Not exercised (deliberate)
- Real OAuth round-trip (Google/GitHub redirect) + email-code verify — needs real creds (manual QA, carried from PR7b P1).
- Real Stripe checkout charge — hosted flow; live keys are EXTERNAL-DEP.
- Light theme — landing is intentionally dark-only (deferred, see PR8-BUILD-PLAN §8).

## Gates at smoke time
`tsc --noEmit` 0 · `next build` green (14/14 pages) · `next lint` clean · `vitest` 10/10 ·
comprehensive hex re-audit: **zero non-warm hex** under `apps/www/app`.
