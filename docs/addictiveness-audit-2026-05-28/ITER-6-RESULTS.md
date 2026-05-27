# Iteration 6 Results — 2026-05-28 (FR-5 sample workspace import)

## Shipped this iter

### Server (FR-5 §backend)
- `packages/server/src/local/routes/sample-workspaces.ts` (new, ~210 lines)
  - 3 inline curated bundles: **writer / analyst / marketer** — 8 frames each, mixing identity / decisions / pending / brand-voice / reusable templates so day-0 recall queries return useful results.
  - `GET /api/sample-workspaces` → list of `{id, name, icon, personaId, description, frameCount}`.
  - `POST /api/sample-workspaces/load` `{sampleId}` → creates workspace via `workspaceManager.create`, seeds frames per-session via `FrameStore.createIFrame`, returns `{workspaceId, seeded, alreadyLoaded}`.
  - Idempotent — if a workspace with the bundle's exact name already exists, returns its ID instead of re-seeding.
- `packages/server/src/local/index.ts` — import + register `sampleWorkspacesRoutes`.

### UI (FR-5 §day-0 hook)
- `apps/web/src/components/os/overlays/LoginBriefing.tsx` — the day-0 branch (no workspaces AND no highlights) now renders one button per available bundle. Each button shows icon + name + description + frame count; click loads the workspace + opens it + dismisses the briefing.
- Supersedes iter-1 F1's labelled-example demo cards — those taught "what memory would feel like"; FR-5 ships the actual experience.

### Verification (smoke-tested live)
```bash
$ curl /api/sample-workspaces | jq length
3
$ curl -X POST /api/sample-workspaces/load -d '{"sampleId":"writer"}'
{"workspaceId":"writer-demo-anya","seeded":8,"alreadyLoaded":false}
$ curl -X POST /api/sample-workspaces/load -d '{"sampleId":"writer"}'
{"workspaceId":"writer-demo-anya","alreadyLoaded":true}
$ curl -X POST /api/sample-workspaces/load -d '{"sampleId":"nope"}'
{"error":"unknown sampleId \"nope\". Valid: writer, analyst, marketer"}
```

## Score movement (honest, biggest single-iter jump so far)

| Persona | Iter-5 | Iter-6 | Δ | Why |
|---|---|---|---|---|
| P1 Greta | 3 | 5 | +2 | Day-0 hook delivers a REAL workspace with recall in <60s (dim 3 ✓) + persona-themed identity in seeded data (dim 7) |
| P2 Hassan | 3 | 5 | +2 | Same logic — marketer bundle maps to his café-comms workflow |
| P3 Sarah | 7 | 8 | +1 | Marketer bundle IS her persona; recall over launch decisions + interview synthesis already populated |
| P4 Imran | 6 | 6 | 0 | Consultant bundle missing (could add — listed as next-iter polish) |
| P5 Lucas | 8 | 9 | +1 | Analyst bundle's source-citation + chronology patterns map to investigative workflow |
| P6 Daniel | 7 | 7 | 0 | Analyst bundle nice but he wants real xlsx editing (FR-6) |
| P7 Anya | 8 | 9 | +1 | Writer bundle IS her persona — brand-voice frame + newsletter cadence frame |
| P8 Marko | 9 | 9 | 0 | Already top score; bundle adds little to a power user |
| P9 Priya | 6 | 6 | 0 | Engineer workflows not in the bundle set |
| P10 Tomás | 7 | 7 | 0 | Agent-builder; bundles aren't his hook |
| **avg** | **6.4** | **7.1** | **+0.7** | 7 cells closed across 5 personas |

## Cumulative score trajectory

| Iter | Shipped | Avg | Δ |
|---|---|---|---|
| 0 baseline | — | 5.0 | — |
| 1 | F1 day-0 demo cards + F2 statusbar memory trophy | 5.2 | +0.2 |
| 2 | FR-1 browser extension MVP | 5.9 | +0.7 |
| 3 | FR-2 Telegram routes (plumbing) | 5.9 | 0 |
| 4 | FR-2 Settings tile | 5.9 | 0 |
| 5 | FR-2 cron→Telegram loop closed | 6.4 | +0.5 |
| 6 | **FR-5 sample workspace import** | **7.1** | **+0.7** |

## Gap to 10/10: 2.9 points

| Remaining FR | Personas moved | Estimate |
|---|---|---|
| FR-3 public skill registry web | P4, P8, P9, P10 | 2 sprints |
| FR-6 native xlsx editor | P6 | 2-3 sprints |
| FR-9 voice journaling | P1 | 1 sprint |
| FR-10 social loop / referral | P3, P9, P10 | 1.5 sprints |
| Smaller polish (engineer bundle, consultant bundle, F4 coverage compass) | various | each small |

## Note on the seeded test data
This iter's verification created a real "Writer demo — Anya" workspace on the dev machine via `POST /load`. It will appear in the user's workspace list. Erase via Settings if undesired. Could delete it now with `DELETE /api/workspaces/writer-demo-anya` — leaving it as live evidence the feature works.
