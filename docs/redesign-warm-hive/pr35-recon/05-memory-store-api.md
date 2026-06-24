# PR3.5 Memory-Trust — Real Memory-Store API Surface

> Recon for the warm-Hive PR3.5 Memory-Trust arc. Question: what can the
> Memory-Trust UI wire to **as it exists today**, vs what must be added —
> and what it must **never fabricate**.
>
> Repo: `D:/Projects/waggle-os`. Substrate: `packages/hive-mind-core/src/mind/`.
> Server surface: `packages/server/src/local/routes/`.
> All claims below are quoted file:line. **Brutally honest split: PR3.5 must not invent data the store doesn't hold.**

---

## TL;DR Capability Matrix

| Feature | Verdict | Where the truth lives |
|---|---|---|
| **source** (provenance class) | ✅ **REAL** (stored column) | `memory_frames.source` |
| **forget** (delete) | ✅ **REAL** (store + 2 routes) | `FrameStore.delete()` + `DELETE /api/memory/:id` |
| **correct** (edit content) | ✅ **REAL** (store + 2 routes) | `FrameStore.update()` + `PATCH /api/memory/:id` |
| **freshness / staleness** | 🟡 **DERIVABLE** (compute fn exists; not surfaced) | `computeTemporalScore()` over `created_at` / `last_accessed` |
| **confidence** | 🟡 **DERIVABLE / PARTIAL** (metadata blob; only set at harvest) | `memory_frames.metadata.confidence` (B2 heuristic) |
| **trace** ("why did you do that?") | 🟡 **DERIVABLE** (rich store + 1 route; not per-frame) | `execution_traces` + `GET /api/agents/:id/traces` |
| **confirm / verified status** | 🔴 **MUST-BUILD** (no per-frame confirm concept) | absent — see §4 |

**One-line split:** `source`, `forget`, `correct` are **REAL and route-exposed today**. `freshness`, `confidence`, and `trace` are **DERIVABLE** (the signals exist in the substrate but are not projected onto the Chat/Workspace surfaces, and confidence is only populated on the harvest path). A per-memory **"confirm / needs-confirm / verified"** status is **MUST-BUILD** — it does not exist.

---

## 1. The FRAME shape

Canonical row type — `packages/hive-mind-core/src/mind/frames.ts:27-48`:

```ts
export interface MemoryFrame {
  id: number;
  frame_type: FrameType;           // 'I' | 'P' | 'B'
  gop_id: string;
  t: number;
  base_frame_id: number | null;
  content: string;
  importance: Importance;          // critical|important|normal|temporary|deprecated
  source: FrameSource;             // see below
  access_count: number;
  created_at: string;
  last_accessed: string;
  content_hash?: string | null;    // dedup
  metadata?: string;               // JSON blob (Phase 2B) — provenance/classification
}
```

DDL backing it — `schema.ts:47-73` (`memory_frames`). Every field above is a real
stored column; `metadata` is `TEXT NOT NULL DEFAULT '{}'` (`schema.ts:65`).

Per-field verdict against the requested set:

- **id** — REAL (`frames.ts:28`, PK `schema.ts:48`).
- **content / text** — REAL (`frames.ts:33`, `schema.ts:53`). The field is `content`, NOT `text`.
- **source** — ✅ **REAL stored column.** `frames.ts:25` defines `FrameSource = 'user_stated' | 'tool_verified' | 'agent_inferred' | 'import' | 'system' | 'personal' | 'workspace' | 'team_sync'`. The DB CHECK is narrower — `schema.ts:56-57` only allows `('user_stated','tool_verified','agent_inferred','import','system')` (the `personal/workspace/team_sync` members are search-time mind labels, not persisted provenance — see `memory.ts:41-43`).
- **confidence / score** — 🟡 **NOT a frame column.** No `confidence` or `score` column on `memory_frames`. Two distinct things wear the name:
  - `score` is a **search-time, computed** ranking field added by HybridSearch (returned in `normalizeFrame` at `memory.ts:58`), never stored.
  - `confidence` (0-100) is a **derived metadata field** that rides `memory_frames.metadata` JSON, projected by `normalizeToMemory` at `memory-center.ts:100` (`typeof meta.confidence === 'number' ? meta.confidence : undefined`). It is only **populated on the harvest path** (`harvestConfidence`, see §"confidence" below). Curated/agent/quick-capture writes leave it `undefined`.
  - (`confidence REAL` does exist — but on `knowledge_relations`, `schema.ts:109`, not on frames.)
