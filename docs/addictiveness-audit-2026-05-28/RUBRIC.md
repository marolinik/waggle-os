# Addictiveness Rubric — Waggle OS
**Date:** 2026-05-28 · **Framework basis:** Nir Eyal's Hook Model (trigger → action → variable reward → investment) adapted to AI assistants, plus retention-design literature (PMF surveys, daily-active-use thresholds).

## What this rubric ISN'T
This is NOT the usability rubric from 2026-05-27. That measured "can the user complete a task". This measures "does the user come back tomorrow, and choose Waggle over OpenClaw / Hermes / Claude Cowork / Claude Code for non-coding work".

## What "10/10 addictiveness" means
A user opens Waggle on day 2 unprompted, prefers it over their previous default for ≥ 3 distinct categories of work, and would describe it as "the one AI tool I need" in a PMF-style survey. The rubric below decomposes that into 10 observable dimensions.

## The 10 dimensions

### A · TRIGGER DIMENSIONS (Eyal: external + internal triggers)

**1. External trigger surface** — Are there durable touch-points outside Waggle that pull the user back in? (Email digest, notification, browser extension, OS taskbar/dock, hotkey, scheduled report, MCP from another tool.) **Pass:** ≥ 2 durable external triggers per persona's workflow.

**2. Internal trigger fit** — When the user feels a specific cognitive itch (curiosity, anxiety, loneliness with the work, "I forgot what I decided"), does Waggle map to that itch better than alternatives? **Pass:** named internal trigger per persona maps to a Waggle affordance reachable in ≤ 2 clicks.

### B · ACTION DIMENSIONS (Fogg: motivation + ability + trigger at the same moment)

**3. First-session hook moment** — Within the first 60 seconds of the very first session, does the user experience a "this is different / this remembers me / this saved me time" moment? **Pass:** an observable WOW within 60s that requires no setup.

**4. Friction-to-value ratio** — For the persona's most common task, how many clicks/keystrokes from launch → useful output? **Pass:** ≤ 3 clicks AND ≤ 30 seconds for the persona's top task on day 2+.

### C · VARIABLE REWARD DIMENSIONS

**5. Reward of the tribe** — Does Waggle deliver social-graph value (shared workspaces, team presence, "X is also using this", peer-context)? **Pass:** at least one social-loop surface that creates "FOMO if I'm not in Waggle".

**6. Reward of the hunt** — Does the user feel they're hunting/discovering valuable artifacts (memory recalls, surprising connections in the knowledge graph, "I forgot I wrote that")? **Pass:** ≥ 1 surprise-recall or surprise-connection per session of typical use.

**7. Reward of the self** — Does Waggle make the user feel more competent / more themselves / better at their craft? Skills they personalize, voice they refine, memory that grows in their own image. **Pass:** ≥ 1 personalisation surface (custom persona, custom skill, brand voice file, identity field) that compounds value with use.

### D · INVESTMENT DIMENSIONS (Eyal: stored value increases over time → switching cost grows)

**8. Stored personal data that compounds** — Memory, decisions, voice, brand, projects. Does each session leave more behind than it consumed? **Pass:** memory frame count + entity count + relation count visibly grow week-over-week with normal use.

**9. Switching cost on day 90** — Could the user export everything and walk to a competitor? More importantly: would the experience there be worse because Waggle's accumulated context can't be recreated? **Pass:** ≥ 3 dimensions of accumulated value that are non-trivially recreatable elsewhere.

**10. "The one tool" coverage** — Across the persona's typical week, what fraction of their AI-assisted work happens in Waggle vs other tools (ChatGPT, Claude Code, Notion AI, Gemini, Copilot)? **Pass:** ≥ 80% coverage for the persona's typical week, no obvious "for X I open Y instead".

## Scoring rule
- Half-points are NOT allowed. Each dim is 0 (fail) or 1 (pass).
- 10/10 means observable evidence for every dim, not aspirational design intent.
- "Aspirational" + "not built yet" → score 0 for that dim and lift the gap into FEATURE-REQUESTS.md.

## Honesty rules (carried over from 2026-05-27 audit)
- Score against EVIDENCE in the live build, not assumptions about how it should work.
- Mark "out of scope" gaps explicitly (e.g., runtime MCP install). Don't game the score.
- Workflow-reality-check applies: don't penalize a persona for missing a feature their REAL workflow doesn't need.
