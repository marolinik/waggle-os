# H-AUDIT-1 Design Doc — PM Ratification

**Datum:** 2026-04-22
**Sprint:** 11 · Track A · Task A1 → A2 gate
**Ratifies:** `../waggle-os/docs/plans/H-AUDIT-1-DESIGN-DOC-2026-04-22.md` (commit `008deac` on `origin/main`)
**Authority:** PM (Cowork, Claude Opus 4.7)
**Supersedes memory:** `.auto-memory/project_h_audit_1_not_implemented.md` (flagged stale)
**Effect:** A2 implementation UNBLOCKED. Day 2 AM B2 + B3 GREEN LIGHT parallel.

---

## 0. Verdict

**RATIFIED with 5 answered questions below.** Net-new A2 scope is confirmed narrow: reasoning_content handling in the harness layer only. Production chat stack turnId propagation is treated as already-landed per §1 state audit (≥50 grep hits, 9 files, full turn-graph reconstruction test already green in `packages/agent/tests/turn-context.test.ts:80`). CC-1 does not re-implement turnId plumbing.

Sign-off covers §4 criteria 4–7 (the only ones marked ⬜ on HEAD), §6 implementation plan, and §7 anti-patterns. Tie-in with Stage 2 config LOCK (`on/64K`, `qwen3.6-35b-a3b-via-openrouter`) preserved.

---

## 1. Answers to §5 open questions

### Q1 — Confirm narrowed A2 scope (reasoning_content only)

**Answer: YES, confirmed.**

Evidence supporting the narrowing is overwhelming and already on `origin/main` HEAD `e1ae0a4`:

- `grep -n "turnId" packages/**/*.ts` returns ≥50 hits across 9 files (design doc §1.2 table).
- `turn-context.test.ts:80–117` asserts full turn-graph reconstruction from a single turnId threading chat.ts → agent-loop → orchestrator.recallMemory → combined-retrieval → prompt-assembler → tool-call → cognify → agent-loop.exit. This is exactly the "unit test reconstructs full turn graph from single turnId" acceptance item from Sprint 11 brief §3 Task A1.
- `turn-context.test.ts:121` regression guard reads the six target files from disk and asserts `turnId` appears in each. This prevents accidental plumbing removal.
- `generateTurnId()` in `turn-context.ts:29` is `node:crypto.randomUUID()` which is UUID v4 by Node spec; asserted by the v4-shape regex test.

Re-implementing the generator or threading would be pure churn. A2 ships the reasoning_content extension only.

**Exit criteria alignment:** A2 CLOSE requires §4 criteria 4–7 green — the four rows marked ⬜ in the doc. Criteria 1–3 are already met on HEAD and CC-1 does not rerun them; the existing test suite functions as the regression guard.

**Exit ping filename confirmed:** `sessions/2026-04-22-sprint-11-h-audit-1-exit.md` per design doc §5.1.

---

### Q2 — Memory note correction

**Answer: YES, authorized.**

Memory note `.auto-memory/project_h_audit_1_not_implemented.md` is marked **SUPERSEDED** by this ratification. The note was accurate at write time (2026-04-20, based on Sprint 8 code review digest). Sprint 10 landed the plumbing before Sprint 11 kickoff, and the current design doc §1 audit documents the live state.

PM will update the memory index on this session with a superseded marker pointing at this decision doc + the A1 design doc. CC-1 does not need to touch memory; memory surface is PM hygiene.

**Rationale for formal supersession rather than quiet update:** we commit to memory-note corrections as an audit trail item, not as silent retconning. Future sessions see both "this was believed at date X" and "this was verified false at date Y by design doc Z", which prevents the same finding from recurring.

---

### Q3 — Parser precedence (OpenRouter `message.reasoning` vs DashScope `message.reasoning_content`)

**Answer: Accept BOTH shapes, in the order specified in §6.1 of the design doc.**

Parse precedence:

