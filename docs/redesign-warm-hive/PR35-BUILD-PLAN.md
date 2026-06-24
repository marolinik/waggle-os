# Warm-Hive PR3.5 — Memory-Trust Build Plan

> Synthesized from the 5 recon files in `docs/redesign-warm-hive/pr35-recon/` (01–05),
> all verified on branch `feature/warm-hive-pr3` @ `dac7b696`, 2026-06-16.
> This plan has two halves: **Part 1** = the `frame.source` projection (the keystone
> enabler), **Part 2** = the screen-19 Memory-Trust UI, built in phases on top of it.
>
> Repo root: `D:/Projects/waggle-os`. Substrate: `packages/hive-mind-core/src/mind/`.
> Server: `packages/server/src/local/routes/`. UI: `apps/web/src/`.
>
> **No-fabrication contract (inherited from PR3):** confidence, freshness, and trace-reason
> are the three places this PR could silently invent data. The plan gates each one off
> (PR3 streak pattern) wherever the substrate does not hold a real value. See §3 + §5.

---

## Part 1 — `frame.source` projection (the keystone enabler)

The ⬡ provenance pill on Chat + Workspace is blocked by one missing column in two read
paths. Recon 01 maps the FE-facing path (the `/context` route → `WorkspaceBriefing`); recon
02 maps the SSE step path. The DDL column already exists and is NOT NULL DEFAULT — **no
migration, no DDL change, no backfill.** This is a pure read-side projection.

### 1.1 The column (no change — context only)

`packages/hive-mind-core/src/mind/schema.ts:56-57` —
`source TEXT NOT NULL DEFAULT 'user_stated' CHECK (source IN ('user_stated','tool_verified','agent_inferred','import','system'))`.
Persisted rows only ever hold these **5** values (the TS `FrameSource` union at
`frames.ts:25` is wider — `personal|workspace|team_sync` are search-time mind labels that
fail the CHECK and never persist). The FE owns the label/icon map for the 5 values; the
route returns the raw string.

### 1.2 Workspace Briefing path — REQUIRED (the FE pill keystone)

**File A — `packages/server/src/local/routes/workspaces.ts`** (`GET /api/workspaces/:id/context`, handler @ `:364`)

Ordered edits:

1. **`:376`** — widen the `let recentMemories` local from
   `Array<{ content: string; importance: string; date: string }>` →
   `Array<{ content: string; importance: string; source: string; date: string }>`.
2. **`:377`** — widen the `let recentDecisions` local from
   `Array<{ content: string; date: string }>` →
   `Array<{ content: string; source: string; date: string }>`.
   *(Skipping 1+2 makes the server `tsc` fail against the narrower locals — and `npm run build` does NOT typecheck the sidecar, so this only surfaces under the §1.4 server tsc.)*
3. **`:393-400`** — `recentMemories` SELECT: add `source` to the column list and to the
   `as Array<{...}>` cast → `SELECT content, importance, source, created_at FROM memory_frames …`.
4. **`:402-406`** — `recentMemories` `.map()` projection: add `source: f.source,`.
5. **`:409-417`** — `recentDecisions` SELECT: add `source` to the column list and cast →
   `SELECT content, source, created_at FROM memory_frames …`.
6. **`:419-429`** — `recentDecisions` `.map()` returned object: add `source: f.source,`.

(Exact before/after blocks are in recon 01 §2a/§2b — copy them verbatim.) Purely additive;
no existing consumer breaks.

**File B — `apps/web/src/lib/types.ts`** (interface `WorkspaceContext`, `:248-249`)

7. Widen both inline item shapes with an **optional** `source?`:
   - `recentDecisions?: Array<{ content: string; source?: string; date: string }>;`
   - `recentMemories?: Array<{ content: string; importance: string; source?: string; date: string }>;`
   - Keep `source` optional so pre-PR3.5 sidecars still typecheck and the FE degrades to
     "no pill" when absent.

**Consumer (no type change, render only) — `apps/web/src/components/os/WorkspaceBriefing.tsx`**

