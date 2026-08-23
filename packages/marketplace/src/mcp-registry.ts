/**
 * Waggle Marketplace — curated local-stdio MCP registry.
 *
 * This file is an executable allowlist, not the broad discovery catalog. Every
 * entry must name a maintained upstream package, pin the exact package version
 * in both metadata and argv, and disable npm lifecycle scripts. Remote/OAuth,
 * archived, path-sensitive, and community-only servers stay discovery-only
 * until Waggle has the matching transport or configuration boundary.
 */

import type { MarketplacePackage } from './types.js';
import type { MarketplaceDB } from './db.js';

const MCP_REGISTRY_SOURCE = {
  name: 'mcp_registry',
  display_name: 'MCP Server Registry',
  url: 'https://github.com/modelcontextprotocol/servers',
  source_type: 'registry' as const,
  platform: 'npm',
  total_packages: 0,
  install_method: 'npm' as const,
  api_endpoint: null,
  description: 'Verified local-stdio MCP servers curated for Waggle',
};

/** Ensure the canonical MCP Registry source exists and return its source id. */
function ensureMcpSource(db: MarketplaceDB): number {
  const rawDb = db.getRawDb();
  const existing = rawDb
    .prepare('SELECT id FROM sources WHERE name = ?')
    .get(MCP_REGISTRY_SOURCE.name) as { id: number } | undefined;

  if (existing) return existing.id;

  const result = rawDb
    .prepare(
      `INSERT INTO sources (name, display_name, url, source_type, platform, total_packages, install_method, api_endpoint, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      MCP_REGISTRY_SOURCE.name,
      MCP_REGISTRY_SOURCE.display_name,
      MCP_REGISTRY_SOURCE.url,
      MCP_REGISTRY_SOURCE.source_type,
      MCP_REGISTRY_SOURCE.platform,
      MCP_REGISTRY_SOURCE.total_packages,
      MCP_REGISTRY_SOURCE.install_method,
      MCP_REGISTRY_SOURCE.api_endpoint,
      MCP_REGISTRY_SOURCE.description,
    );

  return result.lastInsertRowid as number;
}

export type McpServerEntry = Omit<
  Partial<MarketplacePackage>,
  'id' | 'source_id' | 'created_at' | 'updated_at'
> & {
  name: string;
  display_name: string;
  description: string;
};

/**
 * Maintained local-stdio profiles verified against official registries on
 * 2026-07-19. Exact argv is part of the security boundary consumed by
 * install-security.ts.
 */
export const MCP_SERVERS: McpServerEntry[] = [
  {
    name: 'memory',
    display_name: 'Memory (Knowledge Graph)',
    description:
      'Persistent local knowledge graph for entities, relations, and observations across conversations',
    author: 'Model Context Protocol',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '2026.7.4',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    downloads: 0,
    stars: 0,
    rating: 0,
    rating_count: 0,
    category: 'knowledge',
    subcategory: 'memory',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-memory@2026.7.4',
      mcp_config: {
        name: 'memory',
        command: 'npx',
        args: [
          '--yes',
          '--ignore-scripts',
          '@modelcontextprotocol/server-memory@2026.7.4',
        ],
      },
    },
  },
  {
    name: 'sequential-thinking',
    display_name: 'Sequential Thinking',
    description:
      'Structured problem solving with branching, revision, and hypothesis tracking',
    author: 'Model Context Protocol',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '2026.7.4',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    downloads: 0,
    stars: 0,
    rating: 0,
    rating_count: 0,
    category: 'knowledge',
    subcategory: 'reasoning',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst', 'consultant'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-sequential-thinking@2026.7.4',
      mcp_config: {
        name: 'sequential-thinking',
        command: 'npx',
        args: [
          '--yes',
          '--ignore-scripts',
          '@modelcontextprotocol/server-sequential-thinking@2026.7.4',
        ],
      },
    },
  },
  {
    name: 'brave-search',
    display_name: 'Brave Search',
    description:
      'Official Brave web and local search server using the Brave Search API',
    author: 'Brave Software',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '2.1.0',
    license: 'MPL-2.0',
    repository_url: 'https://github.com/brave/brave-search-mcp-server',
    homepage_url: 'https://github.com/brave/brave-search-mcp-server',
    downloads: 0,
    stars: 0,
    rating: 0,
    rating_count: 0,
    category: 'web',
    subcategory: 'search',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst', 'content_operator'],
    install_manifest: {
      npm_package: '@brave/brave-search-mcp-server@2.1.0',
      mcp_config: {
        name: 'brave-search',
        command: 'npx',
        args: [
          '--yes',
          '--ignore-scripts',
          '@brave/brave-search-mcp-server@2.1.0',
          '--transport',
          'stdio',
        ],
        env: { BRAVE_API_KEY: '' },
      },
    },
  },
  {
    name: 'playwright',
    display_name: 'Playwright',
    description:
      'Official Microsoft browser automation server running headless in an isolated profile',
    author: 'Microsoft',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.0.78',
    license: 'Apache-2.0',
    repository_url: 'https://github.com/microsoft/playwright-mcp',
    homepage_url: 'https://github.com/microsoft/playwright-mcp',
    downloads: 0,
    stars: 0,
    rating: 0,
    rating_count: 0,
    category: 'web',
    subcategory: 'automation',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer'],
    install_manifest: {
      npm_package: '@playwright/mcp@0.0.78',
      mcp_config: {
        name: 'playwright',
        command: 'npx',
        args: [
          '--yes',
          '--ignore-scripts',
          '@playwright/mcp@0.0.78',
          '--headless',
          '--isolated',
        ],
      },
    },
  },
  {
    name: 'chrome-devtools',
    display_name: 'Chrome DevTools',
    description:
      'Official Chrome DevTools browser automation with a slim, private, headless tool profile',
    author: 'Chrome DevTools',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '1.6.0',
    license: 'Apache-2.0',
    repository_url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    homepage_url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    downloads: 0,
    stars: 0,
    rating: 0,
    rating_count: 0,
    category: 'developer-tools',
    subcategory: 'browser-debugging',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer'],
    install_manifest: {
      npm_package: 'chrome-devtools-mcp@1.6.0',
      mcp_config: {
        name: 'chrome-devtools',
        command: 'npx',
        args: [
          '--yes',
          '--ignore-scripts',
          'chrome-devtools-mcp@1.6.0',
          '--slim',
          '--headless',
          '--isolated',
          '--no-usage-statistics',
          '--no-performance-crux',
        ],
      },
    },
  },
];

/**
 * Seed or refresh the canonical MCP rows.
 *
 * Matching is source-qualified, so a same-name third-party package cannot
 * shadow the trusted row. Existing canonical rows are fully refreshed in
 * place, preserving their id and installation foreign keys while replacing
 * every stale manifest field.
 */
export function seedMcpServers(db: MarketplaceDB): number {
  const sourceId = ensureMcpSource(db);
  const rawDb = db.getRawDb();
  const findCuratedPackage = rawDb.prepare(
    `SELECT id, version, description, waggle_install_type, install_manifest,
            repository_url, homepage_url
     FROM packages WHERE source_id = ? AND name = ?`,
  );
  const invalidateChangedScan = rawDb.prepare(
    `UPDATE packages SET
       security_status = 'unscanned',
       security_score = -1,
       last_scanned_at = NULL,
       content_hash = NULL,
       scan_engines = NULL,
       scan_findings = NULL,
       scan_blocked = 0
     WHERE id = ?`,
  );
  let added = 0;

  for (const server of MCP_SERVERS) {
    const installType = server.waggle_install_type || 'mcp';
    const version = server.version || '1.0.0';
    const installManifest = JSON.stringify(server.install_manifest);
    const existing = findCuratedPackage.get(sourceId, server.name) as {
      id: number;
      version: string;
      description: string;
      waggle_install_type: string;
      install_manifest: string;
      repository_url: string | null;
      homepage_url: string | null;
    } | undefined;
    const scanInputChanged = existing !== undefined && (
      existing.version !== version
      || existing.description !== server.description
      || existing.waggle_install_type !== installType
      || existing.install_manifest !== installManifest
      || existing.repository_url !== (server.repository_url || null)
      || existing.homepage_url !== (server.homepage_url || null)
    );

    db.upsertPackage({
      source_id: sourceId,
      name: server.name,
      display_name: server.display_name,
      description: server.description,
      author: server.author || 'community',
      package_type: server.package_type || 'mcp_server',
      waggle_install_type: installType,
      waggle_install_path: server.waggle_install_path || '.mcp.json',
      version,
      license: server.license || 'MIT',
      repository_url: server.repository_url || null,
      homepage_url: server.homepage_url || null,
      downloads: server.downloads || 0,
      stars: server.stars || 0,
      rating: server.rating || 0,
      rating_count: server.rating_count || 0,
      category: server.category || 'integration',
      subcategory: server.subcategory || null,
      platforms: JSON.stringify(server.platforms || ['waggle']),
      dependencies: JSON.stringify(server.dependencies || []),
      packs: JSON.stringify(server.packs || []),
      install_manifest: installManifest,
    });

    if (scanInputChanged) invalidateChangedScan.run(existing.id);
    if (!existing) added++;
  }

  rawDb
    .prepare('UPDATE sources SET total_packages = ? WHERE id = ?')
    .run(MCP_SERVERS.length, sourceId);

  return added;
}
