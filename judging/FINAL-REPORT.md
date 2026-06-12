# UX Habit-Loop Mission — Final Report (2026-06-12)

## Outcome in one line

Three full judge rounds drove ~60 confirmed UX defects to fixed-and-test-locked across 6 commits,
lifting the product from "magic moment ruined by self-contradiction" to "coherent, honest,
memory-first experience" — but the acceptance bar (five personas × five criteria, all 5/5) is
**structurally unreachable within one session**, for reasons documented below with evidence.

## Scorecard across rounds (clarity / knows-me / growth / return / friction)

| Judge | Round 1 | Round 2 | Round 3 | Complaints R1→R3 |
|---|---|---|---|---|
| Complete novice | 4/4/2/3/2 | 4/4/3/4/2 | 4/4/2/4/2 | 11 → 11 |
| Casual professional | 4/4/2/4/3 | 4/4/2/4/3 | 4/4/3/3/2 | 9 → 8 |
| Power user | 4/4/2/3/2 | 4/4/3/4/2 | 4/4/3/4/3 | 11 → 7 |
| Junior developer | 4/4/3/4/2 | 4/4/3/4/3 | 4/4/3/4/3 | 12 → 7 |
| Senior skeptic | 4/3/2/4/2 | 4/3/2/3/2 | 4/4/2/3/2 | 10 → 7 |

Trend: total complaints fell 53 → 52 → 40; several criteria rose (skeptic "knows me" 3→4;
power/junior to 18/25); **no cell reached 5 in any round**. Each fresh panel mined a finer
stratum of complaints once the prior stratum was fixed.

## What shipped (all on `main`, verified by 3 independent fresh-context verifier PASSes)

- `b508583` — habit-loop fixes: upNext dedup + future-only, assessment upsert, curated Memory
  default, login-briefing 30-min cooldown.
- `72fedf7` — round-1 fixes: recency truth (one lastActive source; deduped highlights),
  chat markdown rendering (XSS-test-locked), jargon sweep (Autopilot, plain-words brag,
  dock tooltips, humanized tool events), Agent Center contradiction fix, identity
  merge-on-update, profile identity replace-on-update, 30-day suggestion window.
- `0ffd938` — highlight markdown-token strip + evidence recapture.
- `8996f7e` — round-2 fixes: weaver session-distill replace-on-update (root cause of the
  11-duplicate session-summary nest), zero-data assessment skip, all-minds honest totals,
  skill-preview descriptions, "Import my history", both-superpowers onboarding copy,
  friendly schedule promises, Automation Overview panels, content-gated "working on".
- `addb75d` — **founder-directive mind-isolation contract**: cross-mind stats are explicit
  opt-in (`?scope=all-minds`), counts-only, default back to personal-only; 3 contract tests.
- Final batch — fleet spawn: `auto`/`default` model sentinels resolved to the runtime model
  (the literal string `auto` was 404ing at the provider), human-readable failure message
  instead of raw JSON in chat, Memory added to the novice dock, "Spawn Agent"→"New Agent",
  platform-aware Ctrl+K glyph. The Editorial Critic agent then ran successfully for real
  (3,898-char critique applying the Q3 editorial direction recalled from workspace memory).

Gates at close: FE suite 944/944 · server-local 920/920 (+3 isolation tests) · weaver 31/31 ·
tsc 0 across server + apps/web. Verifier reports: `judging/verifier-report.md`,
`judging/round2/verifier-report.md`, `judging/round3/verifier-report.md` — all PASS, zero
scope creep, zero new dependencies.

## Why unanimous 5/5 is structurally unreachable in-session (evidence)

1. **The growth criterion requires longitudinal reality.** "Visible agent growth" at 5 needs
   weeks of genuine evolution runs, agent run history, and produced artifacts. Staging it is
   detected and penalized: round-2 skeptic complaint #9 called the (genuinely created) agent
   "a prop placed on the set an hour before the audience arrived." Real evidence takes real
   time; staged evidence scores worse than none. The judge-facing fix that remains code-shaped
   (the `/api/evolution/run` endpoint hanging — see residuals) unblocks the pipeline but not
   the history.
2. **The rubric makes 5 the no-caveat grade for adversarial reviewers.** Judges are instructed
   that any concrete complaint caps a criterion at 4 — and instructed to find concrete
   complaints. Across three rounds, fixing a stratum of complaints surfaced a finer stratum
   (raw markdown in chat → raw markdown in list previews → hexagon-wallpaper ratios and
   copy-tone nits). Complaint counts fell monotonically, scores plateaued at 4.
3. **Personas contradict each other.** The novice demands the model id be hidden; the power
   user uses it. Round-1 skeptic demanded machine activity NOT count as "active"; round-2
   skeptic flagged "away 10 days" as false BECAUSE machine activity had occurred. Any fixed
   choice draws a complaint from one persona.

## Remaining residuals (honest list)

- `/api/evolution/run` (synchronous GEPA) hangs beyond 9 minutes even at minimal budget
  (pop 2 / gen 1) with no persisted run and no error — needs its own debugging arc.
- Agent run failures don't surface on Agent Center health (skeptic R3 #2) — only in chat +
  Events; a status surface for failed runs is future work.
- Sparse-data screens (Memory/Agent/Evolution centers) read as wallpaper at low data volume;
  a deliberate low-data layout is a design task, not a copy fix.
- "Writer demo — Anua" reported twice by judges is a font-rendering artifact of the PNG
  downscale (the DOM and API both say "Anya") — not a data or code defect.
- Round-3 verdicts and verifier report live in `judging/round3/`.
