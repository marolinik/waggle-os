# M-13 — Notion Structured Export Decision Memo

**Status:** BLOCKED on Marko's design decisions — DO NOT IMPLEMENT until
the four questions below are answered.

**Context:** M-13 is the last sub-item in the M-11..14 Wiki v2 block. The
audit (`docs/plans/WIKI-V2-AUDIT-2026-04-20.md`) noted it's the only item
with no prior art and needs external-API integration choices. M-11/M-12/
M-14 shipped in this session; M-13 is queued.

## The four questions

### Q1 — Auth surface

**Option A — Reuse the existing agent's Notion OAuth flow**
`packages/agent/src/connectors/notion-connector.ts` has a Notion OAuth
client already wired up. It's scoped to READ for memory ingestion. For
writes we'd need to broaden the scope (new consent screen text, new
redirect URI if different, new token column, migration for existing
connected users).

- **Pro:** Single identity per user; the same Notion connection powers
  both "read my Notion into memory" and "write my wiki into Notion."
- **Con:** Scope creep on the existing consent screen; users who
  consented to read-only feel different when they see "allow writes";
  existing tokens need re-consent.

**Option B — Separate Notion write token in Vault**
Add a new Vault entry `notion-wiki-token` that the user pastes from
Notion's internal-integration settings (https://www.notion.so/my-integrations).

- **Pro:** Zero coupling with the ingest flow; users who don't use
  Notion-as-source can still export; simpler consent story.
- **Con:** Two Notion creds to manage; power users ask "why does my
  connector not work for export?"

**Recommendation:** B for v1. Separate write token. Ships clean without
OAuth scope migrations; upgrade to unified OAuth if M-29 MS Graph pattern
(which is v2-deferred anyway) ever lands.

### Q2 — Parent-page UX

Notion requires a parent page/database when creating child pages. Options:

**Option A — Auto-create** a top-level "Waggle Wiki" page on first
export, remember its page_id in `wiki_pages.notion_root_page_id` (new
column) or a settings row.

**Option B — User selects** at export time. UI either shows a list of
the user's top-level pages (requires search API call) OR asks for the
page URL paste.

**Recommendation:** B with paste-URL fallback. "Paste the URL of the
Notion page that should be your wiki's root." Obsidian M-12 already
established the pattern: prompt for path. Notion prompt for URL.

### Q3 — Update vs. insert on re-run

Re-running export against the same Notion root: should we UPDATE
existing Notion pages or create new ones?

**Option A — Always update** (keep a `wiki_pages.notion_page_id` column
keyed by slug). Requires a migration to add the column + handling
partial-fail cleanup.

**Option B — Delete + recreate** on every export. Simpler but loses
Notion's comment threads, per-block history.

**Option C — Delta** only changed pages (detected via `content_hash`).
Best UX but requires A's column + delta comparison.

**Recommendation:** C. Uses the existing `content_hash` from
`CompilationState.upsertPage` for change detection. Migration adds
one INTEGER column (`notion_page_id`). Worst case falls back to A
behavior (update even unchanged pages).

### Q4 — Markdown → Notion blocks converter

Current wiki markdown is simple (H1/H2/H3, paragraphs, bullet lists,
occasional blockquotes, no tables per compiler.ts inspection).

**Option A — Roll our own** ~150 LOC converter that handles the 5-6
block types we actually emit.

**Option B — Use a library** (`marked` + custom renderer, or
`@notionhq/client`'s built-in support? Notion's API takes blocks
directly; no library I know of converts markdown to Notion blocks
canonically).

**Recommendation:** A. The markdown shape is predictable and narrow.
Writing the 150 LOC means we don't inherit a library's edge-case
behavior for something we control end-to-end. Tests cover H1-H3,
paragraphs, bullets, links (become Notion rich_text with link
property), and YAML frontmatter extraction (drops from the body,
maps to Notion page metadata).

## Proposed v1 scope if all four land as recommended

1. Add `notion-wiki-token` Vault entry type.
2. UI: WikiTab "Export to Notion" button → prompt for (a) vault token
   if not set, (b) root page URL.
3. Adapter `packages/wiki-compiler/src/adapters/notion.ts`:
   - `writeToNotionWorkspace(pages, { token, rootPageId }): Promise<NotionExportResult>`
   - Markdown-to-blocks converter (H1/H2/H3, paragraphs, bullets, links, blockquotes).
   - Per-page: if `notion_page_id` in cache + content_hash matches: skip; if mismatch: `pages.update` + replace block children; else `pages.create` under root.
4. Migration: `ALTER TABLE wiki_pages ADD COLUMN notion_page_id TEXT`.
5. Route: `POST /api/wiki/export/notion { rootPageUrl }` — reads token from Vault.
6. Tests: unit for the block converter, integration mock for the API client.

**Scope estimate with recommendations accepted:** ~1 d (matches audit).

**Scope estimate if rewriting auth (Option A Q1):** ~1.5 d + OAuth scope
migration.

## What to do next session

1. Marko reviews and picks answers (or proposes alternatives) for Q1-Q4.
2. Add an M-13 task with the chosen scope.
3. Execute. First commit: the migration. Second: the adapter + converter
   + tests. Third: route + UI.

---

**Author:** Claude (memo queued per S4 session M-13 deferral)
**Date:** 2026-04-20
