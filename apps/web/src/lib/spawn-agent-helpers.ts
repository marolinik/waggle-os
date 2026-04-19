/**
 * Pure helpers extracted from SpawnAgentDialog for unit coverage.
 *
 * The dialog fetches two endpoints (`/api/providers` + `/api/litellm/models`)
 * and maps the response into (a) a key-presence count used to pick the
 * right empty-state copy and (b) a suggested default model to pre-select
 * in the form. Both are trivial, but keeping them separate makes the
 * empty-state branching assertable without booting JSDOM.
 */

export interface ProviderSummary {
  /** `true` when the user has a Vault-backed credential for this provider. */
  hasKey: boolean;
}

/**
 * Count providers that have a key configured.
 *
 * Drives the spawn-agent empty-state copy: 0 means "no keys → Vault CTA",
 * >0 with empty model list means "keys present, LiteLLM proxy may be down
 * → Retry CTA".
 */
export function countProvidersWithKeys(providers: readonly ProviderSummary[]): number {
  return providers.reduce((n, p) => n + (p.hasKey ? 1 : 0), 0);
}

/**
 * Pick the default model to pre-select in the spawn-agent dropdown.
 *
 * Prefer the parent workspace's configured model when it is still present
 * in the live model list (avoids silently falling back if the workspace
 * was configured for a model that has since become unavailable). Otherwise
 * use the first available model. Returns an empty string when no models
 * are available — the caller is expected to render an empty-state CTA.
 */
export function selectDefaultModel(
  workspaceModel: string | undefined,
  availableModels: readonly string[],
): string {
  if (workspaceModel && availableModels.includes(workspaceModel)) {
    return workspaceModel;
  }
  return availableModels[0] ?? '';
}
