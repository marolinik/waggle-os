# Waggle OS — Orchestrator System Prompt Analysis & Improvement Potential

**Date:** March 28, 2026
**Scope:** Full analysis of the agent system prompt composition pipeline
**Files reviewed:** orchestrator.ts, personas.ts, self-awareness.ts, improvement-detector.ts, subagent-orchestrator.ts, agent-session.ts, chat.ts (server route)

---

## Architecture Overview

The system prompt is assembled through a **multi-layer pipeline** across three packages:

1. **`orchestrator.ts`** (`@waggle/agent`) — builds the core prompt: Identity → Self-Awareness → Preloaded Memory Context
2. **`personas.ts`** (`@waggle/agent`) — defines 13 persona profiles with role-specific systemPrompts, appended via `composePersonaPrompt()`
3. **`chat.ts`** (`@waggle/server`) — the server route that orchestrates everything: user custom prompt → orchestrator prompt → user profile → workspace context → behavioral rules → persona composition → disclaimer enforcement

The final prompt is cached per session (C3 optimization) and includes workspace state, date/time, skills, and a comprehensive behavioral specification.
---

## What's Working Well

**1. Layered prompt composition is architecturally sound.** The separation of identity (personal mind) → self-awareness (runtime capabilities) → memory context (preloaded) → persona (role-specific) → behavioral rules (server-level) is a clean, extensible design. Each layer has a single responsibility.

**2. Memory-first paradigm is well-enforced.** The `MANDATORY RECALL` instruction in 6 of 13 personas, combined with the behavioral rules section ("ALWAYS search memory before claiming you don't know"), creates a strong memory-grounding loop. The `auto_recall` tool execution observed during live testing confirms this works.

**3. Self-awareness module is sophisticated.** The agent knows its own version, model, tool count, memory depth, mode (local/team), and improvement signals. The `buildSelfAwareness()` function gives the agent genuine metacognition — it can answer "what can you do?" accurately, not from a static list but from runtime state.

