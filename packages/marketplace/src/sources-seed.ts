/**
 * Waggle Marketplace — New Source Seeding
 *
 * Seeds additional marketplace sources into the DB to expand
 * the package catalog via new adapters (awesome-list, npm, web registry, etc.).
 */

import type { MarketplaceDB } from './db';

interface NewSource {
  name: string;
  display_name: string;
  url: string;
  source_type: string;
  api_endpoint: string | null;
  total_packages: number;
}

const NEW_SOURCES: NewSource[] = [
  {
    name: 'skills-sh',
    display_name: 'Skills.sh',
    url: 'https://skills.sh/',
    source_type: 'aggregator',
    api_endpoint: 'https://skills.sh/api/skills',
    total_packages: 0,
  },
  {
    name: 'agent-skills-cc',
    display_name: 'Agent Skills CC',
    url: 'https://agent-skills.cc/',
    source_type: 'aggregator',
    api_endpoint: 'https://agent-skills.cc/api/skills',
    total_packages: 0,
  },
  {
    name: 'claude-skills-collection',
    display_name: 'Claude Skills Collection',
    url: 'https://github.com/abubakarsiddik31/claude-skills-collection',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'mcpmarket',
    display_name: 'MCP Market',
    url: 'https://mcpmarket.com/tools/skills',
    source_type: 'aggregator',
    api_endpoint: 'https://mcpmarket.com/api/tools',
    total_packages: 0,
  },
  {
    name: 'skillsdirectory',
    display_name: 'Skills Directory',
    url: 'https://www.skillsdirectory.com/',
    source_type: 'aggregator',
    api_endpoint: 'https://www.skillsdirectory.com/api/v1/skills?sort=votes',
    total_packages: 0,
  },
  {
    name: 'mcpservers-org',
    display_name: 'MCPServers.org',
    url: 'https://mcpservers.org/agent-skills',
    source_type: 'aggregator',
    api_endpoint: 'https://mcpservers.org/api/skills',
    total_packages: 0,
  },
  {
    name: 'awesome-skills-app',
    display_name: 'Awesome Skills App',
    url: 'https://awesome-skills.app/',
    source_type: 'aggregator',
    api_endpoint: 'https://awesome-skills.app/api/skills',
    total_packages: 0,
  },
  {
    name: 'awesome-mcp-servers',
    display_name: 'Awesome MCP Servers',
    url: 'https://github.com/punkpeye/awesome-mcp-servers',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'npm-mcp-servers',
    display_name: 'NPM MCP Servers',
    url: 'https://www.npmjs.com/search?q=keywords:mcp-server',
    source_type: 'npm_registry',
    api_endpoint: 'https://registry.npmjs.org/-/v1/search?text=keywords:mcp-server&size=250',
    total_packages: 0,
  },
  {
    name: 'npm-mcp-protocol',
    display_name: 'NPM MCP Protocol Servers',
    url: 'https://www.npmjs.com/search?q=%40modelcontextprotocol',
    source_type: 'npm_registry',
    api_endpoint: 'https://registry.npmjs.org/-/v1/search?text=@modelcontextprotocol&size=250',
    total_packages: 0,
  },
  // ── GitHub skill repos ─────────────────────────────────────────────
  {
    name: 'antigravity-awesome-skills',
    display_name: 'Antigravity Awesome Skills (1000+)',
    url: 'https://github.com/sickn33/antigravity-awesome-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'skillmatic-awesome-skills',
    display_name: 'Skillmatic Awesome Agent Skills',
    url: 'https://github.com/skillmatic-ai/awesome-agent-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'alirezarezvani-claude-skills',
    display_name: 'Claude Skills Collection (192+)',
    url: 'https://github.com/alirezarezvani/claude-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'microsoft-skills',
    display_name: 'Microsoft Skills (Azure SDK)',
    url: 'https://github.com/microsoft/skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'muratcankoylan-context-engineering',
    display_name: 'Context Engineering Skills',
    url: 'https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'hoodini-ai-agents-skills',
    display_name: 'AI Agents Skills (hoodini)',
    url: 'https://github.com/hoodini/ai-agents-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'hashicorp-agent-skills',
    display_name: 'HashiCorp Agent Skills',
    url: 'https://github.com/hashicorp/agent-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'supabase-agent-skills',
    display_name: 'Supabase Agent Skills',
    url: 'https://github.com/supabase/agent-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'callstack-agent-skills',
    display_name: 'Callstack React Native Skills',
    url: 'https://github.com/callstackincubator/agent-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
  {
    name: 'ckanner-agent-skills',
    display_name: 'Agent Skills (ckanner)',
    url: 'https://github.com/ckanner/agent-skills',
    source_type: 'community_repo',
    api_endpoint: null,
    total_packages: 0,
  },
];

/**
 * Seed new marketplace sources into the DB.
 * Only inserts sources that don't already exist (matched by name).
 *
 * @returns Count of newly added sources
 */
export function seedNewSources(db: MarketplaceDB): number {
  const rawDb = (db as any).db;
  let added = 0;

  for (const source of NEW_SOURCES) {
    const existing = rawDb
      .prepare('SELECT id FROM sources WHERE name = ?')
      .get(source.name) as { id: number } | undefined;

    if (existing) continue;

    rawDb
      .prepare(
        `INSERT INTO sources (name, display_name, url, source_type, platform, total_packages, install_method, api_endpoint, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        source.name,
        source.display_name,
        source.url,
        source.source_type,
        'multi',
        source.total_packages,
        'api_fetch',
        source.api_endpoint,
        `${source.display_name} — auto-seeded marketplace source`,
      );

    added++;
  }

  return added;
}

export { NEW_SOURCES };