8. `recentMemories` rendered at `:186-197` (importance badge `:189-193`) and `recentDecisions`
   at `:164-178`. Swap the bare mono date `<div>` for
   `<ProvenanceLine source={m.source} when={m.date} onClick={…} />` **only when `m.source` is
   present**; otherwise keep PR3's bare date `<div>` (the date-only fallback — never a
   fabricated source). This is the same affordance PR3 already left hooked.

**DO NOT TOUCH — the parallel system-prompt builder.** `workspace-context.ts` /
`workspace-state.ts` (`buildWorkspaceState` → `WorkspaceNowBlock`) feeds the **system
prompt**, not the FE pill, and its `StateItem.source` is a *different* axis
(`memory|session|awareness`). Adding `frame.source` there is out of scope and would collide
on the `source` name (recon 01 §4). *(Note: recon 05 §7 names `workspace-context.ts:283-284`
as "the" projection gap — that is the system-prompt path; the FE pill keystone is the
`workspaces.ts` `/context` route in recon 01. They are different routes; for PR3.5 the FE
pill, do File A above, not `workspace-context.ts`.)*

### 1.3 SSE step path — DECISION: **project on `auto_recall` only, paired with the recallMemory widen** (recon 02)

Recon 02 verdict: **NEEDS-WIRING, not trivially projectable.** A streamed `step` carries
`{ content: string }` only; the agent loop exposes `onToolUse/onToolResult(name,input,result)`
with no frame/source; the real `source` is destroyed when `recallMemory()` flattens frames to
`string[]` text (`orchestrator.ts:453-457`).

