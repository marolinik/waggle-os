// Pure mapping: who-are-you signals (workType / role) → a curated onboarding
// template id, used to badge + float the "Recommended" starting point on the
// Template step. Returns null when no confident match exists (no badge, list
// keeps its default order). Kept out of the component so the table is unit-
// testable without mounting the tree.

/** Curated-6 template ids (mirrors CURATED_ONBOARDING_TEMPLATE_IDS in constants.ts). */
type CuratedTemplateId =
  | 'code-review'
  | 'product-launch'
  | 'research-project'
  | 'sales-pipeline'
  | 'marketing-campaign';

/** WORK_TYPES id → curated template id. Only work types with a curated match
 *  appear; everything else (operations/finance/legal/design/leadership/other)
 *  falls through to null. Consulting has no curated card — Research Hub is the
 *  plan-mandated proxy. */
const WORK_TYPE_TO_TEMPLATE: Readonly<Record<string, CuratedTemplateId>> = {
  engineering: 'code-review',
  product: 'product-launch',
  research: 'research-project',
  sales: 'sales-pipeline',
  marketing: 'marketing-campaign',
  consulting: 'research-project',
};

/** Free-text role keyword fallback (ordered — first match wins). */
const ROLE_PATTERNS: ReadonlyArray<readonly [RegExp, CuratedTemplateId]> = [
  [/consult/i, 'research-project'],
  [/engineer|develop/i, 'code-review'],
  [/sales/i, 'sales-pipeline'],
  [/market/i, 'marketing-campaign'],
  [/product/i, 'product-launch'],
  [/research/i, 'research-project'],
];

/**
 * Recommend a curated template id from the day-0 signals. Prefers the explicit
 * work-type chip; falls back to keyword-matching the free-text role. Returns
 * null when neither yields a confident match.
 */
export function recommendTemplateId(workType?: string, role?: string): string | null {
  const byWorkType = workType ? WORK_TYPE_TO_TEMPLATE[workType] : undefined;
  if (byWorkType) return byWorkType;

  const r = role?.trim();
  if (r) {
    for (const [pattern, id] of ROLE_PATTERNS) {
      if (pattern.test(r)) return id;
    }
  }
  return null;
}
