import type { HeroVariantId } from '../_data/hero-variants';

export interface ResolveInput {
  readonly p?: string;
  readonly utm_source?: string;
}

/**
 * Resolves a hero variant from URL search params per amendment §1.1.
 *
 * Priority order: explicit `?p=` overrides `utm_source` heuristic.
 * - `?p=compliance` OR `utm_source=egzakta`    → B (Klaudia)
 * - `?p=founder`    OR `utm_source=hn`         → C (Yuki)
 * - `?p=developer`  OR `utm_source=github`     → D (Sasha)
 * -                    `utm_source=legal-tech` → E (Petra)
 * - default → A (Marcus)
 */
export function resolveHeroVariant(params: ResolveInput = {}): HeroVariantId {
  const p = params.p?.toLowerCase();
  const source = params.utm_source?.toLowerCase();

  if (p === 'compliance' || source === 'egzakta') return 'B';
  if (p === 'founder' || source === 'hn') return 'C';
  if (p === 'developer' || source === 'github') return 'D';
  if (source === 'legal-tech') return 'E';
  return 'A';
}
