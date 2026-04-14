# CLAUDE.md — Waggle OS
### Authoritative Operating Contract · All Agents · All Contributors · All Sessions

> Read this file in full before touching a single line of code. It is the single source of truth
> for architecture, strategic intent, and mechanical operating rules.
> If this file conflicts with any other document, this file wins.

---

## 1. What Waggle OS Actually Is

**Waggle OS** is a workspace-native AI agent platform with persistent memory. It ships as a
Tauri 2.0 desktop binary for Windows and macOS with a React frontend and a Node.js sidecar.

**Strategic function:** Waggle is the demand-creation and qualification engine for KVARK —
Egzakta Group's sovereign enterprise AI platform.

```
Solo (Free) → teaches individuals what AI-native work feels like
Basic ($15/mo) → removes all individual limits, unlocks agents and customization
Teams ($79/mo) → institutional dependency, shared context, governance, KVARK funnel active
Enterprise → KVARK consultative sale (www.kvark.ai)
```

---

## 2. Verified Repository Structure

```
waggle-os/
├── app/                          # Tauri desktop app (React frontend + Tauri shell)
│   ├── src/
│   │   ├── components/
│   │   │   ├── cockpit/          # CostDashboardCard, MemoryStatsCard, etc.
│   │   │   ├── onboarding/
│   │   │   │   └── OnboardingWizard.tsx   # 7-step wizard (780 LOC)
│   │   │   ├── PersonaSwitcher.tsx        # Flat 2-col grid + custom persona form
│   │   │   └── ui/               # shadcn components
│   │   ├── hooks/
│   │   │   └── useOnboarding.ts  # localStorage-based onboarding state
│   │   ├── views/                # ChatView, CockpitView, MemoryView, etc.
│   │   └── styles/
│   │       ├── globals.css
│   │       └── waggle-theme.css  # Hive DS tokens
│   └── src-tauri/                # Tauri Rust shell
├── apps/
│   ├── web/                      # Web app (separate from Tauri app)
│   └── www/                      # Landing page (waggle-os.ai)
├── packages/
│   ├── agent/src/                # ← MOST ACTIVE PACKAGE
│   │   ├── personas.ts           # 13 personas — AgentPersona interface
│   │   ├── behavioral-spec.ts    # BEHAVIORAL_SPEC v2.0 — single rules string
│   │   ├── orchestrator.ts       # buildSystemPrompt(), recallMemory(), etc.
│   │   ├── tool-filter.ts        # filterToolsForContext() — allowlist/denylist
│   │   ├── injection-scanner.ts  # scanForInjection() — 3 pattern sets ✅
│   │   ├── cost-tracker.ts       # CostTracker class, DEFAULT_MODEL_PRICING ✅
│   │   ├── skill-frontmatter.ts  # parseSkillFrontmatter() ✅
│   │   ├── kvark-tools.ts        # kvark_search, kvark_ask_document ✅
│   │   ├── subagent-orchestrator.ts
│   │   ├── workflow-composer.ts
│   │   └── custom-personas.ts    # loadCustomPersonas() from disk
│   ├── core/                     # FrameStore, HybridSearch, KnowledgeGraph,
│   │                             # IdentityLayer, AwarenessLayer, SessionStore
│   ├── server/                   # Fastify API server + KVARK client
│   ├── shared/src/               # @waggle/shared — types, schemas, constants
│   │   ├── types.ts              # User, Team, AgentDef, Task, WaggleMessage...
│   │   └── constants.ts          # Team roles, job statuses, etc.
│   ├── sdk/
│   ├── waggle-dance/             # WaggleDance multi-agent package
│   └── ui/
├── sidecar/                      # Node.js sidecar (bundled into Tauri)
│   └── src/
├── scripts/
│   ├── build-sidecar.mjs
│   ├── bundle-native-deps.mjs
│   └── bundle-node.mjs
└── docs/
    └── ARCHITECTURE.md
```

### Build Command
```bash
npm run build:packages    # builds shared → core → agent → server in order
npm run build             # Vite build (apps/web)
```

### Key Technology Facts (Verified)
- Frontend: React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- Desktop: Tauri 2.0 (Rust shell)
- Backend: Fastify sidecar (Node.js, bundled)
- Database: SQLite via @waggle/core (better-sqlite3 + sqlite-vec)
- Memory: FrameStore + HybridSearch + KnowledgeGraph + IdentityLayer + AwarenessLayer
- Agent runtime: packages/agent/src/agent-loop.ts
- Auth: Clerk (JWT-based)
- Design: Hive DS — honey #e5a000 · hive-950 #08090c · accent #a78bfa (waggle-theme.css)

---

## 3. Persona Architecture — Current State + Target

### Current (13 personas in personas.ts)
researcher, writer, analyst, coder, project-manager, executive-assistant,
sales-rep, marketer, product-manager-senior, hr-manager, legal-professional,
finance-owner, consultant

