# Hive Mind mirror parity audit — 2026-08-13 (refreshed 2026-08-14)

## Verdict

The Windows Solo release candidate is not blocked by the public Hive Mind mirror.
Waggle already contains the stronger canonical implementations assessed below.

The public `marolinik/hive-mind` mirror is **not parity-ready** and must not be
described as synchronized. Its next release needs a maintainer-curated forward-port;
a raw subtree copy is forbidden because it would export Waggle-only surfaces.

## Frozen inputs

- Waggle readiness HEAD: `d4f1dae3476829f1fc6d73c2173c960527c7b4c9`
- Hive Mind OSS HEAD: `c5ae6569768b342cfe3c2c91846064e2c73481b1`
- Both worktrees were clean before the read-only comparison. The OSS HEAD also
  matches the live `origin/master` revision checked on 2026-08-14.
- Command: `scripts/oss-drift-check.sh D:/Projects/hive-mind`
- Result: exit `1` (`DRIFT DETECTED`)
- Inventory: 68 monorepo source files, 59 OSS source files, 58 common files;
  1 only in OSS, 10 only in monorepo, 54 differing, and 4 byte-equal common files.

The Markdown-only release-record descendant that carries this refreshed audit changes
no substrate source. The inventory remains an audit of `d4f1dae3`; it is not rewritten
as though the drift command ran at the later documentation commit.

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

Eighteen differing files contain substantive or mixed drift. The highest-risk
public omissions are URL redirect/DNS SSRF protection, memory-ingress scanning,
SQL update-key allowlisting, archive bounds and reclaim, deprecated-frame search
exclusion, model-load locking and corrupt-cache quarantine, DB contention retries,
deduplication delimiters, suppression provenance, and cache eviction.

Thirty-five differing files are adaptation or non-material curation noise. One
more (`mind/embedding-provider.ts`) intentionally omits Waggle tiers, billing,
compliance, and product lifecycle behavior and must not be copied wholesale.
`workspace-manager.ts` moves to substantive/mixed: it contains product curation,
but now also carries generic public-worthy path containment, strict-ID, and
link/hardlink rejection absent from OSS. The refreshed 2026-08-14 inventory maps
all 54 differing files to these 18 substantive/mixed, 1 intentional-product, and
35 adaptation categories; no differing file is unclassified or stale.

### Reproducible differing-file classification

Substantive or mixed drift (18):

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
- `workspace-manager.ts`

Intentional product curation (1):

- `mind/embedding-provider.ts`

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

- **Windows Solo binary:** no blocker; the `d4f1dae3` Waggle candidate contains the
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
  controls. The former monorepo direct-MCP workspace issue is closed: commits
  `ce68c70f`, `c780286f`, and `00dee23e` added workspace path containment,
  unavailable-workspace fail-closed behavior, and legacy-default migration;
  76/76 focused monorepo checks pass. The OSS registration lane passes 11/11
  and still exposes 21 tools plus 4 resources, but no unrestricted cross-repository
  MCP parity claim is valid until the curated export and its security tests close.
- **Wiki compiler:** all 14 mapped package files are present in both checkouts
  (9 under `src/` plus `LICENSE`, `NOTICE`, `package.json`, `README.md`, and
  `tsconfig.json`), with zero files present on only one side. This proves inventory
  coverage, not byte-for-byte or behavioral parity. The OSS compiler raises its
  entity cap from 200 to 2,000; that behavior needs a mono-first reverse-port and
  regression test. OSS-only `wiki-web` and `enrichment` have no monorepo mapping and
  must be explicitly classified as OSS-native or reverse-ported before any
  whole-repository parity claim.

The default Windows Solo Claude Code, Codex, and Hermes hook lifecycle uses
`hook-call`, which enforces workspace ID syntax, existence, config-ID equality,
realpath containment, and link rejection. The direct MCP path now also fails closed
for invalid, missing, unavailable, escaped, or mismatched workspaces. This closes the
previous Waggle-side hardening gate; it does not make the drifted OSS mirror parity-ready.

## Exclusion verification

The raw subtree-split helper remains an inspection-only starting point and retains its
hard abort guard. The 2026-08-14 OSS negative DB/exclusion lane passed 12/12, including
a runtime assertion that proprietary tables are absent. Forbidden private paths are
absent, and non-test OSS core source has zero active DDL/DML for `install_audit`,
`execution_traces`, `evolution_runs`, `improvement_signals`, `ai_interactions`, or
`procedures`. Literal `install_audit` text remains intentionally in exclusion comments
and a negative test, so a naive zero-string scan is not valid. This evidence is not
permission to mechanically copy the monorepo tree: interleaved audit hunks still require
human curation and negative leak scans.
