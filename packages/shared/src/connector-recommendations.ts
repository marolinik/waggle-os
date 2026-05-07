/**
 * Persona-aware connector recommendations.
 *
 * Replaces the old "5 skills + 3 connectors at Essential" capability cap
 * (per the user's pushback in 2026-05-08 session: hiding 145 of 148
 * connectors didn't simplify, it crippled). Instead the catalog stays
 * fully reachable — but the connector-landing surface, onboarding step,
 * and chat hints SHOW different defaults based on the user's persona +
 * template, on the principle that a Sales rep wants HubSpot/Salesforce
 * up front while a Coder wants GitHub/Linear/Slack.
 *
 * This module is the single source of truth: server (for API), web
 * (for ConnectorsApp landing tile), and onboarding (for the "which
 * tools?" step) all import from here. Every connector ID listed below
 * is validated against `mcp-catalog.ts` by the unit test
 * `connector-recommendations.test.ts`.
 *
 * Shape:
 *   recommendConnectors(personaId) → { primary: string[], secondary: string[] }
 * - `primary`   — 3–5 IDs shown as the immediate "start here" tile
 * - `secondary` — additional context-relevant IDs shown one tier down
 *
 * Capability is NEVER reduced: all 148 connectors remain reachable via
 * search + browse-all in ConnectorsApp regardless of recommendation.
 */

/**
 * Universal-default connectors used as fallback for any persona without
 * a specific override (e.g. general-purpose, planner, verifier,
 * coordinator). Picked because these three are the most commonly-used
 * tools across professional roles globally.
 */
const UNIVERSAL_PRIMARY = ['gdrive-mcp', 'gmail-mcp', 'notion-mcp'] as const;

/** Secondary defaults that round out the universal set without overwhelming. */
const UNIVERSAL_SECONDARY = ['slack-mcp', 'microsoft-365'] as const;

export interface ConnectorRecommendation {
  /** 3–5 IDs to display in the immediate connector landing tile. */
  primary: readonly string[];
  /** Additional IDs that show in a "also useful for your role" section. */
  secondary: readonly string[];
}

/**
 * Per-persona connector recommendations.
 *
 * The keys are the canonical persona IDs from
 * `packages/agent/src/persona-data.ts`. Adding a new persona without
 * updating this map is allowed — `recommendConnectors` falls back to
 * the universal defaults so the surface never breaks.
 */
