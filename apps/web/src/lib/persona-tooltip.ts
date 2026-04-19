/**
 * M-01 follow-up — persona tooltip content composer.
 *
 * Produces the structured hover-card payload rendered by PersonaSwitcher when
 * the user hovers a persona card. The logic is pure and lives outside the
 * component so the cascade rules (tagline → description fallback, bestFor
 * cap at 4, wontDo trimming) can be unit-tested without React.
 */

export interface PersonaTooltipSource {
  name: string;
  description: string;
  tagline?: string;
  bestFor?: string[];
  wontDo?: string;
  isReadOnly?: boolean;
}

export interface PersonaTooltipContent {
  name: string;
  /** Primary one-liner. Tagline when present, description otherwise. */
  headline: string;
  /** Up to MAX_BEST_FOR entries, stripped. */
  bestFor: string[];
  /** Non-empty wontDo, trimmed. */
  wontDo: string | null;
  isReadOnly: boolean;
  /** True when the card has tagline/bestFor/wontDo and can render the full
   * card; false means fall back to the simple description-only tooltip. */
  hasRichContent: boolean;
}

export const MAX_BEST_FOR = 4;

export function buildPersonaTooltip(p: PersonaTooltipSource): PersonaTooltipContent {
  const taglineTrimmed = (p.tagline ?? '').trim();
  const descriptionTrimmed = (p.description ?? '').trim();
  const headline = taglineTrimmed.length > 0 ? taglineTrimmed : descriptionTrimmed;

  const bestForList = Array.isArray(p.bestFor)
    ? p.bestFor
        .map(x => (x ?? '').trim())
        .filter(x => x.length > 0)
        .slice(0, MAX_BEST_FOR)
    : [];

  const wontDoTrimmed = (p.wontDo ?? '').trim();
  const wontDo = wontDoTrimmed.length > 0 ? wontDoTrimmed : null;

  const hasRichContent =
    taglineTrimmed.length > 0 || bestForList.length > 0 || wontDo !== null;

  return {
    name: p.name,
    headline,
    bestFor: bestForList,
    wontDo,
    isReadOnly: p.isReadOnly === true,
    hasRichContent,
  };
}
