# LOCKED Decision — Launch Timing (SOTA-Gated)

**Date**: 2026-04-18
**Status**: RESOLVED
**Backlog ref**: [M]-07
**Decided by**: Marko Marković

## Decision

hive-mind and Waggle ship together. Launch is gated by SOTA benchmark proof.

- **Gate metric**: LoCoMo benchmark — Mem0 currently holds 91.6% as the reference target.
- **Rule**: no public launch until hive-mind memory substrate meets or exceeds the reference.

## Rationale

Two forces converge on the same answer:

First, separating the launches would weaken the "vertically integrated sovereign stack" narrative. Shipping hive-mind OSS alone cedes narrative oxygen to Mem0/Letta. Shipping Waggle alone without the OSS foundation undercuts the differentiator claim. Paired launch is the only way the positioning lands.

Second, the Reflection 70B precedent (Matt Shumer, September 2024) is a permanent reminder of what happens when "small beats big" claims go public without reproducible methodology. A benchmark gate protects the launch from post-announcement demant and preserves long-run credibility that the ecosystem plays depend on.

## Operational implications

- All external communication (PR, social, dev documentation) must assume simultaneous launch of hive-mind + Waggle.
- Backlog prioritization must favor Block H1 (boot screen + benchmark instrumentation) over polish bugs when they conflict for engineering time.
- v2 experiment (60 examples × 3 domains, 4-judge ensemble without Opus) must complete and pass before launch window opens.

## Reversibility

Ship-together decision is not reversible. Benchmark target is revisable if LoCoMo is superseded by a more credible reference benchmark — any such change requires a new dated decision file.
