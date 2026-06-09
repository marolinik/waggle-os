# Gap Card — S15 Memory Import

> UX-refactor planning artifact. Execution model is **in-place incremental refactor** of `apps/web`
> + targeted backend extensions. Every claim is grounded in a real file (cited inline).
> Mockup is **directional** (PRD §24) — PRD acceptance criteria win over pixels.

---

## 1. Screen & purpose

**S15 = the Memory Import step of onboarding** (PRD §12.12 step 4; Blueprint screen 15, `_blueprint_extracted.txt:727`). It is the "Capture" surface where a new user connects/imports their existing AI history (Claude, Claude Code, Cursor, Hermes, Codex, ChatGPT, Gemini, Perplexity…) and work tools (Files, Notion, Google Drive, Slack) so Waggle's persistent memory starts non-empty.

PRD anchors:
- §12.12 step 4 "Memory Import — connect/import from AI tools, files, and work tools" (PRD:637).
- §16.5 Harvest API: `POST /api/harvest/preview`, `POST /api/harvest/commit`, `GET /api/harvest/sources`, `POST /api/harvest/sources/:id/sync` (PRD:1098-1101).
- Privacy gate: "No memory import without review/approval" (PRD:1207) and "Nothing imports without explicit review/approval" (PRD:646). **S15 produces the preview; the approval/commit decision is S16 Memory Review** (`_blueprint_extracted.txt:731`).

Mockup `screen_15_memory_import.png` (directional) shows a 3-region layout:
- **Left rail** — onboarding step list (Welcome / Why us / Tool discovery / Import memory [active] / Review & confirm) + a "Your data is private" footer card.
- **Center** — "Import your memory" with two grids: **AI Assistants & Coding Tools** (Claude, Claude Code, Cursor, Hermes, Codex, Other AI Tools — each a **Connect** action) and **Files & Workspace Tools** (Files, Notion, Google Drive, Slack — **Connect** actions). A primary **Continue** button bottom-right.
- **Right rail** — "What we import" (Conversations / Documents / Decisions / Artifacts / Code) and "You're in control" (review-before-import, never-shared, disconnect-anytime).

> Note the mockup is **Connect-centric** (OAuth/connector tiles) whereas the live onboarding step is **upload-centric** (file pickers). This is the core directional gap (see §2/§3).

---

## 2. Required states (PRD/Blueprint)

PRD §14.1 global states apply (Loading / Empty / Populated / Error / Offline-local-only / Syncing / Permission-denied / Partial / Approval-required). Concretely for S15:

| State | Trigger | Source of truth |
|---|---|---|
| Idle / source grid | step entered, no source picked | mockup center grids |
| Source auto-detected | sidecar finds local Claude Code at `~/.claude` | `POST /api/harvest/scan-claude-code` → `{found,itemCount,path}` |
| Preview / parsed | file uploaded or source connected; items parsed | `POST /api/harvest/preview` → `{itemCount, types, preview[]}` |
| Importing (live progress) | commit running | SSE `GET /api/harvest/progress` `{phase∈saving\|cognifying\|wiki-compile, current, total}` |
| Imported / done | commit returned | `POST /api/harvest/commit` `{saved, cognified, wikiCompiled, ...}` |
| No real embedder (degraded) | commit returns `cognifySkippedReason\|wikiSkippedReason = 'no_real_embedder'` | harvest commit response (05c §8) |
| Resume available | prior run interrupted | `GET /api/harvest/runs/latest-interrupted` |
| Connector consent / OAuth | "Connect" on Notion/Drive/Slack/Gmail | `GET /api/connectors`, `POST /api/connectors/:id/connect`, `GET /api/oauth/:provider/authorize` |
| Error | parse/commit/connect failure | per-call catch |
| Skipped | user declines (Journey 2, PRD:683-686) | navigates to next onboarding step |
| Privacy headline | always | mockup right rail; existing copy in `HarvestTab.tsx:362-365` |

**Approval boundary (load-bearing):** S15 ends at *preview*; the explicit approve-before-persist gate is **S16 Memory Review**. The live code today commits directly from S15 (no separate review screen) — a PRD-compliance gap, see §3.

---

## 3. Current state in repo (exact files + what they do)

Two existing surfaces already implement most of S15's *upload* path against the harvest substrate:

