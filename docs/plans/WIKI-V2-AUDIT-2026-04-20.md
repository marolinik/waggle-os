# Wiki v2 Audit — 2026-04-20 (M-11..14)

**Scope:** Same audit-first pattern that cut M-33..48 from ~5 d to ~1 hr and
M-07..10 from 24 hr to ~16 hr of real new code. Verify each sub-item
against current source before committing to the 4-day backlog estimate.

## Sub-item disposition

| Item | Spec | Engine | Route | UI | Verdict | Build est. |
|------|------|--------|-------|-----|---------|------------|
| **M-11 Incremental** | post-harvest hook → `recompile(changedFrameIds)` | ✅ `WikiCompiler.compile({incremental: true})` — watermark-based, skips entity pages that no new frames mention | ✅ `POST /api/wiki/compile` takes `{mode: 'incremental'}` | ✅ WikiTab compile button | **90% done** — only the post-harvest auto-trigger hook is missing | ~30 min |
| **M-12 Obsidian** | Writer producing `.md` + YAML frontmatter + `[[wikilinks]]` | 🟡 Page `.markdown` already has frontmatter + body; slugs exist; but no filesystem writer, no `[[wikilink]]` transform | ❌ no export endpoint | ❌ no UI trigger | **25% done** — page shape is right; needs writer + link transform + route + UI | ~4-6 hr |
| **M-13 Notion** | Adapter uses Notion API; map entity/concept/synthesis to Notion blocks | ❌ nothing — `notion-connector.ts` in agent/src is READ-only (ingest), not write | ❌ no export endpoint | ❌ no UI trigger | **0% done** — genuinely new code; needs Notion API client, markdown-to-block converter, OAuth plumbing | ~1 d |
| **M-14 Health dashboard** | UI: coverage %, orphaned entities, stale pages, recent compile | 🟡 Engine produces `orphan_entity` + `missing_page` + `weak_confidence` issues but NO `stale_page` check despite the type being defined; `dataQualityScore` covers quality but not coverage % | ✅ `GET /api/wiki/health` | 🟡 WikiTab renders score + totals + issues list, but no coverage %, no stale breakout, compile timestamp buried | **70% done** — backend misses `stale_page` check; UI needs coverage + stale polish | ~2 hr |

**Total revised: ~2 d** (vs. 4 d backlog estimate — 50% reduction).

M-13 Notion is the single biggest remaining commitment and the only
sub-item with no prior art. It also requires a design decision on
OAuth surface (reuse `notion-connector.ts`'s OAuth plumbing, or use
a separate write-scope token?).

## Detailed evidence

### M-11 — Incremental recompilation

`packages/wiki-compiler/src/compiler.ts:395-455` shows a fully working
watermark-based incremental compile:

```ts
async compile(options?: { incremental?: boolean; concepts?: string[] }) {
  const incremental = options?.incremental ?? true;
  const watermark = this.state.getWatermark();

  for (const entity of entities) {
    if (incremental && watermark.lastFrameId > 0) {
      const existingPage = this.state.getPage(slugify(entity.name));
      if (existingPage) {
        const newFrames = this.state.getFramesSince(watermark.lastFrameId, 100);
        const mentionsEntity = newFrames.some(f =>
          f.content.toLowerCase().includes(entity.name.toLowerCase())
        );
        if (!mentionsEntity) { pagesUnchanged++; continue; }
      }
    }
    // ... compile entity page ...
  }
}
```

`POST /api/wiki/compile` at `packages/server/src/local/routes/wiki.ts:45-68`
already passes `mode` through. WikiTab calls it from a button.

**Single remaining gap:** the post-harvest route
(`packages/server/src/local/routes/harvest.ts` commit handler) does NOT
fire `/api/wiki/compile` after a successful import. The user currently
has to click the compile button manually, so a just-harvested batch of
frames doesn't show up in the wiki until they remember to do that.

**Fix:** After the cognify block in the commit route, trigger a best-
effort incremental compile via direct function call (not HTTP — we're
already inside the server). The compile is non-blocking for the
response and should fail-soft if the synthesizer has no LLM.

### M-12 — Obsidian adapter

The page shape is already right:

```ts
// packages/wiki-compiler/src/types.ts:25-34
export interface WikiPage {
  slug: string;
  frontmatter: WikiPageFrontmatter;  // YAML-serializable
  markdown: string;                    // already includes frontmatter
  contentHash: string;
}
```

But there's no `packages/wiki-compiler/adapters/` directory. Pages live in
the `wiki_pages` SQLite table (`CompilationState.upsertPage`) and get
read by the server routes. There's nothing iterating them to disk.

**What Obsidian needs:**
1. A writer that iterates `state.getAllPages()`, writes each `${slug}.md`
   to a configured output directory.
