# MVP Shim Package Layouts — 3 Targets, Architecture Only

**Date**: 2026-04-25
**Author**: claude-opus-4-7 (PM Cowork)
**Status**: Architecture sketches ready for CC-1 implementation when Marko ratifies Universal Silent Capture strategy
**Companion**: `briefs/2026-04-25-universal-silent-capture-strategy.md`
**Scope**: 3 MVP shim packages — `@hive-mind/claude-code-hooks`, `@hive-mind/cursor-hooks`, `@hive-mind/hermes-hooks`

This brief is **architecture-only**, not implementation. CC-1 receives this when Marko ratifies repo creation. No code writing without ratification.

---

## §0 Common foundation — `@hive-mind/shim-core`

Zero-th package u monorepo: shared utilities used by all 3 MVP shims (and Phase 2 + 3 shims later).

### Folder structure

```
packages/shim-core/
├── src/
│   ├── frame-encoder.ts          # I/P/B frame encoding helpers
│   ├── workspace-resolver.ts     # CWD → workspace.mind file mapping
│   ├── cli-bridge.ts             # npx @hive-mind/cli wrapper sa typed I/O
│   ├── hook-event-types.ts       # canonical hook event interface
│   ├── importance-classifier.ts  # rules za temporary/important/critical importance
│   ├── prompt-summarizer.ts      # turn → summary text reducer (no LLM call)
│   ├── retry-bridge.ts           # CLI bridge sa retry + timeout handling
│   ├── logger.ts                 # shared structured logger
│   └── index.ts                  # barrel export
├── tests/
│   ├── frame-encoder.test.ts
│   ├── workspace-resolver.test.ts
│   └── cli-bridge.test.ts
├── package.json                  # @hive-mind/shim-core
├── tsconfig.json
└── README.md                     # consumer guide
```

### Public API surface

```ts
// frame-encoder.ts
export interface HookFrame {
  content: string;
  importance: 'temporary' | 'important' | 'critical';
  scope: string;          // session-id or workspace
  source: 'claude-code' | 'cursor' | 'hermes' | 'codex' | 'opencode' | 'openclaw';
  parent?: string;        // link to user-prompt frame
  metadata: {
    project?: string;
    cwd: string;
    timestamp_iso: string;
    target_version?: string;
  };
}
export function encodeFrame(input: HookEvent): HookFrame;

// workspace-resolver.ts
export interface Workspace {
  path: string;            // absolute path to .mind file
  cwd: string;             // origin CWD that resolved here
  mode: 'global' | 'per-project';
}
export function resolveWorkspace(cwd?: string): Promise<Workspace>;

// cli-bridge.ts
export interface CliBridge {
  saveMemory(frame: HookFrame): Promise<{ id: string; success: boolean }>;
  recallMemory(query: string, opts?: { limit?: number }): Promise<HookFrame[]>;
  switchWorkspace(path: string): Promise<{ active: string }>;
  compactMemory(scope?: string): Promise<{ merged: number }>;
}
export function createCliBridge(opts?: { cli_path?: string; timeout_ms?: number }): CliBridge;
```

### Dependency footprint

- `node:fs/promises`, `node:path`, `node:child_process` — no external runtime deps for core
- DevDeps: vitest, typescript, @types/node
- Target: Node 20+ (LTS)

---

## §1 `@hive-mind/claude-code-hooks` — Anthropic Claude Code

### Pre-existing context (per research §03)

Marko-vov primary daily driver. Claude Code već fires hooks u session-start.js + session-end.js + gsd-context-monitor.js + gsd-phase-boundary.sh + output-discipline.js. Niti jedan ne talks to hive-mind.

Memory file at `~/.claude/projects/<slug>/memory/MEMORY.md` is parallel system. Strategy: shim handles **episodic** layer (actual conversation content u hive-mind frames), MEMORY.md ostaje **semantic** layer (distilled rules + user profile).

