# LOCKED Decision — hive-mind Extraction Effort

**Date**: 2026-04-18
**Status**: LOCKED
**Backlog ref**: H-34
**Decided by**: Marko Marković

## Decision

Realistic effort estimate for hive-mind extraction from the waggle-os monorepo into its own OSS repository is **5 to 10 working days**.

H-34 is classified as a P0 ship-blocker in the HIGH tier of BACKLOG-MASTER-2026-04-18.

## State at decision time

- Extraction plan: ~40% complete
- Code migration: not started
- Target repository: `D:\Projects\hive-mind\` (empty, awaiting migration)
- License target: Apache 2.0 with ee/ source-available pattern (Mastra playbook)

## Rationale

Earlier estimates of "1 to 2 days" were optimistic. The realistic scope includes:

- Extracting core memory primitives (bitemporal KG, MPEG-4 frame architecture, SCD-Type-2 validity)
- Packaging the MCP server interface for third-party consumption
- Moving all 11 harvest adapters (chatgpt, claude, claude-code, claude-desktop, gemini, perplexity, markdown, plaintext, pdf, url, universal)
- Setting up DCO, CLA, contribution guidelines, and CI that a credible OSS project requires
- Documentation pass (README, architecture overview, API reference) sufficient for external contributors
- Ensuring compliance-by-default story (EU AI Act audit triggers) is intact after extraction

Cutting below 5 days requires cutting scope, not raising tempo. Any estimate under that threshold needs an explicit scope-reduction justification.

## Downstream dependencies

Once H-34 closes, the following can begin:

- GitHub repository public visibility toggle
- Apache 2.0 license file commit
- First public announcement sequencing (still gated by [M]-07 SOTA proof)
- 12-week OSS launch sprint per research/01-oss-memory-packaging-strategy.md

## Reversibility

Effort estimate is revisable downward only with explicit scope reduction. Upward revision expected if extraction reveals hidden coupling with Waggle-specific packages.
