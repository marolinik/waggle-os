# Phase 7 Milestone C — Closeout

**Status:** Complete (2026-03-17)
**Scope:** Retrieval feedback loop — first bidirectional Waggle ↔ KVARK touch point

---

## 1. What Milestone C delivered

| Component | What | Key files |
|-----------|------|-----------|
| **kvark_feedback tool** | Agent tool that sends usefulness signals back to KVARK after enterprise results materially influence an answer. Parameters: `document_id` (number), `query` (string), `useful` (boolean), `reason?` (string). | `agent/src/kvark-tools.ts` |
| **KvarkClient.feedback()** | Client method mapping to `POST /api/feedback`. Constructs the contract-spec request body (`feedbackType`, `target`, `signal`, `context`). | `server/src/kvark/kvark-client.ts` |
| **Feedback types** | `KvarkFeedbackRequest`, `KvarkFeedbackResponse` on the server side; `KvarkFeedbackResponseLike` on the agent interface side. | `server/src/kvark/kvark-types.ts`, `agent/src/kvark-tools.ts` |
| **Prompt guidance** | Conditional section (KVARK-only) instructing the agent when feedback is appropriate: only when a KVARK result materially influenced synthesis, not for every search, fire-and-forget on failure. | `server/src/local/routes/chat.ts` |
| **Graceful degradation** | Three failure paths handled: client without `feedback` method → "not supported"; KVARK returns 501 → "not yet available, non-blocking"; network/server error → standard KVARK error message. None interrupt the conversation. | `agent/src/kvark-tools.ts` |

## 2. Why it matters

Before Milestone C, Waggle's relationship with KVARK was read-only. Combined retrieval could pull enterprise documents, but KVARK had no signal about which results were actually useful. Retrieval quality was static.

After Milestone C, every meaningful use of a KVARK result can flow back as a reinforcement signal. KVARK's retrieval pipeline can learn which documents, for which queries, actually help users. This is a compounding investment — each feedback signal makes the next search slightly better.

The scope was deliberately narrow: one tool, one client method, one prompt section. No UI, no analytics dashboard, no automatic feedback heuristics. The agent decides when to send feedback based on prompt guidance, and the user never sees the feedback mechanism. This keeps the loop clean and avoids noise.

## 3. Architecture decisions validated

- **Same tool family pattern.** `kvark_feedback` follows the exact conventions of `kvark_search` and `kvark_ask_document`: same error handler, same conditional registration, same graceful degradation. Three tools, one coherent family.
- **Optional interface method.** `KvarkClientLike.feedback` is typed as optional (`feedback?: ...`). This means every existing mock client and test that only implements `search` + `askDocument` continues to compile and pass without changes. The tool checks for method existence at runtime.
- **Fire-and-forget by design.** The prompt explicitly tells the agent that feedback failure is non-blocking. The tool never throws uncaught errors. This matches the contract spec's guidance: "Waggle should treat this as fire-and-ack, not a reasoning step."
- **Conditional prompt injection.** Feedback guidance only appears when KVARK tools are present. Solo/Team users see zero additional prompt tokens. Same pattern as B3 attribution guidance.

## 4. Test / regression status

| Scope | Files | Tests | Status |
|-------|-------|-------|--------|
| kvark-tools (agent) | 1 | 23 | Pass (+8 new) |
| kvark-client (server) | 1 | 12 | Pass (+3 new) |
| kvark-wiring (server) | 1 | 6 | Pass (assertions updated) |
| Full agent package | 59 | 648 | Pass |
| Full KVARK test suite | 6 | 55 | Pass |
| Local server tests | 3 | 20 | Pass |

No regressions introduced by Milestone C.

## 5. Known limitations / dependency assumptions

- **KVARK feedback endpoint may not exist yet.** `POST /api/feedback` is in the contract spec but may not be implemented on the KVARK side. The tool handles 501 gracefully — "Feedback is not yet available on this KVARK instance. This is non-blocking — continue normally." No Waggle-side action needed when KVARK ships the endpoint.
- **Agent-driven, not automatic.** Feedback depends on the agent following prompt guidance to send signals only when KVARK results materially influenced its answer. The agent may under-send (miss opportunities) or occasionally over-send. This is acceptable for a first pass — the prompt is specific enough to keep noise low.
- **No feedback for combined retrieval results.** When `search_memory` uses CombinedRetrieval and KVARK results appear, the agent would need to extract `documentId` from the formatted output to send feedback. The attribution markers contain document info, but the agent must parse it from the text. A future refinement could pass structured metadata alongside the formatted output.
- **No feedback analytics.** There is no dashboard, no aggregation, no visibility into feedback volume or quality. KVARK owns the feedback data — Waggle fire-and-forgets.

## 6. Best next step

**Milestone D: Governed Action Proof** — `kvark_action` tool + connector awareness. This is the next planned Phase 7 milestone and the first point where Waggle can trigger governed enterprise actions (not just read or signal) through KVARK.

Alternatively, if KVARK's feedback endpoint is now available: validate the full feedback loop end-to-end with a live KVARK instance. Send a real feedback signal after a real combined retrieval search and verify it persists in KVARK's reinforcement store. This would be the first live bidirectional integration test.
