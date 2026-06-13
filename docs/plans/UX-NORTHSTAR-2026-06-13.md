# UX North Star — Competitive Position + Refactor Plan (2026-06-13)

Founder directive: analyse the competition (Claude Cowork, OpenClaw/Hermes, Codex,
Claude Code) and refactor Waggle to be best-in-class using its advantages. Concrete
defect named: **manipulating workspaces is not possible**. Mental model to land:
**one project / area of life = one workspace**.

---

## 1. Competitive teardown (what each does best, what Waggle takes)

### Claude Cowork (Anthropic)
- **Best at:** outcome-framing. Work is a *task you delegate*, not a chat. Results are
  artifacts (files, decks, docs) you can open, not transcripts you scroll. Zero-jargon
  UI for non-technical users; parallel tasks with calm progress surfaces.
- **Weak vs us:** no persistent cross-session memory substrate; cloud-only; no
  sovereignty story; no multi-workspace "second brain" accumulation.
- **Take:** artifact-first results, delegate-and-walk-away framing, calm progress.

### Claude Code (Anthropic)
- **Best at:** power growth curve — skills, hooks, MCP, subagents compose; trust
  through verification (shows its work, runs gates). Session→memory continuity via
  CLAUDE.md/memory is *manual* though.
- **Weak vs us:** terminal-first, engineer-only; memory is files the user curates.
- **Take:** verification-before-done as UX (show receipts), capability composition.

### Codex (OpenAI)
- **Best at:** background parallelism — fire N tasks, each in a sandbox, review diffs
  async. Strong "work happens while you're away" loop (the #1 retention loop in
  agentic products).
- **Weak vs us:** PR/repo-centric, engineer-only, no memory between tasks.
- **Take:** the away-loop — "what got done while you were gone" must be the first
  thing every return-visit shows (we have LoginBriefing/overnight — deepen it).

### OpenClaw / Hermes agent
- **Best at:** proactivity + presence — heartbeat check-ins, messaging-native
  (lives where you already are), personality, viral delight. Feels *alive*.
- **Weak vs us:** chaotic setup, no governance/audit, single-mind (no workspace
  isolation), safety posture.
- **Take:** proactive heartbeat moments (digest, "I noticed X"), personality
  without cosplay; we already have isolation + governance they can't match.

## 2. Waggle's structural advantages (the moat to amplify)
1. **Persistent per-workspace memory** (mind substrate, SOTA-benchmarked) — nobody
   else has workspace-isolated, locally-owned, growing memory.
2. **Local-first sovereignty** (Tauri binary, your disk, KVARK story).
3. **Non-technical OS metaphor** — dock, workspaces, personas; Cowork is the only
   competitor even trying for this audience.
4. **Governance/audit/EU-AI-Act** posture — enterprise-credible.
5. **Harvest** — import your ChatGPT/Claude/Gemini history: instant moat-fill.

## 3. Gap map (verified against code 2026-06-13)

| # | Gap | Evidence | Severity |
|---|-----|----------|----------|
| G1 | **Workspace manipulation impossible from UI** — no rename/archive/delete/icon anywhere. Switcher is select-only; Home cards have no menu; Desktop header shows status but can't change it | `WorkspaceSwitcher.tsx` (list-only), grep: zero rename/delete affordances for workspaces vs full sets for files/artifacts/memories/agents | **P0** |
| G2 | Server PUT/PATCH `/api/workspaces/:id` body types omit `status`/`description` — archive inexpressible over API despite data model + manager support | `routes/workspaces.ts:755,782` vs `workspace-manager.ts:66` | **P0** |
| G3 | `deleteWorkspace` orphaned — exists in `useWorkspaces` but not exposed via ShellContext, no UI | `useWorkspaces.ts:60`, `ShellContext.tsx` | **P0** |
| G4 | Hook error-swallowing: delete/patch apply optimistic state even on failure | `useWorkspaces.ts:61,71` | P0 (rides along) |
| G5 | "One project/area = one workspace" mental model not stated anywhere in UI copy | switcher/create dialog copy | P1 |
| G6 | No workspace reorder/pin; no archived section | data model has no `order`; switcher flat | P1 |
| G7 | Archived workspaces (once settable) would still show everywhere — list consumers don't filter status | switcher, home briefing | P0 (ships with G1) |
| G8 | Tasks CRUD adapter gap; MCP logs disabled; cross-ws file copy stub | recon report | P2 |
| G9 | /api/evolution/run hang (carried from 0613 S1) | prior handoff | P2 (separate arc) |

## 4. Plan

### Phase A — Workspace manipulation, end-to-end (P0, this session)
1. **Server:** PUT+PATCH accept `status` (validated enum) + `description`; tests.
2. **Adapter + hook:** widen `patchWorkspace` to `status|description|icon`; expose
   `deleteWorkspace` via ShellContext; fix error-swallowing (throw → caller toasts,
   revert optimistic state on failure).
3. **`WorkspaceActionsMenu`** (new, reusable kebab): Rename · Archive/Restore ·
   Export briefing · Delete (type-name-to-confirm + "memory will be permanently
   deleted" warning). Mounted in: Home workspace cards, WorkspaceSwitcher rows,
   Workspace Desktop header.
4. **Switcher upgrade:** "+ New workspace" footer (opens existing CreateWorkspaceDialog),
   archived section (collapsed), mental-model subtitle copy.
5. **Filter `status==='archived'`** from: switcher main list, Ctrl+Tab cycle, home
   briefing recents (server-side), dashboard grid.
6. **Tests:** server route status round-trip + 400 invalid; FE menu actions.

### Phase B — Mental model + away-loop deepening (P1, next)
- Creation flow copy: "What project or area is this for?" — name suggestions.
- Workspace cards show living state (memory growth since last visit).
- Return-visit: LoginBriefing leads with "while you were away" outcomes (Codex loop).

### Phase C — Delight/proactive (P2, later)
- Heartbeat digest (OpenClaw take) via existing automations.
- Artifact-first result rendering in chat (Cowork take).
- G8 items; G9 evolution hang (separate debug arc).

---
*Verified file evidence in section 3; recon agents' raw reports superseded by direct
reads (two of their "CRITICAL missing screens" were stale-doc artifacts — Workspace
Desktop and Artifact Center both exist and are routed).*
