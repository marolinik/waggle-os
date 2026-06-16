# PR4 Recon — Slice 5: Agent-Search / Agent-Pick

**Screen 09 Marketplace · Variation A "agent-suggestion box"**
"Describe what you want to do…" → agent recommends a **connector + skill + tool**, each with a **"why"** reason and an **install** button.

Branch: `feature/warm-hive-pr4` · READ-ONLY recon · cited file:line as of 2026-06-16.

---

## TL;DR

The agent-pick engine **already exists and is good**: `searchCapabilities()` in
`packages/agent/src/capability-acquisition.ts:179` takes a natural-language `need` and returns a
ranked, deduped `AcquisitionProposal` of native tools / installed skills / starter-pack skills /
marketplace packages — **each candidate already carries a `matchReason` ("why") and an
`installAction`** plus a trust assessment. It fuses **keyword scoring** (no embeddings) across local
sources with **pre-fetched marketplace FTS5 candidates**.

**The gap is entirely the surface, not the brain.** This engine is reachable **only as an agent tool**
(`acquire_capability`, `packages/agent/src/skill-tools.ts:406`) invoked inside the chat loop — there is
**no HTTP route** that the Screen-09 agent-search bar could `POST` a need to and render the
three-up suggestion box. PR4 must add a thin REST endpoint over the existing `searchCapabilities()`
(plus its deps assembly that today lives inline in `local/index.ts:620`) and a new
`MarketplaceApp` agent-search UI. The matching scoring is single-recommendation today
(`proposal.recommendation` is ONE candidate); the design wants **one-of-each-kind** (connector+skill+tool),
which is a selection/grouping change on top of the existing ranked `candidates[]`, not new matching.

---

## What exists today (verified)

### 1. The matching brain — `searchCapabilities()` (the agent-pick core)
`packages/agent/src/capability-acquisition.ts`

- **Input** (`SearchCapabilitiesInput`, :170): `{ need, installedSkills[], starterSkillsDir,
  nativeToolNames[], marketplaceCandidates[] }`. Marketplace candidates are **pre-fetched and passed
  in** — `searchCapabilities` itself does no IO except reading starter-skill `.md` files from disk
  (`loadStarterSkillsMeta`, :142).
- **Algorithm** (no embeddings — pure keyword): `extractKeywords()` (:64, stop-word filtered) →
  `scoreMatch()` (:74, name-hit ×2 / content-hit ×1, normalized 0–1) across four source lanes:
  1. native tools (scored vs `NATIVE_TOOL_HINTS` map, :113);
  2. installed/active skills (:218);
  3. starter-pack skills not yet installed (:241);
  4. marketplace candidates, merging the FTS score when present via `Math.max(keywordScore, mkt.score)` (:270).
- **Output** (`AcquisitionProposal`, :39): `{ need, gapDetected, summary, candidates[]≤8,
  recommendation, alreadyHandled }`. Each `CapabilityCandidate` (:27) already has the exact fields
  Screen-09 needs: `name`, `type` ('native'|'skill'|'plugin'|'mcp'|'connector'|'marketplace'),
  `availability`, `description`, `matchReason` (**the "why"**, built by `buildMatchReason` :99),
  `installAction` (string|null), and `trust`.
- **Recommendation is SINGLE** (:307–314): picks the best installable (or best active if
  already-handled). It does **not** group into connector+skill+tool. The full ranked `candidates[]`
  is there to do that, but the grouping logic does not exist yet.
- **`summary`** is a markdown string built for the **chat** surface (`buildProposalSummary`, :330): it
  even **emits the inline-install marker** (`<!--waggle:capability_request {...}-->`, :385) verbatim for
  the chat card. This is debug/chat-grade prose — a UI agent-suggestion box would consume the
  **structured `candidates`/`recommendation`, not `summary`**.

### 2. How it's invoked today — the agent tool `acquire_capability`
`packages/agent/src/skill-tools.ts:404–478`

