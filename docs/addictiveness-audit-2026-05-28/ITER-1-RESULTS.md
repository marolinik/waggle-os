# Iteration 1 Results — 2026-05-28

## Shipped
- **F1** · `LoginBriefing.tsx` empty-state hook for day-0 users — replaces bare "No active workspaces" line with 3 dashed-border demo memory cards labelled "Here's what I'll remember for you", plus a hint about importing existing ChatGPT/Claude exports. New testid: `login-briefing-empty-hook`.
- **F2** · `StatusBar.tsx` memory-frames "trophy" — adds a `🧠 N` chip after the model name showing total memory frames across workspaces, with a tooltip explaining why the count matters. Self-fetches `adapter.getMemoryStats().total.frames` and refreshes every 60s. Hidden for true zero-frame users (their hook is F1 instead). New testid: `statusbar-memory-count`.

Live verification (Chrome DevTools probe): `{found: true, text: "5", visible: true}`.

## Score movement (modest, honest)
| Persona | Baseline | After F1+F2 | Δ | Notes |
|---|---|---|---|---|
| P1 Greta | 1 | 2 | +1 | F1 dim 3 first-session hook ticks. F2 hidden (zero-frame). |
| P2 Hassan | 1 | 2 | +1 | F1 dim 3. F2 hidden until first chat. |
| P3 Sarah | 5 | 5 | 0 | Has workspaces → F1 doesn't fire. F2 makes growth visible but dim 8 already passed in baseline scoring. |
| P4 Imran | 6 | 6 | 0 | Same |
| P5 Lucas | 6 | 6 | 0 | Same |
| P6 Daniel | 6 | 6 | 0 | Same |
| P7 Anya | 6 | 6 | 0 | Same |
| P8 Marko | 8 | 8 | 0 | F2 visible (`🧠 5`) but dim 8 already passed |
| P9 Priya | 6 | 6 | 0 | Same |
| P10 Tomás | 5 | 5 | 0 | Same |
| **avg** | **5.0** | **5.2** | **+0.2** | F2 is qualitative polish — visible growth surface but doesn't open new rubric cells |

## Why so modest
F1 only fires for genuinely-empty users (P1, P2 of the rubric). The other 8 personas already have workspaces / memory and don't see the empty state. A bigger lift requires the Tier-2 features documented in `FEATURE-REQUESTS.md`.

## Honest read on "10/10 across all 10 personas"
- Not achievable via surgical UI fixes alone — dim 1 (external trigger) is a real product surface (browser extension OR messaging gateway OR daily-digest channel).
- The path to honest 10/10 is documented in FEATURE-REQUESTS.md — ~7 sprints of net-new product work.
- This iteration: ships F1, documents the path, refuses to game the score.

## Next surgical iteration candidates (still no new product surfaces)
- **F3** · "Try a sample workspace" button in OnboardingWizard — needs sample-workspace JSON bundle. ~1 day. (mapped to FR-5 in FEATURE-REQUESTS.md)
- **F4** · Coverage-compass tile in Cockpit — "Waggle replaces: ChatGPT / Notion AI / Gamma" with checkmarks. ~2 hours. (mapped to FR-8)
- **F5** · OnboardingTooltips augmentation — teach memory recall affordance in 30s.

## Decision required from user before continuing
The honest path to 10/10 across all 10 personas requires the Tier-2 items in `FEATURE-REQUESTS.md` (browser extension, Telegram digest, public skill registry, etc.). These are net-new product surfaces, not surgical UI patches — ~7 sprints of work total.

Options:
1. Continue with surgical fixes only (F3, F4, F5) — lifts avg from 5.2 → ~6 but caps before 10/10.
2. Authorise Tier-2 product work — net-new surfaces that close the externall-trigger gap. Each is multi-day.
3. Adjust rubric or persona set — if some dims/personas are out of strategic scope.

Iter-1 is committable as-is.
