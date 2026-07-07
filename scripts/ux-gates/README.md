# ux-gates — the UX CI gates

Four composable gates. Three hold the **Pillar 4 AA floor** (see
`docs/ux-refactor/path-to-9-2026-07-07.md` §Pillar 4 and the Phase-A spec
`path-exec-phase-A-spec-2026-07-07.md` → Lane G); the fourth (`warm-interaction`)
holds the **Pillar 2 instant-power-feel** hard gate (§Pillar 2 + §3, Phase-B Lane
G2). Token-pair math buys one clean round; the guard + runtime pass buy a *floor*
by closing the generation vector and modelling composition; the warm-interaction
gate measures the returning-user launch is fast and INTERACTIVE.

| gate | npm script | what it proves | needs |
|---|---|---|---|
| `contrast-tokens.mjs` | `npm run ux:contrast` | every text/affordance **token** meets its WCAG floor over every allowed surface, both themes | nothing (static) |
| `text-color-guard.mjs` | `npm run ux:color-guard` | no **new** off-token text colours are introduced (ratchet) | nothing (static) |
| `contrast-runtime.mjs` | `npm run ux:contrast-runtime` | text & focus indicators pass **after composition** (opacity stacks, wallpaper) | a running dev server + `playwright` |
| `warm-interaction-gate.mjs` | `npm run ux:warm-gate` | a seeded returning user lands on interactive content fast (home ≤1000ms, brand flash ≤500ms, composer typable at paint) + a cold start (sidecar down) still paints from cache and accepts typing | a running dev server + sidecar + `playwright` |

The two static gates are dependency-free; the runtime + warm-interaction gates
need Playwright (already a dev dependency). They live in `scripts/**`, which the
root ESLint config intentionally ignores (same as every sibling tooling script),
so `eslint .` never lints them.

---

## 1. `contrast-tokens` — token-pair math

Parses `apps/web/src/index.css` + `apps/web/src/waggle-theme.css`, resolves the
full custom-property graph (hex, `hsl(var(--x))`, `var()` chains) for the **dark**
`:root` and **light** `:root[data-theme="light"]` themes, and asserts:

- `--text` / `--text-2` / `--text-muted` / `--text-tertiary` ≥ **4.5:1** over
  `--bg`, `--bg-2`, `--surface`, `--surface-2`, `--surface-3`.
- `--focus-ring` / `--line-affordance` ≥ **3.0:1** (WCAG 1.4.11 non-text) over the
  same surfaces — the **light-theme honey ring** is the known risk (honey-on-ivory);
  the gate measures it explicitly.

`--text-dim` is **informational only** — it is the intentional sub-AA "dim" tier
that `--text-tertiary` supersedes; it is measured and printed but never enforced.

Tokens the spec expects that are **not yet defined** (e.g. while a parallel lane is
still landing `--text-tertiary`/`--focus-ring`/`--line-affordance`) are reported as
`⚠ PENDING` — loud but non-fatal — so the gate is green today and auto-enforces them
the moment they exist. Exit 1 on any **defined** token below its floor.

```
npm run ux:contrast
```

## 2. `text-color-guard` — the generation-vector ban (ratchet)

Scans `apps/web/src` (`.ts/.tsx/.js/.jsx`; tests, the token source files, and the
motion-spec demo page excluded) for the vectors that regenerate off-token text
colour:

- `hex-class` — `text-[#…]`
- `palette-class` — `text-hive-<n>`
- `inline-hex` — `color|background|backgroundColor: #…`
- `low-opacity-token` — `text-<text-tier>/<N>` or `text-[var(--…)]/<N>` with **N < 60**

`text-<token>/N` at **60–99%** is a *warning* (allowed, listed), never a failure.

It is a **ratchet, not a big-bang**: `color-guard-baseline.json` freezes today's
grandfathered instances (a multiset keyed by `file|kind|snippet`); the gate fails
only on **new** instances beyond the frozen counts. When an intentional, reviewed
change adds or removes an offense, re-freeze:

```
npm run ux:color-guard                                  # check (CI)
node scripts/ux-gates/text-color-guard.mjs --update-baseline   # re-freeze
node scripts/ux-gates/text-color-guard.mjs --json       # machine output
```

> **Baseline hygiene:** the shipped baseline is frozen at a point in time. After
> all of a wave's lanes merge, re-run `--update-baseline` on the merged tree and
> commit the result so the ratchet reflects the final state.

## 3. `contrast-runtime` — composition-aware (Playwright)

Token math proves colours are AA in isolation; this proves it **after
composition**. Against a running dev server it visits each judged surface
(`/home`, `/workspaces`, `/memory`, `/agents`, `/marketplace`, `/settings`, a
workspace chat) in **both themes**, and for every visible text node computes the
*effective* fg/bg:

- ancestor `opacity` is composited up the tree;
- translucent background layers are composited to an effective colour;
- when an ancestor paints a **background-image** (wallpaper / gradient), a real
  screenshot pixel is sampled at the element (decoded from a 1×1 PNG via `zlib` —
  no image dependency) and used as the background.

It reports text below **4.5:1** (below **3.0:1** for WCAG-large text: ≥24px, or
≥18.66px bold) and, after tabbing through up to 10 interactive elements per
surface, focus rings below **3.0:1** vs their adjacent effective background.

