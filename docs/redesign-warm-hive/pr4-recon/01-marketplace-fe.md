# PR4 Recon · Slice 1 — Current Marketplace Front-End

> Read-only recon for PR4 (warm-Hive). Maps the **current** Marketplace FE against the
> screen-09 contract (Variation A browse+ask, Variation B inline-in-chat, shared install
> "sync" store). Cites real code; flags the delta; names exact integration points.
> Branch: `feature/warm-hive-pr4`. No source was modified.

---

## 1. What exists today

The Marketplace surface today is the **UX-Refactor Phase-4B "consolidated Extend
surface"** — a faceted *package/extension browser*, NOT the agent-searchable shelf the
design contract describes. There are two real surfaces:

- **A grid browser** — `MarketplaceApp.tsx` (route `/marketplace` → `MarketplaceRoute.tsx` → `SurfaceBoundary`).
- **An inline-in-chat install card** — `CapabilityRequestCard.tsx`, parsed out of agent
  text by `capability-request-parser.ts` (`segmentText`) inside `TextBlock`.

These two surfaces are **independent** — they do **not** share an install store, do not
share micro-state vocabulary, and do not cross-reflect (installing in one does not update
the other). That is the single biggest structural gap vs the screen-09 "sync" mandate.

### 1a. The grid browser — `MarketplaceApp.tsx`

Layout (top to bottom), all in one file, 418 LOC:

- **Header** (`apps/web/src/components/os/apps/MarketplaceApp.tsx:273-331`): a `Store` icon
  (honey via `var(--honey-500)`), title "Marketplace", and a right-aligned
  `"{visible.length} extensions"` count (`:277`). This count is a *render-time array
  length*, NOT a per-workspace "N in this workspace" chip bar.
- **Two tabs** — `Browse | Audit` (`:283-297`), `role="tablist"`. Audit renders
  `InstallAuditPanel` (the C18 shared install-audit feed). Browse is the grid.
- **B7 facet rail** (`:302-317`): pills for `['all', ...EXTENSION_TYPES]` =
  **All · Skills · Agents · Connectors · MCPs · Models · Templates** (7 facets, labels in
  `FACET_LABELS` `:37-45`). `EXTENSION_TYPES` is canonical in
  `packages/shared/src/types.ts:375-378` (`skill·agent·connector·mcp·model·template`).
- **A keyword search input** (`:319-328`) — a plain `<Input>` with a `Search` icon,
  placeholder "Search skills, agents, connectors, MCPs, models, templates…". Debounced
  300ms (`:202-209`); marketplace facets re-query the server, others client-filter.
- **Body** (`:334-385`): federated-provenance note (`:339-343`), loading / error+Retry /
  empty states (honest, not fake-empty), then a vertical list of `<ExtensionCard>`.

Per-card UI — `ExtensionCard.tsx`:
- A generic `Package` icon (NOT a per-kind badge), name, an Installed/Available
  `StatusBadge`, optional scan-status badge.
- A row of small text chips: **`ext.type`** (this is the only "kind badge" today — a plain
  text pill `:44`), optional category, optional trust, and a muted `ext.source` label.
- A single right-side action that is **lifecycle/kind-aware but NOT type-aware**:
  - installable + not installed → **"Install"** (Download icon) — same label for every type.
  - installable + installed (kind `package`) → **"Remove"** (Trash icon, destructive).
  - federated (connector/agent/mcp-catalog/model/template) → **"Open in <app>"** deep-link
    (`ExternalLink`), e.g. "Connector Hub", "Agent Center", "MCP Hub" (`:72-79`).
- There is **no install count** rendered, no progress→done micro-states beyond a single
  spinner on the Install button (`installing` → `<Loader2>` `:68`).

### 1b. Data flow — federate-at-read (A5)

The pure merge/normalize layer is `apps/web/src/lib/extension-catalog.ts` (no adapter
import — unit-testable). `loadFacet` (`MarketplaceApp.tsx:116-188`) fans out to per-domain
adapter calls based on the active facet, `Promise.allSettled`-merges, then
`sortExtensions`. The mapping (from the file header `extension-catalog.ts:7-14`):

| facet     | adapter call                                   | normalizer            | install path        | installable |
|-----------|------------------------------------------------|-----------------------|---------------------|-------------|
| skill     | `getMarketplace({type:'skill'})` + `getMarketplacePacks()` | `fromMarketplacePackage` / `fromSkillPack` | real (POST /api/marketplace/install) | pkg ✓ / pack ✗ |
| mcp       | `getMcps()` + `getMarketplace({type:'mcp'})`   | `fromMcpCatalogRow` / `fromMarketplacePackage` | catalog → MCP Hub; registry-pkg → real | catalog ✗ / pkg ✓ |
| agent     | `getPersonas()`                                | `fromPersona`         | local (Agent Center) | ✗ |
| connector | `getConnectors()`                              | `fromConnector`       | local (Connector Hub)| ✗ |
| model     | `getModels()`                                  | `fromModel`           | local (Settings)     | ✗ |
| template  | `getWorkspaceTemplates()`                      | `fromTemplate`        | local (Home)         | ✗ |

