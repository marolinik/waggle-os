# P1b — D3 Structural Auth Gate: Conversion Plan (2026-06-11)

**Authority:** D3 ruling in the v2.1 ratification register (`deltas/open-questions.md`, 2026-06-10) — RATIFIED, full structural scope. Live-confirmed targets: `p1a-residuals.md` "Live-smoke findings".
**Surface map:** 5-lane workflow audit 2026-06-11 (adapter getters / boot path / consumers / sidecar auth / connect+403 sites). All file:line refs below are from that audit against main @ `fa3797c`.

---

## 0. The problem, precisely

Three independent legs, each with its own fix:

1. **Boot race (pre-token 401 burst).** `ServiceProvider` is the *outermost* provider (`App.tsx:52`); React runs child effects before parent effects, so on a warm boot every mount fetch (`getWorkspaces`, `getTier`, `getPermissions`, `getNotificationHistory`+SSE, `getWaggleSignals`+SSE, LoginBriefing's batch) fires token-less **before `adapter.connect()` even starts** (`ServiceProvider.tsx:40`). Cold boot only wins by BootScreen animation luck (`AppShell.tsx:397-408`).
2. **Failure-as-data (silent-empty).** `adapter.fetch()` (`adapter.ts:185-216`) never throws on `!res.ok` — it only dispatches the 403 `TIER_INSUFFICIENT` event and returns the Response. **~145 of ~190 public methods** therefore parse HTTP error bodies as data or coalesce them to `[]`/defaults (audit lane 0; the ratification's "~6" is the named subset, not the total). 42 methods already throw — throwing is the existing majority convention for mutations.
3. **No mid-session recovery.** The bearer token is per-process (`crypto.randomBytes(32)` at `index.ts:1384`, in-memory) — **it rotates on every sidecar restart**. Nothing client-side handles 401; a restart bricks every authed call until full page reload.

Severity-critical instance (D3-4): `ShellContext.refreshTier` (`ShellContext.tsx:111-122`) — on an HTTP error `getTier()` parses the error body, `String(data.tier ?? 'FREE')` **actively sets billingTier to FREE** with no signal, no retry. A paying user on a lost boot race sees the FREE app.

## 1. Design contract

### 1.1 Adapter core (Stage A)

**(a) Pre-token deferral — `ensureReady()`.**
- `connect()` memoizes its in-flight attempt in `this._connectPromise` (StrictMode/duplicate-call safe; `OnboardingWizard.tsx:78`'s fire-and-forget call dedups onto it). A *settled* attempt clears the memo so `reconnect()` forces a fresh probe. `setServerUrl()` clears the memo, the token, and the settled state.
- `adapter.fetch()` first awaits `ensureReady()` **unless** the path is auth-exempt (`/health`, `/api/auth/session-token` — mirror of server `AUTH_EXEMPT_PATHS`, `security-middleware.ts:238`; needed to avoid connect-deadlock).
- `ensureReady()` semantics: if a connect attempt is in flight → await its settlement (success *or* failure — a failed connect releases the gate so requests fail loudly rather than hang). If no attempt was ever made → **no deferral** (pass through). This keeps ~30 existing adapter unit-test files (`new LocalAdapter(url)` + direct method calls, no `connect()`) behavior-identical.
- **Boot-order fix that makes the gate bite:** `main.tsx` kicks off `adapter.connect().catch(() => {})` at module scope, *before* `createRoot().render()`. By the time any child mount effect fires, the attempt is in flight → deferral engages. `ServiceProvider.connect()` awaits the same memoized promise (state-tracking preserved; `reconnect` unaffected).
- SSE subscriptions (`subscribe*` methods opening `EventSource`) and the WS connect await `ensureReady()` before opening, if and only if they attach the token (verify each during implementation; EventSource cannot send headers — confirm how `/api/*` SSE GETs authenticate and ledger any server-side gap as a residual rather than expanding scope).

**(b) Throw-on-`!ok` — at the chokepoint, not per-getter.**
- `adapter.fetch()` throws `AdapterHttpError` on `!res.ok` after the 403 dispatch (dispatch-then-throw). Error shape: `class AdapterHttpError extends Error { status: number; body: unknown; code?: string }` — **compatible with the existing rich-error consumers**: `CapabilitiesApp.handleInstallError` reads `err.status === 403` / `e.body?.required` (`CapabilitiesApp.tsx:191-204`), SkillBuilder `onTierError` (`SkillBuilder.tsx:141`). Body parsed best-effort via `res.clone().json()`.
- New method `adapter.fetchRaw()` = today's semantics (never throws on status; still attaches token, still 403-dispatches, still deferral+retry). Migrate **only** callers that do status-aware handling on the Response:
  - `installMarketplacePackage` / `uninstallMarketplacePackage` (callers check `res.status === 403`: `MarketplaceApp.tsx:239`, `CapabilityRequestCard.tsx:56`, MCP install path `MCPHubApp.tsx:160`) — these adapter methods return raw Response by documented contract (`adapter.ts:981-995`).
  - `createSkill` (`adapter.ts:866-875`) already checks `!ok` and throws its rich error — switch its internal call to `fetchRaw` so its bespoke error shape is preserved verbatim, OR verify `AdapterHttpError` is a drop-in (status+body present) and simplify. Decide at implementation; test-pin either way.
  - The 15 direct `adapter.fetch(` component call sites (TelemetryApp×2, BackupApp×3, SkillEditorDrawer×1, SkillBuilder×1, EvolutionTab×8): eyeball each — sites that branch on `res.ok`/`res.status` for UI move to `fetchRaw`; plain `.then(r => r.json()).catch(...)` sites stay on throwing `fetch` (their catch paths *improve*).
- Getters with `unwrapArray`/`?? []` need no individual edits — post-throw they only ever see 2xx bodies. **Do not** remove their defensive coalescing (cheap, harmless).
- `sendMessage` (chat SSE generator, `adapter.ts:380-398`): today a 4xx/5xx parses the error body as an SSE stream and yields nothing. With throwing `fetch` the generator now throws — verify `ChatWindowInstance`'s existing error handling (persist-raw-turn-on-error path, May fix) surfaces it; add a test.

**(c) 401 → silent refresh → single retry.**
- In the shared request core: on `res.status === 401`, if the path is not auth-exempt and this request hasn't already retried: `await this.refreshSessionToken()` then re-issue once with the new token. Still-401 after retry → normal failure path (throw / return raw).
- `refreshSessionToken()` is **single-flight**: one in-flight token fetch shared by a concurrent 401 burst.
- Treat ALL 401s as refreshable (`MISSING_TOKEN`, `INVALID_TOKEN`, code-less team-mode bodies, `SESSION_TIMEOUT`) — refresh is harmless when it can't help, and auth rejection happens in the server's `onRequest` hook *before* any handler side effect, so retrying non-GET methods is safe (`security-middleware.ts:316-340`).
- Never refresh-retry the `/api/auth/session-token` request itself (loop guard).

### 1.2 Boot-path surfaces (Stage B)

**(d) Tier — no silent FREE (severity-critical).**
- `ShellContext`: add `tierResolved: boolean` (false until a `getTier()` succeeds). `refreshTier` catch: set `tierError`, do **not** touch `billingTier` (initial `'FREE'` stays as the *fail-closed capability gate* for nav/feature gating — hiding TEAMS zones on unresolved tier is correct; *claiming* the user is FREE is not).
- Gate FREE-conditional **nag/upsell** surfaces on `tierResolved && billingTier === 'FREE'` (enumerate `billingTier` consumers at implementation; known: trial-expired modal already requires resolved `data.trialExpired`).
- Revalidation: on connect-settled and on focus/visibility *while errored* — mirror the `useOfflineStatus.ts:80-96` triple-listener (`online` + `visibilitychange→visible` + `focus`) → immediate single revalidate, keyed to "last attempt errored" so healthy state doesn't refetch per focus.
- `useBilling.ts` (Settings billing tab): same shape — failure keeps `error` set, never renders the default `'FREE'` as fact; revalidate-on-focus-while-errored.

**(e) `useWorkspaces` — resurrect the dead error channel + recovery.**
- catch: `setError(message)` (channel exists at `useWorkspaces.ts:9` but is never set). Keep list as-is on failure (don't clobber a previously good list).
- Recovery: refetch on focus/visibility while errored (same shared helper as (d)); the adapter gate already kills the boot-race instance.
- Consumers of `error` surface it (StatusBar/empty-state at implementation discretion — minimal: workspace rail shows a retry affordance instead of a permanently empty list).

**(f) LoginBriefing — failure ≠ Day-0.**
- Outer `catch { /* ignore */ }` (`LoginBriefing.tsx:162`) sets an `errored` flag → render a compact "couldn't load your briefing — retrying" line (with the existing dismiss affordance) instead of the Day-0 demo bubbles; brag header stops rendering `'Loading…'` forever (`:192`).
- Defer its batch until connect-settled (it can consume `useService().connecting` like HomeCockpit `:443/:485`) — belt to the adapter gate's suspenders, and it stops the *identity* fetch racing too.

**(g) Crash-class verification (fixed-by-(b), test-pinned).**
- HomeCockpit `RecentWorkspacesPanel` (`HomeCockpit.tsx:160/324/573`): error-body briefing no longer passes `!briefing` guard. Add `?.` guard + test anyway (cheap; data can be partial).
- `ComplianceDashboard.tsx:274` (`status.art12Logging.totalInteractions` inside CockpitApp): same; add guard + test.
- `CreateWorkspaceDialog.tsx:661/665` (`setTemplates(undefined)`): same; verify existing `.catch` path.

### 1.3 Explicit non-goals (ledger, don't build)

- Server-side SSE auth model changes (investigate + ledger only).
- Deriving the adapter default base from `window.origin` in dev (p1a-residual "consider" note — not D3 scope).
- Per-app one-shot caches beyond the boot path (MCPHubApp `resolvableMcpNames:110`, ChatWindowInstance `FALLBACK_MODELS`, TemplatesView/AgentBuilder catalogs) — P7 residuals; the adapter gate + throw fixes their *boot-race* instance, their *mid-session* staleness is out of scope.
- `getPermissions`' `.catch(() => {})` → stays (fails closed to `'normal'` autonomy, the safe direction).
- Team-mode Clerk 401 semantics (different deployment; our retry treats code-less 401s the same — sufficient).

## 2. Execution stages

**Stage A — adapter structural core.** `adapter.ts` (+`main.tsx` early-connect kickoff): `_connectPromise` memo, `ensureReady`, `AdapterHttpError`, throw-on-`!ok`, `fetchRaw` + caller migration, 401-refresh-retry single-flight, SSE/WS deferral. New `adapter.authgate.test.ts` (deferral, retry single-flight + once-only + loop guard, throw shape, 403 dispatch preserved on both paths, exempt paths, setServerUrl reset, sendMessage throw). Run adapter-scoped tests. Commit.

**Stage B — boot-path surfaces.** `ShellContext.tsx`, `useBilling.ts`, `useWorkspaces.ts`, `LoginBriefing.tsx`, the three crash-class guards, shared `useRevalidateOnFocus(errored, fn)` helper (one new hook file, mirrors useOfflineStatus listeners). Tests per surface. Commit.

**Stage C — suite repair + acceptance.** Full FE suite (`node node_modules/vitest/vitest.mjs run --root apps/web`), FE tsc (`node node_modules/typescript/bin/tsc -p apps/web/tsconfig.app.json`), fix fallout (expected: tests that pinned silent-empty-on-error behavior now pin throw behavior). Commit.

Then: adversarial review workflow over the diff → fix confirmed findings → live Playwright smoke → PR → merge.

## 3. Acceptance checks

1. **Warm-boot race dead:** with a delayed `/api/auth/session-token` (test harness), mount-time `getWorkspaces`/`getTier` requests are *deferred* (no 401 burst) and resolve authed. Unit-level: fetch ordering asserted in `adapter.authgate.test.ts`; live: boot with sidecar, network log shows zero 401s on boot.
2. **Sidecar-restart recovery:** kill + restart sidecar mid-session → next authed call 401s → token silently re-fetched → call succeeds. Live-smoke: restart sidecar, click a workspace, list loads without page reload.
3. **Tier never silently FREE:** mock `getTier` failure → `billingTier` untouched, `tierResolved=false`, no upsell nag rendered; focus event after recovery → tier resolves. Unit test.
4. **Throw-on-`!ok` adapter-wide:** `getTier`/`getMarketplace`/`getMcps`/`getPersonas`/`getModels`/`getWorkspaceTemplates` reject on 401/500 with `AdapterHttpError` carrying status+body. Unit tests.
5. **403/UpgradeModal surface intact:** existing `phase4b-mcp-hub` / `phase4b-marketplace-extend` / `phase3c-skill-builder` regression tests stay green; 403 dispatch fires on both throwing and raw paths.
6. **useWorkspaces recovery:** mock failure → `error` set, list preserved; focus → refetch. Unit test.
7. **LoginBriefing failure state:** mock batch failure → no Day-0 demo bubbles, errored line shown. Unit test.
8. **No hang:** adapter unit tests that never call `connect()` run without deferral (suite time unchanged); a *failed* connect releases the gate (requests proceed → fail loudly).
9. **Full FE suite green + FE tsc 0.**

## 4. Rollback

Single revertable arc on a feature branch; tag `checkpoint/pre-authgate-2026-06` before Stage A. No data migrations, no localStorage schema changes. Stage A alone is independently revertable (Stage B depends on A's error semantics).