**Project-or-defer decision:**
- **Blanket "source on every step" is WRONG by design** — generic steps (bash, drafting,
  budget) have no provenance; stamping them is fabrication (PR3's refused move).
- **Only the memory-recall step (`auto_recall`) has genuine provenance.** Wiring it is
  in-scope for PR3.5 **iff paired with the `recallMemory` return-shape widen**. If we want to
  stay server-light this arc, **DEFER** the SSE step pill and keep PR3's "render the affordance,
  never fabricated provenance" stance — the Chat ActivityStream already gates on
  `s.provenance` presence, so nothing breaks.

**Recommended for PR3.5: do the `auto_recall` slice** (it is the honest, load-bearing one and
the same "frame.source 1-field projection" the S2 handoff named). The 5 edits / 4 files:

1. **`packages/agent/src/orchestrator.ts:453-457`** (load-bearing) — widen `recallMemory()`
   return to carry per-snippet provenance, e.g. add
   `recalledFrames?: Array<{ text: string; source: FrameSource; sourceUrl?: string; when?: string }>`
   alongside the existing `recalled: string[]`. Frame objects with `.source` are already in
   hand inside `recallMemory` — this is "stop flattening it", not a new query.
2. **`packages/server/src/local/routes/chat.ts:780-781`** — emit `source`/`provenance` on the
   `auto_recall` step or its `tool_result` (`{ content, provenance?: { source, when } }` is
   additive, backward-compatible).
3. **`apps/web/src/lib/types.ts:474-479`** — add optional `provenance?: { source: string; when?: string }`
   to `StepContentBlock` (and tolerate it in `StreamEvent.data` handling, `:616-619`).
4. **`apps/web/src/hooks/useChat.ts:152`** — carry `data.provenance` onto the pushed step block.
5. **`apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx:30-33`** — project
   `s.provenance` into `ActivityStep` (the `ActivityStream`/`ProvenanceLine` path already
   gates on presence; remove only the part of the omitted-provenance comment that no longer
   holds). Leave all non-memory steps provenance-less by design.

### 1.4 Verification (Part 1)

```bash
# server route typecheck — REQUIRED; npm run build skips the sidecar (runs via tsx transpile-only)
npx tsc --noEmit --project packages/server/tsconfig.json
# agent (only if §1.3 done — recallMemory widen)
npx tsc --noEmit --project packages/agent/tsconfig.json
# FE typecheck — use the app tsconfig directly (the workspace alias is a silent no-op)
npx tsc --noEmit -p apps/web/tsconfig.app.json
npm run test -- --run            # FE unit + touched server suites
npm run lint
```
Live check: open a workspace with seeded memories → Chat + Workspace Overview render the ⬡
pill on rows that have a `source`; rows without a source show the bare date (no fabricated
pill). Console: 0 errors.

---

## Part 2 — Memory-Trust (screen 19), phased

Target screen: `docs/design_handoff_waggle_app/design-files/screens/memory-trust.html`
(authoritative mock, 1:1 token match to PR3's warm tokens per recon 04 §8 — no remapping).
Two view modes behind a segmented control: **A "Manage memory"** (default) and **B "Why did
you do that?"**. The standalone host is `MemoryCenterApp.tsx` (screen 19 extends/replaces it);
the reusable core `memory/MemoryCenterTab.tsx` is shared by the Workspace Memory tab — change
once, both update (recon 03).

> **Reuse, don't rebuild:** `ConfidenceBadge`, `EvidenceChip`, `DetailDrawer`, `EvidencePanel`
> already exist in `components/ui/` (commit `afe96355`, pre-PR3) and ship today via Memory
> Center. The new warm atoms are only the 4 listed in §4.

### Phase 0 — Primitives (new warm atoms + token decision)

**Files to create** (`apps/web/src/components/os/warm/`, export from `warm/index.ts:7-20`):
- `ConfidenceRing.tsx` — the §5a 38px ring (see §4).
- `ConfidenceBadge` decision: the existing `ui/confidence-badge.tsx` uses the Hive DS
  `--sem-*` family; the warm screen wants `--healthy/--attention/--risk`. **Token-family
  decision (founder call, see §5):** align new Memory-Trust confidence atoms to the **warm
  `--sem-*`→band** mapping the screen 19 mock uses (green ≥85 / honey ≥60 / terracotta <60),
  OR reuse `ui/ConfidenceBadge` if its `--sem-*` bands render acceptably. Default
  recommendation: build `ConfidenceRing` against warm tokens (matches the mock exactly),
  reuse `ui/ConfidenceBadge` where a pill (not a ring) is wanted.
- `EvidenceChip` for the trace: reuse `ui/evidence-chip.tsx` (recon 03). Only build a thin
  `TraceEvidenceChip` wrapper if the §6b `.ev` chip needs the multi-segment
  `confidence X% · source · when · still fresh` format.
- `DetailDrawer`: reuse `ui/detail-drawer.tsx` (recon 03) for the memory-detail open.

**Files to modify:** `ProvenanceLine.tsx` — extend to optionally render the §5b 3-segment
form `⬡ <id> · source: <src> · ● <freshness>` (add a `source:`-prefix variant + a `●`
freshness segment colored healthy/attention). Today it renders `⬡ source · when` only.

**Tokens/primitives reused:** all `--honey/--healthy/--attention/--risk/--intel` + washes +
`--r-lg 18px`/`--r-xl 26px` + JetBrains Mono/Hanken already defined in both themes
(`index.css:162-168` dark / `:298-304` light). `HexAvatar`, `SectionLabel`, `DotLive`,
`RunChip`/chip patterns already exist.

**Data:** none (pure presentational atoms).

### Phase A — Header / segmented control + editorial hero + stat bar

**Files to create/modify:**
- New `MemoryTrustApp.tsx` (or extend `MemoryCenterApp.tsx`) hosting the §1 sticky `.controls`
  bar: eyebrow `Memory Trust · view`, 2-button segmented switch (`Manage memory` default-on
  honey-fill `#1a1407` ink | `Why did you do that?`), swapping `.vlabel`, theme toggle.
- §2 editorial hero per view (honey eyebrow + 28px/650 H1 with honey non-italic `<em>` accent
  + 64ch body with bold `--text-2` spans). Verbatim copy in recon 04 §2.
- §3 stat bar (View A): 4 cards `repeat(4,1fr)`→2-col @820px.

**Primitives/tokens:** `SectionLabel` for eyebrows; honey-fill segment = `.seg button.on`
treatment (`background:var(--honey); color:#1a1407`); warn cards use the
`--attention`/`color-mix` border per recon 04 §3.

**Data — REAL vs route-needed:**
- Stat #1 "Memories in this hive" (`142`) — **REAL**, from `GET /api/memory/stats` (counts
  only, mind-isolation honored).
- Stat #2 "High confidence & fresh" (`128`) — **DERIVABLE/PARTIAL**: confidence is sparse
  (harvest-only), freshness is derivable from `created_at`. **If confidence is absent for the
  mind, gate this card off** (show "—" or hide), do not invent a count. See §3.
- Stat #3 "Stale · worth a review" (`9`) — **DERIVABLE** from `created_at` via
  `computeTemporalScore` (FE compute or thin route).
- Stat #4 "Awaiting your confirm" (`3`) — **needs route**: `GET /api/memory?status=unreviewed`
  (filter already works, `memory-center.ts:198`) — but nothing *writes* `unreviewed` today, so
  the count may legitimately be 0. Wire to the real query; do not seed a fake number.

### Phase B — Search + filters (View A toolbar)

**Files to modify:** the §4 `.toolbar` inside `MemoryTrustApp` — search input (placeholder
`Search what Waggle knows… or ask it to forget something`) + 4 filter chips (`All` on /
`Stale` / `Needs confirm` / `Forgotten`).

**Primitives/tokens:** active chip = `--honey-wash` fill + `--honey-line` border (recon 04 §4);
reuse warm chip pattern.

**Data — REAL vs route-needed:**
- Search → `GET /api/memory?mind&q&kind&status&minConfidence&limit` (`memory-center.ts:167`) —
  **REAL**.
- `Stale` filter → **DERIVABLE** client-side over returned `created_at`.
- `Needs confirm` filter → `GET /api/memory?status=unreviewed` — **REAL query** (may return 0).
- `Forgotten` filter → **no tombstone exists** (forget is a hard delete, `frames.ts:321`).
  **Gate this chip off** or relabel — there is no "forgotten" list to show. See §3.

### Phase C — Memory rows (confidence ring + provenance + forget/correct/confirm/stale)

**Files to create/modify:** the §5 `.mem` row component (3-col `[conf ring] [body] [actions]`),
rendered into `.mems` grid. Reuse the `memory/MemoryCenterTab.tsx` + `MemoryCard.tsx` pattern
(already consumes `DetailDrawer`/`ConfidenceBadge`/`EvidencePanel`); add the warm row treatment.

**Primitives/tokens:** new `ConfidenceRing` (§4); extended `ProvenanceLine` (3-segment §5b);
corrected banner = `--healthy-wash`; stale banner = `--honey-wash`+`--honey-line`; disputed =
`--risk` border + strikethrough; danger-forget hover = `--risk` (recon 04 §5).

**Data — REAL vs route-needed:**
- Row content / id / source → **REAL** (from `/api/memory` `Memory` shape).
- **Forget** button → `DELETE /api/memory/:id?mind=…` — **REAL, no new backend** (hard delete +
  audit event). Row animates out then removed.
- **Correct / edit** button → `PATCH /api/memory/:id` (content + reclassify) — **REAL, no new
  backend**.
- **Confidence ring** → `Memory.confidence`, **only present on harvested frames**. **Hide the
  ring (or show a neutral "—" state) when `confidence` is undefined** — never default a number.
  See §3.
- **Freshness `●`** → **DERIVABLE** from `created_at` (`computeTemporalScore`, 7-day boost /
  30-day half-life). Present as honest age ("aging — last seen 6w ago"), never a stored %.
- **Stale banner / "Still true?"** → derivable trigger; **Confirm** action → **MUST-BUILD
  route** `POST /api/memory/:id/confirm` (set `metadata.status='active'`, mirroring
  `/archive` at `memory-center.ts:355`). Cheap; the `MemoryStatus` rails exist.

### Phase D — "Why did you do that?" trace (View B)

**Files to create/modify:** the §6 `.trace` card — `HexAvatar` header (`trace #a1f9`), 4-node
connector chain (Goal→Recalled 3→Cross-checked→Acted; dots intel/honey/honey/healthy; evidence
chip `confidence 94% · source: chat · Tue · still fresh`), 3-button footer (Looks right / That
memory is wrong → correct it / Forget #M-204 & redo). Shared trust-principle footnote + green
slide-up toast on both views.

**Primitives/tokens:** `HexAvatar`, `DotLive`, reused `EvidenceChip`; connector line per §6b;
footer go-button honey-fill / ghost / danger per §6c.

**Data — REAL vs route-needed (the honest hard part):**
- Trace store is **rich and populated for chat** (`execution_traces` + `TraceRecorder` per
  turn, `chat.ts:1277-1424`): reasoning[], toolCalls[], outcome, cost, tokens.
- **GAP 1 — chat traces aren't addressable by the agent-traces route.** `GET /api/agents/:id/traces`
  (`agents.ts:469`) filters by the `agent:{id}` tag, but chat `start()` does NOT pass
  `tags:['agent:…']` (`chat.ts:1279-1285`). Fix = either add the `agent:` tag at chat
  `start()`, OR add a thin `GET /api/sessions/:id/traces` reading
  `traceStore.queryParsed({ sessionId })` (store already supports it, `execution-traces.ts:328`).
- **GAP 2 — no frame↔trace backlink.** Nothing links a `memory_frame` to the
  `execution_trace` that produced it (no `trace_id`). So **per-frame "why is THIS memory here?"
  is MUST-BUILD** (add `trace_id` to frame metadata at write time + a `GET /api/memory/:id/trace`
  resolver). For PR3.5 the **honest, cheap win is a session/turn-scoped trace view** (the real
  reasoning + tool calls), NOT a per-frame reason. **Do NOT synthesize a "reason" string for a
  frame with no linked trace.** If neither route lands this arc, View B renders against a real
  recent session trace or is gated behind "no trace yet" empty state — never fabricated.

### Phase verification (each phase)
Run the §1.4 gate after each phase; live-smoke the screen in dark + light with 0 console
errors before moving on (matches PR3's shipping bar).

---

## 3. Honest data gaps (recon 05)

| Feature | REAL / DERIVABLE / MUST-BUILD | Plan |
|---|---|---|
| **source** (provenance class) | REAL (`memory_frames.source`) | Project per Part 1; FE owns the 5-value label map. |
| **forget** (delete) | REAL (`DELETE /api/memory/:id`, hard delete + audit) | Wire button straight to it. No backend. |
| **correct** (edit) | REAL (`PATCH /api/memory/:id`) | Wire edit/correct to it. No backend. |
| **freshness / staleness** | DERIVABLE (`computeTemporalScore` over `created_at`, 7d boost/30d half-life) | FE compute or thin helper. **Present as honest age, never a stored "%".** |
| **confidence** | PARTIAL (metadata blob; **harvest-only**, `undefined` for curated/agent/quick-capture frames) | **Show ONLY when present; hide the ring/badge when `undefined`. NEVER default a number** (PR3 streak-gate pattern). Stat #2 gated off if absent. |
| **confirm / needs-confirm / verified** | MUST-BUILD (no per-frame confirm lifecycle; `unreviewed` never written) | Add cheap `POST /api/memory/:id/confirm` (set `metadata.status`), mirror `/archive`. Queue = `?status=unreviewed`. **Do NOT show "verified ✓" unless `source==='tool_verified'` or status explicitly set.** |
| **per-frame "why?" trace** | MUST-BUILD backlink (no `trace_id` on frames); session/turn trace is DERIVABLE | Ship session/turn-scoped View B from real traces (add `agent:` tag or `/api/sessions/:id/traces`). **Never synthesize a reason for an unlinked frame.** |
| **"Forgotten" filter** | NO DATA (hard delete = no tombstone) | **Gate the chip off / relabel** — there is no forgotten list. |

**Fabrication-risk flags (gate off, do not invent — PR3 streak precedent):**
1. **Confidence** when undefined → hide ring, don't default.
2. **Freshness** → age, never a stored decay %.
3. **Per-frame trace reason** → only when a real linked trace exists.
4. **"Forgotten" list** → no tombstone; gate off.
5. **Stat-card numbers** → drive from the real query; a real 0 is honest, a fake `3`/`9`/`128` is not.

---

## 4. New primitives to build (recon 03 confirmed: 3 already exist — REUSE)

**Already exist in `components/ui/` (pre-PR3, commit `afe96355`) — do NOT rebuild:**
`ConfidenceBadge`, `EvidenceChip`, `DetailDrawer`, `EvidencePanel`. The handoff's claim they'd
be in `os/warm/` was a location error — they ship today via Memory Center.

**Genuinely new warm atoms for screen 19** (one-line spec each):

- **`ConfidenceRing`** — 38px circular ring; number + 2px border both colored by band (≥85
  `--healthy` / ≥60 `--attention` / <60 `--risk`); `CONF` mono caption beneath; **renders the
  "no value" neutral state when `confidence` is undefined** (no fabricated number).
- **`ProvenanceLine` (extend, not new)** — add the §5b 3-segment form
  `⬡ <id> · source: <src> · ● <freshness>` (`source:`-prefix variant + `●` freshness segment
  colored healthy/attention); keep the existing `⬡ source · when` form + `onClick` → button.
- **`TraceEvidenceChip`** (thin wrapper over `ui/EvidenceChip`) — multi-segment trace chip
  `confidence X% · source · when · still fresh` in `--surface`/`--line-soft`, `.src` refs mono
  `--intel`; only if the plain `EvidenceChip` can't render the multi-segment string directly.
- **`DetailDrawer` (reuse)** — already exists; opened from a clickable memory row for the full
  memory detail (confidence/source/evidence/edit). No new build.

*(Net new code: `ConfidenceRing` + the `ProvenanceLine` extension; optional `TraceEvidenceChip`.)*

---

## 5. Risks & open questions for the founder

1. **SSE step pill — do it now (auto_recall slice) or defer?** Recon 02: in-scope only if
   paired with the `recallMemory()` return-shape widen (`orchestrator.ts:453-457`). If we want
   PR3.5 frontend-light, defer and keep PR3's affordance-only stance. **Recommend: do the
   `auto_recall` slice** (honest, load-bearing). Founder call on scope/budget.

2. **Token-family decision (recon 03 §1b):** warm `--intel` (provenance) vs Hive DS `--sem-*`
   (confidence bands) currently coexist. Screen 19's confidence rings use warm
   `--healthy/--attention/--risk`. Confirm: build `ConfidenceRing` against warm tokens and let
   `ui/ConfidenceBadge` keep `--sem-*`, or unify? Default: warm tokens for the ring (matches
   the mock 1:1).

3. **Confirm route + status writer.** `POST /api/memory/:id/confirm` is cheap, but nothing
   writes `unreviewed` today, so the "Awaiting your confirm" queue may legitimately be empty.
   Is that acceptable for launch (real-but-empty), or do we also wire the harvest-commit path
   to stamp `unreviewed` (larger)?

4. **Per-frame "why?" backlink.** True per-memory trace needs a `trace_id` on frame metadata
   at write time + a resolver (MUST-BUILD). For PR3.5, accept a **session/turn-scoped** View B
   (real traces, not per-frame)? Or invest in the backlink this arc?

5. **"Forgotten" filter has no data** (hard delete, no tombstone). Gate the chip off, relabel,
   or add a soft-delete tombstone (scope creep)? Recommend: gate off for now.

6. **Two-mind scope for screen 19.** `MemoryCenterApp` is two-mind (personal/workspace) and
   the Workspace Memory tab shares `MemoryCenterTab`. Does screen 19 replace `MemoryCenterApp`
   wholesale, or layer the Trust view as a new view alongside the existing 7
   (`memories·timeline·graph·harvest·weaver·wiki·evolution`)? Affects blast radius.