Per `research/2026-04-22-hive-mind-positioning/00-SYNTHESIS.md` §5: "do NOT run silent hive-mind on top of the existing file-based MEMORY.md system without a split."

### Folder structure

```
packages/claude-code-hooks/
├── src/
│   ├── hooks/
│   │   ├── session-start.ts      # SessionStart event handler
│   │   ├── user-prompt-submit.ts # UserPromptSubmit event handler
│   │   ├── stop.ts               # Stop event handler (post-response)
│   │   └── pre-compact.ts        # PreCompact event handler
│   ├── install.ts                # patches ~/.claude/settings.json
│   ├── uninstall.ts              # reverses install
│   ├── verify.ts                 # post-install smoke test
│   └── index.ts                  # public exports
├── bin/
│   └── claude-code-hooks         # CLI entry: install/uninstall/verify
├── tests/
│   ├── session-start.test.ts
│   ├── stop.test.ts
│   └── install-flow.test.ts
├── package.json                  # @hive-mind/claude-code-hooks
└── README.md                     # one-line install + troubleshooting
```

### Hook event → hive-mind action mapping

| Claude Code event | shim action | hive-mind CLI call | importance |
|---|---|---|---|
| `SessionStart` | resolve CWD workspace, fetch top-20 frames, inject as briefing | `switch_workspace` + `recall_memory --limit 20` | n/a (read) |
| `UserPromptSubmit` | encode user message as temporary frame | `save_memory --importance temporary --scope <session-id>` | temporary (decays unless promoted) |
| `Stop` | summarize turn, save as important frame, link to user-prompt | `save_memory --importance important --scope <session-id> --parent <prompt-id>` | important |
| `PreCompact` | trigger memory compaction before context truncation | `compact_memory --scope <session-id>` | n/a (maintenance) |

### Install command UX

```bash
$ npx @hive-mind/claude-code-hooks install
✔ Detected Claude Code config at ~/.claude/settings.json
✔ Detected hive-mind CLI v0.x.x available via npx
✔ Patched 4 hook entries (session-start, user-prompt-submit, stop, pre-compact)
✔ Created backup at ~/.claude/settings.json.bak.2026-04-26T10-30-00Z
✔ Verified hive-mind ↔ Claude Code communication (test save + recall round-trip 87ms)

Done. New Claude Code sessions will silently capture to hive-mind.
Workspace: ~/.hive-mind/global.mind (default)
Run "claude-code-hooks status" to inspect.
Run "claude-code-hooks uninstall" to revert.
```

### MEMORY.md split strategy (per research §5 recommendation)

- **MEMORY.md** stays — file-based, distilled semantic facts (rules, preferences, user profile). Marko continues authoring entries manually as needed.
- **hive-mind frames** — episodic, automatic capture of conversation content. Searchable via MCP tools `recall_memory`, `search_entities`.

Bridge mechanism (optional for v1.1, not v1.0): periodic cron job extracts high-importance frames from hive-mind, distills into MEMORY.md candidates, prompts Marko-side review before write.

### Acceptance criteria

- One-line install completes in <30s
- Backup of settings.json created before any modification
- Uninstall fully reverses install (settings.json restored from backup)
- Round-trip save+recall test in install verifies hive-mind responsive
- All 4 hooks fire on real Claude Code session without errors
- No interference with existing hooks (session-start.js, gsd-context-monitor.js, etc. continue to run)

### Risks

- Claude Code hook spec changes — shim must version-pin against tested Claude Code versions, refuse install on unknown version unless `--force` flag
- MEMORY.md double-writes — install MUST NOT auto-replace existing MEMORY.md briefing logic; coexistence enforced
- npx `@hive-mind/cli` not installed — install detects + offers to `npm install -g @hive-mind/cli` first

---

## §2 `@hive-mind/cursor-hooks` — Cursor IDE

### Pre-existing context (per WebSearch April 2026)

Cursor 3.1.15 ima sessionStart hook + marketplace listing. Hooks 10-20x faster post Jan 2026. CLI release Jan 8 2026 added MCP management commands. ~40 active tools ceiling per session combined across all MCP servers.

