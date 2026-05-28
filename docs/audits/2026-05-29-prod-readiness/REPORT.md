# Waggle OS — Production-Readiness Hardening Audit

**Date:** 2026-05-29
**Scope:** Shippable product surface — sidecar (packages/server), frontend (apps/web), Tauri glue (app/), and shipped dependencies (packages/shared, packages/core / hive-mind-core, packages/agent).
**Method:** Build/test/lint gates + multi-perspective verified findings (refuted findings already dropped upstream). Verdicts: confirmed (verified end-to-end), unverified (plausible, evidence cited, not independently re-walked in this synthesis pass).

---

## 1. Executive Summary

The product builds and the unit suite is green (6627/6629; the 2 non-passes are one network-timeout infra flake and one skip). However, the audit surfaces a systemic input-validation gap on the sidecar HTTP boundary and a LAN-exposure-by-default posture that together undermine the project security contract (CLAUDE.md section 7).

The single most serious issue (R1-001) is a complete LAN auth-bypass: the sidecar binds to 0.0.0.0 by default and the unauthenticated /health endpoint returns the very bearer token used to authenticate every other route. Any co-located host can read the token and drive the full authenticated API (backup exfiltration, chat, file r/w, data erase).

Three themes dominate beyond that:

- Boundary validation is patchy by construction: a full set of Zod schemas exists in packages/shared/src/schemas.ts but is never wired in (R6-007), so every fs-write route (chat, tasks, ingest, documents) hand-rolls ad-hoc checks and several omit the existing assertSafeSegment guard, yielding path-traversal write sinks (R6-001, R6-002, R1-004, R2-005).
- Billing path has revenue/entitlement defects: /api/stripe/sync upgrades tier without verifying payment (R1-002), and checkout ignores billingPeriod and the 4-var price contract entirely (R1-003).
- Desktop lifecycle + resilience gaps: orphaned sidecar on exit (R7-002), inert watchdog (R7-003), wrong updater repo slug so auto-update 404s forever (R7-004), no top-level React error boundary (R4-001), and a memory-moat regression where harvest cognify indexes with a MOCK embedder, poisoning semantic recall (R3-001).

Gate blockers for ship: lint is non-functional (no root flat config) and tauri-tsc fails (empty app/src/). Neither is a source defect, but both mean two of the five quality gates currently provide zero signal.

Counts (post-dedup): 15 critical/high, 30 medium, 17 low. Recommended fix campaign is 6 phases, front-loaded on the network-exposure + traversal cluster.

---

## 2. Gate Results

| Gate | Status | Summary |
|---|---|---|
| build-web (npm run build) | PASS | Vite v5.4.21, 2373 modules, 28.51s, exit 0. Advisory warnings only (CSS @import order, dynamic/static import chunking, 1.68 MB main chunk over 500 kB). Does NOT typecheck the sidecar. |
| build-packages (npm run build:packages) | PASS | tsc --build chain (shared, core, agent, server), exit 0, zero diagnostics. Verified with --force clean rebuild + forced server rebuild (covers dirty telegram.ts). Genuine green. |
| lint (npm run lint) | FAIL (config) | ESLint 9.39.4 aborts (exit 2): no root eslint.config flat file and no .eslintrc. eslint . lints zero files. Only apps/web/eslint.config.js exists. Broken gate wiring, not a code defect. |
| test (npm run test -- --run) | PARTIAL | Vitest 3.2.4, exit 1. 6627 passed / 1 failed / 1 skipped (462 files). Sole failure = marketplace-sync.test.ts network timeout, infra flake. |
| tauri-tsc (tsc -p app/tsconfig.json) | FAIL (config) | TS18003 No inputs were found: app/src/ has zero .ts/.tsx files. Contradicts CLAUDE.md section 2. No Tauri TS glue to typecheck. |

---

## 3. Findings (severity-sorted, post-dedup)

