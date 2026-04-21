# Stage 2 Prep Backlog

Items that must close before Stage 2 LoCoMo full 4-cell main run kickoff
(Sprint 10 or later). Each entry is scoped to produce a pre-flight
stability envelope Stage 2 depends on, without touching the judge /
substrate / retrieval layers once they're frozen.

Conventions:
- **BLOCKS Stage 2 LoCoMo full-run kickoff** — item must PASS before the
  scaled batch is approved.
- **Sprint 9 orthogonal** — items do not block Sprint 9 completion
  (judge calibration on synthesized triples is independent).
- Each entry carries origin reference + acceptance pattern + budget
  ceiling.

---

## Qwen3.6 thinking-mode stability matrix (pre LoCoMo full run)

**Opened:** 2026-04-21
**Origin:** `PM-Waggle-OS/sessions/2026-04-21-stage-0-final-close-out.md` §2.2 + §7 — Stage 0 Q2 re-run on the Task-0.5 KG produced no final answer because Qwen3.6-35B-A3B thinking-mode, at max_tokens=16000, looped in its reasoning stream ("cannot complete this thought" repeated verbatim) and never transitioned to synthesis. The substrate had everything needed; inference layer did not converge.

### Why this matters for Stage 2

Stage 2 LoCoMo full run hits `qwen3.6-35b-a3b-via-openrouter` at ~200 per-cell × 4 cells + judge ensemble. If Qwen thinking-mode ever loops on a Stage-2 prompt shape the way it did on Stage-0 Q2, a full run will burn budget on unusable outputs AND risk corrupting the aggregate report (unconverged inference + still-charged tokens skew the cost/quality picture). We need the failure-mode envelope identified in a small, bounded test matrix BEFORE the scaled batch fires.

### Acceptance pattern — systematic stability matrix

Test cells (2 × 4 × 5 = 40 configurations):

| Axis | Values |
|---|---|
| thinking toggle | `on` (current default) / `off` (via `enable_thinking: false` extra_body — verify availability on DashScope + OpenRouter routes first) |
| max_tokens ceiling | 8K / 16K / 32K / 64K |
| prompt shape | direct-fact / multi-anchor-enumeration / chain-of-anchor / temporal-scope / null-result-tolerant |

Prompt shape definitions (worth locking before the matrix runs):

- **direct-fact:** single factual lookup — "When did X happen?" — one retrievable datum expected.
- **multi-anchor-enumeration:** N enumerated components requested — "List three key Y components with model + date + session per component" (this is Stage-0 Q2's shape — the one that looped).
- **chain-of-anchor:** cross-reference across retrieved frames — "Connect A (from session X) to B (from session Y) via their common theme".
- **temporal-scope:** date-bounded lookup — "In December 2025, what structural analysis happened for Z?" (this is Stage-0 Q1's shape).
- **null-result-tolerant:** question whose correct answer may be "no evidence" — "Is there a Calendar event linked to session S in the same week?" (legitimate negative outcome accepted).

Matrix cell outcome categories:

| Outcome | Definition | Stage 2 implication |
|---|---|---|
| `converged` | `content` populated, final answer parses, token count ≤ 0.9 × ceiling | Cell is safe for Stage 2 |
| `loop` | reasoning_content repeats a phrase 3+ times in final 1K chars; content empty | Cell BLOCKS Stage 2 — avoid prompt shape or raise token ceiling, whichever is cheaper |
| `truncated` | content populated but ends mid-sentence; completion_tokens = ceiling | Cell WARNS — raise max_tokens for Stage 2 if used |
| `empty-reasoning-only` | content empty; reasoning_content populated | Cell WARNS — raise max_tokens or switch thinking off |

### Deliverables

1. A heat-map CSV at `waggle-os/preflight-results/qwen-stability-matrix-<ISO>.csv` with 40 rows (one per cell) columns: `thinking`, `max_tokens`, `prompt_shape`, `outcome`, `completion_tokens`, `wall_clock_ms`, `cost_usd`, `content_preview_first_500`.
2. A markdown summary at `waggle-os/preflight-results/qwen-stability-matrix-<ISO>.md` flagging which cells must be avoided for Stage 2 (cells marked `loop` under both thinking toggles) + recommended max_tokens ceiling per prompt shape.
3. If ANY cell shows `converged` at a lower max_tokens than 16K with thinking-off, prefer that configuration for Stage 2 baseline — materially smaller per-call cost multiplies across a 200-call batch.

### Budget ceiling

$5 total for the matrix run, using these economics:
- Thinking-off at 8K tokens ≈ $0.004 per call → 5 shapes × 1 call = $0.02
- Thinking-on at 16K tokens ≈ $0.016 per call → 5 shapes × 1 call = $0.08
- Thinking-off at 32K tokens ≈ $0.016 per call (unused thinking headroom doesn't burn)
- Thinking-on at 64K tokens ≈ $0.060 per call → 5 shapes × 1 call = $0.30

40 cells × ~$0.025 average = $1.00 baseline + retry headroom → well under $5.

Dry-run the runner first with synthetic fixtures + a `--cells 3` flag to cap the matrix at 3 cells during development. Real-call path only after dry-run validates that the matrix runner parses Ollama + LiteLLM responses correctly (we already have this infrastructure in `scripts/stage-0-query.mjs`).

### Dependencies

- **Depends on:** nothing architectural. Uses the existing `scripts/stage-0-query.mjs` infrastructure with an extended `--backend` / `--model` / `--max-tokens` / `--thinking-off` flag set. Minimal new code — wrap the existing script in a matrix driver.
- **Relationships:**
  - NOT blocker for Sprint 9 Tasks 4/5 (judge calibration uses Sonnet on synthesized triples — thinking-mode not relevant to Sonnet).
  - NOT blocker for launch narrative (pre-LoCoMo stability is a Stage 2 operational concern, not a defensibility concern for what Sprint 9 produces).
  - **BLOCKS Stage 2 LoCoMo full 4-cell main run kickoff.** Budget owner and PM need the stability envelope before approving the scaled batch budget.
  - **BLOCKS H-42 / H-43 / H-44 scaled benchmark runs** if they depend on Qwen3.6-35B-A3B thinking-mode inference paths.

### Estimated effort

4-6 hours wall-clock: 1-2h to extend `scripts/stage-0-query.mjs` into a matrix driver with cell iteration + outcome classifier, 1h for dry-run validation on synthetic prompts, 1-2h for real-call matrix execution + CSV assembly, 30 min for markdown summary + Stage-2 recommendation.

### Not-in-scope (parked / deferred)

- Root-cause fix for Qwen's loop behavior — that's a provider-side issue, not something the harness should try to patch. Matrix identifies the failure envelope; avoidance or budget-headroom is our mitigation, not provider debugging.
- Equivalent stability matrix for Qwen3-30B-A3B or other candidate models — scoped only to the canonical Stage-2 engine (Qwen3.6-35B-A3B).
- Integration with aggregate.ts Week-1 cost projection — the matrix produces static guidance, not a live cost-monitor hook.
