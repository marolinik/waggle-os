# P1b Plan — Adversarial Review Record (2026-06-11)

Two workflow rounds over `p1b-auth-gate-plan.md` v1 (6 lenses; round 1's contract lane completed, 5 lanes re-ran in round 2 after a session-limit failure). **24 confirmed / 0 refuted / 16 LOW.** Every confirmed finding was independently verified by a skeptic agent against the live tree before acceptance. All are folded into plan v2; this file records them so they are not re-found, plus the LOW-grade confirmations of plan claims.

## Confirmed (folded into plan v2)

| # | Sev | Lens | Finding → v2 disposition |
|---|-----|------|--------------------------|
| 1 | CRITICAL | contract | `installMcp` is a typed JSON getter whose error body carries the ApprovalModal security envelope (`{requiresApproval, blocked, severity}` on 403/422); throw would kill the flow and the phase4b tests (method-level mocks) are blind → body-envelope migration class + adapter-level pins as hard Stage-A exit criterion |
| 2 | CRITICAL | sse-ws-auth | All five EventSource SSE channels 401-dead in EVERY default run since D1 (bearer-gated /api GETs; EventSource can't send headers; no `?token=` on those routes; only `/ws` has the pattern and `connectWebSocket` is dead code) → plan §1.4, founder ruling requested, P1b scope unchanged |
| 3 | HIGH | deadlock | Gate-never-released hang: `fetchWithTimeout` bounds headers only; connect's `res.json()` reads unbounded → connect watchdog (~15s end-to-end deadline) |
| 4 | HIGH | deadlock | Gate disarms after failed early connect (default Tauri cold-sidecar path) re-opening the ungated burst with no recovery (NetworkError never triggers the 401 leg; focus never fires on an already-focused window) → settled-failure re-arm + ServiceProvider backoff + `waggle:connect-settled` bus consumed by all Stage-B surfaces |
| 5 | HIGH | deadlock | SSE half of the boot race unfixed and v1's "if and only if they attach the token" conditional matched zero methods (noop-guards = session-long dead subscriptions) → §1.4 honest de-scope; subscribe* untouched; acceptance check 1 scoped to fetch layer |
| 6 | HIGH | test-blast | `adapter.eraseData.test.ts`/`adapter.startTrial.test.ts` pin method-level `Erase failed (400): <detail>` messages with **message-first** detail; v1's error-first precedence inverted it → message-first pin + legacy-prefix wrappers in both methods |
| 7 | HIGH | sse-ws-auth | Chat `sendMessage` silent-empty-bubble on stale/missing token; plan's (b)+(c) verified the correct fix; `useChat` catch defects confirmed → no design change; Stage B useChat rework retained |
| 8 | HIGH | tier-ui | Definitive gate-vs-nag table (nav = pure capability gate, do NOT wire tierResolved; TrialExpiredModal + StatusBar badges already safe; UpgradeModal event-driven safe) → §1.2(d) classification |
| 9 | HIGH | tier-ui | useBilling failure renders FREE-as-fact + upgrade CTAs in Settings→Billing with zero error indication; post-Stage-A every failure funnels there → mandatory reshape |
| 10 | HIGH | tier-ui | SECOND tier-as-fact surface missed by v1: SettingsApp General-tab `'{tier} plan'` badge fed by `getSettings` (`:54/157/239-241`) → single-source from resolved billing state |
| 11 | HIGH | d3-fidelity | LoginBriefing got no revalidation wiring while v1's own UI copy promised "retrying" (plus-clause violation on a ruling-named surface) → wired to `useRevalidateOnError`, acceptance asserts recovery |
| 12 | MEDIUM | deadlock | setServerUrl mid-flight: stale connect continuations clobber baseUrl/localStorage/token (fallback can persist DEFAULT_SERVER over the user's new URL) → epoch guard |
| 13 | MEDIUM | deadlock | Straggler 401s chain sequential refreshes past single-flight; refresh failure semantics unpinned (silent token-less retry) → token-versioned retry + throwing `refreshSessionToken` |
| 14 | MEDIUM | deadlock | healthProbe not single-flighted; races useOfflineStatus's exempt /health probes on shared `this.baseUrl` mutation → single-flight + local-var fallback + epoch commit |
| 15 | MEDIUM | deadlock | `uploadFile`/`ingestFile` bypass the chokepoint entirely (raw `fetchWithTimeout`, hand-attached token, unconditional `res.json()`) → routed through the shared core |
| 16 | MEDIUM | test-blast | "~30 adapter test files" wrong by ~4× (actual 7; 2 not behavior-identical) → corrected, eraseData/startTrial carved out |
| 17 | MEDIUM | test-blast | Stage C's expected-fallout class is empty (no silent-empty-on-!ok pins exist); real risk was a mechanical rewrite erasing the startTrial message-surfacing guard → Stage C expectation rewritten |
| 18 | MEDIUM | test-blast | Call-count tripwire: kickoff must stay OUT of adapter module scope/constructor (5 files index `mock.calls[0]`) → zero-network-at-import/construction pin |
| 19 | MEDIUM→LOW | test-blast | 9 component test files render real ServiceProvider over hand-rolled mocks → ServiceProvider existing-members-only constraint |
| 20 | MEDIUM | sse-ws-auth | SSE has zero restart/error recovery even where it could work (`es.close()` in onerror; once-only subscribes) → part of the §1.4 "SSE auth + reconnect" single follow-up |
| 21 | MEDIUM | tier-ui | refreshTier failure path also clobbers trialInfo (StatusBar trial countdown transiently wiped); tierResolved semantics for unrecognized-tier unpinned → both pinned in (d) |
| 22 | MEDIUM→LOW | tier-ui | Nav `getDockForTier` confirmed pure capability gate → do-not-touch advisory + comment |
| 23 | MEDIUM | d3-fidelity | P7 deferral defense factually wrong for its own exemplar (MCPHubApp already connect-gated; gate adds nothing) and plus-clause narrowing was self-granted → two cheap wirings in §1.2(h) + decision-log note §3 |
| 24 | HIGH | contract (r1) | (v1 round) `installMcp` misattribution — superseded by #1's fuller statement; plus `addCustomMcp`/`updateMcpPermissions`/`revokeMcp`/`startMcp`/`stopMcp`/`testMcp` body-envelope class, `useChat` consumer correction, `AdapterHttpError.message` pin, BackupApp-only among direct sites, uninstall false-success fix |

## LOW (verified clean / advisory — no plan change beyond what v2 already carries)

- ensureReady 3-state ambiguity + sync memo assignment + settled-success memo retention → pinned in v2 §1.1(a).
- "Pass-through stays armed by accident of the import graph" → `boot-connect.ts` first-import + zero-network pin close it structurally.
- Setup files clean; no test imports main.tsx/App.tsx; Stage B existing-suite fallout ≈ zero (all coverage net-new).
- No adapter-level raw/envelope pins exist anywhere (confirms blindness diagnosis) → hard exit criterion.
- `subscribeHarvestProgress` degrades silently under 401 (import works, no progress UI) — noted in §1.4.
- `connectWebSocket` dead code, builds `?token=null` pre-token → P7 ledger.
- Trial-expired modal verified already-safe; UpgradeModal verified safe; KvarkNudge doesn't exist (resolves to SettingsApp Enterprise CTAs — covered by the Billing-tab fix).
- useFeatureGate / settings-tier-filter / persona-tier / dock-nudge / onboarding-tier-filter all local-state driven — excluded; stale comment + orphaned file → P7.
- `ComplianceDashboard.tsx:274` verified as THE live-confirmed CockpitApp crash; its `refreshTemplates` valid-empty cache added to §1.2(h).
- Ruling coverage sweep: all four D3 sub-items + five live-confirmed targets covered; six named getters stay on throwing path; deviation-class note → §3.
- Scope-creep audit: nothing cut-worthy; useBilling tagged as D3-4 extension.