1. `body.choices?.[0]?.message?.reasoning_content` (DashScope native, snake_case, primary kanonski tok when DashScope is provisioned)
2. `body.choices?.[0]?.message?.reasoning` (OpenRouter unified, current bridge state per B1 LIVE smoke `reasoning` field present with 411 chars)
3. `body.reasoning_content` top-level (legacy DashScope shape fallback)

If none present AND `thinking=true` was requested, emit one `reasoning_content_shape_unknown` pino warning with `{ model, route, response_shape_sample }` so provider schema drift becomes observable without failing the run. Never throw on absence — thinking-off routes and tool-only responses legitimately have no reasoning field.

**Rationale for dual-shape rather than exclusive-OR:** DashScope provisioning is a Sprint 10–11 operativna zavisnost per `project_sprint_10_scope_locked.md`. The moment it lands, harness calls flip from OpenRouter bridge to DashScope native — and the response key flips with it. Exclusive-OR forces a conditional code path per route, which is the ticket we are trying to avoid. Dual-shape parser handles the switch transparently.

**Observability requirement:** the `llm.response` pino event must include `reasoningShape: 'message.reasoning_content' | 'message.reasoning' | 'body.reasoning_content' | 'unknown'` so ingest dashboards can audit which shape the harness actually encountered on each call. This closes the audit loop without cluttering JSONL with parser-internal state.

---

### Q4 — Persistence slot under turnId

**Answer: SAME JSONL row. Net-new field `reasoning_content` + `reasoning_content_chars` on `JsonlRecord`.**

Decision rationale:

- `turnId` is the foreign key contract. Single-row reconstruction is the simpler consumer API — one filter, one row, everything present. Sibling `.reasoning.jsonl` file would force every consumer to JOIN on turnId across files; the complexity cost exceeds the benefit.
- Size estimate: B1 LIVE smoke measured 411 chars of reasoning on a trivial query. Under realistic LoCoMo loads reasoning will scale roughly with answer complexity; ceiling estimate for a 2000-call Stage 2 full-run with thinking-on is ≤1GB total JSONL (design doc §2.3 estimate is realistic). This is operationally fine for local disk and for gzipped archive.
- Pruning strategy (if size ever becomes a real constraint): handled on the READ path via `readJsonl(path, { includeReasoning: false })` utility, not on the WRITE path. The write path always writes the full record. This preserves archive integrity while letting summaries and briefs stay compact.

**Implementation constraint:** `reasoning_content_chars` is **not** redundant — it is the canonical observability field. Metrics aggregation (§6.3 of design doc, `metrics.ts`) computes `sum, p50, p95` of chars, **never of the content itself**. Summary briefs include only the chars aggregate. The full `reasoning_content` lives in JSONL, never in markdown reports.

---

### Q5 — Retention beyond sprint

**Answer: Two-tier retention policy.**

**Tier 1 — Sprint-internal probes (default for all Sprint 11 Track C runs):**

- Pre-flight iterations (Stage 1 mikro-eval C2, Stage 2 4-cell mini C3, repros of failed runs) retain raw JSONL with reasoning_content in `benchmarks/results/` **local only** (gitignored).
- Pruned at sprint close per design doc §2.3. Summary aggregate (sum/p50/p95 chars + cost + latency) lives in `preflight-results/*.md` as part of the sprint close-out report.
- Rationale: these runs are iteration artifacts; their reasoning traces are not claims-supporting, so long-term persistence is not warranted.

**Tier 2 — Launch-claim-supporting runs (Stage 2 full-run H-42a/b when it lands):**

- Raw JSONL with `reasoning_content` is gzipped to `benchmarks/archive/h-42a-stage-2-full-YYYY-MM-DD.jsonl.gz` and committed to `origin/main` in the sprint that finalizes the launch claim.
- Retention: **12 months minimum** from commit date. Longer retention at PM discretion based on legal/compliance needs emerging from EU AI Act alignment.
- Rationale: if a published LoCoMo result drives a launch claim (SOTA or SOTA-in-local-first narrative per pre-registered thresholds in `project_sprint_10_scope_locked.md`), reproducibility requires the reasoning traces that produced each answer. External reviewers are entitled to ask "why did the model answer this way on item N" and we need to show the provider's own reasoning chain.
- Storage ceiling: `.gz` on typical Qwen thinking output compresses to 20–30% of raw; 1GB raw → ≤300MB compressed per full run. Low cost, high audit value.

