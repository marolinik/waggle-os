# Agent Intelligence Upgrade — Implementation Plan

**Date:** 2026-04-10
**Scope:** Document generation, personality, daemons, continuous improvement (Hermes-inspired)

---

## Phase A: Document Generation Tools (High Impact)

### A1. generate_xlsx tool
- File: `packages/agent/src/document-tools.ts`
- Library: `exceljs` (already installed in server)
- Input: structured JSON with sheets/rows/columns/formatting
- Output: .xlsx file saved to workspace documents/

### A2. generate_pptx tool
- Install `pptxgenjs` in packages/agent
- Input: structured slides with title/content/images/layout
- Output: .pptx file saved to workspace documents/

### A3. generate_pdf tool
- Install `pdfmake` in packages/agent (pure JS, no native deps)
- Input: structured document definition (markdown-like)
- Output: .pdf file saved to workspace documents/

---

## Phase B: Agent Personality — Companion Warmth

### B1. SOUL.md dynamic personality (Hermes pattern)
- Create `~/.waggle/SOUL.md` — editable personality definition
- Load into system prompt on every message (like Hermes)
- Default: warm, proactive, companion-like (not formal, not OpenClaw casual)

### B2. Behavioral spec personality tune
- Soften the "no filler" rules in behavioral-spec.ts
- Add warmth without being sycophantic
- Allow contextual greetings, brief empathy, celebration of achievements
- Keep: directness, opinion-having, no walls-of-text

### B3. Proactive mid-chat suggestions
- When agent notices patterns (3+ similar queries, repeated manual work):
  narrate "I noticed you've done X several times — want me to create a skill for this?"
- Surface improvement signals during conversation, not just in monthly reports

---

## Phase C: Daemon Registration

### C1. Harvest sync daemon
- Register in setup-crons.ts: scan local sources (Claude Code, Cursor) every 24h
- Uses HarvestSourceStore.getStale() to find sources needing sync

### C2. Memory compaction daemon
- Register: run FrameStore.compact() daily at 3:30 AM (after consolidation)
- Log results to improvement signals

---

## Phase D: Continuous Improvement (Hermes-Inspired)

### D1. Tool success tracking
- After each tool call, record outcome (success/failure/partial)
- Track success rate per tool in optimization logs
- Surface low-success tools as improvement signals

### D2. Strategy adaptation
- When a tool fails, add "tool X failed with error Y — try alternative approach"
  to the next agent turn's context
- Track which retry strategies succeed

### D3. Insights engine (self-analytics)
- Add `agent_insights` tool that reports:
  - Top tools by usage and success rate
  - Cost per model per workspace
  - Activity patterns (busy hours, topics)
  - Correction frequency trends
- Pull from existing optimization_log and ai_interactions tables

### D4. Auto-skill creation (Hermes pattern)
- After completing a task with 5+ tool calls:
  - Evaluate if the workflow is reusable
  - If so, proactively offer to save as a skill
  - Store in workspace skills/ directory

---

## Execution Order

1. **Phase A** (document tools) — concrete, ship immediately
2. **Phase B** (personality) — quick, high user-feel impact
3. **Phase C** (daemons) — small, completes harvest infrastructure
4. **Phase D** (improvement) — most complex, highest strategic value
