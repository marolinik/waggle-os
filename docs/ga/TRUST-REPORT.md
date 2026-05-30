# Waggle OS — Independent Verification (Trust Report)

**Date:** 2026-05-29
**Verifier:** independent read-only workflow (13 agents, ~873K tokens) — a *different* lane from the session that wrote the fixes.
**Target:** `hardening/prod-readiness` @ HEAD `0f6bb4c` (31 unpushed commits, Phases 1→6 of the 2026-05-29 audit).
**Method:** static read of the live tree at run time + adversarial skeptics on every "fixed" security/billing verdict. **Caveat:** static analysis, not dynamic — no builds/tests were run (collision-safe alongside the active fixing session). Items needing live exercise are flagged. Tree was clean at run time; if the other session edited mid-run, a verdict could reflect a transient state.

---

## 1. Bottom line

**The 6-phase execution largely worked.** ~29 findings are *solidly* closed under independent review — including the headline LAN-bind (R1-001 default path), the memory-moat mock-embedder regression (R3-001), all 8 dependency CVEs that could be safely bumped, and all 8 frontend-resilience findings.

**But "committed" ≠ "closed."** The adversarial pass found that **5 of the security/billing fixes verified as "fixed" by the cluster reviewers are actually bypassable or incomplete**, and **2 quality gates remain dead** (lint, tauri-tsc) — meaning the green test run is still two-fifths blind. The single biggest *systemic* finding: the sidecar's **"any loopback caller is trusted, no auth"** model is the root cause behind several bypasses and is the wrong threat model for a desktop app that coexists with browsers, extensions, and other local apps.

**Ship-readiness verdict:** the *architecture* and the *bulk* of the hardening are genuinely sound. **Do not GA** until the localhost-trust cluster + the empty-Host bypass + PATCH /api/tier + the two dead gates are closed. These are surgical, not architectural.

---

## 2. Scorecard

| Cluster | Solid-fixed | Partial / skeptic-downgraded | Not fixed |
|---|---|---|---|
| Security · network/auth | R1-001*, R2-003*, R2-004* (verified fixed, **skeptic-downgraded**) | R2-006, R6-005 | — |
| fs-traversal | R6-001, R6-002, R6-006, R6-008, R1-004, R1-005, R2-005 | — | **R6-007** (Zod unwired) |
| Billing | — | R1-011; **R1-002\***, **R1-003\*** (skeptic-downgraded) | — |
| Quality gates | build-typecheck ✅ | — | **lint-gate** ⛔, **tauri-tsc** ⛔ |
| Memory/agent core | R3-001, R3-003 | R3-002 (code ok, no test) | **R3-004** (O(n·500) hot path) |
| Desktop lifecycle | R7-003, R7-004 | **R7-002** (orphan via tray Quit) | — |
| Deps supply-chain | R9-002/003/004/005/006/007/008/009 | — | **R9-001** (drizzle, deferred) |
| Frontend resilience | R4-001…R4-008, R5-001 | R5-002, R5-003 | **R5-006** (light-mode ~0.6%) |

`*` = cluster verifier said *fixed*, but the adversarial skeptic found a concrete bypass. **Treat as open.**

---

## 3. 🔴 NEW issues the adversarial pass surfaced (highest value — not in the original audit, or understated by it)

These are the findings that *independent* verification bought you. None were caught by the same-agent self-grading.

