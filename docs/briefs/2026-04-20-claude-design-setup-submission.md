---
date: 2026-04-20
type: brief
status: LOCKED — pending form submission
workspace: claude.ai/design
purpose: Waggle OS landing design system setup — form submission record
---

# claude.ai/design — Waggle OS Design System setup

## Status

LOCKED for submission. Marko confirmed (2026-04-20): blurb, visual direction, and full 12-bee asset set approved via "da da i da". Brief exists for reproducibility and audit.

## Context

- **Workspace:** claude.ai/design (Anthropic Labs Research Preview, Claude Code export path confirmed — production pipeline, not mockup)
- **Output goal:** Design System that replicates existing Hive Design System (not generates from scratch), to be used for Waggle OS landing page + potential UX fixes to `apps/www`
- **Upstream sources:** `D:\Projects\waggle-os\apps\www\src\styles\globals.css` (color tokens), `D:\Projects\waggle-os\docs\BRAND-VOICE.md` (ratified 2026-04-15), `D:\Projects\waggle-os\app\icons\` (bee mascots + functional icons), `D:\Projects\waggle-os\app\public\waggle-logo.svg` (brand mark)

## Form Field 1 — Company blurb

```
Waggle is the cognitive layer that makes any AI better — on your device, under your control. Built on hive-mind, an open-source memory substrate (Apache 2.0), Waggle gives agents persistent memory, structured retrieval, and audit-grade provenance across every interaction. Works with open models for free, sovereign deployment. Works with frontier models to extend their intelligence further. MPEG-4 compression, bitemporal knowledge graphs, EU AI Act audit triggers. Local-first. Zero cloud required. For teams that need AI that remembers, reasons, and respects their data.
```

Word count: 84. Anti-hype compliance: no "revolutionary", "transform", "game-changing". Dual-axis framing preserved (open models free / frontier models extended). Technical differentiators named without jargon (MPEG-4, bitemporal KG, EU AI Act). Privacy positioned as default, not feature.

## Form Field 2 — Any other notes (visual direction)

```
Dark-first aesthetic. Calm-confident, technical precision, zero marketing hype. Color palette — foundation: hive navy/blue-gray scale (950 #08090c darkest, 900 #0c0e14, 800 #171b26, 700 #1f2433, 500 #3d4560, 100 #dce0eb, 50 #f0f2f7). Single accent: honey amber (400 #f5b731, 500 #e5a000, 600 #b87a00). Status accents reserved: #a78bfa for AI, #34d399 for healthy states. Use honey amber for emphasis only, not surfaces. Avoid gradient-heavy hero compositions. Subtle honeycomb geometric motifs as background texture, not foreground decoration. Typography: Inter, sentence case headings, tight kerning, em dashes not hyphens, Oxford comma. Bee mascot illustrations reserved for persona cards and empty states — not hero. Button hierarchy: primary = honey amber, secondary = hive outline, tertiary = text link. Reference: think Linear + Notion dark mode, not Stripe. Information density over whitespace minimalism. Code/terminal elements should feel native, not decorative. No stock photography, no abstract 3D renders.
```

## Form Field 3 — Asset uploads

**Correction note (2026-04-20):** Original inventory mis-attributed paths to `app\icons\` — that folder is an NSIS installer placeholder only. Actual bee mascot and brand assets live in `apps\www\public\brand\`. Also confirmed 13 bee variants (not 12 — includes `bee-confused-dark`).

**Priority order (verified paths):**

1. `D:\Projects\waggle-os\app\public\waggle-logo.svg` — primary brand mark (canonical SVG)
2. `D:\Projects\waggle-os\apps\www\public\brand\bee-analyst-dark.png`
3. `D:\Projects\waggle-os\apps\www\public\brand\bee-architect-dark.png`
4. `D:\Projects\waggle-os\apps\www\public\brand\bee-builder-dark.png`
5. `D:\Projects\waggle-os\apps\www\public\brand\bee-celebrating-dark.png`
6. `D:\Projects\waggle-os\apps\www\public\brand\bee-confused-dark.png`
7. `D:\Projects\waggle-os\apps\www\public\brand\bee-connector-dark.png`
8. `D:\Projects\waggle-os\apps\www\public\brand\bee-hunter-dark.png`
9. `D:\Projects\waggle-os\apps\www\public\brand\bee-marketer-dark.png`
10. `D:\Projects\waggle-os\apps\www\public\brand\bee-orchestrator-dark.png`
11. `D:\Projects\waggle-os\apps\www\public\brand\bee-researcher-dark.png`
12. `D:\Projects\waggle-os\apps\www\public\brand\bee-sleeping-dark.png`
13. `D:\Projects\waggle-os\apps\www\public\brand\bee-team-dark.png`
14. `D:\Projects\waggle-os\apps\www\public\brand\bee-writer-dark.png`
15. `D:\Projects\waggle-os\apps\www\public\brand\hex-texture-dark.png`

Total: 15 assets. Light variants excluded — dark-first is locked, light variants would dilute the generated system's aesthetic anchor. Functional icon set (16 × 2 .jpeg) also in `apps\www\public\brand\` but excluded — too granular for design system init; will be mapped via Code Connect post-generation.

**What we are NOT uploading and why:**
- Inter font files — system default, no upload needed
- CSS variables as file — inlined in Form Field 2 as hex codes
- Functional icons (16 × 2) — too granular for design system init; will be referenced in Code Connect map post-generation
- Logo raster variants (PNG, JPEG) — SVG is canonical, raster is derivative

## Control Gate before "Continue to generation"

Stop point after form is filled but before clicking `Continue to generation`. Marko reviews final state in browser, gives go/no-go. Reason: generation is the expensive step (time + model compute); late correction cheaper here than post-gen regeneration.

## Post-generation control gates (for reference)

- **Gate 1:** Review generated Design System artifact against Hive DS fidelity checklist
- **Gate 2:** Claude Code export — inspect generated code before merging into `apps/www`
- **Gate 3:** Landing page draft review before any deployment

## Decisions locked by this submission

- claude.ai/design is production design workspace for Waggle OS landing + UX work
- M1 headline ("The cognitive layer that makes your AI better. Whatever AI you pick.") is default Hero copy
- M3 headline ("Better Opus. Free Qwen. Same cognitive layer.") is alternate for technical personas (P3 Sasha, P7 Priya)
- M2 dropped from active variant set
- Hive/honey palette is the single design system source of truth — no parallel system
- Dark-first is immutable; light mode is optional post-launch, not in scope for landing
