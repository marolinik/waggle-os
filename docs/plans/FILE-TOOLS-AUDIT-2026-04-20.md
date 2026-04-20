# Agent File Tools Audit — 2026-04-20 (L-18..21)

**Scope:** audit-first per S2/S3/S4 pattern. Verify each sub-item against
current source before committing to the 5-day estimate.

## Sub-item disposition

| Item | Spec | Current | Verdict | Build est. |
|------|------|---------|---------|------------|
| **L-18 Agent file tools** | read/write/search wired to StorageProvider for virtual/local/team | `system-tools.ts` has all 3 tools ✅ but they call `fs.*` directly — local/virtual only. StorageProvider abstraction exists in `packages/server/src/local/storage/`. | **40% done** — tools work locally; S3 storage never reached. Architectural refactor. | ~4-6 hr |
| **L-19 TeamStorageProvider S3/MinIO** | Real impl via `@aws-sdk/client-s3`, not stub | `@aws-sdk/client-s3@3.1019.0` ✅ installed. `packages/core/src/file-store.ts` has `S3FileStore` class ✅. `packages/server/src/local/storage/s3-provider.ts` wraps it ✅. | **95% done** — real impl shipped. CLAUDE.md §2 "stub" note is outdated. | ~30 min (doc update + MinIO smoke) |
| **L-20 File indexing** | Workspace files auto-indexed into workspace mind on upload/change | No `onFileUpload` hook or indexFile watcher found | **0% done** — genuinely new work | ~3-4 hr |
| **L-21 Cross-workspace file read** | `read_other_workspace_file(workspace_id, path)` + permission modal | `cross-workspace-tools.ts` has `read_other_workspace` (memory) ✅ + `list_workspace_files` ✅ but NO `read_other_workspace_file` (file contents) | **70% done** — tool missing, infrastructure present | ~1.5 hr |

**Revised total: ~10-12 hr** (vs 5 d = 40 hr — **~70% reduction**).

## What's cheap and safe — ship this session

**L-19 doc update (~15 min).** `CLAUDE.md` §2 and §8 still reference the
S3 provider as a stub. It is not — `@aws-sdk/client-s3` is installed,
`S3FileStore` is a working implementation, `S3StorageProvider` adapts
it to the `StorageProvider` interface. Update the CLAUDE.md lines and
add a note in the audit log.

**L-21 cross-workspace file read tool (~1.5 hr).** Clean additive
change — new `read_other_workspace_file` in `cross-workspace-tools.ts`
following the pattern of `read_other_workspace` and
`list_workspace_files`. Resolves the file via the existing
`listWorkspaceFiles` dep + a new `readWorkspaceFile` dep. Permission
gate already handled by the existing `confirmation.ts` + tool-approval
registry (it keys on tool name).

## What's architecturally risky — defer to follow-up session

**L-18 StorageProvider routing.** The existing tools are scoped to the
agent's cwd via `resolveSafe(workspace, path)`. Rewiring them to
dispatch on a workspace's storage type (local → `fs`, team → S3)
requires:

1. The agent runtime needs to know the current workspace's storage
   type at tool-execution time.
2. The `StorageProvider` interface must be threaded into `system-tools.ts`
   dep graph (currently only takes `workspace: string` cwd).
3. Binary file handling changes: current code reads as UTF-8 string for
   text, but `StorageProvider.read()` returns `Buffer`.
4. Permission semantics (path traversal) are provider-specific.

This is a half-day refactor minimum, with multi-file agent-runtime
touches. Worth its own session with clear rollback points.

**L-20 file indexing.** Design decisions needed:

1. **Trigger:** indexOnUpload vs. indexOnDemand vs. scheduled job?
   Upload can be expensive for large PDFs; on-demand means staleness.
2. **Target mind:** per-workspace mind (multi-workspace deployments)
   or global personal.mind?
3. **Granularity:** entire file as one frame, or chunk per N bytes?
   Chunking matters for PDF/docx but not for small TXT.
4. **Format coverage:** PDFs (pdf-parse installed per `system-tools.ts`
   read_file), DOCX? XLSX? Markdown? TXT?
5. **Cleanup:** do we delete old index entries when a file is
   overwritten? Moved? Deleted?

Parking until Marko design call.

## Recommended execution

1. **L-19 doc update** (~15 min, this session) — tiny but corrects a
   false claim in CLAUDE.md that's been in place since early April.
2. **L-21 cross-workspace file read** (~1.5 hr, this session) —
   clean additive tool, no infrastructure changes.
3. **L-18 + L-20** — own session(s) with Marko input. Estimated ~8 hr
   together if the storage-routing refactor is bounded tightly.

---

**Author:** Claude (audit per Marko's L-18..21 pick after M-02..06 session)