Memory MCP servers postoje u Cursor marketplace (Memory Bank MCP Server, Memory MCP, Pieces). Native silent capture doesn't exist yet — Cursor support za auto-capture limited to chat history.

### Folder structure

```
packages/cursor-hooks/
├── src/
│   ├── hooks/
│   │   ├── session-start.ts      # Cursor sessionStart event
│   │   └── stop.ts               # Cursor post-response (if event exists in 2026 spec)
│   ├── marketplace/
│   │   ├── manifest.json         # Cursor hook marketplace listing manifest
│   │   ├── icon.svg              # 512x512 listing icon
│   │   └── screenshots/          # marketplace screenshots
│   ├── install.ts                # CLI-based install via cursor CLI
│   ├── uninstall.ts
│   ├── verify.ts
│   └── index.ts
├── bin/
│   └── cursor-hooks
├── tests/
│   ├── session-start.test.ts
│   └── install-flow.test.ts
├── package.json                  # @hive-mind/cursor-hooks
└── README.md
```

### Hook event → hive-mind action mapping

| Cursor event | shim action | hive-mind CLI call | importance |
|---|---|---|---|
| `sessionStart` | resolve workspace, optional inject top-N frames into Cursor agent context | `switch_workspace` + `recall_memory --limit 10` | n/a (read) |
| post-response (if Stop equivalent in 2026 spec) | summarize + save | `save_memory --importance important` | important |

**Note on event surface**: Cursor's hook surface u April 2026 is narrower than Claude Code's. SessionStart is confirmed; UserPromptSubmit + Stop equivalents may require workaround via Cursor's CLI watch mode or MCP tool wrapping.

### Install command UX

```bash
$ npx @hive-mind/cursor-hooks install
✔ Detected Cursor 3.1.x at /Applications/Cursor.app
✔ Detected Cursor CLI installed (v0.x)
✔ Verified ~40-tool MCP ceiling — current Cursor MCP usage: 12 tools used → 28 available
✔ Registered hive-mind hook in Cursor settings (sessionStart)
✔ Marketplace listing: optional. Run "cursor-hooks publish" to submit if you maintain a fork.

Done. New Cursor sessions will silently capture to hive-mind.
```

### Marketplace listing strategy

`cursor-hooks publish` (optional command for fork maintainers) packages the listing manifest + icon + screenshots and submits to Cursor's hook marketplace. Marko-vova decision (per Universal Silent Capture brief §11 question 5): submit official listing as part of MVP launch ili sequential post-public-release.

### Acceptance criteria

- Install detects Cursor version + warns on unknown
- 40-tool ceiling check before install — refuses install if would exceed without `--force`
- Marketplace listing manifest valid per Cursor 2026 schema
- Round-trip test sa hive-mind backend

### Risks

- ~40-tool ceiling silent failure mode (per WebSearch Cursor 2026 docs) — install MUST verify pre-install
- Cursor proprietary spec breakage — shim version-pinned, install refuses on incompatible Cursor
- Marketplace review timeline (typically 1-3 weeks) — official listing not on critical path for MVP launch; can ship npm-only first

---

## §3 `@hive-mind/hermes-hooks` — Nous Research Hermes Agent

### Pre-existing context (per WebSearch April 2026)

64,200+ GitHub stars, MIT license. v0.10.0 released April 16, 2026. MCP out of the box. Hooks: `pre_llm_call`, `post_llm_call`, `on_session_start`, `on_session_end`. **Auto-injects MEMORY.md + USER.md u system prompt at session start.** Self-improving loop sa skill documents stored u persistent memory.

MiniMax partnership announcement (per Hermes April 2026 article — same MiniMax as our judge). Strategically meaningful; Nous Research koalicija sa MiniMax ekosistemom is friendly territory za hive-mind.

### Folder structure

