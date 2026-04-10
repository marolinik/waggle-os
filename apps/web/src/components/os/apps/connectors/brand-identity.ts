/**
 * Brand Identity — visual identity for every MCP server in the catalog.
 *
 * Strategy:
 *   1. Real brand SVGs from simple-icons v16 for every brand it covers (~70%)
 *   2. Hand-curated fallback palette with authentic brand colors for the rest
 *   3. Category-hashed fallback for anything truly unknown — so no slot is empty
 *
 * Every server in MCP_CATALOG gets a deterministic identity:
 *   - color  — square tile background (always the authentic brand hex when known)
 *   - fg     — foreground color for the SVG path or monogram (auto-contrast)
 *   - svgPath — if sourced from simple-icons, the raw path data (24x24 viewBox)
 *   - monogram — 1–2 char fallback shown when no SVG is available
 *
 * simple-icons is tree-shakable per ESM import — only the icons referenced
 * here end up in the bundle. Adding a new brand is two lines (import + entry).
 */

import {
  // Databases
  siPostgresql, siSqlite, siMysql, siMongodb, siRedis, siNeo4j, siSupabase,
  siQdrant, siTurso, siPlanetscale, siClickhouse,
  // Files
  siGoogledrive, siBox, siDropbox, siMinio, siGooglecloud,
  // Web
  siBrave, siPuppeteer, siFirefox,
  // Code / DevTools
  siGithub, siGitlab, siSentry, siDocker, siKubernetes, siVercel, siNpm,
  siGrafana, siDatadog, siCircleci, siTerraform, siCloudflare,
  // Communication
  siDiscord, siGmail, siTelegram, siWhatsapp,
  // Productivity
  siNotion, siLinear, siJira, siConfluence, siAsana, siTodoist,
  siGooglecalendar, siGoogledocs, siGooglesheets, siObsidian, siClickup,
  // Business
  siStripe, siShopify, siAirtable, siIntercom, siZendesk, siHubspot,
  // Cloud
  siFlydotio, siRailway, siRender, siDigitalocean, siHetzner,
  // AI & ML
  siHuggingface, siReplicate, siLangchain, siOllama,
  // Analytics
  siPosthog, siMixpanel, siPlausibleanalytics, siPrometheus, siGoogleanalytics,
  // Security
  siVault, siSnyk, si1password, siBitwarden,
  // Media
  siFigma, siYoutube, siSpotify, siUnsplash,
  // Utilities
  siAnthropic,
} from 'simple-icons';