- **created_at** — REAL (`frames.ts:37`, `schema.ts:59`, default `datetime('now')`).
- **updated_at** — 🔴 **NOT on frames.** The frame table has no `updated_at` column. `identity`/`procedures` tables have one (`schema.ts:20,166`); frames do not. An `updatedAt` is faked into the `metadata` blob on PATCH (`memory-center.ts:336`). The shared `Memory.updatedAt` reads it from metadata (`memory-center.ts:112`).
- **accessed_at / last_used** — REAL: `last_accessed` (`frames.ts:38`, `schema.ts:60`), bumped by `touch()` (`frames.ts:184-191`). `access_count` (`frames.ts:36`) is the use counter.
- **decay / staleness** — 🟡 **NOT stored; DERIVABLE.** No decay column. Decay is a pure compute over timestamps in `scoring.ts` (see §5).
- **type / kind** — split brain:
  - `frame_type` (`'I' | 'P' | 'B'`) is the substrate-internal kind (incremental/patch/branch), REAL (`frames.ts:29`).
  - `importance` (`critical|important|normal|temporary|deprecated`) is the closest stored "salience" axis, REAL (`frames.ts:35`).
  - The product-facing `MemoryKind` (`fact|decision|task|preference|strategy|learning|goal|entity`, `shared/types.ts:354-356`) is **NOT a column** — it rides `metadata.kind`, projected at `memory-center.ts:91`, defaulting to `'fact'` when absent.

**Verdict — {confidence, freshness/recency, source}:**
- **source** → REAL stored field.
- **freshness/recency** → DERIVED (no column; computed from `created_at`/`last_accessed`).
- **confidence** → metadata-blob field, REAL-but-sparse (only harvest sets it); treat as DERIVABLE/PARTIAL for any non-harvested frame.

---

## 2. FORGET (delete) — ✅ REAL

Store: `FrameStore.delete(id): boolean` — `frames.ts:321-334`. Hard delete; cleans up
FTS, vec, KG entity links, and nullifies self-referential FKs. There is **no
tombstone** — it's a real row removal. Also `deleteByContentPrefix` (`frames.ts:343-354`).

Routes that expose it:
- `DELETE /api/memory/frames/:id` — `memory.ts:571-607` (legacy frame-id contract; workspace-first then personal fallback).
- `DELETE /api/memory/:id` — `memory-center.ts:390-411` (bare-id contract, hard delete, `mind`-strict).

Both emit an audit event (`eventType: 'memory_delete'`, `memory.ts:601`, `memory-center.ts:402`).
**Suggested approach:** wire the Memory-Trust "Forget" action straight to `DELETE /api/memory/:id?mind=…`. No new backend.

---

## 3. CORRECT (edit content) — ✅ REAL

Store: `FrameStore.update(id, content, importance?)` — `frames.ts:281-301`. Updates the
row, FTS index, vec index, and maintains `content_hash`. Returns the updated frame.

Routes:
- `PUT /api/memory/frames/:id` — `memory.ts:466-533` (content + importance; XSS-sanitized `memory.ts:483`).
- `PATCH /api/memory/:id` — `memory-center.ts:296-352` (content/importance **and** metadata classification: kind/scope/tags/status/title/evidence; stamps `metadata.updatedAt`).

**Suggested approach:** "Correct this memory" → `PATCH /api/memory/:id`. It already supports
editing content and reclassifying. No new backend.

---

## 4. CONFIRM / "needs confirm" / verified status — 🔴 MUST-BUILD (mostly)

**There is NO per-frame "confirmed / needs-confirmation / verified" concept.** Honest accounting of the near-misses:

- `FrameSource` has a `tool_verified` member (`frames.ts:25`, `schema.ts:57`) — but that's a **provenance class set at write time** (this fact came from a verified tool call), not a user-confirmation lifecycle. It's never toggled after creation.
- `execution_traces.outcome` has a `'verified'` value (`schema.ts:223`, `execution-traces.ts:20`) — but that's about an **agent run** passing a verifier gate, not a memory being confirmed.
- The shared `MemoryStatus` union (`shared/types.ts:514-515`) has `'unreviewed' | 'low_confidence' | 'conflict'` — the **vocabulary for a review lifecycle exists** and is already projected (`memory-center.ts:84-85`) and filterable (`memory-center.ts:198`). But: nothing **writes** `unreviewed` today (the create path stamps `'active'`, `memory-center.ts:273`; harvest commit is the only intended `unreviewed` producer per `types.ts:506-507` but that write was not confirmed in this recon), and `low_confidence`/`conflict` are explicitly noted as *"may be derived at recall-time rather than persisted"* (`types.ts:510-511`) — i.e. not implemented.

**Verdict:** A "Confirm" / "Needs your confirmation" affordance is **MUST-BUILD**, but cheaply:
the `metadata.status` field + the `MemoryStatus` union are the rails. Add a
`POST /api/memory/:id/confirm` that sets `metadata.status='active'` (clearing `unreviewed`),
mirroring the existing `/archive` route (`memory-center.ts:354-386`). The "needs confirm"
queue = `GET /api/memory?status=unreviewed` (already works — `memory-center.ts:198`).
**Do NOT show a "verified ✓" badge unless the frame is genuinely `source==='tool_verified'` or `status` was explicitly set** — anything else is fabrication.