```
packages/hermes-hooks/
├── src/
│   ├── hooks/
│   │   ├── pre_llm_call.py       # Hermes pre_llm_call hook
│   │   ├── post_llm_call.py      # Hermes post_llm_call hook
│   │   ├── on_session_start.py   # Hermes on_session_start hook
│   │   └── on_session_end.py     # Hermes on_session_end hook
│   ├── memory_md_bridge.py       # Hermes MEMORY.md ↔ hive-mind frames bridge
│   ├── install.py                # registers in Hermes config (~/.hermes/config.json or similar)
│   ├── uninstall.py
│   ├── verify.py
│   └── __init__.py
├── pyproject.toml                # PyPI package metadata (Python target — Hermes is Python-first)
├── tests/
│   ├── test_pre_llm_call.py
│   ├── test_memory_md_bridge.py
│   └── test_install_flow.py
├── package.json                  # NPM mirror (optional for Node-runtime users)
└── README.md
```

### Language note

Hermes Agent is Python-first (per Nous Research codebase). Shim package primary target je PyPI, sa optional NPM mirror za Node-runtime context. CC-1 should produce Python implementation; cli-bridge.ts (Node) is replaced sa cli_bridge.py (Python) for this shim.

### Hook event → hive-mind action mapping

| Hermes event | shim action | hive-mind CLI call (via subprocess) | importance |
|---|---|---|---|
| `on_session_start` | resolve workspace, sync MEMORY.md ↔ hive-mind, inject brief | `switch_workspace` + `recall_memory --limit 15` + `memory_md_bridge sync` | n/a (read+sync) |
| `pre_llm_call` | encode user input + hint context as temporary frame | `save_memory --importance temporary` | temporary |
| `post_llm_call` | summarize + capture skill emergence (if any) | `save_memory --importance important + skill_extract` | important; skills marked critical if novel |
| `on_session_end` | flush GOP boundary, schedule maintenance | `compact_memory` + `cognify --light` | n/a (maintenance) |

### MEMORY.md ↔ hive-mind bidirectional bridge

Hermes auto-injects MEMORY.md at `on_session_start`. Shim provides bidirectional bridge:

- **At session start**: read existing MEMORY.md content, parse into hive-mind frames (importance=critical), update hive-mind reflecting user-curated state
- **During session**: hive-mind frames continue capturing episodic content
- **At session end**: optionally extract high-importance frames + propose MEMORY.md edits for user review (NOT auto-write)

Default: bridge is read-only at session-start (sync MEMORY.md → hive-mind). Auto-write to MEMORY.md is opt-in flag (`--enable-md-writeback`) given user-curated semantic file.

### Skill emergence integration

Hermes' signature feature: agent writes reusable skill documents from experience. Shim captures emerged skills as critical-importance hive-mind frames sa special metadata `{ frame_type: 'skill', skill_id, skill_lineage }`. Cross-IDE benefit: skill emerged in Hermes session becomes recallable u Claude Code session via shared workspace.

### Install command UX

```bash
$ pip install hive-mind-hermes-hooks
$ hive-mind-hermes-hooks install
✔ Detected Hermes Agent v0.10.x at ~/.hermes/
✔ Detected hive-mind CLI v0.x.x via subprocess test
✔ Patched 4 hook registrations in ~/.hermes/config.json
✔ Created backup at ~/.hermes/config.json.bak.<timestamp>
✔ Synced MEMORY.md (3 entries) → hive-mind workspace ~/.hive-mind/global.mind
✔ Verified round-trip save + recall via Hermes hook test (54ms)

Done. New Hermes sessions will:
  1. Sync MEMORY.md to hive-mind at session start
  2. Capture episodic content during session
  3. Capture emerged skills as critical-importance frames
  4. Propose MEMORY.md edits at session end (review required)
```

### Acceptance criteria

- Install completes in <60s including MEMORY.md initial sync
- Bridge read-only by default; writeback opt-in via flag
- Skill emergence frames carry metadata for cross-IDE replay
- Hermes config backup before modification
- Smoke test: spawn Hermes session, verify hooks fire, verify hive-mind frames written