Install actions (`MarketplaceApp.tsx`):
- `handleInstall` (`:224-251`) — only `kind==='package'` installs here; goes through the
  shared `ApprovalModal` first (`buildInstallRequest` `:76-92`, scan-derived risk via
  `installRiskFor`/`classifyInstallRisk`). 403 `TIER_INSUFFICIENT` → dispatches
  `waggle:tier-insufficient` (UpgradeModal); 403 SecurityGate block → destructive toast.
  On success it **optimistically flips local state** (`:231`) — this is the *only* "sync",
  and it is purely local to this component's `extensions` array.
- `handleUninstall` (`:253-262`) — confirmed via a second `ApprovalModal`
  (`buildRemoveRequest` `:65-74`).
- `handleOpenIn` (`:264-266`) — dispatches `waggle:open-app` for federated deep-links.

Adapter methods consumed (all in `apps/web/src/lib/adapter.ts`):
`getMarketplace` (`:2082-2092`, `/api/marketplace?type=…`), `getMarketplacePacks`
(`:1309-1313`), `installMarketplacePackage` (`:1338-1343`, `fetchRaw` so status survives),
`uninstallMarketplacePackage` (`:1345-1350`), `searchMarketplace` (`:1334-1336`, used by
the inline card), `getMcps` (`:2004-2011`), `getConnectors` (`:1958-1964`),
`connectConnector` (`:1971-1979`, `/api/connectors/:id/connect`), `installMcp`
(`:2017-2029`, `/api/mcps/install`), `getPersonas`, `getModels`, `getWorkspaceTemplates`,
`getExtendAudit` (`:2095-2103`, C18 audit feed).

### 1c. The inline-in-chat card — `CapabilityRequestCard.tsx`

Parsed from agent text by `capability-request-parser.ts:segmentText` — two patterns: a
structured HTML marker `<!--waggle:capability_request {...}-->` (Pattern A) and a legacy
`` `install_capability` with name "X" and source "Y" `` phrasing (Pattern B). Card shows
name, a source pill, optional `reason` ("why"), and Install/Dismiss. Phases:
`pending → installing → installed | declined | failed` (`:17`). For marketplace kind it
**resolves name → packageId via `searchMarketplace`** then `installMarketplacePackage`;
for skill kind it calls `adapter.installPack`. 403 → `waggle:tier-insufficient`.

This card is the seed of screen-09 Variation B but it is **skill/marketplace-only** (no
connector or MCP kind), has **no vault-aware approval** ("token goes to your vault"), no
"connected follow-up", and shares **no state** with the grid.

### 1d. Test coverage — `phase4b-marketplace-extend.test.tsx`

11 tests, all green, pinning the *current* Phase-4B contract: federate-at-read of all six
domains, honest federated notes, browse-only packs (no pack install testid), registry-MCP
packages install through the real route, ApprovalModal-gated install with scan-derived
risk, 403-tier-vs-403-securitygate split, all-backends-down error+Retry, Remove confirm,
failed-uninstall does-not-flip-installed, and the Audit tab type filter. **Any PR4 rework
of MarketplaceApp must update / supersede these** — they assert the current testids
(`extension-install-pkg:7`, `extension-facets`, `federated-note`) and the
`{ type, limit:30 }` call shape.

---

## 2. Gap vs screen-09 Variation A (the delta)

