# Fresh Claude.ai Export Verification — 2026-04-22

**Sprint:** 10 · Task 1.5 Phase 1
**Brief:** `PM-Waggle-OS/briefs/2026-04-22-cc-sprint-10-parallel-close-tasks.md` §Task 1.5
**Source zip:** `D:/Projects/hive-mind/test-fixtures/claude-export-2026-04-22-marko.zip` (33.5 MB)
**Inspection tool:** `scripts/inspect-fresh-claude-export.mjs`
**Extracted to:** `/tmp/claude-export-2026-04-22` (local-only; gitignored path)

---

## 1. Top-level zip structure

```
claude-export-2026-04-22-marko.zip (33.5 MB, 5 entries)
├── conversations.json      140,383,793 B
├── projects.json             2,374,500 B
├── memories.json                13,464 B
├── users.json                      152 B
└── design_chats/
    └── 874d18da-a847-4c5f-b4d8-19e5dcfa1b4e.json   221,109 B
```

**Missing (critical per brief §Task 1.5 Phase 1 "Critical verification"):**
- `artifacts/` directory — **NOT PRESENT**
- `outputs/` directory — **NOT PRESENT**
- No standalone `.md`, `.docx`, `.pptx`, `.skill`, `.zip`, etc. files

---

## 2. conversations.json — computer:// URL map

- **Total conversations:** 749
- **`computer://` URL occurrences (raw):** 233
- **Unique `computer://` targets:** 62
- **Conversations containing ≥1 artifact reference:** 11 of 749 (1.5%)
- **Refs counted via message walk:** 104

**Target extension distribution (unique URLs):**

| Extension | Count | Notes |
|---|---|---|
| `.md` | 37 | bulk of the artifact corpus — CLAUDE.md guides, book-system examples, etc. |
| `.docx` | 5 | the Legat editorial analysis class (Stage 0 Q1 blockers) |
| `.skill` | 4 | Claude skill definitions |
| `.json` | 3 | workflow / config files |
| `.pptx` | 3 | presentation deliverables |
| (dir) | 2 | folder references (e.g. `outputs/monitoring-stack/`) |
| (none) | 2 | trailing-slash refs (e.g. `outputs/`) |
| `.gz` | 2 | compressed archives |
| `.html` | 2 | rendered reports |
| `.zip` | 1 | package bundles |
| `.sh` | 1 | deployment scripts |

**First 5 sample targets:**

```
computer:///home/claude/fixed_workflow.json
computer:///mnt/user-data/outputs/
computer:///mnt/user-data/outputs/CLAUDE-md-book-system-example.md
computer:///mnt/user-data/outputs/CLAUDE-md-guide.md
computer:///mnt/user-data/outputs/CLAUDE.md
```

Referenced-but-absent pattern is identical to the Stage 0 finding. The chat-turn references exist; the `/mnt/user-data/outputs/*` target bodies do not ship in the export.

---

## 3. projects.json — inline project doc content PRESENT

**This is new and valuable vs the 2026-04-20 export.**

- **Total projects:** 12
- **Total project docs:** 63
- **Docs with inline `.content` (string):** **63 of 63 (100%)**
- **Average inline content size:** 26,396 chars (~26 KB)

**Shape per project:**
```json
{ uuid, name, description, is_private, is_starter_project,
  prompt_template, created_at, updated_at, creator, docs: [...] }
```

**Implication.** Project-knowledge documents (the docs users attach to a Claude project for persistent context) ARE fully harvestable from this export — content included inline, not referenced by opaque URL. This is DIFFERENT from the session-generated `/mnt/user-data/outputs/` artifacts, which remain absent.

Stage 0 mechanism #3 specifically blocked on session-generated artifacts (the Legat editorial `.docx` created mid-conversation). Project-knowledge docs are a different class and were not in scope for Stage 0 mech #3. Good news: project-doc harvesting is now trivially implementable; bad news: the session-artifact class is still not covered by this export.

---

