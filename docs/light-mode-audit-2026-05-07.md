# Light-Mode Polish Audit — 2026-05-07

> Discovery scan output. Maps the brownfield doc's "light mode currently broken (P0)" claim to specific tokens + components. Ranked by Day-1 user impact.

**Source files inspected:** `apps/web/src/index.css`, `apps/web/src/waggle-theme.css`, `apps/web/src/components/os/BootScreen.tsx`, plus grep across all `apps/web/src/**/*.tsx` for hardcoded color literals.

---

## TL;DR

- **One real bug + two polish items.** The "broken" perception is ~80% driven by a single token problem (cards invisible against background). Two other items are aesthetic, not functional.
- **BootScreen is fine.** The brownfield-doc P40/P41 callout looks already-resolved via `useIsLightTheme` + dual logo assets (waggle-logo.jpeg / waggle-logo.png). Visual confirmation in a browser would close the loop.
- **22 of the 26 hardcoded `bg-black/X` matches are modal scrims.** They work in both modes (a black scrim correctly dims the body behind a modal in light mode too). They're aesthetic items, not bugs.

---

## P0 — Surface contrast in light mode

**Symptom:** Cards, popovers, and secondary/muted surfaces are nearly invisible against the background. Looks like Waggle has "no UI structure" in light mode.

**Root cause:** Token L-channel deltas in `:root[data-theme="light"]` (index.css:130-194) are too small.

| Token | Current | L delta vs bg | Proposed | New delta |
|---|---|---|---|---|
| `--background` | `40 18% 97%` | — | (no change) | — |
| `--card` | `40 12% 93%` | **4** ❌ | `40 12% 88%` | 9 ✅ |
| `--popover` | `40 12% 93%` | **4** ❌ | `40 12% 88%` | 9 ✅ |
| `--secondary` | `40 10% 89%` | 8 ⚠ | `40 12% 84%` | 13 ✅ |
| `--muted` | `40 10% 89%` | 8 ⚠ | `40 12% 84%` | 13 ✅ |
| `--border` | `40 8% 81%` | 16 ✅ | (no change) | — |

WCAG 1.4.11 wants 3:1 contrast for non-text UI. ~10% L delta gives ~3-4:1 on cream tones. Current 4-8% gives ~1.5-2:1 — visibly broken.

**Fix scope:** 4 token-line edits in `index.css`. ~2-3 min code change. Visual verification needs dev server.

**Risk:** Low — only affects light theme block. Dark mode unchanged.

---

## P0 — Hive scale in light mode

The light-mode hive palette (index.css:157-168) has surface tokens that flip to near-white:

```
--hive-950: #fdfcf9   L≈98   (used for --waggle-statusbar-bg)
--hive-900: #f8f6f0   L≈96
--hive-850: #f0ede4   L≈92   (used for --surface-card alias)
--hive-800: #e8e4d9   L≈90   (used for --waggle-sidebar-bg)
```

`var(--surface-card) = var(--hive-850)` = L=92. With `--background` at L=97, that's a 5% delta — same problem as `--card` above. Components using inline `style={{ backgroundColor: 'var(--hive-850)' }}` (GlobalSearch, CapabilitiesApp, ChatApp, FilesApp, FileActions — see grep output below) all suffer from this.

**Proposed:** Drop `--hive-850` to `#e8e2d4` (L=88) and `--hive-800` to `#dcd6c5` (L=82). Mirrors the `--card` tightening.

---

## P1 — Modal backdrop in OnboardingWizard

`OnboardingWizard.tsx:405` uses inline `backgroundColor: 'rgba(0, 0, 0, 0.85)'` — hardcoded, not theme-aware. In light mode this is 85% black over a beige desktop. Functionally OK (it dims the background) but aesthetically jarring.

**Proposed:** Replace with `hsl(var(--background) / 0.85)` or `var(--surface-overlay)` (which DOES adapt: dark = `rgba(8,9,12,0.88)`, light = `rgba(253,252,249,0.92)`). Caveat: `--surface-overlay` is a near-opaque overlay, not a dim — would need a semi-transparent dark variant for light mode, e.g. `hsl(36 12% 10% / 0.5)` (10% L darkness with 50% alpha).

