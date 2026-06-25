# QA Polish — Live Smoke (2026-06-24/25)

**Branch:** `fix/qa-polish-2026-06-24` (8 commits) · **Sidecar:** restarted on :3333 with the new server code (esbuild 0.28.0 binary realigned to tsx's host — env fix, `--no-save`) · **UI:** vite :8080 (HMR). Viewport 1440×900.

## Result: PASS — every smoked fix renders correctly, **0 console errors** on all surfaces.

| Fix | Surface | Evidence | Result |
|---|---|---|---|
| **KG graph P0** | `GET /api/memory/graph` (live) | — | **3562 nodes** real types (concept/org/person/project/technology, NOT "unknown"), **31837/31837 edges resolve to nodes** |
| **KG graph P0** | `/memory?tab=graph` | `smoke-01-kg-graph-fixed.png` | "54/54 nodes · **312/312 edges**" (was 0/312), nodes colored by type, legend "Concept 44 · Technology 5 · Organization 4 · Person 1" (was "Unknown 54"), real labels |
| **cron P1** | Mission Control | `smoke-02-mission-control.png` | "Wednesdays at 10:00 AM", "Every day at 5:00 AM", "Sundays at 4:00 AM" — no raw cron |
| **weaver P2** | Mission Control | `smoke-02-mission-control.png` | "Memory Weaver — Status: **Active**" (was blank) |
| **trust relabel P1** | `/memory?tab=trust` | `smoke-03-trust-relabel.png` | "451" total headline + subordinate chips (1 fresh · 366 stale · 448 awaiting) + "Overlapping views — a memory can be counted in more than one." |
| **suggestions P0** | Home briefing | `smoke-04-home-suggestions.png` | "Egzakta Group Positioning in Serbian Consulting Market (June 2026)" (no `\| … \|` pipe leak), complete phrases, tail-truncated ellipsis |
| **cmdK label P3** | Sidebar | `smoke-01…png` | "Ctrl K" on Windows (was hardcoded "⌘K") |

## Verified at the API layer (live sidecar)
- `GET /api/memory/graph?scope=personal` → `{nodes:[{id,label,type}], edges:[{source,target,relationship}]}`; **all-unknown? False**; **edges resolving to nodes: 31837/31837**.

## Not exercised (deliberate)
- Node-click detail panel + filter narrowing (recon confirmed both are wired; they self-resolve once nodes carry real labels/types — verified data is now correct).
- Real OAuth / Stripe / agent-run notification round-trips (need live creds / a real agent run).
- Timeline 24h window with NEW events (the ISO-storage fix applies to events emitted after the restart; existing space-format rows age out).

## Gates at smoke time
server tsc 0 · apps/web tsc 0 · apps/web FE 1160/1160 · touched server suites 281/281 · cron 33 · command-center 32.