| screen-09 element | current state | delta |
|---|---|---|
| **Centered agent-search bar** ("Describe what you want to do…" → "Ask the agent") | plain keyword `<Input>` that filters/queries the registry; no agent round-trip | MISSING — no NL→agent-suggestion call; search is literal substring/registry-`?query=`. |
| **Example chips** | none | MISSING. |
| **Agent-suggestion box** (recommends a connector + skill + tool, each with a "why" + install button) | none in the grid (only the unrelated inline `CapabilityRequestCard` carries a `reason`) | MISSING — no suggestion surface, no "why" reason rendered in the grid, no per-suggestion install. |
| **"N in this workspace" count bar (chips)** | a single render-time `"{visible.length} extensions"` text label `:277` | PARTIAL/WRONG semantics — it counts *visible filtered rows*, not *installed-in-this-workspace* capabilities, and is not a chip bar. |
| **Category filter All/Skills/Connectors/MCP** | 7-facet rail All/Skills/Agents/Connectors/MCPs/Models/Templates | SUPERSET — current has the 3 design facets *plus* Agents/Models/Templates. Design shows 4 (All/Skills/Connectors/MCP). PR4 must decide: collapse to the design's 3-shelf framing or keep the 6-domain superset. |
| **Card grid** (kind badge + name + desc + **install count** + Add button) | vertical *list* of cards; "kind badge" is a plain text `ext.type` pill; **no install count**; single "Install"/"Remove"/"Open in" action | PARTIAL — needs a real grid, a styled kind badge, an install-count field, and **type-aware** primary actions. |
| **Type-aware one-click flows** (skill Add→Adding…→Added; connector Connect→Signing in…→Connected ~1.1s token→vault; MCP Enable→Enabling…→Enabled) | one generic "Install" label + single spinner; connectors/MCPs are *federated deep-links* (Open-in), not in-place actions | MISSING — no per-type verb, no progress→done micro-states, no in-place connect/enable; connector/MCP installs currently *leave* the Marketplace. |
| **Toast + count-bar update per action** | install toasts fire; count bar does not track installed-count | PARTIAL — toasts ✓, count-bar-update ✗. |
| **Shared "sync" store** (one store powers grid + agent-pick + inline card; install anywhere reflects everywhere) | grid keeps a local `extensions` array; inline card keeps its own `phase`; no shared store, no cross-reflect | MISSING — the headline architectural gap. |

### Variation B (inline) delta
- `CapabilityRequestCard` exists but is **skill/marketplace-only** — no connector / MCP
  kinds. Needs the same type-aware verbs as the grid (Connect/Enable).
- **No vault-aware approval** copy ("token goes to your vault"). The warm
  `InlineApprovalCard` (`components/os/warm/InlineApprovalCard.tsx`) is the obvious
  adoption target — it already renders `--honey-wash` + risk vocabulary + Approve/Not-now,
  and connectors carry credentials via `connectConnector(id, {token,…})`.
- **No "connected follow-up"** state distinct from generic "Installed".

### Data availability for "install count"
The marketplace DB schema **does** persist a `downloads` (and `stars`) column
(`packages/server/src/local/routes/marketplace.ts:860`, `upsertPackage`), so an install
count is *backed by data*. But it is **not surfaced**: the FE `MarketplacePackageRow`
(`extension-catalog.ts:54-65`) omits `downloads`, `getMarketplace` returns
`packages: unknown[]`, and `Extension` has no `installs` field. PR4 would thread
`downloads` → `Extension.installCount` → `ExtensionCard`.

---

## 3. Warm-Hive tokens / components to adopt

MarketplaceApp/ExtensionCard are still on the **legacy semantic-token** vocabulary
(`bg-secondary/20`, `text-muted-foreground`, `border-border/30`, `var(--honey-500)`,
`bg-primary`). The warm-Hive PR1+ vocabulary they should migrate to:

- **Tokens** (defined `apps/web/src/waggle-theme.css`, used across `warm/*`):
  `--honey`, `--honey-wash`, `--honey-line`, `--shadow-honey`, `--surface`, `--line`,
  `--line-strong`, `--text`, `--text-2`, `--text-dim`, `--attention`.
- **`AskBar`** (`components/os/warm/AskBar.tsx`) — the warm full-width ask pill (honey "+",
  ⌘K hint, honey send). This is the direct fit for the screen-09 "centered agent-search
  bar" (swap placeholder to "Describe what you want to do…", wire submit → agent
  suggestion instead of free chat).
- **`InlineApprovalCard`** (`components/os/warm/InlineApprovalCard.tsx`) — the vault-aware
  honey approval card for Variation B's connector token→vault approval.
- **`SectionLabel`**, **`IconTile`/`HexCheckTile`**, **`StatusBadge`**
  (`components/ui/status-badge.tsx`, already used) for kind badges / count chips.
- **`StreakChip`/`RunChip`** patterns (`components/os/warm/`) as the visual idiom for the
  "N in this workspace" chip bar.
- All warm atoms are barrel-exported from `apps/web/src/components/os/warm/index.ts`.

---

## 4. Exact integration points a PR4 build would touch

- **Grid host**: `apps/web/src/components/os/apps/MarketplaceApp.tsx` — `MarketplaceApp`
  component; `loadFacet` (fan-out/merge), `handleInstall`/`handleUninstall`/`handleOpenIn`,
  `buildInstallRequest`/`buildRemoveRequest`/`installRiskFor`.
