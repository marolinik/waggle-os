# Bee Writer + Sleeping Regen Brief

**Author:** PM
**For:** Marko (gen operator) + Claude Code (scripting assist if needed)
**Date:** 2026-04-22
**Scope:** 2 bee persona regenerations (writer, sleeping) to remove white-dominant backgrounds that clash with the 9 regen-ovanih canon assets from 2026-04-21.

---

## Why

Post 2026-04-21 regen, 4 keep-ovana asset-a ostali su netaknuti iz audita: celebrating, researcher, sleeping, writer. Researcher je canon reference za prethodni batch i stilski je već kanonski. Celebrating prolazi side-by-side. Writer i sleeping imaju previše belih/svetlih površina pored 9 novih canon asset-a — Marko ratifikacija 2026-04-22. Regen ih dovodi u dark-first canon i oslobađa pun 15-file bundle za claude.ai/design upload.

---

## Style canon (unchanged from 2026-04-21 regen)

- **Primary reference:** `D:\Projects\waggle-os\apps\www\public\brand\bee-researcher-dark.png`
- **Secondary style anchor:** `D:\Projects\waggle-os\apps\www\public\brand\icon-draft-dark.jpeg`
- **Palette:** hive dark gradient background (#08090c → #141821), honey-gold accents (#f5b731, #e5a000, #b87a00), status violet (#a78bfa) optional
- **Outline:** thin, consistent weight matched to 9 regen-ovanih (analyst/architect/builder/confused/connector/hunter/marketer/orchestrator/team)
- **Composition:** centered bee subject, visible hive/honey environmental cue, no dominant white or light pastel background
- **Output:** Nano Banana Pro native 1024×1024 → Lanczos PIL upscale to 2048×2048 square

---

## Character brief — bee-writer-dark

**Subject string for prompt:**

> A friendly cartoon bee character as a writer/author, wearing small round glasses, sitting at a sleek dark wooden desk writing on a honey-gold glowing laptop screen or a small honey-hex-patterned notebook with a golden feather quill. Warm honey-gold desk lamp glow on the left side of the scene. Soft dark blue-black gradient background with faint honeycomb pattern visible in the ambient depth. Tiny scattered honey-gold paper scraps and a single glowing idea bubble above the bee's head shaped like a small honeycomb. NO white background, NO pure-white pages — notebook/screen surfaces are honey-gold warm-tinted with dark edges. Thin consistent outline weight. Centered square composition 2048×2048.

**Intent:** Maps to protagonist-as-knowledge-worker JTBD; writer persona is "bee who creates artifacts from scattered memory" — laptop/notebook metaphor for artifact generation.

**Anti-pattern to avoid:** white paper, white laptop screen, bright office scene, daylight ambient. All surfaces warm-toned dark with honey-gold glow accents.

---

## Character brief — bee-sleeping-dark

**Subject string for prompt:**

> A friendly cartoon bee character peacefully sleeping, curled up on a honey-gold pillow shaped like a soft honeycomb hexagon, with a small honey-gold sleeping eye-mask over its eyes. Dreamy night-sky background in deep dark blue-black gradient with small scattered glowing honey-gold stars and a subtle crescent moon in the upper right corner. Small "Zzz" letters in soft honey-gold floating above the bee's head. Tiny hexagonal dream-bubble pattern drifting upward. NO white cloud, NO pure-white pillow, NO bright daylight sky — entire scene is night-mode dark with warm honey-gold glow as only light source. Thin consistent outline weight matching canon. Centered square composition 2048×2048.

**Intent:** Maps to idle/passive persona — bee in rest mode while hive continues background work. Symbolically: memory persistence during user sleep (background harvest / consolidation).

**Anti-pattern to avoid:** white cloud pillow, bright pastel sky, daylight scene. Full night mode with warm-tinted moon/stars as only light.

---

## Gen run spec

Reuse the 2026-04-21 flow verbatim — Nano Banana Pro (Google Gemini 3 Pro Image Preview) via `generativelanguage.googleapis.com/v1beta`, multi-reference (researcher PNG + draft JPEG), persona-specific subject string injected.

**Budget:** ~$1.50-2 ukupno (2 × $0.70-0.90).

**Native output:** 1024×1024. Post-process: Lanczos PIL upscale → 2048×2048.

**Suggested run sequence:**

1. First gen: bee-writer-dark — send probni gen, visual go/no-go check by Marko against canon (side-by-side sa bee-researcher-dark, bee-analyst-dark, bee-architect-dark).
2. If go → second gen: bee-sleeping-dark.
3. If no-go on writer → refine subject string (PM iteracije max 2× sa Marko feedback-om) → re-gen → go/no-go.
4. Both generated → contact sheet 1×2 verifikacija side-by-side sa 3-4 canon reference-a.
5. Upscale 1024→2048 both files.

---

## Deploy

**Backup pre overwrite (mandatory, waggle-os je read-only za PM bez single-write override):**

```
D:\Projects\waggle-os\apps\www\public\brand\_backup-pre-regen-20260422-writer-sleeping\
├── bee-writer-dark.png  (current)
└── bee-sleeping-dark.png  (current)
```

**Overwrite:**

```
D:\Projects\waggle-os\apps\www\public\brand\bee-writer-dark.png  ← new 2048×2048
D:\Projects\waggle-os\apps\www\public\brand\bee-sleeping-dark.png  ← new 2048×2048
```

Verify: `Get-ItemProperty` na oba fajla da confirm 2048×2048 i noviji timestamp.

---

## Exit criteria pre claude.ai/design upload-a

1. bee-writer-dark.png 2048×2048 deploy-ovan, no white dominant area, canon-aligned
2. bee-sleeping-dark.png 2048×2048 deploy-ovan, no white dominant area, canon-aligned
3. Contact sheet 13×1 (svih 13 bee persona side-by-side) prolazi Marko vizuelni go/no-go kao stilski koherentan set
4. Backup folder postoji, rollback putanja dokumentovana

Kad sve četiri tačke PASS — Task #24 CLOSED, Task #16 (claude.ai/design upload) OTVOREN za resume sa punim 15-file bundle-om.

---

## Links

- Prethodni regen memory: `.auto-memory/project_bee_assets_regen.md`
- Canon reference: `D:\Projects\waggle-os\apps\www\public\brand\bee-researcher-dark.png`
- Style anchor: `D:\Projects\waggle-os\apps\www\public\brand\icon-draft-dark.jpeg`
- Design setup submission context: `PM-Waggle-OS/briefs/2026-04-20-claude-design-setup-submission.md`

---

**End of brief.**
