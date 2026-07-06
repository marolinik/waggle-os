# Persona Bee Avatars

AI-generated bee mascots — **one unique avatar per Waggle persona (22/22)**,
wired in `apps/web/src/lib/personas.ts` (AVATAR_MAP, 1:1 by persona id).

**Wave Q (2026-07-06): the whole set was redrawn in the canonical
flat-geometric hex-bee language** — the same style as the landing personas grid
(`apps/www/public/brand/bee-*-dark.png`). The R9 5-judge panel flagged the
previous glossy cel-shaded sticker set as a second illustration dialect
("two mascot languages"); one dialect now covers landing + app.

## Style (canonical)

Flat geometric vector bee: hexagonal head, simple black dot eyes with white
glints, small smile, black-striped hexagon body, thick black outlines directly
on the shapes, flat golden honey palette (#e5a000 family, ~40° hue), NO
gradients, NO glow, NO background scene, transparent background. Each avatar
carries one distinct persona prop (quill+hex notebook, hex scales, megaphone,
interlocking hex gears, …). Reads clearly at 64px.

## Regeneration recipe (proven 2026-07-06)

1. Generate with `nano-banana` (key: `~/.nano-banana/.env`; pass `--api-key`
   if a stale `GOOGLE_API_KEY` env shadows it), using THREE style references
   from the landing set + transparency:

   ```bash
   nano-banana "<BASE + persona prop>" \
     -r bee-builder-dark.png -r bee-hunter-dark.png -r bee-orchestrator-dark.png \
     -t -m pro -s 1K -a 1:1 -o <persona-id> -d <outdir>
   ```

   Batch script with all 22 prompts: session scratchpad `gen-flat-avatars.sh`
   (2026-07-06); BASE prompt is embedded there.

2. **Palette-correct** — generations consistently come out ~30° burnt-orange
   instead of the refs' ~40° gold. Deterministic PIL pass (scratchpad
   `fix-avatars.py`): halo rim → transparent, interior near-white → warm cream
   #f7e8c8, orange family +10.5° hue / +0.02 sat. Verify: dominant hue of
   opaque colored pixels should land 39-41°.

3. Drop the PNGs here named `<persona-id>.png` — imports in
   `lib/personas.ts` are 1:1 by id.

Cost: ~$0.10/image (pro, 1K). Full 22-set ≈ $2.2.
