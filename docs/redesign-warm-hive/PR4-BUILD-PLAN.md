# Warm-Hive PR4 — Marketplace + shared install store ("sync") — Build Plan

> Source design: `docs/design_handoff_waggle_app/SCREENS.md §09`. Recon: `docs/redesign-warm-hive/pr4-recon/` (5 docs).
> Branch: `feature/warm-hive-pr4` (off main @ 876807ca). Status: **plan — decisions §3 need founder ratification before feature code.**

---

## 1. The design contract (screen 09)

Skills + connectors + MCP as **one shelf**, agent-searchable. Two variations, **one store**:
- **A — Browse & ask:** centered agent-search bar → suggestion box (connector + skill + tool, each with a "why" + install) · "N in this workspace" count bar · All/Skills/Connectors/MCP filter · card grid (kind badge, name, desc, install count, Add).
- **B — Inline in chat:** the same picker mid-conversation — offer a missing connector with a **vault-aware approval** ("token → your vault") → connected follow-up.
- **CRITICAL — "sync":** one store powers grid + agent-pick + inline. Type-aware one-click: **skill** Add→Adding…→Added (instant) · **connector** Connect→Signing in…→Connected (~1.1s, token→vault) · **MCP** Enable→Enabling…→Enabled. Each fires a toast + updates the count bar. **Installing in any view reflects in all.**

## 2. Current state (grounded in recon — the engine exists; the gap is surface + a store)

