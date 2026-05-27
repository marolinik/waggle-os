# 5 Knowledge-Worker Personas — Audit Subjects

Each persona has: identity, primary job-to-be-done, 5-min smoke workflow, success criteria,
known frustration triggers. They map to existing Waggle personas in `packages/agent/src/persona-data.ts`.

---

## P1 · Maya — Researcher (PhD, market-intel)
- **Maps to:** `researcher`
- **Primary JTBD:** "Find what I learned about X two weeks ago, then extend it."
- **Smoke workflow (5 min):**
  1. Boot → Desktop visible <3s
  2. Open chat → ask: "What do I know about <topic>?"
  3. Expects: memory recall with citations + sources
  4. Asks follow-up: "Find more sources and merge with what I have"
  5. Saves output to Files
- **Hard requirements (red flags if missing):**
  - Memory recall surfaces visibly (Context Rail or inline)
  - Sources cited next to claims
  - Search-the-workspace works in <2 clicks
- **Frustration triggers:** silent re-ranking, no provenance, missing search box

---

## P2 · Anya — Writer (content strategist)
- **Maps to:** `writer`
- **Primary JTBD:** "Draft a 600-word piece in my voice; let me iterate on tone."
- **Smoke workflow:**
  1. Open chat → "Help me draft a piece on <topic> in my voice"
  2. Expects: persona suggestion for `writer` (or already active)
  3. Gets a draft → asks "more concise, less hype"
  4. Saves draft to Files; opens it again later, expects it intact
- **Hard requirements:**
  - Persona switch ≤ 2 clicks, with clear "now writing as: writer" feedback
  - Multi-paragraph rendering legible (no markdown leak)
  - File save & reopen round-trip works
- **Frustration triggers:** raw markdown, can't change tone, lost draft

---

## P3 · Daniel — Analyst (BI / finance ops)
- **Maps to:** `analyst`
- **Primary JTBD:** "Drop a CSV, get structured insight, repeat on next CSV."
- **Smoke workflow:**
  1. Drag CSV into Files (or chat attachment)
  2. Ask: "Summarize columns, flag outliers"
  3. Expects: structured table response, not prose
  4. Reuse same prompt with second file
- **Hard requirements:**
  - File ingest UI obvious (drop target visible)
  - Structured output rendering (tables, lists)
  - Repeat-prompt UX (history, pin, reuse)
- **Frustration triggers:** prose-only output, no file upload affordance, can't reuse prompt

---

## P4 · Sara — Project Manager (cross-functional)
- **Maps to:** `project-manager`
- **Primary JTBD:** "Track status across N threads, produce a weekly update."
- **Smoke workflow:**
  1. Open multiple chats or a Room → assign different agents
  2. Switch between threads via dock / window list
  3. Ask each: "What's blocking?"
  4. Compose weekly update synthesising answers
- **Hard requirements:**
  - Multi-window or tab navigation discoverable
  - Each chat keeps context independently
  - Global search across chats
- **Frustration triggers:** lost chat history, can't see all open work, can't pin updates

---

## P5 · Markus — Consultant (strategy, decks)
- **Maps to:** `consultant`
- **Primary JTBD:** "Apply a framework (Porter / 2x2 / SWOT) to a topic, get an outline."
- **Smoke workflow:**
  1. Switch persona → `consultant`
  2. Ask: "Analyse <topic> with a 2x2 matrix; one axis impact, one effort"
  3. Expects structured output usable for slides
  4. Saves to Files; checks formatting holds
- **Hard requirements:**
  - Persona switcher accessible
  - Structured / outline output rendering
  - Save → reopen preserves formatting
- **Frustration triggers:** generic answer, lost formatting, no follow-up scaffolding

---

## Scoring Rubric (10 dims · 1 pt each · 10/10 perfect)

| # | Dimension | Pass criterion |
|---|---|---|
| 1 | First-run clarity | New user finds first valid action ≤ 60 s |
| 2 | Persona discovery | Persona is discoverable, switchable, current state visible |
| 3 | Task completion | Persona's smoke workflow finishes without dead ends |
| 4 | Information findability | Search / memory / files reachable ≤ 2 clicks from anywhere |
| 5 | Error recovery | Errors give a next step, not just a message |
| 6 | Visual clarity | Layout scannable, contrast ≥ WCAG AA, no overflow at 1440×900 |
| 7 | Performance feel | First action < 200 ms perceived; no jank, no flash of unstyled |
| 8 | Memory / context | At least one recall surfaces relevant prior turn within smoke flow |
| 9 | Trust signals | Status, sources, model name, costs are visible when relevant |
| 10 | Delight | One non-trivial polish moment the persona would mention positively |

**Half-points NOT allowed.** A dim is 1 (pass) or 0 (fail). 10/10 = unambiguous.