Merges performed (kept highest severity + strongest verdict, unioned evidence):
- R1-001 superset of R2-001 (0.0.0.0 bind + /health token leak)
- R1-004 superset of R6-003 (ingest workspaceId traversal)
- R2-003 superset of R1-006 (CORS startsWith bypass)
- R2-006 superset of R1-013 (/api/debug/logs leak)
- R2-002 superset of R1-007 + R6-004 (OAuth reflected XSS; CSP mitigates to low)

| ID | Sev | Surface | File:line | Issue | Fix | Verdict |
|---|---|---|---|---|---|---|
| R1-001 (+R2-001) | critical | sidecar bootstrap + /health | service.ts:202, index.ts:278,2329, security-middleware.ts:236,278-283 | Default 0.0.0.0 bind + auth-exempt /health returns wsSessionToken = full LAN auth bypass | Bind 127.0.0.1 default (widen only on WAGGLE_HOST); stop returning wsToken from /health | confirmed |
| R1-002 | high | stripe/sync.ts:37-74 | POST /api/stripe/sync | Upgrades tier without checking payment_status; metadata fallback unlocks PRO/TEAMS for unpaid session | Require payment_status paid (or complete + active sub) before updateUserTier | confirmed |
| R1-003 | high | stripe/checkout.ts:29-50 | POST checkout | Ignores billingPeriod; always single legacy price so annual billed at monthly; or NO_PRICE_CONFIGURED under 4-var contract | Select price by billingPeriod from 4-var env w/ legacy fallback (mirror tierFromPriceId) | confirmed |
| R1-004 (+R6-003) | high | ingest.ts:149-154,420-433 | POST /api/ingest | addToFileRegistry builds fs path from unvalidated body workspaceId so traversal write | Resolve-and-confirm under dataDir/workspaces (mirror allowedRoot guard) | confirmed |
| R2-003 (+R1-006) | high | index.ts:1904 | CORS plugin | origin.startsWith() so attacker prefix host passes; localhost auth-exempt returns responses | ALLOWED_ORIGINS.includes(origin) exact match | confirmed |
| R3-001 | high | harvest.ts:409-419 | harvest cognify | Hard-codes mock embedder; vector-indexes harvested frames with meaningless vectors so unretrievable by semantic search | Reuse fastify.embeddingProvider; skip indexing when provider is mock | confirmed |
| R4-001 | high | App.tsx:13-29 | app/route shell | No top-level error boundary; any render throw white-screens whole app | Wrap Routes/Index + Desktop chrome+overlays in recoverable boundary | confirmed |
| R6-001 | high | chat.ts:530-546, chat-persistence.ts:21-46 | POST /api/chat | Unvalidated workspace/session from body so sessions jsonl traversal write/read on hot path | assertSafeSegment(workspace/session) before persist, 400 | confirmed |
| R6-002 | high | tasks.ts:26-50,92-137 | /api/workspaces/:id/tasks | Unvalidated :id in tasksPath/writeTasks so mkdir+write traversal | assertSafeSegment(id) at top of each handler | confirmed |
| R7-002 | high | lib.rs:132-140 | Tauri lifecycle | No RunEvent::Exit handler; tray Quit unwired so sidecar orphaned, holds port 3333, next launch fails | RunEvent::Exit handler kills child regardless of frontend | confirmed |
| R7-003 | high | service.rs:228-231 | watchdog | Detects downed sidecar, emits restart event, never respawns; listener unwired so permanent backend disconnect | Self-healing watchdog: clear dead Child + spawn_service_sync | confirmed |
| R7-004 | high | tauri.conf.json:56-59 | updater | Endpoint points to marolinik/waggle (actual repo waggle-os) so latest.json 404s every check | Correct slug in tauri.conf.json + 3 manifest URLs in release.yml | confirmed |
| R8-001 | high | LauncherApp.tsx:365,447-462; tool-launcher.ts:275-291 | AI-OS hooks | LAUNCH_COHORT routes cursor/claude-desktop hook actions to binless stub packages so npx always fails | HOOKS_COHORT = claude-code only; gate runHookCommand + buttons on it | confirmed |
| R9-002 | high | protobufjs@7.5.4 | hive-mind-core + apps/web | Below 7.5.5 fix for critical RCE GHSA-xq3m-2v4x-88gg (9.8); ships via transformers + posthog OTLP | overrides protobufjs >=7.5.5 (targeted) | confirmed |
| R9-005 | high | js-cookie@3.0.5 via @clerk/shared | apps/www auth + server clerk | Prototype-hijack cookie-attr injection GHSA-qjx8-664m-686j (7.5) on auth surface | Bump @clerk so @clerk/shared resolves js-cookie >3.0.5 | confirmed |
| R1-005 | medium | backup.ts:377-381 | restore | startsWith(dataDir) w/o sep so sibling-dir escape; write uses unvalidated targetPath | Guard resolved===root or startsWith(root+sep); write to resolved | confirmed |
| R2-006 (+R1-013) | medium | index.ts:1920-1937 | /api/debug/logs | Returns vault key NAMES + 500 audit rows; no same-origin gate (recon, esp. w/ R1-001) | isLocalOrigin guard; drop providerKeys; global setErrorHandler | confirmed |
| R3-002 | medium | subagent-orchestrator.ts:154-169 | subagent | Circular-dep failure mints NEW worker id so duplicate orphan + permanent pending ghost | Reuse stepWorkerIds.get(name); update in place | unverified |
| R3-003 | medium | retry-policy.ts:72-81 | 429 retry | HTTP-date Retry-After so parseInt NaN so setTimeout(0) so hammers endpoint, burns retries | Number.isFinite guard + default fallback | unverified |
| R3-004 | medium | frames.ts:251-267 | harvest dedup | findDuplicate SELECTs + SHA-256-hashes 500 rows per insert so O(n*500) blocks event loop | Indexed content_hash column; or per-batch hash set + skipDedup | unverified |
| R4-002 | medium | BackupApp.tsx:93 | backup UI | Restore button has no onClick/handler, dead control on data-safety app | Wire to file-picker POST /api/restore, or remove | confirmed |
| R4-003 | medium | useChat.ts:130-133 | chat stream | msgs last role unguarded; empty array mid-stream so render crash | Guard empty array return early | unverified |
| R4-004 | medium | HarvestTab.tsx:523-538 | harvest UI | async onClick no try/catch so unhandled rejection, stale row, no feedback | try/catch + toast; fetchSources after success | unverified |
| R4-005 | medium | ChatApp.tsx:520-534,1102 | chat pin | handlePin async no error handling fire-and-forget so silent pin failure | try/catch + toast | unverified |
| R4-006 | medium | BackupApp.tsx:18-22 | backup metadata | No response.ok before json(); non-2xx so misleading No backups yet | Check r.ok; error+retry panel | unverified |
| R4-007 | medium | ConnectorsApp.tsx:66-67,87-102 | connectors | Single shared tokenInput across connectors (wrong-cred footgun); connect failure console-only | Reset inputs on expanded change; toast in catch | unverified |
| R4-008 | medium | ChatApp.tsx:644-651 | chat file-drop | Ingest failures swallowed to console; user believes file ingested | Accumulate failures, success/failure toast | unverified |
| R6-005 | medium | browse.ts:26-94 | /api/browse/local + mkdir | Resolves any absolute path; enumerates host FS + mkdir anywhere; no confinement | Same-origin gate; rate-limit mkdir; no extension origins | unverified |
| R6-006 | medium | workspace-context.ts:254,313,350 | context helper | Session-dir path from unvalidated workspaceId so existence/count probe | assertSafeSegment(workspaceId) at callers/helper | unverified |
| R6-008 | medium | server tests (chat/tasks/ingest) | tests | No traversal test coverage for unguarded fs-write routes; green unit test gives false assurance | Per-route 400-on-traversal tests + assert no out-of-root file | unverified |
| R5-001 | medium | ContextMenu.tsx:32,43-82 | context menu | Enter indexes actionItems (skips disabled) but render index counts disabled so wrong item fires | Compute currentActionIndex with same filter | unverified |
| R5-002 | medium | TelegramDigestCard.tsx:136,160 | light-mode | Hardcoded text-emerald-400 saved label fails contrast on cream surface | Semantic success/status-healthy token | unverified |
| R5-003 | medium | LauncherApp.tsx:289-392 | light-mode | Dark-only bg-950 banners + pale text-300 so black islands on cream | Semantic adaptive tokens (bg-destructive/10 etc.) | unverified |
| R1-008 | medium | cron.ts:20-33,73-76 | GET /api/cron | Unguarded JSON.parse(job_config); one corrupt row so 500 breaks ENTIRE list | try/catch fallback to empty obj + log | unverified |
| R1-009 | medium | connectors.ts:16-24 | health probe | No try/catch around registry.healthCheck() so unhandled 500 + raw error leak | try/catch to status error or 502 | unverified |
| R1-010 | medium | agent-run.ts:38-40,85-92 | /api/agent/run | Module-level LiteLLM URL/key snapshot ignores built-in-proxy fallback so broken for Anthropic-only default | Read litellmUrl/key from server state at request time | unverified |
| R1-011 | medium | webhook.ts:22-32,73-124 | config write | Non-atomic read-modify-write of config.json + processed-events; concurrent so lost tier / double-process | Atomic temp+rename + mutex; idempotency in SQLite | unverified |
| R1-012 | medium | files.ts:117-120,312-319 | upload | getRawBody buffers entire body before size check so multi-GB OOM | Abort stream over MAX_UPLOAD_SIZE in data handler; or fastify multipart | unverified |
| R2-004 | medium | security-middleware.ts:276-294 | auth | No Host-header validation; DNS rebinding defeats localhost-trust exemption | Host allowlist; pair with 127.0.0.1 bind | unverified |
| R2-005 | medium | documents.ts:36,68,88 | documents | Unvalidated :id so workspaces/<id>/documents.json out-of-root write/read | assertSafeSegment(id) + (name) | unverified |
| R9-001 | medium | drizzle-orm@0.44.7 | sidecar/worker/launcher | GHSA-gpj5-g38j-94v9 SQLi via identifiers (<0.45.2); no sql.identifier sink, Postgres-only | Bump >=0.45.2 (major; re-tsc) | confirmed |
| R9-003 | medium | fastify@5.8.4 | sidecar HTTP | GHSA-247c body-schema bypass via Content-Type space (<=5.8.4); few routes use Fastify schema | Bump >5.8.4 (clears fast-uri); re-tsc + tests | confirmed |
| R9-004 | medium | clerk/fastify@3.1.5 | team auth | GHSA-w24r authz bypass org/billing/reverification (<=3.1.15); affected helpers not invoked | Bump >3.1.15 | confirmed |
| R9-006 | medium | lodash@4.17.23 | apps/web recharts + sidecar archiver | code-injection via template (<=4.17.23); template not reachable (hygiene) | overrides lodash >=4.17.24 | confirmed |
| R9-007 | medium | xmldom@0.8.11 via mammoth | sidecar docx ingest | XML injection via CDATA serialization (<0.8.12) | overrides xmldom >=0.8.13; verify mammoth | unverified |
| R9-008 | medium | tmp@0.2.5 via exceljs | sidecar xlsx export | Path traversal via prefix/postfix (<0.2.6) | overrides tmp >=0.2.6 | unverified |
| R9-009 | medium | fastify/static@9.0.0 | sidecar static | dir-listing traversal + route-guard bypass via encoded sep (<=9.1.0) | Bump >9.1.0; verify assets served | unverified |
| R2-002 (+R1-007,R6-004) | low | oauth.ts:190-194,268-286 | OAuth callback | Reflects untrusted query + upstream body into unescaped HTML; CSP script-src self blocks exec so markup/phishing only | HTML-escape (escapeXml exists); or return JSON | confirmed |
| R4-009 | low | useAgentStatus.ts:15-40 | hook | Initial poll() setState after unmount (no cancelled guard) | cancelled flag checked after await | unverified |
| R4-010 | low | ChatWindowInstance.tsx:194-203 | hook | fetchTeam lacks cancelled guard its siblings have so setState after unmount | if cancelled return after getTeamMembers | unverified |
| R3-005 | low | search.ts:172-178 | keyword search | Comment promises LIKE fallback that does not exist; FTS5 parse error so 0 hits, false no-memory | Implement LIKE fallback OR fix comment | unverified |
| R3-006 | low | sse-parser.ts:108-122 | streaming | Tool-call deltas missing index collapse to 0 so parallel tool args concatenated/corrupt | Synthetic index per distinct tc.id | unverified |
| R3-007 | low | knowledge.ts:131-135 | entity search | searchEntities does not escape LIKE metachars so percent/underscore wildcard, literal percent unfindable | Escape metachars + ESCAPE clause | unverified |
| R3-008 | low | agent-loop.ts:256-308 | abort | Signal checked only between turns; fetch + reader do not forward so in-flight stream runs to completion | Pass signal to fetch + check in read loop | unverified |
| R5-004 | low | UpgradeModal/TrialExpiredModal/EraseDataDialog | a11y | Modals lack role=dialog/aria-modal, Escape, focus trap | Add role/aria-modal + Escape + focus (reuse pattern) | unverified |
| R5-005 | low | AppWindow.tsx:283-300 | window chrome | Minimize + Maximize identical bg-primary/40 dots, indistinguishable without hover | Distinct colors or lucide icons | unverified |
| R5-006 | low | WorkspaceBriefing.tsx + 60 files | light-mode | 324 hardcoded Tailwind palette colors never respond to light theme; heading contrast borderline | Theme-aware tokens; convert load-bearing text first | unverified |
| R7-005 | low | lib.rs:83 | shortcut | register(shortcut) propagates error in setup() so Ctrl+Shift+W collision crashes on launch | Log + continue on Err | unverified |
| R7-006 | low | tauri.conf.json:4 / Cargo.toml:3 | version | Drift: tauri.conf 0.2.0 vs Cargo 0.1.0 | Sync Cargo.toml | unverified |
| R7-007 | low | tauri.conf.json:41 | CSP | img-src self data https so any-HTTPS image exfil channel | Scope img-src to icon CDN + self + data | unverified |
| R7-008 | low | tauri.build-override.conf.json:5-9 | signing | macOS ad-hoc sign so Gatekeeper block / updater cannot verify (needs macOS check) | Developer ID + notarization before GA | unverified |
| R8-002 | low | tool-launcher.test.ts / tools-routes-launch.test.ts | test-gap | Hook tests assert npx SHAPE but mock execution so binless-stub failure invisible to CI | Static cohort/bin test | unverified |
| R8-003 | low | tool-launcher.ts:36-38 | doc-drift | Module doc claims cursor/claude-desktop hooks supported; only claude-code functional | Amend comment | unverified |

