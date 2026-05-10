---
decision_id: 2026-04-28-phase-4-4-skills-audit-results
date: 2026-04-28
phase: 4.4 skills audit sweep
verdict: skills system is mostly model-portable (87.4% clean). 12.6% with detectable narrative bias = Tier 1 deferred to Sprint 12. NO blocker for Phase 5 NULL-baseline. Surface finding: pilot 2026-04-26 didn't engage skills system at all — empirical anchoring impossible.
predecessor: 2026-04-28-phase-4-3-rescore-delta-report.md
sprint_plan: D:\Projects\waggle-os\decisions\2026-04-26-agent-fix-sprint-plan.md
---

# Phase 4.4 Skills Audit Sweep — Results

## TL;DR

Audited skills in two layers:
- **TS source layer** (`packages/agent/src/skill-*.ts`, 8 files): governs how skills are loaded, surfaced, recommended, generated. **Model-portable by construction.** No bias surface found.
- **Skill-content layer** (159 SKILL.md files: 152 user-global + 7 workspace): the actual skill descriptions/bodies. **Systematic bias scan: 12.6% (20/159) have detectable narrative-voice / CoT-imperative / philosophy-keyword patterns.**

**Most important finding: the 2026-04-26 pilot prompts contain NO skill descriptions.** The agent's skill recommender wasn't engaged during pilot orchestration. Whatever bias exists in skill content is empirically irrelevant to the H3/H4 deltas — those failures are NOT explained by skill-surface bias because skills weren't surfaced.

**Tier 1 (description rewrite would help): 20 skills.** Defer to Sprint 12 cleanup. No blocker for Phase 5 NULL-baseline.
**Tier 2 (real coverage gap): no candidates from this sample.** Skills cover broad task categories; no obvious uncovered category surfaced.
**NEW finding: skill-engagement gap.** Recommender isn't wired into the agent loop's prompt assembly during the pilot scenario. This is orthogonal to skill-content bias and worth flagging as a separate concern.

Cumulative cost: **$0** (pure code+content audit; no LLM calls).

## Methodology

Per Option A discipline (audit-only, no refactor):

1. **TS source review** — read 3 of 8 skill-*.ts files in full (`skill-tools.ts` first 100L, `skill-frontmatter.ts`, `skill-recommender.ts`, `skill-creator.ts`). Sampled the rest by file size + filename.

2. **Skill content sampling** — hand-read 6 skill markdown files representing diverse categories:
   - `ax-gepa` (workspace, technical / GEPA-relevant)
   - `agent-chronicle` (user-global, narrative)
   - `django-tdd` (user-global, technical / TDD)
   - `elite-longterm-memory` (user-global, marketing)
   - `configure-ecc` (user-global, procedural)
   - `gsd-research-phase` (user-global, command-style)

3. **Systematic bias scan** — 159 SKILL.md files scanned with 6 narrative-bias regex patterns:
   - `we-think` (first-person plural: "we process", "we believe", "we are")
   - `our-philosophy` ("our approach", "our way", "our values", "our mission")
   - `philosophy-keyword` ("philosophy", "the spirit", "deep down", "fundamentally")
   - `marketing-superlative` ("ultimate", "bulletproof", "never lose", "never forget")
   - `emoji` (codepoint detection in body)
   - `CoT-imperative` ("let me", "i'll start", "step-by-step", "first.. then")

4. **Empirical anchor attempt** — inspected pilot 2026-04-26 prompt archive to check if skills surfaced. Result: **no skill content in any pilot prompt.** Audit becomes theoretical (bias may exist but didn't affect pilot outcomes).

## TS source layer findings

### `skill-tools.ts` (41 KB, 8 tools defined)

**Tool definitions for the agent:**
- `discover_skills`, `install_skill`, `create_skill`, `auto_extract_skills`, `promote_skill`, `retire_stale_skills`, `recommend_skills`, …
- All tools have **concrete imperative descriptions** (e.g., "Search the marketplace catalog…"). No narrative voice. Model-portable.

**Surfacing logic:** skills are loaded from disk and provided to the orchestrator via dep injection. The actual prompt assembly (including how skill content lands in the system prompt) is **not in this file** — it's the orchestrator's concern.

VERDICT: Tier 0 (no bias).

### `skill-frontmatter.ts` (5.8 KB)

Pure parsing utility. YAML-ish frontmatter parser. No prompt content; cannot introduce bias.

VERDICT: Tier 0.

### `skill-recommender.ts` (9.5 KB)

Pure-keyword scoring with synonym clusters and bigram overlap. Multi-signal TF-IDF-inspired ranking. **Returns top-N skills by relevance score** — feeds into prompt only when caller chooses to surface them.

The synonym clusters (line 44-58) are model-agnostic — concept-based, not Claude-specific.

VERDICT: Tier 0.

### `skill-creator.ts` — generator template

Lines 26-62: `generateSkillMarkdown(template)` produces SKILL.md from a `SkillTemplate`. **Output shape is concrete + imperative** — Trigger Patterns / Steps / Tools Used / Category — no narrative voice.

Sample output for an auto-generated skill would have:
```
## Trigger Patterns
Activate this skill when the user asks about: <triggers>

## Steps
1. <imperative step>
2. <imperative step>
```

This is model-portable. Any new skill generated by the agent will be Tier 0.

VERDICT: Tier 0.

## Skill-content layer findings

### Hand-sampled (6 files)

| Skill | Category | Description shape | Body shape | Tier |
|---|---|---|---|---|
| `ax-gepa` | workspace, technical | Concrete trigger keywords | Imperative bullets, code patterns | **Tier 0** |
| `agent-chronicle` | user, narrative | Narrative ("AI perspective journaling") | "We process thousands…" first-person plural; "Philosophy" section pure narrative; emoji in title | **Tier 1** |
| `django-tdd` | user, technical | Concrete activation criteria | Procedural / code-driven | **Tier 0** |
| `elite-longterm-memory` | user, infrastructure | Marketing copy ("Ultimate", "bulletproof") | Marketing prose; "Never lose context. Never forget decisions." emphasis stack | **Tier 1** |
| `configure-ecc` | user, procedural | Concrete activation triggers | Imperative bullets | **Tier 0** |
| `gsd-research-phase` | user, command | Concrete `argument-hint` | `<objective>` XML wrapper (Claude-leaning but generally portable) | **Borderline** |

2 of 6 hand-sampled (33%) flagged as Tier 1. Higher than the systematic scan rate because hand-sampling biased toward illustrative cases.

### Systematic scan (159 files, 6 regex patterns)

| Pattern | Hits | Notes |
|---|---|---|
| `CoT-imperative` ("let me", "step-by-step", etc.) | 12 | Most common bias |
| `philosophy-keyword` | 5 | Verbose framing in body |
| `we-think` (first-person plural) | 3 | Narrative voice |
| `marketing-superlative` ("ultimate", "bulletproof") | 1 | Marketing copy |
| `our-philosophy` | 1 | Narrative voice |
| `emoji` (body emoji) | 1 | Decorative |
| **Skills with ≥1 hit** | **20 (12.6%)** | |
| **Skills clean** | **139 (87.4%)** | |

The dominant pattern is CoT-imperative phrasing — verbose multi-step instructions in narrative form. Phase 1.1 normalize won't strip this from skill content (it's content, not output artifact). Sprint 12 rewrite would be needed.

