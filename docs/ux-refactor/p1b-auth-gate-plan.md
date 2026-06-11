# P1b — D3 Structural Auth Gate: Conversion Plan v2 (2026-06-11)

**Authority:** D3 ruling in the v2.1 ratification register (`deltas/open-questions.md`, 2026-06-10) — RATIFIED, full structural scope. Live-confirmed targets: `p1a-residuals.md` "Live-smoke findings".
**Surface map:** 5-lane workflow audit 2026-06-11 against main @ `fa3797c`.
**Plan verification:** two adversarial workflow rounds (6 lenses, 38 agents): **24 confirmed findings (1 CRITICAL / 10 HIGH / 13 MEDIUM), 0 refuted, 16 LOWs** — all folded in below; full record in `p1b-plan-review-record.md`. v1 is in git history (2 commits back).

---

## 0. The problem, precisely

Three independent legs, each with its own fix:

1. **Boot race (pre-token 401 burst) — fetch layer.** `ServiceProvider` is the *outermost* provider (`App.tsx:52`); React runs child effects before parent effects, so on a warm boot every mount fetch (`getWorkspaces`, `getTier`, `getPermissions`, `getNotificationHistory`, LoginBriefing's batch) fires token-less **before `adapter.connect()` even starts** (`ServiceProvider.tsx:40`). Cold boot only wins by BootScreen animation luck (`AppShell.tsx:397-408`).
2. **Failure-as-data (silent-empty).** `adapter.fetch()` (`adapter.ts:185-216`) never throws on `!res.ok` — **~145 of ~190 public methods** parse HTTP error bodies as data or coalesce them to `[]`/defaults (audit lane 0). 42 methods already throw — throwing is the existing majority convention for mutations.
3. **No mid-session recovery.** The bearer token is per-process (`crypto.randomBytes(32)` at `index.ts:1384`, in-memory) — **it rotates on every sidecar restart**. Nothing client-side handles 401; a restart bricks every authed call (including chat: a stale-token `sendMessage` parses the 401 body as an SSE stream and yields nothing — silent dead chat) until full page reload.

Severity-critical instance (D3-4): `ShellContext.refreshTier` (`ShellContext.tsx:111-122`) — on an HTTP error `getTier()` parses the error body, `String(data.tier ?? 'FREE')` **actively sets billingTier to FREE** with no signal, no retry. A paying user on a lost boot race sees the FREE app.

**Discovered during plan verification — NOT fixable in this phase (see §1.4):** all five EventSource SSE channels (notifications, events, subagent status, waggle signals, harvest progress) are **401-dead in every default run since D1** — the server bearer-gates all `/api/*` GETs, EventSource cannot send headers, and none of those routes accept `?token=` (only `/ws` does, and `connectWebSocket` is dead code). The SSE half of the boot race is therefore a *server-side* defect; this plan fixes the fetch half and ledgers the SSE half loudly.

## 1. Design contract

### 1.1 Adapter core (Stage A)

**(a) Pre-token deferral — `ensureReady()` with a self-healing, bounded gate.**

Connect machinery:
- `connect()` memoizes its in-flight attempt in `this._connectPromise`, **assigned synchronously** (before the first await) so two same-tick calls — `OnboardingWizard.tsx:78` fire-and-forget + ServiceProvider's effect — share one probe. **A settled-SUCCESS memo is kept** (cleared only by `setServerUrl()`), so late `connect()` callers dedup instead of re-probing; `reconnect()` intent = `setServerUrl(current)`-style reset or an explicit `forceReconnect()` that clears the memo first.
- **Watchdog (HIGH fix):** `connect()` gets an end-to-end deadline (~15s AbortController spanning health probe + body reads + token fetch — `fetchWithTimeout` only bounds headers, `fetch-utils.ts:20-36`; the `res.json()` reads at `adapter.ts:142/167-175` are currently unbounded). The gate can therefore never wedge the app: connect always settles. This also converts any future client/server exempt-path drift (a true self-deadlock) into a loud bounded failure.
- **Epoch guard (MEDIUM fix):** `private _epoch = 0`; `setServerUrl()` increments it; every connect/healthProbe continuation (set `_connected`, write `authToken`, `baseUrl` mutation, localStorage persist) no-ops when its captured epoch is stale. **healthProbe single-flights** and runs its auto-discovery fallback on a LOCAL url variable, committing to `this.baseUrl`+localStorage only on success + epoch match — it is otherwise an unsynchronized `baseUrl` writer racing `useOfflineStatus`'s exempt `/health` probes.

Gate semantics (`ensureReady()`, awaited by `adapter.fetch()` unless the path is auth-exempt — `/health`, `/api/auth/session-token`, mirror of server `AUTH_EXEMPT_PATHS` `security-middleware.ts:238`):
- **In-flight attempt** → await its settlement (success or failure).
- **Settled-success** → pass through.
- **Settled-FAILURE → re-arm (HIGH fix):** kick ONE fresh memoized `connect()` and defer onto it. Cold-sidecar desktop boot (the *default* Tauri path: webview up before sidecar listens; main.tsx's kickoff gets instant ECONNREFUSED) no longer disarms the gate — each subsequent request re-attempts (single-flight, watchdog-bounded, fails fast while the sidecar is down) until one succeeds, making the gate self-healing instead of one-shot.
- **Never-attempted** → pass through. This keeps the **7** existing adapter unit-test files (not "~30" — v1 count corrected) behavior-identical. Production arms the gate structurally: a dedicated **`boot-connect.ts` imported as main.tsx's FIRST import** (import hoisting guarantees the attempt is in flight before any sibling module evaluates). Regression-locked: `adapter.authgate.test.ts` pins **zero network on adapter module import and on `new LocalAdapter()`** (5 test files index `mock.calls[0]` / assert exactly-one-fetch — a kickoff drifting into the adapter module or constructor breaks all 7).
- `ServiceProvider.connect()` awaits the same memoized promise and gains a **capped retry/backoff loop** (3 attempts ~1s/3s/9s) for the cold-sidecar window; on every settlement it dispatches a **`waggle:connect-settled` window event** — the shared revalidation bus consumed by Stage-B surfaces. **Constraint (test blast radius):** ServiceProvider may only call `connect()`/existing adapter members — 9 component test files render the *real* ServiceProvider over hand-rolled adapter mocks; any new adapter member referenced there TypeErrors them.
- `uploadFile` / `ingestFile` (**MEDIUM fix**) currently call `fetchWithTimeout` directly with hand-attached tokens — route both through the shared core (suppress the JSON content-type default for FormData bodies) so they inherit deferral + throw + retry; add to the Stage-A test matrix (401→refresh-retry multipart; 413→`AdapterHttpError` with the server's reason).
- SSE `subscribe*` methods: **explicitly NOT wired to `ensureReady()`** — none attach a token, so deferral merely delays an identical 401 (see §1.4). Their `if (!this._connected) return () => {}` noop guards stay as-is in P1b. `connectWebSocket` (`?token=` style, `adapter.ts:2536`) has zero callers — P7 dead-code ledger entry, do not wire.

**(b) Throw-on-`!ok` — at the chokepoint, not per-getter.**
- `adapter.fetch()` throws `AdapterHttpError` on `!res.ok` after the 403 dispatch (dispatch-then-throw). Shape: `class AdapterHttpError extends Error { status: number; body: unknown; code?: string }` — field-compatible with the incumbent rich-error consumers (`CapabilitiesApp.tsx:191-204` reads `err.status`/`e.body?.required`; `SkillBuilder.tsx:141`; `installSkill`/`installPack` `adapter.ts:914-920/960-966` already ship this shape). Body parsed best-effort via `res.clone().json()`.
- **Message pinned, message-first (HIGH fix — v1's error-first precedence inverted the incumbent convention pinned in `adapter.eraseData.test.ts`/`adapter.startTrial.test.ts`):** `AdapterHttpError.message := String(body.message ?? body.error ?? \`HTTP ${status}\`)`. For `{error:'TIER_INSUFFICIENT', message:'…'}` bodies this surfaces the human message; for plain `{error:'…'}` bodies it falls through to `error` — strictly better both ways. `eraseData`/`startTrial` keep their pinned `\`Erase failed (400): …\`` prefixes by catching `AdapterHttpError` and rethrowing in legacy format (~3 lines each; their existing `!ok` blocks become dead and are removed) — their 2 test files stay verbatim-green. `createSkill` (`adapter.ts:866-875`, message = `body.error`) simplifies onto the throwing fetch — message-first is a superset; test-pin message+status+body.
- New method `adapter.fetchRaw()` = today's semantics (never throws on status; still token + 403-dispatch + deferral + retry). **Two migration classes** (the v1 filter — "status-aware handling on the Response" — structurally missed body-envelope consumers):
  - **Raw-Response callers:** `installMarketplacePackage` (callers check `res.status === 403` + SecurityGate `{blocked,severity}`: `MarketplaceApp.tsx:228-245`, `CapabilityRequestCard.tsx:54-62`) — documented raw contract `adapter.ts:981-995`. **NOT `uninstallMarketplacePackage`**: its only consumer ignores the Response and unconditionally toasts success (`MarketplaceApp.tsx:253-262`) — leaving it on throwing fetch fixes a silent false-success bug for free; test-pin that a 500 uninstall shows the failure toast and does NOT flip `installed:false`.
  - **Body-envelope getters (CRITICAL finding):** typed getters whose *parsed error body* is load-bearing. Verified set: `installMcp` (`adapter.ts:1663-1671` — server sends `{installed:false, requiresApproval, blocked, severity, scanResult}` on 403/422 per `mcps.ts:249-259`; `MCPHubApp.tsx:156-182` branches `res.error === 'TIER_INSUFFICIENT'` AND drives the ApprovalModal HIGH-override / CRITICAL-non-overridable flow off `res.requiresApproval` — a chokepoint throw would kill that flow), plus `addCustomMcp` (`AddCustomMcpForm.tsx:53-68`, deliberate tier-403 inline-suppression), `updateMcpPermissions` (`MCPHubApp.tsx:240-247` — comment pins the never-throws contract), `revokeMcp` (`MCPHubApp.tsx:216-226`), `startMcp`/`stopMcp`/`testMcp` (`InstalledMcpList.tsx:54-78`). Migration: internals → `fetchRaw`, keep returning parsed body regardless of status.
  - **Hard Stage-A exit criterion (promoted from v1's acceptance-note):** one adapter-level test per body-envelope getter (real method + mocked fetch returning the 422/403 envelope → parsed envelope returned, not thrown) + `installMarketplacePackage` raw passthrough + the `uninstallMarketplacePackage` pin. **No adapter-level raw/envelope pins exist anywhere today** — component tests mock the adapter methods and are structurally blind to a botched migration.
  - Implementation sweep to close the class: grep components for `res.error` / `res.ok`-on-non-Response / `requiresApproval` / `blocked` / `scanResult` before finalizing the list.
  - The 15 direct `adapter.fetch(` component call sites — verified per-site: **only BackupApp needs `fetchRaw`** (`BackupApp.tsx:41` maps 404→'empty' via `classifyMetadataStatus:21-25`; `:59`/`:89` branch `res.ok` with distinct server-fault messages incl. the 413 reason). The other 12 (TelemetryApp×2, SkillEditorDrawer, SkillBuilder, EvolutionTab×8) stay on throwing fetch — their `!ok→throw` branches become dead code, catch paths *improve*. Add a BackupApp component-level 404→empty test (`phase5b-backup.test.tsx` tests only the pure function — vacuous against a missed migration). Rule for stragglers: migrate only where non-2xx maps to a NON-error UI state or status/body drive UI a catch cannot reproduce.
- Getters with `unwrapArray`/`?? []` need no individual edits — post-throw they only see 2xx bodies. Keep the defensive coalescing.
- `sendMessage` (chat SSE generator, `adapter.ts:380-398`): verified consumer is **`useChat.ts:125`** (ChatWindowInstance only wires the hook). Today a stale/missing token = silent empty assistant bubble (401 body parsed as SSE, zero yields, catch never fires). With throw + 401-retry, chat survives sidecar restarts — this leg is verified sound. Stage B reworks the `useChat` catch (`:264-275`): branch on `AdapterHttpError` (status/body-derived message; suppress the inline message for tier-403 the UpgradeModal already handles), keep "Backend is offline" only for genuine network errors, and add the `!last` empty-array guard the stream updater has (`:133-136`). Test targets `useChat` with a rejecting `adapter.sendMessage`.

**(c) 401 → silent refresh → single retry.**
- In the shared request core: on `res.status === 401` (path not auth-exempt, not already retried): refresh token, re-issue once. Still-401 → normal failure path.
- **Token-versioned (MEDIUM fix):** each request records the token it was issued with; on 401, if `this.authToken !== issuedToken` the refresh already happened — skip it and retry immediately with the current token. This stops a post-restart straggler burst from chaining N sequential refreshes past the single-flight window.
- `refreshSessionToken()` is single-flight and — unlike the legacy best-effort `fetchSessionToken()` — **THROWS on failure** so the retry path fails fast with the true cause (refresh endpoint unreachable) instead of silently retrying token-less into a guaranteed second 401. Both pinned in `adapter.authgate.test.ts` (straggler-401 → exactly one token fetch; refresh-endpoint-down → loud failure).
- Treat ALL 401s as refreshable (`MISSING_TOKEN`/`INVALID_TOKEN`/code-less/`SESSION_TIMEOUT`) — refresh is harmless when it can't help; auth rejection happens in the server's `onRequest` hook before any handler side effect, so retrying non-GET is safe (`security-middleware.ts:316-340`). Never refresh-retry `/api/auth/session-token` itself.

### 1.2 Boot-path surfaces (Stage B)

Shared helper: **`useRevalidateOnError(errored, fn)`** — one new hook mirroring the `useOfflineStatus.ts:80-96` triple-listener (`online` + `visibilitychange→visible` + `focus`) **plus the `waggle:connect-settled` bus event**, firing one immediate revalidate, keyed to "last attempt errored" so healthy surfaces don't refetch per focus. The bus leg matters: focus never fires on the normal desktop launch where the window already has focus.

**(d) Tier — no silent FREE (severity-critical).**
- `ShellContext`: add `tierResolved: boolean` + `tierError`. `refreshTier` catch: set `tierError`, **touch neither `billingTier` NOR `trialInfo`** (MEDIUM fix — today's failure path also clobbers a previously-good trial countdown with undefineds; move the `setTrialInfo` inside the resolved branch). `tierResolved` set true on ANY successful response, even an unrecognized tier string (else the nag-gate stays closed on a healthy session). Initial `'FREE'` stays as the *fail-closed capability default* — verified correct for the nav: `getDockForTier` (`AppShell.tsx:193`) only HIDES TEAMS entries while unresolved, renders no upsell copy, and recomputes when tier resolves. **Do not wire `tierResolved` into the nav** (comment it as the intentional fail-closed consumer).
- Gate-vs-nag classification (verified table, full version in review record): TrialExpiredModal + StatusBar trial badges already structurally safe; UpgradeModal event-driven, safe; **the two defective nag surfaces are below**.
- `useBilling` (Settings→Billing tab, sole consumer `SettingsApp.tsx:99`): on refresh failure today, tier stays default-`'FREE'`, error stays null, and the tab renders "Free tier — upgrade to unlock all features" + FREE badge + purchase grid **as fact** (`SettingsApp.tsx:498-555`). Post-Stage-A every getTier failure funnels here — the fix is mandatory: resolved/error shape, unresolved/error rendering instead of the FREE card, revalidate via the shared helper. (Ratification note: useBilling is not one of D3-4's two named surfaces but is the same monetization-defect class — D3-4 extension, recorded in the decision log.)
- **NEW — second tier-as-fact surface (HIGH, found by verification):** SettingsApp's General tab renders a separate `'{tier} plan'` badge from its own `getSettings()`-fed state (`SettingsApp.tsx:54/157/239-241`, `.catch(() => {})`, `?? 'FREE'`) — visible to every user. Fix: derive the badge from the same resolved billing state as the Billing tab (single source, kills the two-tabs-disagree divergence). Test: a getSettings/getTier failure never renders "FREE plan".

**(e) `useWorkspaces` — resurrect the dead error channel + recovery.**
- catch: `setError(message)` (channel exists at `useWorkspaces.ts:9`, never set). Keep the previous list on failure. Recovery via `useRevalidateOnError` (focus + connect-settled). Workspace rail shows a retry affordance instead of a permanently empty list.

**(f) LoginBriefing — failure ≠ Day-0, and actually retries (HIGH fix).**
- Outer `catch { /* ignore */ }` (`LoginBriefing.tsx:162`) → `errored` flag → compact "couldn't load your briefing" line instead of the Day-0 demo bubbles; brag header stops rendering `'Loading…'` forever (`:192`).
- Defer the batch until connect-settled (consume `useService().connecting` like HomeCockpit `:443/:485`) **and wire `useRevalidateOnError`** — v1 promised "retrying" in the UI copy without wiring any mechanism; the ruling names this surface explicitly. Acceptance check asserts recovery, not just the errored line.

**(g) Crash-class verification (fixed-by-(b), test-pinned).**
- HomeCockpit `RecentWorkspacesPanel` (`HomeCockpit.tsx:160/324/573`): error-body briefing no longer passes `!briefing`. Add `?.` guard + test.
- `ComplianceDashboard.tsx:274` (verified: this IS the live-confirmed "CockpitApp undefined.totalInteractions" — sole deref in the tree, mounted by `CockpitApp.tsx:310`): post-throw lands in its existing catch → error panel + Retry. Add `?.` guard + test.
- `CreateWorkspaceDialog.tsx:661/665` (`setTemplates(undefined)`): verify existing `.catch` path + guard.

**(h) One-shot error-caches in plan-touched territory (MEDIUM ruling-fidelity fix).**
The plus clause ("error states never cache as valid-empty; focus/visibility revalidation on errored surfaces") carries no boot-path qualifier. Cheap wirings (~3 lines each, helper exists): `MCPHubApp.resolvableMcpNames` (`:110-116` — already connect-gated, so the adapter gate adds nothing there; its `.catch(() => new Set())` caches server faults as valid-empty for the session, hiding Install buttons) and `ComplianceDashboard.refreshTemplates` (`:109-112`, same class). The remaining one-shot caches (ChatWindowInstance `FALLBACK_MODELS`, TemplatesView, AgentBuilder catalogs) stay deferred to P7 — honest rationale: the 401-retry leg cures their *restart* instance and the live-confirmed D3 ledger scopes to boot-path; the narrowing is recorded as a D3 implementation note in the decision log (see §3), not self-granted silently.

### 1.3 Explicit non-goals (ledger, don't build)

- Deriving the adapter default base from `window.origin` in dev (p1a residual, not D3).
- Per-app one-shot caches beyond §1.2(h)'s two (P7, with the decision-log note).
- `getPermissions`' `.catch(() => {})` → stays (fails closed to `'normal'` autonomy — the safe direction; a boot-window failure pins 'normal' for the session, acceptable).
- Team-mode Clerk 401 semantics (different deployment; retry treats code-less 401s the same).
- `CapabilityRequestCard.tsx:55` any-403-as-tier (pre-existing) — P7.
- `connectWebSocket` dead code (`?token=null` when called pre-token) — P7 removal candidate.
- Stale `settings-tier-filter.ts:8-9` comment + orphaned `onboarding-tier-filter.ts` (zero prod consumers) — P7.

### 1.4 SSE channels — discovered defect, server-side, OUT of P1b scope (flagged to founder)

**Finding (CRITICAL, live-verified):** all five EventSource SSE channels are 401-dead in every default (D1-enforced) run — not a boot race, a permanent failure: the bearer hook gates every `/api/*` GET, EventSource cannot send headers, no SSE route accepts `?token=`, and the `subscribe*` noop-guards + `es.close()`-in-`onerror` mean nothing ever retries. Notifications, live events, subagent status, waggle signals, and harvest progress (silent: import works, no progress UI) only function under `WAGGLE_TRUST_LOCALHOST=1`.
**Why not fixed here:** the fix is a server auth-model change (the proven in-repo pattern is `/ws`: middleware-exempt + per-route `?token=` validation, `index.ts:2127-2134`) plus client reconnect design (stop closing in `onerror`, resubscribe on connect-settled) — one coherent follow-up ("SSE auth + reconnect"), not two halves. D3's ratified text is the adapter/fetch gate; expanding into server security middleware mid-phase without a register entry repeats the pattern the register exists to prevent.
**Ask:** ratify either (i) a P1b-follow-up stage in this PR (server `?token=` on 5 SSE routes + client lazy-open/reconnect), or (ii) a P2 line item. Until then: P1b changes nothing SSE-side; acceptance checks are scoped to the fetch layer.

## 2. Execution stages

**Stage A — adapter structural core.** `adapter.ts` + `boot-connect.ts` (+1-line main.tsx import): memoized connect + watchdog + epoch + healthProbe single-flight, `ensureReady` 4-state gate with settled-failure re-arm, `AdapterHttpError` (message-first pin), throw-on-`!ok`, `fetchRaw` + two-class migration (envelope getters + BackupApp), eraseData/startTrial legacy-prefix wrappers, 401-refresh-retry (token-versioned, throwing refresh, single-flight), uploadFile/ingestFile through the core. `adapter.authgate.test.ts`: deferral states ×4, same-tick dedup, watchdog (hung body → connect settles, gate releases), epoch (setServerUrl mid-flight → no clobber), retry (once-only, straggler single-fetch, refresh-down loud failure, loop guard), throw shape + message precedence, 403 dispatch on both paths, exempt paths, **zero network at module import / construction**, envelope pins (hard exit criterion), sendMessage throw. Run the 7 adapter test files + new. Commit.

**Stage B — boot-path surfaces.** `useRevalidateOnError` hook; `ShellContext` (tierResolved/tierError/trialInfo preservation); `useBilling` + SettingsApp Billing tab unresolved state + General-tab badge single-sourcing; `useWorkspaces` error+recovery + rail retry affordance; `LoginBriefing` (connect-gate, errored state, revalidation); `useChat` catch rework; crash guards (HomeCockpit/ComplianceDashboard/CreateWorkspaceDialog); §1.2(h) two wirings; ServiceProvider retry/backoff + `waggle:connect-settled` dispatch (existing-members-only constraint). Tests per surface (all net-new — verified zero existing render-level tests on these surfaces). Commit.

**Stage C — suite repair + acceptance.** Full FE suite (`node node_modules/vitest/vitest.mjs run --root apps/web`), FE tsc (`node node_modules/typescript/bin/tsc -p apps/web/tsconfig.app.json`). **Expected fallout (corrected by verification): approximately zero** — no adapter-level test pins silent-empty-on-`!ok` (the only silent-default pin, `adapter.memoryStats.test.ts:70-77`, mocks rejection and stays identical); eraseData/startTrial stay green via the legacy-prefix wrappers; the deliberate UX guard at `adapter.startTrial.test.ts:75` (server `message` surfaces) is *honored* by message-first precedence, not regressed. Any actual fallout gets root-caused, not pattern-matched. Commit.

Then: decision-log note (§3) → adversarial review workflow over the diff → fix confirmed findings → live smoke (§4) → PR → merge.

## 3. Decision-log note (append to open-questions.md under D3, one block)

Record as "D3 implementation notes (P1b, 2026-06-11)": (i) the fetchRaw/body-envelope exception class as a ratified-flow-preserving deviation from the literal "throw mandated adapter-wide" (preserves the D4/ApprovalModal security envelope and the documented raw marketplace contract); (ii) the boot-path scoping of the plus-clause revalidation with the P7 ledger for the remaining one-shot caches; (iii) useBilling + Settings-General badge as D3-4 extensions (same monetization-defect class); (iv) the §1.4 SSE defect + pending founder ruling.

## 4. Acceptance checks

1. **Warm-boot race dead (fetch layer):** with a delayed `/api/auth/session-token`, mount-time fetch-layer requests defer and resolve authed; live: boot network log shows zero fetch-layer 401s. (SSE GETs excluded — §1.4.)
2. **Sidecar-restart recovery (fetch layer):** restart sidecar mid-session → next authed call 401s → silent refresh → succeeds. Live: restart, click a workspace, list loads without reload. **Chat:** send after restart streams normally (was: silent empty bubble).
3. **Cold-sidecar boot recovery (new):** sidecar down at boot → surfaces show errors (not empty-as-fact); sidecar up + window focus (or connect-settled) → tier, workspaces, briefing recover without reload.
4. **Tier never silently FREE:** getTier failure → `billingTier` AND `trialInfo` untouched, `tierResolved=false`, no upsell nag, Billing tab + General badge show unresolved (not "FREE plan"); recovery on focus. Unit tests.
5. **Throw-on-`!ok` adapter-wide:** the six ruling-named getters reject with `AdapterHttpError` (status+body+message-first). Unit tests.
6. **403/UpgradeModal surface intact:** phase4b/phase3c regression tests green; 403 dispatch on both throwing and raw paths; **adapter-level envelope pins green (hard Stage-A exit criterion)**.
7. **useWorkspaces recovery:** failure → error set, list preserved; focus/connect-settled → refetch. Unit test.
8. **LoginBriefing failure state + recovery:** batch failure → no Day-0 bubbles, errored line; focus/connect-settled → briefing loads. Unit test.
9. **No hang, no drift:** never-connect tests pass through ungated (7 files unchanged); hung-body connect settles ≤ watchdog; failed connect re-arms (not disarms); zero network at module import/construction.
10. **Full FE suite green + FE tsc 0.**

## 5. Rollback

Single revertable arc on `feature/ux-refactor-p1b-authgate`; tag `checkpoint/pre-authgate-2026-06` = `fa3797c`. No data migrations, no localStorage schema changes. Stage A independently revertable.
