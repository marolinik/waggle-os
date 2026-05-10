# LOCKED Decision — Stripe Pricing

**Date**: 2026-04-18
**Status**: LOCKED
**Backlog ref**: [M]-11
**Decided by**: Marko Marković

## Decision

Five-tier pricing structure for Waggle is locked at the following values:

- **TRIAL**: $0 / 15 days (no card required)
- **FREE**: $0 (forever)
- **PRO**: $19 / month
- **TEAMS**: $49 / seat / month
- **ENTERPRISE**: consultative (no public price)

## Rationale

Pricing was set after review of competitive landscape (Mem0, Letta, Mastra). Specific anchors:

- **$19 PRO** sits below the $20 psychological threshold while remaining above pure-OSS tooling. It is competitive with Mem0/Letta consumer-facing tiers.
- **$49 / seat TEAMS** is a standard B2B SaaS anchor for team functionality (collaboration, shared memory pools, admin controls).
- **TRIAL no-card** removes friction from prosumer evaluation and gives a credible signal that we trust the product to convert without payment lock-in.
- **Enterprise consultative** preserves negotiation room and avoids commoditizing the on-prem KVARK adjacency.

## Constraints unlocked

- [M]-01 (Stripe products creation) is no longer blocked by pricing ambiguity. Marko-side queue: create products in Stripe dashboard.
- Public website pricing page can move to final copy.

## Constraints not unlocked

- Marketing site copy still depends on benchmark gate ([M]-07) before public publication.

## Reversibility

Not reversible without a new LOCKED cycle. Any proposed change requires explicit Marko sign-off and a new dated decision file in this folder.