### Target (17 personas — add 4)
All 13 above PLUS:
- **general-purpose** — versatile default, full tool access
- **planner** — read-only strategic planning, no file writes
- **verifier** — adversarial QA, read-only, VERDICT output format
- **coordinator** — pure orchestrator, 3 tools only (spawn/list/get_agent_result)

### AgentPersona Interface — Current
```typescript
interface AgentPersona {
  id, name, description, icon, systemPrompt, modelPreference,
  tools, workspaceAffinity, suggestedCommands, defaultWorkflow
}
```

### AgentPersona Interface — Target (add these fields)
```typescript
disallowedTools?: string[]       // denylist — enforced at pool level
failurePatterns?: string[]       // documented failure modes (min 3 per persona)
isReadOnly?: boolean             // true = no write tools ever
tagline?: string                 // one sentence shown in picker hover
bestFor?: string[]               // 3 example tasks (user-facing)
wontDo?: string                  // hard boundary statement
```

---

## 4. Behavioral Spec — Current State + Target

### Current
BEHAVIORAL_SPEC.rules is a single 273-line string covering:
coreLoop → qualityRules → behavioralRules → workPatterns → tools → intelligenceDefaults

Memory conflict protocol exists in Step 5 but is buried in paragraph text.
No section caching. No compaction prompt. No feature flags.

### Target
Split into named sections (same content, structural split only):
```typescript
BEHAVIORAL_SPEC = {
  version: '3.0',
  coreLoop: `...`,           // Step 1-5 thinking loop
  qualityRules: `...`,       // Anti-hallucination, structured output, context grounding
  behavioralRules: `...`,    // Memory-first, tool intelligence, narration, error recovery
  workPatterns: `...`,       // Drafting, decision compression, research
  intelligenceDefaults: `...`,// Skill check, workflow routing, delegation
}
```

Memory conflict protocol elevated to === CRITICAL === block in coreLoop Step 5.
COMPACTION_PROMPT added as separate export.

---

## 5. Onboarding — Current State + Target

### Current (OnboardingWizard.tsx)
7 steps: Welcome(0) → WhyWaggle(1) → MemoryImport(2) → Template(3) → Persona(4) → APIKey(5) → HiveReady(6)

Step 3 has TEMPLATES array (7 templates): sales-pipeline, research-project,
code-review, marketing-campaign, product-launch, legal-review, agency-consulting

Step 4 has PERSONAS array (8 simplified entries) with TEMPLATE_PERSONA mapping.
These are NOT connected to packages/agent/src/personas.ts.

### Target
Expand TEMPLATES to 15 (matching the Template and Persona Architecture document).
Connect PERSONAS in onboarding to the real 17-persona system from personas.ts.
TEMPLATE_PERSONA map updated to cover all 15 → 17 combinations.

---

## 6. PersonaSwitcher — Current State + Target

### Current
Dialog with flat 2-column grid. Shows all personas identically. No two-tier layout.
Has "Create Custom Persona" inline form that POSTs to /api/personas.

### Target
Two-tier layout:
- Section 1: "UNIVERSAL MODES" — 8 universal personas (GP through Coder)
- Section 2: "YOUR WORKSPACE SPECIALISTS" — domain personas for current template
- Hover tooltip: tagline + bestFor[0..1] + wontDo
- Link: "See all →" expands full list

---

## 7. Agent Directives — Mechanical Overrides

### 7.1 Pre-Work
**STEP 0:** Before any structural refactor on a file >300 LOC:
1. Remove dead props, unused exports, unused imports, console.log
2. Commit separately: chore(scope): dead code removal — [filename]

**PHASED EXECUTION:** Max 5 files per phase. Complete → verify → await approval → next phase.

### 7.2 Code Quality
**SENIOR DEV OVERRIDE:** If architecture is flawed, state is duplicated, or patterns are
inconsistent — state it and fix it. Standard: "What would a senior engineer reject in review?"

**FORCED VERIFICATION — task is not complete until:**
```bash
npx tsc --noEmit --project packages/agent/tsconfig.json   # zero errors
npx tsc --noEmit --project app/tsconfig.json              # zero errors
npm run test -- --run                                      # all pass
```

### 7.3 Context Management
- **Context decay:** After 10+ messages, re-read any file before editing. Do not trust memory.
- **File read budget:** Files >500 LOC require chunked reads (offset/length). Never assume complete view.
- **Truncation:** Tool results >50k chars silently truncated. If results seem sparse, re-run narrower.

### 7.4 Edit Safety
- **Integrity:** Re-read before edit. Re-read after edit. Max 3 edits per file before verification read.
- **Exhaustive grep on rename:** Direct refs, type-level, string literals, dynamic imports,
  re-exports/barrel entries, test files. One grep is never enough.

### 7.5 Output Discipline

- **Chat reply budget.** Long specs, handoffs, audit reports, and multi-phase plans MUST be written to files (memory/, docs/, or via `/handoff`), not rendered inline. The chat is a pointer; the file is the deliverable.
- **Chunk long work.** Multi-phase roadmaps and >1k-line specs: implement in phases, commit per phase, give a 3-line status, then stop and await the next instruction. Do not stream an exhaustive summary that blows the output budget.

