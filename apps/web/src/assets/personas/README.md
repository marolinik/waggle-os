# Persona Bee Sprites

AI-generated bee mascots for the 22 Waggle personas, mapped 8→22 via
`apps/web/src/lib/personas.ts` (AVATAR_MAP).

## Style

Cute stylized cartoon bee, centered square composition, front-facing,
round friendly body with honey-amber gradient (#E5A000) and soft black
stripes, large expressive black eyes with white highlights, translucent
iridescent wings, dark outline, modern flat illustration with subtle
cel-shading, simple soft honey-glow background. Each sprite carries a
persona-cluster prop (glasses + bar chart, magnifying glass + book, etc.).

## Regeneration

Uses the `nano-banana` CLI (Gemini 3.1 Flash). API key at `~/.nano-banana/.env`.

**Base template**, substitute `[ACTION]`:

```
Cute stylized cartoon bee mascot, centered square composition,
front-facing, round friendly body with honey-amber gradient and soft
black stripes, large expressive black eyes with white highlights,
translucent iridescent wings, dark outline, modern flat illustration
with subtle cel-shading, simple soft honey-glow background, [ACTION].
Minimal detail, strong silhouette, suitable for a 64px avatar icon.
No text.
```

## Per-persona actions

| File | Cluster | ACTION |
|---|---|---|
| analytics.jpeg | data / metrics | wearing round glasses, holding a small colorful floating bar chart showing rising columns |
| content-writer.jpeg | writing / creative | holding a classic fountain pen, a small open notebook floating beside with faint handwritten lines, focused writing pose |
| forecaster.jpeg | planning / strategy | holding a rolled parchment scroll in one hand and a small brass compass in the other, thoughtful forward-looking expression as if planning a route |
| hook-analyzer.jpeg | code / review | wearing large round headphones, holding a magnifying glass inspecting floating code brackets in a speech bubble, analytical alert pose |
| publisher.jpeg | broadcast / comms | holding a small amber megaphone raised in one hand, a mail envelope floating beside, confident announcing pose |
| researcher.jpeg | investigation | holding a magnifying glass peering at a small floating book, curious alert expression |
| synthesizer.jpeg | general / connector | holding a glowing amber lightbulb in one hand, faint connection lines radiating outward, eureka-moment inspired expression |
| trend-detector.jpeg | sales / intel | holding small binoculars raised to the eyes, a tiny radar-dish antenna on the head, forward-leaning scouting pose, alert and focused |

## Regen command

```bash
nano-banana "BASE_TEMPLATE_WITH_ACTION" -o <persona> -d <dir> -s 1K -a 1:1
```

Cost per image: ~$0.08 (Flash, 1K). Full set of 8: ~$0.65.
