# Universal Silent Capture Strategy — hive-mind + per-IDE shim portfolio

**Date**: 2026-04-25
**Author**: claude-opus-4-7 (PM Cowork)
**Status**: Strategy proposal pending Marko ratification
**Predecessor research**: `research/2026-04-22-hive-mind-positioning/` (00-SYNTHESIS through 04-competitive-landscape)
**Trigger**: Marko request to extend hive-mind scope beyond Claude Code to Codex + Cursor + OpenClaw + Hermes + others; "silent memory add-on da se prirodno organski implementira u app"

---

## §0 Executive thesis

**The 2026 AI agent IDE landscape has memory primitives in every major framework, but no unified silent layer that follows the user across IDEs.**

Hermes Agent (64k stars MIT) ships MEMORY.md auto-injection. OpenClaw v2026.4.7 has structured agent memory + ContextEngine pluggable hooks. Mem0 has explicit OpenClaw partnership. Codex CLI has opt-in per-thread memory + global consolidation. Cursor has SessionStart hook marketplace + ~40 MCP tool ceiling per session. OpenCode (sst/anomaly) has 25+ lifecycle hooks. Claude Code has the canonical hook spec.

**Each IDE built its own memory island. No portable cross-IDE substrate exists.** A user who works in Claude Code morning, Cursor afternoon, and Hermes for self-improvement experiments has three disconnected memory pools. Even Mem0 — the market leader — is cloud-bound and locked to whichever IDE installed its plugin.

hive-mind already has the substrate (single .mind SQLite file, bitemporal KG, I/P/B frames, 21 MCP tools, Apache-2.0 license). What it lacks is the **per-IDE silent capture shim portfolio** that translates each IDE's hook events into hive-mind frame writes. Building that portfolio claims the "memory infrastructure" position — not "memory tool inside one IDE."

**The wedge**: one .mind file follows you across IDEs. Local-first. Apache 2.0. No cloud dependency. No per-IDE re-setup. Native silent capture in every supported IDE.

---

## §1 6-target integration matrix (April 2026 state)

| Target | License | Hook surface | MCP support | Memory state today | Mindshare |
|---|---|---|---|---|---|
| **Claude Code** | proprietary CLI | SessionStart, SessionEnd, UserPromptSubmit, PreCompact, Stop, PreToolUse, PostToolUse | native (spec source) | file-based MEMORY.md + 3rd-party MCP servers | reference standard |
| **Cursor IDE** | proprietary | sessionStart hook + marketplace; CLI Jan 2026; hooks 10-20x faster | yes, ~40 active tools ceiling | 3rd-party MCP servers (Memory Bank, Memory MCP, Pieces) | mass adoption (millions of devs) |
| **OpenAI Codex CLI** | open core | hooks stable post-April 2026 inline u config.toml + requirements.toml; observe MCP + apply_patch + Bash | yes | opt-in per-thread + global consolidation; 256-4096 raw cap; MCP-thread excludable | OpenAI org backing |
| **OpenCode** (sst/anomaly) | open source (Go) | TypeScript/JS plugin system, **25+ lifecycle hooks** | local + remote | Letta-inspired persistent self-editable blocks (plugin) | terminal-first audience growing |
| **Hermes Agent** (Nous Research) | MIT | pre_llm_call, post_llm_call, on_session_start, on_session_end | yes (out of box) | MEMORY.md + USER.md auto-inject + persistent skill documents | **64,200+ GitHub stars**, MiniMax partnership, v0.10.0 (Apr 16 2026) |
| **OpenClaw** | open source | ContextEngine sa bootstrap/ingest/assemble/compact/afterTurn/prepareSubagentSpawn/onSubagentEnded | yes | structured agent memory + webhook automations + session-memory hook → ~/.openclaw/workspace/memory/ markdown | Mem0 partnership; v2026.4.7 |

**Tier 2 fallback (generic MCP-only, no native hooks):** Claude Desktop, Windsurf, Continue.dev, Zed AI mode, Cline, Aider, Bloop, Tabby, Codeium IDE plugins. Sve podržavaju MCP servers; nemaju per-IDE specific hooks. Za njih hive-mind se nudi kao standard MCP server koji korisnik registruje, sa CLAUDE.md-style instructions u svaki host system prompt.