- Tool `acquire_capability` (param: `need`) gathers deps: `getInstalledSkills()`, `starterSkillsDir`,
  `nativeToolNames`, and calls `deps.searchMarketplace(need)` (graceful try/catch) to pre-fetch
  marketplace candidates, then calls `searchCapabilities(...)` and **returns `proposal.summary`** (the
  markdown string) to the model. Audit event recorded on gap (:461).
- Companion tool `install_capability` (:482) installs **starter-pack skills only** (validated by
  `validateInstallCandidate`, capability-acquisition.ts:424 — rejects any source ≠ `starter-pack`).
- The deps are wired in `packages/server/src/local/index.ts:620` (`createSkillTools({...})`):
  - `nativeToolNames` = union of mind/system/plan/git/document tool names (:624);
  - `getInstalledSkills` = live `server.agentState.skills` (:631, hot-reloadable);
  - `searchMarketplace` = `marketplaceDb.search({ query, limit: 10 })` mapped to `MarketplaceCandidate[]`
    (:641–656) — note `score` is hardcoded `undefined` (FTS rank not surfaced through the API).

### 3. The marketplace search it sits on
`packages/server/src/local/routes/marketplace.ts:57` — `GET /api/marketplace/search`
→ `MarketplaceDB.search()` (`packages/marketplace/src/db.ts:86`).

- FTS5 over the `packages` table. **Critically, `db.search` already tolerates a verbose NL `need`**:
  `toFtsMatchQuery()` (db.ts:91–99) relaxes the raw string into an OR-of-prefixes and falls back to an
  unfiltered listing rather than throwing — so the agent's natural-language need works as-is.
- `SearchResult` (`types.ts:233`): `{ packages[], total, facets{types,categories,sources},
  installedCount }`. Each `MarketplacePackage` carries `waggle_install_type` ('skill'|'connector'|'mcp')
  → **the kind badge**, `package_type`, `description`, `downloads` (install count), and (route-annotated
  at marketplace.ts:105) `installed`, `scanStatus`. **`installedCount`** is the natural source for the
  "N in this workspace" count bar (currently catalog-wide, not workspace-scoped — see Gaps).

### 4. The parallel, narrower "recommend" path (skills-only) — DO NOT confuse with agent-pick
`packages/agent/src/skill-recommender.ts` (`SkillRecommender.recommend(context, topN)`, class at :118).
- Multi-signal keyword + bigram + synonym-cluster matcher over **installed skills only** (no
  marketplace, no connectors, no MCP). Returns `SkillRecommendation[] = {skillName, reason,
  relevanceScore}` — also a "why" (`reason`), but skills-only.
- Exposed over HTTP at `GET /api/skills/suggestions?context=&topN=`
  (`packages/server/src/local/routes/skills.ts:393–406`). This is the **only** existing HTTP surface
  that returns "what should I use" with a reason — but it's the wrong shelf (skills only, already
  installed) for Screen-09's connector+skill+tool suggestion box. Useful as a *prior-art pattern* for
  shaping the new route.

### 5. The router (a third matcher) — for completeness
`packages/agent/src/capability-router.ts` (`CapabilityRouter.resolve(query)`, :58). Maps a query to
ranked routes across native/connector/skill/plugin/mcp/subagent with confidences. **Resolution, not
recommendation** — returns "where could this be handled" not "install this". Connector lane (:85)
knows `connected` status and emits a suggestion when not connected. Not currently HTTP-exposed; a
secondary input if PR4 wants live-connector awareness in the suggestion box.

### 6. The inline-card render path (the "sync" downstream, shared with the grid)
- Parser: `apps/web/src/components/os/apps/chat-blocks/capability-request-parser.ts` — `segmentText()`
  splits agent text on the `<!--waggle:capability_request {name,source,reason}-->` marker (and a legacy
  phrasing) into install-card segments, deduped by `source::name`.
- Card: `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx` — renders the
  **pending→installing→installed/failed** micro-states (:17,:107–149) with a "why" line from
  `request.reason` (:103). Install routing already branches by source: marketplace →
  `adapter.searchMarketplace` then `adapter.installMarketplacePackage(pkg.id)` (:48–54, tier-gated, 403
  → UpgradeModal); starter-pack → `adapter.installPack` (:69). **This is exactly the type-aware
  one-click flow §09 asks for, already built for the inline-chat variation (Variation B).**