export interface BrandIdentity {
  /** Tile background color, hex without # */
  color: string;
  /** Foreground color for svg/monogram — 'white' or 'black' auto-picked for contrast */
  fg: 'white' | 'black';
  /** SVG path data (24×24 viewBox) when sourced from simple-icons */
  svgPath?: string;
  /** Fallback monogram when no svg is available (always present so TS is simple) */
  monogram: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pick white or black foreground based on tile background luminance.
 * Uses the WCAG relative luminance formula for accurate contrast.
 */
function contrast(hex: string): 'white' | 'black' {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return L > 0.5 ? 'black' : 'white';
}

/** Build a BrandIdentity from a simple-icons entry. */
function si(icon: { hex: string; path: string; title: string }, monogramOverride?: string): BrandIdentity {
  const color = icon.hex;
  return {
    color,
    fg: contrast(color),
    svgPath: icon.path,
    monogram: monogramOverride ?? icon.title.slice(0, 2).toUpperCase(),
  };
}

/** Build a BrandIdentity from a hand-curated brand color + monogram. */
function brand(color: string, monogram: string): BrandIdentity {
  return { color, fg: contrast(color), monogram };
}

// ────────────────────────────────────────────────────────────────────────────
// Registry — keyed by MCP server id from mcp-registry.ts
// ────────────────────────────────────────────────────────────────────────────

const REGISTRY: Record<string, BrandIdentity> = {
  // Database ────────────────────────────────────────────────────────────────
  'postgres': si(siPostgresql, 'PG'),
  'sqlite': si(siSqlite, 'SQ'),
  'mysql': si(siMysql, 'MY'),
  'mongodb': si(siMongodb, 'MO'),
  'redis': si(siRedis, 'RD'),
  'neo4j': si(siNeo4j, 'N4'),
  'supabase': si(siSupabase, 'SB'),
  'neon': brand('00E599', 'NE'),
  'qdrant': si(siQdrant, 'QD'),
  'turso': si(siTurso, 'TS'),
  'planetscale': si(siPlanetscale, 'PS'),
  'clickhouse': si(siClickhouse, 'CH'),

  // Files & Storage ─────────────────────────────────────────────────────────
  'filesystem': brand('6B7280', 'FS'),
  'gdrive-mcp': si(siGoogledrive, 'GD'),
  's3': brand('FF9900', 'S3'),
  'onedrive-mcp': brand('0078D4', '1D'),
  'box': si(siBox, 'BX'),
  'dropbox-mcp': si(siDropbox, 'DB'),
  'minio': si(siMinio, 'MI'),
  'gcs': si(siGooglecloud, 'GC'),

  // Web & Search ────────────────────────────────────────────────────────────
  'brave-search': si(siBrave, 'BR'),
  'fetch': brand('0EA5E9', 'FE'),
  'puppeteer': si(siPuppeteer, 'PU'),
  'playwright-mcp': brand('2EAD33', 'PW'),
  'tavily': brand('FF6B6B', 'TV'),
  'exa': brand('1F40FF', 'EX'),
  'firecrawl': brand('F04E23', 'FC'),
  'serper': brand('4285F4', 'SR'),
  'browserbase': brand('111827', 'BB'),
  'jina': brand('FBCFE8', 'JI'),

  // Code & DevTools ─────────────────────────────────────────────────────────
  'github-mcp': si(siGithub, 'GH'),
  'gitlab-mcp': si(siGitlab, 'GL'),
  'sentry': si(siSentry, 'SE'),
  'docker': si(siDocker, 'DK'),
  'kubernetes': si(siKubernetes, 'K8'),
  'vercel': si(siVercel, 'VC'),
  'npm': si(siNpm, 'NP'),
  'grafana': si(siGrafana, 'GF'),
  'datadog': si(siDatadog, 'DD'),
  'circleci': si(siCircleci, 'CI'),
  'terraform': si(siTerraform, 'TF'),
  'cloudflare': si(siCloudflare, 'CF'),

  // Communication ───────────────────────────────────────────────────────────
  'slack-mcp': brand('4A154B', 'SL'),
  'gmail-mcp': si(siGmail, 'GM'),
  'discord-mcp': si(siDiscord, 'DC'),
  'teams-mcp': brand('6264A7', 'MT'),
  'telegram': si(siTelegram, 'TG'),
  'whatsapp': si(siWhatsapp, 'WA'),
  'twilio': brand('F22F46', 'TW'),
  'sendgrid': brand('1A82E2', 'SG'),

  // Productivity ────────────────────────────────────────────────────────────
  'notion-mcp': si(siNotion, 'NO'),
  'linear-mcp': si(siLinear, 'LN'),
  'jira-mcp': si(siJira, 'JR'),
  'confluence-mcp': si(siConfluence, 'CO'),
  'asana-mcp': si(siAsana, 'AS'),
  'todoist': si(siTodoist, 'TD'),
  'google-calendar': si(siGooglecalendar, 'GC'),
  'google-docs': si(siGoogledocs, 'GD'),
  'google-sheets': si(siGooglesheets, 'GS'),
  'obsidian-mcp': si(siObsidian, 'OB'),
  'monday-mcp': brand('FF3D57', 'MD'),
  'clickup': si(siClickup, 'CU'),

  // Business & CRM ──────────────────────────────────────────────────────────
  'stripe-mcp': si(siStripe, 'ST'),
  'salesforce-mcp': brand('00A1E0', 'SF'),
  'hubspot-mcp': si(siHubspot, 'HS'),
  'shopify': si(siShopify, 'SH'),
  'airtable-mcp': si(siAirtable, 'AT'),
  'intercom': si(siIntercom, 'IC'),
  'zendesk': si(siZendesk, 'ZD'),
  'freshdesk': brand('25C16F', 'FD'),

  // Cloud & Infrastructure ──────────────────────────────────────────────────
  'aws': brand('FF9900', 'AW'),
  'gcp': si(siGooglecloud, 'GC'),
  'azure': brand('0078D4', 'AZ'),
  'fly': si(siFlydotio, 'FL'),
  'railway': si(siRailway, 'RW'),
  'render': si(siRender, 'RN'),
  'digitalocean': si(siDigitalocean, 'DO'),
  'hetzner': si(siHetzner, 'HZ'),

  // AI & ML ─────────────────────────────────────────────────────────────────
  'openai-mcp': brand('10A37F', 'AI'),
  'huggingface': si(siHuggingface, 'HF'),
  'replicate': si(siReplicate, 'RP'),
  'stability': brand('8F47FF', 'ST'),
  'langchain': si(siLangchain, 'LC'),
  'pinecone': brand('111827', 'PC'),
  'weaviate': brand('00C4B4', 'WV'),
  'elevenlabs-mcp': brand('000000', '11'),

  // Analytics ───────────────────────────────────────────────────────────────
  'posthog': si(siPosthog, 'PH'),
  'amplitude': brand('1E61F0', 'AM'),
  'mixpanel': si(siMixpanel, 'MX'),
  'plausible': si(siPlausibleanalytics, 'PL'),
  'prometheus': si(siPrometheus, 'PM'),
  'google-analytics': si(siGoogleanalytics, 'GA'),

  // Security ────────────────────────────────────────────────────────────────
  'vault': si(siVault, 'HV'),
  'snyk': si(siSnyk, 'SN'),
  'onepassword': si(si1password, '1P'),
  'bitwarden': si(siBitwarden, 'BW'),

  // Media ───────────────────────────────────────────────────────────────────
  'figma': si(siFigma, 'FG'),
  'canva': brand('00C4CC', 'CV'),
  'youtube': si(siYoutube, 'YT'),
  'spotify': si(siSpotify, 'SP'),
  'unsplash': si(siUnsplash, 'UN'),
  'dall-e': brand('412991', 'DE'),

  // Utilities ───────────────────────────────────────────────────────────────
  'memory-mcp': brand('E5A000', 'ME'),
  'time': brand('38BDF8', 'TI'),
  'sequentialthinking': brand('A78BFA', 'ST'),
  'context7': brand('111827', 'C7'),
  'magic-mcp': brand('A78BFA', 'MG'),
  'mcp-shell': brand('374151', 'SH'),
  'everything': brand('E5A000', 'EV'),
  'calculator': brand('38BDF8', 'CA'),
};

// ────────────────────────────────────────────────────────────────────────────
// Category fallback palette — when a server id isn't in REGISTRY, tile gets
// a deterministic color derived from its category so related servers still
// visually group together. Anchored to Hive DS-friendly hues.
// ────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'Database': '336791',
  'Files': 'F59E0B',
  'Web': '0EA5E9',
  'Code': '6B7280',
  'Communication': '8B5CF6',
  'Productivity': 'EC4899',
  'Analytics': '10B981',
  'Cloud': '3B82F6',
  'DevTools': 'EF4444',
  'Business': 'F97316',
  'AI & ML': 'A78BFA',
  'Security': 'DC2626',
  'Media': 'F43F5E',
  'Utilities': 'E5A000',
};

/**
 * Resolve a brand identity for an MCP server.
 * Always returns a valid identity — falls back to category color + monogram.
 */
export function getBrandIdentity(
  serverId: string,
  name: string,
  category: string,
): BrandIdentity {
  const hit = REGISTRY[serverId];
  if (hit) return hit;

  // Fallback — category-derived color with first 2 letters of the brand name.
  const color = CATEGORY_COLORS[category] ?? 'E5A000';
  const monogram = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();
  return {
    color,
    fg: contrast(color),
    monogram: monogram || '··',
  };
}

/** Number of MCP servers that have a real brand SVG from simple-icons. */
export function countWithRealLogos(ids: readonly string[]): number {
  return ids.filter(id => REGISTRY[id]?.svgPath != null).length;
}
