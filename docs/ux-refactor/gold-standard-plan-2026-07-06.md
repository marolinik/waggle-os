# UX Gold-Standard Polish — Mission Plan (2026-07-06)

**Founder goal:** Polish Waggle OS UX to gold standard incl. images + icons; full rich
experience in **dark AND light**; beat Claude / ChatGPT / Codex / Hermes / Odyssey on UX.
Scope explicitly includes **onboarding** and the **landing site** (`apps/www`).
Use **nano-banana** (Gemini image gen; key in `~/.nano-banana/.env`) for imagery/icons.
**Done when 5 persona judges each grade ≥ 9/10** (in both themes).

## Starting state (verified 2026-07-06)
Functional UX bugs cleared across waves through 2026-07-05. Design system is production-grade:
"Warm-Hive / Hive DS", ~140 tokens, dark(default)+light(`:root[data-theme=light]`) near-parity
with a WCAG-AA guard test. Icons: lucide-react (155 files) + simple-icons (brands). Motion:
framer-motion + rich CSS keyframes. Type: Hanken Grotesk + JetBrains Mono, scale tops at 24px.

**The gap is imagery + refinement, not the token system.**

## The 5 Judge Personas (rubric — score /10 each, need all ≥9)
1. **Design Director** (ex-Apple/Linear) — visual craft: type hierarchy, spacing rhythm,
   elevation, color vibrancy, motion, cohesion. "Would this win a design award?"
2. **Skeptical Knowledge Worker** (target: busy PM/consultant) — clarity, ease, first-run
   comprehension, trust. "Would I switch from ChatGPT/Claude?"
3. **Competitor-Benchmark Critic** — explicit head-to-head vs Claude/ChatGPT/Codex/Hermes/
   Odyssey. Scores RELATIVE to them.
4. **Accessibility & Theme-Parity Auditor** — contrast, both themes equally polished, focus
   states, readability, WCAG AA.
5. **Brand / Emotional-Resonance Judge** — does "Warm-Hive" land? imagery cohesive + NON-generic
   (anti-AI-slop)? memorability, delight.

Each judge returns: overall /10, per-surface notes, top-5 concrete fixes ranked by impact.

## Phases
- **P0 Baseline** — capture every surface dark+light (in progress) → 5-judge baseline scores +
  prioritized critique. Establishes the gap.
- **P1 Assets (nano-banana)** — cohesive Warm-Hive imagery where it genuinely elevates:
  - Complete the **22 persona avatars** (14 new; base template in `assets/personas/README.md`).
  - **Empty-state spot illustrations** (flat honey-hex, transparent): marketplace, memory,
    files, agents, artifacts, connectors, chat-first-run.
  - **Onboarding** welcome/ready hero art.
  - **Landing** hero + feature imagery + OG (as gaps found).
  - Chrome stays crisp SVG/CSS (anti-slop) — raster only where it adds warmth.
- **P2 Icon hygiene** — replace ~18 stopgap emoji (NotificationInbox, Timeline/Harvest frame
  types, ModelSelector, agent-avatar fallback) with lucide/custom SVG.
- **P3 Refinement** — add a display type tier for hero moments; richer elevation/gradient
  application; light-mode honey vibrancy; motion polish; theme-parity fixes.
- **P4 Re-judge loop** — iterate until all 5 judges ≥9 in both themes.

## Asset generation — 14 new persona avatars (unique per persona)
Owners keep existing sprite; NEW avatars for the 14 sharers. Base template from README,
substitute [ACTION]. Distinct props:
consultant, project-manager, product-manager-senior, ops-manager, verifier,
executive-assistant, hr-manager, support-agent, marketer, creative-director,
legal-professional, finance-owner, data-engineer, recruiter.

## Constraints
- Surgical edits; match existing style; commit per phase; DO NOT push without founder OK.
- Substrate (`hive-mind-core`) off-limits (§7.5). This is a UI/asset arc.
- Gates each phase: `npm run typecheck:web`, `npm run test -- --run` (web), lint.