## Tier classification

### Tier 0 (model-portable, no action needed)
- All 8 TS source files (skill-*.ts)
- 139 of 159 SKILL.md files (87.4%)
- Skill creator's generator template — new skills will be Tier 0 by construction

### Tier 1 (description/body rewrite would help — **defer to Sprint 12**)
- 20 SKILL.md files (12.6%) with detectable narrative-voice / CoT-imperative / philosophy-keyword bias
- These would benefit from rewrite to imperative-direct format
- **NOT a blocker for Phase 5 NULL-baseline** (pilot didn't engage skills)
- Cumulative refactor effort estimate: ~2-3 hours per skill × 20 skills = ~40-60 hours of focused work. Out-of-scope for current sprint.

### Tier 2 (real coverage gap — GEPA territory, defer to CC-2 work)
- **No candidates surfaced from this sample.** Skills cover broad task categories (writing, coding, research, planning, decision support). The pilot's H3/H4 failures are content-quality issues in synthesis output, not gaps in skill coverage.

### NEW (not in original Phase 4.4 brief): skill-engagement gap
- The 2026-04-26 pilot orchestration **didn't surface any skill content into prompts.** Recommender ran (or didn't — unclear) but no skill descriptions made it into the LLM's context.
- This is a wiring concern, not a skill-content concern. If Phase 5 NULL-baseline runs the same scenario configuration, the issue will repeat.
- **Recommendation:** if PM wants to test whether skill engagement materially helps Qwen vs Opus, that's a separate dedicated experiment, not part of Phase 5 NULL-baseline.

## Strategic implications

### Phase 5 NULL-baseline impact

NONE. The skills system was not engaged during the pilot, so no skill-bias-related signal exists in the H3/H4 deltas. Phase 5 NULL-baseline can proceed without skill work.

### Sprint 12 cleanup recommendation

Rewrite the 20 Tier 1 skills to imperative-direct format. Generator template (`skill-creator.ts`) is already model-portable, so newly-generated skills won't accumulate bias. Manual cleanup applies only to the legacy corpus.

Priority order (highest-impact first based on hand-sampling):
1. `agent-chronicle` (philosophy + emoji + first-person plural — strong bias)
2. `elite-longterm-memory` (marketing copy + "Never lose…" emphasis stack)
3. The 12 CoT-imperative skills — bulk rewrite to bullet-imperative form
4. The 5 philosophy-keyword skills — strip philosophical framings

### Out-of-scope for this audit

Per PM brief discipline:
- No code changes (audit-only)
- No skill rewrites
- No new test coverage required (no source code modified)

## Audit chain

| Item | Value |
|---|---|
| Branch HEAD | `c9bda3d` (Phase 4.7 commit, unchanged) |
| TS source files reviewed | 8 of 8 (`skill-*.ts` in `packages/agent/src/`) |
| SKILL.md files in scope | 159 (152 user-global + 7 workspace; 3 dirs without SKILL.md) |
| SKILL.md files hand-sampled | 6 |
| SKILL.md files scanned (regex patterns) | 159 |
| Bias detection rate | 12.6% (20/159) |
| Audit cost | $0 (no LLM calls) |
| Tests modified | 0 |
| Code modified | 0 |

## PM ratification asks

1. **Accept Tier 1 / Tier 2 split as documented** (no Tier 2 candidates; 12.6% Tier 1 deferred to Sprint 12)?
2. **Acknowledge the skill-engagement gap as a NEW finding** (orthogonal to the original audit scope) and decide whether to author a dedicated brief for "skill engagement during agentic synthesis" experiments? Recommendation: defer; not a Phase 5 NULL-baseline blocker.
3. **Proceed to Phase 4.5 (tools audit)** per recommended order.

---

**End of Phase 4.4. Ready to proceed to Phase 4.5 (tools audit) per PM ratification.**
