/**
 * Tiny utility for turning a canonical persona ID (kebab-case)
 * into a user-facing display name.
 *
 * Used by the connector landing surface ("Recommended for Sales Rep")
 * and any other place that has only the ID at hand and needs a string
 * for the UI without coupling to apps/web's onboarding constants or
 * apps/agent's persona-data.
 *
 * Edge cases the regex covers:
 *  - 'sales-rep'              → 'Sales Rep'
 *  - 'product-manager-senior' → 'Product Manager Senior'
 *  - 'general-purpose'        → 'General Purpose'
 *  - 'pm'                     → 'Pm'           (single word, capitalized)
 *  - ''                       → ''             (empty stays empty)
 *  - undefined / null / non-string → ''        (defensive)
 */
export function formatPersonaName(id: unknown): string {
  if (typeof id !== 'string' || id.length === 0) return '';
  return id
    .split('-')
    .map(part => part.length === 0 ? part : part[0].toUpperCase() + part.slice(1))
    .join(' ');
}
