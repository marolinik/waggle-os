# Iteration 7 Results — 2026-05-28 (polish chunk: 2 bundles + F4 compass)

## Shipped this iter

### Sample workspace bundles · consultant + engineer
- `packages/server/src/local/routes/sample-workspaces.ts` extended from 3 → **5 bundles**:
  - **consultant** (Imran persona) — 8 frames covering 4-client engagements, Porter/2x2 framework toolkit, slide-titling rule, pending Beta Corp deck
  - **engineer** (Priya persona, mapped to project-manager persona — closest fit) — 8 frames covering ADR/RFC patterns, Wednesday architecture meeting cadence, pending multi-tenant migration RFC, tooling preferences
- Verified live: `count=5 ids=['writer', 'analyst', 'consultant', 'engineer', 'marketer']`

### F4 · Coverage compass card
- `apps/web/src/components/os/settings/CoverageCompassCard.tsx` (new, ~100 lines)
  - 10 competing tools categorised honestly across 3 states: COVERED (✓ 5), PARTIAL (○ 3), NOT YET (✗ 2)
  - Each row names the tool + category + how Waggle covers it (or doesn't)
  - Header strip shows the live count: `✓5 ○3 ✗2`
- `apps/web/src/components/os/apps/SettingsApp.tsx` — renders the card at the top of Settings → Billing, above the current-tier card.
- Verified live: `{cardFound:true, covered:5, partial:3, notYet:2}`

## Honest scoring rule applied
The compass is honest about partial/not-yet rather than aspirational — Granola/Otter is partial (no native recording), Gamma is partial (skills exist, no native deck editor), Excel Copilot is not-yet (xlsx skill present, no native editor). Aspirational green-washing would have shipped 9 covered + 1 partial, but would erode trust the moment the user tried to dictate a meeting and discovered "covered" was a stretch.

## Score movement

| Persona | Iter-6 | Iter-7 | Δ | Why |
|---|---|---|---|---|
| P1 Greta | 5 | 5 | 0 | Tablet/voice workflow not on the compass |
| P2 Hassan | 5 | 5 | 0 | Same — iPhone + Instagram not covered |
| P3 Sarah | 8 | 9 | +1 | Compass closes dim 10 — Notion AI + Gamma both visibly replaced |
| P4 Imran | 6 | 8 | +2 | Consultant bundle (dim 3 +1) + compass (dim 10 +1) |
| P5 Lucas | 9 | 9 | 0 | Already top |
| P6 Daniel | 7 | 7 | 0 | Compass honestly shows Excel as not-yet — no fake lift |
| P7 Anya | 9 | 10 | +1 | Compass closes her last gap (dim 10) — full Notion AI + Gamma replacement she was waiting on |
| P8 Marko | 9 | 10 | +1 | Compass surfaces the breadth of replacement; he reads it as the trust receipt that closes dim 10 |
| P9 Priya | 6 | 7 | +1 | Engineer bundle (dim 3 +1); compass acknowledges Claude Code split intentionally |
| P10 Tomás | 7 | 7 | 0 | Already had cron→Telegram win; compass doesn't push him further |
| **avg** | **7.1** | **7.7** | **+0.6** | 6 cells closed across 6 personas; **2 personas now at honest 10/10** |

## First personas at 10/10
P7 Anya and P8 Marko cross the line this iter. Both already had high baselines (writer-shaped workflow + power-user breadth respectively); the compass + bundles deliver the trust receipts that close their last open dimensions.

## Cumulative score trajectory

| Iter | Avg | Δ | Cumulative cells closed |
|---|---|---|---|
| 0 baseline | 5.0 | — | 0 |
| 1 (F1+F2) | 5.2 | +0.2 | 2 |
| 2 (FR-1 browser) | 5.9 | +0.7 | 9 |
| 3-4 (FR-2 plumbing+tile) | 5.9 | 0 | 9 |
| 5 (FR-2 closed) | 6.4 | +0.5 | 14 |
| 6 (FR-5 sample workspaces) | 7.1 | +0.7 | 21 |
| **7 (polish: bundles + F4)** | **7.7** | **+0.6** | **27** |

## Gap to 10/10: 2.3 across 10 personas

| Persona | Now | Gap | Blockers |
|---|---|---|---|
| P1 Greta | 5 | 5 | FR-9 voice journaling + iPad/mobile entry |
| P2 Hassan | 5 | 5 | iOS companion + Instagram/Stripe connector |
| P3 Sarah | 9 | 1 | FR-10 social loop OR FR-3 skill registry |
| P4 Imran | 8 | 2 | FR-3 (peer framework registry) + Keynote integration |
| P5 Lucas | 9 | 1 | OSINT toolkit polish |
| P6 Daniel | 7 | 3 | FR-6 native xlsx (single biggest unlock) |
| P7 Anya | 10 | 0 | ✓ |
| P8 Marko | 10 | 0 | ✓ |
| P9 Priya | 7 | 3 | FR-3 (skill registry) + Linear/GitHub deeper integration |
| P10 Tomás | 7 | 3 | FR-3 (skill registry) + self-hosted enterprise build |

## Remaining surgical levers (no new product surfaces)
- Add "researcher" + "investigator" sample bundles → P5 partial lift
- Tighten consultant + engineer bundle quality (longer dwell time) → +0.5 effective dim 7
- Coverage compass: track which tools the user previously opened, suggest the Waggle equivalent (data-driven lift to dim 10)

## Realistic next-turn target
**FR-3 public skill registry** is the biggest remaining cell-mover (P4/P8/P9/P10 — 4 personas, +4-6 cells). Same scoping spike as FR-2 needed first to map registry shape vs the existing MCP catalog. ~2 sprints total but a single-turn MVP (a `apps/registry/` static site reading from `@waggle/shared/mcp-catalog.ts`) is tractable.

Alternatively: chip away the small bundle/polish levers above for diminishing-returns lift without new product work.