---

## §2 Naming decision

**Preporuka: monorepo `hive-mind-clients` ILI brand pivot na `kvark-mind`.**

Marko je predložio "claude-hive-mind" za extended scope kopiju. Problem sa tim imenom:

- "claude-" prefix sužava narrative na Anthropic ekosistem; gubi Codex / Hermes / OpenClaw / Cursor coverage
- Branded asocijacija sa Claude može da odbije OpenAI / Nous / community devs
- Forking "hive-mind" u "claude-hive-mind" pravi divergent codebase — maintenance overhead
- "claude-hive-mind" suggests vendor-lock; suprotno od "model-agnostic" hive-mind narrative

**Tri opcije za naming/repo strukture:**

### Option A — Monorepo `hive-mind-clients` pod `marolinik/hive-mind-clients`
Single GitHub org, packages publishing pod `@hive-mind/<target>-hooks`:
- `@hive-mind/claude-code-hooks`
- `@hive-mind/cursor-hooks`
- `@hive-mind/codex-hooks`
- `@hive-mind/opencode-plugin`
- `@hive-mind/hermes-hooks`
- `@hive-mind/openclaw-context-engine`

Plus shared core utilities (`@hive-mind/shim-core` za frame encoding, workspace resolution, CLI bridge).

Pros: single source of truth, version aligned, one CI pipeline, npm namespace lock
Cons: large monorepo can intimidate first-time contributors

### Option B — Per-target standalone repos
Each shim je separate `marolinik/hive-mind-cursor-hooks` etc.
Pros: separable contribution, no monorepo complexity, each can have own README & tests
Cons: version drift risk, duplicate boilerplate, harder to do cross-cutting refactors

### Option C — Brand pivot to `kvark-mind` ili `mind-substrate`
Re-frame "hive-mind" sebi extends — "kvark-mind" je still-Egzakta-branded but neutral za multi-IDE position. "mind-substrate" je generic infra term.
Pros: cleaner long-term branding
Cons: brand dilution za existing hive-mind awareness; rename overhead

**Moja preporuka: Option A — `hive-mind-clients` monorepo.** Single place za doc, single PR pipeline, single release cadence. Devs install npm package per their IDE. Same brand (hive-mind) so SOTA narrative spillover applies. Marko-vova "claude-hive-mind" radna varijanta postaje `@hive-mind/claude-code-hooks` paket inside monorepo.

---

## §3 Repository structure (Option A)

