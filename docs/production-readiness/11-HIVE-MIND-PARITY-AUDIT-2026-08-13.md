# Hive Mind mirror parity audit — refreshed 2026-08-27

## Verdict

The curated Hive Mind mirror does not block the private Windows Solo internal RC. The
Waggle monorepo remains the sole source of truth for the memory substrate.

The next public Hive Mind package release is **not yet approved**. The mirror is clean,
merged, and cross-platform green, but the immutable drift baseline still contains known
reviewed blockers and one unreviewed difference. It must not be described as fully
synchronized or release-ready.

## Exact inputs

- Waggle runtime/source candidate:
  `23ad3fa5f99bddce648b84750a41365299aeb0da`
- Waggle source tree:
  `aab548f77ec64b181086664dad29c32e6bc78779`
- Hive Mind `master`:
  `3410327800db3ea23f875d547a0c7f4d08826b7e`
- Hive Mind integration: PR #53, tested head
  `f5072efbf3f2d13247bb91505d99403acbdf11c6`
- Comparison:
  `node scripts/oss-drift-check.mjs D:/Projects/hive-mind`
- Result: exit 1, fail closed

The Waggle documentation-only descendant does not change either compared source tree.

## Immutable baseline result

| Classification | Count | Meaning |
|---|---:|---|
| Parity | 5 | Reviewed paths with the expected canonical/OSS state |
| Reviewed adaptations | 38 | Intentional layout, import, logger, branding, or OSS-architecture differences |
| Known reviewed blockers | 22 | Paths still requiring maintainer-curated reconciliation before an OSS release |
| Unreviewed differences | 1 | A changed path not yet classified against the baseline |
| Forbidden exports | 0 | No prohibited Waggle-only path or marker was found in the mirror |

The single unreviewed difference is `harvest/raw-turns.ts`. It must be classified and
either reconciled or deliberately re-baselined through maintainer review before release.

The five parity paths are:

- `harvest/claude-code-adapter.ts`
- `harvest/decision-derivation.ts`
- `harvest/stable-id.ts`
- `mind/erasure.ts`
- `mind/inprocess-reranker.ts`

## Known reviewed blockers

The baseline currently marks 19 paths `reconcile`:

- Harvest: `dedup.ts`, `extract-kg-entities.ts`, `pipeline.ts`,
  `url-adapter.ts`
- Runtime/API: `index.ts`, `workspace-manager.ts`, `multi-mind-cache.ts`
- Mind: `db.ts`, `embedding-provider.ts`, `frames.ts`, `identity.ts`,
  `inprocess-embedder.ts`, `knowledge.ts`, `llm-extractor.ts`,
  `raw-archive.ts`, `raw-detail-lane.ts`, `schema.ts`, `search.ts`, and
  `suppression.ts`

Three more blockers are marked `product-curation`: `hook-runtime.ts`,
`mind/supersede.ts`, and `multi-mind.ts`. They require an explicit reviewed decision
about what remains Waggle-only and what generic subset, if any, should be adapted for the
public mirror. The approved decision must then reclassify them out of the blocker category.

A blocker in this inventory means the mapped files are not yet approved for the next OSS
release; it does not by itself assert a runtime vulnerability. Every blocker needs
canonical-first review. Only reconcile/exported paths require public-layout adaptation and
focused port tests; product-curation paths may instead remain Waggle-only after explicit
review. Every resolution requires a new baseline receipt.

## Work integrated on 2026-08-27

Hive Mind PR #53 added the curated search-boundary hardening needed for punctuated
identifiers and deprecated-candidate filtering before keyword, LIKE, whole-vector, and
chunk-vector limits. The implementation closed concatenated-token, malformed-query, CJK,
and alternate-vector-lane bypasses with executable regressions.

The PR passed build/test on Ubuntu, Windows, and macOS plus Ubuntu first-run smoke before
merge. A transient Ubuntu dependency-download `ECONNRESET` was rerun once and passed;
the deterministic code/test result was green.

This narrows the drift but does not erase the remaining `mind/search.ts` curated
difference, so the immutable checker correctly continues to fail closed.

## Proprietary exclusion boundary

Raw subtree publication is forbidden. A release curation must continue to exclude:

- `vault.ts`
- `mind/evolution-runs.ts`
- `mind/execution-traces.ts`
- `mind/improvement-signals.ts`
- `compliance/**`
- Waggle-only `install_audit` schema/migration fragments interleaved in shared files

The current scan found zero forbidden exports. That is a necessary safety gate, not proof
that all public-worthy changes have been reconciled.

## Release rule

Before the next Hive Mind package release:

1. Classify `harvest/raw-turns.ts`.
2. Reconcile or explicitly re-baseline every known blocker in small reviewed phases.
3. Run focused tests for each curated port and the complete Hive Mind build/test suite.
4. Run Linux, Windows, macOS, and first-run package smoke.
5. Re-run the immutable drift checker and require exit 0: zero known blockers, zero
   unreviewed differences, and zero forbidden exports. Any approved product-curation
   decision must first be represented by reviewed baseline reclassification.
6. Preserve provenance showing that generic substrate work originated in Waggle first.

Until those gates pass, `master` is a clean integrated development baseline, not a sealed
new OSS package release.
