# Gap Card — S16 Memory Review

> Screen 16 in the UX-refactor blueprint deck. Onboarding step 5 ("Memory Review — approve
> before importing") AND the standing low-confidence review queue (Journey J08). Execution
> model is LOCKED: in-place incremental refactor of `apps/web` + targeted backend extension.
> Every claim below is grounded in repo source.

---

## 1. Screen & purpose

**Purpose (PRD §12.12 step 5; Blueprint screen 16, line 392-399):** the **trust gate before
memory becomes active**. After the user connects/imports sources (S15 Memory Import), Waggle has
parsed-but-not-committed items. S16 lets the user *review what was found, by category, with source
and confidence, and explicitly approve (or edit/skip) before anything is written to active memory.*

- Blueprint mental model (line 55-57): the **Understand** layer "classify, deduplicate, extract
  entities, map relationships and **score confidence**" — "Memory Review shows categories, source
  and confidence."
- Two entry points, same surface:
  1. **Onboarding** (J01 First-time setup): `… → Memory Import → Memory Review → Workspace Creation`.
  2. **Standing low-confidence queue** (J08): `Home alert → Memory Review queue → inspect evidence
     → approve/edit/reject` so "uncertain memory does not silently influence work."
- Mockup (`screen_16_memory_review.png`, directional only): header "Review before importing";
  5 category stat tiles **Memories 342 / Decisions 56 / Tasks 32 / Artifacts 41 / Projects 17**;
  a category-tabbed table (Memories | Decisions | Tasks | Artifacts | Projects) of rows with
  Content / Type / Source / Confidence columns; search + Filters; right rail "Import summary"
  (per-category counts), "Top sources" (Claude/ChatGPT/Google Docs/Notion with item counts), and
  a "Confidence guide" legend; footer actions **Back / Skip for now / Edit selections /
  Approved & import ABS items**.

**PRD acceptance criteria win over pixels (§24).** The load-bearing ACs:
- §12.12: "Nothing imports without explicit review/approval."
- Blueprint S16 acceptance: "Trust gate before memory becomes active."
- J08: "Uncertain memory does not silently influence work."

---

## 2. Required states (PRD / Blueprint)

Blueprint S16 states (line 396-397) + onboarding row (line 474-476):

| State | Meaning |
|---|---|
| **Empty** | No items found / nothing to review (source had no recognizable content). |
| **Preview found** | Parsed items shown, grouped by category, awaiting approval. |
| **Low confidence** | Subset surfaced as uncertain — must be inspectable (evidence) and individually approve/edit/reject (J08). |
| **Source error** | A source failed to parse/connect; offer retry-source. |
| **Approved** | User approved; commit runs (progress) → items become active memory. |
| **Import partial** | Onboarding state: some sources imported, some failed/skipped. |

Required **interactions** (line 394-395, 476): Filter, expand (inspect evidence), **edit selection**,
**approve import**, skip, **back**, **retry source**.

---

## 3. Current state in repo

**Disposition: `rework` (frontend) + `partial` (backend).** A trust-gate preview→commit flow EXISTS
in two places but neither delivers the categorized, per-item-confidence, per-item-selectable review
the screen requires. The existing surfaces are a *thin preview list + commit-all*, not a review gate.

### 3a. Onboarding ImportStep (the closest match to S16)
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx` — step index 3 is "memory-import"
  (`STEP_NAMES` `:35`). It calls `adapter.harvestPreview(data, source)` and stores
  `result.preview` (`:163-164`), then `adapter.harvestCommit(data, source)` on approve
  (`:168-177`), then auto-advances to the template step. **There is no separate "Memory Review"
  step** — preview and commit are folded into the single ImportStep.
- `apps/web/src/components/os/overlays/onboarding/ImportStep.tsx` — renders a flat
  `importPreview.slice(0,10)` list (`:125-155`) with one "Import N items" button. **No category
  tiles, no per-item Type/Source/Confidence columns, no per-row selection, no evidence expand, no
  source-error/low-confidence states.** Just "preview found → commit all → Memories imported!".
- `STEP_NAMES`/dots are hardwired to 8 steps (`:35`, dots `:472`). Inserting a dedicated Review step
  shifts the step indices (template/persona/api-key/ready are `4/5/6/7`) — a refactor touch-point.

### 3b. MemoryApp HarvestTab (post-onboarding harvest surface)
- `apps/web/src/components/os/apps/memory/HarvestTab.tsx` — the richer harvest UI: connected-source
  chips, Claude Code auto-detect, SSE progress, resume banner. Its `PreviewResult` interface
  (`:28-33`) is `{ source, itemCount, types: Record<string,number>, preview: {id,title,type}[] }`.
  `types` gives a **per-`type` count map** (the seed for category tiles) but `preview` is capped at
  10 items, carries **no confidence**, and commit is **all-or-nothing** (no selection).
- Reached today via `MemoryApp.tsx:272` (`<HarvestTab />`, the "Harvest" tab).

### 3c. Backend preview/commit contract (what the UI can rely on)
- `packages/server/src/local/routes/harvest.ts`:
  - `POST /api/harvest/preview` (`:221-236`) returns `{ source, itemCount, types: countByField(items,'type'),
    preview: items.slice(0,10).map(i => ({id,title,type,source})) }`. **No confidence field; first-10 only.**
  - `POST /api/harvest/commit` (`:243`+) parses with the adapter and writes **every** item as a raw
    frame: `FrameStore.createIFrame('harvest', label+content, 'normal', 'import', ts)` (`:403-409`).
    **No selection input, no confidence, no per-item categorization beyond the adapter's `type`.**
- `adapter.harvestPreview/harvestCommit` (`apps/web/src/lib/adapter.ts:1684-1692`) — both typed `any`,
  signature `(data, source)`. No `selectedIds`/`approve` params exist.
- **The 4-pass `HarvestPipeline` (classify→extract→synthesize w/ `confidence` + dedup/contradiction
  flags) EXISTS but is NOT called by the commit route** (backend-map `05c` §3, §4, line 7, 110,
  117). `DistilledKnowledge.provenance.confidence` is produced only inside that unused pipeline.
  So **the confidence + categorization data the mockup shows has no production producer today** —
  this is the central backend gap (see §5).

**Net:** the *trust-gate intent* (preview before commit, nothing imports without consent) is partly
honored; the *categorized, confidence-scored, per-item-approvable review surface* the screen
specifies is **not built**.

---

## 4. Frontend work

Create a real Review surface usable from BOTH onboarding and the standing J08 queue.

### Components to create
- **`overlays/onboarding/MemoryReviewStep.tsx`** (NEW) — onboarding step 5. Replaces the inline
  preview block currently embedded in `ImportStep.tsx`. Renders the full review layout.
- **`apps/web/src/components/os/apps/memory/MemoryReview.tsx`** (NEW, shared) — the reusable review
  panel (category tiles + tabbed table + right rail + footer actions). Both the onboarding step and
  a Memory-app "Review" surface mount this so there is ONE review implementation.
- **`components/os/apps/memory/review/`** sub-parts (small files per CLAUDE.md file-org rule):
  `CategoryStatTiles.tsx`, `ReviewTable.tsx` (Content/Type/Source/Confidence cols + row checkbox +
  expand-for-evidence), `ImportSummaryRail.tsx` (per-category counts + Top sources + Confidence
  guide legend), `ReviewFooter.tsx` (Back / Skip / Edit selections / Approve & import N).

### Reuse targets (do not rebuild)
- `ContextMenu.tsx`, `components/ui/{table,tabs,checkbox,badge,input,scroll-area,skeleton}.tsx`
  (shadcn set per frontend inventory §e) for the table/tabs/empty/loading states.
- `ContextRail.tsx` (`overlays/ContextRail.tsx`, exports `ContextRailTarget`) as the evidence/inspect
  pattern for "expand → inspect evidence" (J08) rather than inventing a new evidence panel.
- HarvestTab's SSE progress wiring (`/api/harvest/progress`, phases saving/cognifying/wiki-compile)
  for the "Approved → importing" state — lift the subscription into the shared panel.
- Color semantics from Blueprint design system (line 485): green=healthy/high-confidence,
  orange=attention/low-confidence, red=risk/error — map to existing Hive DS semantic tokens
  (no `hive-950` literals; tokens in `waggle-theme.css`).

### Props / state (shared `MemoryReview`)
```ts
interface ReviewItem {
  id: string; title: string; content: string;
  kind: MemoryKind;          // mapped from ImportItemType (see §6)
  source: ImportSourceType;  // for the Source column + Top-sources rail
  confidence?: number;       // 0-100; undefined until backend produces it (see §5)
  selected: boolean;         // default true for high-confidence, false/uncertain otherwise
  evidence?: string[];       // for the expand/inspect row
}
interface MemoryReviewProps {
  mode: 'onboarding' | 'queue';
  items: ReviewItem[]; loading: boolean; error?: string;
  onApprove: (selectedIds: string[]) => Promise<void>;  // → harvestCommit w/ selection
  onSkip: () => void; onBack?: () => void;
  onRetrySource?: (source: ImportSourceType) => void;
}
```
- Local state: per-category selection, search query, active category tab, expanded-row id.
- `selected` semantics enforce the AC: low-confidence rows start **unselected** so nothing uncertain
  imports silently (J08).

### Adapter / hook changes
- Extend `adapter.harvestCommit` to accept an optional `{ selectedIds }` (or `approvedIds`) param;
  type the preview response properly (drop `any`): `HarvestPreview { source; itemCount;
  types: Record<MemoryKind, number>; items: ReviewItem[] }` — note the preview must return **all**
  items (or paginate), not `slice(0,10)`, for a real review (see §5).
- NEW hook `useMemoryReview(source, data)` (or fold into a `useHarvest` hook) owning preview fetch +
  selection state + commit; consumed by both mount points.
- Onboarding `STEP_NAMES`/dots/`progressPct` in `OnboardingWizard.tsx` must add the Review step
  (8→9 steps OR split import/review and re-key 4-7). Update `displayStep`, dot array (`:472`),
  Back-button range (`:444`), and the `goToStep(4)` auto-advances in `handleImportCommit`/
  `handleClaudeCodeHarvest` to land on Review, not Template.

---

## 5. Backend work

### PRD §16.5 Harvest endpoints
| PRD §16 endpoint | Status | Extend vs net-new / substrate |
|---|---|---|
| `POST /api/harvest/preview` | **EXISTS (extend)** | `harvest.ts:221`. Today returns `types` + first-10 `preview` with **no confidence** and **no full item list**. EXTEND to (a) return **all** items (or `?limit/offset` paging) and (b) attach a per-item `confidence` + normalized `kind`. Substrate: `UniversalImportItem` (already carries `type`); confidence must come from a classifier (see below). No `.mind` migration for preview (in-memory parse). |
| `POST /api/harvest/commit` | **EXISTS (extend)** | `harvest.ts:243`. Today commits **all** parsed items. EXTEND body to accept `{ selectedIds?: string[] }`; when present, filter `items` before the `createIFrame` loop (`:382-409`). Honors the trust-gate AC ("nothing imports without approval"). Substrate: writes to `memory_frames` in personal.mind via `FrameStore.createIFrame` — unchanged shape, just a filtered set. |
| `GET /api/harvest/sources` | **EXISTS** | `harvest.ts` (`HarvestSourceStore`). Powers the right-rail "Top sources" + connected-source chips. |
| `POST /api/harvest/sources/:id/sync` | **PARTIAL** | No per-source `/sync` route (backend-routes.md §16.5; grep-confirmed absent). Sync today = `POST /api/harvest/commit`. Add a thin `/sources/:source/sync` that resolves the registered source + re-runs commit. NOTE PRD path uses `:id`; current sources are keyed by `:source` **name** (`DELETE/PATCH /api/harvest/sources/:source`) — keep the name key or alias. Net-new thin route, no new substrate. |

### Confidence + categorization (the real backend gap — implied addition to §16.5)
The mockup's **Confidence column / Confidence guide / low-confidence queue (J08)** and the **5
category tiles** have **no production producer**:
- `memory_frames` has **NO `confidence` column** (substrate-types §c, line 137: confidence exists
  only on `knowledge_relations.confidence`). Frames are written `importance='normal', source='import'`.
- The classifier that yields `{categories, value, confidence}` is the unused `HarvestPipeline`
  (Pass 1 Classify Haiku + Pass 3 Synthesize → `DistilledKnowledge.provenance.confidence`),
  bypassed by the commit route (05c line 7).
- Category counts beyond the adapter's raw `type` (8 `ImportItemType` values) require a
  classify step; the adapter `type` alone gives a coarse grouping but not the mockup's
  Memories/Decisions/Tasks/Artifacts/Projects taxonomy 1:1.

**Decision needed (Open Q):** to deliver real confidence, the refactor must either
(a) wire `HarvestPipeline`'s classify/synthesize into a **preview-time** scoring pass (cost: Haiku/
Sonnet LLM calls per import — slow + paid; gated on a real embedder/key), or
(b) ship a **cheap heuristic confidence** at preview time (source-trust × adapter-type × dedup
signal) and reserve LLM scoring for an opt-in deep pass. Given onboarding latency budgets, (b) is
the pragmatic v1; (a) for the standing J08 queue.

**`.mind` migration flag:** if confidence becomes a queryable/filterable frame property (Filters in
the mockup; J08 "low-confidence review queue" off Home), add a nullable `metadata TEXT DEFAULT '{}'`
column to `memory_frames` (substrate-types §c line 156-164: the migration runner already does
idempotent `ADD COLUMN` on `memory_frames`; pattern at `mind/db.ts:116-124`) and store
`{kind, confidence, sourceId, status}` there, OR promote `confidence REAL` to a real column if it's
a primary filter axis. **This is the only potential schema migration on this screen.** Preview-only
confidence (not persisted) needs no migration.

### Standing low-confidence queue (J08) backend
- "Home alert → Memory Review queue" needs a way to *list already-imported low-confidence frames*.
  No route exists. Closest: `GET /api/memory/frames` (`memory.ts:188`) + a confidence/status filter.
  This depends on confidence being persisted (above). Implied addition to §16.4 Memory, not §16.5.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`MemoryKind`** (PRD §15.2): MISSING in `apps/web/src/lib/types.ts` (substrate-types §e). FE
  `MemoryFrame.type` exists but mismatches PRD (`event`/`insight` vs PRD `preference`/`strategy`/
  `learning`/`goal`). The review needs a `MemoryKind` union AND a **mapping from the harvest
  `ImportItemType`** (8 values: conversation/memory/instruction/preference/artifact/rule/decision/
  document — 05c §1) to the review categories (Memories/Decisions/Tasks/Artifacts/Projects). That
  map is a new pure helper (`lib/harvest-kind-map.ts`).
- **`Confidence`** (PRD §15.2, 0-100): MISSING. Add the type; add `confidence?: number` to the
  review item shape (and later `MemoryFrame` once persisted).
- **`ReviewItem` / `HarvestPreview`** response types: NEW (replace the `any` on
  `adapter.harvestPreview/harvestCommit`). Mirror the server contract; co-locate or add to
  `lib/types.ts`.
- `ImportSourceType` already documented in 05c (24-value union) — import/re-declare for the Source
  column + Top-sources rail.

---

## 7. Dependencies (screens / phases first)

- **Upstream (must precede):** S15 Memory Import — supplies the `{data, source}` (or connected
  source) that S16 reviews. The `harvestPreview` call + source selection live there.
- **Shares substrate with:** S-Memory Center (§12.4) — the persisted-frame edit/archive/merge +
  the J08 low-confidence queue read from the same `memory_frames` + confidence field. Build the
  confidence-on-frames decision once and reuse.
- **Feeds:** S-Home Cockpit (§12.1) — the "low-confidence review" Home alert (J08) deep-links into
  this surface; needs `/api/home/*` (separate gap) + the persisted-confidence read.
- **Onboarding flow (S-Onboarding):** inserting the Review step re-keys `OnboardingWizard` step
  indices — coordinate with whoever owns the onboarding-flow gap card so step numbering is changed
  once.
- **Phase hint:** core trust-gate (preview-with-selection + commit-selected + cheap heuristic
  confidence) is an **early phase** (it gates onboarding J01, a day-0 flow). The persisted-confidence
  column + LLM classify pass + standing J08 queue are a **later phase** (depend on the Memory Center
  confidence decision).

---

## 8. Effort

**L.** The reusable review panel + onboarding step re-keying + adapter/preview type-tightening +
commit selection are M on their own; the confidence/categorization producer (heuristic v1 now,
optional LLM-classify + possible `memory_frames` metadata migration later) plus the J08 standing
queue push it to **L**. It is NOT XL because no new data store is required — everything writes to the
existing `memory_frames` substrate via `FrameStore`, and the preview/commit routes already exist to
extend rather than build net-new.

---

## 9. Open questions

1. **Confidence source (blocking design):** heuristic-at-preview (source-trust × type × dedup) vs
   wiring the existing `HarvestPipeline` classify/synthesize for real LLM confidence? Latency/cost vs
   fidelity. Recommendation: heuristic for onboarding v1, LLM for the J08 queue. (§5)
2. **Persist confidence?** If "Filters" + J08 queue need to query confidence on already-imported
   frames, we need the `memory_frames` metadata/`confidence` migration. If review is preview-only
   (pre-commit), no migration. Which scope is v1? (§5)
3. **Category taxonomy mapping:** mockup shows Memories/Decisions/Tasks/Artifacts/Projects, but the
   adapter emits 8 `ImportItemType`s and PRD §15.2 `MemoryKind` is a different set. Which is canonical,
   and what is the exact `ImportItemType → category` map (esp. "Projects" — Claude `projects[].docs`
   land as `artifact` items per 05c §2)? (§6)
4. **Per-item edit:** the footer "Edit selections" + interaction "edit selection" — is this just
   include/exclude (checkbox), or inline content/kind editing pre-commit? Pre-commit edit has no
   route today (frames don't exist yet); would need to mutate the in-memory item set before commit.
5. **Onboarding step count:** split Import↔Review into two steps (8→9) or keep one screen with a
   review sub-state? Affects `STEP_NAMES`, dots, progress, and the "Step N" label already softened to
   avoid a fixed total (`OnboardingWizard.tsx:456-467`).
6. **Source-error / retry-source state:** S15 owns connect/parse; does S16 only *display* the partial
   state and offer "retry source" (re-invoking S15's connect), or own retry itself?
