# Wiki Compiler: Waggle x Karpathy Synthesis Engine

**Status:** Spec Draft
**Author:** Marko Markovic / Egzakta Group
**Date:** 2026-04-13
**Codename:** Hive Mind Compiler (HMC)

---

## 1. Executive Summary

Andrej Karpathy published the LLM Wiki pattern (April 2026) — a system where
LLMs incrementally build and maintain a persistent, interlinked markdown wiki
from raw sources. Within days it amassed massive community adoption, with
GBrain (Garry Tan / YC, 5,400 stars in 24 hours), Rowboat, Basic Memory,
and dozens of implementations following.

**The thesis of this document:** Karpathy's wiki is the READ side of personal
knowledge. Waggle's memory engine is the WRITE side. Neither is complete alone.
Combined, they create the first full-cycle personal knowledge OS — a system
where AI agents automatically accumulate structured memory AND compile it into
a human-readable, interlinked, compounding wiki.

**Dual-track delivery:**
1. **Waggle Feature** — Wiki Compiler as a native workspace capability
2. **Open-Source Product** — Standalone "Hive Mind" MCP server + CLI

---

## 2. Strategic Context

### 2.1 Why This Matters for Waggle

Waggle's memory engine (FrameStore + HybridSearch + KnowledgeGraph + Identity +
Awareness) is technically superior to every competitor in the space. But it has
a critical gap: **the memory is invisible to the user.** Frames in SQLite are
powerful for agents, opaque to humans. Users can't see the state of what they
know, how ideas connect, what's changed over time.

The wiki compiler layer solves this. It gives users a window into their own
knowledge — beautiful, browsable, interlinked markdown pages that update
automatically as memory accumulates. This is the emotional hook that turns
a technical feature into a product story.

### 2.2 Why This Matters for KVARK

Karpathy's gist explicitly mentions: *"Business/team: an internal wiki
maintained by LLMs, fed by Slack threads, meeting transcripts, project
documents."* This is the KVARK enterprise play:

> Your institutional knowledge, automatically compiled from every conversation
> your people have with AI, into a living wiki that both your agents and your
> people can read. On your infrastructure, behind your perimeter.

The Teams tier ($49/seat) + shared team memory already exists. The wiki compiler
turns it into a visible, browsable institutional knowledge base — the thing
enterprise buyers actually want to show their CFO.

### 2.3 Marketing Hook

The Karpathy signal is enormous. His gist spawned an entire ecosystem in days.
Launching an open-source product that explicitly extends his thesis with
production-grade infrastructure (real search, knowledge graph, team sharing,
multi-workspace) rides this wave with technical credibility.

Positioning: *"Karpathy showed you the pattern. We built the engine."*

---

## 3. Competitive Landscape (April 2026)

| Product | Architecture | Search | KG | Team | Wiki Output | Scale |
|---------|-------------|--------|----|----|-------------|-------|
| **Karpathy's LLM Wiki** | Flat markdown files | index.md (breaks ~500 docs) | Backlinks only | No | Yes (IS the wiki) | ~100 sources |
| **GBrain** (Garry Tan) | Markdown + PGLite/pgvector | Hybrid (pgvector + keyword) | Entity pages (markdown) | No | Compiled truth pages | 10k+ files |
| **Mem0** | Vector + Graph store | Semantic + entity links | Yes (graph DB) | Cloud only | No | Large |
| **Hindsight** | Embedded Postgres + pgvector | 4-strategy parallel + reranking | Entity graph | No | No | Medium |
| **Zep / Graphiti** | Temporal knowledge graph | Entity + temporal queries | Yes (Neo4j/FalkorDB) | Cloud | No | Large |
| **Cognee** | KG + Vector | Graph + vector combined | Yes (Kuzu) | No | No | Medium |
| **Basic Memory** | Flat markdown files | MCP-based search | No | No | Yes (IS the store) | Small |
| **Letta** | Tiered (core/archival/recall) | Agent-managed | No | No | No | Medium |
| **Rowboat** | Typed MD entities + graph | Multi-source | Yes (typed entities) | No | Briefings | Medium |
| **Waggle Memory** | SQLite + FTS5 + sqlite-vec | Hybrid (BM25 + vector + RRF) | Yes (typed entities + relations) | Yes (team sync) | **No** | Large |

### Gap Analysis

**Nobody** has all of:
- Real hybrid search at scale (BM25 + vector + RRF)
- Typed knowledge graph with confidence scoring
- Multi-workspace isolation + cross-workspace search
- Team memory sharing
- Multi-source harvest (ChatGPT, Claude, Gemini, etc.)
- Identity + Awareness layers
- AND a compiled wiki output layer

Waggle has everything except the wiki output. Adding it creates a category of one.

### GBrain: Closest Competitor

GBrain launched 3 days before this spec. It has:
- Markdown storage + PGLite/pgvector
- Hybrid search
- Entity pages (compiled truth + timeline)
- "Dream cycles" (overnight consolidation)
- 37 operations, MCP server, CLI, HTTP

But independent code review found that flagship features like compiled truth
rewriting and dream cycles are **markdown instruction documents** that guide AI
agents, not executable code. The search is pgvector-only (no FTS5/BM25). No
team sharing. No workspace isolation. No temporal knowledge graph. No harvest
pipeline. No awareness/identity layers.

**Waggle's memory engine is genuinely deeper.** The wiki compiler would make
that visible.

---

## 4. Architecture

### 4.1 Layer Model

```
                     +----- HUMAN READS -----+
                     |                        |
Layer 6:  Wiki       |  Interlinked markdown  |  ← NEW: Wiki Compiler
          Output     |  Entity/concept/topic  |
                     |  pages, timelines,     |
                     |  contradictions, gaps   |
                     +------------------------+
                              ↑ compiles from
                     +------------------------+
Layer 5:  Agent      |  Behavioral spec,      |  ← Waggle (exists)
          Intel      |  personas, tool filter  |
                     +------------------------+
                              ↑ uses
                     +------------------------+
Layer 4:  Knowledge  |  Typed entities,       |  ← Waggle KG (exists)
          Graph      |  typed relations,      |
                     |  confidence scores     |
                     +------------------------+
                              ↑ extracted from
                     +------------------------+
Layer 3:  Indexed    |  FTS5 + sqlite-vec     |  ← Waggle HybridSearch
          Memory     |  BM25 + vector + RRF   |     (exists)
                     +------------------------+
                              ↑ indexes
                     +------------------------+
Layer 2:  Raw        |  I/P/B-Frames          |  ← Waggle FrameStore
          Memory     |  in SQLite             |     (exists)
                     +------------------------+
                              ↑ harvested from
                     +------------------------+
Layer 1:  Identity   |  Who you are, what     |  ← Waggle Identity +
          & Context  |  you're doing now      |     Awareness (exists)
                     +------------------------+
                              ↑ derived from
                     +------------------------+
Layer 0:  Raw        |  Conversations, docs,  |  ← Harvest pipeline
          Sources    |  exports, PDFs         |     (exists)
                     +------------------------+
```

### 4.2 Wiki Compiler Core

The compiler is a new module that reads from Layers 2-4 and writes Layer 6.

```
┌─────────────────────────────────────────────────────────┐
│                    WIKI COMPILER                         │
│                                                         │
│  Inputs:                                                │
│    - FrameStore (all frames, with metadata)             │
│    - KnowledgeGraph (entities, relations, confidence)   │
│    - Identity + Awareness (context)                     │
│    - Previous wiki state (for incremental updates)      │
│    - Wiki Schema (compilation rules per workspace)      │
│                                                         │
│  Process:                                               │
│    1. Identify what changed since last compilation      │
│    2. Determine affected pages                          │
│    3. For each affected page:                           │
│       a. Gather relevant frames (via HybridSearch)      │
│       b. Gather related entities (via KG traversal)     │
│       c. Read current page content (if exists)          │
│       d. LLM: synthesize/update the page               │
│       e. LLM: update cross-references                  │
│       f. Write page with frontmatter + citations        │
│    4. Update index.md                                   │
│    5. Update compilation log                            │
│                                                         │
│  Outputs:                                               │
│    - Markdown files (entity pages, concept pages,       │
│      topic summaries, timeline, contradictions)         │
│    - index.md (navigable catalog)                       │
│    - log.md (compilation history)                       │
│    - health.md (gaps, orphans, stale claims)            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Page Types

| Type | Content | Generated From | Update Trigger |
|------|---------|---------------|----------------|
| **Entity page** | Person, project, org, tech — compiled truth + timeline | KG entity + related frames | New frame mentioning entity |
| **Concept page** | Topic synthesis — what we know, sources, evolution | Frames matching concept + KG relations | New frame on topic |
| **Overview** | High-level summary of entire workspace knowledge | All frames + KG summary | Periodic / on-demand |
| **Comparison** | Side-by-side analysis (e.g., Tool A vs Tool B) | Frames mentioning both + KG relations | On-demand or lint |
| **Timeline** | Chronological evolution of knowledge | All frames ordered by time | Any new frame |
| **Contradictions** | Claims that conflict across sources | KG confidence + frame comparison | Lint pass |
| **Gaps** | Topics mentioned but under-documented | KG orphan analysis + frame coverage | Lint pass |
| **Index** | Catalog of all pages with summaries | All pages | Every compilation |

### 4.4 Page Format

```markdown
---
type: entity
entity_type: project
name: "Project Alpha"
confidence: 0.87
sources: 14
last_compiled: 2026-04-13T10:30:00Z
frame_ids: [42, 67, 103, 155, 201, ...]
related_entities: ["John Smith", "React", "Q2 Launch"]
---