## 4. design_chats/ — new content stream, small

Single file in this export: `874d18da-a847-4c5f-b4d8-19e5dcfa1b4e.json` (221 KB, 12 messages). Shape:

```json
{ uuid, title, project, created_at, updated_at, messages: [...] }
```

Message keys: `uuid, role, content, created_at`. **Zero `computer://` URLs.**

Interpretation: design_chats appears to be a separate UX chat channel (likely Claude's recent "Design" workspace feature) that does NOT generate session artifacts via the `/mnt/user-data/outputs/` mechanism. Harvestable as conversation-class content; not a solution to the artifact absence gap.

---

## 5. memories.json — user-memory stream

Single entry with shape:
```json
{ conversations_memory, project_memories, account_uuid }
```

This is Claude's user-facing "Memory" feature (personalization snippets Claude carries across sessions for a given account). Harvestable as identity-class content; not a solution to the artifact absence gap either.

---

## 6. users.json — account manifest

```json
[{ "uuid": "e2d5...", "full_name": "Marko Markovic", "email_address": "marolinik@gmail.com" }]
```

Single-account manifest. No artifact content.

---

## 7. Phase 1 verdict — Phase 2 decision gate

### Artifacts (session-generated `/mnt/user-data/outputs/` class): **ABSENT**

The fresh 2026-04-22 Claude.ai export does NOT package session-generated artifact bodies. This matches the Stage 0 substrate mechanism #3 observation exactly — the structural gap is a property of the Claude.ai export format itself, not of any particular export cycle.

### Per brief §Task 1.5 Phase 2 — **STOP + PM decision gate required**

Per brief §Phase 2: "Ako artifacts folder ABSENT → STOP, report, await PM decision on alternative data supply (Anthropic API, Computer Use scraping, manual artifact export strategy)."

**Phase 3 is BLOCKED pending PM choice between:**

| Option | Feasibility signal from this inspection |
|---|---|
| Anthropic API for artifact listing | Unknown — public API docs don't surface an artifact-listing endpoint as of Sprint 9 research. Would need dedicated vendor discovery. |
| Computer Use scraping of the Claude.ai web UI | High maintenance burden; fragile. Last-resort option. |
| Manual artifact export strategy (user exports key `.docx/.md` files from chat UI and drops them alongside the zip) | Viable for specific, identified blockers (Stage 0 Legat trilogy — Marko could manually export the 5 `.docx` and the trio of structural `.md` files into the export bundle). Not scalable to all 62 unique targets across all sessions, but sufficient for targeted dogfood re-runs. |
| Partial adapter scope — harvest project-docs + memories + design_chats NOW; park session-artifact harvest until API path confirmed | Immediately implementable value. The 63 project docs @ ~26KB each = ~1.6 MB of previously-unindexed high-quality content. memories.json + design_chats add additional coverage. Does NOT close Stage 0 mech #3 but ships meaningful incremental coverage before vendor-side gap resolves. |

### Recommended (CC advisory — PM decides)

**Option 4 (partial adapter scope) is the highest value-per-hour with current data.** Implementable today, ships real coverage expansion, and leaves session-artifact gap cleanly documented as a known limit with the same three Option 1-3 paths queued for whenever vendor or manual supply lands.

Option 4 expressly does NOT close the Stage 0 mech #3 ticket in the hive-mind BACKLOG — that ticket stays open, with this verification report attached as evidence that the fresh 2026-04-22 export did not resolve the gap.

---

## 8. Cost accounting

Phase 1 spend: **$0** (pure file inspection, zero API calls per brief §Phase 1 budget).

---

## 9. Ready-state for Task 1.1 kick-off

Phase 1 CLOSE per brief §Parallel Execution Protocol triggers Task 1.1 (Qwen3.6 stability matrix live-run) kick-off. Task 1.5 Phase 2/3 decision gate can wait for PM without blocking Task 1.1 wall-clock.

---

*End of Task 1.5 Phase 1 verification report.*
