# Total Remaining Work — Everything to Launch

**Counted from:** REMAINING-BACKLOG-2026-04-16.md + HIVE-MIND-INTEGRATION-DESIGN.md
**Date:** 2026-04-16

---

## Raw Item Count

| Category | Items | Engineering Days | Notes |
|----------|-------|-----------------|-------|
| **Block 1: Marko's actions** | 10 | 0 | Your time, not mine |
| **Block 2: Harvest real data** | 9 | 3 | Cursor adapter + imports |
| **Block 3: Wiki v2** | 4 | 5 | Obsidian, Notion adapters, health UI |
| **Block 3b: Compliance report** | 5 | 3.5 | PDF route, templates, full-page viewer |
| **Block 3c: UX fixes** | 26 | 5 | 5 QW + 6 medium + 7 engagement + 9 a11y |
| **Block 3c-R: Responsive** | 5 | 2 | Dock, status bar, chat, onboarding, windows |
| **Block 3d: CLAUDE.md open work** | 2 | 0.5 | PersonaSwitcher redesign |
| **Block 3e: Cross-reference** | 9 | 7 | MS Graph, light mode, KG viewer, binary build |
| **Block 4: Harvest UX polish** | 4 | 5 | SSE progress, resume, identity, onboarding |
| **Block 5: Memory proof** | 7 | 10 | Test execution (~$300-500) |
| **Block 6: GEPA proof** | 6 | 18 | Test execution (~$1,500-2,500) |
| **Block 7: Combined proof** | 3 | 6 | Test execution (~$500) |
| **Block 8: Write papers** | 4 | 5 | Writing, not code |
| **Block 9: Launch prep** | 8 | 5 | Stripe, signing, Clerk, hive-mind extract, binary |
| **Block 10: Launch day** | 5 | 1 | Ship day |
| **hive-mind integration** | 8 | 7 | MCP resources, CLI, hooks, installer |
| **Strategic decisions** | 6 | 0 | Marko decisions |
| **Content (non-code)** | 3 | 2 | Demo video script, LinkedIn posts |
| **TOTAL** | **124 items** | **~85 days sequential** | |

---

## But Most Runs in Parallel

```
WEEK 1-2: Code + Polish (parallel tracks)
├── Block 3c QW: 5 quick wins                     (0.25 days)
├── Block 3c medium: 6 UX fixes                   (1.5 days)
├── Block 3d: PersonaSwitcher redesign             (0.5 day)
├── Block 3b: Compliance PDF + templates           (3.5 days)
├── Block 3e-CR2: Light mode audit                 (0.5 day)
├── Block 3e-CR3: KG viewer gaps                   (0.5 day)
├── Block 3e-CR7: CLAUDE.md update                 (0.1 day)
├── hive-mind: MCP resources + instructions        (1.5 days)
└── Block 2-1.6: BUILD Cursor adapter              (1 day)
                                          SUBTOTAL: ~2 weeks

WEEK 2-3: Harvest + Harvest UX (needs Marko's exports)
├── Block 2: Import all platforms                  (2 days)
├── Block 4: Harvest UX (SSE, resume, onboarding)  (5 days, parallel)
├── Block 3: Wiki v2 (Obsidian, Notion, health UI) (5 days, parallel)
└── Block 3e-CR1: MS Graph connector               (3 days, parallel)
                                          SUBTOTAL: ~1.5 weeks

WEEK 3-4: Engagement + hive-mind + Proofs start
├── Block 3c ENG: 7 engagement features            (3 days)
├── Block 3c A11Y: 9 accessibility fixes           (1 day)
├── Block 3c-R: 5 responsive fixes                 (1 day)
├── hive-mind: CLI + hooks + installer             (5 days)
├── Block 5 START: Memory proof steps 1-3          (5 days, ~$250)
└── Block 6 START: Task suite curation             (3 days, $0)
                                          SUBTOTAL: ~1.5 weeks

WEEK 4-6: Proofs (mostly test execution, burns budget)
├── Block 5: Memory proof steps 4-7                (5 days, ~$150)
├── Block 6: GEPA baselines + evolution + judges   (12 days, ~$2,000)
├── Block 9: Launch prep parallel track            (5 days)
│   ├── Stripe smoke test (needs M7)
│   ├── Clerk integration
│   ├── hive-mind source extraction
│   ├── Binary build + smoke test
│   └── Landing page final polish
└── Content: Demo video script + LinkedIn drafts   (2 days)
                                          SUBTOTAL: ~2-3 weeks

WEEK 6-7: Combined proof + Papers
├── Block 7: Combined effect test                  (6 days, ~$500)
├── Block 8: Write Paper 1 + Paper 2               (5 days, parallel)
└── Block 8.3: External peer review                (Marko action)
                                          SUBTOTAL: ~1 week

WEEK 7-8: Final prep + Launch
├── Block 9: Final binary + signing + notarization (2 days)
├── Block 10: Launch day                           (1 day)
└── Post-launch: monitor, fix, respond             (ongoing)
                                          SUBTOTAL: ~1 week
```