# Project Alpha

## Summary
[LLM-generated synthesis of all knowledge about this entity]

## Key Facts
- **Started:** 2026-02-15 (from frame #42)
- **Lead:** John Smith (from frame #67, confidence: 0.95)
- **Stack:** React + Node.js (from frames #103, #155)
- **Status:** In development, targeting Q2 launch (from frame #201)

## Timeline
| Date | Event | Source |
|------|-------|--------|
| 2026-02-15 | Project initiated | frame #42 |
| 2026-03-01 | Architecture finalized | frame #67 |
| 2026-03-20 | MVP complete | frame #155 |

## Relations
- [[John Smith]] — project lead (confidence: 0.95)
- [[React]] — primary frontend framework
- [[Q2 Launch]] — target milestone

## Open Questions
- Budget allocation not yet documented
- No test strategy frames found

## Contradictions
- Frame #103 says "TypeScript only" but Frame #155 mentions "some JavaScript"
  → Confidence: 0.6, needs resolution
```

### 4.5 Compilation Modes

**1. Full Compilation**
- Reads ALL frames + entire KG
- Generates all pages from scratch
- Expensive (many LLM calls), used for initial build or reset
- Token budget: O(frames * avg_frame_size) for context, O(pages) for generation

**2. Incremental Compilation**
- Tracks `last_compiled_frame_id` watermark
- Only processes frames newer than watermark
- Determines affected entities/concepts from new frames
- Updates only affected pages
- 10-100x cheaper than full compilation

**3. Lint Pass**
- No new frames processed
- Scans existing pages for:
  - Contradictions (frames with conflicting claims on same entity)
  - Stale claims (old frames superseded by newer ones)
  - Orphan pages (no inbound links from other pages)
  - Missing pages (entities in KG with no wiki page)
  - Weak confidence (pages based on single low-confidence frame)
  - Gap suggestions ("you should investigate X")
- Writes health.md with findings

**4. On-Demand Query Compilation**
- User asks a question
- System searches frames + KG for answer
- If answer is substantial, offers to compile it as a new page
- "This comparison could be useful later — save as wiki page?"
- Karpathy's insight: answers should compound into the wiki

### 4.6 Wiki Schema (Governance)

Each workspace can have a `wiki-schema.md` that tells the compiler how to
operate — analogous to Karpathy's CLAUDE.md governance file.

```markdown
# Wiki Schema: Sales Pipeline Workspace

## Page conventions
- Entity pages use "compiled truth + timeline" format
- Concept pages start with a 2-sentence TL;DR
- All claims must cite frame IDs
- Confidence below 0.5 triggers a "Needs Verification" badge

## Entity types to compile
- person (always): full entity pages with relations
- organization (always): entity pages
- deal (always): entity pages with status tracking
- technology (on-demand): only if 3+ frames mention it

## Compilation schedule
- Incremental: after every 10 new frames
- Lint: weekly
- Full: manual only

## Output format
- Obsidian-compatible markdown (wikilinks: [[Page Name]])
- Frontmatter: YAML with type, confidence, sources, frame_ids
- Images: reference from workspace files directory
```

---

## 5. Universal Source Pipeline — The Full Second Brain

### 5.1 The Gap

Currently Waggle's harvest pipeline only ingests AI conversation exports
(ChatGPT, Claude, Gemini JSON). Karpathy's system ingests **anything** —
articles, papers, PDFs, podcast notes, journal entries, web clips, meeting
transcripts, book chapters. GBrain adds Gmail, Calendar, and Twilio.

To be a true second brain, the ingest layer must accept any knowledge source
a human encounters. The wiki compiler then synthesizes ALL of it — not just
what you said to AI, but what you read, heard, watched, and thought.

### 5.2 Source Adapter Architecture

```
┌─────────────────────────────────────────────────────────┐
│              UNIVERSAL SOURCE PIPELINE                    │
│                                                         │
│  Every adapter implements:                              │
│    parse(input) → SourceItem[]                          │
│                                                         │
│  SourceItem = {                                         │
│    title: string                                        │
│    content: string          (extracted text, max 4000)  │
│    source: string           (adapter ID)                │
│    sourceUrl?: string       (original URL/path)         │
│    createdAt?: string       (original date if known)    │
│    metadata?: {                                         │
│      entities?: { name, type }[]                        │
│      tags?: string[]                                    │
│      author?: string                                    │
│      contentType: 'article' | 'paper' | 'transcript'   │
│                   | 'note' | 'book' | 'conversation'   │
│                   | 'email' | 'code' | 'image'         │
│    }                                                    │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Source Adapters — Full Catalog

**Tier 1: Ship with v1 (extends existing harvest)**

| Adapter | Input | What It Extracts |
|---------|-------|-----------------|
| `chatgpt` | JSON export | Conversations → frames (exists) |
| `claude` | JSON export | Conversations → frames (exists) |
| `claude-code` | Session JSON | Code sessions → frames (exists) |
| `gemini` | JSON export | Conversations → frames (exists) |
| `universal` | Generic JSON | Best-effort extraction (exists) |
| `markdown` | .md file or folder | Sections → frames, headings → entities |
| `plaintext` | .txt file | Paragraphs → frames |
| `pdf` | .pdf file | Pages → text → frames (via pdf-parse) |
| `url` | Web URL | Fetch → readability extract → markdown → frames |
| `obsidian-vault` | Folder of .md files | Bulk import, preserve wikilinks as KG relations |

**Tier 2: High-value integrations**

| Adapter | Input | What It Extracts |
|---------|-------|-----------------|
| `epub` | .epub file | Chapters → frames, characters/themes → entities |
| `youtube` | YouTube URL | Transcript → frames (via yt-dlp or API) |
| `podcast` | Audio URL / file | Whisper transcription → frames |
| `email-mbox` | .mbox export | Threads → frames, contacts → entities |
| `notion-export` | Notion ZIP export | Pages → frames, databases → entities |
| `confluence-export` | Confluence export | Pages → frames |
| `slack-export` | Slack JSON export | Channels/threads → frames, users → entities |
| `rss-feed` | RSS/Atom URL | Periodic poll → new articles → frames |
| `zotero` | Zotero export | Papers + notes + annotations → frames |
| `kindle-highlights` | Kindle export | Highlights + notes → frames per book |

**Tier 3: Live connectors (via MCP or API)**

| Adapter | Input | What It Extracts |
|---------|-------|-----------------|
| `gmail-mcp` | Gmail MCP server | Emails → frames (real-time via MCP) |
| `calendar-mcp` | Google Calendar MCP | Events → awareness items |
| `slack-mcp` | Slack MCP server | Messages → frames (real-time) |
| `notion-mcp` | Notion MCP server | Page changes → frames (real-time) |
| `github-mcp` | GitHub MCP server | Issues, PRs, discussions → frames |
| `linear-mcp` | Linear MCP server | Issues, projects → frames |
| `meeting-transcript` | Granola / Fireflies / Otter | Meeting notes → frames, action items → awareness |
| `voice-memo` | Audio file | Whisper → text → frames |

### 5.4 Ingest Flow

```
Raw Source
    │
    ▼
┌──────────┐     ┌───────────┐     ┌──────────────┐
│ Adapter  │────▶│ SourceItem│────▶│ Frame        │
│ .parse() │     │ []        │     │ Store        │
└──────────┘     └───────────┘     └──────┬───────┘
                                          │
                      ┌───────────────────┼───────────────────┐
                      ▼                   ▼                   ▼
               ┌────────────┐    ┌──────────────┐    ┌──────────────┐
               │ HybridSearch│    │ KnowledgeGraph│    │ Wiki Compiler│
               │ .indexFrame()│    │ .createEntity()│    │ (incremental)│
               └────────────┘    └──────────────┘    └──────────────┘
```

For every source item:
1. **Create I-Frame** in FrameStore (with dedup)
2. **Index** in HybridSearch (FTS5 + vector)
3. **Extract entities** → create/update in KnowledgeGraph
4. **Trigger incremental wiki compilation** (if enabled)

### 5.5 Smart Ingest: LLM-Assisted Entity Extraction

For Tier 1, entity extraction is rule-based (headings, @mentions, etc.).
For Tier 2+, the ingest pipeline optionally runs an LLM pass:

```
Source text → LLM prompt:
  "Extract entities (people, organizations, projects, technologies,
   concepts) and their relationships from this text. Return JSON."
→ Entities + relations → KnowledgeGraph
```

This is where GEPA pays off — entity extraction is a perfect task for
Haiku-class models with optimized prompts. Cost: ~$0.001 per source item.

### 5.6 Obsidian Vault Import (Killer Onramp)

Karpathy's audience uses Obsidian. Many already have vaults with hundreds of
notes. The `obsidian-vault` adapter is the killer onramp:

```bash
hive-mind ingest ~/Documents/MyVault --source obsidian-vault
```

What it does:
1. Walks the vault directory
2. For each .md file:
   - Parse YAML frontmatter → metadata
   - Parse wikilinks `[[Page Name]]` → KG relations
   - Parse sections → individual frames
   - Parse tags `#tag` → frame metadata
3. Preserve the vault's link graph as KG relations
4. Result: user's existing Obsidian vault becomes searchable, KG-indexed,
   and ready for wiki compilation

This means: **import your existing second brain, get a better one back.**

### 5.7 The Full Second Brain Vision

With the universal source pipeline, the system becomes:

```
 ┌─── EVERYTHING YOU ENCOUNTER ───────────────────────┐
 │                                                     │
 │  AI conversations (ChatGPT, Claude, Gemini, etc.)  │
 │  Articles you read (web clips, RSS)                 │
 │  Papers you study (PDFs, Zotero)                    │
 │  Books you read (Kindle, epub)                      │
 │  Meetings you attend (transcripts)                  │
 │  Emails you receive (Gmail, mbox)                   │
 │  Code you write (GitHub, Claude Code)               │
 │  Notes you take (Obsidian, Notion)                  │
 │  Podcasts you listen to (transcripts)               │
 │  Slack threads you participate in                   │
 │  Voice memos you record                             │
 │                                                     │
 └──────────────────┬──────────────────────────────────┘
                    │
                    ▼
 ┌─── UNIVERSAL SOURCE PIPELINE ──────────────────────┐
 │  Adapters → SourceItems → Frames → KG → Vectors   │
 └──────────────────┬──────────────────────────────────┘
                    │
                    ▼
 ┌─── YOUR SECOND BRAIN ─────────────────────────────┐
 │                                                     │
 │  FrameStore: every fact, decision, insight          │
 │  KnowledgeGraph: every person, project, concept     │
 │  HybridSearch: find anything instantly              │
 │  Identity: who you are evolves over time            │
 │  Awareness: what you're focused on right now        │
 │                                                     │
 └──────────────────┬──────────────────────────────────┘
                    │
                    ▼
 ┌─── COMPILED WIKI ─────────────────────────────────┐
 │                                                     │
 │  Entity pages: people, projects, orgs you know      │
 │  Concept pages: topics you've explored              │
 │  Timeline: how your knowledge evolved               │
 │  Contradictions: where sources disagree             │
 │  Gaps: what you should investigate next             │
 │  Filed answers: insights you've generated           │
 │                                                     │
 │  Browsable in Obsidian, Waggle UI, or any editor   │
 │                                                     │
 └─────────────────────────────────────────────────────┘
```

**This is Vannevar Bush's Memex (1945), finally realized.**

Bush imagined: *"a device in which an individual stores all his books, records,
and communications, and which is mechanized so that it may be consulted with
exceeding speed and flexibility."* He called the connections between documents
"associative trails."

Karpathy cited Bush explicitly. But Bush couldn't solve who does the
maintenance. Karpathy said "the LLM handles that." We say: "the LLM handles
that, AND the LLM itself uses it, AND it works across every source you
encounter, AND it works for your whole team."

### 5.8 Source Priority for Implementation

| Phase | Sources | Rationale |
|-------|---------|-----------|
| **Phase 1** | Existing 5 AI adapters + `markdown` + `plaintext` + `pdf` + `url` | Covers 80% of Karpathy's use case |
| **Phase 2** | `obsidian-vault` + `epub` + `youtube` | Killer onramp + high engagement sources |
| **Phase 3** | `email-mbox` + `slack-export` + `notion-export` | Business/team sources |
| **Phase 4** | Live MCP connectors (Gmail, Slack, Notion, GitHub) | Real-time second brain |

Phase 1 turns hive-mind into a full second brain for researchers.
Phase 2 captures the Obsidian/Karpathy community.
Phase 3 enables the team/enterprise story.
Phase 4 makes it live and always-current.

### 5.9 Auto-Ingest via MCP Connectors — Zero-Effort Second Brain

Waggle already has 148+ MCP servers in its connector catalog. The insight:
**these aren't just tools for agents to use — they're live source feeds for
the second brain.**

Once a user connects their Gmail MCP, Slack MCP, Notion MCP, GitHub MCP, etc.,
the source pipeline can **automatically** pull new content on a schedule and
ingest it into the memory engine. No manual file drops. No export/import dance.
Set up once, then everything flows in.

```
┌─── CONNECTED MCP SERVERS ──────────────────────────┐
│                                                     │
│  Gmail MCP ─────────────┐                           │
│  Slack MCP ─────────────┤                           │
│  Notion MCP ────────────┤    ┌───────────────────┐  │
│  GitHub MCP ────────────┼───▶│ Auto-Ingest       │  │
│  Linear MCP ────────────┤    │ Scheduler         │  │
│  Google Calendar MCP ───┤    │                   │  │
│  Confluence MCP ────────┤    │ Poll interval:    │  │
│  Fireflies MCP ─────────┘    │ per-source config │  │
│                              └────────┬──────────┘  │
│                                       │             │
└───────────────────────────────────────┼─────────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │ Universal Source  │
                              │ Pipeline         │
                              │                  │
                              │ → Frames         │
                              │ → KG entities    │
                              │ → Vector index   │
                              │ → Wiki compile   │
                              └──────────────────┘
```

**How it works:**

| MCP Server | What Gets Ingested | Schedule |
|------------|-------------------|----------|
| Gmail | New emails matching filter rules (important, starred, specific labels) | Every 30 min |
| Slack | Messages in configured channels, DMs with AI tools | Every 15 min |
| Notion | Updated pages in watched databases/workspaces | Every 1 hour |
| GitHub | New issues, PR discussions, commit messages in watched repos | Every 1 hour |
| Linear | Issue updates, project changes | Every 1 hour |
| Google Calendar | Meeting events + linked transcripts | Every 30 min |
| Confluence | Updated pages in watched spaces | Every 2 hours |
| Fireflies/Granola | New meeting transcripts | After each meeting |

**User configuration (Settings > Auto-Ingest):**
```yaml
auto_ingest:
  gmail:
    enabled: true
    filter: "label:important OR is:starred"
    interval_minutes: 30
  slack:
    enabled: true
    channels: ["#engineering", "#product", "#ai-updates"]
    interval_minutes: 15
  github:
    enabled: true
    repos: ["waggle-os/waggle-os", "egzakta/kvark"]
    types: ["issues", "pull_requests", "discussions"]
    interval_minutes: 60
  notion:
    enabled: true
    databases: ["Product Roadmap", "Meeting Notes"]
    interval_minutes: 60
```

**The result:** Your second brain fills itself. You wake up, open Waggle, and
your wiki has already been updated with yesterday's emails, Slack threads,
meeting transcripts, and GitHub activity. Overnight compilation (dream cycles)
synthesized it all into updated entity pages, timeline entries, and gap reports.

**Enterprise scaling:** For Teams/KVARK, auto-ingest runs server-side. Every
team member's connected sources feed into the shared team wiki. Institutional
knowledge accumulates automatically — no one has to "maintain the wiki."

---

## 5A. EU AI Act Compliance Layer — The Second Brain as Audit Trail

### 5A.1 The Insight

The EU AI Act (full application: August 2, 2026) requires enterprises to
maintain comprehensive audit trails, logging, transparency, and human oversight
for AI systems. The penalties: up to EUR 35M or 7% of global revenue.

**The second brain IS the compliance artifact.** The same system that makes
you productive also makes you auditable. Every AI interaction, decision, and
source — automatically captured, searchable, citation-linked, and compiled
into a browsable wiki that auditors can review.

Nobody else has this. Credo AI ($25K+/yr) and Holistic AI (six figures/yr)
are bolt-on governance tools that track policies but not conversations. Claude's
new Compliance API captures usage logs but not the knowledge context. Waggle
IS the AI workspace AND the governance layer — compliance is native, not
bolted on.

### 5A.2 Article-by-Article Mapping

| AI Act Article | Requirement | How Hive Mind / Waggle Satisfies It |
|---------------|-------------|-------------------------------------|
| **Art. 12: Record-keeping** | Automatic logging of all events, inputs, outputs over system lifetime | FrameStore captures every AI interaction as timestamped frames. HarvestSourceStore tracks all ingestion events. SessionStore groups frames by session. Wiki log.md provides human-readable chronological record. |
| **Art. 13: Transparency** | Operations sufficiently transparent for deployers to interpret output | Compiled wiki IS the transparency layer. Every wiki page cites source frames. KG shows entity relationships. Identity layer shows who the user is. Model attribution per frame (which LLM generated what). |
| **Art. 14: Human oversight** | Appropriate human-machine interface for effective oversight | Wiki = human-readable view of all AI knowledge. Health.md flags contradictions, gaps, stale claims. Approval gates for high-impact actions. Read-only personas prevent unauthorized changes. Lint operation = systematic oversight check. |
| **Art. 19: Log retention** | Logs retained minimum 6 months | FrameStore retains permanently (SQLite). Wiki pages carry full history. Export capability for regulatory submission. |
| **Art. 26: Deployer obligations** | Monitor operation, keep auto-generated logs, ensure input relevance | Auto-ingest captures all inputs. Cost tracking per interaction. Awareness layer tracks active context. Wiki timeline shows evolution over time. |
| **Art. 50: Transparency (GPAI)** | AI-generated content must be machine-readable as such | Every frame tagged with source type (user_stated / tool_verified / agent_inferred / system). Wiki frontmatter identifies compilation as LLM-generated. KG confidence scores distinguish verified from inferred claims. |

### 5A.3 Compliance Wiki Pages (Auto-Generated)

The wiki compiler can generate compliance-specific page types:

| Page Type | Content | AI Act Article |
|-----------|---------|---------------|
| **audit-log.md** | Chronological record of all AI interactions, decisions, model versions | Art. 12 |
| **model-registry.md** | Which LLM models were used, when, for what, with what parameters | Art. 13, 50 |
| **decision-trail.md** | For each significant decision: what was decided, what frames informed it, what alternatives existed | Art. 14 |
| **data-provenance.md** | For each source: origin, ingest date, adapter used, frames generated, entity count | Art. 10 |
| **risk-assessment.md** | Per-workspace risk classification (auto-suggested from template type) | Art. 9 |
| **human-oversight-log.md** | All approval/denial/override events by human operators | Art. 14 |
| **contradiction-report.md** | All detected contradictions between sources, resolution status | Art. 13 |

### 5A.4 The Compliance Export

For regulatory review, the system can export:

```
compliance-export-2026-Q2/
├── audit-log.json              # Machine-readable full event log
├── audit-log.pdf               # Human-readable formatted version
├── model-registry.json         # All models used with metadata
├── decision-trails/            # Per-decision evidence packages
│   ├── decision-001.json
│   └── decision-001.pdf
├── data-provenance.json        # Complete source chain
├── risk-assessment.pdf         # Current risk classification
├── human-oversight-log.json    # Approval/deny/override events
├── wiki/                       # Full compiled wiki snapshot
│   ├── index.md
│   ├── entities/
│   ├── concepts/
│   └── compliance/
└── metadata.json               # Export metadata, timestamps, signatures
```

### 5A.5 The KVARK Enterprise Pitch

This is where the funnel tightens to KVARK:

> "Every AI interaction your organization has — across email, Slack, meetings,
> code reviews, customer calls — automatically captured in a living knowledge
> base. Your people get a second brain that makes them productive. Your
> compliance team gets an audit trail that satisfies the AI Act. Your auditors
> get a browsable wiki they can actually understand.
>
> And with KVARK, all of this runs on YOUR infrastructure. Your data never
> leaves your perimeter. Full sovereign deployment. Complete governance."

**Market timing:** August 2, 2026 deadline. Enterprises are scrambling.
AI governance market: $340M (2025) → $492M (2026) → $1B+ (2030), 28% CAGR.
Every company using AI in the EU needs this. Nobody else offers productivity
+ compliance in one system.

### 5A.6 Compliance as a Feature, Not a Tax

The critical UX principle: compliance should be **invisible to the user.**

The user works normally — chats with AI, reads articles, attends meetings,
writes code. The source pipeline captures everything. The wiki compiler
synthesizes it. The compliance pages are generated automatically alongside
the regular wiki. The user never thinks about compliance.

Only when an auditor asks "show me your AI governance" does the user open
the compliance tab and export. Everything is already there.

**This is "compliance by default" — the second hook (alongside Memory Harvest)
for enterprise adoption.**

---

## 5B. Privacy Architecture — Local-First, User-Controlled

### 5B.1 Core Principle

**Your second brain is YOUR brain.** No cloud. No telemetry. No phone-home.
Every byte stays on your machine unless you explicitly choose to share it.

This isn't just a feature — it's the trust foundation. If users don't trust
that their emails, Slack DMs, meeting transcripts, and AI conversations are
private, they won't connect their sources. Privacy is the prerequisite for
the entire system working.

### 5B.2 Privacy Tiers

| Tier | Data Location | Sharing | Encryption | Use Case |
|------|--------------|---------|------------|----------|
| **Personal** (default) | Local device only (~/.waggle/) | Never leaves device | Optional (SQLCipher) | Free/Pro users |
| **Team Shared** | Team server (MinIO/S3) | Explicitly promoted frames only | Encrypted at rest + in transit | Teams tier |
| **Enterprise Sovereign** | Customer infrastructure (KVARK) | Governed by RBAC + policies | Full encryption + audit | KVARK tier |

### 5B.3 Privacy Controls

**Per-Source Privacy Settings:**
```yaml
sources:
  gmail:
    privacy: private          # never shared to team wiki
    pii_filter: redact        # strip emails, phones, SSN
    retention: 1y             # auto-delete after 1 year
  slack:
    privacy: team-eligible    # can be promoted to team wiki
    pii_filter: flag          # flag but don't redact
    channels_excluded: ["#random", "#social"]
  meetings:
    privacy: private
    pii_filter: redact
    transcript_retention: 6mo
```

**PII Detection & Filtering on Ingest:**
- Email addresses → `[EMAIL]`
- Phone numbers → `[PHONE]`
- Credit card numbers → `[CC]`
- Social Security / ID numbers → `[SSN]`
- API keys / tokens → `[SECRET]`
- Passwords → `[PASSWORD]`
- Custom patterns (user-defined regex)

Configurable modes:
1. **Redact** — replace PII with placeholders before storing
2. **Flag** — store but mark as sensitive (excluded from wiki compilation)
3. **Pass-through** — store as-is (user accepts risk)
4. **Ask** — prompt user on first encounter of each PII type

**Frame-Level Privacy:**
```typescript
interface FramePrivacy {
  visibility: 'private' | 'team-eligible' | 'team-shared';
  pii_detected: boolean;
  pii_types?: string[];      // ['email', 'phone', 'api_key']
  redacted: boolean;
  source_privacy: string;     // inherited from source config
  promoted_by?: string;       // who promoted to team (audit trail)
  promoted_at?: string;       // when
}
```

### 5B.4 Right to Forget

Users must be able to delete any source and ALL derived data:

```
Delete source "Gmail import 2026-03-15"
  → Delete all frames from this source
    → Delete all KG entities only sourced from these frames
      → Delete all wiki pages that relied solely on these frames
        → Re-compile affected wiki pages that had mixed sources
          → Update index.md
```

**Cascade delete** with source tracking. Every frame knows its source.
Every wiki page knows its frames. The chain is traceable and deletable.

### 5B.5 Data Portability

Everything is open formats:
- Memory: SQLite database (standard, readable by any tool)
- Wiki: Markdown files (editable in any editor)
- KG: JSON export of entities + relations
- Full export: ZIP of everything, ready to move to another system

**No vendor lock-in.** This is critical for trust AND for GDPR Art. 20
(right to data portability).

### 5B.6 GDPR Compliance Mapping

| GDPR Article | Requirement | How We Comply |
|-------------|-------------|---------------|
| Art. 5(1)(c) | Data minimization | Per-source filters, PII redaction, retention limits |
| Art. 6 | Lawful basis | User explicitly connects each source (consent) |
| Art. 13-14 | Information provision | Transparency dashboard: "What data do I have?" |
| Art. 15 | Right of access | Full data export in open formats |
| Art. 17 | Right to erasure | Cascade delete per source |
| Art. 20 | Data portability | SQLite + Markdown + JSON export |
| Art. 25 | Data protection by design | Local-first, no cloud default, encryption option |
| Art. 32 | Security | SQLCipher encryption at rest, no network transmission |

### 5B.7 Zero-Telemetry Pledge (Open-Source Product)

For hive-mind (open-source):
- **ZERO telemetry.** No analytics. No crash reports. No usage tracking.
- **ZERO network calls** except to user-configured LLM API and user-connected MCP servers.
- **ZERO cloud dependencies.** Everything runs locally. SQLite, not Postgres.
- **Auditable.** Open source. Anyone can verify.

This is the trust moat. When users compare hive-mind to GBrain (PGLite +
potential cloud), Mem0 (cloud option), or any SaaS — we're the one they
can verify won't leak their data.

---

## 5C. Complete Source Coverage + Custom Adapters

### 5C.1 Full AI System Harvest Coverage

Current adapters only cover 5 systems. The complete list of AI systems
people use in 2026 that need harvest adapters:

**Tier 1 — Must-Have (ship with v1):**

| AI System | Export Method | Adapter Status |
|-----------|-------------|----------------|
| ChatGPT | JSON export (Settings > Data controls) | EXISTS |
| Claude | JSON export (Settings > Account) | EXISTS |
| Claude Code | Session JSON | EXISTS |
| Gemini | JSON export (Google Takeout) | EXISTS |
| Perplexity | GDPR request → JSON, or browser extension scrape | NEW |
| Microsoft Copilot | account.microsoft.com/privacy/copilot | NEW |
| GitHub Copilot Chat | VS Code chat history (SQLite in extension dir) | NEW |

**Tier 2 — High Value:**

| AI System | Export Method | Notes |
|-----------|-------------|-------|
| Cursor | SQLite session DB (~/.cursor/) | Popular AI code editor |
| Windsurf | Session files (~/.windsurf/) | Growing AI code editor |
| Grok (X) | Account data export | X/Twitter AI |
| DeepSeek | Chat export | Chinese AI, growing Western usage |
| Mistral (Le Chat) | Chat export | EU-based AI |
| NotebookLM | Google Takeout | Google's research AI |
| Poe | Account export | Multi-model AI platform |
| v0 (Vercel) | Session history | Design/code AI |
| Replit AI | Workspace export | Code generation |
| Bolt / Lovable | Session export | Code generation platforms |

**Tier 3 — Niche but Requested:**

| AI System | Export Method |
|-----------|-------------|
| Character.AI | GDPR request |
| Pi (Inflection) | Account export |
| Cohere Coral | API history |
| Together AI | Usage logs |
| Groq Playground | Session history |

### 5C.2 Microsoft Stack — Full Coverage

Microsoft is THE enterprise stack. One `microsoft-graph` MCP connector
covers everything via the unified Graph API:

| Service | What Gets Ingested | Graph API Endpoint |
|---------|-------------------|-------------------|
| **Outlook** | Emails (filtered by rules) | /me/messages |
| **Calendar** | Events + attendees + notes | /me/events |
| **Teams Chats** | 1:1 and group messages | /me/chats/messages |
| **Teams Channels** | Channel messages in joined teams | /teams/{id}/channels/{id}/messages |
| **Teams Meetings** | Meeting transcripts (if available) | /me/onlineMeetings/{id}/transcripts |
| **OneDrive** | Document content (Word, Excel, PDF) | /me/drive/items |
| **SharePoint** | Site pages, document libraries | /sites/{id}/pages |
| **OneNote** | Notebooks, sections, pages | /me/onenote/pages |
| **Planner** | Tasks, plans, buckets | /me/planner/tasks |
| **To Do** | Task lists, tasks | /me/todo/lists |

**Authentication:** OAuth 2.0 via Microsoft identity platform. User grants
delegated permissions. No admin consent required for personal data.
Enterprise admin can pre-authorize via Entra ID for team-wide deployment.

**Implementation:** Use the existing `microsoft-365` MCP server from our
catalog, or the official Anthropic M365 connector. Both use Microsoft Graph.
Wire as an auto-ingest source with per-service toggle and filter rules.

### 5C.3 Manual Source Input

Not everything comes from a connector. Users need frictionless manual input:

**In Waggle Desktop UI:**
- **Quick Add** (keyboard shortcut: Ctrl+Shift+N): Floating input field.
  Type or paste anything. Auto-detects: URL → fetch and ingest, file path →
  read and ingest, plain text → save as frame.
- **File Drop Zone**: Drag & drop files onto any workspace. Supports: PDF,
  markdown, text, Word (.docx), images (OCR via LLM vision), audio (Whisper
  transcription).
- **Clip from Browser**: Browser extension that sends current page to Waggle
  as a source. One click. Like Obsidian Web Clipper but for your second brain.
- **Share Target**: Register as a system share target on Windows/macOS. Share
  from any app → ingests into active workspace.

**In CLI:**
```bash
# Ingest a file
hive-mind add paper.pdf
hive-mind add meeting-notes.md
hive-mind add ~/Documents/report.docx

# Ingest a URL
hive-mind add https://arxiv.org/abs/2401.12345

# Ingest pasted text
echo "Key decision: we're going with React for the frontend" | hive-mind add -

# Ingest a whole directory
hive-mind add ./research-papers/ --recursive

# Ingest with metadata
hive-mind add paper.pdf --tags "ml,transformers" --importance critical
```

**In MCP (for AI agents):**
```
Tool: ingest_source
  content: "string or file path or URL"
  type_hint: "pdf" | "url" | "markdown" | "text" | "auto"
  importance: "critical" | "important" | "normal"
  tags: ["optional", "tags"]
  workspace: "optional workspace ID"
```

### 5C.4 Custom Adapters — Extensible by Design

Users and the community must be able to add their own source adapters:

**Adapter Interface:**
```typescript
interface SourceAdapter {
  /** Unique adapter ID */
  id: string;

  /** Human-readable name */
  displayName: string;

  /** Supported input types */
  accepts: ('file' | 'url' | 'json' | 'text' | 'directory')[];

  /** File extensions this adapter handles (e.g., ['.pdf', '.epub']) */
  extensions?: string[];

  /** Parse input into source items */
  parse(input: unknown, options?: AdapterOptions): SourceItem[];

  /** Optional: detect if this adapter can handle the input */
  canHandle?(input: unknown): boolean;
}

interface AdapterOptions {
  /** Maximum content length per item */
  maxContentLength?: number;
  /** Extract entities via LLM */
  extractEntities?: boolean;
  /** PII filtering mode */
  piiFilter?: 'redact' | 'flag' | 'pass' | 'ask';
  /** Custom metadata to attach */
  metadata?: Record<string, unknown>;
}
```

**Custom Adapter Registration:**
```bash
# Register a custom adapter from a JS/TS file
hive-mind adapters add ./my-custom-adapter.ts

# List registered adapters
hive-mind adapters list

# Remove a custom adapter
hive-mind adapters remove my-custom-id
```

**Community Adapter Registry:**
- Published as npm packages: `hive-mind-adapter-*`
- Install: `npm install hive-mind-adapter-jira`
- Auto-discovered on startup
- Community-maintained, reviewed for security

### 5C.5 Custom Automations

Beyond adapters, users need custom automation triggers:

**Webhook Ingest:**
```bash
# Start local webhook server
hive-mind webhooks start --port 9876

# POST from any tool (Zapier, n8n, Make, custom scripts)
curl -X POST http://localhost:9876/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Meeting decision: launch Q3", "source": "custom"}'
```

**File Watch:**
```yaml
# Watch a directory for new files → auto-ingest
automations:
  - type: file-watch
    path: ~/Downloads/research/
    pattern: "*.pdf"
    adapter: pdf
    workspace: research-project
    on_ingest: compile  # auto-compile wiki after ingest
```

**Schedule:**
```yaml
# Run on a schedule
automations:
  - type: cron
    schedule: "0 6 * * *"        # every day at 6 AM
    action: compile               # compile wiki
  - type: cron
    schedule: "0 22 * * *"       # every night at 10 PM
    action: lint                  # health check
  - type: cron
    schedule: "*/30 * * * *"     # every 30 minutes
    action: ingest-mcp            # pull from connected MCP sources
```

### 5C.6 UX — Killer Easy Setup

The entire source configuration must be accessible to non-technical users.

**Onboarding Flow (Waggle Desktop):**

```
Step 1: "Welcome to your Second Brain"
  → Brief 10-second animation showing the concept

Step 2: "Connect your AI tools" (checkboxes)
  [✓] ChatGPT    → "Upload your export (Settings > Data controls > Export)"
  [✓] Claude     → "Upload your export (Settings > Account > Export)"
  [ ] Perplexity → "Request your data (Settings > Privacy > Request data)"
  [ ] Copilot    → "Download from account.microsoft.com/privacy"
  [Skip for now]

Step 3: "Connect your work tools" (OAuth one-click)
  [Connect Gmail]      → OAuth popup → done
  [Connect Slack]      → OAuth popup → done
  [Connect Notion]     → OAuth popup → done
  [Connect Microsoft 365] → OAuth popup → done
  [Skip for now]

Step 4: "Import existing knowledge" (optional)
  [Import Obsidian Vault] → folder picker → done
  [Import Files]          → drag & drop zone → done
  [Skip for now]

Step 5: "Privacy settings"
  ○ Maximum privacy (all PII redacted, no team sharing)
  ○ Balanced (PII flagged, team sharing opt-in per source)
  ○ Open (no filtering, full team sharing)
  [Customize per source] → advanced settings

Step 6: "Your second brain is ready"
  → First compilation starts
  → "Check back in 10 minutes for your first wiki"
```

**CLI Setup:**
```bash
$ hive-mind init

  Welcome to Hive Mind — your second brain engine.

  ? Choose a schema template:
    ❯ Personal (journal, articles, podcasts, self-improvement)
      Research (papers, articles, notes, thesis development)
      Business (meetings, emails, projects, team knowledge)
      Custom (start from scratch)

  ? Set privacy level:
    ❯ Maximum (all PII redacted, local only)
      Balanced (PII flagged, sharing opt-in)
      Open (no filtering)

  ? Connect sources now? (you can add more later)
    [y/N]: y

  Initialized in ~/.hive-mind/
  Run 'hive-mind add <file-or-url>' to start ingesting.
  Run 'hive-mind compile' to build your wiki.
```

---

## 6. Dual-Track Delivery Plan

### Track A: Waggle Feature (packages/wiki-compiler)

The wiki compiler as a native Waggle workspace capability.

**Integration points:**
- New tab in MemoryApp: "Wiki" — browse compiled pages
- New agent tool: `compile_wiki` — trigger compilation
- New agent tool: `search_wiki` — search compiled pages
- Settings: compilation schedule, schema editing
- FilesApp: wiki pages appear as browsable markdown
- Workspace export: "Export as Obsidian vault" (wiki + raw sources)

**Technical implementation:**
- New package: `packages/wiki-compiler/`
- Depends on: `@waggle/core` (FrameStore, HybridSearch, KnowledgeGraph)
- Output: markdown files in `~/.waggle/workspaces/{id}/wiki/`
- LLM calls: via the existing agent infrastructure (orchestrator)
- Compilation state: SQLite table tracking watermarks, page hashes

**Waggle-specific advantages:**
- Per-workspace wikis with workspace-specific schemas
- Cross-workspace wiki search (leveraging MultiMindCache)
- Team wiki (shared team memory → compiled team wiki)
- Identity-aware compilation ("compile with context of who I am")
- GEPA optimization for cheaper compilation with smaller models

### Track B: Open-Source Product (hive-mind-mcp)

A standalone MCP server + CLI that implements the full wiki compiler pattern
independently of Waggle's desktop app.

**Product name:** `hive-mind` (working title)

**Positioning:** *"Karpathy showed you the pattern. GBrain gave you markdown
files. Hive Mind gives you the engine — real search, knowledge graph, compiled
wiki, team sharing. Open source."*

**Architecture:**
```
hive-mind/
├── packages/
│   ├── core/          # Memory engine (extracted from @waggle/core)
│   │   ├── frame-store.ts
│   │   ├── hybrid-search.ts
│   │   ├── knowledge-graph.ts
│   │   ├── identity.ts
│   │   ├── awareness.ts
│   │   └── session-store.ts
│   ├── compiler/      # Wiki compiler (NEW)
│   │   ├── compiler.ts        # Core compilation loop
│   │   ├── page-generators/   # Per-type page generators
│   │   ├── linker.ts          # Cross-reference resolver
│   │   ├── linter.ts          # Health check / contradiction finder
│   │   └── schema-parser.ts   # Wiki schema governance
│   ├── harvest/       # Source adapters
│   │   ├── chatgpt.ts
│   │   ├── claude.ts
│   │   ├── gemini.ts
│   │   └── universal.ts
│   ├── mcp-server/    # MCP server (stdio transport)
│   │   ├── tools/     # 20+ MCP tools
│   │   └── resources/ # MCP resources
│   └── cli/           # CLI interface
│       ├── ingest.ts
│       ├── compile.ts
│       ├── search.ts
│       ├── lint.ts
│       └── export.ts
├── schemas/           # Example wiki schemas for different domains
│   ├── research.md
│   ├── business.md
│   ├── personal.md
│   └── reading.md
├── docs/
└── README.md
```

**MCP Tools (exposed to Claude Code / Claude Desktop / any MCP client):**

| Category | Tool | Description |
|----------|------|-------------|
| Memory | `save_memory` | Save a fact/decision/preference |
| Memory | `recall_memory` | Hybrid search across all memory |
| Knowledge | `search_entities` | Search knowledge graph |
| Knowledge | `save_entity` | Create/update entity |
| Knowledge | `create_relation` | Link entities |
| Wiki | `compile_wiki` | Trigger incremental compilation |
| Wiki | `compile_full` | Full wiki rebuild |
| Wiki | `compile_page` | Compile a single page |
| Wiki | `lint_wiki` | Run health check |
| Wiki | `search_wiki` | Search compiled pages |
| Wiki | `get_page` | Read a compiled wiki page |
| Wiki | `file_answer` | Save a query answer as a wiki page |
| Harvest | `harvest_import` | Import from AI systems |
| Harvest | `harvest_sources` | List registered sources |
| Identity | `get_identity` / `set_identity` | User profile |
| Awareness | `get_awareness` / `set_awareness` | Current context |
| Workspace | `list_workspaces` / `create_workspace` | Manage workspaces |
| Export | `export_obsidian` | Export as Obsidian vault |

**CLI Interface:**
```bash
# Initialize a new brain
hive-mind init --schema research

# Ingest a source
hive-mind ingest paper.pdf --source research
hive-mind ingest chatgpt-export.json --source chatgpt

# Compile the wiki
hive-mind compile              # incremental
hive-mind compile --full       # full rebuild
hive-mind compile --page "Project Alpha"  # single page

# Search
hive-mind search "what do we know about React performance"
hive-mind search --entities "John Smith"

# Health check
hive-mind lint
hive-mind lint --fix  # auto-fix what's possible

# Export
hive-mind export --format obsidian --output ./my-vault
```

**Why open source?**
1. Rides the Karpathy wave with genuine technical depth
2. Community adoption → contributors → ecosystem
3. Every hive-mind user is a potential Waggle convert (needs desktop app for
   full experience) or KVARK lead (needs team/enterprise features)
4. MIT license, same as GBrain — no friction
5. Memory engine quality speaks for itself vs. GBrain's markdown instructions

---

## 7. Revised Execution Plan (post-evaluation, April 13)

> **Key insight from live test:** The wiki compiler isn't the bottleneck —
> data quality is. personal.mind has 80% test noise, the KG has 80%
> misclassified entities, and only 8 relations across 2,734 entities.
> Building a compiler on noisy data produces noisy pages. Fix the input first.

### v1 — BUILD (3-4 sessions)

**Session A: Data Foundation**
- [ ] Wipe personal.mind test pollution (E2E/benchmark frames + garbage entities)
- [ ] KG cleanup: delete entities where name is common noun + type is "person"
- [ ] KG dedup: merge entities with same normalized name + type
- [ ] Improve Claude Code harvest adapter: extract DECISIONS and DIRECTIONS
      from user messages in session JSONL, not just plans/rules
- [ ] Add `markdown` + `pdf` + `url` source adapters to harvest pipeline
- [ ] Add `ingest_source` MCP tool

**Session B: Core Compiler**
- [ ] Create `packages/wiki-compiler/` with types + interfaces
- [ ] Compilation state tracking (SQLite: watermarks, page hashes)
- [ ] `compileEntityPage()` — entity → gather frames + KG → LLM synthesis → markdown
- [ ] `compileConceptPage()` — topic → search → LLM synthesis → markdown
- [ ] `compileSynthesisPage()` — cross-source pattern detection (the killer feature)
- [ ] `compileIndex()` — navigable catalog with summaries
- [ ] Incremental compilation (only new frames since watermark)
- [ ] `compileHealth()` — contradictions, gaps, orphans, data quality

**Session C: MCP + Wire**
- [ ] Add wiki tools to memory-mcp: `compile_wiki`, `search_wiki`, `get_page`,
      `lint_wiki`, `file_answer`
- [ ] Add wiki resources: `memory://wiki/index`, `memory://wiki/page/{name}`
- [ ] Wire compilation to LLM (Haiku default, Ollama fallback)
- [ ] Test: "compile my wiki" → "search wiki for X" → browse pages

### v1 — TEST (the real validation)

**Test Protocol — Marko's Real Second Brain**

```
PHASE 1: Clean Slate
  - Wipe all E2E test data from personal.mind
  - Verify: 0 frames, 0 entities, clean database
  - Run Waggle OS normally for real work (not testing)
  - After the build session(s), personal.mind will have REAL frames
    from actual Waggle usage during development

PHASE 2: Harvest All AI Accounts (Marko's real data)

  Source                  Export Method                          Est. Data
  ─────────────────────── ────────────────────────────────────── ──────────
  Claude Code sessions    JSONL files (~200MB, 20+ sessions,     HIGH
                          2-3 months of history)
  Claude.ai (claude.com)  Settings > Account > Export data        HIGH
  Claude Cowork           Export from Cowork interface             MEDIUM
  ChatGPT                 Settings > Data controls > Export        MEDIUM
  Perplexity              Settings > Privacy > Request data        MEDIUM
                          (GDPR export → JSON)
  X.AI (Grok)             Account data export                     LOW-MED
  Google Gemini            Google Takeout                          MEDIUM
  Google NotebookLM        Google Takeout                          LOW-MED
  Genspark                 Account export / GDPR request           LOW

  Total estimated: 500-2000 frames of REAL knowledge

PHASE 3: Microsoft Graph (real business data)

  Connect Marko's Microsoft 365 via Graph API:
  - Outlook: filtered to important/starred emails
  - Teams: key channels only (not noise)
  - Calendar: meetings with notes
  - OneDrive/SharePoint: key documents
  - Apply PII filtering: redact mode for emails, flag for Teams

PHASE 4: Compile + Evaluate

  - Run full wiki compilation on all harvested data
  - Generate entity pages, concept pages, synthesis pages
  - Generate health report
  - Evaluate:
    [ ] Does the Waggle OS page match reality?
    [ ] Does Marko's page capture real working patterns?
    [ ] Do cross-session synthesis pages reveal new insights?
    [ ] Are entity relations meaningful (not noise)?
    [ ] Is the health report actionable?
    [ ] Would Marko read this wiki daily?
    [ ] Hit rate target: 80%+ pages are genuinely useful

PHASE 5: Iterate

  - Fix issues found in evaluation
  - Re-compile
  - If hit rate >= 80%: proceed to v2
  - If hit rate < 80%: diagnose and fix before continuing
```

### v2 — SCALE (post-test, estimated 4-6 sessions)

Only proceed after v1 test validates the output quality.

**v2a: Waggle UI**
- [ ] New "Wiki" tab in MemoryApp (markdown renderer + wikilink navigation)
- [ ] Compile button + progress indicator
- [ ] Health dashboard
- [ ] "Open in Obsidian" export button

**v2b: Additional Harvest Adapters**
- [ ] Perplexity adapter (GDPR JSON export)
- [ ] Microsoft Copilot adapter
- [ ] GitHub Copilot Chat adapter (VS Code SQLite)
- [ ] Cursor / Windsurf session adapters
- [ ] Grok (X.AI) adapter
- [ ] Genspark adapter

**v2c: Auto-Ingest via MCP**
- [ ] Microsoft Graph auto-ingest (Outlook, Teams, Calendar)
- [ ] Gmail MCP auto-ingest
- [ ] Slack MCP auto-ingest
- [ ] Configurable poll intervals + filter rules
- [ ] Privacy controls: per-source PII filtering, default OFF

**v2d: Open-Source Package**
- [ ] Extract into standalone `hive-mind` repo
- [ ] CLI interface
- [ ] README with Karpathy attribution
- [ ] npm publish

**v2e: Compliance Layer**
- [ ] Auto-generated compliance pages (audit-log, model-registry, decision-trail)
- [ ] Compliance export package (JSON + PDF)
- [ ] Wire to Waggle Teams/KVARK tier

---

## 8. Technical Decisions

### 7.1 LLM for Compilation

The compiler needs an LLM to synthesize frames into wiki pages. Options:

| Approach | Pros | Cons |
|----------|------|------|
| **Via Waggle orchestrator** | Reuses existing infrastructure, cost tracking, model routing | Coupled to Waggle |
| **Direct API call** | Simple, standalone-friendly | Need own key management |
| **GEPA-optimized** | Haiku/Sonnet quality at fraction of Opus cost | Needs GEPA implementation |
| **Local (Ollama)** | Free, private, offline | Slower, lower quality |

**Decision:** Support all four. Default to direct API call for standalone,
orchestrator for Waggle integration. GEPA as optimization layer. Ollama as
free fallback.

### 7.2 Compilation Cost Model

Rough estimates for a workspace with 500 frames, 50 entities:

| Operation | LLM Calls | Input Tokens | Output Tokens | Cost (Haiku) |
|-----------|-----------|-------------|---------------|-------------|
| Full compile (50 pages) | 50 | ~500K | ~100K | ~$0.15 |
| Incremental (5 pages) | 5 | ~50K | ~10K | ~$0.015 |
| Lint pass | 10 | ~200K | ~20K | ~$0.04 |
| File answer as page | 1 | ~10K | ~2K | ~$0.003 |

**With GEPA (Haiku + prompt optimization):** 3-5x cheaper than raw Opus.
This makes compilation economically viable even for free-tier users if we
use Haiku with optimized prompts.

### 7.3 Citation Chain

Every claim in a wiki page MUST cite its source frame(s):

```markdown
- **Status:** In development (frame #201, 2026-03-20)
```

Frame IDs in frontmatter `frame_ids` array enable:
- Click-through from wiki page → original frame
- Confidence calculation (more frames = higher confidence)
- Staleness detection (oldest frame age)
- Contradiction detection (conflicting frames on same claim)

### 7.4 Wikilink Format

Use Obsidian-compatible wikilinks: `[[Page Name]]`

Cross-references generated automatically by the linker:
1. Scan page content for known entity names
2. Insert wikilinks where entities are mentioned
3. Maintain backlink index (which pages link to which)

### 7.5 Storage Location

```
~/.waggle/workspaces/{id}/
├── workspace.mind          # SQLite (frames, KG, search index)
├── workspace.json          # Workspace config
├── wiki/                   # Compiled wiki output (NEW)
│   ├── index.md
│   ├── log.md
│   ├── health.md
│   ├── entities/
│   │   ├── john-smith.md
│   │   ├── project-alpha.md
│   │   └── ...
│   ├── concepts/
│   │   ├── react-performance.md
│   │   └── ...
│   ├── topics/
│   │   ├── q2-launch-plan.md
│   │   └── ...
│   └── queries/            # Filed answers
│       ├── comparison-react-vs-vue.md
│       └── ...
├── files/                  # Virtual filesystem
└── sessions/
```

---

## 9. Differentiation Matrix

### vs. Karpathy's LLM Wiki

| Dimension | Karpathy | Hive Mind |
|-----------|----------|-----------|
| Search | index.md (breaks ~500 docs) | FTS5 + sqlite-vec + RRF (10K+ docs) |
| Knowledge structure | Backlinks between pages | Typed KG with confidence scores |
| Source input | Manual (Obsidian Web Clipper) | Auto-harvest from 5+ AI systems |
| Multi-topic | One wiki per folder | Multi-workspace with isolation |
| Team | No | Team memory sync + team wiki |
| Identity | No | Identity + Awareness layers |
| Temporal | Pages updated in place | Frame timestamps + temporal queries |
| Scale ceiling | ~100-500 sources | Thousands (SQLite + vector index) |
| Output | Wiki IS the system | Wiki is a compiled VIEW of deeper memory |

### vs. GBrain

| Dimension | GBrain | Hive Mind |
|-----------|--------|-----------|
| Storage | PGLite + markdown files | SQLite + FTS5 + sqlite-vec |
| Search | pgvector semantic only | Hybrid (BM25 + vector + RRF) |
| KG | Entity pages (markdown) | Typed entities + relations + confidence |
| Compilation | Markdown instructions for agents | Executable code with real compiler loop |
| Dream cycles | Prompt instructions | Scheduled compilation with state tracking |
| Team | No | Team memory sync |
| Harvest | Gmail, Calendar integrations | ChatGPT, Claude, Gemini, universal |
| Workspace isolation | No | Multi-workspace with cross-search |
| Identity | No | Identity + Awareness layers |
| Infrastructure | Requires Postgres (or PGLite WASM) | Zero external deps (embedded SQLite) |

### vs. Mem0 / Zep / Hindsight

| Dimension | Memory Frameworks | Hive Mind |
|-----------|------------------|-----------|
| Memory storage | Yes (various backends) | Yes (SQLite, embedded) |
| Search | Yes (various strategies) | Yes (hybrid BM25 + vector + RRF) |
| Knowledge graph | Some (Mem0, Zep) | Yes (typed, with confidence) |
| **Wiki output** | **No** | **Yes** |
| **Human-readable** | **No** | **Yes** |
| **Compounding synthesis** | **No** | **Yes** |
| Harvest pipeline | No | Yes (5+ AI systems) |
| Team sharing | Mem0 Cloud only | Built-in (team sync) |

The key differentiator: **no existing memory framework produces a human-readable
compiled wiki.** They all store memory for agents to use. None compile it into
something humans can browse, learn from, and build on.

---

## 10. Open-Source Launch Strategy

### 9.1 Naming

**Working title:** `hive-mind`
**npm package:** `hive-mind-mcp`
**GitHub:** `egzakta/hive-mind` (or `waggle-os/hive-mind`)

Alternative names to consider:
- `mind-compiler`
- `wiki-mind`
- `memory-wiki`
- `second-brain-engine`

### 9.2 Positioning

**Tagline options:**
- "Karpathy showed you the pattern. We built the engine."
- "Your memory, compiled."
- "The memory engine behind the wiki."
- "From conversations to knowledge. Automatically."

**README lead:**

> Hive Mind is an open-source memory engine + wiki compiler for AI agents.
> It extends [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
> with production-grade infrastructure: hybrid search (BM25 + vector + RRF),
> typed knowledge graph with confidence scoring, multi-source harvest
> (ChatGPT, Claude, Gemini), and automatic wiki compilation.
>
> Works as an MCP server (Claude Code, Claude Desktop), CLI tool, or
> library. Your memory stays local. Your wiki stays current.

### 9.3 Launch Sequence

1. **Pre-launch (1 week before):**
   - Ship working MCP server + CLI with at least compile, search, lint
   - Record 2-minute demo video: ingest → compile → browse in Obsidian
   - Write blog post: "Extending Karpathy's LLM Wiki with a Real Engine"

2. **Launch day:**
   - GitHub repo public (MIT license)
   - npm publish
   - X thread (tag Karpathy, reference his gist, show the extension)
   - Hacker News post
   - r/LocalLLaMA, r/ClaudeAI, r/ObsidianMD posts

3. **Post-launch (week 1-2):**
   - Product Hunt
   - Dev.to article
   - YouTube walkthrough
   - Community Discord

### 9.4 Funnel to Waggle / KVARK

```
Open-source hive-mind (free, MIT)
  → "Want a desktop app?" → Waggle Free tier
    → "Want unlimited agents?" → Waggle Pro ($19/mo)
      → "Want team knowledge?" → Waggle Teams ($49/seat)
        → "Want enterprise governance?" → KVARK (consultative sale)
```

The open-source product is the top of the funnel. Every `hive-mind` user who
wants a GUI, team features, or enterprise governance flows toward Waggle/KVARK.

---

## 11. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Compilation cost too high | Users hit budget limits | GEPA optimization, Haiku default, incremental-only |
| Hallucinated synthesis | Wiki contains false claims | Citation chains, confidence scores, lint passes |
| Wiki staleness | Pages drift from reality | Automated incremental compilation on frame count triggers |
| GBrain captures the market first | Reduced differentiation window | Ship faster, emphasize technical depth (real search, real KG, real code vs. markdown instructions) |
| Karpathy buzz fades | Smaller launch impact | Build product value independent of the reference — the wiki compiler is genuinely useful |
| LLM quality variance | Inconsistent wiki quality | Schema governance + GEPA + model routing |
| Token context limits | Can't fit all frames for large entities | Chunked compilation with summarization tiers |

---

## 12. Success Metrics

### Open-Source (hive-mind)
- GitHub stars: 1,000 in first week (GBrain did 5,400 in 24h — aspirational)
- npm downloads: 500/week within first month
- MCP server installs: tracked via Claude Code marketplace
- Community PRs: at least 5 within first month

### Waggle Feature
- Wiki compilation triggered by 30%+ of active workspace users
- Average wiki size: 20+ pages per active workspace
- User retention uplift: measurable increase in DAU after wiki feature ships

### KVARK Pipeline
- At least 3 enterprise inquiries attributable to wiki/hive-mind within
  first quarter
- "Institutional knowledge wiki" becomes a slide in KVARK sales deck

---

## 13. Open Questions

1. **Should the wiki replace FilesApp or live alongside it?** Current thinking:
   alongside — wiki is a compiled view, files are user-managed documents.

2. **Should compilation happen on the client or server?** For Waggle desktop:
   client (sidecar). For Teams: server-side (team wiki needs central compilation).

3. **How to handle conflicting compilations in team wikis?** If two team members'
   agents compile simultaneously, need merge strategy. Git-style (markdown is
   mergeable) or lock-based?

4. **Should the wiki be editable by humans?** Karpathy says no — "the LLM owns
   the wiki." But users will want to correct things. Allow human edits with a
   "manually edited" flag that the compiler preserves?

5. **What's the minimum viable wiki?** For launch: entity pages + index + lint.
   Concept pages, timelines, comparisons can follow.

6. **GEPA readiness?** The GEPA prompt optimization system (backlog item) would
   dramatically reduce compilation cost. Should we prioritize GEPA before or
   after the wiki compiler?

---

## References

- [Karpathy's LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [GBrain by Garry Tan](https://github.com/garrytan/gbrain)
- [LLM Wiki v2 — agentmemory extensions](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2)
- [Rowboat — typed entity approach](https://blog.dailydoseofds.com/p/the-next-step-after-karpathys-wiki)
- [Enterprise analysis by Epsilla](https://www.epsilla.com/blogs/llm-wiki-kills-rag-karpathy-enterprise-semantic-graph)
- [AI Agent Memory Frameworks Comparison](https://vectorize.io/articles/best-ai-agent-memory-systems)
- [VentureBeat: Karpathy LLM Knowledge Base](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an)
- [OpenMemory MCP by Mem0](https://mem0.ai/openmemory)
- [Hindsight MCP Memory Server](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory)

---

*Spec by Marko Markovic / Egzakta Group. April 2026.*
*This document is a strategic planning artifact, not a commitment to ship all features described.*
