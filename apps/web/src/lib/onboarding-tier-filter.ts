/**
 * Phase 4.1 unblock — onboarding tier-filter helpers.
 *
 * Source spec: `docs/ux-disclosure-levels.md` r2 §"Templates — filter for Essential" + §"Personas — filter for Essential".
 *
 * Live system context: the dock is already filtered by `UserTier` via `TIER_DOCK_CONFIG`
 * (apps/web/src/lib/dock-tiers.ts). The 0507_s1 brownfield diagnostic identified that
 * onboarding's TemplateStep + PersonaStep show ALL options regardless of the tier the
 * user picked at step 2 — an internal inconsistency that breaks the Ljiljana-bar.
 *
 * This file provides the smallest pure functions to close that gap. Pure helpers
 * keep the test surface trivial; the components import + apply.
 *
 * Marko Q1 (2026-05-07): drop `coder` from Essential personas — quote: "this is not
 * the target, unless you identify this tool can be useful for coders too, which I
 * don't believe."
 */
import type { UserTier } from '@/lib/dock-tiers';
import type { OnboardingTemplate, OnboardingPersona } from '@/components/os/overlays/onboarding/types';

/**
 * Templates surfaced by default at Essential. Listed in display order — TemplateStep
 * renders these in the same sequence regardless of where they appear in the source
 * `TEMPLATES` array. Other 12 templates remain reachable via "Show all" toggle.
 */
export const ESSENTIAL_TEMPLATE_IDS = [
  'agency-consulting',  // Marko's archetype, Ljiljana's role, broadest professional services match
  'research-project',   // Universally useful (HR research, market research, due diligence)
  'blank',              // Universal escape — any user who doesn't fit a category
] as const;

/**
 * Personas surfaced by default at Essential. The recommended persona for the chosen
 * template (e.g. `consultant` when the template is `agency-consulting`) is added on
 * top by `getPersonasForTier` so users still see the right specialist for their work.
 *
 * Coder is excluded per Marko Q1 (2026-05-07).
 */
export const ESSENTIAL_PERSONA_IDS = [
  'general-purpose',
  'researcher',
  'writer',
  'analyst',
] as const;

const ESSENTIAL_TEMPLATE_SET = new Set<string>(ESSENTIAL_TEMPLATE_IDS);
const ESSENTIAL_PERSONA_SET = new Set<string>(ESSENTIAL_PERSONA_IDS);

/**
 * Filter the template list according to the user's chosen tier. At `simple`, returns
 * the 3 essential templates in spec order (NOT input order — `TEMPLATES` interleaves
 * essentials between domain templates). At all other tiers, returns the input array
 * unchanged so the reference is preserved (cheap render-side comparison wins).
 */
export function getTemplatesForTier(
  tier: UserTier,
  all: readonly OnboardingTemplate[],
): readonly OnboardingTemplate[] {
  if (tier !== 'simple') return all;
  if (all.length === 0) return all;

  const byId = new Map<string, OnboardingTemplate>(all.map(t => [t.id, t]));
  const out: OnboardingTemplate[] = [];
  for (const id of ESSENTIAL_TEMPLATE_IDS) {
    const t = byId.get(id);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Filter the persona list according to the user's chosen tier. At `simple`, returns
 * the 4 essential personas plus the recommended persona for the template (if it's
 * a domain persona — knowledge/universal recommendations are already in the essential
 * set). Input ordering is preserved so `getPersonasForTemplate`'s recommended-first
 * sort survives — that's why the REC badge in PersonaStep still lands on the right
 * tile after filtering.
 *
 * At all other tiers, returns the input array unchanged.
 */
export function getPersonasForTier(
  tier: UserTier,
  all: readonly OnboardingPersona[],
): readonly OnboardingPersona[] {
  if (tier !== 'simple') return all;
  if (all.length === 0) return all;

  // The first entry of `all` is either:
  //   (a) the domain-recommended persona (when getPersonasForTemplate found one), or
  //   (b) the universal `general-purpose` (when the recommended is not a domain persona).
  // Case (a) is the "consultant for agency-consulting" path — the persona must survive
  // the filter even though it's `tier='domain'`. We detect (a) by checking if the
  // first entry's id is OUTSIDE the essential set; if so, allow it through.
  const first = all[0];
  const allowedFirstId = ESSENTIAL_PERSONA_SET.has(first.id) ? null : first.id;

  return all.filter(p =>
    ESSENTIAL_PERSONA_SET.has(p.id) ||
    (allowedFirstId !== null && p.id === allowedFirstId)
  );
}
