# Polish Sprint — 2026-04-18 → launch-ready

**Purpose:** Take Waggle from PA v5 ship state to full polish before resuming Marko's P0 critical-path actions. Parent backlog: `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md`.

**State at kickoff:** main @ `f08d3fc`, tree clean, 195 commits ahead of origin, PA v5 shipped.

---

## Non-coding items still on Marko

| # | Item | Timing |
|---|---|---|
| M1 | Chase OpenAI export email; refresh if not in by Mon AM | Passive |
| M2 | Claude / Anthropic export | ✅ DONE |
| M3 | Google / Gemini export | ✅ DONE |
| M4 | Perplexity — manual-only, skipped | — |
| M5 | API credit top-ups | ✅ DONE |
| M6 | Judge-model list (revise after w4/w25 proofs) | Later |
| M7 | Stripe products (Pro $19, Teams $49/seat) | Today — guided session |
| M8 | Windows EV cert | Monday |
| M9 | Apple Dev acct / Mac notarization | Monday |
| — | Peer reviewer email — agent drafts, Marko sends | Before papers |
| M10 | Launch date greenlight | After proofs |
| C1 | hive-mind OSS timing (ship-with or ship-before Waggle?) | When extraction done |
| C5 | Harvest-first onboarding (replace step 2 vs parallel opt-in?) | When ENG-5/UX-1 is hot |
| C8 | Warm list — 5-10 names pre-email T-72h | T-72h |
| C9 | Papers: single- or dual-author? | Before paper 1 |
| C11 | Marketplace model (free / freemium / enterprise) | Before launch |
| ES | EvolveSchema attribution — Mikhail vs ACE (Zhang et al.) | Before paper 2 |

---

## Phase A — Quick Wins (this session, ~5h)

One commit per item. Tests + tsc after each.

- **QW-1** Auto-open chat window after onboarding — extend `Desktop.handleOnboardingFinish` to spawn ChatApp window with `firstMessage` as initial prompt.
- **QW-2** Text labels on Memory app tabs — `apps/web/src/components/os/apps/MemoryApp.tsx` (6 tabs Timeline/Graph/Harvest/Weaver/Wiki/Evolution).
- **QW-3** Skip boot screen on return visits — **verify** existing `BOOT_KEY` LS check in `Index.tsx:16` works; fix if not.
- **QW-4** Back button in onboarding wizard steps 2-6 — add to `WhyWaggleStep`/`TierStep`/`ImportStep`/`TemplateStep`/`PersonaStep` via shared wizard shell.
- **QW-5** Rename dock tiers (Simple/Pro/Full → Essential/Standard/Everything) + clarify vs billing — `dock-tiers.ts`, `Dock.tsx`, `DockTray.tsx`, `SettingsApp.tsx`, `OnboardingWizard` TierStep.
- **CR-7** Update `CLAUDE.md` Section 10 open-work table — mark shipped items (tiers, personas split, feature-flags, Stripe pkg, evolution, etc.).

Gate to B: `npm run lint` + `npx tsc --noEmit` across packages green, Vitest green for touched files, zero new console.log.

## Phase B — Core bugs + light mode finish (~1d)

- **P35** Spawn-agent "no models available" — wire `SpawnAgentPanel` to live provider list (13 green providers)
- **P36** Dock spawn-agent icon — verify click opens panel, wire TaskCreate
- **P40** BootScreen + tokens — logo/animation render in light mode
- **P41** "Waggle AI" header text re-styled for light theme
- **CR-2** Residual hive-950 → semantic token sweep

## Phase C — OW-6 PersonaSwitcher two-tier (0.5d)

- UNIVERSAL MODES (8 core personas) vs WORKSPACE SPECIALISTS (template-scoped)
- Hover tooltip: tagline + bestFor + wontDo (requires `AgentPersona` interface extensions per CLAUDE.md §5)
- File: `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`

## Phase D — Feature polish (~10d)

- **3b.1–5** Compliance UX — pdfmake route, template system, full-page viewer, branding, KVARK template
- **3.1–6** Harvest UX — privacy headline ✅, dedup summary ✅, SSE progress, resumable, identity auto-populate, harvest-first tile
- **Wiki v2** — markdown export ✅, incremental recompile ✅, Obsidian adapter, Notion adapter, health dashboard UI
- **Medium UX UX-1..7** — onboarding decision reduction, Memory tab bar labels ✅ (from QW-2), dock text labels, dev-mode token display, chat header overflow, tier-step copy
- **Engagement ENG-1..7** — remember-toast, WorkspaceBriefing sidebar, unlock nudges, LoginBriefing, harvest-first, brain-health metric, suggested-next-actions
- **Responsive R-1..5** — dock overflow, status-bar narrow, chat sidebar narrow, onboarding grid, window default sizes

## Phase E — Infra polish (~6d)

- **CR-8** Tauri binary verification (clean Windows VM smoke test)
- **INST-1/2/3** Ollama bundled installer + HW scan + daemon auto-start
- **CR-6** hive-mind actual source extraction (scaffold done)
- **CR-1** MS Graph OAuth connector (email, calendar, files harvest)

## Phase F — Content polish (~1d)

- **CR-4** Demo video script (90s + 5min versions)
- **CR-5** LinkedIn launch posts (3-post sequence)
- Peer-reviewer outreach email (agent drafts; Marko sends)

---

## Critical path after polish

1. Marko stripes + buys cert + Apple Dev (Monday)
2. OpenAI export arrives
3. Phase 1 Harvest on real data (Google + Anthropic + OpenAI when ready; Cursor adapter build)
4. Phase 4 Memory Proof → Paper 1
5. Phase 5 GEPA proof in parallel
6. Phase 5b Combined → Paper 2
7. Launch prep finalize → Launch Day

---

## Rollback safety

- Git tag `checkpoint/pre-self-evolution-2026-04-14` exists
- Each phase commit-boundary = rollback point
- Quick Wins are all UI + copy changes: fully reversible via `git revert`
