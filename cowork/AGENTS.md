# AGENTS.md — Multi-Agent Session Guidelines

Supplements CLAUDE.md with agent-specific failure prevention.

---

## Before You Start

1. **Read CLAUDE.md first.** It is the authority. This file adds operational detail.
2. **Read the file you're about to edit.** Not "I read it earlier." Read it now.
3. **Check Section 8 of CLAUDE.md.** If what you're about to build already exists, stop.
4. **Grep before creating.** `packages/agent/src` has ~94 files. Duplication is easy.

## The Four Rules (Karpathy Principles)

These come from observed LLM coding failures. They are not suggestions.

### Rule 1: Ask, Don't Assume
The most expensive failure is building 100+ lines on a wrong assumption.
If the task is ambiguous, surface the ambiguity before writing code.

### Rule 2: Less Code Wins
If your solution is 200 lines, ask if 50 would do. Don't add:
- Abstractions for single-use code
- "Flexible" APIs nobody asked for
- Error handling for impossible scenarios
- Config systems for hardcoded values

### Rule 3: Surgical Diffs
Every changed line must trace to the task. Don't:
- Reformat adjacent code
- Add type hints to functions you didn't touch
- Change quote styles
- Add docstrings to existing functions
- Delete pre-existing dead code (mention it instead)

### Rule 4: Verify, Don't Claim
"I think this works" is not verification. Run the actual commands:
```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project app/tsconfig.json
npm run test -- --run
```
If you can't run them, say so. Don't claim success you haven't verified.

---

## Monorepo Awareness

This is a 16-package monorepo. Key facts:

- **Build order:** `shared → core → agent → server` (use `npm run build:packages`)
- **Changing types in `@waggle/shared`** affects everything downstream. Run full build.
- **`packages/agent/src`** has ~94 files. Don't try to hold it all in context. Read what you need.
- **`app/src-tauri/`** is Rust. If unsure about Tauri config, ask.
- **Two web surfaces:**
  - `app/src/` is the **Tauri shell** — minimal, mostly `cockpit/` UI
  - `apps/web/src/` is the **main web app** — where all the real UI lives
  - If you're editing "a component," you're almost certainly in `apps/web/src/components/`

## File Ownership Map

| Area | Real location | Watch out for |
|---|---|---|
| Agent behavior | `packages/agent/src/behavioral-spec.ts`, `orchestrator.ts` | Don't duplicate rules already in `BEHAVIORAL_SPEC` |
| Tool filtering | `packages/agent/src/tool-filter.ts` | `filterToolsForContext()` is the entry point |
| Security scanning | `packages/agent/src/injection-scanner.ts` | MUST be called on all connector/external input |
| Cost tracking | `packages/agent/src/cost-tracker.ts` | Has its own pricing table — don't hardcode prices elsewhere |
| Personas | `packages/agent/src/persona-data.ts` (data), `personas.ts` (logic) | Data is split from logic — keep it that way |
| Custom personas | `packages/agent/src/custom-personas.ts` | `loadCustomPersonas()` from disk |
| Feature flags | `packages/agent/src/feature-flags.ts` | Already exists — use it |
| Tiers | `packages/shared/src/tiers.ts` | `TIERS` = TRIAL/FREE/PRO/TEAMS/ENTERPRISE (not Solo/Basic/Teams — that's obsolete) |
| KVARK tools | `packages/agent/src/kvark-tools.ts` | Tier-gated to TEAMS/ENTERPRISE. Don't expose |
| Design tokens | `apps/web/src/**/waggle-theme.css` (and `app/`) | Hive DS — use tokens, don't hardcode colors |
| Onboarding UI | `apps/web/src/components/os/overlays/OnboardingWizard.tsx` | NOT `app/src/components/onboarding/` (doesn't exist) |
| Persona switcher UI | `apps/web/src/components/os/overlays/PersonaSwitcher.tsx` | Same parent path as OnboardingWizard |
| Memory — frames | `packages/core/src/frames.ts` | |
| Memory — identity | `packages/core/src/identity.ts` | |
| Memory — awareness | `packages/core/src/awareness.ts` | |
| Memory — search | `packages/core/src/search.ts` | HybridSearch |
| Harvest adapters | `packages/core/src/harvest/` | chatgpt/claude/gemini/pdf/markdown/url/etc. |
| Compliance | `packages/core/src/compliance/` | Interaction store, audit, status |
| Vault (secrets) | `packages/core/src/mind/vault.ts` | Don't build parallel secret stores |
| LLM routing | `litellm-config.yaml` (root) | LiteLLM routes all provider calls |
| Evolution subsystem | `packages/agent/src/evolution-*.ts`, `judge.ts`, `iterative-optimizer.ts` | Self-improvement pipeline — understand before touching |

## Common Mistakes to Avoid

1. **Editing the wrong UI tree.** `app/src/` is the Tauri shell (mostly empty). Real UI is in `apps/web/src/`.
2. **Creating a utility that already exists.** Grep `packages/shared/src/` and `packages/agent/src/` first.
3. **Importing from the wrong package.** Types → `@waggle/shared`. Memory → `@waggle/core`. Agent logic → `@waggle/agent`.
4. **Forgetting build order.** Changing shared types? Downstream packages won't see it until rebuilt.
5. **String interpolation in SQL.** Always parameterized. better-sqlite3 supports `?` placeholders.
6. **Touching `tauri.conf.json` allowlist.** Never set `all: true`. Use `app/src-tauri/capabilities/` for scoped permissions.
7. **Committing `.env` or API keys.** Only `.env.example` with key names goes in git.
8. **Using old tier names.** It's TRIAL/FREE/PRO/TEAMS/ENTERPRISE. Not Solo/Basic/Teams.
9. **Duplicating `persona-data.ts` content into `personas.ts`.** They split for a reason — keep it split.
10. **Hand-rolling LLM provider calls.** Route through LiteLLM / the provider adapters in `packages/agent/src/providers/`.

## Session Hygiene

- If the conversation is long (10+ exchanges), re-read files before editing.
- If a tool result seems incomplete, it was likely truncated. Re-run narrower.
- Prefer small, verifiable steps over big-bang changes.
- One logical change per commit. Dead code cleanup gets its own commit.
- When in doubt about a path: grep. Repo structure drifts; old docs lie.
