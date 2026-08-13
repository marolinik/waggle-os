# Hive Mind mirror parity audit — 2026-08-13

## Verdict

The Windows Solo release candidate is not blocked by the public Hive Mind mirror.
Waggle already contains the stronger canonical implementations assessed below.

The public `marolinik/hive-mind` mirror is **not parity-ready** and must not be
described as synchronized. Its next release needs a maintainer-curated forward-port;
a raw subtree copy is forbidden because it would export Waggle-only surfaces.

## Frozen inputs

- Waggle readiness HEAD: `825c4d6be3491bf6fffe3a995cf630862c48668c`
- Hive Mind OSS HEAD: `c5ae6569768b342cfe3c2c91846064e2c73481b1`
- Both worktrees were clean before the read-only comparison.
- Command: `scripts/oss-drift-check.sh D:/Projects/hive-mind`
- Result: exit `1` (`DRIFT DETECTED`)
- Inventory: 1 only in OSS, 10 only in monorepo, 54 differing, 4 byte-equal
  common files.

The checker covers `packages/hive-mind-core/src` against the OSS
`packages/core/src`. This document therefore closes only the mapped core-substrate
drift classification. It does not prove CLI, MCP, hook, or wiki package parity.

## Classification

The single OSS-only `mind/llm-extractor.ts` is not an unknown lost feature. Its
generic prompt, parser, and batching behavior was reverse-ported and hardened in
monorepo `harvest/extract-kg-entities.ts`; the OSS implementation retains
OSS-specific provider executors and requires curated reconciliation.

Seven monorepo-only files are candidates for public export:

- `harvest/extract-kg-entities.ts`
- `harvest/url-egress-guard.ts`
- `hook-runtime.ts`
- `memory-ingress-guard.ts`
- `mind/supersede.ts`
- `mind/transformers-model-load.ts`
- `multi-mind.ts` (only after an explicit public-architecture decision)

The following are explicit Waggle-only exclusions and must not be exported:

- `mind/evolution-runs.ts`
- `mind/execution-traces.ts`
- `mind/improvement-signals.ts`
- `vault.ts` and `compliance/**`
- every interleaved `install_audit` DDL, index, trigger, and migration hunk in
  `mind/schema.ts` and `mind/db.ts`

Seventeen differing files contain substantive or mixed drift. The highest-risk
public omissions are URL redirect/DNS SSRF protection, memory-ingress scanning,
SQL update-key allowlisting, archive bounds and reclaim, deprecated-frame search
exclusion, model-load locking and corrupt-cache quarantine, DB contention retries,
deduplication delimiters, suppression provenance, and cache eviction.

Thirty-five differing files are adaptation or non-material curation noise. Two
more (`mind/embedding-provider.ts` and `workspace-manager.ts`) intentionally omit
Waggle tiers, billing, compliance, and product lifecycle behavior and must not be
copied wholesale.

### Reproducible differing-file classification

Substantive or mixed drift (17):

- `harvest/dedup.ts`
- `harvest/pipeline.ts`
- `harvest/raw-turns.ts`
- `harvest/url-adapter.ts`
- `index.ts`
- `mind/db.ts`
- `mind/frames.ts`
- `mind/identity.ts`
- `mind/inprocess-embedder.ts`
- `mind/inprocess-reranker.ts`
- `mind/knowledge.ts`
- `mind/raw-archive.ts`
- `mind/raw-detail-lane.ts`
- `mind/schema.ts`
- `mind/search.ts`
- `mind/suppression.ts`
- `multi-mind-cache.ts`

Intentional product curation (2):

- `mind/embedding-provider.ts`
- `workspace-manager.ts`

Adaptation or non-material curation differences (35):

- `harvest/chatgpt-adapter.ts`
- `harvest/chunk-utils.ts`
- `harvest/claude-adapter.ts`
- `harvest/extract-memory-lanes.ts`
- `harvest/gemini-adapter.ts`
- `harvest/index.ts`
- `harvest/markdown-adapter.ts`
- `harvest/pdf-adapter.ts`
- `harvest/perplexity-adapter.ts`
- `harvest/plaintext-adapter.ts`
- `harvest/prompts.ts`
- `harvest/raw-types.ts`
- `harvest/run-store.ts`
- `harvest/source-store.ts`
- `harvest/types.ts`
- `harvest/universal-adapter.ts`
- `injection-scanner.ts`
- `logger.ts`
- `mind/api-embedder.ts`
- `mind/awareness.ts`
- `mind/chunker.ts`
- `mind/concept-tracker.ts`
- `mind/content-hash.ts`
- `mind/embeddings.ts`
- `mind/entity-normalizer.ts`
- `mind/fts-sanitize.ts`
- `mind/litellm-embedder.ts`
- `mind/ollama-embedder.ts`
- `mind/ontology.ts`
- `mind/parse-date-window.ts`
- `mind/recall-context.ts`
- `mind/reconcile.ts`
- `mind/resolve-relative-date.ts`
- `mind/scoring.ts`
- `mind/sessions.ts`

## Release impact

- **Windows Solo binary:** no blocker; the frozen Waggle candidate contains the
  canonical implementations.
- **Waggle repository integration:** no core-substrate code port is required.
  Preserve this audit and do not claim that the OSS mirror is synchronized. Complete
  the separate CLI, MCP, hook, and wiki inventories before closing repository-wide
  mirror provenance.
- **Next Hive Mind OSS release:** blocked until the curated forward-port, focused
  tests, full OSS suite, package smoke test, provenance receipt, and negative leak
  scans are complete.

The forward-port is a separate OSS release operation in the OSS checkout. It must
use small reviewed phases, retain public naming/layout, and scan negatively for
`install_audit`, excluded files, `@waggle`, `WAGGLE_`, `.waggle`, KVARK, and secrets.
No files were changed in the OSS checkout during this audit.

## Other mirror package inventories

The repository-wide read-only inventory also covered the separately mapped CLI,
MCP, and wiki compiler packages. These comparisons are not part of the official
core drift-check result above and do not change the frozen Windows RC verdict.

- **CLI:** 21 common files, 10 monorepo-only, and 5 OSS-only. The OSS CLI lacks
  monorepo memory-ingress and sticky-erasure protections. OSS-only `digest` and
  recursive `harvest` are real reverse-port candidates, but require privacy,
  injection, and suppression review before becoming canonical.
- **MCP:** both expose 21 tools and 4 resources, but the OSS server lacks the
  monorepo scope gate, import containment, ingress checks, and sticky-erasure
  controls. The monorepo full MCP path also needs fail-closed handling for invalid
  or missing workspace IDs; the qualified external-agent hook path already uses
  the independently guarded hook runtime. No unrestricted MCP parity claim is valid
  until that monorepo issue and the curated OSS export are closed.
- **Wiki compiler:** all 14 mapped files are present. The OSS compiler raises its
  entity cap from 200 to 2,000; that behavior needs a mono-first reverse-port and
  regression test. OSS-only `wiki-web` and `enrichment` have no monorepo mapping and
  must be explicitly classified as OSS-native or reverse-ported before any
  whole-repository parity claim.

The default Windows Solo Claude Code, Codex, and Hermes hook lifecycle does not use
the unsafe full MCP workspace resolver: it uses `hook-call`, which enforces workspace
ID syntax, existence, config-ID equality, realpath containment, and link rejection.
The remaining full-MCP workspace issue is nevertheless a shipped direct-MCP
hardening gate and is tracked for fail-closed correction before the final freeze.
