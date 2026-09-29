# Phase A — revalidation of the `tiers-kvark` group

> **English translation** of [tiers-kvark.md](tiers-kvark.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Revision under review:** `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (HEAD confirmed with `git rev-parse HEAD`; `git status --porcelain` shows only two untracked `.docx` files in `docs/`, so working tree == HEAD for all listed files).
**Date:** 2026-09-27. **Mode of work:** read-only (git show/grep/sed, one targeted `vitest run` in a temp directory; after the test `git status` unchanged). **Stripe, the GitHub API and any other external service were not called.**
**S1 claims processed:** C2, C5, C20, A2 (tier part), A27, WB (+ the A12 tier part and the A15 Approvals-gate part, because they depend directly on the same inventory). Related AT: AT-26, AT-27, AT-18.

Status legend: **CONFIRMED AT REVISION** · **PARTIAL/UNWIRED** · **NOT CONFIRMED** · **ALREADY CLOSED** · **UNKNOWN** · **AUDIT FINDING — TO VERIFY**.

---

## 0. What was verified by test (verification limit)

Run under Node `v22.23.2` (fnm), `node node_modules/vitest/vitest.mjs run --maxWorkers=2`:

| File | Result |
|---|---|
| `packages/server/tests/tier-enforcement-matrix.test.ts` | pass |
| `packages/server/tests/kvark/kvark-wiring.test.ts` | pass |
| `packages/server/tests/kvark/kvark-config.test.ts` | pass |
| `packages/server/tests/stripe/webhook.test.ts` | pass |
| `packages/server/tests/stripe/checkout.test.ts` | pass |
| `packages/core/tests/team-sync.test.ts` | pass |
| `packages/server/tests/routes/connectors-tier.test.ts` | pass |
| `packages/agent/tests/kvark-tools.test.ts` | pass |

**8 files / 144 tests, all green, 48 s.** This proves that the tier gates, the Stripe mapping and the KVARK factory are *regression-locked in their current form* — it does not prove the E2E function of the KVARK connection (see F-TK-11). `packages/server/tests/stripe/smoke-e2e.test.ts` was not run (it requires a real `STRIPE_SECRET_KEY`), nor was anything from `vitest.infra-suites.ts` (Postgres/Redis).

---

## 1. Finding records

### F-TK-01 — C2 (core): the 4-tier TRIAL/FREE/TEAMS/ENTERPRISE system with a paid TEAMS tier is still alive in the code
- **S1 claim:** "Code and business still run TEAMS $49, TRIAL (15-day Team preview) and ENTERPRISE, with Stripe live products, www pricing, a Teams server (Postgres+Clerk), team-sync and TEAMS-gated Approvals, costs and audit."
- **Status:** **CONFIRMED AT REVISION** for the code. **UNKNOWN** for "Stripe live products" and active subscribers (no external call is allowed; brief §12.2 requires an authorized inventory before migration).
- **Commit:** `2af0904d`.
- **Path/symbol:**
  - `packages/shared/src/tiers.ts:20` `TIERS = ['TRIAL','FREE','TEAMS','ENTERPRISE']`; `:8-12` TEAMS price $49/mo per seat; `:103-123` TEAMS capabilities (`stripePriceId: readEnv('STRIPE_PRICE_TEAMS')`); `:149-151` `TIER_ORDER { FREE:0, TEAMS:2, ENTERPRISE:3, TRIAL:3 }`; `:164-169` `TIER_LABELS` (FREE → "Solo", TEAMS → "Team").
  - `packages/server/src/middleware/assert-tier.ts:45-63` `requireTier()` → 403 `TIER_INSUFFICIENT` + `upgradeUrl: 'https://waggle-os.ai/upgrade'` (`:57`).
  - `packages/server/src/local/tier-session-cap.ts:3-7` `maxWorkspaceSessionsForTier`: FREE=10, TEAMS=25, everything else 100 — the actual Solo limit; applied by `settings.ts:91-94 applyRuntimeTier`.
- **Input:** `config.json` without `tier` (or `tier:'FREE'`) → `GET /api/cost/by-workspace`.
- **Current output:** 403 `{ error:'TIER_INSUFFICIENT', required:'TEAMS', actual:'FREE', upgradeUrl }`.
- **Repro test:** `packages/server/tests/tier-enforcement-matrix.test.ts` (endpoint × tier matrix; comment `:14-17` says the test is intentionally a "tripwire" that fails when a gate is removed or added).
- **Expected (D-01/D-02, brief §12.2, §9.2):** individual protection, approvals and reasonable control over work are not behind the TEAMS paywall; Team comes through KVARK, not through a local tier flag.
- **Smallest change (for writers, not design):** for each row from F-TK-19 make a decision *keep as KVARK adapter / extract / legacy compat / remove with a test*; `tier-enforcement-matrix.test.ts` already has a pattern for de-gating (rows `minTier:'FREE'` after the PRO removal, `:43-49`) — a new de-gating decision is expressed by changing `minTier` in the same matrix.
- **Related AT:** AT-26, AT-27, AT-18.

### F-TK-02 — C2/A15: Approvals "TEAMS-gated" is only navigation hiding; the route and the API are not gated
- **S1 claim:** "TEAMS-gated Approvals" (C2), "remove the TEAMS gate" (A15).
- **Status:** **PARTIAL/UNWIRED** — the gate exists **only in the UI navigation**; the `/approvals` route and the server API are open to all tiers.
- **Path/symbol:** `apps/web/src/lib/dock-tiers.ts:82` `minBillingTier: 'TEAMS'` on `approvals` (comment `:81` "Approvals: TEAMS-tier trust/audit surface (Pro gets inline chat approvals)"); `apps/web/src/components/os/AppShell.tsx:727-728` `if (billingRank >= BILLING_TIER_ORDER.TEAMS) items.push({ key:'approvals' … })`; `apps/web/src/routes/ApprovalsRoute.tsx:1-6` explicitly: "route registered for everyone; the NAV entry carries minBillingTier 'TEAMS' … tier-hidden, not stripped"; `apps/web/src/components/os/apps/ApprovalsApp.tsx` — zero tier references (grep `TEAMS|tierSatisfies|billingTier` empty); `packages/server/src/local/routes/approval.ts` and `chat-approval-hook.ts` — zero `requireTier` (grep empty).
- **Input:** a FREE user opens `/approvals` directly (URL or ⌘K).
- **Current output:** the app renders and the API works; only the navigation entry is missing.
- **Repro/limit:** verified by grep; there is no e2e test covering direct-URL access on FREE (limit).
- **Expected (A15, brief §9.2):** approvals are core for the individual and visible without a paywall.
- **Smallest change:** remove `minBillingTier:'TEAMS'` at `dock-tiers.ts:82` and the condition `billingRank >= …TEAMS` at `AppShell.tsx:728`; update the comment in `ApprovalsRoute.tsx`. No server change.
- **Related AT:** AT-18, AT-12.

### F-TK-03 — C2: the cost routes are TEAMS-gated on the server (exact lines from S1 confirmed)
- **Status:** **CONFIRMED AT REVISION** (the S1 cite `cost.ts:210,272` is accurate at this revision).
- **Path/symbol:** `packages/server/src/local/routes/cost.ts:210` `GET /api/cost/by-workspace` `{ preHandler:[requireTier('TEAMS')] }`; `:272` `GET /api/costs` alias, same gate (comment `:271` "Cost visibility is a Team feature"). The UI tolerates 403: `apps/web/src/components/os/apps/TelemetryApp.tsx:53,60,270`.
- **Input/output:** FREE → 403 `TIER_INSUFFICIENT`. A Solo user does not see cost per workspace.
- **Repro test:** `tier-enforcement-matrix.test.ts` row `/api/cost/by-workspace minTier:'TEAMS'`.
- **Expected:** brief §12.2 "reasonable control over work must not remain behind the TEAMS paywall"; S1 §5 listed the "per-workspace cost view" as a cheap individual unblocker.
- **Smallest change:** remove the two `preHandler`s; switch the matrix rows to `minTier:'FREE'`.
- **Related AT:** AT-03 (budget visibility), AT-18.

### F-TK-04 — C2: audit export and admin overview are TEAMS-gated; overview returns placeholder data
- **Status:** **CONFIRMED AT REVISION** + **AUDIT FINDING — TO VERIFY** (stub content).
- **Path/symbol:** `packages/server/src/local/routes/settings.ts:1170` `GET /api/admin/overview` `requireTier('TEAMS')` — the body `:1171-1189` returns `usage:{ totalInputTokens:0, totalOutputTokens:0 }`, `connectors: []` (hardcoded); `:1192` `GET /api/admin/audit-export` `requireTier('TEAMS')` — the body reads `server.auditStore.getAll()` and returns JSON/CSV (`:1196-1215`), i.e. a **real** audit export of the local `install_audit` trail.
- **Input/output:** FREE → 403 on both. TEAMS → overview with zeros; audit-export with real rows.
- **Repro test:** `tier-enforcement-matrix.test.ts` rows `/api/admin/overview`, `/api/admin/audit-export`.
- **Expected:** basic audit is in `TIER_CAPABILITIES.FREE.auditLog:'basic'` (`tiers.ts:96`) and CLAUDE.md §1 says "basic audit — free forever"; exporting one's own local trail is an individual control (GDPR/export direction, brief §12.4).
- **Smallest change:** de-gate `audit-export` (`:1192`); `overview` is a candidate for removal or extraction because it has no real data (placeholder).
- **Related AT:** AT-27 (export/erasure), AT-18.

### F-TK-05 — C2: the www pricing copy still sells Team at $49/seat and links to the private GitHub repo
- **Status:** **CONFIRMED AT REVISION** (copy). Link to `github.com/marolinik/waggle-os`: **AUDIT FINDING — TO VERIFY** (repo visibility was not verified externally; CLAUDE.md §1 says it is private).
- **Path/symbol:** `apps/www/messages/en.json:196-250` — `"headline": "Memory is free forever. Pay when you scale."`, `"subhead": "Every install starts with 15 days of everything unlocked…"`, `tiers.teams.price_monthly: "$49/seat/month"`, `price_annual: "$490/seat/year"`, `cta: "Get Team"`, `enterprise.note: "Consultative — KVARK"`, `cta: "Talk to KVARK"`; `apps/www/app/_components/Pricing.tsx:10` `type TierId = 'SOLO' | 'TEAMS'`, `:42-53` TEAMS `ctaType:'stripe'`, `:56-58` `STRIPE_ENDPOINT = NEXT_PUBLIC_API_URL + '/api/stripe/checkout'`; `apps/www/app/_components/FinalCTA.tsx:5,33,38` "View on GitHub" → `https://github.com/marolinik/waggle-os`; `apps/www/app/download/page.tsx:18` `SOURCE_URL` the same repo; `Footer.tsx:30-53` and `OpenSource.tsx:5` → `marolinik/hive-mind` (public mirror).
- **Input/output:** a visitor clicks "Get Team" → Stripe checkout for TEAMS; clicks "View on GitHub" → private repo (404 for a visitor without access, if the repo is private).
- **Repro/limit:** `apps/www/__tests__/Pricing.test.tsx:11` pins the checkout URL; there is no test for the copy. Repo visibility was not verified.
- **Expected (D-01/D-02):** there is no separate Waggle Team SKU; "Team" = KVARK.
- **Smallest change:** copy in `en.json` + `TIER_DEFS` in `Pricing.tsx` (remove the TEAMS card or redirect it to a KVARK CTA); align `FinalCTA.tsx:5` with the actual repo visibility at the time of release.
- **Related AT:** —.

### F-TK-06 — C2/A2: the Stripe integration is TEAMS-only; `tierFromPriceId` already has a PRO→FREE precedent for migration
- **Status:** **CONFIRMED AT REVISION** (code). Live products/subscribers: **UNKNOWN**.
- **Path/symbol:** `packages/server/src/stripe/index.ts:68-84` `tierFromPriceId`: PRO/BASIC price envs → `'FREE'`, TEAMS envs → `'TEAMS'`, everything else `null` (comment `:64-66` explains the Solo/Team collapse); `:88-107` `priceIdForTier` only TEAMS has a price; `checkout.ts:34-37` `if (tier !== 'TEAMS') 400 INVALID_TIER`; `webhook.ts:69-79` `updateUserTier` writes `config.json { tier, stripe_customer_id }` via an atomic rename (`:25-46`) and with serialization (`:57-63`); `webhook.ts:152-163` `customer.subscription.updated` → `tierFromPriceId`; `:166-169` `subscription.deleted` → `'FREE'`; `sync.ts:19-21,64,80` poll path for desktop (NAT). Frontend: `apps/web/src/hooks/useBilling.ts:1-7`, `PaymentSuccessApp.tsx:28` `isPaid = PRO||TEAMS||ENTERPRISE`.
- **Input/output:** webhook with a TEAMS price → `config.json tier:'TEAMS'`; with a legacy PRO price → `tier:'FREE'`.
- **Repro test:** `packages/server/tests/stripe/webhook.test.ts:105-215` (`tierFromPriceId` cases), `checkout.test.ts` — all passed.
- **Expected (brief §12.2):** no authorization for cancellation/refund; first an inventory of actual customers; migration only if obligations exist.
- **Smallest change:** if the TEAMS SKU is discontinued, the same pattern as PRO (`teamsPrices → 'FREE'` or a separate `'LEGACY_TEAMS'` — a writers' decision) + `checkout.ts` 400 for all tiers; a migration test analogous to `webhook.test.ts:137-147`.
- **Related AT:** AT-27.

### F-TK-07 — C2/A2: `config.json` `tier`/`trialStartedAt` — five readers, three writers; `parseTier` is the existing migration mechanism
- **Status:** **CONFIRMED AT REVISION** (inventory). Minor inconsistency: **AUDIT FINDING — TO VERIFY**.
- **Readers:** `assert-tier.ts:21-32 readTierFromDataDir` (uses `getEffectiveTier`); `settings.ts:1008-1018 readTierConfig` (+`getEffectiveTier` `:1023`); `embedding.ts:45` (`getEffectiveTier`); `connectors.ts:181-183` (reads the raw `tier`, **without** `getEffectiveTier` → an expired TRIAL would pass as TRIAL; no effect, because `connectorLimit:-1` for all tiers, `tiers.ts:62,83,104,125`); `workspaces.ts:339-341` (same, `workspaceLimit:-1` everywhere).
- **Writers:** `webhook.ts:69-79 updateUserTier` (and via `sync.ts:80`); `settings.ts:1060-1090 PATCH /api/tier` — **disabled** unless `WAGGLE_ALLOW_TIER_OVERRIDE=1` (`:1068-1070`, AV-3 fail-closed); `settings.ts:1092-1137 POST /api/tier/start-trial` (atomic `tier:'TRIAL' + trialStartedAt`, 409 if it already exists). Client: `apps/web/src/lib/adapter.ts:3901-3930 startTrial`.
- **Legacy mapping:** `tiers.ts:154-161 LEGACY_TIER_MAP { solo, basic, pro → FREE; business → TEAMS; enterprise; trial }`; `:177-181 parseTier` — read-compatible migration without writing. Client: `ShellContext.tsx:181-186` PRO→FREE; `PlanCards.tsx:59` `RANK` still contains PRO; `SettingsApp.tsx:1029,1041` still compares `billing.tier === 'PRO'`.
- **Input/output:** `config.json { tier:'pro' }` → all readers → `'FREE'`.
- **Repro test:** `apps/web/src/lib/tiers.test.ts` (trial helpers), `packages/server/tests/d11-datadir-tier.test.ts` (`readTierFromDataDir` fail-closed), `webhook.test.ts`.
- **Expected (AT-27, brief §12.4):** read-compatible config migration, repeatable, without financial side effects.
- **Smallest change:** any future retirement of TEAMS/ENTERPRISE/TRIAL as *local* flags goes through `LEGACY_TIER_MAP` (the same mechanism as PRO), and `connectors.ts:183` and `workspaces.ts:341` should use `readTierFromDataDir` instead of their own reading (dedup; three implementations of the same read).
- **Related AT:** AT-27.

### F-TK-08 — C2: the Teams server (Postgres + Clerk + Redis) exists and starts from the local sidecar only with `DATABASE_URL` + `CLERK_SECRET_KEY`
- **Status:** **CONFIRMED AT REVISION**.
- **Path/symbol:** `packages/server/src/index.ts:41-60 buildServer` (drizzle/postgres `db/connection.ts:1-7`, `plugins/auth.ts`, `routes/teams.ts`, `ws/gateway.ts`); `config.ts:21` default `postgres://localhost:5434/waggle`, `:26-27` Clerk keys; footprint of 49 files outside `local/`, `kvark/`, `stripe/` (`git ls-files packages/server/src` filtered). Start: `packages/server/src/local/index.ts:3585-3614` — `if (process.env.DATABASE_URL && !VITEST && NODE_ENV!=='test')`; without `CLERK_SECRET_KEY` it logs an error and skips (`:3593-3598`), otherwise a dynamic `import('../index.js')` and `listen 127.0.0.1:TEAMS_SERVER_PORT||3101`. `GET /api/tier` reports `teamsServerAvailable: !!process.env.DATABASE_URL` (`settings.ts:1035-1038`).
- **Input/output:** Windows Solo install without env variables → the Teams server does not start; tier `teamsServerAvailable:false`.
- **Repro/limit:** the Teams server tests are in `vitest.infra-suites.ts:16-36` (Postgres 5434 + Redis 6381) and are **excluded from the default gate**; they were not run.
- **Expected (brief §12.2):** do not delete the whole team backend just to change a slogan; keep as KVARK adapter / extract / legacy / remove with a test — a writers' decision.
- **Smallest change:** no code before the decision; the inventory is here.
- **Related AT:** AT-26.

### F-TK-09 — C2: team-sync is actually wired (push-on-write + pull-on-activate), but only for a workspace with a `teamId` and a token from the TEAMS-gated `/api/team/connect`
- **Status:** **CONFIRMED AT REVISION** (exists and works according to the tests; conditioned on the TEAMS tier).
- **Path/symbol:** `packages/core/src/team-sync.ts:1-26` `TeamSync` (entities API, `entityType='memory_frame'`); `packages/server/src/local/index.ts:1440-1503 getTeamSync` (requires `wsConfig.teamId && teamServerUrl` and `waggleConfig.getTeamServer().token`), `:1661-1704` on workspace activation: `orchestrator.setTeamSync(sync)` + `sync.pullFrames(...)` → `wsFrameStore.createIFrame('team-sync', '[Team:author] …', importance, 'import')`; push: `packages/agent/src/pattern-write-back.ts:222-223`; the token comes from `packages/server/src/local/routes/team.ts:143 POST /api/team/connect` `requireTier('TEAMS')` (HTTPS mandatory `:149-153`, health check `:157-175`); `WaggleConfig.teamServer` `packages/core/src/config.ts:28,381-393`.
- **Input/output:** FREE tier → `/api/team/connect` 403 → `getTeamServer()` null → `getTeamSync` returns null → `setTeamSync(null)`.
- **Repro test:** `packages/core/tests/team-sync.test.ts` (pass), `packages/server/tests/local/chat-teamsync-push-characterization.test.ts` (push characterization; not run here).
- **Expected (D-02, brief §12.1):** organizational synchronization goes through the KVARK connection, not through the local tier; the personal mind is not copied automatically.
- **Smallest change:** none before the "KVARK adapter vs legacy" decision; note: pull writes other people's frames into the **workspace** mind (not the personal one), which is consistent with isolation.
- **Related AT:** AT-26, AT-13.

### F-TK-10 — C20: `packages/worker` has its own chat/task/group/cron/waggle handlers with execution semantics that differ from the local `chat.ts`
- **Status:** **CONFIRMED AT REVISION**.
- **Path/symbol:** `packages/worker/src/index.ts:24-46 createWorker` (BullMQ `Worker`, `ioredis`, drizzle Postgres via `../../server/src/db/*`), registers `chat`, `task`, `waggle`, `group`, `cron` (`:32-45`); `handlers/chat-handler.ts:11-24` calls `runAgentLoop({ litellmUrl: LITELLM_URL, model: DEFAULT_MODEL ?? 'claude-sonnet', systemPrompt, tools })` directly; `execution-policy.ts:11-17` `READ_ONLY_WORKER_SYSTEM_PROMPT` + read-only tools; **zero** references to `recallMemory|buildSystemPrompt|Orchestrator|PERSONAS|MultiMind|FrameStore` in `packages/worker/src` (grep empty). Local path: `packages/server/src/local/routes/chat.ts:7,1717` the same `runAgentLoop`, but with 36 `chat-*.ts` modules (recall, persona, governance, approval hook, model routing…). The worker is in the build chain (`package.json:25 build:packages … && cd ../worker && npm run build`) and in the production compose file (`docker-compose.production.yml:76-78`). Tests: `packages/worker/tests/job-processor.test.ts` in the INFRA list (`vitest.infra-suites.ts:34`); the other worker tests are in the default gate.
- **Input/output:** the same user request through a worker `chat` job → a response without memory/persona/harness and with the LiteLLM default model; through the local `/api/chat` → the full path.
- **Repro/limit:** grep and reading; not run (requires Redis/Postgres).
- **Expected (brief C20 "EXPLICIT BOUNDARY"):** the local core has single, unified contracts; the legacy team worker is isolated or bound to KVARK, without new Solo duplication.
- **Smallest change:** no code before the ADR (brief §20.2 item 9 "secondary worker parity"); the handler inventory is here.
- **Related AT:** AT-06, AT-16.

### F-TK-11 — A27: `createKvarkTools` has zero production callers; `KvarkClient` is never instantiated; `kvark:connection` is only read; the KVARK UI fields have no handler
- **S1 claim:** "a UI and route that write `kvark:connection`, and wiring of `createKvarkTools`, which has zero callers today. Gate KVARK features on a live connection, not on the ENTERPRISE tier."
- **Status:** **CONFIRMED AT REVISION** (the module exists but is not wired; "module exists" is not an E2E function).
- **Path/symbol:**
  - `packages/agent/src/kvark-tools.ts:123-129 createKvarkTools(deps: { client: KvarkClientLike })` — 4 tools (`kvark_search`, `kvark_feedback`, `kvark_action`, `kvark_ask_document`); the only non-test referent is the barrel `packages/agent/src/index.ts:403-406`. Grep for `createKvarkTools` across `packages/*/src/**` and `apps/**`: only the definition + the barrel; all other hits are `*.test.ts`.
  - `packages/server/src/kvark/kvark-client.ts:35-52 class KvarkClient` — grep for `new KvarkClient` across src: **0**. `kvark/index.ts:1-23` exports the class, `KvarkAuth`, `getKvarkConfig`.
  - `kvark:connection`: read by `packages/server/src/kvark/kvark-config.ts:19 vault.get('kvark:connection')` and `packages/server/src/local/routes/marketplace.ts:192 getKvarkConfig(vault)`; there is **no** `vault.set('kvark:connection'…)` anywhere in src. The only write path is the generic `POST /api/vault` (`packages/server/src/local/routes/vault.ts:153-171`, accepts an arbitrary `name`), i.e. the user would have to type the JSON `{baseUrl, identifier, password}` into the Vault UI by hand.
  - `apps/web/src/components/os/apps/SettingsApp.tsx:207-208` state `kvarkUrl/kvarkToken`; `:1332-1343` inputs `settings-kvark-url`, `settings-kvark-token`; the "Test Connection" button is `disabled` (`:1341-1343`); there are **no** `onSubmit`/`adapter` calls (grep `kvarkUrl|kvarkToken|/api/kvark` yields only these 4 places); the tab is locked below ENTERPRISE (`:178-186 LOCKED_TABS`, `isEnterpriseLocked = !tierSatisfies(tier,'ENTERPRISE')`).
  - Tier instead of connection: `settings.ts:1051` `features.kvark: tier === 'ENTERPRISE'`; `marketplace.ts:190` `/api/marketplace/enterprise-packs` `requireTier('ENTERPRISE')` **and** `getKvarkConfig` (double gate, `:192-208`); `packages/marketplace/src/enterprise-packs.ts:8-9` comment: "The skills referenced may not all exist yet — packs are metadata".
  - `packages/agent/src/combined-retrieval.ts` (KVARK + workspace + personal merge) — production callers: only a type-import in `result-formatter.ts:1`; there is **no** executable caller; grep for `kvarkClient` in `packages/server/src` is empty.
  - `packages/server/tests/kvark/kvark-wiring.test.ts:46-52` itself says "simulates the if(kvarkConfig) guard" — it tests the factory, not registration in the server.
  - CLAUDE.md §8 claims that `kvark_search`/`kvark_ask_document` are "tier-gated" — `kvark-tools.ts` has no tier check (only the comment `:6`); the gate would be in a caller that does not exist.
- **Input:** the vault contains a valid `kvark:connection`; the user starts a chat.
- **Current output:** the agent has no KVARK tools (nothing registers them); `enterprise-packs` returns packs only if `config.json` additionally contains `tier:'ENTERPRISE'`.
- **Repro test/limit:** there is no test that brings up the local server with a KVARK vault entry and checks that the tool list contains `kvark_search` — that is the missing RED test for AT-26.
- **Expected (DIR-20, A27, AT-26):** a connection/identity validation flow, allowed organizational capabilities, token storage and revocation; gate on a live connection, not on `ENTERPRISE=true` in the local config.
- **Smallest change:** (1) RED test: server + vault `kvark:connection` → the tool registry contains 4 KVARK tools; without the entry → 0; (2) registration `createKvarkTools({ client: new KvarkClient(getKvarkConfig(vault)) })` at the place where the tools are assembled; (3) gate `settings.ts:1051` and `marketplace.ts:190` on `getKvarkConfig(vault) !== null` instead of the tier; (4) wire the SettingsApp fields to a route that writes the vault (or remove the dead fields). The design of the connect/disconnect/revoke flow is the writers' job.
- **Related AT:** AT-26, AT-13, AT-15.

### F-TK-12 — AT-26 preconditions: the KVARK path has no cloud fallback in the code, but it cannot be tested because it is not wired; the tier-deps for skill promotion have no providers
- **Status:** **PARTIAL/UNWIRED**.
- **Path/symbol:** `packages/agent/src/kvark-tools.ts:275-296 handleKvarkError` — `KvarkUnavailableError` → the text "KVARK is not reachable. Using workspace memory only…"; there is no switch to a provider/cloud (good for D-03), but it does not execute because the tools are not registered (F-TK-11). `packages/agent/src/skill-tools.ts:67-68` deps `hasTeamSkillLibrary?/isEnterprise?`; `:755-765` promotion to the `team`/`enterprise` scope; grep for providers in `packages/server/src`: **0** → `deps.isEnterprise?.()` is `undefined` → promotion is always rejected with the message "requires ENTERPRISE tier. Contact sales for KVARK."
- **Input/output:** `promote_skill target:'enterprise'` → always rejected, regardless of the tier or the KVARK connection.
- **Expected (AT-26, brief §12.1):** organizational capabilities follow the KVARK connection; personal→org promotion with an explicit policy (R14 "minimal: no-sharing default + connect flow").
- **Smallest change:** when wiring KVARK (F-TK-11), supply `isEnterprise`/`hasTeamSkillLibrary` from the connection state or remove the dead branches; a RED test that an unavailable KVARK does **not** change the provider route.
- **Related AT:** AT-26, AT-14.

### F-TK-13 — C5: the license markings contradict each other; NOTICE references a nonexistent `EXTRACTION.md`; there is no THIRD_PARTY_NOTICES/SBOM in the tree
- **S1 claim:** "`hive-mind-cli/NOTICE` declaring the agent runtime, evolution and traces proprietary … private repo … until an explicit licensing decision."
- **Status:** **CONFIRMED AT REVISION** (NOTICE) + **AUDIT FINDING — TO VERIFY** (the three contradictions below).
- **Path/symbol:**
  - `packages/hive-mind-cli/NOTICE:12-23` (identical to `hive-mind-mcp-server/NOTICE` and `hive-mind-wiki-compiler/NOTICE`, `diff` empty): lists as proprietary: compliance, `packages/agent/*`, GEPA/EvolveSchema/execution traces/evolution runs/improvement signals, `mind/vault.ts`, tier/billing, the Tauri shell/web UI, WaggleDance; `:24` "See EXTRACTION.md in the repository root" — `git ls-files EXTRACTION.md` → **does not exist** (only `docs/decisions/2026-04-18-*extraction*.md`).
  - Contradiction 1: `packages/agent/package.json` `"license": "MIT"` while NOTICE declares it proprietary. The same goes for `packages/marketplace`, `core`, `cli`, `launcher`, `sdk`, `memory-mcp`, `wiki-compiler` → MIT.
  - Contradiction 2: `packages/optimizer/LICENSE:1-5` and `packages/weaver/LICENSE:1-5` "proprietary and confidential… strictly prohibited" while `packages/optimizer/package.json` and `packages/weaver/package.json` say `"license": "MIT"`.
  - Contradiction 3: root `LICENSE:1-3` MIT (Marko Markovic / Egzakta Group) alongside root `package.json` `"private": true`; `packages/server`, `shared`, `waggle-dance`, `worker`, `admin-web` **have no** `license` field; `packages/hive-mind-core/package.json` is Apache-2.0 **and** `"private": true` (the other `hive-mind-*` packages are not private).
  - `git ls-files | grep -i "THIRD_PARTY|sbom|NOTICES"` → no aggregated notices/SBOM file (adjacent to A28; `.github/workflows/ci.yml:109-110` `npm audit … continue-on-error: true`).
- **Input/output:** n/a (metadata).
- **Repro/limit:** reading the files; there is no test that checks the consistency of the `license` field ↔ LICENSE/NOTICE.
- **Expected (D-01, brief §12.3):** establish ownership and approved licenses, root/per-package NOTICE, old proprietary markings; do not keep a key free feature closed contrary to what was agreed.
- **Smallest change:** an inventory table package → `license` field → LICENSE file → NOTICE mention → decision; remove/correct the dangling `EXTRACTION.md` reference; add a lint/test for consistency. The choice of license itself is an open item (brief §20.3 "Licensing implementation"), not the job of this revalidation.
- **Related AT:** AT-30 (notices in the shipped package).

### F-TK-14 — C5: the OSS-excluded files are the carriers of PRD §9 (learning/evolution) — the export prohibition is real and tested
- **Status:** **CONFIRMED AT REVISION**.
- **Path/symbol:** `scripts/oss-subtree-split.sh:117-123 FORBIDDEN_FILES` = `src/mind/evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts`, `src/vault.ts`, `src/compliance`; `scripts/oss-drift-check.mjs:22-28 FORBIDDEN_EXPORTS` (+ `governance/`); the files exist (`packages/hive-mind-core/src/mind/{evolution-runs,execution-traces,improvement-signals}.ts`, `packages/core/src/vault.ts`, `packages/core/src/compliance/*`, `packages/core/src/governance/*`) and are barrel-exported (`packages/hive-mind-core/src/index.ts:71,77,82`). Production consumers: `packages/agent/src/{evolution-orchestrator,eval-dataset,trace-recorder,correction-detector,memory-layers-default}.ts`, `packages/server/src/local/{index,monthly-assessment}.ts`, `routes/{chat,evolution}.ts`, `services/evolution-service.ts`. PRD §9 ("Preserve EvolveSchema and iterative GEPA…", "Promotion requires holdout… versioning and rollback") cannot work without these three stores.
- **Input/output:** an OSS export attempt with those files → abort exit 3 (`oss-subtree-split.sh:126-133`); drift-check → `FORBIDDEN-OSS-CONTENT`.
- **Repro test:** `tests/oss-subtree-split.test.ts` (exists; not run).
- **Expected:** the D-01 free/OSS intent; the concrete rights per file are an open item. This is **not** a code defect; it is a boundary that the license decision must explicitly move or confirm.
- **Smallest change:** no code; if the decision says "evolution is OSS", the `FORBIDDEN_*` lists + the `.parity` baseline are re-baselined through maintainer review (CLAUDE.md §7.5 rule 3).
- **Related AT:** AT-05, AT-29 (evolution evidence), AT-30.

### F-TK-15 — C5: attestation and `publish-windows` are tied in the workflow to `repository.private == false`
- **Status:** **CONFIRMED AT REVISION** (mechanism). Actual repo visibility: **UNKNOWN** (not verified externally; CLAUDE.md §1 and `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md:109-123` treat it as private).
- **Path/symbol:** `.github/workflows/release.yml:2056-2058` `attest-windows: if: github.event.repository.private == false`; `:2208-2212` `publish-windows: needs [certify-windows, attest-windows]; if: vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true' && github.event.repository.private == false && …`.
- **Expected:** the licensing/publication decision unlocks the mechanics (brief §12.3).
- **Smallest change:** no code; a decision.
- **Related AT:** AT-30.

### F-TK-16 — A2 (tier part): tier-state migration has a ready-made pattern (PRO→FREE, 2026-07-05); subscribers UNKNOWN
- **Status:** **PARTIAL** — the code pattern **ALREADY EXISTS**; the business part is **UNKNOWN**.
- **Path/symbol:** commit `09b199aa` (2026-07-05, `feat(billing): collapse to Solo (free) vs Team (paid) — kill the PRO tier`) introduced: `tiers.ts:154-161 LEGACY_TIER_MAP`, `stripe/index.ts:64-66,81`, `ShellContext.tsx:181-184`, `tier-enforcement-matrix.test.ts:43-49` (the de-gated rows remain as a tripwire). This is the precedent for AT-27 "repeatable migration".
- **Expected (brief §12.2/§12.4):** an actual inventory before the change; read-compatible config migration; no financial side effects without approval.
- **Smallest change:** repeat the pattern for TEAMS/ENTERPRISE/TRIAL only after the SKU decision and the subscriber inventory.
- **Related AT:** AT-27.

### F-TK-17 — A12 (tier as a permission layer): an action tier-gate exists but is dead; two more dead exports
- **Status:** **PARTIAL/UNWIRED**.
- **Path/symbol:** `packages/server/src/local/command-registry.ts:91` `requiredTier?: Tier` in the descriptor; `:227-236 checkTier()`; `packages/server/src/local/command-interpret.ts:96-108 finalizeAction` returns `kind:'tier_gated'` — but grep for `requiredTier: '` across src: **0 descriptors** → the gate is never activated. `tiers.ts:233-244 hasCapability` — 0 callers (src+tests). `packages/server/src/local/routes/fleet.ts:8` `import { requireTier }` — 0 uses in the file.
- **Expected (brief §9.2):** an intersection of constraints without `tier` as an individual boundary; do not build a new policy engine.
- **Smallest change:** remove the `requiredTier` branch and `hasCapability`, or leave them outside the A12 contract; delete the unused import in `fleet.ts:8`.
- **Related AT:** AT-18.

### F-TK-18 — WB scope inventory: S1 "~22 files" ≈ accurate; precise list
- **Status:** **CONFIRMED AT REVISION** (order of magnitude).
- **Files with TRIAL/TEAMS/ENTERPRISE literals (non-test src, 24 excluding `tiers.ts`):**
  Server (10): `packages/server/src/middleware/assert-tier.ts`, `local/tier-session-cap.ts`, `local/routes/{connectors,cost,marketplace,settings,team}.ts`, `stripe/{checkout,index}.ts`, `packages/hive-mind-core/src/mind/embedding-provider.ts`.
  Web (14): `apps/web/src/components/os/AppShell.tsx`, `apps/{CapabilitiesApp,MCPHubApp,PaymentSuccessApp,SettingsApp,WorkspaceDesktopApp}.tsx`, `billing/PlanCards.tsx`, `overlays/{TrialExpiredModal,UpgradeModal}.tsx`, `hooks/useBilling.ts`, `lib/{adapter,dock-tiers}.ts`, `providers/ShellContext.tsx`, `routes/ApprovalsRoute.tsx`.
  **Additionally (without quotes / in a template string, missed by the literal grep):** `packages/agent/src/skill-tools.ts:679-680,757,764`; `apps/web/src/lib/command-catalog.ts:60` (`TEAMS_RANK`); `apps/web/src/routes/TeamRoute.tsx:3`; `packages/server/src/local/routes/{embedding,workspaces}.ts` (use `TIER_CAPABILITIES`/`getCapabilities`); `packages/server/src/local/{command-registry,command-interpret}.ts`; www: `apps/www/messages/en.json`, `apps/www/app/_components/Pricing.tsx`.
- **Test files that lock in tier behavior (21):** `apps/web/src/test/pr7a-billing.test.tsx`, `apps/web/src/lib/tiers.test.ts`, `packages/agent/tests/{kvark-pipeline-smoke,kvark-tools,model-tier}.test.ts` (model-tier is the model tier, not billing), `packages/core/tests/team-sync.test.ts`, `packages/server/tests/{d11-datadir-tier,tier-enforcement-matrix}.test.ts`, `packages/server/tests/kvark/*.test.ts` (6), `packages/server/tests/local/{chat-keyless-billing,chat-teamsync-push-characterization}.test.ts`, `packages/server/tests/routes/{connectors-tier,teams}.test.ts`, `packages/server/tests/stripe/{checkout,smoke-e2e,status,sync,webhook}.test.ts`.
- **Expected:** brief §12.2 "inventory … branches, gates, www copy, checkout/webhooks, licenses, team-sync and the secondary server/worker" — fulfilled by this document.
- **Related AT:** AT-27.

### F-TK-19 — Which `TierCapabilities` flags actually block a Solo user (vs. decorative ones)
- **Status:** **CONFIRMED AT REVISION**.
- **Actual gates for FREE:**
  1. `embeddingProviders` — FREE does not have `'litellm'` (`tiers.ts:85`); enforced in `packages/server/src/local/routes/embedding.ts:106-119` (403 `TIER_REQUIRED`) and `packages/hive-mind-core/src/mind/embedding-provider.ts:302-303,350`.
  2. Sessions per workspace: `tier-session-cap.ts:4` FREE=10 (`settings.ts:1045` `maxSessions: tier==='FREE' ? 10 : 25`).
  3. Routes: `/api/cost/by-workspace`, `/api/costs` (TEAMS), `/api/cloud-sync/toggle` (TEAMS; the body `settings.ts:1157-1166` only writes the `cloudSyncEnabled` flag), `/api/admin/overview`, `/api/admin/audit-export` (TEAMS), `/api/team/connect` (TEAMS), `/api/marketplace/enterprise-packs` (ENTERPRISE), `/api/team/governance/permissions` (ENTERPRISE).
  4. UI: the Approvals and Team zones are hidden (`dock-tiers.ts:82,98,100`, `AppShell.tsx:728`, `command-catalog.ts:60`); the Settings `team`/`enterprise` tabs are locked (`SettingsApp.tsx:182-185`); the Workspace team panel upsell "Upgrade to Team — $49/seat" (`WorkspaceDesktopApp.tsx:381,939-949`); `UpgradeModal.tsx:159-162`, `TrialExpiredModal.tsx:13-28` (LOSE_FEATURES list).
  5. Agent tool: `skill-tools.ts:755-765` skill promotion into the team/enterprise scope (always rejected, F-TK-12).
- **Decorative flags (0 consumers in src):** `teamSkillLibrary`, `spawnAgents`, `customSkills`, `exportFormats`, `managedModelPool`, `priorityModels`, `kvarkCta`, `selfHosted`, `auditLog`, `messageHistoryLimit`; `sharedWorkspaces`/`adminPanel`/`teamMembersLimit` are only echoed in `GET /api/tier` (`settings.ts:1046-1050`); `workspaceLimit`/`connectorLimit` = -1 for all → the gate code in `workspaces.ts:342-351` and `connectors.ts:16-26` is a no-op.
- **Expected (brief §12.2):** the planner proposes a fate for each component; this list is the input.
- **Related AT:** AT-18, AT-27.

---

## 2. What already works / exists but is not wired (keep)

| What | Path | Callers (grep) |
|---|---|---|
| `parseTier` + `LEGACY_TIER_MAP` + `getEffectiveTier` (read-compatible migration, PRO→FREE precedent) | `packages/shared/src/tiers.ts:154-197` | `assert-tier.ts:27-28`, `settings.ts:1013,1023,1073,1111-1112`, `embedding.ts:45`, `connectors.ts:183`, `workspaces.ts:341`, `webhook.ts:142`, `sync.ts:72`, `SettingsApp.tsx:178`, `ShellContext.tsx:181-186` |
| `requireTier` / `readTierFromDataDir` (fail-closed reading of `config.json`) | `packages/server/src/middleware/assert-tier.ts:21-63` | `cost.ts:210,272`, `settings.ts:1157,1170,1192`, `team.ts:143,457`, `marketplace.ts:190`, `stripe/portal.ts:18` (FREE no-op), `local/service.ts` (D11 log), `fleet.ts:8` (import without use) |
| Tier-enforcement tripwire matrix (already models the de-gating pattern) | `packages/server/tests/tier-enforcement-matrix.test.ts` | CI default gate (`vitest.config.ts include packages/*/tests/**`) |
| Stripe webhook: signature, idempotency, atomic `config.json` write, serialization | `packages/server/src/stripe/webhook.ts:25-79,88-170` | route `/api/stripe/webhook`; `sync.ts:80` (`updateUserTier`) |
| `tierFromPriceId` (PRO/BASIC→FREE, TEAMS→TEAMS) + `priceIdForTier` fail-closed for annual | `packages/server/src/stripe/index.ts:68-107` | `webhook.ts:156`, `sync.ts:64`, `checkout.ts:39` |
| `POST /api/tier/start-trial` atomic (409 idempotent) | `packages/server/src/local/routes/settings.ts:1092-1137` | `apps/web/src/lib/adapter.ts:3921 startTrial` |
| `PATCH /api/tier` fail-closed (`WAGGLE_ALLOW_TIER_OVERRIDE`) | `settings.ts:1060-1090` | dev/test only |
| `KvarkClient` / `KvarkAuth` / `getKvarkConfig` (auth, retry, error types) | `packages/server/src/kvark/*` | **0 production**; tests `packages/server/tests/kvark/*` (6 files) |
| `createKvarkTools` (4 tools) + `handleKvarkError` without a cloud fallback | `packages/agent/src/kvark-tools.ts:123-296` | **0 production** (barrel `agent/src/index.ts:403`); tests `kvark-tools.test.ts`, `kvark-pipeline-smoke.test.ts`, `kvark-wiring.test.ts` |
| `combined-retrieval.ts` (workspace+personal+KVARK merge, `shouldQueryKvark`) + `result-formatter.ts` KVARK section | `packages/agent/src/combined-retrieval.ts`, `result-formatter.ts:45-60` | **0 executable**; type-import `result-formatter.ts:1`; tests `combined-retrieval.test.ts`, `conflict-detection.test.ts` |
| Generic vault upsert (can already accept `kvark:connection`) | `packages/server/src/local/routes/vault.ts:153-171` | Vault UI via `adapter` |
| The `enterprise-packs` route already checks for the presence of the KVARK configuration (in addition to the tier) | `packages/server/src/local/routes/marketplace.ts:190-208` | web Marketplace |
| `ENTERPRISE_PACKS` metadata (explicitly "skills may not all exist yet") | `packages/marketplace/src/enterprise-packs.ts` | `marketplace.ts:15,204-205` |
| `TeamSync` + `getTeamSync` binding/cache + pull-on-activate into the **workspace** mind | `packages/core/src/team-sync.ts`; `packages/server/src/local/index.ts:1440-1503,1661-1704` | `orchestrator.setTeamSync` (`local/index.ts:1497,1501,1668,1698,1702,1751,1798`), `pattern-write-back.ts:222` |
| `/api/team/{connect,disconnect,status,teams,members}` + HTTPS/health validation | `packages/server/src/local/routes/team.ts:143-331` | `SettingsApp` team tab |
| Teams cloud server (`buildServer`: Clerk, Postgres, Redis, ws) + BullMQ worker | `packages/server/src/index.ts`; `packages/worker/src/*` | `local/index.ts:3601` (dynamic, conditional); `docker-compose.production.yml:76-78`; `package.json:25` |
| OSS export guard + drift checker + test | `scripts/oss-subtree-split.sh:117-133`; `scripts/oss-drift-check.mjs:22-28`; `tests/oss-subtree-split.test.ts` | maintainer release procedure (CLAUDE.md §7.5) |
| www Pricing component that claims to mirror `tiers.ts` | `apps/www/app/_components/Pricing.tsx:20-54`; `apps/www/messages/en.json:196-250` | `apps/www/__tests__/Pricing.test.tsx` |
| Client-side PRO→FREE mapping and `RANK` | `ShellContext.tsx:181-186`; `PlanCards.tsx:59` | `AppShell`, `SettingsApp` billing tab |

---

## 3. Notes and limits

- Nothing was changed in the repo; `git status` after the vitest run is unchanged (only the previously untracked `.docx`).
- Neither Stripe, GitHub nor any other external API was called. Therefore: the number/existence of active subscribers, the state of the Stripe products and the actual visibility of the repo remain **UNKNOWN** and require an authorized inventory (brief §12.2, §20.3).
- All line references are to `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`; the S1 citations `dock-tiers.ts:82,98` and `cost.ts:210,272` are exactly correct at this revision.
- None of the findings is **ALREADY CLOSED**: there is no commit after the S1 snapshot that touches `packages/server/src/kvark/` (last `01076b75`, 2026-03-26), `kvark-tools.ts` (same), or `tiers.ts` (last `09b199aa`, 2026-07-05).
- Neither an architecture for the KVARK connect flow nor the fate of the Teams server was proposed — that is the writers' job (brief §12.1–12.2, §20.2 ADR 8 and 9).