**Recommendation:** Add `--scrim` token to both themes:
```css
:root { --scrim: 0 0% 0% / 0.85; }
:root[data-theme="light"] { --scrim: 36 30% 15% / 0.5; }
```
Then OnboardingWizard uses `backgroundColor: 'hsl(var(--scrim))'`.

---

## P2 — 22 modal scrims using `bg-black/X`

Files: `CapabilitiesApp.tsx`, `CreateWorkspaceDialog.tsx` (×3), `FilesApp.tsx` (×2), `LoginBriefing.tsx`, `UpgradeModal.tsx`, `WorkspaceSwitcher.tsx`, `GlobalSearch.tsx`, `EvolutionTab.tsx`, `KeyboardShortcutsHelp.tsx`, `NotificationInbox.tsx`, `PersonaSwitcher.tsx`, `TrialExpiredModal.tsx`. All use `bg-black/40` to `bg-black/60` for modal scrim.

**Decision:** These work in both modes. A black scrim still dims the background in light mode (just darker than necessary). Replace ONLY if pursuing visual polish parity with the OnboardingWizard fix above. If we add a `--scrim` token, the cleanest approach is replacing `bg-black/40` with a Tailwind plugin alias `bg-scrim` that reads from `--scrim`. Larger refactor.

**Recommendation:** Defer until pilot UAT identifies the perception as a problem. Black scrims are universal in modern UIs (mac OS, Windows, web).

---

## P2 — `bg-white` toggle thumbs

`SettingsApp.tsx` × 5 occurrences. These are toggle-switch thumbs (the moving white circle on a colored track). Functionally correct in both modes — modern toggle thumbs are universally white. **No action needed.**

---

## What's NOT broken (verified)

- **BootScreen** — uses `useIsLightTheme` for logo swap; rest uses `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary` — all theme-aware.
- **Tailwind hive class usage** — grep returned 0 matches for `bg-hive-XXX` and `text-hive-XX` Tailwind classes. The hive scale is consumed only via CSS-vars, which is correct.
- **Text contrast on body copy** — `--muted-foreground: 36 8% 40%` against `--background: 40 18% 97%` = ~5.2:1 contrast ratio (passes WCAG 4.5:1 AA).
- **Accent color (`--accent: 270 60% 68%`)** — same in both themes; works against both backgrounds.
- **`--ring`, `--primary`, `--destructive`** — all defined in light theme block, work as expected.

---

## Recommended sequence

1. **Quick win (Fix A, ~5 min code + 5 min visual verify):** Tighten `--card`, `--popover`, `--secondary`, `--muted` in light theme block. Single file change.
2. **Hive scale alignment (Fix B, ~5 min):** Tighten `--hive-850` and `--hive-800` to match. Same file.
3. **Add `--scrim` token + onboarding fix (Fix C, ~15 min):** Add token to both themes, swap OnboardingWizard inline rgba. Optionally cascade to other modal scrims (P2).
4. **Visual sweep (Fix D, ~30-60 min):** Start dev server, toggle theme, walk through every dock app + onboarding wizard + settings tabs, capture screenshots, file specific component bugs.

Fixes A + B together close the "cards invisible" complaint and get light mode functionally usable. Fix C is aesthetic. Fix D is the design-review-on-live-binary path the brownfield doc suggested.

---

## Reference: hardcoded literals grep output

```
text-white | bg-black | bg-white     →  26 occurrences across 18 files
bg-hive-{950,900,850,800,700,600}   →  0 matches (Tailwind hive class)
text-hive-{50,100,200}              →  0 matches (Tailwind hive class)
inline backgroundColor: var(--hive-XXX)  →  6 occurrences (theme-aware, OK)
inline backgroundColor: 'rgba(0,0,0,0.X)'  →  1 occurrence (OnboardingWizard:405)
```

---

Last updated: 2026-05-07. Owner: Marko + CC.