```
hive-mind-clients/
├── packages/
│   ├── shim-core/                    # Shared utilities
│   │   ├── frame-encoder.ts          # I/P/B frame encoding spec
│   │   ├── workspace-resolver.ts     # CWD → workspace.mind file mapping
│   │   ├── cli-bridge.ts             # npx @hive-mind/cli wrapper
│   │   ├── types.ts                  # Shared types (HookEvent, Frame, Importance)
│   │   └── README.md
│   │
│   ├── claude-code-hooks/            # Anthropic Claude Code
│   │   ├── hooks/
│   │   │   ├── session-start.js     # Calls hive-mind switch_workspace + load top-20 frames
│   │   │   ├── user-prompt-submit.js # save_memory(temporary, prompt+meta)
│   │   │   ├── stop.js              # save_memory(important, summarized turn)
│   │   │   └── pre-compact.js        # compact_memory before context truncation
│   │   ├── install.ts                # patches ~/.claude/settings.json
│   │   └── README.md (one-line install: npx @hive-mind/claude-code-hooks install)
│   │
│   ├── cursor-hooks/                 # Cursor IDE
│   │   ├── marketplace-config/       # Cursor hook marketplace JSON
│   │   ├── session-start-hook.ts     # calls hive-mind workspace + frame inject
│   │   ├── stop-hook.ts              # post-response save_memory
│   │   ├── install.ts                # registers in Cursor settings
│   │   └── README.md
│   │
│   ├── codex-hooks/                  # OpenAI Codex CLI
│   │   ├── config-toml-template.toml # inline hook config snippet
│   │   ├── requirements-toml-template.toml # managed requirements
│   │   ├── session-hooks.ts          # observes MCP tools + apply_patch + Bash
│   │   ├── install.ts                # patches ~/.codex/config.toml
│   │   └── README.md
│   │
│   ├── opencode-plugin/              # OpenCode (sst/anomaly)
│   │   ├── plugin.ts                 # implements opencode plugin interface
│   │   ├── lifecycle-hooks.ts        # uses 25+ available lifecycle hooks
│   │   ├── install.ts                # adds to opencode.json
│   │   └── README.md
│   │
│   ├── hermes-hooks/                 # Nous Research Hermes Agent
│   │   ├── hooks/
│   │   │   ├── pre-llm-call.py      # capture context before model call
│   │   │   ├── post-llm-call.py     # capture response + skill emergence
│   │   │   ├── on-session-start.py  # workspace activation + MEMORY.md sync
│   │   │   └── on-session-end.py    # session GOP boundary close
│   │   ├── memory-md-bridge.py       # bridges Hermes MEMORY.md ↔ hive-mind frames
│   │   ├── install.py                # registers u Hermes config
│   │   └── README.md
│   │
│   └── openclaw-context-engine/      # OpenClaw ContextEngine plugin
│       ├── context-engine-plugin.ts  # implements OpenClaw ContextEngine API
│       ├── lifecycle-hooks.ts        # bootstrap, ingest, assemble, compact, afterTurn
│       ├── install.ts                # adds plugin to OpenClaw config
│       └── README.md
│
├── docs/
│   ├── architecture.md               # Layer 0 (hive-mind core) + Layer 1 (shims)
│   ├── per-IDE-setup-guide.md        # one section per shim
│   ├── frame-model-spec.md           # I/P/B frame encoding standard
│   └── migration-from-MEMORY.md      # for users coming from file-based MEMORY.md
│
├── examples/
│   ├── cross-IDE-workflow.md         # demonstrates user moving Claude Code → Cursor → Hermes
│   └── single-mind-file-setup.md     # one ~/.hive-mind/global.mind for all IDEs
│
├── .github/workflows/
│   ├── test.yml                      # all packages CI
│   └── publish.yml                   # npm + PyPI release
│
├── lerna.json (or pnpm workspace)
├── package.json
├── LICENSE                           # Apache 2.0
└── README.md                         # cross-IDE narrative + install matrix
```

---

## §4 MVP scope — first 3 shims (mindshare-prioritized)

**MVP (Phase 1, 2-3 week build):**

1. **`@hive-mind/claude-code-hooks`** — Marko-vov primary daily driver; the 80% ready path per `03-claude-code-integration.md`. Three hook scripts (SessionStart, UserPromptSubmit, Stop). One-line install command (`npx @hive-mind/claude-code-hooks install`). Patches `~/.claude/settings.json` automatically.

2. **`@hive-mind/cursor-hooks`** — biggest mindshare delta; millions of Cursor devs. SessionStart hook in marketplace + post-response save via Stop pattern. One-line install via Cursor CLI command (Jan 8 2026 release added CLI MCP management).

3. **`@hive-mind/hermes-hooks`** — fastest growing OSS framework (64k stars in 2 months); MIT license; MEMORY.md auto-inject already in framework, hive-mind elegantly bridges za bitemporal graph + I/P/B + cross-IDE persistence beyond Hermes-internal MEMORY.md.

**Phase 2 (week 4-6):**

4. **`@hive-mind/codex-hooks`** — OpenAI ekosistem reach; opt-in nature aligns sa hive-mind privacy posture
5. **`@hive-mind/opencode-plugin`** — terminal-first dev audience; 25+ lifecycle hooks give richest integration
6. **`@hive-mind/openclaw-context-engine`** — directly competes sa Mem0 partnership; demonstrates OSS alternative

**Phase 3 (week 7-12):**

Generic MCP-only fallback packages za Claude Desktop, Windsurf, Continue, Zed AI, Cline, Aider, etc. — these don't have native hooks, so shim is just MCP registration helper + CLAUDE.md-style instruction template.

---

## §5 Per-shim contract — what each shim does

Each shim implements 4 hook event types (mapped to whatever target IDE provides):

### 5.1 Session start hook
- Detects current working directory (CWD)
- Calls hive-mind CLI: `switch_workspace(path=CWD)` 
- Optional: fetches top-20 most relevant frames + injects them as context briefing
- Time: <100ms

