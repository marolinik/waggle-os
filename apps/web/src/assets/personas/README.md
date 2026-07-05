# Persona Bee Sprites

AI-generated bee mascots — **one unique avatar per Waggle persona (22/22 as of
2026-07-06)**, wired in `apps/web/src/lib/personas.ts` (AVATAR_MAP). The original
8 (below) plus 14 dedicated avatars added 2026-07-06, all in the same style family.

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

### Added 2026-07-06 (14 dedicated — one per remaining persona)

| File | Persona | ACTION |
|---|---|---|
| consultant.jpeg | consultant | holding a small glowing strategy slide deck with a rising arrow, confident advising pose |
| project-manager.jpeg | project-manager | holding a small kanban board with tiny sticky-note cards, organized on-top-of-it pose |
| product-manager-senior.jpeg | product-manager-senior | holding a small wireframe blueprint sheet with a roadmap timeline line, visionary forward-looking pose |
| ops-manager.jpeg | ops-manager | holding two interlocking gears beside a small checklist clipboard, steady dependable pose |
| verifier.jpeg | verifier | holding a magnifying glass over a small checklist showing a green check and a red cross, skeptical scrutinizing pose |
| executive-assistant.jpeg | executive-assistant | holding a small calendar page in one hand and a sealed envelope in the other, tidy attentive helpful pose |
| hr-manager.jpeg | hr-manager | holding a small glowing heart badge with a tiny people icon, warm welcoming pose |
| support-agent.jpeg | support-agent | wearing a small headset with a microphone, friendly reassuring helpful pose |
| marketer.jpeg | marketer | holding a small rocket trailing hearts and sparkles, energetic upbeat campaign pose |
| creative-director.jpeg | creative-director | holding an artist paint palette and brush, stylish confident visionary pose |
| legal-professional.jpeg | legal-professional | holding small balanced scales of justice, calm judicious composed pose |
| finance-owner.jpeg | finance-owner | holding a small stack of gold coins beside a tiny upward growth chart, prudent confident pose |
| data-engineer.jpeg | data-engineer | holding a small glowing database cylinder with flowing data lines, focused technical pose |
| recruiter.jpeg | recruiter | holding a small resume document with a magnet attracting little star icons, talent-scouting pose |

## Regen command

```bash
nano-banana "BASE_TEMPLATE_WITH_ACTION" -o <persona> -d <dir> -s 1K -a 1:1
```

Cost per image: ~$0.08 (Flash, 1K). Full set of 8: ~$0.65.
