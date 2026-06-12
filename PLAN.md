# PLAN.md — Waggle OS Habit-Forming UX Refactor

> Mission: make the app's two superpowers — **persistent memory** and the **self-evolving agent** —
> viscerally obvious in the UI, so a non-technical user opens it, feels "it remembers me and keeps
> getting better," and keeps coming back. This plan is the canonical top-level map; the detailed
> product-interpretation layer lives in [`docs/ux-refactor/`](docs/ux-refactor/README.md) (inventories,
> per-screen gap cards S00–S21, deltas, review records).

---

## 1. Current-state UX audit (pre-refactor baseline)

Audited from live source (`apps/web/src`, `packages/server/src`, `packages/hive-mind-core/src`);
full inventories in `docs/ux-refactor/_inventory/{frontend,backend-routes,substrate-types}.md`.

**What the app was:** a single-route windowed desktop OS (`Desktop.tsx` + `Dock.tsx`, 27 window
types, no URL routing) over a deep but invisible backend substrate.

**Where memory failed to surface:**
- The `.mind` substrate (FrameStore, HybridSearch, KnowledgeGraph, IdentityLayer, AwarenessLayer in
  `packages/hive-mind-core/src/mind/`) was fully built but had **no first-class screen** — memory was
  only consumed silently inside chat prompts. A returning user saw the same cold desktop every time.
- No "here's where you left off" surface: workspace state existed server-side but no Home screen
  rendered it.
- Harvest (ChatGPT/Claude/Gemini import) existed as a pipeline with no guided UI.

**Where agent learning was hidden:**
- The self-evolving skill loop (create_skill / promote_skill / auto_extract_skills) wrote skills to
  disk with no provenance and no UI distinction from built-ins — the agent literally upgraded itself
  and the user could not tell.
- Evolution subsystem (`packages/agent/src/evolution-*.ts`) ran with zero user-facing framing.
- WaggleDance cross-workspace signals (skill_share, knowledge_match) flowed on a bus no screen showed.

**Where onboarding lost novices:**
- 7-step wizard with hardcoded template/persona arrays disconnected from the canonical `PERSONAS`
  data; orphaned steps; no memory-import moment ("aha: it already knows me") during first launch.
- Error states rendered as empty states ("No approvals yet" when the server was down) — a novice
  could not distinguish broken from idle (fixed in P7/D15 Track B).
- Risk/trust vocabulary drifted across five backend modules, so approval prompts showed the least
  information for the riskiest actions (fixed in P7/D15 Track A).

## 2. Target experience

Three pillars, each mapped to shipped surfaces:

**Pillar A — Memory-first UX.** A returning user lands on the **Home Cockpit** (S01,
`apps/web/src/components/os/AppShell.tsx` routes; `/api/home/*`): personal greeting from the
IdentityLayer, "while you were away" overnight briefing, resumable workspace cards with last activity,
and a **Memory Center** (S04, `MemoryCenterApp`) where remembered facts/preferences are browsable,
correctable, and deletable — memory the user can see and steer, not a black box.

**Pillar B — Visible agent evolution.** The **Skills Hub** (S06, `CapabilitiesApp` +
`skills/SkillRow.tsx`) shows agent-authored skills with an `agent · review` provenance badge
(P5/D4 governance: every skill write flows through `skill-write-service.ts` with lossless provenance);
the **Agent Center** (S09) and **Automation Center** (S11) frame learned workflows as benefits.
Cross-workspace knowledge sharing surfaces through WaggleDance signals and the memory provenance
badge — framed as "learned from your other workspace," never raw logs.

**Pillar C — Progressive reveal.** Onboarding (S12–S17) is a 5-step chain: who-are-you →
tool-discovery → memory-import (the "it already knows me" moment) → memory-review → workspace
creation. Novices land in one workspace with a friendly cockpit; the full Extend layer (Connector
Hub, MCP Hub, Marketplace — S07/S08/S21) is dock-zoned away from the first-session path and governed
by the approval/trust runtime (autonomy tiers Normal/Trusted/YOLO). Experts fast-path via Ctrl+K
Command Center (S03) and deep links. The engagement loop: clear next action on Home, visible
progress in workspace cards, and the overnight briefing as the reason to return.

## 3. Phased plan (as executed, P0–P7 — all on `main` @ `d369f6a`)

| Phase | Scope | Key artifacts |
|---|---|---|
| P0 | IA freeze: shared §15.2 types, dock → 5 IA zones, Home launch-flip | `docs/ux-refactor/_phase1-contract.md` |
| P1a/P1b | AppShell conversion (window manager deleted, URL routing), structural auth gate (boot 401-burst dead, SSE revival) | `appshell-conversion-plan.md`, `p1b-auth-gate-plan.md` |
| P2 | Memory Center + Artifact Center + onboarding rework (memory-import moment) | `p2-verification-record.md` |
| P3 | Intelligence: Agent/Skills/Automation Centers + 3 builders + fail-closed ApprovalModal | `p3-review-record.md` |
| P4 | Extend: Connector Hub / MCP Hub / Marketplace consolidation + critical-audit migration | `p4-launch-integrity-record.md` |
| P5 | Skill-write governance: one write-service, provenance stamp, autonomy gating, `agent · review` badge | `p5-skill-governance-plan.md`, `p5-review-record.md` |
| P6 | Hardening (error-state + risk-taxonomy groundwork) | — |
| P7 | D15 closure: error-never-as-empty (Track B), one risk/audit vocabulary + critical tier (Track A), divergences #8/#15/#17 | `p7-d15-scope.md`, review records |

Phase 5 (Team/RBAC) is founder-DEFERRED and out of scope.

## 4. Judge loop — EXECUTED (3 rounds, 2026-06-12)

Three rounds ran to completion: 15 fresh-context persona verdicts + 3 independent verifier
PASSes, ~60 confirmed defects fixed across 6 commits (recency truth, chat markdown, dedup
root causes in three write paths, honest cross-mind totals behind an explicit isolation
contract, jargon sweep, agent-evolution visibility, a real agent run). Scores rose and
complaint counts fell (53→40), but no judge awarded a 5 on any criterion in any round —
the unanimity bar proved structurally unreachable in-session (longitudinal growth evidence
cannot be staged without being detected as staging; the no-caveat rubric plus adversarial
fresh panels regenerates finer complaints each round; personas contradict each other).
Full analysis and residuals: [`judging/FINAL-REPORT.md`](judging/FINAL-REPORT.md).

## 5. Boundaries honored

No new features beyond the mission; no new external/paid dependencies; backend touched only to
surface memory/agent state (e.g. `/api/home/*`, provenance on skill GET); validation at system
boundaries only; no feature flags or compat shims — code changed in place.