Output: a JSON report (`.contrast-runtime-report.json`, git-ignored) + a human
table. It is a **ratchet** against `contrast-runtime-baseline.json` and exits 1 on
new failures.

```
# start a dev server first (npm run dev, or the playwright webServer build)
npm run ux:contrast-runtime
node scripts/ux-gates/contrast-runtime.mjs --surfaces=home,settings   # subset
node scripts/ux-gates/contrast-runtime.mjs --update-baseline          # seed/freeze
WAGGLE_UX_BASE_URL=http://127.0.0.1:3333 npm run ux:contrast-runtime  # custom base
```

Exit codes: `0` clean · `1` new contrast failure(s) · `2` infra (no server / no
`playwright`).

**Seeding:** the shipped runtime baseline is empty. Seed it with `--update-baseline`
against a **fresh build of the current source** (not a stale running server), review
the frozen findings, fix the real regressions, then commit the baseline.

**Sampling caveat:** wallpaper sampling reads a single pixel in the text element's
top-left leading (line-height space above the cap height) — likelier background than
a glyph, but approximate. The ratchet absorbs any initial approximation; only *new*
failures fail the gate.

## 4. `warm-interaction` — the instant-power-feel gate (Playwright)

The Pillar 2 hard gate. It mirrors the capture-kit convention of a **seeded
returning user** — `waggle-booted` + `waggle_onboarding_complete` +
`waggle:onboarding` (tier `power`) + `waggle:login-briefing-dismissed` in
localStorage, **no bypass query params** — i.e. the authentic day-30 morning
launch, not the E2E `?skipOnboarding` path. The seed is printed in the output so a
reader knows exactly what user state was measured. All timings use the page's own
`performance.now()` (ms since navigation start), captured in the same frame the
target element appears.

**WARM gate** (healthy sidecar) — app-start →

- **home content visible** — `[data-testid="home-cockpit"|"home-cockpit-empty"]`;
  FAIL if > **1000ms**.
- **brand flash** — the boot-screen dwell; a correctly-seeded warm return skips
  boot entirely → **0ms**. FAIL if > **500ms**.
- **composer accepts a keystroke** — navigates to the first workspace chat and
  types into the composer the moment it attaches (input-during-warmup). FAIL if
  the first keystroke is rejected (a disabled/gated textarea).

**COLD-start variant** (all `/api/**` aborted — sidecar "down") — a warm visit
first (to settle the disk cache), then reload:

- **cachedPaint** — cached home content still renders without the sidecar (Lane H
  `home-cache.ts`).
- **typingQueues** — the composer still accepts typing with the sidecar down
  (Lane C input-during-warmup, cold path).

The cold contracts are a **ratchet** against `warm-interaction-baseline.json`: the
gate exits 1 only when a contract the baseline records as landed (`true`)
regresses to `false`. `--strict` enforces *every* cold contract (flip once Lane
H+C fully merge). The shipped baseline is absent by design — seed it during the
verify/merge stage against a stable server, review the frozen state, then commit.

```
# start a dev server (npm run dev on :8080) AND the sidecar (npm run dev:server on :3333)
npm run ux:warm-gate
node scripts/ux-gates/warm-interaction-gate.mjs --report-only    # print table, exit 0 (don't gate)
node scripts/ux-gates/warm-interaction-gate.mjs --warm-only      # skip the cold pass
node scripts/ux-gates/warm-interaction-gate.mjs --strict         # enforce every cold contract
node scripts/ux-gates/warm-interaction-gate.mjs --update-baseline # seed/freeze the cold ratchet
WAGGLE_UX_BASE_URL=http://127.0.0.1:3333 npm run ux:warm-gate    # built app (single-origin)
```

Exit codes: `0` clean · `1` warm threshold breach / cold contract regression (or,
under `--strict`, any cold contract not holding) · `2` infra (no server, no
`playwright`, or home content never reached — an auth/sidecar problem).

**Timing caveat — measure on a representative build.** The warm timing budgets are
*production-representative*. The vite **dev** server (`:8080`, the default and the
arc's live-source target) adds on-demand module-compile overhead, so home-content
timing there runs ~2–3s regardless of the cache — valid for the brand-flash,
composer, and cold **contracts**, but not for the sub-1s timing budget. The built
app (`:3333`, single-origin) is closer, but in a **headless** browser its
production Clerk auth is blocked by CSP (`failed_to_load_clerk_js_timeout`), which
inflates timing and degrades the chat. A valid sub-1s timing pass therefore needs
an environment where Clerk auth resolves (the Tauri shell, or a browser with the
Clerk origin allow-listed). The gate is correct; point it at the right build for
the official round measurement.

---

## CI wiring (deferred)

Per the Lane G/G2 spec these scripts are **not** wired into `.github/workflows` yet
— that is a follow-up once they are proven stable in local/reviewer runs. When
wired: `ux:contrast` and `ux:color-guard` are cheap and belong in the lint/test
job; `ux:contrast-runtime` and `ux:warm-gate` need a built app + dev server (reuse
the Playwright `webServer` block) and a committed, seeded baseline.
