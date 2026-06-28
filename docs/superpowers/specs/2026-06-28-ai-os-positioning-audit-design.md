# Waggle AI OS Positioning Audit Design

Date: 2026-06-28
Status: Approved concept, pending implementation plan

## Purpose

Create a repeatable E2E audit that grades Waggle honestly as an AI OS. The test should show where Waggle is compelling, where it feels addictive or habit-forming, how it compares with realistic competitors, and which product improvements would most increase adoption.

The audit is a report generator, not a gatekeeper. It should fail only when the audit cannot run. A poor Waggle score is valid output and should produce clear improvement areas instead of failing CI.

## Product Question

Can Waggle be positioned as an AI OS rather than another AI chat app?

The audit answers this through five lenses:

1. Does a new user reach value quickly?
2. Does memory and continuity create a reason to return tomorrow?
3. Does Waggle cover enough of the user's real workflow to become the primary AI surface?
4. Does Waggle compare favorably with the user's current default tool?
5. Which missing or weak surfaces prevent stronger AI OS positioning?

## Five Personas

The audit will use five personas that span non-technical to power-user workflows. Each persona has a real current competitor and a specific "one tool" criterion.

| Persona | Current default | Primary job-to-be-done | One-tool criterion |
|---|---|---|---|
| Sofia, small business operator | ChatGPT, Gmail, Canva | Draft customer replies, campaign ideas, supplier follow-ups | Daily communications and decisions happen in Waggle |
| Mara, marketing/writer | ChatGPT, Claude, Notion AI | Turn notes and research into branded copy | Voice, drafts, and campaign memory compound in Waggle |
| Imran, consultant/strategist | Claude, ChatGPT, Gamma | Convert calls and notes into frameworks, briefs, and follow-ups | Client context and recurring strategy work live in Waggle |
| Daniel, finance/ops analyst | Excel Copilot, ChatGPT, Looker | Explain variance, summarize metrics, prepare board commentary | Data commentary and recurring monthly memory live in Waggle |
| Priya, AI power user | Claude Code/Codex, Hermes/OpenClaw, custom scripts | Coordinate AI workflows, skills, connectors, and memory | Waggle is the front door for non-coding agent work |

## Competitor Set

The audit will score against realistic alternatives rather than a generic "AI tool" baseline:

- ChatGPT: strong general chat, weak workspace/memory control.
- Claude: strong writing and reasoning, weak OS/workflow surface.
- Claude Code/Codex-style developer tools: strong coding agents, weak non-coding workspace OS.
- Notion/Workspace AI: strong document/workspace adjacency, weaker agent runtime and local memory.
- Hermes/OpenClaw-style agent frameworks: strong technical extensibility, weak non-technical UX and guided positioning.

The test will not call competitor services. It will use a documented benchmark matrix based on known product categories already reflected in the repo's competitive benchmark tests.

## Scoring Model

Each persona receives a 100-point score:

| Dimension | Points | Evidence |
|---|---:|---|
| Onboarding clarity | 15 | App loads, first-run path is understandable, no broken shell |
| Time to first value | 15 | Core route/API response speed and reachable primary action |
| Memory and continuity | 20 | Save/recall flow, workspace isolation, persistence signal |
| Workflow coverage | 15 | Relevant personas, skills, connectors, workspace surfaces |
| Competitive advantage | 15 | Capability gap versus persona's current default |
| Addiction/return signal | 20 | External trigger, internal trigger fit, investment, stored value |

Overall grades:

- 90-100: Strong AI OS position, ready for broader acquisition testing.
- 75-89: Strong niche fit, needs sharper first-session magic or workflow coverage.
- 60-74: Promising, but users still have obvious reasons to return to competitors.
- 40-59: Positioning is plausible but product experience is not yet persuasive.
- 0-39: Users likely experience Waggle as another AI chat/tool wrapper.

## Audit Output

The Playwright spec will produce a structured Markdown report and a JSON summary under a test artifact directory. The report should include:

- Overall grade and short interpretation.
- AI OS positioning verdict.
- Addiction level: weak, emerging, strong, or very strong.
- Persona-by-persona scores.
- Competitor comparison by persona.
- Top improvement areas, ranked by score impact.
- Evidence notes for failed or weak dimensions.

The report is the deliverable. The test should log the report location and pass when report generation succeeds.

## E2E Shape

Target file:

`tests/e2e/ai-os-positioning-audit.spec.ts`

The spec will run against the existing Playwright server configuration and `WAGGLE_E2E_BASE_URL`.

The test will:

1. Load the app shell with onboarding skipped for stable route checks.
2. Probe required product routes and APIs.
3. Create isolated workspaces where allowed.
4. Save and recall persona-specific memory anchors.
5. Inspect personas, skills, connectors, marketplace, hooks, fleet, and health endpoints.
6. Score each persona using deterministic evidence.
7. Generate Markdown and JSON artifacts.

The spec will avoid real LLM dependency by default. If a live LLM is configured, future versions can add optional answer-quality grading, but the first implementation should remain deterministic.

## Improvement Backlog Rules

Improvement areas should be generated from score gaps, not hand-written optimism.

Examples:

- Low onboarding clarity: improve first-session explanation, reduce setup choices, make "AI OS" visible in first viewport.
- Low memory continuity: make memory save/recall visible earlier, show citations or "why I know this."
- Low workflow coverage: add persona-specific connectors, templates, or import paths.
- Low addiction signal: add durable external triggers such as daily brief, return reminders, import nudges, or OS-level hotkey.
- Low competitive advantage: make the differentiator explicit against ChatGPT/Claude for that persona.

## Non-Goals

- Do not run paid competitor APIs.
- Do not require a real LLM key.
- Do not fail CI only because Waggle's product score is low.
- Do not replace moderated human testing; this audit complements the existing user-test protocol.
- Do not make product changes while adding the audit.

## Verification

Implementation verification should include:

- TypeScript compiles for the new Playwright spec.
- The audit spec runs and produces Markdown plus JSON artifacts.
- Existing E2E harness still starts the local Waggle server.
- The report contains all five personas, an overall grade, and at least one improvement area when any dimension is below full score.

## Open Assumptions

- Report artifacts can live in the existing Playwright/test artifact area rather than committed docs.
- The audit will start in report mode and later can grow strict thresholds if the team wants launch gates.
- Existing competitor benchmark claims in the repo are sufficient for category-level comparison without live competitor calls.