2. A transform pass on `markdown` body: convert internal links
   (`[entity-name](/wiki/slug)` form if any) to `[[slug]]` syntax.
3. An index file (`_index.md` or similar) listing all pages by type.
4. Preserve YAML frontmatter as-is (Obsidian reads it natively).
5. A new route `POST /api/wiki/export/obsidian { outDir }`.
6. A button in WikiTab.

Inspecting current markdown to see if internal links already exist:

```bash
grep -n '](/' packages/wiki-compiler/src/compiler.ts  # look for link emissions
```

→ `(none)` — current markdown uses entity names as headers, not
internal links. So the wikilink transform step may be minimal (just
wrap related-entity bullets into `[[slug]]`).

### M-13 — Notion structured export

Zero prior art. `packages/agent/src/connectors/notion-connector.ts`
exists but is strictly ingest-side (reads pages from Notion into memory).

**What Notion needs:**
1. `@notionhq/client` npm dep — currently not present.
2. Credential flow. Options:
   - Reuse agent's notion-connector OAuth (designed for read scope —
     may need broadened scope for writes).
   - Add a separate Notion write token in Vault (`notion-write-token`).
3. Markdown → Notion blocks converter. The markdown shape is simple
   (H1/H2/H3, lists, paragraphs, tables) so this is ~150 LOC.
4. Parent page ID configuration — Notion requires a parent page to
   create under. Onboarding question: "Which Notion page should I
   write your wiki to?"
5. Iterate pages, create child pages, map page types to block color
   tags (entity=blue, concept=amber, synthesis=purple per existing
   WikiTab conventions).
6. Handle re-runs: update existing pages (via page_id cache) rather
   than create duplicates. Needs a `wiki_pages.notion_page_id` column.
7. A route + UI.

This is easily a full day and involves real external API coupling +
user-level auth decisions. It's the right candidate to defer out of
this audit-execute pass and get Marko's design input on before
building.

### M-14 — Health dashboard polish

Backend: `WikiCompiler.compileHealth()` at compiler.ts:295-391 produces:

- `missing_page` issues (entity with >2 relations and no page)
- `weak_confidence` issues (page with <2 sources)
- `orphan_entity` issues (entity with no relations at all)
- A data quality score 0-100 combining entity/frame/page presence + issue severity deductions

**Not produced:** `stale_page` issues — despite `HealthIssueType` listing
them. Pages older than a threshold (e.g. 30 days since last compile
while new frames exist) should trigger this.

**Not produced:** coverage % — pages ÷ entities above a min-relations
threshold. Currently only shown as raw counts.

UI (`WikiTab.tsx:264-305`) renders the score, three stat cards (frames,
entities, pages), and the issues list. What it doesn't show:

- Coverage ratio (pages / compilable-entities).
- Stale-page count (once the backend computes it).
- Prominent "Last compiled Xm ago" timestamp (currently buried per-page
  in the list).

**Fix:**
1. Add `stale_page` check in `compileHealth()` — compare page
   `compiledAt` vs current new frames mentioning the entity.
2. Extend the stats row in the UI: add coverage % and stale count.
3. Add a "Last compile: N time ago" chip next to the score.

## Recommended execution order

1. **M-11 post-harvest hook** (~30 min) — immediate demo value:
   harvest → wiki pages appear automatically. Tiny change, one try/catch
   block added to the harvest commit route.
2. **M-14 polish** (~2 hr) — health.ts gets `stale_page` check;
   UI gets coverage + stale breakout. No new design needed.
3. **M-12 Obsidian writer** (~4-6 hr) — new adapter file + route +
   WikiTab export button + round-trip tests. High value for
   Obsidian-using knowledge workers; Marko's target power user persona.
4. **M-13 Notion** — **defer to next session.** Needs a spec call:
   - Reuse agent's OAuth or separate write-scope token?
   - Onboarding flow for parent-page selection?
   - `wiki_pages.notion_page_id` migration for re-run updates?

## Why this order

- M-11 unlocks M-12 and M-13 downstream — both of those become more
  valuable once pages are always current.
- M-14 polish is mostly visible work; makes the "real wiki" case
  visible to demo viewers.
- M-12 Obsidian is the biggest demo win for sophisticated users
  without any external API dependency; ship it before asking for
  a design decision on Notion.
- M-13 Notion needs a synchronous Marko design input so it's a
  bad fit for autonomous execution.

## Decision needed

My pick: execute 1→2→3 in this session, write a decision-needed
memo for M-13 and defer it. This closes ~75% of the M-11..14 block
in <1 d real work against a 4 d budget.

---

**Author:** Claude (audit per Marko's S2-locked M-07..10 → M-11..14 sequence)
