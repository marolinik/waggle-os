---
type: concept
name: "Memory Harvest"
confidence: 0.85
sources: 30
last_compiled: 2026-04-13T20:36:35.605Z
frame_ids: [34, 22, 24, 21, 784, 793, 905, 808, 918, 1005, 799, 930, 915, 925, 907, 174, 917, 924, 171, 927, 786, 167, 803, 796, 926, 797, 154, 928, 781, 150]
related_entities: ["Memory Harvest"]
---

# Memory Harvest

# Memory Harvest

## TL;DR

Memory Harvest is Waggle OS's strategic moat—a universal import system that consolidates AI conversations from 20+ platforms into a single governed workspace. It's free forever and drives adoption by solving the fragmentation problem enterprises face with scattered AI interactions.

## What We Know

### Core Definition & Purpose

Memory Harvest is a four-pass LLM distillation pipeline that imports conversations from external AI systems (ChatGPT, Claude, Gemini, etc.) and converts them into Waggle's 5-layer memory format (I/P/B frames + Knowledge Graph + compliance metadata) [[#917, #905, #793]].

**Strategic role:** It's the primary demand-generation hook for KVARK. Enterprises adopt Waggle for memory consolidation, discover it solves EU AI Act compliance (audit trails, Art. 12/14/19/26/50 tracking), then graduate to sovereign KVARK deployment [[#793, #1005, #907]]. This compounds into the TAM expansion: Waggle is free moat → Teams is $49/seat/mo → KVARK is EUR 400K–1.2M per enterprise [[#930, #793]].

### Architecture & Implementation

**Status:** Fully implemented and tested as of 2026-04-10 [[#905]].

**Pipeline layers:**
1. **5 source adapters** (Phase 1 complete):
   - ChatGPT JSON export
   - Claude conversation export
   - Claude Code filesystem ingestion
   - Gemini takeout
   - Auto-detect universal format
   
   Planned Phase 2: 30+ additional adapters across 3 tiers (markdown, plaintext, PDF, URL, plus Microsoft Graph, Slack, Notion, Gmail, GitHub via MCP) [[#803, #928]].

2. **4-pass distillation:**
   - Pass 1: Raw extraction into Universal Import Format (UIF)
   - Pass 2: Deduplication & chunking
   - Pass 3: Entity extraction + Knowledge Graph construction
   - Pass 4: Compliance metadata tagging [[#917]]

3. **Storage & retrieval:**
   - All frames persisted as I-frames (Immutable) with `gop_id = 'harvest'`
   - Vector embeddings (sqlite-vec, 1024 dims, Xenova/all-MiniLM-L6-v2)
   - FTS5 keyword search + semantic search
   - HarvestSourceStore tracks source origin, sync timestamp, auto-sync toggle [[#905, #925]]

### Performance & Reality Check

**E2E verified (as of 2026-04-10):**
- 156 frames extracted in 18 ms, persisted in 76 ms
- Idempotent re-runs confirmed (second run = 0 inserts)
- 10 real FTS5 queries validated against harvest frames
- Vector semantic search tested ("my identity and name" → User Profile, "where did we deploy mixpost" → 3 Mixpost memories)
- 81/81 E2E tests passing (phase-ab + full-product-audit + power-user-stress) [[#905, #925]]

**Data cleanup critical:** Wiki compilation test (2026-04-13) found personal.mind was 80% E2E test pollution, reducing usable signal. Real user data needed for >80% hit rate [[#928]].

### Monetization & Lock-In

Memory Harvest is **free forever** — not a paid feature [[#784, #799, #793]].

**Why:** It's the lock-in moat. Users become dependent on unified memory → switching costs rise → Teams upsell ($49/seat/mo for shared team memory) becomes natural → enterprise compliance needs trigger KVARK path.

Free forever decision removes per-tier quotas on embedding capacity—all tiers get unlimited [[#799]].

### Compliance Integration

Harvest pipeline automatically tags frames with EU AI Act metadata:
- Article 12 (transparency): logged in compliance table
- Article 14 (accuracy): source + extraction method tracked
- Article 19 (human oversight): agent decision points marked
- Articles 26/50 (rights + remedies): audit trail immutable [[#917, #1005]]

ComplianceDashboard shows risk classification per workspace [[#917]].

### Known Gaps & Future Work

**Memory MCP Plugin (5 fixes completed 2026-04-13):**
- Workspace mind layer caching with LRU invalidation
- `scope='all'` now searches ALL workspaces (not just one)
- Default to mock embeddings (Ollama > API keys > mock) to avoid 23MB surprise downloads
- Reliable dedup via batch-start timestamp
- Daily sessions instead of eternal sessions [[#928]]

**Remaining P1 priorities:**
- Shared Team Memory (teams-tier killer feature)
- Cross-workspace read permissions & approval modal
- Post-harvest auto-run cognify pipeline on imports [[#915, #927]]

**Phase 2 (scaling):** 30+ adapters, Microsoft Graph full stack, webhook/file-watch/cron automations [[#928]].

## Sources & Evolution

### Initial Spec → Implementation

Frame #1005 (2026-04-13) documented Memory Harvest as **spec-only**, the strategic weapon needed to launch Waggle. Frame #917 (2026-04-10) proved it works end-to-end on real data—156 frames extracted in 18 ms with zero production bugs. Frame #905 validated the full pipeline: extraction, persistence, FTS5, vector search, Knowledge Graph construction.

### Monetization Crystallization

Early frames discussed per-tier embedding quotas [[#799]], but 2026-04-12 decision unified the tier strategy: Memory + Harvest = free forever, agents = free, marketplace skills/connectors = paywall, Teams = shared memory ($49/seat), Enterprise = KVARK [[#930]]. This clarified why Harvest is moat—it drives adoption without revenue cannibalization.

### Wiki Compilation Reality Check

2026-04-13 wiki compilation test (Frame #928) revealed that raw harvested data alone doesn't generate 80%+ useful wiki pages. Cross-session synthesis works, but data quality matters. This suggests future work should prioritize data cleaning on import (dedup, time-series aggregation, PII filtering).

## Related Topics

- [[Waggle