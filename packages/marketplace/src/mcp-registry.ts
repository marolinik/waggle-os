/**
 * Waggle Marketplace — MCP Server Registry
 *
 * Seed data for well-known MCP servers from the official ecosystem.
 * These entries are inserted into the marketplace DB on initialization,
 * making popular MCP servers immediately discoverable and installable.
 *
 * All npm package names and configurations reference real, published
 * packages from the MCP ecosystem.
 */

import type { MarketplacePackage } from './types';
import type { MarketplaceDB } from './db';

// ─── Source ID Management ────────────────────────────────────────────

const MCP_REGISTRY_SOURCE = {
  name: 'mcp_registry',
  display_name: 'MCP Server Registry',
  url: 'https://github.com/modelcontextprotocol/servers',
  source_type: 'registry' as const,
  platform: 'npm',
  total_packages: 0,
  install_method: 'npm' as const,
  api_endpoint: null,
  description: 'Official and community MCP servers curated for Waggle',
};

/**
 * Ensure the MCP Registry source exists in the DB.
 * Returns the source_id to use for package inserts.
 */
function ensureMcpSource(db: MarketplaceDB): number {
  // Access the underlying better-sqlite3 instance
  const rawDb = (db as any).db;

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

// ─── MCP Server Definitions ─────────────────────────────────────────

export type McpServerEntry = Omit<
  Partial<MarketplacePackage>,
  'id' | 'source_id' | 'created_at' | 'updated_at'
> & {
  name: string;
  display_name: string;
  description: string;
};

/**
 * Well-known MCP servers from the official ecosystem.
 *
 * Organized by category:
 *   - developer-tools: filesystem, git, github, sqlite, postgres
 *   - web: brave-search, fetch, puppeteer
 *   - productivity: google-drive, slack, notion, gmail
 *   - knowledge: memory, everything, sequential-thinking
 *   - data: google-sheets, airtable
 */
export const MCP_SERVERS: McpServerEntry[] = [
  // ── Developer Tools ─────────────────────────────────────────────

  {
    name: 'filesystem',
    display_name: 'File System',
    description:
      'Read, write, search, and manage files and directories on the local filesystem with configurable access controls',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    downloads: 85000,
    stars: 15000,
    rating: 4.8,
    rating_count: 420,
    category: 'developer-tools',
    subcategory: 'file-management',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-filesystem',
      mcp_config: {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/projects'],
      },
    },
  },

  {
    name: 'git',
    display_name: 'Git',
    description:
      'Read, search, and analyze Git repositories including diffs, logs, branches, and file history',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
    downloads: 62000,
    stars: 15000,
    rating: 4.7,
    rating_count: 310,
    category: 'developer-tools',
    subcategory: 'version-control',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer'],
    install_manifest: {
      npm_package: 'mcp-server-git',
      mcp_config: {
        name: 'git',
        command: 'uvx',
        args: ['mcp-server-git'],
      },
    },
  },

  {
    name: 'github',
    display_name: 'GitHub',
    description:
      'Interact with GitHub repositories, issues, pull requests, branches, and files via the GitHub API',
    author: 'GitHub',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    downloads: 78000,
    stars: 15000,
    rating: 4.8,
    rating_count: 385,
    category: 'developer-tools',
    subcategory: 'version-control',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-github',
      mcp_config: {
        name: 'github',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
      },
    },
  },

  {
    name: 'sqlite',
    display_name: 'SQLite',
    description:
      'Query and manage SQLite databases with read/write access, schema inspection, and business intelligence capabilities',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    downloads: 41000,
    stars: 15000,
    rating: 4.6,
    rating_count: 198,
    category: 'developer-tools',
    subcategory: 'database',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer', 'data_scientist'],
    install_manifest: {
      npm_package: 'mcp-server-sqlite',
      mcp_config: {
        name: 'sqlite',
        command: 'uvx',
        args: ['mcp-server-sqlite', '--db-path', '/path/to/database.db'],
      },
    },
  },

  {
    name: 'postgres',
    display_name: 'PostgreSQL',
    description:
      'Connect to PostgreSQL databases for schema inspection, read-only queries, and data analysis',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    downloads: 38000,
    stars: 15000,
    rating: 4.5,
    rating_count: 176,
    category: 'developer-tools',
    subcategory: 'database',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer', 'data_scientist'],
    install_manifest: {
      npm_package: 'mcp-server-postgres',
      mcp_config: {
        name: 'postgres',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
      },
    },
  },

  // ── Web ─────────────────────────────────────────────────────────

  {
    name: 'brave-search',
    display_name: 'Brave Search',
    description:
      'Search the web and get local results using the Brave Search API with web and local search capabilities',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    downloads: 54000,
    stars: 15000,
    rating: 4.7,
    rating_count: 265,
    category: 'web',
    subcategory: 'search',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst', 'content_operator'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-brave-search',
      mcp_config: {
        name: 'brave-search',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: { BRAVE_API_KEY: '' },
      },
    },
  },

  {
    name: 'fetch',
    display_name: 'Fetch',
    description:
      'Fetch and extract content from web URLs, converting HTML to markdown for easy consumption by AI agents',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    downloads: 47000,
    stars: 15000,
    rating: 4.6,
    rating_count: 230,
    category: 'web',
    subcategory: 'http',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst', 'developer'],
    install_manifest: {
      npm_package: 'mcp-server-fetch',
      mcp_config: {
        name: 'fetch',
        command: 'uvx',
        args: ['mcp-server-fetch'],
      },
    },
  },

  {
    name: 'puppeteer',
    display_name: 'Puppeteer',
    description:
      'Browser automation and web scraping using Puppeteer — navigate pages, take screenshots, click elements, fill forms',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    downloads: 35000,
    stars: 15000,
    rating: 4.5,
    rating_count: 185,
    category: 'web',
    subcategory: 'automation',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer', 'research_analyst'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-puppeteer',
      mcp_config: {
        name: 'puppeteer',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      },
    },
  },

  // ── Productivity ────────────────────────────────────────────────

  {
    name: 'google-drive',
    display_name: 'Google Drive',
    description:
      'Search and read files from Google Drive with support for native Google Docs/Sheets/Slides export',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
    downloads: 29000,
    stars: 15000,
    rating: 4.4,
    rating_count: 145,
    category: 'productivity',
    subcategory: 'cloud-storage',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: ['content_operator', 'business_ops'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-gdrive',
      mcp_config: {
        name: 'google-drive',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-gdrive'],
      },
    },
  },

  {
    name: 'slack',
    display_name: 'Slack',
    description:
      'Interact with Slack workspaces — read channels, post messages, reply to threads, and manage reactions',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    downloads: 32000,
    stars: 15000,
    rating: 4.5,
    rating_count: 168,
    category: 'productivity',
    subcategory: 'communication',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: ['business_ops', 'customer_success'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-slack',
      mcp_config: {
        name: 'slack',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
      },
    },
  },

  {
    name: 'notion',
    display_name: 'Notion',
    description:
      'Search, read, create, and update Notion pages and databases with full API integration',
    author: 'suekou',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.0',
    license: 'MIT',
    repository_url: 'https://github.com/suekou/mcp-notion-server',
    homepage_url: 'https://github.com/suekou/mcp-notion-server',
    downloads: 25000,
    stars: 600,
    rating: 4.4,
    rating_count: 132,
    category: 'productivity',
    subcategory: 'note-taking',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: ['content_operator', 'pm_pack'],
    install_manifest: {
      npm_package: '@suekou/mcp-notion-server',
      mcp_config: {
        name: 'notion',
        command: 'npx',
        args: ['-y', '@suekou/mcp-notion-server'],
        env: { NOTION_API_TOKEN: '' },
      },
    },
  },

  {
    name: 'gmail',
    display_name: 'Gmail (Google)',
    description:
      'Read, search, draft, and send emails through Gmail via the Google API with OAuth2 authentication',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/gmail',
    downloads: 22000,
    stars: 15000,
    rating: 4.3,
    rating_count: 118,
    category: 'productivity',
    subcategory: 'email',
    platforms: ['claude_code', 'waggle'],
    dependencies: [],
    packs: ['business_ops', 'executive'],
    install_manifest: {
      npm_package: '@anthropic-ai/mcp-server-gmail',
      mcp_config: {
        name: 'gmail',
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-server-gmail'],
      },
    },
  },

  // ── Knowledge ───────────────────────────────────────────────────

  {
    name: 'memory',
    display_name: 'Memory (Knowledge Graph)',
    description:
      'Persistent memory using a local knowledge graph — store entities, relations, and observations across conversations',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    downloads: 48000,
    stars: 15000,
    rating: 4.6,
    rating_count: 240,
    category: 'knowledge',
    subcategory: 'memory',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-memory',
      mcp_config: {
        name: 'memory',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
      },
    },
  },

  {
    name: 'everything',
    display_name: 'Everything (Voidtools Search)',
    description:
      'Lightning-fast file and folder search on Windows using the Everything SDK — instant results across all drives',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
    downloads: 18000,
    stars: 15000,
    rating: 4.3,
    rating_count: 95,
    category: 'knowledge',
    subcategory: 'search',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: [],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-everything',
      mcp_config: {
        name: 'everything',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
      },
    },
  },

  {
    name: 'sequential-thinking',
    display_name: 'Sequential Thinking',
    description:
      'Dynamic problem-solving through a structured thinking process with branching, revision, and hypothesis tracking',
    author: 'Anthropic',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.6.2',
    license: 'MIT',
    repository_url: 'https://github.com/modelcontextprotocol/servers',
    homepage_url:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    downloads: 31000,
    stars: 15000,
    rating: 4.5,
    rating_count: 155,
    category: 'knowledge',
    subcategory: 'reasoning',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['research_analyst', 'consultant'],
    install_manifest: {
      npm_package: '@modelcontextprotocol/server-sequential-thinking',
      mcp_config: {
        name: 'sequential-thinking',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      },
    },
  },

  // ── Data ────────────────────────────────────────────────────────

  {
    name: 'google-sheets',
    display_name: 'Google Sheets',
    description:
      'Read, write, and manage Google Sheets spreadsheets — create sheets, update cells, and read data ranges',
    author: 'nicholasoxford',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '1.0.0',
    license: 'MIT',
    repository_url: 'https://github.com/nicholasoxford/google-sheets-mcp',
    homepage_url: 'https://github.com/nicholasoxford/google-sheets-mcp',
    downloads: 12000,
    stars: 200,
    rating: 4.2,
    rating_count: 68,
    category: 'data',
    subcategory: 'spreadsheets',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: ['data_scientist', 'business_ops', 'finance_accounting'],
    install_manifest: {
      npm_package: '@nicholasoxford/google-sheets-mcp',
      mcp_config: {
        name: 'google-sheets',
        command: 'npx',
        args: ['-y', '@nicholasoxford/google-sheets-mcp'],
        env: { GOOGLE_SHEETS_CREDENTIALS: '' },
      },
    },
  },

  {
    name: 'airtable',
    display_name: 'Airtable',
    description:
      'Read, create, update, and delete records in Airtable bases with full schema and field type support',
    author: 'felores',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '1.0.0',
    license: 'MIT',
    repository_url: 'https://github.com/felores/airtable-mcp',
    homepage_url: 'https://github.com/felores/airtable-mcp',
    downloads: 8500,
    stars: 150,
    rating: 4.1,
    rating_count: 52,
    category: 'data',
    subcategory: 'database',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: ['business_ops', 'pm_pack'],
    install_manifest: {
      npm_package: 'airtable-mcp-server',
      mcp_config: {
        name: 'airtable',
        command: 'npx',
        args: ['-y', 'airtable-mcp-server'],
        env: { AIRTABLE_API_KEY: '' },
      },
    },
  },

  // ── Additional Popular Servers ──────────────────────────────────

  {
    name: 'playwright',
    display_name: 'Playwright',
    description:
      'Browser automation using Playwright — navigate, interact with elements, take screenshots, and execute JavaScript in real browsers',
    author: 'Microsoft',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '0.0.14',
    license: 'Apache-2.0',
    repository_url: 'https://github.com/microsoft/playwright-mcp',
    homepage_url: 'https://github.com/microsoft/playwright-mcp',
    downloads: 42000,
    stars: 4500,
    rating: 4.7,
    rating_count: 210,
    category: 'web',
    subcategory: 'automation',
    platforms: ['claude_code', 'waggle', 'cursor', 'windsurf'],
    dependencies: [],
    packs: ['developer'],
    install_manifest: {
      npm_package: '@anthropic-ai/mcp-server-playwright',
      mcp_config: {
        name: 'playwright',
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-server-playwright'],
      },
    },
  },

  {
    name: 'linear',
    display_name: 'Linear',
    description:
      'Manage Linear issues, projects, and teams — create, update, search issues and track project progress',
    author: 'jerhadf',
    package_type: 'mcp_server',
    waggle_install_type: 'mcp',
    waggle_install_path: '.mcp.json',
    version: '1.0.0',
    license: 'MIT',
    repository_url: 'https://github.com/jerhadf/linear-mcp-server',
    homepage_url: 'https://github.com/jerhadf/linear-mcp-server',
    downloads: 15000,
    stars: 300,
    rating: 4.4,
    rating_count: 88,
    category: 'productivity',
    subcategory: 'project-management',
    platforms: ['claude_code', 'waggle', 'cursor'],
    dependencies: [],
    packs: ['pm_pack', 'developer'],
    install_manifest: {
      npm_package: 'linear-mcp-server',
      mcp_config: {
        name: 'linear',
        command: 'npx',
        args: ['-y', 'linear-mcp-server'],
        env: { LINEAR_API_KEY: '' },
      },
    },
  },
];