### 5.2 User prompt submit hook
- Receives user message text + metadata (project, session, model)
- Calls hive-mind CLI: `save_memory(content=text, importance=temporary, scope=session-id)`
- Temporary frames decay unless promoted via importance escalation
- Time: <50ms (async write OK)

### 5.3 Post-response / Stop hook
- Receives full assistant response + tool calls
- Summarizes turn (first paragraph + key facts) 
- Calls hive-mind CLI: `save_memory(content=summary, importance=important, scope=session-id, links=[user-prompt-id])`
- Optional: extract entities + write I-frames for new facts
- Time: <500ms (can run async)

### 5.4 Session end / pre-compact hook
- Marks GOP boundary u sessions table
- Triggers `compact_memory` to merge superseded P/B frames
- Optional: nightly `cognify` pass scheduled instead of inline
- Time: variable (maintenance, not on critical path)

---

## §6 Single .mind file philosophy

Default: `~/.hive-mind/global.mind` — single SQLite file for all IDEs, all projects, all sessions. Workspace partition column distinguishes contexts. Cross-IDE visibility free.

Advanced: per-project SQLite + scheduled cross-workspace cognify that promotes `critical` frames to global layer.

User narrative: **"Your AI's memory follows you everywhere. One file. Your disk. No cloud."**

---

## §7 Strategic launch coupling — hive-mind + Waggle + shims

**Question Marko raised**: "ako isporučimo SOTA za memoriju i na waggle native naše memorije druge planirane benchmark-ove sa visokim rezultatima onda pošto launchujemo zajedno open source hive-mind i waggle u istom momentu, kako ce se opensource koristiti..."

**My read**: The right launch posture depends on benchmark outcome. Three scenarios:

### Scenario PASS (LoCoMo ≥ 91.6, Fisher p < 0.10)

**Coupled launch — hive-mind core + 3 MVP shims + Waggle simultaneously.**
- Day 0: GitHub repos public (hive-mind + hive-mind-clients monorepo + Waggle landing live)
- Day 0 narrative: "Beat Mem0 SOTA on LoCoMo. Now your local-first memory works in 6 IDEs."
- Day 0 distribution: blog + Twitter + LinkedIn + HN + r/LocalLLaMA + r/MachineLearning
- Phase 2 shims (Codex/OpenCode/OpenClaw) ship 2-4 weeks later as "expansion pack"

The shims are the **adoption multiplier** for the SOTA claim. Without shims, "hive-mind hit SOTA" gets a single-day cycle. With shims, "hive-mind in your IDE today" is a renewable distribution moment per shim release.

### Scenario PARTIAL (LoCoMo 85-91, SOTA_IN_LOCAL_FIRST)

**Decoupled launch — hive-mind + shims first, Waggle 2-4 weeks later.**
- Day 0: hive-mind core + 3 MVP shims public; "Apache 2.0 local-first memory infra in your IDE"
- The shims become the primary distribution; benchmark is supporting evidence not headline
- Waggle launches as "the fully featured cousin" once developer adoption signals
- Pricing: aggressive Free tier on Waggle to capture devs already using hive-mind shims

### Scenario FAIL (LoCoMo < 85)

**Reframe — hive-mind shims become the lead.**
- Don't lead sa benchmark numbers; lead sa developer ergonomics
- "One memory file, every AI IDE you use, fully local, Apache 2.0"
- Waggle launch decoupled by 4-8 weeks; revisit benchmark methodology
- Pricing pivot: Waggle Pro/Teams primarily for enterprise with audit/compliance value, not SOTA-driven dev tools narrative

---

## §8 Commercial model preserved

- **OSS (Apache 2.0)**: hive-mind core + all 6 shim packages
- **Paid (Waggle tiers)**: Free / Pro $19 / Teams $49 — adds GEPA self-evolution, vault, BPMN orchestration, multi-agent skills marketplace, compliance audit reports
- **Enterprise (KVARK)**: on-prem sovereign deployment, LM TEK H200 hardware bundle, BPMN orchestration custom

Shims as OSS protect the wedge against Mem0/Cognee/Hermes building competing local-first portfolio. Devs use shims free → some upgrade to Waggle for premium agent features → enterprises buy KVARK.

---