---

## 4. Themes

1. T1 - Network exposure & auth boundary (headline risk): R1-001, R2-003, R2-004, R2-006, R6-005.
2. T2 - Sidecar input-validation gap at fs boundary: R1-004, R1-005, R6-001, R6-002, R6-006, R6-007, R6-008, R2-005, R2-002.
3. T3 - Billing correctness & revenue integrity: R1-002, R1-003, R1-011.
4. T4 - Memory/agent core correctness: R3-001..R3-008.
5. T5 - Frontend resilience & error feedback: R4-001..R4-010.
6. T6 - Desktop packaging & lifecycle: R7-002..R7-008.
7. T7 - AI-OS hook cohort mismatch: R8-001, R8-002, R8-003.
8. T8 - Backend error-handling robustness: R1-008, R1-009, R1-012.
9. T9 - Dependency supply-chain hygiene: R9-001..R9-009.
10. T10 - Light-mode finish & a11y polish: R5-001..R5-006.

---

## 5. Proposed Remediation Phases

### Phase 1 - Network exposure & auth boundary (CRITICAL/HIGH)
Closes: R1-001, R2-003, R2-006, R2-004, R6-005
Cluster: local/index.ts + security-middleware.ts + cors-config.ts. Default-bind 127.0.0.1, remove wsToken from /health, exact-match CORS, Host-header allowlist, gate /api/browse/* + /api/debug/logs to local origin.
Verify: tsc -p packages/server; new tests (/health no wsToken, non-local origin rejected, traversal-prefixed origin rejected); manual LAN curl shows no token.

### Phase 2 - fs-boundary input validation (HIGH/MEDIUM)
Closes: R6-001, R6-002, R1-004, R1-005, R2-005, R6-006, R6-007, R6-008
Cluster: wire assertSafeSegment / resolve-and-confirm + existing Zod schemas across chat, tasks, ingest, documents, backup restore, workspace-context.
Verify: new per-route traversal tests (R6-008) asserting 400 + no out-of-root write; packages/server Vitest green; tsc -p packages/server.

### Phase 3 - Billing correctness (HIGH)
Closes: R1-002, R1-003, R1-011
Cluster: packages/server/src/stripe/. Payment-status gate on sync, billingPeriod-aware 4-var price selection, atomic + locked config writes.
Verify: sync rejects unpaid (402); checkout selects annual price; NO_PRICE_CONFIGURED only when truly unset; webhook.test.ts green; tsc.

### Phase 4 - Memory/agent core + AI-OS hooks (HIGH/MEDIUM)
Closes: R3-001, R8-001, R8-002, R8-003, R3-002, R3-003, R3-004
Verify: harvest cognify skips/real-provider test; static cohort/bin test (R8-002) red to green; packages/agent Vitest; tsc -p packages/agent.

### Phase 5 - Desktop lifecycle, updater & frontend resilience (HIGH/MEDIUM)
Closes: R7-002, R7-003, R7-004, R7-005, R7-006, R4-001, R4-002, R4-003, R4-004, R4-005, R4-006, R4-007, R4-008, R1-008, R1-009, R1-010, R1-012
Verify: cargo build (app/src-tauri); manual kill so no orphaned node.exe on 3333, updater hits waggle-os URL; npm run build + Playwright (error boundary catches forced throw, Restore works).

### Phase 6 - Dependency hygiene, security polish & light-mode/a11y (MEDIUM/LOW)
Closes: R9-002, R9-005, R9-001, R9-003, R9-004, R9-006, R9-007, R9-008, R9-009, R2-002, R7-007, R7-008, R5-001, R5-002, R5-003, R5-004, R5-005, R5-006, R3-005, R3-006, R3-007, R3-008, R4-009, R4-010
Prefer targeted root overrides for transitive advisories (avoid blanket npm audit fix). Semantic-token swaps for light-mode; a11y modal pattern reuse.
Verify: npm audit clears protobufjs/js-cookie/lodash; npm run build:packages + npm run build green after bumps; tsc -p packages/server after drizzle/fastify majors; light-mode spot-check.

### Cross-cutting gate repair (alongside Phase 1)
lint and tauri-tsc gates are non-functional. Add root eslint.config.js (or scope lint to apps/web) and populate/point app/tsconfig.json at real Tauri TS or remove the dead gate, so future phases get real verification signal.