---

## 5. STALE / freshness / decay — 🟡 DERIVABLE (not surfaced)

Real signal exists as **pure compute**, not a stored flag — `scoring.ts`:

- `computeTemporalScore(iso)` — `scoring.ts:52-63`. Returns `1.0` if within **7 days**
  (`RECENCY_BOOST_DAYS`, `scoring.ts:38`), else exponential decay with a **30-day half-life**
  (`HALF_LIFE_DAYS`, `scoring.ts:37`): `Math.pow(0.5, daysSince / 30)`.
- Decay anchors on **`created_at`** (write time), NOT `last_accessed` — deliberate
  (`scoring.ts:91-97`): `last_accessed` is bumped by `touch()` on every read, so decaying on
  it made the dimension constant noise. Use `created_at` for "age".
- The substrate also auto-prunes by age in `FrameStore.compact()` — temporary frames > 30d,
  deprecated > 90d (`frames.ts:366-389`) — a real staleness policy, but a background sweep, not a per-frame badge.

**Verdict:** "Stale · worth a review" is **DERIVABLE today** with zero new storage:
compute `daysSince(created_at)` (or call `computeTemporalScore`) FE-side or in a thin route.
A reasonable "stale" threshold: temporal score below ~0.5 ≈ older than one half-life (~30d),
or simply `created_at` older than N days for `importance ∈ {normal, temporary}`.
**Constraint:** `created_at` IS projected on the legacy `/api/memory/frames` and `/search`
responses (`memory.ts:56`), so the FE already has the input. **Do NOT invent a "freshness %"
that implies stored decay** — present it as "last touched / age", computed honestly.

---

## 6. "WHY DID YOU DO THAT?" trace — 🟡 DERIVABLE (rich; not per-frame)

A real, rich execution-trace store exists — `execution-traces.ts` + `execution_traces`
DDL (`schema.ts:215-233`). Per "unit of agent work" it records:

- `outcome` (`success|corrected|abandoned|verified|pending`, `execution-traces.ts:20`),
  `cost_usd`, `duration_ms`, `created_at`/`finalized_at`, `session_id`/`persona_id`/
  `workspace_id`/`model` (`execution-traces.ts:75-88`).
- A structured `trace_json` payload (`TracePayload`, `execution-traces.ts:48-72`):
  **`input`, `output`, `reasoning[]` (step text + ts), `toolCalls[]` (tool, args, result, ok,
  durationMs, ts — `execution-traces.ts:22-36`), `artifacts[]`, `tokens`, optional `harness`
  gate results, and `correctionFeedback`.** This is exactly the data a "why did you do that?"
  panel needs.

Production wiring (it IS populated for chat):
- The chat loop creates a `TraceRecorder` and `start()`s a trace per turn
  (`chat.ts:1277-1286`), records reasoning + tool calls through it, and `finalize()`s with
  outcome+output+tokens (`chat.ts:1413-1424`); aborted/errored turns finalize as
  `'abandoned'` (`chat.ts:1648-1649`, `1713`).
- Corrections downgrade a prior trace via `markCorrected()` (`execution-traces.ts:297-310`,
  feedback noted at `chat.ts:1651`).

Route exposure:
- `GET /api/agents/:id/traces` — `agents.ts:469-505`. Returns id/ts/session/workspace/model/
  **outcome/cost/durationMs/tools[]** per trace. **It filters by the `agent:{id}` tag**
  (`agents.ts:486-487`).

**Two honest gaps for PR3.5:**
1. **The chat trace `start()` does NOT pass a `tags:['agent:…']`** (`chat.ts:1279-1285`),
   so the agent-traces route's tag filter will **not** surface conversational traces. The
   richest traces (chat reasoning + tool calls) are written but not addressable by that route.
2. **No frame↔trace backlink.** Nothing links a saved `memory_frame` to the
   `execution_trace` that produced it (no `trace_id` column, no metadata field; grep of
   chat/home/workspace routes for any `traceId`/`trace_id` link returned nothing). So
   "why is THIS specific memory here?" can't be answered from the trace store today —
   you can only show "what the agent did in this turn/session", not "the decision that wrote this frame".

**Verdict:** Trace data is **DERIVABLE and rich** for the session/turn granularity, but a
**per-frame "why" requires MUST-BUILD plumbing** (a `trace_id` on the frame metadata at
write time, plus a `GET /api/memory/:id/trace` resolver). For PR3.5, the **cheap honest win**
is a session/turn-scoped trace view (reasoning steps + tool calls) — and either (a) add the
`agent:` tag to chat `start()`, or (b) add a thin `GET /api/sessions/:id/traces` reading
`traceStore.queryParsed({ sessionId })` (the store already supports it, `execution-traces.ts:328`).
**Do NOT synthesize a "reason" string for a frame that has no linked trace.**

