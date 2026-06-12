# OSS Sync — Drift Analysis & Finding (2026-06-12)

> Triggered by "close the OSS re-split" after P5/D4 + #15 changed
> `packages/hive-mind-core/src/mind/{schema.ts,db.ts}` (the OSS-mirrored substrate).
> **Conclusion: NO forward-port needed — the OSS mirror is current for everything it
> actually carries.** This doc records the analysis so the obligation is provably
> closed and the next session doesn't re-flag a phantom gap.

## What was checked

OSS mirror clone: `/d/Projects/hive-mind` (remote `github.com/marolinik/hive-mind`),
on the maintainer branch `feature/mono-parity-2026-06-12`, top commit `23e15ff`
*"feat(core): mono-parity 2026-06-12 — forward-port of the waggle-os substrate arc"*
committed **02:59 today**.

`scripts/oss-drift-check.sh` flagged ~50 DIFFERS + 1 ONLY-IN-OSS + 5 ONLY-IN-MONO.
Each was run down:

| Drift item | Reality |
|---|---|
| **ONLY-IN-OSS `mind/llm-extractor.ts`** | Already reverse-ported to the monorepo as `harvest/extract-kg-entities.ts` (its header says so, "oss-drift triage D2, 2026-06-11"). The OSS keeps its standalone-executor original by curation. **Not a gap.** |
| **ONLY-IN-MONO `evolution-runs/execution-traces/improvement-signals.ts`** | Waggle-proprietary (barrel-exported in mono, consumed only by `@waggle/core`). The 02:59 sync correctly **stripped** them from OSS. **Intentional exclusion.** |
| **ONLY-IN-MONO `extract-kg-entities.ts`, `multi-mind.ts`** | OSS keeps `llm-extractor.ts` instead; multi-mind is a Waggle orchestration concern. Curation. |
| **~50 DIFFERS (mind/*, harvest/*)** | OSS-adaptation noise — `packages/core` vs `packages/hive-mind-core` layout, import-path rewrites, logger swaps. Not source drift. |

## The substrate changes this session — why none need porting

This session's only `hive-mind-core` substrate edits were:
- **P5/D4 `658884f`** — `'uninstalled'` in the **install_audit** action CHECK + its rebuild migration.
- **#15 `6fc8500`** — the **install_audit** `trust_source` CHECK + its rebuild migration.

Both are **entirely within the `install_audit` subsystem**, which the OSS substrate
**does not carry**:
- OSS `schema.ts` has **no `CREATE TABLE install_audit`** — only a vestigial comment line.
- OSS `db.ts` has **zero `install_audit` references** — the rebuild migration is absent.

`install_audit` is the capability-install trust trail (EU AI Act compliance / marketplace
governance) — Waggle-proprietary, same class as `evolution-runs`/`execution-traces`. Its
`InstallAuditStore` lives in `@waggle/core`, not the substrate. The 02:59 sync curated the
table + migration out. **So the P5/#15 deltas have nowhere to land on the OSS mirror.**

### c33da1e (content_hash boot fix) — also not needed

The mono boot-crash was: `SCHEMA_SQL` (with an inline `idx_frames_content_hash`) ran before
`runMigrations` added the column. The **OSS `db.ts` is structured differently** — its
`runMigrations` does `ensureColumn('content_hash')` **before** `applySql(SCHEMA_SQL)`
(db.ts:215→220), and the fresh path creates the column in the CREATE TABLE. So the OSS
already avoids the crash in both paths. **Not a gap.**

## Net

**The OSS mirror is in sync as of its 02:59 forward-port.** The "OSS re-split obligation"
flagged in prior handoffs was based on the assumption that any `schema.ts`/`db.ts` change
needs mirroring — but this session's specific changes are all in the OSS-excluded
`install_audit` subsystem. Nothing to push.

## ⚠️ Tooling/doc inaccuracies found (real, worth fixing)

The OSS sync is a **hand-curated forward-port on a feature branch** (the 02:59 model), NOT
the `scripts/oss-subtree-split.sh` script. The script is **stale and unsafe**:
1. It targets `packages/hive-mind-core` as the export root, but the OSS repo's layout is
   `packages/core` — the branches it produces don't match the mirror.
2. It has **no proprietary-file filter**, yet CLAUDE.md §7.5 claims *"Files that must NOT
   export … are handled by the subtree-split filter."* That filter **does not exist** in the
   script. A literal `subtree split` + push per the stale docs would **leak**
   `evolution-runs`/`execution-traces`/`improvement-signals.ts` to the public repo.
   The real protection is the manual curation (the 02:59 sync did strip them).

**Recommendation:** update CLAUDE.md §7.5 to describe the actual process (curated
forward-port on a feature branch; `install_audit` + the three proprietary files are
OSS-excluded) and either fix `oss-subtree-split.sh` to add a real filter + correct layout,
or mark it deprecated. Deferred to the founder (it touches the authoritative §7.5 contract).