### 7. Adapter methods already present (the install actions)
`apps/web/src/lib/adapter.ts`: `searchMarketplace(query,limit)` (:1334), `installMarketplacePackage(id)`
(:1338), `installPack(skillId)` (:1292), `connectConnector(id,creds)` (:1971), `installMcp(mcpId)`
(:2017). All three install kinds in the §09 sync spec (skill Add / connector Connect / MCP Enable)
have adapter coverage.

---

## Gaps vs the Screen-09 contract

1. **No HTTP route for agent-pick.** `searchCapabilities()` is reachable ONLY inside the chat agent
   loop via the `acquire_capability` tool. The Screen-09 centered agent-search bar ("Ask the agent")
   needs a `POST /api/marketplace/agent-search` (or similar) that runs `searchCapabilities` and returns
   **structured candidates** (not the chat `summary` markdown). Must be built on top of the existing
   engine.

2. **Returns chat-grade `summary`, not a structured suggestion box.** The tool returns
   `proposal.summary` (markdown for the model). The UI needs the raw `candidates[]`/`recommendation`
   JSON. The data is computed (proposal object) but **discarded** at skill-tools.ts:476 — a route would
   return the object directly.

3. **Single recommendation, not one-of-each-kind.** `proposal.recommendation` is ONE candidate
   (capability-acquisition.ts:307). §09 wants **connector + skill + tool** (three, one per kind) each
   with its own why + install. Needs a small grouping pass over the ranked `candidates[]` (top per
   `type`/`availability`) — new logic, but trivial given candidates already carry `type`.

4. **Marketplace deps assembly lives inline in `local/index.ts`, not reusable.** The
   `getInstalledSkills` / `nativeToolNames` / `searchMarketplace` closure that feeds the tool is
   constructed once at server boot (index.ts:620). A new route needs the same deps — either lift this
   into a shared helper or have the route reconstruct it. (Native tool names, in particular, are only
   assembled in that closure.)

5. **"N in this workspace" count bar is catalog-wide, not workspace-scoped.** `installedCount`
   (db.search → types.ts:242) counts all installed packages globally; the marketplace DB is not
   workspace-partitioned. §09's per-workspace chip count has **no backing field** today.

6. **No "example chips" / suggested-need seeding.** Pure UI; no backend. Can be static or derived
   from persona `suggestedCommands` — out of agent-pick scope.

7. **No shared install-state store on the frontend.** §09's CRITICAL "sync" (one store powers grid +
   agent-pick + inline card, installing in any view reflects in all) — the current `MarketplaceApp.tsx`
   (no agent-search at all, install state local to each card) and `CapabilityRequestCard` (local
   `useState` phase) have **independent** state. This is the headline PR4 frontend build; agent-pick is
   one of the three consumers of that store. (Owned by the "shared install store" slice — flagged here
   as the integration boundary.)

8. **`MarketplaceApp.tsx` has no agent-search UI.** Verified: the 417-line component
   (`apps/web/src/components/os/apps/MarketplaceApp.tsx`) contains no "Ask the agent" / suggestion /
   `acquire`-style references — only grid install/uninstall via `installMarketplacePackage` (:228).
   Variation A's centered bar + suggestion box must be built net-new.

9. **Marketplace FTS rank not surfaced.** `searchMarketplace` hardcodes `score: undefined`
   (index.ts:651), so marketplace candidates rank purely by keyword re-scoring inside
   `searchCapabilities`. Acceptable, but means FTS relevance is currently dropped on the floor for the
   agent-pick path.

---

## Exact integration points a PR4 build would touch

- **Reuse (engine):** `searchCapabilities(input): AcquisitionProposal`
  — `packages/agent/src/capability-acquisition.ts:179`. Exported from `@waggle/agent`
  (`packages/agent/src/index.ts:326`). Types `CapabilityCandidate` / `AcquisitionProposal` /
  `MarketplaceCandidate` / `SearchCapabilitiesInput` are all exported.