## §9 SWOT — extended scope

### Strengths (delta vs original hive-mind alone)
- Cross-IDE positioning is uncontested — Hermes has its own MEMORY.md, OpenClaw uses Mem0, Cursor uses 3rd-party MCP, but no one has portable cross-IDE substrate
- Apache 2.0 vs AGPL (Basic Memory) vs proprietary (Cursor/Claude Memory) — most permissive in space
- I/P/B frame model is differentiator vs all 6 targets' simpler memory models

### Weaknesses (new, introduced by extended scope)
- Maintenance overhead grows linearly with shim count (6 packages, 4 hook events each = 24 integration surfaces)
- IDE updates can break shim compatibility (Cursor hook API changes, Claude Code hook event renames, etc.)
- Documentation burden (per-IDE setup guides, troubleshooting, version matrix)

### Opportunities (delta)
- Hermes 64k-star community is ripe for OSS contribution; "official hive-mind shim for Hermes" can land u Nous Research Discord with high engagement
- Cursor marketplace acceptance brings hive-mind to millions of devs in one listing
- OpenClaw + Mem0 partnership creates positioning opportunity for "local-first alternative" narrative

### Threats (delta)
- Each target IDE may ship its own first-party local memory at any time, deprecating need for shim
- IDE A/B/C may collude on memory standard (e.g., shared MCP memory server spec) that bypasses hive-mind
- Mem0 / Cognee / Hermes-MEMORY.md may achieve "good enough" first-party + lock devs in

### Mitigations
- Open-spec the I/P/B frame format publicly so even competing memory systems can adopt; we keep substrate quality moat
- Aggressive contributor onboarding (CONTRIBUTING.md, "good first issue" labels, monthly community call)
- Lock in Hermes partnership before someone else does (offer to co-author "Hermes + hive-mind: memory at scale" blog post sa Nous Research)

---

## §10 Sequencing recommendation

1. **Now (today + tomorrow)**: write this brief, ratify naming, create `hive-mind-clients` monorepo skeleton on GitHub (private until Stage 3 verdict)
2. **Week 1 (post Stage 3 verdict)**: ship MVP three shims (Claude Code + Cursor + Hermes) — minimum viable
3. **Week 2-3**: launch coupling — Waggle landing live + hive-mind public + 3 shims published; narrative per scenario PASS/PARTIAL/FAIL
4. **Week 4-6**: Phase 2 shims (Codex + OpenCode + OpenClaw)
5. **Week 7-12**: Phase 3 generic fallbacks + community contribution flywheel
6. **Month 4+**: KVARK enterprise pilots informed by adoption signal

---

## §11 Open questions for Marko

1. **Naming**: Option A `hive-mind-clients` monorepo, Option B per-target repos, ili Option C brand pivot? Default predlog: A.
2. **MVP shim count**: 3 (Claude Code + Cursor + Hermes) ili 4 (add OpenClaw odmah radi Mem0 partnership counter-positioning)?
3. **Repo home**: `marolinik/hive-mind-clients` ili Egzakta organization? Implications za perception (personal vs company-backed).
4. **Hermes partnership**: aktivno reach out Nous Research za co-launch ili silent ship i čekati discovery?
5. **Cursor marketplace listing**: priority? Listing review can take weeks; submit in parallel with public release ili sequential?
6. **OpenClaw + Mem0 counter**: aggressive marketing kontekst ("local-first alternative to Mem0") ili neutralan stav?

---

## §12 Authorized for next-step

PM may proceed to author MVP shim sketches (architecture only, no code) za 3 MVP targets pending Marko ratification of:
- naming (Option A default)
- MVP shim count (3 default)
- Repo home (`marolinik/hive-mind-clients` default)

Other questions can wait for Stage 3 verdict (informs launch sequencing more than architecture).

---

## §13 Sources

- `research/2026-04-22-hive-mind-positioning/00-SYNTHESIS.md` (foundation)
- `research/2026-04-22-hive-mind-positioning/03-claude-code-integration.md` (Claude Code 80% ready analysis)
- `research/2026-04-22-hive-mind-positioning/04-competitive-landscape.md` (market positioning)
- WebSearch April 2026 results za Cursor / Codex / OpenCode / Hermes / OpenClaw current state