### 3a. Onboarding step (the real S15)
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx` — step index **3** = `memory-import` (`STEP_NAMES` at `:35`). Holds import state (`importSource`/`importPreview`/`importing`/`importDone` `:64-72`), handlers `handleFileImport` (`:156-166` → `adapter.harvestPreview`), `handleImportCommit` (`:168-177` → `adapter.harvestCommit`, then `goToStep(4)`), Claude-Code auto-detect on mount (`:182-191` → `adapter.scanClaudeCode`) and `handleClaudeCodeHarvest` (`:193-202`). Renders `<ImportStep step===3>` at `:519-531`.
- `apps/web/src/components/os/overlays/onboarding/ImportStep.tsx` (192 LOC) — the actual S15 UI. 6 `SOURCE_TILES` (chatgpt/claude/gemini/perplexity/cursor/unknown, `:18-33`) as **file pickers** (`accept=".json,.txt,.md,.csv"` `:113`), Claude-Code detect banner (`:62-86`), preview list + "Import N items" (`:125-155`), done state (`:157-162`), and a text pointer to "Memory → Harvest for 14+ more sources" (`:167-173`).
- `apps/web/src/components/os/overlays/onboarding/types.ts:38-52` — `ImportStepProps`.

### 3b. Post-onboarding harvest hub (the "Memory → Harvest" surface)
- `apps/web/src/components/os/apps/MemoryApp.tsx` → **Harvest tab** → `apps/web/src/components/os/apps/memory/HarvestTab.tsx` (685 LOC). The full-featured sibling: connected-sources list with auto-sync toggle/remove (`:505-559`), 15-source selector (`SOURCE_ICONS :35-51`), upload **and** paste modes (`:582-639`), preview with type-count chips (`:642-679`), **live SSE progress bar** (`:420-447`), **resume/discard banner** (`:330-360`), **identity-suggestion nudge** post-commit (`:452-470`), dedup/enrichment summary (`:472-502`), `no_real_embedder` not yet surfaced as a distinct affordance.
- `apps/web/src/components/os/apps/memory/ImportReminderBanner.tsx` — nudge to revisit import.

### 3c. Adapter methods (the contract surface, `apps/web/src/lib/adapter.ts`)
`harvestPreview` (`:1684`), `harvestCommit` (`:1689`), `getHarvestSources` (`:1694`), `scanClaudeCode` (`:1699`), `extractHarvestIdentity` (`:1710`), plus (per frontend inventory) `subscribeHarvestProgress`, `getLatestInterruptedHarvestRun`, `resumeHarvestRun`, `abandonHarvestRun`, `removeHarvestSource`, `toggleHarvestAutoSync`. Connector side: `getConnectors`, `getConnectorHealth`, `connectConnector`, `disconnectConnector`.

### Disposition: **rework** (promote-and-extend, do NOT create-new)
The harvest *engine* and most of the *upload* UX already exist and are wired to the right endpoints. S15 needs to be **reworked** to (a) match the mockup's connect-grid IA, (b) **split commit out into S16 Memory Review** to satisfy the PRD "no import without review/approval" gate, and (c) reconcile the two near-duplicate surfaces (`ImportStep` vs `HarvestTab`) onto one shared component so onboarding and the standalone hub don't drift. This is squarely the locked in-place refactor model — reuse `harvest.ts` substrate, extend the frontend.

---

## 4. Frontend work

**Reuse targets (do not rebuild):** `HarvestTab.tsx` is the canonical, feature-complete harvest UI — its SSE progress, resume banner, identity nudge, and dedup summary should be the shared core. `ImportStep.tsx` is the lighter onboarding shell. The connector tiles in the mockup map to the existing `ConnectorsApp`/`connectors/BrandTile.tsx` patterns.

Concrete components:

1. **Extract a shared `MemorySourcePicker` + `HarvestPreview` + `HarvestProgress`** from `HarvestTab.tsx` (currently a 685-LOC monolith; CLAUDE.md §coding-style favors small files) into `components/os/apps/memory/` so both `HarvestTab` and the onboarding `ImportStep` consume one source of truth.
   - Props: `sources: SourceTile[]`, `onPreview(data,source)`, `onConnect(connectorId)`, `preview`, `progress`, `result`, `mode: 'onboarding'|'hub'`.
2. **Rework `ImportStep.tsx`** to the mockup's two-grid layout: **AI Assistants & Coding Tools** (Claude, Claude Code, Cursor, Hermes, Codex, ChatGPT, Gemini, Perplexity, Other) + **Files & Workspace Tools** (Files=`/api/ingest` upload, Notion/Drive/Slack/Gmail = connector "Connect"). Add the right-rail "What we import" + "You're in control" panels (copy already exists in `HarvestTab.tsx:362-369`).
   - Distinguish tile *kind*: `upload` (harvest file picker), `scan` (Claude Code local), `connect` (connector OAuth). Hermes/Codex are AI-tool launch/hook surfaces (`LauncherApp`/tool-detect) — for v1 they can be `upload`/"Other" or marked "coming soon" (open question OQ-1).
3. **Move the commit decision to S16 Memory Review.** S15's "Continue" should carry the parsed preview forward; the explicit **approve → `harvestCommit`** happens on S16. Update `OnboardingWizard.handleImportCommit` (`:168-177`) to defer commit, or have S15 stage previews and S16 commit them. (Satisfies PRD:646/1207.)
4. **Surface `no_real_embedder`** as a soft inline affordance ("semantic search/wiki won't update until you add an embedding key") using the `cognifySkippedReason`/`wikiSkippedReason` already in the commit response — currently unsurfaced in both UIs.
5. **Connector consent flow** for Files & Workspace Tools tiles: reuse `adapter.connectConnector` + OAuth redirect (`/api/oauth/:provider/authorize`); show "review permissions" before connect (PRD:1207, Journey 8).
6. **State coverage:** add explicit Loading/Error/Offline/Permission-denied/Approval-required renders per PRD §14.1 (HarvestTab has most; ImportStep is missing loading/offline).

Adapter: **no new methods required for the upload path** — all harvest + connector methods already exist (§3c). New methods needed only if backend adds `/api/harvest/sources/:id/sync` and a connector `/sync` (see §5).

---

## 5. Backend work (PRD §16.5 + adjacent)

Cross-referenced against `docs/backend-map/sections/05c-subsystem-harvest.md`, `03b-api-memory.md`, and the route inventory.

| PRD §16 endpoint | Status | Note / what to EXTEND vs NET-NEW | Substrate |
|---|---|---|---|
| `POST /api/harvest/preview` | **EXISTS** | `routes/harvest.ts` — `{data,source}` → `{itemCount,types,preview[]}` (05c §6). No change. | personal `.mind` |
| `POST /api/harvest/commit` | **EXISTS** | `routes/harvest.ts` — full ingest: parse → `FrameStore.createIFrame(gop='harvest',src='import')` → cognify → wiki recompile; SSE heartbeats; resumable run-store (05c §4). No change. | `memory_frames` (personal.mind) + KG + wiki |
| `GET /api/harvest/sources` | **EXISTS** | `routes/harvest.ts` → `{sources: HarvestSource[]}`. No change. | `harvest_sources` |
| `POST /api/harvest/sources/:id/sync` | **PARTIAL → EXTEND (net-new thin route)** | No per-source `/sync` action exists (route-inventory §16.5). Sources are registered via `POST /api/harvest/sources` and toggled via `PATCH /api/harvest/sources/:source`; actual re-sync runs through `POST /api/harvest/commit`. **Add a thin `POST /api/harvest/sources/:source/sync`** that resolves the source row and calls the existing commit path. **Path-key mismatch to resolve:** PRD uses `:id`; current sources are keyed by `:source` **name** (DELETE/PATCH both use `:source`, harvest.ts). Pick `:source` for consistency with siblings. | `harvest_sources` + commit pipeline |

**Adjacent endpoints S15 actually calls (not in §16.5 but load-bearing — all EXIST):**
- `POST /api/harvest/scan-claude-code` — local `~/.claude` dry-run scan (EXISTS, `harvest.ts`).
- `GET /api/harvest/progress` — **SSE** progress (EXISTS).
- `GET /api/harvest/runs/latest-interrupted`, `POST /api/harvest/runs/:id/abandon`, resume via `commit {resumeFromRun}` (all EXIST).
- `POST /api/harvest/extract-identity` — post-commit identity suggestions (EXISTS) — feeds S16/Profile, not S15 proper.
- `POST /api/ingest` — for the "Files" tile (base64 file → text + frames, EXISTS, `ingest.ts`).
- `GET /api/connectors`, `POST /api/connectors/:id/connect`, `GET /api/oauth/:provider/authorize|callback` — for Notion/Drive/Slack/Gmail "Connect" tiles (all EXIST; connectors defined under `packages/agent/src/connectors/*` incl. `notion-connector.ts`, `gdrive-connector.ts`, `slack-connector.ts`, `gmail-connector.ts`). A connector `POST /api/connectors/:id/sync` is **MISSING** (route-inventory §16.9) — net-new if the workspace-tools tiles must pull data immediately, but for S15 a "Connected" state without immediate pull is acceptable for v1.

**`.mind` migration flag:** **None required for S15's import path.** Harvest writes plain `memory_frames` via the existing `createIFrame` signature — no schema change. (The broader Memory Center migration for explicit `confidence`/`provenance`/`kind` per PRD §15.4 — a single additive `metadata TEXT` column on `memory_frames` — is owned by the **Memory Center / S16 Review** cards, not S15. Provenance today is a text prefix `[Harvest:<source>]` in `content`, per 05c §4, which S16 can parse for the "source/confidence" review chips.)

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

S15's wire shapes are harvest-specific and live in `packages/hive-mind-core/src/harvest/types.ts` (`UniversalImportItem`, `HarvestSource`, `HarvestRun`, `ImportSourceType`, `ImportItemType` — 05c §1). The frontend currently re-declares lossy local interfaces (`HarvestSource`/`PreviewResult` in `HarvestTab.tsx:16-33`; `claudeCodeDetected` shape inline). Gaps vs `apps/web/src/lib/types.ts`:

- **No shared `HarvestSource`/`HarvestRun`/`PreviewResult`/`ImportSourceType` in `lib/types.ts`** — each surface hand-rolls them. Promote a canonical `HarvestSource`, `HarvestPreview`, `HarvestCommitResult`, `ImportSourceType` into `lib/types.ts` (mirror the hive-mind-core shapes) so `ImportStep` and `HarvestTab` share one contract.
- PRD §15.2 `Scope` / `MemoryKind` / `Confidence` unions are **not** S15's concern (they belong to S16/Memory Center) — S15 only needs the import-item/source/run types.
- `adapter.harvestPreview`/`harvestCommit` are typed `Promise<any>` (`adapter.ts:1684,1689`) — tighten to the new shared result types (CLAUDE.md / ts-rules forbid `any`).

---

## 7. Dependencies (screens/phases first)

- **Belongs to PRD Phase 2 "Work layer" → Onboarding flow** (PRD:233) / Roadmap **Sprint 5** (PRD:1335-1342). Sequenced after S12 First Launch, S13 Who Are You, S14 Tool Discovery.
- **Tightly coupled to S16 Memory Review** — S15 produces the preview; **S16 owns the approve→commit gate**. The commit-deferral rework (§4.3) cannot land without S16 existing. Plan S15 + S16 as a pair.
- **Feeds S17 Create Workspace** (Journey 18: Memory Review finds projects → pre-fill workspace, PRD:812-817) — downstream, not blocking.
- **Connector tiles depend on the Extend-layer Connector Hub** patterns (Phase 4) for OAuth/consent; for S15 v1 the existing `connectors.ts` + `oauth.ts` routes are sufficient (no Connector Hub UI dependency).
- Shared-component extraction (§4.1) should land **before** reworking `ImportStep` so both surfaces converge rather than diverge further.

---

## 8. Effort: **M**

Backend is near-zero (one thin `/sync` alias; everything else EXISTS). The weight is frontend: extract a shared harvest component from a 685-LOC monolith, rebuild `ImportStep` to the two-grid connect layout, wire connector-OAuth tiles, surface `no_real_embedder`, and re-sequence commit into S16. Not L because no new substrate/migration and the engine is done; not S because it touches two surfaces + the S15/S16 approval split + type promotion.

---

## 9. Open questions

1. **Hermes / Codex / Cursor tiles** (mockup) — these are AI-coding *tools* surfaced via the AI-OS launcher/tool-detect + hooks (`LauncherApp`, `/api/tools/detect`), not harvest export adapters (Cursor falls through `UniversalAdapter`; Hermes/Codex have no harvest adapter, 05c §1 union). For v1: render as `upload`/"Other" file pickers, or as "Connect via hooks" using the AI-OS launcher, or "coming soon"? PRD §12.12 says "connect/import from AI tools" without specifying the mechanism.
2. **S15/S16 commit split** — confirm the intended boundary: does S15 commit-and-S16-reviews-the-result, or S15-stages-previews-and-S16-commits? PRD:646/1207 ("nothing imports without review/approval") argues for the latter; current code commits at S15. (PRD Open Question — not listed in §23 but implied.)
3. **Connector "Connect" without immediate pull** — for Notion/Drive/Slack in S15, is a "Connected" state (creds stored) sufficient, or must data pull happen in-onboarding (requires net-new `POST /api/connectors/:id/sync`, §16.9 MISSING)? Maps to PRD §23 Q4 ("which connectors/MCPs are real in v1 vs seeded/mock").
4. **Two-surface reconciliation** — should the post-onboarding harvest surface stay in `MemoryApp → Harvest tab`, or be promoted to the PRD's Memory Center "Sources" tab (PRD §12.4 tabs include "Sources")? Affects where the shared component lives.
5. **`no_real_embedder` UX** — block import, warn-and-proceed, or prompt for an embedding key inline? (Cognify/wiki silently skip today; semantic recall degrades.)