**4. Improvement detector is a differentiator.** The correction detection, capability gap recording, and workflow pattern recognition create a genuine learning loop. The cap at 3 actionable signals per prompt (correction #6) prevents bloat. The surfaced-flag prevents repetition. This is production-grade adaptive behavior.

**5. Dual-mind architecture (personal + workspace) is well-implemented.** Memory search queries both minds, personal preferences follow the user across workspaces, and workspace-specific context stays scoped. The `loadRecentContext()` prioritizes by importance then recency — correct ordering.

**6. `composePersonaPrompt()` handles edge cases properly.** Truncation with `[...truncated]` marker, 32K char cap (~8K tokens), separator between core and persona, null-persona passthrough — all robust.
---

## Critical Improvement Areas

### IMP-1: Disclaimer Contamination — The #1 Agent Quality Issue (HIGH IMPACT)

**The Problem:** Disclaimers are injected at THREE separate levels, creating an unavoidable triple-enforcement that the LLM interprets as "always disclaim":

1. **Persona-level:** Each regulated persona (HR, Legal, Finance, Researcher, Executive Assistant, Analyst) has `DISCLAIMER:` baked into its systemPrompt with "MANDATORY on EVERY response"
2. **Core behavioral rules (chat.ts lines 509-513):** A blanket disclaimer rule that applies "regardless of which persona is active"
3. **Post-response injection (chat.ts lines 1443-1458):** Server-side code appends disclaimer text to the response AFTER the LLM has already responded, with a `hasDisclaimer` check that only skips if the LLM already included one

**Why this is broken:** When a user asks "What is 2+2?" in a Banking Credit Analysis workspace with the `finance-owner` persona active, the LLM receives THREE instructions to disclaim. It complies — appending financial disclaimers to a math answer. The post-response code then checks if a disclaimer is already present, finds one, and skips the server-side append. But the damage is already done at the LLM level.

**Recommended fix:**
- Remove `MANDATORY on EVERY response` from persona systemPrompts. Replace with: "Include professional disclaimers ONLY when your response contains substantive advice on [domain] topics."
- Change the core behavioral rule to: "Disclaimers are required when your response provides actionable guidance on regulated topics. They are NOT required for casual conversation, simple questions, or topics outside the regulated domain."
- Keep the server-side post-response injection as a safety net, but make it topic-aware (check if the response actually contains regulated content, not just the persona ID)
- Add a `isRegulatedResponse(content: string, domain: string): boolean` utility that checks whether the actual response content warrants a disclaimer
---

### IMP-2: System Prompt Size — Approaching Token Budget Risk (MEDIUM IMPACT)

**The Problem:** The assembled prompt includes: orchestrator core (identity + self-awareness + memory context) + user profile + workspace context + workspace state + skills listing + behavioral specification (~300 lines in chat.ts) + persona prompt + disclaimer rules + date/time. With a 32K char cap on persona composition alone, the total system prompt likely approaches 10-15K tokens for a well-populated workspace.

**Why this matters:** Claude's system prompt consumes context window. At 10-15K tokens of system prompt, you're consuming 5-7% of a 200K context window — acceptable, but the behavioral rules section in chat.ts is verbose and could be tightened. Every unnecessary token in the system prompt is a token unavailable for conversation history.

**Recommended fix:**
- Audit the behavioral rules section for redundancy (the disclaimer is mentioned in 3+ places)
- Consider making the behavioral spec tiered: essential rules always present, situational rules injected only when relevant (e.g., sub-agent rules only when sub-agents are spawned)
- The `loadRecentContext()` already limits to 5 frames — consider making this adaptive: fewer memories in a fresh workspace, more in a mature one
- Profile the actual token count of the assembled prompt across workspaces and set a monitoring threshold

---

### IMP-3: Mock Embedder Undermines Semantic Search (HIGH IMPACT)

**The Problem:** `agent-session.ts` uses a mock embedder that converts text bytes to floats deterministically. This means `search_memory` (which powers `auto_recall`) does NOT perform real semantic search — it's essentially doing character-level similarity matching on the first 1024 bytes.

**Why this matters:** The entire memory-first paradigm depends on accurate recall. When a user asks "What did we decide about pricing?" and the memory contains "We agreed to set the enterprise tier at $499/month", the mock embedder may not surface this because the byte representations of "decide about pricing" and "agreed to set the enterprise tier" have low character-level overlap.

**Current state:** The code comment says "Mock embedder for M1 — real embeddings in M2." This is the single highest-leverage improvement for agent quality.

**Recommended fix:**
- Prioritize M2 embedder integration (local model via Ollama, or API-based via OpenAI/Voyage/Cohere)
- As an interim fix, the `HybridSearch` likely combines vector search with keyword search — verify that keyword fallback is working, which would partially compensate
- Consider adding an embedding quality test: store a known document, query with a semantically similar but lexically different phrase, verify recall
---

### IMP-4: autoSaveFromExchange Pattern Matching is Fragile (MEDIUM IMPACT)

**The Problem:** The `autoSaveFromExchange()` method uses regex pattern matching to detect what to save: preferences, decisions, corrections, research findings, structured output. This is inherently brittle — it will miss nuanced expressions and false-positive on casual phrasing.

**Examples of likely failures:**
- "I'd rather not discuss this" → matches `/i(?:'d| would) rather/` → saved as user preference (false positive)
- "The stakeholders agreed that we should pivot" → matches decision pattern → saved, but as a decontextualized fragment
- "Let's go with pizza for lunch" → matches `/let's go with/` → saved as workspace decision (false positive)

**Why this matters:** Memory pollution degrades trust. If the agent recalls irrelevant "decisions" and false "preferences", users will lose confidence in the memory system — which is the core differentiator.

**Recommended fix:**
- Consider a lightweight LLM classification step for memory decisions (even a fast model like Haiku can classify "is this worth remembering?" more accurately than regex)
- Add a confidence threshold: only auto-save when multiple signals converge (e.g., the message is both long AND matches a pattern AND is in a relevant workspace context)
- Implement memory pruning: periodically review saved frames and deprecate low-value ones
- The F29 structured extraction is good in principle but needs a "so what?" filter — not every bullet point from every response needs to be memorized

---

### IMP-5: Persona Prompt Duplication with Core Behavioral Rules (MEDIUM IMPACT)

**The Problem:** Several instructions appear in BOTH individual persona systemPrompts AND the core behavioral rules:
- "ALWAYS search memory" appears in the core behavioral rules AND in 6 persona prompts (with `MANDATORY RECALL`)
- Disclaimer instructions appear in persona prompts AND in the core behavioral rules AND in the post-response injection
- "Cite sources" appears in the researcher persona AND in the core behavioral rules

**Why this matters:** Duplication wastes tokens and, more importantly, can cause the LLM to over-weight these instructions. When the same instruction appears 3 times, the model treats it as extremely high priority — which explains why disclaimers dominate responses even for trivial queries.

**Recommended fix:**
- Establish a clear hierarchy: core behavioral rules handle universal behaviors (memory-first, groundedness, safety), personas handle ONLY role-specific differentiation
- Remove duplicated instructions from persona prompts — the core rules already enforce them
- Document this principle in a CONTRIBUTING guide so future persona authors don't re-add universal rules
---

### IMP-6: SubagentOrchestrator Has No System Prompt Inheritance (LOW-MEDIUM IMPACT)

**The Problem:** When the `SubagentOrchestrator` spawns workers, `buildWorkerContext()` creates a minimal system prompt: name, role, task, and previous step results. It does NOT inherit the parent agent's identity, memory context, user profile, or behavioral rules.

**Why this matters:** Sub-agents spawned via `runWorkflow()` are effectively amnesic — they don't know the user's name, the workspace context, or any behavioral constraints. A research worker won't search memory first. A writing worker won't know the user's preferred tone. This creates an inconsistent experience between the main agent and its spawned workers.

**Recommended fix:**
- Pass a condensed version of the parent's system prompt context into `buildWorkerContext()`: at minimum, identity, user profile, and critical behavioral rules
- Workers don't need the full self-awareness block, but they need workspace context and user preferences
- Consider a `buildWorkerBaseContext()` method on the main Orchestrator that produces a minimal-but-complete context for spawned agents

---

### IMP-7: Catch-Up Recall Uses Hardcoded SQL Patterns (LOW IMPACT)

**The Problem:** The `recallMemory()` method has special handling for "catch-up" queries (e.g., "where did we leave off?") that bypasses semantic search in favor of importance-based SQL queries. The catch-up detection uses 13 hardcoded regex patterns.

**Why this matters:** This is brittle to phrasing variations. "Give me a summary" matches, but "what happened since Tuesday" doesn't (no matching pattern). The fallback to semantic search for unmatched catch-up phrases means the mock embedder's limitations apply.

**Recommended fix:**
- When real embeddings are available (M2), this special-casing may be unnecessary — semantic search should handle catch-up queries naturally
- In the interim, expand the pattern list or consider a simple intent classifier
- The SQL query itself is well-structured (importance-first, then recency) — the issue is only in the detection heuristic

---

### IMP-8: No Prompt Versioning or A/B Testing Infrastructure (STRATEGIC)

**The Problem:** The system prompt is hardcoded in chat.ts as a long template string. There is no mechanism to version prompts, compare variants, or measure which prompt formulations produce better user outcomes.

**Why this matters:** Prompt engineering is iterative. The GEPA optimization system (visible in the codebase) attempts system prompt optimization, but it operates on workspace-level prompts, not the core behavioral specification. The core prompt — which has the biggest impact on agent quality — has no optimization loop.

**Recommended fix:**
- Extract the behavioral specification into a separate, versioned file (e.g., `behavioral-spec-v2.md`)
- Implement prompt variant tracking: which version of the behavioral spec produced each response
- Connect to the GEPA optimizer: use conversation quality signals (corrections, positive feedback, task completion) to evaluate prompt variants
- This becomes critical at scale — you can't manually tune a 300-line behavioral spec for 13 personas across N workspace types
---

## Prioritized Improvement Roadmap

| # | Improvement | Impact | Effort | Priority |
|---|------------|--------|--------|----------|
| 1 | **IMP-1: Fix disclaimer contamination** — remove MANDATORY from personas, make topic-aware | Very High | Small | Do Now |
| 2 | **IMP-3: Replace mock embedder** — real semantic search transforms agent quality | Very High | Medium | M2 milestone |
| 3 | **IMP-5: Deduplicate persona/core instructions** — reduce token waste + over-weighting | Medium | Small | Do Now |
| 4 | **IMP-2: Audit system prompt size** — profile token count, trim behavioral spec | Medium | Small | Do Now |
| 5 | **IMP-4: Harden autoSaveFromExchange** — reduce false positives in memory writes | Medium | Medium | Next sprint |
| 6 | **IMP-6: SubagentOrchestrator context inheritance** — give workers parent context | Medium | Medium | Next sprint |
| 7 | **IMP-8: Prompt versioning infrastructure** — enable systematic prompt optimization | High (strategic) | Large | Plan for M3 |
| 8 | **IMP-7: Catch-up recall heuristic** — will self-resolve with real embeddings in M2 | Low | Small | Defer to M2 |

---

## Key Architectural Observation

The Waggle OS orchestrator system prompt architecture is among the most sophisticated I've encountered in agent frameworks. The dual-mind model (personal + workspace), the improvement detector with surfaced-flag deduplication, the persona compliance layer (resist persona mode switches), and the tiered self-awareness are all production-grade design patterns.

The core issue is not architectural — it's calibration. The system over-instructs on safety (disclaimers) and under-invests in semantic quality (mock embedder). Fixing IMP-1 (disclaimer contamination) is a 30-minute Claude Code session that will transform user perception of agent intelligence. Fixing IMP-3 (real embeddings) is the highest-leverage M2 deliverable for making the memory-first paradigm deliver on its promise.

---

*Analysis based on: orchestrator.ts (609 lines), personas.ts (354 lines), self-awareness.ts (107 lines), improvement-detector.ts (249 lines), subagent-orchestrator.ts (302 lines), agent-session.ts (139 lines), and chat.ts system prompt composition section (~400 lines of the 1,534-line file).*