### 7.6 Handoff Discipline

- **Use the skill.** End-of-session handoffs invoke `~/.claude/skills/handoff/`, which enforces verification (`git status`, tests N/M, `npx tsc --noEmit` on touched packages) BEFORE writing the doc. Do not hand-write handoffs that skip the gate.
- **Canonical location.** `C:/Users/MarkoMarkovic/.claude/projects/D--Projects-waggle-os/memory/project_session_handoff_<MMDD>_s<N>.md`, with MEMORY.md "START HERE" pointer updated. That is the single source of truth for what shipped / what's left / how to roll back.
- **Never hide failures.** Failing tests, unverified MCP reconnects, wrong build dir — surface under "What's still open" in the handoff. Clean-looking handoffs that hide rot cost the next session hours.

---

## 8. Security Constraints

1. **Vault-only secrets.** API keys in Vault or .env (never committed). .env.example has key names only.
2. **Injection defense.** injection-scanner.ts exists — use scanForInjection() on all connector content.
3. **No eval, no dynamic require.** Tauri WebView is restricted.
4. **Tauri IPC allowlist.** Explicit in src-tauri/tauri.conf.json. Never allowlist: all: true.
5. **Parameterized queries.** No string interpolation in SQL. Ever.
6. **KVARK contact data.** Submits to your API only — no third-party form services.

---

## 9. KVARK Integration

Canonical copy:
"Everything Waggle does — on your infrastructure, connected to all your internal systems.
Full data pipeline injection, your permissions, complete audit trail, governance.
Your data never leaves your perimeter."

URLs (hardcoded only in kvark-tools.ts and KvarkNudge component):
- KVARK product site: https://www.kvark.ai
- License server: https://license.waggle-os.ai/validate
- SaaS cloud: https://cloud.waggle-os.ai

kvark-tools.ts already exists — kvark_search and kvark_ask_document tools,
gated to Business/Enterprise tiers. Do not recreate.

---

## 10. Already Built — Do Not Recreate

These files exist and are functional. Work with them, not around them:

| File | What it does |
|---|---|
| packages/agent/src/injection-scanner.ts | 3 pattern sets, scanForInjection() |
| packages/agent/src/cost-tracker.ts | CostTracker class, model pricing table |
| packages/agent/src/tool-filter.ts | filterToolsForContext(), offline filter |
| packages/agent/src/skill-frontmatter.ts | parseSkillFrontmatter(), ParsedSkill |
| packages/agent/src/kvark-tools.ts | kvark_search, kvark_ask_document |
| app/src/components/cockpit/CostDashboardCard.tsx | Cost display in Cockpit |
| app/src/components/cockpit/AuditTrailCard.tsx | Audit log display |

---

## 11. Sprint Status

### M2 — Stripe + Tiers
Stripe integration is the active blocker. No tier system in @waggle/shared yet.
packages/shared/src/constants.ts has team/task constants but no billing tier definitions.

### Immediate Work Queue (verified against actual repo)
| # | File | What | Prompt # |
|---|---|---|---|
| 1 | CLAUDE.md at root | Drop this file (UTF-8, not .txt) | Done |
| 2 | packages/agent/src/personas.ts | Add 4 personas + harden 13 | P-A |
| 3 | packages/agent/src/behavioral-spec.ts | Split + CRITICAL block + compaction | P-B |
| 4 | packages/agent/src/orchestrator.ts | Section caching in buildSystemPrompt() | P-C |
| 5 | packages/agent/src/feature-flags.ts | Create new | P-D |
| 6 | app/src/components/onboarding/OnboardingWizard.tsx | Expand to 15 templates + connect personas | P-E |
| 7 | app/src/components/PersonaSwitcher.tsx | Two-tier redesign | P-F |

---

## 12. Glossary

| Term | Definition |
|---|---|
| Hive DS | Waggle design system — honey/hive-950/accent tokens in waggle-theme.css |
| FrameStore | SQLite-backed memory frame storage in @waggle/core |
| HybridSearch | Vector + keyword search in @waggle/core |
| KnowledgeGraph | Entity-relation graph in @waggle/core |
| IdentityLayer | Personal identity persistence in @waggle/core |
| AwarenessLayer | Active task/state tracking in @waggle/core |
| CognifyPipeline | Memory extraction pipeline in orchestrator |
| BEHAVIORAL_SPEC | Core agent rules in packages/agent/src/behavioral-spec.ts |
| Sidecar | Node.js Fastify server bundled and launched by Tauri |
| KVARK | Egzakta sovereign enterprise AI — top of the Waggle funnel |
| assembleToolPool | To be implemented — per-persona tool filtering from allowlist + denylist |

---

Maintained by Marko Markovic · Egzakta Group · April 2026
waggle-os.ai · www.kvark.ai