- **Card**: `apps/web/src/components/os/apps/extend/ExtensionCard.tsx` — `ExtensionCard`
  (add kind badge styling, install count, type-aware action verbs + micro-states).
- **View-model + normalizers**: `apps/web/src/lib/extension-catalog.ts` — `Extension`
  interface (add `installCount`, an `installState` micro-phase, make connector/mcp
  `installable`), `fromConnector`/`fromMcpCatalogRow`/`fromMarketplacePackage`,
  `filterExtensions`, `sortExtensions`.
- **Inline card**: `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx`
  + `capability-request-parser.ts` (`segmentText`, `CapabilityRequest`) — extend `kind`
  to `'connector' | 'mcp'`, wire `connectConnector`/`installMcp`, vault-aware approval.
- **Shared store (NEW)**: nothing exists today. A PR4 "sync" store would be a new module
  (e.g. a context/zustand/event-bus in `apps/web/src/lib/` or `providers/`) that both
  `MarketplaceApp` and `CapabilityRequestCard` subscribe to; cross-reflect can also reuse
  the existing `window.dispatchEvent('waggle:*')` event idiom already used for
  `waggle:open-app` and `waggle:tier-insufficient`.
- **Adapter (existing, reuse)**: `apps/web/src/lib/adapter.ts` — `getMarketplace`,
  `installMarketplacePackage`, `uninstallMarketplacePackage`, `searchMarketplace`,
  `getConnectors`, `connectConnector`, `getMcps`, `installMcp`, `getExtendAudit`.
- **Types**: `packages/shared/src/types.ts` — `EXTENSION_TYPES` / `ExtensionType`
  (`:375-378`) is the canonical facet list; decide whether the design's 4-facet shelf
  collapses or wraps this 6-domain tuple.
- **Server (read-only context)**: `packages/server/src/local/routes/marketplace.ts`
  (`/api/marketplace`, `/install`, `/uninstall`, `downloads` column),
  `packages/server/src/local/routes/extend.ts` (C18 audit).
- **Route wrapper**: `apps/web/src/routes/MarketplaceRoute.tsx` (unchanged unless the shell
  framing changes).
- **Tests to supersede**: `apps/web/src/test/phase4b-marketplace-extend.test.tsx`.

---

## 5. Risks

- **Test churn**: 11 existing tests pin current testids and the `{type,limit:30}` call
  shape; a Variation-A rework rewrites most of them.
- **Facet framing decision**: design says 3 shelves (Skills/Connectors/MCP); code has 6
  domains incl. Agents/Models/Templates with honest federated notes. Collapsing loses the
  honesty work; keeping diverges from the design's "one simple shelf".
- **In-place connect/enable vs deep-link**: design wants connectors/MCPs installed *in the
  Marketplace* (Connect→Connected, Enable→Enabled). Today they are federated deep-links to
  Connector Hub / MCP Hub which own the real OAuth/security-scan/approval flows
  (`connectConnector`, `installMcp` w/ SecurityGate). Doing it in-place must NOT bypass
  those flows — risk of duplicating or weakening security gating.
- **"Sync" consistency**: a shared store must reconcile optimistic flips with server truth
  (install can 403/securitygate-block after the optimistic flip) across both surfaces.
- **Install count truthfulness**: `downloads` is local-single-user and often 0; rendering
  it as a social "install count" may be misleading (mind-isolation / honest-stats ethos
  the repo enforces elsewhere).

---

## 6. Open questions for the lead

1. **Facets**: collapse to the design's All/Skills/Connectors/MCP (3 shelves), or keep the
   6-domain superset (Agents/Models/Templates) with federated notes?
2. **In-place vs deep-link** for connector/MCP: do Connect/Enable happen *inside*
   Marketplace (new in-place flow that must reuse the Hub security/OAuth paths), or stay
   deep-links? The design clearly wants in-place.
3. **Shared "sync" store** mechanism: new context/store module vs reuse the existing
   `window` CustomEvent bus? What's the source of truth (server re-read vs optimistic +
   reconcile)?
4. **"N in this workspace"**: counts *installed* capabilities (which backend gives the
   per-workspace installed set?) — is `getExtendAudit` / a capabilities-status read the
   source, or a new `/api/marketplace?installed=true&workspace=…`?
5. **Install count**: surface `downloads` honestly, or omit it given local-single-user
   data is ~0 and the repo's honest-stats ethos?
6. **Agent-suggestion box**: which backend produces the connector+skill+tool
   recommendation with a "why"? Is there an agent/LLM route to call, or is this a curated
   heuristic over the registry?
7. **Inline Variation B**: extend `CapabilityRequestCard` in place, or replace it with a
   shared picker component used by both grid and chat?