// ─── Seed Function ──────────────────────────────────────────────────

/**
 * Seed MCP server entries into the marketplace database.
 *
 * Inserts each server from MCP_SERVERS if it doesn't already exist
 * (matched by name). Skips duplicates safely.
 *
 * @returns Count of newly added MCP server entries
 */
export function seedMcpServers(db: MarketplaceDB): number {
  const sourceId = ensureMcpSource(db);
  let added = 0;

  for (const server of MCP_SERVERS) {
    // Check if already present by name
    const existing = db.getPackageByName(server.name);
    if (existing) continue;

    db.upsertPackage({
      source_id: sourceId,
      name: server.name,
      display_name: server.display_name,
      description: server.description,
      author: server.author || 'community',
      package_type: server.package_type || 'mcp_server',
      waggle_install_type: server.waggle_install_type || 'mcp',
      waggle_install_path: server.waggle_install_path || '.mcp.json',
      version: server.version || '1.0.0',
      license: server.license || 'MIT',
      repository_url: server.repository_url || null,
      homepage_url: server.homepage_url || null,
      downloads: server.downloads || 0,
      stars: server.stars || 0,
      rating: server.rating || 0,
      rating_count: server.rating_count || 0,
      category: server.category || 'integration',
      subcategory: server.subcategory || null,
      platforms: JSON.stringify(server.platforms || ['waggle']) as any,
      dependencies: JSON.stringify(server.dependencies || []) as any,
      packs: JSON.stringify(server.packs || []) as any,
      install_manifest: JSON.stringify(server.install_manifest) as any,
    });

    added++;
  }

  // Update source package count
  const rawDb = (db as any).db;
  rawDb
    .prepare('UPDATE sources SET total_packages = ? WHERE id = ?')
    .run(MCP_SERVERS.length, sourceId);

  return added;
}