### Risks

- Hermes config schema changes — version-pin against tested versions
- MEMORY.md auto-writeback can clobber user-curated content — opt-in only, dry-run preview by default
- MiniMax partnership context — Nous Research may have own preferred memory layer; positioning as "complementary not competitive"
- Subprocess overhead per hook event — keep shim hooks under 50ms execution for hot path (pre_llm_call, post_llm_call)

### Strategic note — Hermes coalition opportunity

Per Universal Silent Capture brief §11 question 4: aktivni outreach Nous Research vs silent ship + organic discovery?

Recommend **active outreach** because:
- 64k stars sa MiniMax partnership = Nous Research is an ecosystem builder, will likely welcome OSS shim if narrative is "complementary not competitive"
- Co-authored blog post potential ("Hermes Agent + hive-mind: Memory at scale") provides distribution to both audiences
- Inclusion u Nous Research Discord + community calls = developer adoption flywheel

Outreach path: GitHub issue na nousresearch/hermes-agent proposing collaboration, plus DM to maintainers via X/Discord. Pre-public release ako moguće, ali bez forcing — silent ship is fallback.

---

## §4 Cross-shim conventions

### Versioning
- Each shim follows semver
- Major version pin to hive-mind core minor version (1.x shim → 1.x hive-mind core)
- Breaking changes u hive-mind core trigger major bumps u all shims simultaneously

### Telemetry
- **Default off**. No phone-home, no analytics by default per Apache 2.0 + privacy stance.
- Opt-in `--anonymous-usage` flag enables aggregate metrics (install count, version, OS) — explicit opt-in only.

### Config storage
- Shim-side config lives sa target IDE's existing config (e.g., `~/.claude/settings.json` for Claude Code, `~/.hermes/config.json` for Hermes).
- hive-mind state lives at `~/.hive-mind/` (per-user) or workspace-specific `<project>/.hive-mind/` if user opts in.

### Logging
- Default log level: `info`
- Shim logs to `~/.hive-mind/logs/<shim-name>.log` rotated daily, max 7 days kept
- Errors surface to target IDE's existing log surface where possible

### Error handling
- Shim errors NEVER propagate to user-facing IDE error message. Hooks catch + log + continue silently.
- Repeated errors (3+ within 60s) trigger one-time warning toast/log, no further user interruption.
- Hard failure (hive-mind CLI not responding) auto-disables shim for that session with logged warning.

---

## §5 Implementation sequence (CC-1 dispatch order)

When Marko ratifies and CC-1 starts:

**Sprint 1 (3-5 days)**: `shim-core` + `claude-code-hooks` + smoke tests + basic CI
**Sprint 2 (2-3 days)**: `cursor-hooks` (sa marketplace manifest deferred to post-public listing)
**Sprint 3 (4-6 days)**: `hermes-hooks` (Python target + bridge implementation)
**Sprint 4 (2 days)**: monorepo polish, README cross-references, npm publish workflow, PyPI publish workflow, final smoke tests

Total estimated: **2-3 weeks for 3 MVP shims**. Phase 2 shims (Codex + OpenCode + OpenClaw) follow with similar cadence; Phase 3 generic MCP fallback packages are template-driven, faster.

---

## §6 What this brief is NOT

- NOT implementation. CC-1 generates code based on these architectures only after Marko ratification.
- NOT exhaustive — schema may evolve based on first implementation discovery (e.g., Cursor hook event surface in 2026 spec may be richer than current research suggests; Hermes hook event surface may have additions in v0.11).
- NOT a launch blocker — these shims ship 1-2 weeks AFTER hive-mind core public release. MVP shim availability sa hive-mind public is the goal but if shims slip, hive-mind launches without them and shims roll out 1 week each.

---

## §7 Authorized by

PM (claude-opus-4-7) authoring 2026-04-25 dok agentic cell radi. Marko ratifies after final halt ping + Universal Silent Capture strategy ratification, then CC-1 dispatched per Sprint 1-4 sequence.
