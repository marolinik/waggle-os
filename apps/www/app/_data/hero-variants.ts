/**
 * 5-variant Hero metadata. UI strings (eyebrow, headline_lead,
 * headline_emphasis, subhead, body) live in `messages/en.json` under
 * `landing.hero.variant_{a|b|c|d|e}.*` per amendment §2.2.
 *
 * `hasEmphasis` flags Variant A (Marcus) for the split-color headline
 * (lead in cool light + honey-amber emphasis on the second sentence);
 * variants B-E render single-sentence headlines.
 */

export type HeroVariantId = 'A' | 'B' | 'C' | 'D' | 'E';

export interface HeroVariantMetadata {
  readonly id: HeroVariantId;
  /** Display name for dev-only variant tabs in HeroVisual. */
  readonly persona: string;
  /** i18n key segment under `landing.hero.*`. */
  readonly i18nKey: 'variant_a' | 'variant_b' | 'variant_c' | 'variant_d' | 'variant_e';
  /** Variant A renders headline_lead + headline_emphasis split; B-E single-sentence. */
  readonly hasEmphasis: boolean;
}

export const heroVariantsMeta: Readonly<Record<HeroVariantId, HeroVariantMetadata>> =
  Object.freeze({
    A: { id: 'A', persona: 'Marcus', i18nKey: 'variant_a', hasEmphasis: true },
    B: { id: 'B', persona: 'Klaudia', i18nKey: 'variant_b', hasEmphasis: false },
    C: { id: 'C', persona: 'Yuki', i18nKey: 'variant_c', hasEmphasis: false },
    D: { id: 'D', persona: 'Sasha', i18nKey: 'variant_d', hasEmphasis: false },
    E: { id: 'E', persona: 'Petra', i18nKey: 'variant_e', hasEmphasis: false },
  });