- **Build (route):** new `POST /api/marketplace/agent-search` (body `{ need }`) in the marketplace
  route file `packages/server/src/local/routes/marketplace.ts` — runs `searchCapabilities` with deps
  assembled like `local/index.ts:620–657`, returns structured `{ candidates, recommendation,
  groupedByKind }`. Pattern to mirror for shape/contract: `GET /api/skills/suggestions`
  (`packages/server/src/local/routes/skills.ts:393`).
- **Reuse (deps):** marketplace search `MarketplaceDB.search({query,limit})`
  (`packages/marketplace/src/db.ts:86`); installed-skills source `server.agentState.skills`; native
  tool-name union (currently only assembled at `local/index.ts:624` — lift if reused).
- **Add (grouping):** a `pickOnePerKind(candidates)` helper (new) to satisfy connector+skill+tool —
  trivial reduce over `candidate.type`.
- **Install actions (already present, reuse):** `adapter.installMarketplacePackage` /
  `adapter.installPack` / `adapter.connectConnector` / `adapter.installMcp`
  (`apps/web/src/lib/adapter.ts:1338/1292/1971/2017`). Marker/card render reuse:
  `segmentText` + `CapabilityRequestCard` (chat-blocks/).
- **Count bar:** `SearchResult.installedCount` (`packages/marketplace/src/types.ts:242`) via
  `/api/marketplace/search`; needs workspace-scoping if §09's per-workspace count is taken literally.
- **Audit (existing, ride along):** `fastify.auditStore?.record(...)` already called on gap in
  skill-tools.ts:461 — a route should record proposals the same way.

---

## Risks / watch-outs

- **Two parallel matchers + a router** (`searchCapabilities` vs `SkillRecommender` vs
  `CapabilityRouter`) — building a new route on the wrong one (e.g. `SkillRecommender`, which is
  skills-only and HTTP-exposed already) would silently drop connectors/MCP. **Use
  `searchCapabilities`.**
- **`summary` vs structured-candidates confusion** — the tool's return value is markdown; do not parse
  it for the UI. Return the proposal object from the new route.
- **Keyword-only matching** — no embeddings; verbose/synonym-heavy needs may under-match. Acceptable
  for v1 but the suggestion box may look thin on phrasing mismatch. (`SkillRecommender` has synonym
  expansion; `searchCapabilities` does not.)
- **Tier gating asymmetry** — marketplace/MCP install is PRO-gated (marketplace.ts:181 `requireTier`),
  starter-pack/skill is free. The suggestion box must reflect this (the inline card already 403→Upgrade,
  CapabilityRequestCard.tsx:55).
- **Workspace scoping of installs** — marketplace DB is global; the "N in this workspace" framing may
  over-promise isolation that the substrate doesn't provide.
- **Native tool-name list is closure-local** (index.ts:624) — a route reconstructing deps must not
  drift from the real registered tool set, or agent-pick "already have a tool" answers go stale.

---

## Open questions for the founder/lead

1. **Route shape:** dedicated `POST /api/marketplace/agent-search`, or extend
   `GET /api/marketplace/search` with an `agentPick=true` mode? (The former is cleaner given the verbose
   NL body + structured proposal response.)
2. **One-of-each-kind vs top-N:** §09 shows exactly connector+skill+tool (3). When a kind has no match
   (e.g. no relevant connector), show 2? Show an empty-kind hint? Define the grouping contract.
3. **Count bar semantics:** is "N in this workspace" literally per-workspace (needs new
   workspace-scoped install tracking) or is catalog-wide `installedCount` acceptable for v1?
4. **Suggestion-box "why":** use the engine's `matchReason` (keyword-hit-grade, e.g. "name matches:
   risk") as-is, or have the route pass candidates to the LLM for a one-line natural "why"? The former
   is free + deterministic; the latter is prettier but adds a model call.
5. **Shared install store ownership:** confirm the frontend "sync" store is a separate PR4 slice that
   agent-pick plugs into (this recon treats it as the integration boundary, not part of Slice 5).
