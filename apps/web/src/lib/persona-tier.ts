/**
 * M-01 — Persona two-tier classification + template-scoping helper.
 *
 * Groups the 22 personas into two tiers for PersonaSwitcher:
 *   1. UNIVERSAL MODES (8): general-purpose, planner, verifier, coordinator +
 *      researcher, writer, analyst, coder.
 *   2. SPECIALISTS (14): domain-specific personas, scoped to the active
 *      workspace's template via TEMPLATE_SPECIALISTS. For unknown / "blank"
 *      templates, all specialists are returned.
 *
 * Pure — no React, no DOM. Safe to unit-test and re-use outside the switcher.
 */

export type PersonaTier = 'universal' | 'specialist';

/** The 8 universal modes — always surfaced regardless of workspace template. */
export const UNIVERSAL_MODE_IDS: readonly string[] = [
  'general-purpose',
  'planner',
  'verifier',
  'coordinator',
  'researcher',
  'writer',
  'analyst',
  'coder',
] as const;

/**
 * Template → list of specialist persona ids most relevant to that template.
 * Empty array = the template is covered by universal modes alone and has no
 * dedicated specialists (e.g. research-project leans on the universal
 * Researcher; code-review leans on Coder).
 *
 * Ordering within each array is significance-based: primary specialist first,
 * secondary after. A future session can pin this down with real telemetry.
 */
export const TEMPLATE_SPECIALISTS: Readonly<Record<string, readonly string[]>> = {
  'sales-pipeline': ['sales-rep', 'marketer'],
  'research-project': [],
  'code-review': [],
  'marketing-campaign': ['marketer', 'creative-director'],
  'product-launch': ['product-manager-senior', 'project-manager'],
  'legal-review': ['legal-professional'],
  'agency-consulting': ['consultant', 'project-manager'],
  'customer-support': ['support-agent'],
  'finance-accounting': ['finance-owner'],
  'hr-people': ['hr-manager', 'recruiter'],
  'operations-center': ['ops-manager', 'executive-assistant'],
  'data-analytics': ['data-engineer'],
  'recruiting-pipeline': ['recruiter', 'hr-manager'],
  'design-studio': ['creative-director'],
  'blank': [],
};

/** The complete specialist set — used as the fallback when the template is
 * unknown, "blank", or the TEMPLATE_SPECIALISTS entry is empty. Derived from
 * the 22-persona canonical list minus the 8 universal modes. */
export const ALL_SPECIALIST_IDS: readonly string[] = [
  'project-manager',
  'executive-assistant',
  'sales-rep',
  'marketer',
  'product-manager-senior',
  'hr-manager',
  'legal-professional',
  'finance-owner',
  'consultant',
  'support-agent',
  'ops-manager',
  'data-engineer',
  'recruiter',
  'creative-director',
] as const;

export function getPersonaTier(id: string): PersonaTier {
  return UNIVERSAL_MODE_IDS.includes(id) ? 'universal' : 'specialist';
}

export interface ScopedSpecialists {
  /** Template-recommended specialists, in order. Rendered first. */
  primary: string[];
  /** Other specialists not recommended for this template. Rendered under a
   * collapsible "show all" toggle. Empty when `primary` covers everything. */
  others: string[];
  /** Whether the template had any explicit mapping. False for unknown /
   * "blank" — in which case callers should show all specialists inline
   * (no "show more" toggle needed). */
  hasMapping: boolean;
}

/**
 * Return the specialists grouped into recommended vs others for the given
 * template. When no template or no mapping applies, `primary` is the full
 * specialist list and `others` is empty — callers render the full roster.
 */
export function getSpecialistsForTemplate(
  templateId?: string,
  availableIds: readonly string[] = ALL_SPECIALIST_IDS,
): ScopedSpecialists {
  const available = new Set(availableIds);
  const mapping = templateId ? TEMPLATE_SPECIALISTS[templateId] : undefined;

  if (!mapping || mapping.length === 0) {
    return {
      primary: availableIds.filter(id => available.has(id)),
      others: [],
      hasMapping: false,
    };
  }

  const primaryOrdered = mapping.filter(id => available.has(id));
  const primarySet = new Set(primaryOrdered);
  const others = availableIds.filter(id => !primarySet.has(id) && available.has(id));

  return { primary: primaryOrdered, others, hasMapping: true };
}

export function isUniversalMode(id: string): boolean {
  return UNIVERSAL_MODE_IDS.includes(id);
}
