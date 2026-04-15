# P1 Features — Status Triage (2026-04-15)

**Context:** The S2 handoff backlog listed 5 P1 feature items (#14-#18 in the session todo). This triage audits the actual code and flags which are already done (handoff staleness), which are real gaps, and which are premature abstractions worth deferring.

## Audit results

| # | Item | Actual state | Verdict |
|---|---|---|---|
| 14 | Agent native file access (read_file / write_file / search_files) | `system-tools.ts` has all three, local-fs-scoped via `resolveSafe(workspace, filePath)`. Works today. | **Deferred — premature abstraction.** |
| 15 | Shared team memory (team-scoped MindDB) | TeamSync syncs frames only per `packages/core/src/team-sync.ts`. No team-scoped ImprovementSignals, KG, or skill store. Real gap. | **Real gap — schedule a focused session.** |
| 16 | Cross-workspace read tool (B.2) | `read_other_workspace` fully wired in `cross-workspace-tools.ts:40`, registered in `server/local/index.ts:960`, approval gate live in `approval-grants.ts:52`. MultiMindCache feeds it. | **Done.** Handoff entry stale. |
| 17 | Memory Harvest adapter verify (Gemini/Perplexity/Cursor/Copilot) | Present: chatgpt, claude, claude-code, gemini, markdown, pdf, plaintext, universal, url. Missing: **perplexity, cursor, copilot.** | **Partial gap — 3 adapters missing.** |
| 18 | WeaverPanel UI (distillation health) | 158 LOC at `apps/web/src/components/os/apps/memory/WeaverPanel.tsx`, mounted in `MemoryApp.tsx:214`. Calls `adapter.getWeaverStatus()` + `/api/weaver/trigger`. | **Done.** Handoff entry stale. |

## #14 — agent file access: why defer

`read_file / write_file / search_files` today operate on the active workspace's local-fs directory via a `resolveSafe(workspace, path)` guard. This covers 100% of current agent usage — no caller has requested reads against virtual (app-managed) or team (S3-stubbed) storage types.

The `StorageProvider` abstraction in `packages/server/src/local/storage/` was designed to unify all three types (virtual / local / team). Wiring the agent tools through it would be correct architecture but would also:

- Require a `getStorageProviderForWorkspace(id)` callback on the agent-tool deps
- Require a storage-type hint in every tool call (or agent inference)
- Introduce async buffering paths (virtual & team storage are async/Buffer-based, local fs is sync/string)
- Expand the tool surface (maybe a new `storage_type` parameter, maybe three separate tools)

None of that delivers a user-visible improvement today. The architecture cost is real; the user benefit is zero until team storage is actually in use. **Revisit trigger:** when team workspaces start using S3 storage in production — tracked under P0 Stripe → Teams tier enablement.

## #15 — shared team memory: scope

TeamSync today pushes/pulls `memory_frame` entities only. A full team-memory implementation needs, in rough order of effort:

- **Team-scoped ImprovementSignals** — so `skill_promotion` / `correction` signals propagate across team members (tied to Gap E's promotion flow)
- **Team-scoped KnowledgeGraph** — team members see the same entity-relation network; currently each member has an isolated KG
- **Team-scoped skill library** — the directory layer already exists post-Gap-E (`~/.waggle/teams/{teamId}/skills/`); needs TeamSync to push/pull SKILL.md files
- **Conflict resolution on team pull** — two members save contradicting frames; `detectContradiction` already catches this locally (Gap K) but needs to run on incoming team frames too
- **Team-level compliance reporting** — aggregate AuditReport across team members' personal minds

Estimate: 2-3 focused sessions. Dependency: Stripe webhook integration (TEAMS tier enforcement) should land before enabling team-scoped features at runtime, or the "teamSkillLibrary" capability flag from `tiers.ts` can gate it today.

## #17 — missing harvest adapters

The three missing sources in order of strategic priority:

### Perplexity (highest value)

- Active user base overlaps heavily with ChatGPT/Claude users
- Export format is JSON (via account settings → data export)
- Pattern: follow `gemini-adapter.ts` — handle both array and wrapped-object shapes; map `query/answer` to `user/assistant` roles
- Estimated: 0.5 day including tests

### Cursor (moderate value)

- IDE-scoped → every message has a code-context attachment that the adapter needs to handle well
- Export is via a dedicated menu; format is JSON with `messages[]` and `context[]` arrays
- Pattern: follow `claude-code-adapter.ts` which already handles code-context; extend with Cursor-specific metadata
- Estimated: 0.5-1 day

### Copilot (lowest value, most complex)

- Two Copilot products: GitHub Copilot Chat (ephemeral, no export) vs Copilot Workspace (persistent)
- Only Workspace has exports today; data is scattered across `.copilot-workspace/` dirs
- Pattern: would need filesystem walk rather than JSON parse. Less "adapter" and more "scanner"
- Estimated: 1-2 days, with a design question about whether to wait for a cleaner Copilot export API

Recommendation: **ship Perplexity next session** (clear value, quick), defer Cursor to when an IDE workflow is prioritized, defer Copilot until GitHub releases a first-class export.

## Proposed follow-up session slices

1. **Perplexity adapter** — 0.5 day (bumps from P1 partial to P1 done on the Gemini/Perplexity line)
2. **Team memory phase 1** — ImprovementSignals + skill-library sync, 1-2 days
3. **Team memory phase 2** — KG + conflict resolution on pull, 1 day

Everything else in P1 is either done (#16, #18) or intentionally deferred (#14, Cursor+Copilot).