| # | Severity | Where | Issue | Fix |
|---|---|---|---|---|
| **AV-1** | **HIGH (default path!)** | `security-middleware.ts:289-290` | **Empty/absent `Host` header bypasses the DNS-rebinding allowlist in the DEFAULT 127.0.0.1 config.** `if (hostHeader && !ALLOW.has(hostHeader))` — empty string is falsy, so a `Host:`-less request (curl, HTTP lib) skips the check entirely. No env change needed. | Block on absent host too: `if (!hostHeader \|\| !ALLOW.has(hostHeader)) return 403`. |
| **AV-2** | **HIGH** | `local/routes/waggle-signals.ts:~89` | **`/api/waggle/stream` reflects `request.headers.origin ?? '*'`** as `Access-Control-Allow-Origin` — textbook origin-reflection. A page on `evil.com` can `EventSource` the full signal stream. Does NOT use the fixed `corsOriginAllowed`. | Route the SSE header through `corsOriginAllowed` / `validateOrigin` like chat.ts does. |
| **AV-3** | **HIGH (revenue)** | `local/routes/settings.ts:351-373` | **`PATCH /api/tier` writes any tier to `config.json` with no payment check and no auth** (localhost-trust exemption). Any local web page/extension/app can `PATCH {tier:'TEAMS'}` and unlock paid features for free. The R1-002 fix only guarded the `/stripe/sync` path — this sibling path is wide open. | Gate tier mutation behind verified Stripe state; remove the unauthenticated write path or require a signed token. |
| **AV-4** | MED (correctness) | `stripe/checkout.ts` + `stripe/index.ts:91-99` | **`billingPeriod` has no runtime validation** (TS-only type; Fastify doesn't enforce). And under the legacy single-var env contract, an `annual` request **silently resolves to the monthly price** — the test suite even asserts this as passing. | Validate `billingPeriod` enum at runtime; fail closed (or warn) when an annual request can't find an annual price. |
| **AV-5** | MED | `net-config.ts:23` | `isLoopbackBind()` strict-compares to `'127.0.0.1'` only, so **`WAGGLE_HOST=localhost` *or* `::1`** (both natural loopback choices) disable the entire Host allowlist. | Recognize `localhost`, `::1`, `::ffff:127.0.0.1` as loopback. |

**Systemic root cause (the strategic one):** `security-middleware.ts` exempts *all* loopback connections from bearer auth. For a **desktop** product that runs next to browsers/extensions/other local apps, "local = trusted" means any of them can drive the authenticated API (AV-3 is the proof). This is the threat-model item to decide deliberately, not patch piecemeal — see PRODUCTION-PLAN Workstream A.

---

## 4. ⛔ Ship blockers still open

1. **lint-gate — NOT FIXED.** No root `eslint.config.*`; `npm run lint` (`eslint .`) aborts under ESLint 9 flat-config having linted **zero files**. The commit that closed build-gate issues *documented skipping this*. All of `packages/*`, `app/*` are unlinted in CI.
2. **tauri-tsc — NOT FIXED.** `app/tsconfig.json` still `"include": ["src"]`; `app/src/` doesn't exist → `TS18003`, zero type signal for the Tauri layer. `app/scripts/` + `app/tests/` TS is unchecked.
   - → **Two of five gates report green by reporting nothing.** This is workstream-0.
3. **AV-1, AV-2, AV-3** above (default-path Host bypass; SSE origin reflection; unauthenticated tier escalation).

---

## 5. 🟡 Partials (fix landed, but incomplete)

- **R2-006** — same-origin gate + vault-key-names dropped ✅, but `/api/debug/logs` still `SELECT *`s 500 `install_audit` rows (capability installs w/ risk_level, approval_class) — recon material. Limit columns + rows.
- **R6-005** — both browse routes gated ✅, but `POST /api/browse/local/mkdir` does `mkdirSync(path.resolve(dirPath))` with **no root confinement** → can create dirs anywhere; no dedicated rate limit.
- **R1-011** — atomic temp+rename write ✅, idempotency list-check ✅, but **no mutex** → concurrent Stripe retry can race the read-check-write and double-process a tier-change event. Add a module-scoped promise queue.
- **R7-002** — `RunEvent::Exit` kill block exists ✅ **but is unreachable via the primary quit path**: tray "Quit Waggle" emits `waggle://quit` to a frontend with **no listener** (confirmed by grep), and window-close is prevented. User clicks Quit → sidecar orphaned on :3333 → next launch fails. Add `app.exit()` in the tray quit arm.
- **R3-002** — circular-dep duplicate-worker-id fixed in code ✅ but **no test** exercises the circular-dep path.
- **R5-002 / R5-003** — token renamed / container made semantic, but `--status-healthy` has **no light-theme value** and 10+ palette badges remain → still fails contrast on cream.

---

## 6. ❌ Not fixed (deliberate or deferred)

- **R6-007** — Zod schemas in `@waggle/shared` are used in *cloud* routes but **still not wired to the four local sidecar fs-write routes** (chat, tasks, ingest, documents) — they hand-roll checks. Traversal itself is guarded by `assertSafeSegment`, so this is **defence-in-depth / body-validation quality**, not an open traversal sink.
- **R3-004** — `frames.ts findDuplicate` still `SELECT *`s 500 rows and SHA-256-hashes each on **every** insert → O(n·500) event-loop block on large harvests. No `content_hash` column added. Hot-path perf/reliability.
- **R9-001** — `drizzle-orm@0.44.7` stays (GHSA HIGH). 0.44→0.45 major broke module resolution (19 test files), **honestly deferred**. Latent, not live: `sql.identifier` sink is absent from the codebase today. Needs a real migration + re-tsc before GA.
- **R5-006** — light mode is **~0.6% done**: 358 hardcoded palette classes across 62 files; only 2 converted. The whole light surface is effectively broken.
- **R5-004, R5-005** — a11y modals / window-control dots: never claimed fixed; **cannot determine** (out of scope of these commits).

---

## 7. ✅ Genuinely closed (high confidence) — keep, don't re-litigate

- **R1-001 default path** (127.0.0.1 bind via `resolveBindHost()`; `/health` no longer returns `wsSessionToken`) — solid for the default config (caveats AV-1/AV-5 are the *Host-allowlist* layer, not the bind/token leak).
- **fs-traversal**: R6-001/002/006/008, R1-004/005, R2-005 — `assertSafeSegment` at every route boundary + 6 dedicated traversal test files asserting 400 + no out-of-root artifact. Strong.
- **R3-001** (mock-embedder poisoning) — now reads `fastify.embeddingProvider`, skips indexing when mock, with a two-branch integration test. The memory-moat regression is genuinely repaired.
- **Deps**: protobufjs 7.6.1 (clears 9.8 RCE), js-cookie 3.0.8, lodash 4.18.1, tmp 0.2.7, fastify 5.8.5, @fastify/static 9.1.3, @clerk/fastify 3.1.32, @xmldom/xmldom 0.8.13 — single resolved installs, no shadow copies. (Recommend a live HTTP smoke for fastify/@fastify/static.)
- **Frontend resilience**: R4-001 (root + per-window error boundaries), R4-002 (real restore picker), R4-003…008 (async handlers wrapped + toasts), R5-001 (context-menu keyboard index) — well-executed, several with unit tests.
- **Desktop**: R7-003 (self-healing watchdog w/ backoff), R7-004 (updater slug correct in conf + release.yml).

> Updater note: pubkey is set but `release.yml` writes `"signature": ""` for all platforms — signed auto-updates still can't verify. That's R7-008 (signing), tracked in the plan's Release workstream.

---

## 8. What this means

The fixing session did **strong, real work** — this is not a case of hollow commits. But it confirms the project's core risk pattern: **fixes are graded by the agent that wrote them, against the one path it was thinking about.** Independent adversarial review found the *sibling paths* (PATCH /api/tier vs /stripe/sync; waggle-signals vs chat SSE; empty-Host vs named-Host). That gap-class is exactly what the PRODUCTION-PLAN's verification workstream institutionalizes so it stops recurring.

→ See `PRODUCTION-PLAN.md` for how these residuals sequence into the 1–2 month GA push.
