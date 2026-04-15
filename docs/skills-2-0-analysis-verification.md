# Skills 2.0 Analysis — Verification Report

**Date:** 2026-04-15
**Verifier:** Subagent pass against current waggle-os codebase (head `2ef9feb`)
**Source analysis:** External "Skills 2.0 Gaps — What's Missing" review provided by Marko in session S2.
**Purpose:** Confirm which claimed gaps are real, which are already solved, and surface the actual backlog for the next autonomous run.

---

## Headline

Out of 13 claims in the external analysis:

| Verdict | Count | Claims |
|---|---|---|
| **TRUE gap** | 2 | E, F |
| **PARTIAL gap** | 4 | A, H, K, L |
| **FALSE (myth — already solved)** | 6 | B, C, D, G, I, J |
| **NOT a gap (intentional design)** | 1 | M |

**Most of the analysis is already solved.** GEPA loop, evolution stack, hot-reload, optimization cron, hybrid RRF search, and the knowledge-graph visualization all exist and are wired. Net new work comes down to **2 real gaps + 4 polish items**.

---

## Per-claim verdicts (with evidence)

### A. Skill extractor only produces metadata → **PARTIAL**

- **Evidence of the gap:** `packages/weaver/src/skill-extractor.ts:39-42` — output names default to `toolA+toolB`, descriptions are just the first user prompt. Pure metadata.
- **Evidence it's partially solved:** `packages/agent/src/skill-tools.ts:123-180` — `generateSkillMarkdown()` produces full SKILL.md from explicit `create_skill` tool calls.
- **What's missing:** the *automatic* path from extractor-detected pattern → LLM-generated full skill definition. Today it's manual.
- **Fix scope:** one new service that takes an extractor pattern + conversation context and calls `generateSkillMarkdown` via an LLM. ~1 day.

### B. Eval / scoring infrastructure is absent → **FALSE**

- `packages/agent/src/iterative-optimizer.ts:6-25` — full GEPA loop with LLMJudge feedback, Pareto selection, multi-generation evolution — already live.
- `behavioral-spec.ts:3` contains the "future A/B testing" comment the analysis quoted — it's a legacy comment, the real implementation shipped.
- **Myth — skip.**

### C. GEPA evolution loop not wired end-to-end → **FALSE**

- `iterative-optimizer.ts:33-48` — Candidate type tracks generation, parent, strategy, per-example scores.
- `iterative-optimizer.ts:73-82` — MutateArgs with weakness feedback (ASI).
- `compose-evolution.ts:249` — generation index tracked.
- `evolution-llm-wiring.ts:34` — MutateFn wired.
- **Myth — skip.** (Note: `packages/optimizer/` is a thin Ax wrapper, not a replacement. Consider archiving it.)

### D. Skill hot-reloading missing → **FALSE**

- `skill-tools.ts:31` — `onSkillsChanged?: () => void` callback in deps.
- `skill-tools.ts:566` — *"Trigger hot-reload so the skill is immediately available in runtime"* — shipped.
- `server/src/local/index.ts:803, 1201` — hot-reload wiring.
- **Partial caveat:** no filesystem watcher (chokidar); callback fires on tool-mediated CRUD only. Adding a chokidar watcher would catch manual SKILL.md edits, but that's polish, not a gap.

### E. Skill promotion between scopes → **TRUE**

- `packages/core/src/mind/improvement-signals.ts:3-4` — signal types are only `capability_gap`, `correction`, `workflow_pattern`. No `skill_promotion` signal.
- `team-sync.ts:1-15` — syncs frames, not skills/personas.
- **Zero governance gates** or personal→workspace→team→enterprise escalation logic.
- **Real gap. Highest impact for Teams tier + KVARK funnel.**

### F. No skill decay / auto-retirement → **TRUE**

- `skill-tools.ts:125, 182` — `create_skill` + `delete_skill` exist, both manual.
- `packages/weaver/src/consolidation.ts:42-67` — `decayFrames()` exists for memory frames, but no skill equivalent.
- **Real gap. Low-priority unless Marko has already accumulated stale skills.**

### G. Optimization cron not wired → **FALSE**

- `optimization-capture.ts:31` — comment references `prompt_optimization` cron.
- `cron-store.ts:15, 23` — `prompt_optimization` is a valid registered job type.
- `server/src/local/index.ts` — handler reads logs, invokes `PromptOptimizer`, budget-gated.
- `setup-crons.ts` — registered to run daily at 2 AM.
- **Myth — fully wired. Skip.**

### H. Compliance report generator is thin → **PARTIAL**

- File size: 96 lines (analysis claim of "3.5K" was approximate).
- `compliance/report-generator.ts:36-95` — outputs JSON only.
- Line 4 comment explicitly: *"PDF generation deferred to document tooling."*
- **Partial gap. For "AI Act compliant in 60 days" enterprise sales pitch, boardroom-grade PDF is load-bearing.**
- **Fix scope:** puppeteer or `pdf-lib` + structured template + chart generation. 2-3 days for genuine boardroom quality.

### I. Search — no hybrid BM25 / RRF → **FALSE**