---

## Summary

| Metric | Value |
|--------|-------|
| **Total items** | 124 |
| **Engineering days (sequential)** | ~85 |
| **Calendar weeks (parallel)** | **~7-8 weeks** |
| **Budget (API + cert)** | **$2,650-4,000** |
| **Blocked on Marko** | 10 external actions |
| **Strategic decisions needed** | 6 |

---

## By Priority (what matters most)

### P0 — Launch Blockers (must do)
| Item | Days | Budget |
|------|------|--------|
| Harvest real data (Block 2) | 3 | $50 |
| Memory proof (Block 5) | 10 | $300-500 |
| GEPA proof (Block 6) | 18 | $1,500-2,500 |
| Combined proof (Block 7) | 6 | $500 |
| Write papers (Block 8) | 5 | $0 |
| Launch prep — Stripe, signing, Clerk, binary (Block 9) | 5 | $300-500 cert |
| hive-mind source extraction (CR-6) | 3 | $0 |
| **P0 subtotal** | **50 days** | **$2,650-4,000** |

### P1 — Ship Quality (should do before launch)
| Item | Days |
|------|------|
| 5 UX quick wins (QW 1-5) | 0.25 |
| PersonaSwitcher redesign (OW-6) | 0.5 |
| Compliance PDF route + template (3b.1-3b.2) | 1.5 |
| Light mode audit (CR-2) | 0.5 |
| CLAUDE.md update (CR-7) | 0.1 |
| Cursor adapter (1.6) | 1 |
| hive-mind MCP resources + instructions (Layer 1+2) | 1.5 |
| Demo video script (CR-4) | 1 |
| **P1 subtotal** | **~6.5 days** |

### P2 — Polish (can ship without, do soon after)
| Item | Days |
|------|------|
| 6 medium UX fixes | 1.5 |
| 7 engagement features | 3 |
| Harvest UX full (SSE, resume, onboarding tile) | 5 |
| Wiki v2 (Obsidian, Notion, health UI) | 5 |
| Compliance full-page viewer + branding (3b.3-3b.5) | 2 |
| KG viewer gaps (CR-3) | 0.5 |
| hive-mind CLI + hooks + installer (Layer 3) | 5 |
| **P2 subtotal** | **~22 days** |

### P3 — Future (post-launch)
| Item | Days |
|------|------|
| 9 accessibility fixes | 1 |
| 5 responsive fixes | 2 |
| MS Graph connector (CR-1) | 3 |
| KVARK compliance template (3b.5) | 0.5 |
| LinkedIn posts (CR-5) | content |
| Mac notarization (CR-9) | Marko |
| **P3 subtotal** | **~6.5 days** |

---

## The Honest Answer

**To launch (P0): ~50 engineering days, ~$3,000, ~5-6 weeks calendar.**
Most of that is test execution (proofs), not coding. Pure new code is ~15 days.

**To launch with quality (P0+P1): add ~6.5 days → ~56 days, same budget.**

**To launch with polish (P0+P1+P2): add ~22 days → ~78 days, same budget.**

**Everything including future (P0+P1+P2+P3): ~85 days total.**

The critical path is the GEPA proof (18 days) — that's the longest single item and it's on the critical path to Paper 2.
