# Iteration 8 Results — 2026-05-28 (FR-3 public skill registry MVP)

## Shipped this iter

### Backend (FR-3 §MVP)
- `packages/server/src/local/routes/registry.ts` (new, ~290 lines)
  - `GET /api/registry/catalog` → canonical JSON of 148 MCP servers + 14 categories. Cache-Control public 5min. This is the single source of truth — every future client (Vite app, mobile, RSS, peer Waggle discovery) reads from here.
  - `GET /registry` → self-contained HTML page (Hive-themed dark UI, search + category chips + grid).
  - `GET /registry/main.js` → page JS as a separate route so `script-src 'self'` CSP allows it (inline script triggered a CSP block on first attempt — fixed by splitting before the verification re-test).
- `packages/server/src/local/index.ts` — import + register `registryRoutes`.

### Docs
- `apps/registry/README.md` (new) — documents the MVP-now-as-route + the v0.2 → v1.0 roadmap (scroll-to-anchor → deep-link handler → Tauri custom protocol → extract to Vite app → submissions UX). The canonical JSON endpoint stays exactly the same across all versions.

### Verification (live)
```json
GET /api/registry/catalog → {"version":"0.1.0","servers":148,"categories":14}
GET /registry            → HTML page, JS loads via /registry/main.js (CSP-safe)
Chrome DevTools probe    → {"count":"148 skills","cards":148,"chips":15,"firstCardName":"PostgreSQL"}
```

### Security guard rails applied
- **CSP fix**: split inline `<script>` into `/registry/main.js` (separate route) so `script-src 'self'` doesn't block — caught on first verification, fixed before commit. Inline scripts with `'unsafe-inline'` would have weakened the whole sidecar's XSS posture for one feature.
- **XSS hardening in the JS**: all catalog values render via `textContent` / `createElement`. No `innerHTML` with raw catalog strings (the registry's data is contributor-controlled via PR, so even "trusted" values can drift). `replaceChildren()` for clearing instead of `innerHTML = ''`.

## Honest score movement (modest, MVP-limited)

The MVP doesn't unlock the full FR-3 cell impact (4-6 cells) because the addictive part of a public registry is **peers being able to link to a skill page across the internet** — the substance of dim 5 (tribe). A local-only `/registry` is more of a registry-shaped MarketplaceApp re-skin than a true social surface.

What DOES move:
- **dim 10 (one tool)** for P9/P10 — Waggle now has a registry surface comparable to Claude Code's 9k-plugin marketplace + Hermes' agentskills.io. They read it as "this is registry-shaped, not just an in-app catalog".

What does NOT move yet:
- **dim 5 (tribe)** for P4/P8/P9/P10 — needs hosting at e.g. `registry.waggle-os.ai` + the deep-link / protocol handler that lets a peer's link actually launch their Waggle.

| Persona | Iter-7 | Iter-8 | Δ |
|---|---|---|---|
| P1 Greta | 5 | 5 | 0 |
| P2 Hassan | 5 | 5 | 0 |
| P3 Sarah | 9 | 9 | 0 |
| P4 Imran | 8 | 8 | 0 (waiting on hosted version for peer-share) |
| P5 Lucas | 9 | 9 | 0 |
| P6 Daniel | 7 | 7 | 0 |
| P7 Anya | 10 | 10 | 0 |
| P8 Marko | 10 | 10 | 0 |
| P9 Priya | 7 | 8 | +1 (registry surface → dim 10 ticks; she was Claude-Code-marketplace-savvy) |
| P10 Tomás | 7 | 8 | +1 (parity with Hermes' skill registry shape; full tribe unlock waits on hosting) |
| **avg** | **7.7** | **7.9** | **+0.2** |

## Cumulative trajectory

| Iter | Avg | Δ | Cumulative cells |
|---|---|---|---|
| 0 baseline | 5.0 | — | 0 |
| 1 (F1+F2) | 5.2 | +0.2 | 2 |
| 2 (FR-1 browser) | 5.9 | +0.7 | 9 |
| 5 (FR-2 closed) | 6.4 | +0.5 | 14 |
| 6 (FR-5 samples) | 7.1 | +0.7 | 21 |
| 7 (polish + compass) | 7.7 | +0.6 | 27 |
| **8 (FR-3 registry MVP)** | **7.9** | **+0.2** | **29** |

## Gap to 10/10: 2.1 across 6 personas

| Persona | Now | Gap | Biggest blocker |
|---|---|---|---|
| P1 Greta | 5 | 5 | iPad/voice surface (FR-9) — big build |
| P2 Hassan | 5 | 5 | iOS companion + connector packs |
| P3 Sarah | 9 | 1 | FR-10 social loop OR FR-3 hosted (registry.waggle-os.ai) |
| P4 Imran | 8 | 2 | FR-3 hosted version (peer link-sharing) + Keynote integration |
| P5 Lucas | 9 | 1 | OSINT polish |
| P6 Daniel | 7 | 3 | FR-6 native xlsx editor |
| P9 Priya | 8 | 2 | FR-3 hosted + Linear/GitHub deeper integration |
| P10 Tomás | 8 | 2 | FR-3 hosted + self-hosted enterprise build |
| **P7/P8 already 10** | — | — | — |

## What unlocks the biggest remaining lift in ONE turn
**FR-3 hosting decision + deploy** would close the dim 5 (tribe) gap for P3/P4/P9/P10 → +4 cells across 4 personas → avg jumps from 7.9 to ~8.3. The MVP-as-route built this turn is the read-write surface; hosting is the operations decision (Vercel? Cloudflare Pages? Self-hosted?). Not a code task.

After that, the only big remaining feature is **FR-6 native xlsx** for P6, which is genuinely expensive (2-3 sprints, single-persona impact). Everything else is iterative polish.