---

## 7. SERVER ROUTES exposing memory to apps/web

Two plugins. **Legacy frame ops** (`memory.ts`) + **shared-`Memory`-entity contract**
(`memory-center.ts`). Quoted with method + path + file:line:

### `packages/server/src/local/routes/memory.ts`
| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/api/memory/search?q&scope&limit&workspace&since&until` | `memory.ts:126` | HybridSearch; returns normalized frames incl. computed `score`, `source` |
| GET | `/api/memory/frames?workspace&limit&since&until` | `memory.ts:194` | recent frames, no query needed (Memory tab initial load) |
| POST | `/api/memory/frames` | `memory.ts:245` | direct write; optional entity extraction; XSS-sanitized; dedup |
| GET | `/api/memory/stats?workspace&scope` | `memory.ts:397` | counts only (mind-isolation: `?scope=all-minds` opt-in, `memory.ts:425-438`) |
| PUT | `/api/memory/frames/:id` | `memory.ts:467` | **CORRECT** — edit content/importance |
| PATCH | `/api/memory/frames/:id/access` | `memory.ts:539` | atomic `access_count++` (touch) |
| DELETE | `/api/memory/frames/:id` | `memory.ts:571` | **FORGET** — hard delete |
| POST | `/api/quick-capture` | `memory.ts:614` | Home quick-capture → frame (+ awareness task row) |

### `packages/server/src/local/routes/memory-center.ts` (shared `Memory` shape)
| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/api/memory?mind&kind&status&scope&q&minConfidence&limit` | `memory-center.ts:167` | list as `Memory`; **status/confidence filters live here** |
| GET | `/api/memory/:id` | `memory-center.ts:215` | one memory, normalized |
| POST | `/api/memory` | `memory-center.ts:235` | curated create (sets `metadata.kind/scope/status='active'/confidence`) |
| PATCH | `/api/memory/:id` | `memory-center.ts:296` | **CORRECT** — content + reclassify; stamps `updatedAt` |
| POST | `/api/memory/:id/archive` | `memory-center.ts:355` | reversible Archive (`status='archived'`) — template for a `/confirm` route |
| DELETE | `/api/memory/:id` | `memory-center.ts:390` | **FORGET** — hard delete, mind-strict |
| POST | `/api/memory/merge` | `memory-center.ts:416` | merge ≥2 → concat + archive originals (C11) |

**Projection note (load-bearing for the warm-Hive provenance pill):** the legacy
`memory.ts` `normalizeFrame` DOES carry `source` provenance (`memory.ts:48-49`), and
`memory-center.ts` `normalizeToMemory` carries `source` + `sourceUrl`/`sourceId`/`confidence`
(`memory-center.ts:97-100`). **BUT** the Chat and Workspace *context* surfaces do not read
those routes — `workspace-context.ts:283-284` selects only `content, importance, created_at`
from `memory_frames`, omitting `source`. **This is the "`frame.source` 1-field server
projection" gap flagged in the S2 handoff** — adding `source` (and `created_at`, already there)
to that projection is the MUST-BUILD that unlocks the ⬡ provenance pill on Chat + Workspace.

---

## PR3.5 build guidance (do-not-fabricate checklist)

| UI affordance | Wire to | New work |
|---|---|---|
| ⬡ provenance pill (source) | `Memory.source` from `/api/memory` ✅; for Chat/Workspace context add `source` to `workspace-context.ts:283` SELECT | 1-field projection (MUST-BUILD, tiny) |
| Forget button | `DELETE /api/memory/:id` ✅ | none |
| Correct / edit | `PATCH /api/memory/:id` ✅ | none |
| "Stale · review?" | compute from `created_at` (already projected) via `computeTemporalScore` | FE compute / thin helper (DERIVABLE) |
| Confidence chip | `Memory.confidence` (only present on harvested frames) | show **only when present**; never default a number (PARTIAL) |
| Confirm / needs-confirm | `POST /api/memory/:id/confirm` (set `metadata.status`) + `GET /api/memory?status=unreviewed` | new route mirroring `/archive` (MUST-BUILD, cheap) |
| "Why did you do that?" | `GET /api/agents/:id/traces` (session-level) | per-frame "why" needs a `trace_id` backlink (MUST-BUILD); session/turn view is DERIVABLE |

**Hard rule:** confidence, freshness, and trace-reason are the three places PR3.5 could
silently fabricate. Confidence is sparse (harvest-only) → hide when absent. Freshness has no
stored decay → present as honest age, not a stored %. Per-frame "why" has no backlink → only
show a reason when a real linked trace exists.
