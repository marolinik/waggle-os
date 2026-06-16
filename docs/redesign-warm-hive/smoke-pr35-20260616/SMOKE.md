# PR3.5 Memory-Trust — Live Smoke Evidence (2026-06-16)

Branch `feature/warm-hive-pr3` @ `876737e6`. Live browser smoke via chrome-devtools
MCP against the running dev env (FE vite hot-reload on the page origin; API base
`:3333`). Screens captured to this dir.

## Verdict: PASS (UI) — 0 console errors, dark + light

| # | Screenshot | What it proves |
|---|---|---|
| 01 | `01-trust-manage-dark.png` | Trust is the **default Memory view**; segmented Manage/Why; editorial hero; 4-stat bar with **honest "—" gating** on "High confidence & fresh" (no confidence in the set); All/Stale/Needs-confirm chips + disabled "Forgotten"; 3 real rows (M-47/M-45/M-1) with ConfidenceRing (—/unknown), `⬡ M-id · source: you · ● fresh`, M-1 = "aging — added 9w ago"; principle footer. |
| 02 | `02-trust-why-dark.png` | Why view: hero ("PROVENANCE · ACCOUNTABILITY" + quote H1), honest empty state ("Open a memory's ⬡ trace…"), Why-specific principle. |
| 04 | `04-trust-manage-light.png` | Same Manage view in **light** — pure token swap (PR1 architecture), honey accent + warm-light tokens intact. |

Also verified interactively (a11y snapshots):
- Cross-view flow: Manage row → edit drawer (Correct editor + EvidencePanel "source: user_stated" + Save/Why/Forget) → "Why is this here?" switches to the Why view and loads that memory's trace.
- a11y: ConfidenceRing `role=img` + aria-label; row buttons aria-labelled; segmented = toggle buttons (aria-pressed); "Forgotten" chip aria-disabled with rationale.
- Console: **0 errors / 0 warnings** across Manage, Why, drawer, dark + light.

## Constraint — live verification of the NEW sidecar routes deferred

The running `:3333` sidecar (PID 28776) **started 2026-06-12 22:53 — 4 days before
PR3.5** (first PR3.5 commit `c4794737`, 2026-06-16 14:13). `tsx` does not hot-reload,
so the running sidecar does **not** register PR3.5's new routes. Therefore, live:
- `GET /api/memory/:id/trace` → the Why view showed its **error** state ("Not found")
  for M-1 instead of the honest `{trace:null}` empty state — **because the route is
  unregistered on the June-12 sidecar, NOT a code bug.** With the route present, M-1
  (no `trace_id`) returns `{trace:null}` → the "No trace is linked to M-1" empty state.
- `POST /api/memory/:id/confirm` and the **Part 1A** `frame.source` projection on the
  `/api/workspaces/:id/context` route likewise need a fresh sidecar to see live.

These are all **unit-verified** (memory-center 25/25 incl. /confirm + /trace null/404
paths; workspaces.ts projection covered by server tsc) and the FE calls them correctly.
**To verify the new routes end-to-end: restart the sidecar from this working tree**, then
re-open `/memory` (Trust) and a memory's "Why is this here?".

## Notes
- Rows show `source: you` because the seeded/identity memories are genuinely
  `user_stated`. The PR3.5-review write-fix stamps NEW agent memories `agent_inferred`,
  so agent-derived rows will read "agent" once such memories exist.
- The two-nav-layer (MemoryCenterApp tab bar + Trust segmented control) and the
  Hive-DS-vs-warm token seam are a known, documented integration trade (review MED,
  deferred — broader restyle).