- `packages/core/src/mind/search.ts:30` — `const RRF_K = 60;` (RRF constant defined).
- Lines 56-64 — RRF score computation fuses keyword + vector using `1 / (RRF_K + rank)`.
- Lines 45-122 — `search()` runs keyword + vector in parallel, then RRF merges.
- FTS5 provides BM25-like ranking natively.
- **Myth — hybrid is live. Skip.**

### J. Knowledge graph visualization missing → **FALSE**

- `apps/web/src/components/os/apps/memory/KnowledgeGraphViewer.tsx` — **677 lines**.
- Lines 10-14 — uses `d3-force` (`forceSimulation`, `forceManyBody`, `forceCenter`, `forceCollide`).
- `packages/ui/src/components/memory/KGViewer.tsx` — 361 additional lines (reusable).
- **Myth — ~1,000 lines of real force-directed graph, not a stub.**
- **However:** whether the graph is discoverable, polished, and demo-video-ready is a separate UX question — worth a 1-hour visual review.

### K. Memory conflict protocol may not fire in practice → **PARTIAL**

- `behavioral-spec.ts:71-79` — CRITICAL block defines the protocol.
- `combined-retrieval.ts:110` — `detectConflict()` exists.
- `combined-retrieval.ts:240-241` — **conflict detection only runs during search (READ), NOT during save (WRITE).**
- **Real gap.** Write-path silently overwrites conflicting memory without surfacing the contradiction.
- **Fix scope:** wire `detectConflict()` into the frame insert path; surface via improvement-signals when a conflict is detected on save. ~1 day.

### L. Sub-agent results not persisted to memory → **PARTIAL**

- `subagent-tools.ts:75-76` — in-memory `agentResults` Map only.
- Lines 79-80 — results evicted after 30 minutes (`STALE_THRESHOLD_MS`).
- Lines 237-248 — no `save_memory` call after sub-agent completion.
- **Real gap.** Sub-agent work vanishes after 30 minutes or server restart — breaks the "agent that learns from specialists" promise.
- **Fix scope:** add a `save_memory` call in the completion handler with tag `source: subagent`. ~0.5 day.

### M. OnlyOffice integration gap → **NOT A GAP**

- No `onlyoffice` / `libre` imports anywhere in the codebase (confirmed).
- `document-tools.ts` has `generate_docx()` — export, not inline editing.
- **Intentional design:** Waggle generates documents for external tools; inline editing isn't the UX pattern. KVARK carries OnlyOffice for enterprise customers who need it.
- **Skip — not a real gap for Waggle's positioning.**

---

## Top 5 real gaps — ranked by impact on mission

Mission recap: make Gemma 4 + Waggle perform like Opus 4.6 via evolution, produce the KVARK demo-video / sales story.

1. **E — Skill Promotion Governance (TRUE)** — Teams tier can't escalate personal discoveries to shared library. Skills 2.0 remains siloed. Directly blocks the Teams-tier upsell.
2. **K — Conflict Detection on WRITE (PARTIAL)** — Memory corruption risk; protocol only fires on read, not save. Undermines evolution quality because contradictions silently enter the training signal.
3. **L — Sub-Agent Memory Persistence (PARTIAL)** — Specialist work vanishes after 30 min. Breaks the feedback loop for multi-agent evolution.
4. **H — Compliance Report PDF (PARTIAL)** — Enterprise sales hook ("AI Act compliant in 60 days") weak with JSON-only output.
5. **F — Skill Decay / Auto-Retirement (TRUE)** — Library bloats over time, signal-to-noise degrades. Low priority today; real by month 6.

---

## Bottom 3 — claims that were wrong

1. **I — Search has no RRF (FALSE)** — RRF is live with K=60; FTS5 provides ranking.
2. **G — Optimization cron not wired (FALSE)** — fully implemented, runs daily at 2 AM.
3. **J — KG visualization missing (FALSE)** — 677-line force-directed graph with d3-force.

---

## Actionable fixes — proposed ordering

**Tier 1 — unblock in 2-3 sprints (Teams tier + evolution quality):**
- E: skill promotion gates + scope-based access control
- K: wire `detectConflict()` into `save_memory` code path
- L: add `save_memory` to sub-agent completion handler; persist to workspace frame store

**Tier 2 — polish (1-2 sprints):**
- A: extractor → LLM → full-skill automatic pipeline
- F: skill usage tracking + auto-retirement cron job
- H: PDF export for compliance reports (puppeteer or `pdf-lib`)

**Tier 3 — design review / cleanup:**
- Evaluate archiving `packages/optimizer/` (thin Ax wrapper; `packages/agent/` holds the canonical GEPA impl)
- Add chokidar watcher for SKILL.md hot-reload on manual edits (polish on top of existing callback-based system)
- Visual audit of KG viewer for demo-video readiness

---

## Methodology note

This verification was performed by a subagent with Read/Grep/Glob access to the full waggle-os tree at head `2ef9feb`. Every FALSE verdict is backed by specific `file:line` citations. Every PARTIAL verdict names both what's implemented and what's missing. Where the external analysis gave approximate file sizes ("3.5K") they were measured exactly (96 lines for compliance).