export const CONNECTOR_RECOMMENDATIONS: Readonly<Record<string, ConnectorRecommendation>> = {
  // ── Universal / reasoning personas — use the universal defaults ──────
  'general-purpose':  { primary: UNIVERSAL_PRIMARY, secondary: UNIVERSAL_SECONDARY },
  'planner':          { primary: UNIVERSAL_PRIMARY, secondary: UNIVERSAL_SECONDARY },
  'verifier':         { primary: UNIVERSAL_PRIMARY, secondary: UNIVERSAL_SECONDARY },
  'coordinator':      { primary: UNIVERSAL_PRIMARY, secondary: UNIVERSAL_SECONDARY },

  // ── Knowledge-tier personas ──────────────────────────────────────────
  'researcher': {
    primary:   ['perplexity', 'exa', 'gdrive-mcp', 'notion-mcp', 'gmail-mcp'],
    secondary: ['firecrawl', 'tavily', 'brave-search', 'jina'],
  },
  'writer': {
    primary:   ['gdrive-mcp', 'notion-mcp', 'gmail-mcp', 'figma'],
    secondary: ['confluence-mcp', 'microsoft-365'],
  },
  'analyst': {
    primary:   ['bigquery', 'postgres', 'gdrive-mcp', 'notion-mcp', 'excel'],
    secondary: ['snowflake', 'clickhouse', 'duckdb', 'airtable-mcp'],
  },
  'coder': {
    primary:   ['github-mcp', 'slack-mcp', 'linear-mcp', 'sentry', 'gdrive-mcp'],
    secondary: ['gitlab-mcp', 'docker', 'vercel', 'datadog', 'postgres'],
  },

  // ── Domain-tier personas ─────────────────────────────────────────────
  'project-manager': {
    primary:   ['linear-mcp', 'jira-mcp', 'slack-mcp', 'notion-mcp', 'gdrive-mcp'],
    secondary: ['asana-mcp', 'monday-mcp', 'clickup', 'atlassian'],
  },
  'executive-assistant': {
    primary:   ['gmail-mcp', 'gdrive-mcp', 'notion-mcp', 'slack-mcp'],
    secondary: ['microsoft-365', 'asana-mcp'],
  },
  'sales-rep': {
    primary:   ['hubspot-mcp', 'salesforce-mcp', 'slack-mcp', 'gmail-mcp', 'notion-mcp'],
    secondary: ['linear-mcp', 'gdrive-mcp', 'airtable-mcp'],
  },
  'marketer': {
    primary:   ['hubspot-mcp', 'notion-mcp', 'gdrive-mcp', 'slack-mcp', 'figma'],
    secondary: ['airtable-mcp', 'salesforce-mcp', 'firecrawl'],
  },
  'product-manager-senior': {
    primary:   ['linear-mcp', 'jira-mcp', 'github-mcp', 'figma', 'slack-mcp', 'notion-mcp'],
    secondary: ['atlassian', 'sentry', 'gdrive-mcp'],
  },
  'hr-manager': {
    primary:   ['gmail-mcp', 'gdrive-mcp', 'slack-mcp', 'notion-mcp'],
    secondary: ['microsoft-365', 'asana-mcp', 'airtable-mcp'],
  },
  'legal-professional': {
    primary:   ['gdrive-mcp', 'notion-mcp', 'gmail-mcp'],
    secondary: ['microsoft-365', 'box', 'confluence-mcp'],
  },
  'finance-owner': {
    primary:   ['stripe-mcp', 'gdrive-mcp', 'excel', 'gmail-mcp', 'notion-mcp'],
    secondary: ['microsoft-365', 'bigquery', 'airtable-mcp'],
  },
  'consultant': {
    primary:   ['notion-mcp', 'gdrive-mcp', 'gmail-mcp', 'slack-mcp', 'figma'],
    secondary: ['microsoft-365', 'confluence-mcp', 'airtable-mcp'],
  },
  'support-agent': {
    primary:   ['zendesk', 'intercom', 'slack-mcp', 'gmail-mcp', 'notion-mcp'],
    secondary: ['linear-mcp', 'jira-mcp', 'gdrive-mcp'],
  },
  'ops-manager': {
    primary:   ['notion-mcp', 'slack-mcp', 'gdrive-mcp', 'atlassian'],
    secondary: ['asana-mcp', 'monday-mcp', 'jira-mcp', 'airtable-mcp'],
  },
  'data-engineer': {
    primary:   ['bigquery', 'postgres', 'snowflake', 'github-mcp', 'slack-mcp'],
    secondary: ['clickhouse', 'duckdb', 'mongodb', 'gdrive-mcp'],
  },
  'recruiter': {
    primary:   ['gmail-mcp', 'gdrive-mcp', 'slack-mcp', 'notion-mcp'],
    secondary: ['microsoft-365', 'airtable-mcp'],
    // Note: 'linkedin' would be the obvious add here but is not in the
    // MCP catalog as of 2026-05-08. When/if added, slot it ahead of
    // airtable-mcp in secondary.
  },
  'creative-director': {
    primary:   ['figma', 'gdrive-mcp', 'slack-mcp', 'notion-mcp'],
    secondary: ['microsoft-365', 'asana-mcp'],
  },
};

/**
 * Get the recommended connectors for a persona.
 *
 * Falls back to universal defaults for unknown persona IDs (custom
 * personas, future additions, typos) so the surface never goes empty.
 */
export function recommendConnectors(personaId: string): ConnectorRecommendation {
  const exact = CONNECTOR_RECOMMENDATIONS[personaId];
  if (exact) return exact;
  return { primary: UNIVERSAL_PRIMARY, secondary: UNIVERSAL_SECONDARY };
}

/**
 * Convenience: flatten a recommendation into a single ranked list
 * (primary first, then secondary). Useful for the onboarding step's
 * "pick your tools" multi-select where ordering matters more than
 * sectioning.
 */
export function flattenRecommendation(rec: ConnectorRecommendation): string[] {
  return [...rec.primary, ...rec.secondary];
}

/** All connector IDs referenced anywhere in this file. Used by the test
 *  suite to verify catalog membership without enumerating personas. */
export function allReferencedConnectorIds(): string[] {
  const seen = new Set<string>();
  for (const id of UNIVERSAL_PRIMARY) seen.add(id);
  for (const id of UNIVERSAL_SECONDARY) seen.add(id);
  for (const rec of Object.values(CONNECTOR_RECOMMENDATIONS)) {
    for (const id of rec.primary) seen.add(id);
    for (const id of rec.secondary) seen.add(id);
  }
  return [...seen].sort();
}
