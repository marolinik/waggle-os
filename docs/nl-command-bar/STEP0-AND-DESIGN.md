# NL Universal Command Bar (Ctrl+K Intent Layer) — Step 0 verification + design

> Brief: `docs/Waggle OS — Claude Code Brief  add on.txt`. Implementation arc 2026-06-27.

## Step 0 — source verification (brief assumptions vs live source)

| Brief assumption | Verified at source | Delta |
|---|---|---|
| `overlays/CommandCenter.tsx` is cmdk-based, 6 verb groups, structured matcher, no LLM | ✅ `cmdk`; `CATEGORY_ORDER = search/launch/create/run/navigate/extend`; server `commandSearch` + offline `fuzzyMatch`; NL fallback row posts raw to `/api/command/execute` | none |
| `/api/command/*` = search/recent/suggestions/execute; no interpret | ✅ all four in `routes/command.ts` (`commandRoutes: FastifyPluginAsync`, registered `index.ts:2117`); **no interpret endpoint** | none |
| Bar navigates via routes (`handleSearchNavigate` successor) | ✅ `onNavigate(type,id)` → AppShell `handleSearchNavigate` → `routeForSearchResult()` (`lib/routes.ts`). `command:<appId>` → `routeFor(appId)`; `workspace:<id>` → `/workspaces/<id>` | none |
| Capability surface enumerable | ✅ `filterToolsForContext`, `PERSONAS`, `/api/workspaces`, `/api/mcps/install` (PRO), `/api/skills`, `/api/connectors`, `/api/automations`, `APP_ROUTES`/`routeFor` | none |
| Approval surface | ✅ `ui/approval-modal.tsx` (`ApprovalRequest{action,scope[],riskLevel,…}`) + CommandCenter inline `PermissionPrompt` | reuse inline `PermissionPrompt` |
| Tier gate | ✅ `requireTier()`/`readTierFromRequest` 403 `TIER_INSUFFICIENT`; `adapter.fetch` auto-dispatches `waggle:tier-insufficient{required,actual,message}`; `UpgradeModal` listens | none |
| Sidecar LLM | ✅ in-process `/v1/chat/completions` proxy, model `claude-haiku-4-5`, needs `vault.get('anthropic')` | not a LiteLLM client lib — use the proxy (per `profile.ts`) |

**Verdict:** brief holds. No material delta — proceed.

## Architecture

**Two-tier.** Tier 0 = existing cmdk fuzzy (untouched). Tier 1 = `POST /api/command/interpret` (LLM), fired only on sentence-like / no-match input, never blocking the cmdk list.

**Closed-registry safety (core property).** The LLM returns only an action **`id` + `params`**. The **server** maps `id`→route/endpoint via `ACTION_REGISTRY`, validates params, and derives `sideEffect`/`riskLevel`/`requiredTier`. The LLM can never emit an endpoint, route, or free code — only pick a registry id. Unknown id → `none`.

**Reuse, no new execution layer.** Resolved actions execute through existing paths: navigation via `onNavigate` (→ `routeForSearchResult`), side-effects via the existing `PermissionPrompt` then a POST to the **server-derived** endpoint, tier-gated via the existing `waggle:tier-insufficient` event.

**v1 registry (closed set):** `open_app` (nav), `open_workspace` (nav), `create_workspace` (side-effect, low), `install_mcp` (side-effect, medium, PRO). Plus resolver kinds `clarify` / `tier_gated` / `none` / `plan` (typed, **not executed** in v1 → downgraded to clarify/single-action).

**Memory context (differentiator).** Reuse `buildWorkspaceNowBlock` + `formatWorkspaceNowPrompt` (already imported in `command.ts`) for the active-workspace "now" block, plus `workspaceManager.list()` (id+name) so "continue what I was working on" / "open the X workspace" resolve against real ids. No new memory queries.

**Side-effect taxonomy.** `create_workspace`/`install_mcp` are `sideEffect:true` (preview-and-approve), consistent with `confirmation.ts` (writes/installs gate); nav/reads execute directly. Tier check reuses `assertTierCapability`.

**Graceful degradation.** No vault key / LLM error / JSON parse fail → `{ kind:'none', fallback:true }` (HTTP 200) → FE shows Tier 0 matches + "couldn't interpret".

## Files
- `packages/shared/src/command-intent.ts` — `InterpretResult` / `ResolvedAction` contract (+ barrel).
- `packages/server/src/local/command-registry.ts` — `ACTION_REGISTRY` + pure validate/build/tier (unit-tested).
- `packages/server/src/local/command-interpret.ts` — prompt build + memory context + LLM call + JSON parse → `InterpretResult`.
- `packages/server/src/local/routes/command.ts` — add `POST /api/command/interpret` (thin).
- `apps/web/src/lib/adapter.ts` — `commandInterpret` + `commandDispatchAction`.
- `apps/web/src/components/os/overlays/CommandCenter.tsx` — Tier 1 wiring (additive; Tier 0 untouched).

## Fast-follow (out of v1 scope)
- Multi-step `plan` execution (typed now, returns clarify). Ticket: `docs/nl-command-bar/FASTFOLLOW-multistep-plan.md`.
- `switch_persona`, `connect_connector` headless, `install_skill` headless (v1 routes these intents to their screens via `open_app`).
