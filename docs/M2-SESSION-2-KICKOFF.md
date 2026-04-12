# Waggle OS — M2 Sprint Session 2 Kickoff

## How This Works

I (Marko) upload this document to a new Claude.ai chat. Claude reads my repo via Desktop Commander / Filesystem MCP tools, produces Claude Code prompts, and I execute them in Claude Code. Claude.ai = strategist + prompt author. Claude Code = executor.

## Repo
`D:\Projects\waggle-os` — Tauri 2.0 + React/TypeScript monorepo (15 packages).
Build chain: `packages/shared → core → agent → server → apps/web` — compiles with **0 errors**.

## M2 Completed (Session 1 — 31 Mar 2026)

| # | Item | What Was Built |
|---|------|---------------|
| M2-1 ✅ | Real embedding provider | `packages/core/src/mind/` — `inprocess-embedder.ts`, `ollama-embedder.ts`, `api-embedder.ts`, `embedding-provider.ts`. Hybrid fallback: InProcess (@huggingface/transformers) → Ollama → Voyage/OpenAI (from Vault) → Mock. All normalized to 1024 dims. Server + sidecar updated. |
| M2-3 ✅ | Tauri desktop builds | `scripts/bundle-node.mjs` + `bundle-native-deps.mjs`. `service.rs` resolves bundled node.exe, sets WAGGLE_SKIP_LITELLM=1, native module env vars. CI release.yml updated for Win + macOS matrix. |
| M2-4 ✅ | Landing page + pricing | `apps/www/` — Vite+React, pure CSS, Hive Design System. 8 components. 62 brand assets copied. GitHub Pages deploy. Solo free / Teams $29/mo / Business $79/mo. |

## M2 Remaining (This Session)

Execute in this order:

| # | Item | Brief | Priority |
|---|------|-------|----------|
| **M2-5** | Onboarding first-5-minutes polish | Guided first conversation after wizard, contextual welcome message from agent, template starter memory as visible frames, template-aware tooltips, first-run success signal | **DO FIRST** |
| **M2-7** | Basic telemetry | Local SQLite, privacy-first, opt-in. Track: session count, tool usage, embedding provider, workspace count, agent response times | Second |
| **M2-6** | Keyboard power user flow | Cmd+K / Ctrl+K fuzzy search across workspaces, memories, files, commands. Slash command autocomplete expansion | Third |
| **M2-2** | Stripe subscription | Stripe Checkout + Webhooks + Customer Portal. Tier gating: Solo free, Teams $29/mo, Business $79/mo. License key activation for desktop app | **LAST** |

## Key Files for M2-5 (Onboarding)

```
app/src/components/onboarding/OnboardingWizard.tsx   — 7-step wizard (already works)
app/src/hooks/useOnboarding.ts                       — localStorage state management
app/src/App.tsx                                      — Wizard mount + onFinish callback
packages/server/src/local/routes/chat.ts             — Template welcome context (~line 839-850)
packages/server/src/local/routes/workspace-templates.ts — Template definitions
packages/server/src/local/routes/workspaces.ts       — POST /api/workspaces
```

The wizard flow is complete (Welcome → WhyWaggle → MemoryImport → Template → Persona → APIKey → HiveReady). What's NOT polished is the first 5 minutes AFTER the wizard ends — empty chat, no guidance, no contextual welcome.

## Prompt Format

Read the relevant files from repo first. Then produce a single Claude Code prompt per M2 item:
- Exact file references (path + line numbers)
- Step-by-step implementation plan
- Constraints (what NOT to modify)
- Verification checklist
- File summary table (CREATE / EDIT / NO CHANGE)

Language: English for prompts/code, Serbian for communication with me.
Tone: Professional CxO consultant.

## Confirmed Technical Decisions
- Embedding: OBA Hybrid (InProcess default, Ollama/API for power users)
- Payment: Stripe (Checkout + Webhooks + Customer Portal)
- Platform: Windows (.exe NSIS) + macOS (.dmg) simultaneous
- Pricing: Solo free / Teams $29/mo / Business $79/mo
- Landing: apps/www/ on GitHub Pages
- Build chain: shared → core → agent → server → apps/web (0 errors)
