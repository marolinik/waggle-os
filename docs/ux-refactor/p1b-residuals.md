# P1b Auth Gate — Review Residuals (2026-06-11)

Source: adversarial review workflow over `fa3797c..HEAD` (5 lenses, 23 agents; 17 confirmed → ALL fixed in `54ec629`; 0 refuted; 26 LOWs triaged below). Plan-review record: `p1b-plan-review-record.md`.

## LOW findings fixed alongside (in 54ec629)

- getJobStatus 404 console-spam from GroupDetail's 1.5s poll → 404s no longer logged
- ComplianceDashboard art19/art26 sibling derefs unguarded → `?.` guards
- useChat catch updater returned a clone (forfeited setState bail-out) → returns `prev`
- ServiceProvider retry-timer unmount race → `mounted` ref
- Watchdog TimeoutError message read "Request to connect() timed out" → carries baseUrl
- reconnect() silent no-op after success memo → `forceReconnect()`
- launchTool/killTool envelope mapping dead → fetchRaw (with the HIGH manageHooks fix)

## LOW residuals — ledgered, not fixed (P7 / by-design)

- [ ] **~30 dead `if (!res.ok)` blocks remain in adapter.ts** (installSkill, installPack, testSkill, getStarterPacks, getCapabilityPacks, getMarketplacePacks, runAgent, spawnAgent, cron family, wiki/compliance exporters, …) — unreachable post-chokepoint, behavior unchanged (AdapterHttpError is field-compatible incl. runAgent's C23 `{status,body}` consumer). Removing them is a large mechanical diff; P7 dead-code commit.
- [ ] **fetchRaw has one residual throw path**: a 401 whose token refresh fails (loud by design) propagates out of fetchRaw. Every envelope consumer has a catch fallback (verified at review). Acceptable: the alternative (swallowing refresh failures on the raw path) hides the true cause.
- [ ] **Adapter-gate re-arm successes don't dispatch `waggle:connect-settled`** — after ServiceProvider's 3 retries exhaust, a late sidecar recovery propagates to errored surfaces via the next request's re-arm + focus/online events, not the bus. Matches the plan's design; if desktop telemetry shows stuck-errored-until-focus sessions, dispatch the bus event from the adapter's re-arm success (needs a window-reference guard in the adapter).
- [ ] **Retry-loop `connecting` toggles re-run the 8 gated mount-loads per cycle** (~3 doomed loads over ~13s while the sidecar is down; error-panel→skeleton flicker). Bounded by the retry cap; cosmetic under a down sidecar.
- [ ] **HomeCockpit Retry click during a retry-in-flight window** can render a stuck skeleton until the next settle (its `cancelled` ref interplay with the now-toggling `connecting`). Self-heals on settle; P7 with the dock-era residuals.
- [ ] **ServiceProvider can broadcast `connected:true` from an epoch-stale connect** after `setServerUrl` mid-flight (adapter state stays correct; provider state diverges until next reconnect). Zero production `setServerUrl` callers today; the Settings server-URL flow should call `forceReconnect()` when built.
- [ ] **"Zero network at module import" pin is partially vacuous** (spy installed in beforeEach, after module eval). Constructor-time is genuinely pinned; import-time is structurally enforced by boot-connect.ts being the only module-scope caller. A vi.resetModules-based import-time pin is possible if this ever regresses.
- [ ] **subscribeHarvestProgress silently degrades under 401** (import works, no progress UI) — part of the §1.4 SSE follow-up.
- [ ] `connectWebSocket` dead code (builds `?token=null` pre-token) — P7 removal candidate (also §1.4's candidate auth pattern).
- [ ] Stale `settings-tier-filter.ts:8-9` comment + orphaned `onboarding-tier-filter.ts` — P7 cleanup.
- [ ] `CapabilityRequestCard.tsx:55` any-403-as-tier (pre-existing) — P7.

## Live-smoke scope notes

Acceptance checks 1–3 (boot 401s / restart recovery / cold-sidecar recovery) are fetch-layer only — the five EventSource SSE channels are 401-dead in default config **pre-existing since D1** (see §1.4 of the plan + decision-log note; founder ruling pending). Chat streaming (POST /api/chat) IS covered — it authenticates via headers.

## Live-smoke RESULTS (2026-06-11, vite:8080 + branch sidecar:3501 via SIDECAR_TARGET; browser base = localhost:8080)

- **✅ Check 1 — boot burst fully gated, ZERO fetch-layer 401s.** Warm-boot network log: `/health` → `/api/auth/session-token` FIRST, then 20+ API requests all 200 (workspaces, tier, permissions, briefing, identity, memory search/stats, per-workspace contexts). Pre-P1b this was a token-less 401 burst.
- **✅ Check 2 — stale-token recovery without reload.** Live sequence captured: `GET /api/memory/stats → 401` (stale token) → `GET /api/auth/session-token → 200` (silent single-flight refresh) → retried `GET /api/memory/stats → 200`. Same origin, no page reload, no user action.
- **✅ No crashes under server failure.** Sidecar killed mid-session: surfaces showed errors (vite proxy 500s), `useAgentStatus` logged + kept backing off, NO error-boundary hits, NO undefined-deref crashes (the HomeCockpit/ComplianceDashboard crash classes held). Healthy-path LoginBriefing rendered full real data (brag line, highlights, summaries).
- **✅ §1.4 SSE defect live-confirmed:** `/api/waggle/stream` + `/api/notifications/stream` EventSource 401s in console — exactly the ledgered pre-existing class.
- **Dev-env note (not a P1b defect):** with TWO sidecars running (branch:3501-via-proxy + long-running pre-refactor:3333), a kill-window health probe triggers the pre-existing FR#10 auto-discovery fallback to `DEFAULT_SERVER` (3333) and persists it — the smoke's second restart attempt hopped servers this way (then 404'd on post-refactor routes the old sidecar lacks). In production DEFAULT_SERVER == the configured URL, so the fallback is inert and restart recovery is purely the 401-refresh leg (demonstrated). Recipe: re-set `localStorage['waggle:server-url']` after any kill-window.
- Check 3 (cold-sidecar boot → errored surfaces → recovery on connect-settled/focus) is pinned by unit tests (`p1b-authgate-surfaces.test.tsx` recovery cases ×4 + ServiceProvider backoff); the dual-sidecar fallback magnet makes a clean live repro impractical in this dev env.