**This ratification does NOT trigger any archival work in Sprint 11.** C2 and C3 runs fall under Tier 1. The Tier 2 archival runbook will be written as part of the H-42a/b kickoff memo (separate brief, not Sprint 11 scope).

**CC-1 action for A2:** include the archive folder path `benchmarks/archive/` in `.gitignore` exemption list (make sure it is NOT gitignored) but leave the folder itself absent until H-42a/b run materializes. A `README.md` stub in the folder documenting the retention contract is optional; acceptable to defer.

---

## 2. Day 2 authorization

**GREEN LIGHT** for the following parallel tracks on Day 2 AM:

- **A2 implementation** — per design doc §6, 7 steps. Budget $0 (fake LLM client in unit tests). Exit ping: `sessions/2026-04-22-sprint-11-h-audit-1-exit.md`.
- **B2 tie-break policy implementation** — per brief §3 Track B B2. Sonnet 4.6 fourth-vendor path, 4 unit tests. Budget cap $0.20. PM will LOCK policy in `decisions/2026-04-22-tie-break-policy-locked.md` before B2 merge.
- **B3 Opus 4.6 route audit** — per brief §3 Track B B3. Grep + classify + report + naming LOCK memo. Budget cap $0.10. Deliverable: `docs/reports/opus-4-6-route-audit-2026-04-22.md` + PM issues `decisions/2026-04-22-model-route-naming-locked.md` after review.

**Day 2 budget ceiling:** $0.30 total across A2+B2+B3. Hard alarm at 130% = $0.39. Exit pings per task, day-2-eod status ping per brief §6.

---

## 3. Operational dependencies noted

- **A3 (bench-spec resolution)** remains BLOCKED on Marko+PM 30-min call per brief §3 Track A A3. Not a Day 2 deliverable; PM will schedule.
- **B4 (Stage 2 kickoff memo)** PM-led; CC-1 assist activates only when PM hands memo for harness readiness assessment add-on.
- **C2 (Stage 1 mikro-eval)** remains blocked on A2 + B1 + B2 CLOSED. B1 is CLOSED (8c635b7 pushed). A2 + B2 expected Day 2. Earliest C2 kick: Day 2 late PM or Day 3 AM.
- **C3 (Stage 2 4-cell mini)** remains blocked on C2 PASS. Earliest kick Day 3 PM per brief §4 sequencing.

---

## 4. Anti-patterns re-asserted

This ratification does NOT authorize any of the following:

- Re-implementing turnId generator or propagation (design doc §7, Sprint 11 brief §7 Anti-pattern #5).
- Writing reasoning_content to frames/memory/KG/UI/MCP payloads (design doc §2.4 exclusion rule, hard contract).
- Passing reasoning_content to the judge (design doc §2.4 rule 2, would invalidate Sprint 10 Task 2.2 Fleiss' κ=0.8784 judge methodology lock).
- Scope creep beyond §6 — no tool-call schema extensions, no MCP bridge work, no production thinking-on wiring in this task.

If any anti-pattern is approached, CC-1 HARD STOP + PM ping per brief §7 Anti-pattern #2.

---

## 5. Ratification record

| Field | Value |
|---|---|
| Ratified by | PM (Marko's authority chain) |
| Ratification date | 2026-04-22 |
| Ratified against | `waggle-os/docs/plans/H-AUDIT-1-DESIGN-DOC-2026-04-22.md` commit `008deac` |
| Unblocks | A2 implementation (reasoning_content capture) + Day 2 AM B2 + B3 parallel |
| Memory update | `project_h_audit_1_not_implemented.md` flagged SUPERSEDED, pointer to this decision doc added |
| Exit criteria affected | Sprint 11 #1 (A1 CLOSED) — pending only the CC-1 confirmation ping that design doc + this ratification are both on `origin/main` state |

---

**End of ratification. CC-1 unblocked for Day 2 AM kickoff.**
