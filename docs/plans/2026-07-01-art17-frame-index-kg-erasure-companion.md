# Art.17 Frame + Index + KG Erasure Companion (2026-07-01)

Continues the #7 verbatim-provenance arc. The S2 handoff (`06c8574b`) shipped
**redaction-only erasure of the `raw_archive` provenance rows**. That is
provenance-only: the DERIVED `memory_frames` (whose summaries quote source PII)
plus their FTS / vector / chunk-vector / KnowledgeGraph projections stay
searchable and recall-able. This slice closes that gap.

## Erasure surface (verified 2026-07-01)

`PRAGMA foreign_keys = ON` (db.ts:50) → `ON DELETE CASCADE` fires.

| Store | Holds PII? | Cascaded by frame DELETE? | Handled by `FrameStore.delete()` today |
|---|---|---|---|
| `memory_frames.content` | yes (summary quotes source) | n/a (the row itself) | DELETE ✔ |
| `memory_frames_fts` (fts5) | yes (indexed content) | no (virtual) | manual DELETE ✔ |
| `memory_frames_vec` (vec0) | yes (embedding) | no (virtual) | manual DELETE ✔ |
| `memory_frame_chunks` | yes (chunk text) | **yes** (FK CASCADE) | via cascade ✔ |
| `memory_frame_chunks_vec` (vec0) | yes (chunk embedding) | no (virtual) | **✗ LEAK** |
| `kg_entity_frames` | link only | yes (FK CASCADE) | manual DELETE ✔ |
| `knowledge_entities` | yes (`name`/`properties`) | no (shared) | not touched — needs orphan sweep |
| `knowledge_relations` | yes (`properties`) | no | not touched — needs orphan sweep |
| `raw_archive` | yes (verbatim) | no (append-only) | redacted by `RawArchive.erase` ✔ |

**Leak #1** — `memory_frame_chunks_vec` is a vec0 virtual table (no FK); its rowid
is the *chunk* id (`memory_frame_chunks.id`). Frame DELETE cascades the chunk
rows away but leaves the chunk EMBEDDINGS keyed by orphaned ids, and `search()`
queries `memory_frame_chunks_vec` first. → still recall-able.

**Leak #2** — an entity derived solely from an erased frame becomes an orphan
(zero remaining `kg_entity_frames` links) but its `name`/`properties` PII persists
and is still returned by `searchEntities` / contextual recall.

**FK gotcha** — `knowledge_relations` references `knowledge_entities` WITHOUT
`ON DELETE CASCADE`; hard-deleting an entity with live relations raises
`SQLITE_CONSTRAINT`. Relations must go first.

## Decisions

1. **Derived frames → DELETE** (not redact). The `raw_archive` skeleton already
   is the founder-ratified audit record ("item existed, erased at T for reason
   R"). A redacted frame in the corpus would need its own PII-stripping and would
   pollute recall. DELETE is the simpler, more compliant choice.
2. **Orphaned entities → hard-delete** (relations first, then entity). Retire
   (bitemporal `valid_to`) hides from active recall but leaves `name`/`properties`
   PII physically present → not Art.17-compliant. Only delete entities with ZERO
   surviving frame links (never shared entities).
3. **Fix the `chunks_vec` leak in `FrameStore.delete()`** — it is a latent
   correctness bug. `delete()` now purges `memory_frame_chunks_vec`, and
   `compact()`'s three prune/merge sites are routed THROUGH `delete()` so every
   deletion path is covered (the adversarial review confirmed `compact()` bypassed
   `delete()` and still leaked `_vec`/`_fts`/`_chunks_vec`). Strictly additive
   (removes stale vectors that should be gone); cannot degrade recall of surviving
   frames. SOTA-neutral.
4. **All-or-nothing** — every multi-table erasure runs in one `db.transaction()`.
   A partial erasure is a compliance failure.
5. **`archive_uid` re-identification residual → DEFERRED.** `archive_uid =
   sha256(source∥sourceRef∥content)` stays frozen post-erasure → re-id vector for
   low-entropy content. Rotating it breaks the frame→archive link; distinct arc.

## API (new module `mind/erasure.ts`)

```ts
interface EraseResult {
  framesDeleted: number;
  archiveRedacted: number;      // raw_archive rows redacted
  chunkVectorsPurged: number;   // memory_frame_chunks_vec rows removed
  entitiesErased: number;       // orphaned KG entities hard-deleted
  relationsErased: number;      // relations of those entities removed
}

class MindErasure {
  constructor(db, frameStore, rawArchive, knowledgeGraph)
  eraseFrame(frameId, reason): EraseResult            // one frame + provenance + orphans
  eraseBySourceRef(source, sourceRef, reason): EraseResult  // subject sweep
}
```

`eraseFrame` (single-frame primitive): collect linked entity ids → redact linked
archive rows (`RawArchive.eraseByFrame`) → purge chunk vectors → `FrameStore.delete`
(fts/vec/chunks/kg-bridge cascade) → for each previously-linked entity now at zero
links, hard-delete its relations then the entity. One transaction.

`eraseBySourceRef` (subject sweep): reaches the subject's derived corpus through
THREE keys, because one harvested item fans out into differently-keyed frames:
- (a) the distilled **summary** frame — `metadata.archiveUids` reverse lookup;
- (b) the verbatim **`[mind-rawturn …]`** frames — content-prefix keyed by
  `sanitize(source∥sourceRef)` (they carry NO archive link — the review's CRITICAL);
- (c) synthesized **B-frames** — swept by `content.references` ∩ erased-ids (fixpoint).
Then redact any subject provenance row no frame reached. One transaction.

## Adversarial review (2026-07-01, 4-lens, each finding verified)
Raised 14, confirmed 4 — all fixed in this arc:
- **CRITICAL** verbatim raw-turn frames survived (link-only sweep) → (b) above.
- **HIGH** harvest KG entities were born **unlinked** (`createEntity` with no
  `linkEntityToFrame`) so the orphan sweep couldn't reach them → centralized into
  `KnowledgeGraph.importEntitiesForFrame` (creates + links); both MCP harvest
  handlers routed through it. Existing unlinked entities are covered by the
  boot-time `backfillKgEntityFrames` string-match.
- **MEDIUM** `compact()` bypassed `delete()` → routed through it (decision #3).
- **LOW** B-frames quoting entity-name PII → (c) above.

## Out of scope (documented residuals)
- **`archive_uid` opaque-id rotation** (decision 5) — re-id vector for low-entropy
  content survives; interacts with frame→archive link stability. Distinct arc.
- **`eraseFrame` is single-frame** — it does NOT sweep raw-turns/B-frames; full
  data-subject erasure must go through `eraseBySourceRef`. Documented on the method.
- Server route / MCP tool / Memory-Center "erase" button (substrate first).
- OSS forward-port of this delta → `marolinik/hive-mind` (after it lands + PR #21 merges).