| Layer | Reality today | File anchors |
|---|---|---|
| **Match engine** | `searchCapabilities(need)` → ranked candidates across native tools / skills / marketplace, **each with `matchReason` ("why") + `installAction`**. Reachable ONLY as the `acquire_capability` chat tool, which returns markdown and **discards the structured proposal**. | `packages/agent/src/capability-acquisition.ts:179`; tool `skill-tools.ts:406` |
| **Install backends (3, separate)** | skills = FS markdown reloaded into `agentState.skills`; connectors = **vault** credential `connector:<id>`; MCP = `.mcp.json` + live `McpRuntime` (PRO-gated, SecurityGate-scanned). **No unified installed-set.** | `routes/{skills,connectors,mcps}.ts`; `packages/marketplace/src/{db,installer}.ts` |
| **Install verbs** | skill/pkg `POST /api/marketplace/install` (PRO) · MCP `POST /api/mcps/install` (PRO) · connector `POST /api/connectors/:id/connect` (token→vault, ungated). All write the append-only `install_audit` (no `workspace_id`). | `routes/marketplace.ts:181`, `mcps.ts:189`, `connectors.ts:96` |
| **FE grid** | Phase-4B "Extend" surface: 6-facet rail, keyword search, **vertical list** of `ExtensionCard`, federates-at-read into **local `useState`** (discarded on unmount). Only marketplace skill/MCP pkgs install in-place; connectors/MCP = "Open in Hub" deep-links. Legacy tokens. | `MarketplaceApp.tsx` (418 LOC), `extend/ExtensionCard.tsx`, `lib/extension-catalog.ts` |
| **Variation B precursor** | `CapabilityRequestCard` (inline chat) — **skill/marketplace only**, own private phase state, no connector/vault approval, no shared state with grid. Approval channel is **boolean-only** (can't carry a token). | `chat-blocks/CapabilityRequestCard.tsx`, `capability-request-parser.ts`, `confirmation.ts` |

**Net:** the matching brain + the 3 install paths are done and tested. PR4 is (a) a **shared FE install store** the three surfaces subscribe to, (b) **Variation A** UI (agent-search bar + suggestion box + count bar + grid with type-aware verbs/micro-states), (c) one **new route** exposing the existing engine, (d) **Variation B** completion (connector/MCP + vault approval).

## 3. Decisions — RATIFIED (founder, 2026-06-16): D1 FE-derived global count · D2 collapse to 4 shelves · D3 in-place (OAuth→Hub fallback) · D4 sync = grid+pick+inline. D5–D7 defaults stand.

| # | Decision | Recommended (v1) | Why / cost of the alternative |
|---|---|---|---|
| **D1** | "N in this workspace" count bar | **FE-derived global count** from existing per-type list endpoints | Real per-workspace tracking needs a new `workspace_id` migration across 3 backends + the OSS-excluded `install_audit` — large, and the substrate isn't workspace-partitioned. Honest label: "installed" not "in this workspace" if global. |
| **D2** | Facets | **Collapse to the design's 4: All / Skills / Connectors / MCP** | Matches screen 09 ("one simple shelf"). Agents/Models/Templates keep their dedicated hubs (already deep-links). Keeping the 6-domain superset diverges from the design. |
| **D3** | Connector/MCP in the grid | **In-place Connect/Enable** reusing the real vault/runtime + SecurityGate; **OAuth-only connectors fall back to the Connector Hub** | Design clearly wants in-place. Must NOT bypass security/OAuth gating. Token-paste connectors + MCP Enable work inline; OAuth-only can't finish inline. |
| **D4** | Sync scope | **Grid + agent-pick + inline-chat** via an FE store; **re-hydrate on nav** so external Hub installs reconcile | Refactoring ConnectorsApp/MCPHubApp/skills-center to also push to the store is a much bigger blast radius — defer. |
| D5 (default) | Suggestion "why" | engine's deterministic `matchReason` (free, honest, no model call) | LLM-generated why is prettier but adds a model call + latency. |
| D6 (default) | Card install count | **omit the social `downloads` count** (local-single-user ≈ 0; honest-stats ethos) — show only a real Installed badge | — |
| D7 (default) | PRO-gated items | show as installable with an **upsell on click** (current behavior; moat: skills/MCP are the upgrade trigger) | — |

## 4. Architecture

- **Shared store (the spine):** new `apps/web/src/providers/InstallProvider.tsx` + `useInstallStore()` — an `installed` Map + `installing` Set keyed by `extension-catalog` namespaced ids; a **type-aware install dispatcher** (skill→`installPack`/skill; connector→`connectConnector` (vault); mcp→`installMcp`; pkg→`installMarketplacePackage`); a **count selector**; **optimistic flip + reconcile** (roll back on 403/SecurityGate, route to Upgrade/Approval). Hydrate from `GET /api/skills`, `/connectors`, `/mcps`, `/marketplace/installed` (no new read route for v1).
- **One new server route:** `POST /api/marketplace/agent-search` `{need}` → wraps the existing `searchCapabilities()` (lift the dep assembly from `local/index.ts:620`), returns the **structured** proposal + a `pickOnePerKind()` grouping (connector+skill+tool). Mirrors `GET /api/skills/suggestions`. tsx-only → must `tsc -p packages/server`.
- **Reuse:** `extension-catalog.ts` normalizers (flip `installable:true` for connector/mcp once the store can install them); `CapabilityRequestCard` for inline; warm components `components/os/warm/*` + warm tokens.

## 5. Phased plan (TDD; commit per phase; FE `tsc -p apps/web/tsconfig.app.json` + vitest each)

- **Phase A — shared install store** (`InstallProvider`/`useInstallStore`): hydrate, type-aware dispatcher, count selector, optimistic+reconcile, toasts. Unit-tested in isolation. *The spine everything else binds to.*
- **Phase B — Variation A grid**: `ExtensionCard` type-aware verbs (Add/Connect/Enable) + idle→in-progress→done micro-states reading the store; `MarketplaceApp` sources from the store, adds the **count bar** + 4-shelf filter (D2) + **card grid** + warm tokens; in-place connector/MCP (D3). Rewrite the 11 phase4b tests to the new contract.
- **Phase C — agent-search**: `POST /api/marketplace/agent-search` (+ `pickOnePerKind`) wrapping `searchCapabilities`; the centered **AskBar** + **suggestion box** (connector/skill/tool, each "why" + install via the store) + example chips.
- **Phase D — Variation B inline**: extend `CapabilityRequest.kind` to `connector`/`mcp`; **vault-aware approval row** (token→vault; approval channel stays boolean, FE calls `connectConnector` directly — no token on the approval channel); route installs through the shared store so chat ↔ grid ↔ count bar stay in sync; consolidate `ApprovalGate`/`InlineApprovalCard`.
- **Phase E — review + live smoke**: adversarial review workflow; live smoke (grid install reflects in count bar + inline; agent-search returns real picks; 0 console errors).

## 6. Key risks (from recon)
- **11 phase4b tests** pin current testids + the `{type,limit:30}` call shape → Phase B rewrites them (expected, not collateral).
- **Optimistic flips must reconcile** with server truth (install can 403 / SecurityGate-block *after* the flip) — across grid AND inline; count bar must not show a gate-rejected item.
- **Don't bypass Hub security/OAuth** — in-place Connect/Enable reuse the real gated paths; OAuth-only → Hub fallback.
- **`install_audit` is OSS-excluded + append-only** — never the source of truth for installed state; read per-type list endpoints.
- **Honest-stats / mind-isolation ethos** — global count labeled honestly (D1); omit social download counts (D6).
- Server routes run via `tsx` (not typechecked by `npm run build`) → explicit `tsc -p packages/server` gate on the new route.

## 7. Verification gates (per phase + final)
`tsc -p apps/web/tsconfig.app.json` 0 · `tsc -p packages/server` 0 (new route) · FE vitest green (incl. rewritten phase4b) · `npm run lint` · live smoke: install in grid → count bar + inline both reflect; agent-search returns connector+skill+tool with "why"; vault-aware inline approval; 0 console errors.
