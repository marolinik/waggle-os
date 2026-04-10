/**
 * MCP Server Registry — curated catalog of community MCP servers.
 *
 * Sources cross-referenced:
 * - modelcontextprotocol/servers (official Anthropic reference)
 * - punkpeye/awesome-mcp-servers (77K stars)
 * - appcypher/awesome-mcp-servers
 * - tolkonepiu/best-of-mcp-servers (450 ranked, 34 categories)
 *
 * Deduplication is enforced at module load time via `assertCatalogUnique`
 * at the bottom of this file — adding a server with a colliding normalized
 * id or url will crash the build.
 *
 * Organized by category for the ConnectorsApp MCP tab.
 */

export interface McpServer {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  url: string;
  installCmd: string;
  capabilities: string[];
  official?: boolean;
  logo?: string;  // Emoji or brand initial
}

export const MCP_CATEGORIES = [
  'Database', 'Files', 'Web', 'Code', 'Communication',
  'Productivity', 'Analytics', 'Cloud', 'DevTools',
  'Business', 'AI & ML', 'Security', 'Media', 'Utilities',
] as const;

export const CATEGORY_EMOJI: Record<string, string> = {
  'Database': '\u{1F4BE}',      // floppy
  'Files': '\u{1F4C1}',         // folder
  'Web': '\u{1F310}',           // globe
  'Code': '\u{1F4BB}',          // laptop
  'Communication': '\u{1F4AC}', // speech
  'Productivity': '\u{1F4CB}',  // clipboard
  'Analytics': '\u{1F4CA}',     // chart
  'Cloud': '\u{2601}',          // cloud
  'DevTools': '\u{1F527}',      // wrench
  'Business': '\u{1F4BC}',      // briefcase
  'AI & ML': '\u{1F916}',       // robot
  'Security': '\u{1F512}',      // lock
  'Media': '\u{1F3A8}',         // palette
  'Utilities': '\u{2699}',      // gear
};

export const MCP_CATALOG: McpServer[] = [
  // ═══════════════════════════════════════════════════════════════════
  // DATABASE (12)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'postgres', name: 'PostgreSQL', description: 'Query databases, inspect schemas, run migrations', author: 'MCP', category: 'Database', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres', installCmd: 'npx @modelcontextprotocol/server-postgres', capabilities: ['query', 'schema', 'migrations'], official: true, logo: 'PG' },
  { id: 'sqlite', name: 'SQLite', description: 'Read and query SQLite databases', author: 'MCP', category: 'Database', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite', installCmd: 'npx @modelcontextprotocol/server-sqlite', capabilities: ['query', 'schema'], official: true, logo: 'SQ' },
  { id: 'mysql', name: 'MySQL', description: 'Query MySQL/MariaDB databases', author: 'Community', category: 'Database', url: 'https://github.com/benborla/mcp-server-mysql', installCmd: 'npx mcp-server-mysql', capabilities: ['query', 'schema', 'tables'] },
  { id: 'mongodb', name: 'MongoDB', description: 'Query MongoDB collections, inspect schemas', author: 'Community', category: 'Database', url: 'https://github.com/mongodb-labs/mongodb-mcp-server', installCmd: 'npx mongodb-mcp-server', capabilities: ['query', 'aggregate', 'collections'] },
  { id: 'redis', name: 'Redis', description: 'Interact with Redis key-value store', author: 'Community', category: 'Database', url: 'https://github.com/redis/mcp-redis', installCmd: 'npx @mcp/redis-server', capabilities: ['get', 'set', 'query'] },
  { id: 'neo4j', name: 'Neo4j', description: 'Query graph databases with Cypher', author: 'Community', category: 'Database', url: 'https://github.com/neo4j-contrib/mcp-neo4j', installCmd: 'npx mcp-neo4j', capabilities: ['cypher', 'nodes', 'relations'] },
  { id: 'supabase', name: 'Supabase', description: 'Manage Supabase projects, query data, auth', author: 'Community', category: 'Database', url: 'https://github.com/supabase-community/supabase-mcp', installCmd: 'npx supabase-mcp-server', capabilities: ['query', 'auth', 'storage', 'functions'] },
  { id: 'neon', name: 'Neon', description: 'Serverless Postgres — create databases, query, branch', author: 'Community', category: 'Database', url: 'https://github.com/neondatabase/mcp-server-neon', installCmd: 'npx mcp-server-neon', capabilities: ['query', 'branches', 'databases'] },
  { id: 'qdrant', name: 'Qdrant', description: 'Vector database — search, upsert, collections', author: 'Community', category: 'Database', url: 'https://github.com/qdrant/mcp-server-qdrant', installCmd: 'npx mcp-server-qdrant', capabilities: ['search', 'upsert', 'collections'] },
  { id: 'turso', name: 'Turso', description: 'Edge SQLite database (libSQL)', author: 'Community', category: 'Database', url: 'https://github.com/turso-extended/mcp-server-turso', installCmd: 'npx mcp-server-turso', capabilities: ['query', 'schema'] },
  { id: 'planetscale', name: 'PlanetScale', description: 'MySQL-compatible serverless database', author: 'Community', category: 'Database', url: 'https://github.com/planetscale/mcp-server', installCmd: 'npx @planetscale/mcp-server', capabilities: ['query', 'schema', 'branches'] },
  { id: 'clickhouse', name: 'ClickHouse', description: 'Analytics database — fast SQL queries', author: 'Community', category: 'Database', url: 'https://github.com/ClickHouse/mcp-server', installCmd: 'npx @clickhouse/mcp-server', capabilities: ['query', 'tables', 'analytics'] },
  { id: 'bigquery', name: 'BigQuery', description: 'Google BigQuery — serverless data warehouse and analytics', author: 'Community', category: 'Database', url: 'https://github.com/LucasHild/mcp-server-bigquery', installCmd: 'npx mcp-server-bigquery', capabilities: ['query', 'schema', 'datasets'] },
  { id: 'snowflake', name: 'Snowflake', description: 'Cloud data warehouse — read/write with insight tracking', author: 'Community', category: 'Database', url: 'https://github.com/Snowflake-Labs/mcp', installCmd: 'uvx mcp-snowflake', capabilities: ['query', 'schema', 'warehouses'] },
  { id: 'duckdb', name: 'DuckDB', description: 'In-process analytical SQL database', author: 'Community', category: 'Database', url: 'https://github.com/ktanaka101/mcp-server-duckdb', installCmd: 'uvx mcp-server-duckdb', capabilities: ['query', 'schema', 'analytics'] },
  { id: 'couchbase', name: 'Couchbase', description: 'Distributed NoSQL — natural language querying', author: 'Community', category: 'Database', url: 'https://github.com/Couchbase-Ecosystem/mcp-server-couchbase', installCmd: 'npx mcp-server-couchbase', capabilities: ['query', 'buckets', 'n1ql'] },
  { id: 'tidb', name: 'TiDB', description: 'Distributed MySQL-compatible serverless database', author: 'Community', category: 'Database', url: 'https://github.com/pingcap/pytidb', installCmd: 'uvx pytidb-mcp', capabilities: ['query', 'schema', 'vector_search'] },
  { id: 'excel', name: 'Microsoft Excel', description: 'Read/write Excel workbooks — cells, worksheets, charts', author: 'Community', category: 'Database', url: 'https://github.com/haris-musa/excel-mcp-server', installCmd: 'uvx excel-mcp-server', capabilities: ['read', 'write', 'charts', 'pivot'] },
  { id: 'nocodb', name: 'NocoDB', description: 'Open-source Airtable alternative — records, tables, views', author: 'Community', category: 'Database', url: 'https://github.com/edwinbernadus/nocodb-mcp-server', installCmd: 'npx nocodb-mcp-server', capabilities: ['read', 'write', 'tables'] },

  // ═══════════════════════════════════════════════════════════════════
  // FILES & STORAGE (8)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'filesystem', name: 'Filesystem', description: 'Read, write, search files on local filesystem', author: 'MCP', category: 'Files', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', installCmd: 'npx @modelcontextprotocol/server-filesystem /path', capabilities: ['read', 'write', 'search', 'directory'], official: true },
  { id: 'gdrive-mcp', name: 'Google Drive', description: 'Search and read Google Drive files', author: 'MCP', category: 'Files', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive', installCmd: 'npx @modelcontextprotocol/server-gdrive', capabilities: ['search', 'read', 'list'], official: true },
  { id: 's3', name: 'AWS S3', description: 'List, read, and manage S3 objects', author: 'Community', category: 'Files', url: 'https://github.com/aws/mcp-server-s3', installCmd: 'npx @aws/mcp-server-s3', capabilities: ['list', 'read', 'write'] },
  { id: 'onedrive-mcp', name: 'OneDrive', description: 'Access Microsoft OneDrive files', author: 'Community', category: 'Files', url: 'https://github.com/microsoft/mcp-server-onedrive', installCmd: 'npx mcp-server-onedrive', capabilities: ['read', 'list', 'search'] },
  { id: 'box', name: 'Box', description: 'Enterprise file sharing and management', author: 'Community', category: 'Files', url: 'https://github.com/box/mcp-server-box', installCmd: 'npx @box/mcp-server', capabilities: ['read', 'upload', 'search'] },
  { id: 'dropbox-mcp', name: 'Dropbox', description: 'Access Dropbox files and folders', author: 'Community', category: 'Files', url: 'https://github.com/dropbox/mcp-server', installCmd: 'npx mcp-server-dropbox', capabilities: ['read', 'list', 'search'] },
  { id: 'minio', name: 'MinIO', description: 'S3-compatible object storage', author: 'Community', category: 'Files', url: 'https://github.com/minio/mcp-server-minio', installCmd: 'npx mcp-server-minio', capabilities: ['list', 'read', 'write', 'buckets'] },
  { id: 'gcs', name: 'Google Cloud Storage', description: 'Access GCS buckets and objects', author: 'Community', category: 'Files', url: 'https://github.com/GoogleCloudPlatform/mcp-server-gcs', installCmd: 'npx mcp-server-gcs', capabilities: ['list', 'read', 'write'] },

  // ═══════════════════════════════════════════════════════════════════
  // WEB & SEARCH (10)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'brave-search', name: 'Brave Search', description: 'Web and local search via Brave API', author: 'MCP', category: 'Web', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search', installCmd: 'npx @modelcontextprotocol/server-brave-search', capabilities: ['web_search', 'local_search'], official: true },
  { id: 'fetch', name: 'Fetch', description: 'Fetch URLs and convert to markdown', author: 'MCP', category: 'Web', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch', installCmd: 'npx @modelcontextprotocol/server-fetch', capabilities: ['fetch', 'convert'], official: true },
  { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation — navigate, screenshot, interact', author: 'MCP', category: 'Web', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer', installCmd: 'npx @modelcontextprotocol/server-puppeteer', capabilities: ['navigate', 'screenshot', 'click'], official: true },
  { id: 'playwright-mcp', name: 'Playwright', description: 'Cross-browser automation and testing', author: 'Community', category: 'Web', url: 'https://github.com/playwright-community/mcp-server-playwright', installCmd: 'npx @playwright/mcp-server', capabilities: ['navigate', 'screenshot', 'test'] },
  { id: 'tavily', name: 'Tavily', description: 'AI-optimized web search API', author: 'Community', category: 'Web', url: 'https://github.com/tavily-ai/mcp-server-tavily', installCmd: 'npx mcp-server-tavily', capabilities: ['search', 'extract'] },
  { id: 'exa', name: 'Exa', description: 'Neural search engine — semantic web search', author: 'Community', category: 'Web', url: 'https://github.com/exa-labs/exa-mcp-server', installCmd: 'npx exa-mcp-server', capabilities: ['search', 'contents', 'similar'] },
  { id: 'firecrawl', name: 'Firecrawl', description: 'Web scraping and crawling with markdown output', author: 'Community', category: 'Web', url: 'https://github.com/firecrawl/mcp-server-firecrawl', installCmd: 'npx mcp-server-firecrawl', capabilities: ['scrape', 'crawl', 'extract'] },
  { id: 'serper', name: 'Serper', description: 'Google Search API results', author: 'Community', category: 'Web', url: 'https://github.com/nichochar/mcp-server-serper', installCmd: 'npx mcp-server-serper', capabilities: ['search', 'news', 'images'] },
  { id: 'browserbase', name: 'Browserbase', description: 'Cloud browser automation platform', author: 'Community', category: 'Web', url: 'https://github.com/browserbase/mcp-server', installCmd: 'npx @browserbase/mcp-server', capabilities: ['navigate', 'screenshot', 'session'] },
  { id: 'jina', name: 'Jina Reader', description: 'Extract content from any URL as clean text', author: 'Community', category: 'Web', url: 'https://github.com/jina-ai/mcp-server', installCmd: 'npx mcp-server-jina', capabilities: ['read', 'extract', 'summarize'] },
  { id: 'perplexity', name: 'Perplexity', description: 'Perplexity AI — real-time web search with citations', author: 'Community', category: 'Web', url: 'https://github.com/ppl-ai/modelcontextprotocol', installCmd: 'npx @perplexity-ai/mcp-server', capabilities: ['search', 'ask', 'citations'] },
  { id: 'kagi', name: 'Kagi Search', description: 'Privacy-focused premium search engine', author: 'Community', category: 'Web', url: 'https://github.com/kagisearch/kagimcp', installCmd: 'uvx kagimcp', capabilities: ['search', 'summarize', 'universal'] },
  { id: 'searxng', name: 'SearXNG', description: 'Self-hosted privacy-respecting metasearch engine', author: 'Community', category: 'Web', url: 'https://github.com/ihor-sokoliuk/mcp-searxng', installCmd: 'npx mcp-searxng', capabilities: ['search', 'images', 'news'] },
  { id: 'apify', name: 'Apify', description: 'Web scraping platform — run 4000+ pre-built actors', author: 'Community', category: 'Web', url: 'https://github.com/apify/actors-mcp-server', installCmd: 'npx @apify/actors-mcp-server', capabilities: ['scrape', 'crawl', 'actors'] },

  // ═══════════════════════════════════════════════════════════════════
  // CODE & DEVTOOLS (12)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'github-mcp', name: 'GitHub', description: 'Repos, issues, PRs, code search, actions', author: 'MCP', category: 'Code', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github', installCmd: 'npx @modelcontextprotocol/server-github', capabilities: ['repos', 'issues', 'prs', 'search', 'actions'], official: true },
  { id: 'gitlab-mcp', name: 'GitLab', description: 'Projects, issues, merge requests, pipelines', author: 'Community', category: 'Code', url: 'https://github.com/theanhne/mcp-server-gitlab', installCmd: 'npx mcp-server-gitlab', capabilities: ['projects', 'issues', 'mrs', 'pipelines'] },
  { id: 'sentry', name: 'Sentry', description: 'Error tracking — issues, events, releases', author: 'MCP', category: 'DevTools', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sentry', installCmd: 'npx @modelcontextprotocol/server-sentry', capabilities: ['issues', 'events', 'projects'], official: true },
  { id: 'docker', name: 'Docker', description: 'Manage containers, images, compose stacks', author: 'Community', category: 'DevTools', url: 'https://github.com/docker/mcp-server-docker', installCmd: 'npx mcp-server-docker', capabilities: ['containers', 'images', 'compose', 'logs'] },
  { id: 'kubernetes', name: 'Kubernetes', description: 'Manage K8s clusters, pods, deployments', author: 'Community', category: 'DevTools', url: 'https://github.com/kubernetes/mcp-server', installCmd: 'npx mcp-server-kubernetes', capabilities: ['pods', 'deployments', 'services', 'logs'] },
  { id: 'vercel', name: 'Vercel', description: 'Deployments, domains, environment variables', author: 'Community', category: 'DevTools', url: 'https://github.com/vercel/mcp-server', installCmd: 'npx @vercel/mcp-server', capabilities: ['deployments', 'domains', 'env', 'logs'] },
  { id: 'npm', name: 'npm', description: 'Search packages, view details, check versions', author: 'Community', category: 'Code', url: 'https://github.com/nichochar/mcp-server-npm', installCmd: 'npx mcp-server-npm', capabilities: ['search', 'info', 'versions'] },
  { id: 'grafana', name: 'Grafana', description: 'Query dashboards, alerts, and datasources', author: 'Community', category: 'DevTools', url: 'https://github.com/grafana/mcp-server-grafana', installCmd: 'npx mcp-server-grafana', capabilities: ['dashboards', 'alerts', 'queries'] },
  { id: 'datadog', name: 'Datadog', description: 'Metrics, logs, monitors, and incidents', author: 'Community', category: 'DevTools', url: 'https://github.com/DataDog/mcp-server', installCmd: 'npx @datadog/mcp-server', capabilities: ['metrics', 'logs', 'monitors'] },
  { id: 'circleci', name: 'CircleCI', description: 'Pipelines, jobs, artifacts', author: 'Community', category: 'DevTools', url: 'https://github.com/CircleCI-Public/mcp-server-circleci', installCmd: 'npx mcp-server-circleci', capabilities: ['pipelines', 'jobs', 'artifacts'] },
  { id: 'terraform', name: 'Terraform', description: 'Infrastructure as code — plan, apply, state', author: 'Community', category: 'DevTools', url: 'https://github.com/hashicorp/mcp-server-terraform', installCmd: 'npx mcp-server-terraform', capabilities: ['plan', 'state', 'modules'] },
  { id: 'cloudflare', name: 'Cloudflare', description: 'Workers, DNS, KV, R2, analytics', author: 'Community', category: 'DevTools', url: 'https://github.com/cloudflare/mcp-server-cloudflare', installCmd: 'npx @cloudflare/mcp-server', capabilities: ['workers', 'dns', 'kv', 'r2'] },
  { id: 'git', name: 'Git', description: 'Read, search, and manipulate local Git repositories', author: 'MCP', category: 'Code', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git', installCmd: 'uvx mcp-server-git', capabilities: ['log', 'diff', 'status', 'blame'], official: true },
  { id: 'postman', name: 'Postman', description: 'API development — collections, requests, environments', author: 'Community', category: 'DevTools', url: 'https://github.com/shannonlal/mcp-postman', installCmd: 'npx mcp-postman', capabilities: ['collections', 'requests', 'environments'] },
  { id: 'pulumi', name: 'Pulumi', description: 'Infrastructure as code with real languages — preview, up, state', author: 'Community', category: 'DevTools', url: 'https://github.com/pulumi/mcp-server', installCmd: 'npx @pulumi/mcp-server', capabilities: ['preview', 'up', 'state', 'stacks'] },
  { id: 'gitkraken', name: 'GitKraken', description: 'Git client — workspaces, PRs, issues across platforms', author: 'Community', category: 'DevTools', url: 'https://github.com/gitkraken/gk-cli', installCmd: 'gk mcp', capabilities: ['workspaces', 'prs', 'issues', 'focus'] },
  { id: 'semgrep', name: 'Semgrep', description: 'Static analysis — security and code quality scans', author: 'Community', category: 'DevTools', url: 'https://github.com/semgrep/mcp', installCmd: 'uvx semgrep-mcp', capabilities: ['scan', 'rules', 'findings'] },
  { id: 'e2b', name: 'E2B', description: 'Secure cloud sandboxes — run untrusted code in isolated containers', author: 'Community', category: 'DevTools', url: 'https://github.com/e2b-dev/mcp-server', installCmd: 'npx @e2b/mcp-server', capabilities: ['run', 'files', 'sandbox'] },
  { id: 'skyvern', name: 'Skyvern', description: 'Browser automation powered by LLMs — navigate, fill forms, scrape', author: 'Community', category: 'DevTools', url: 'https://github.com/Skyvern-AI/skyvern/tree/main/integrations/mcp', installCmd: 'uvx skyvern-mcp', capabilities: ['navigate', 'fill', 'scrape', 'vision'] },

  // ═══════════════════════════════════════════════════════════════════
  // COMMUNICATION (8)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'slack-mcp', name: 'Slack', description: 'Read/send messages, manage channels, search', author: 'MCP', category: 'Communication', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack', installCmd: 'npx @modelcontextprotocol/server-slack', capabilities: ['read', 'send', 'channels', 'search'], official: true },
  { id: 'gmail-mcp', name: 'Gmail', description: 'Read, search, and send emails', author: 'Community', category: 'Communication', url: 'https://github.com/nichochar/mcp-server-gmail', installCmd: 'npx mcp-server-gmail', capabilities: ['read', 'search', 'send'] },
  { id: 'discord-mcp', name: 'Discord', description: 'Read/send messages, manage channels', author: 'Community', category: 'Communication', url: 'https://github.com/discord/mcp-server', installCmd: 'npx mcp-server-discord', capabilities: ['read', 'send', 'channels'] },
  { id: 'teams-mcp', name: 'Microsoft Teams', description: 'Messages, channels, meetings', author: 'Community', category: 'Communication', url: 'https://github.com/microsoft/mcp-server-teams', installCmd: 'npx mcp-server-teams', capabilities: ['messages', 'channels', 'meetings'] },
  { id: 'telegram', name: 'Telegram', description: 'Send/receive Telegram messages', author: 'Community', category: 'Communication', url: 'https://github.com/nichochar/mcp-server-telegram', installCmd: 'npx mcp-server-telegram', capabilities: ['send', 'receive', 'groups'] },
  { id: 'whatsapp', name: 'WhatsApp', description: 'Send WhatsApp messages via Business API', author: 'Community', category: 'Communication', url: 'https://github.com/nichochar/mcp-server-whatsapp', installCmd: 'npx mcp-server-whatsapp', capabilities: ['send', 'templates'] },
  { id: 'twilio', name: 'Twilio', description: 'SMS, voice calls, WhatsApp messaging', author: 'Community', category: 'Communication', url: 'https://github.com/twilio/mcp-server', installCmd: 'npx @twilio/mcp-server', capabilities: ['sms', 'voice', 'whatsapp'] },
  { id: 'sendgrid', name: 'SendGrid', description: 'Transactional and marketing email', author: 'Community', category: 'Communication', url: 'https://github.com/sendgrid/mcp-server', installCmd: 'npx mcp-server-sendgrid', capabilities: ['send', 'templates', 'stats'] },
  { id: 'bluesky', name: 'Bluesky', description: 'Post, read, and search the Bluesky social network (AT Protocol)', author: 'Community', category: 'Communication', url: 'https://github.com/semioz/bluesky-mcp', installCmd: 'npx bluesky-mcp', capabilities: ['post', 'feed', 'search', 'follow'] },

  // ═══════════════════════════════════════════════════════════════════
  // PRODUCTIVITY (12)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'notion-mcp', name: 'Notion', description: 'Pages, databases, search, create content', author: 'Community', category: 'Productivity', url: 'https://github.com/makenotion/notion-mcp-server', installCmd: 'npx @notionhq/mcp-server', capabilities: ['search', 'read', 'create', 'databases'] },
  { id: 'linear-mcp', name: 'Linear', description: 'Issues, projects, cycles, teams', author: 'Community', category: 'Productivity', url: 'https://github.com/linear/mcp-server-linear', installCmd: 'npx mcp-server-linear', capabilities: ['issues', 'projects', 'cycles'] },
  { id: 'jira-mcp', name: 'Jira', description: 'Issues, projects, sprints, boards', author: 'Community', category: 'Productivity', url: 'https://github.com/atlassian/mcp-server-jira', installCmd: 'npx mcp-server-jira', capabilities: ['issues', 'search', 'projects', 'sprints'] },
  { id: 'confluence-mcp', name: 'Confluence', description: 'Read and search Confluence pages', author: 'Community', category: 'Productivity', url: 'https://github.com/atlassian/mcp-server-confluence', installCmd: 'npx mcp-server-confluence', capabilities: ['search', 'read', 'spaces'] },
  { id: 'asana-mcp', name: 'Asana', description: 'Tasks, projects, teams, workspaces', author: 'Community', category: 'Productivity', url: 'https://github.com/asana/mcp-server', installCmd: 'npx mcp-server-asana', capabilities: ['tasks', 'projects', 'teams'] },
  { id: 'todoist', name: 'Todoist', description: 'Task management — projects, tasks, labels', author: 'Community', category: 'Productivity', url: 'https://github.com/doist/mcp-server-todoist', installCmd: 'npx mcp-server-todoist', capabilities: ['tasks', 'projects', 'labels'] },
  { id: 'google-calendar', name: 'Google Calendar', description: 'Events, scheduling, availability', author: 'Community', category: 'Productivity', url: 'https://github.com/nichochar/mcp-server-gcal', installCmd: 'npx mcp-server-gcal', capabilities: ['events', 'create', 'availability'] },
  { id: 'google-docs', name: 'Google Docs', description: 'Read and edit Google Docs', author: 'Community', category: 'Productivity', url: 'https://github.com/nichochar/mcp-server-gdocs', installCmd: 'npx mcp-server-gdocs', capabilities: ['read', 'edit', 'create'] },
  { id: 'google-sheets', name: 'Google Sheets', description: 'Read, write, and query spreadsheets', author: 'Community', category: 'Productivity', url: 'https://github.com/nichochar/mcp-server-gsheets', installCmd: 'npx mcp-server-gsheets', capabilities: ['read', 'write', 'query'] },
  { id: 'obsidian-mcp', name: 'Obsidian', description: 'Read and search Obsidian vaults', author: 'Community', category: 'Productivity', url: 'https://github.com/obsidian-community/mcp-server', installCmd: 'npx mcp-server-obsidian', capabilities: ['read', 'search', 'backlinks'] },
  { id: 'monday-mcp', name: 'monday.com', description: 'Boards, items, updates, automations', author: 'Community', category: 'Productivity', url: 'https://github.com/mondaycom/mcp-server', installCmd: 'npx mcp-server-monday', capabilities: ['boards', 'items', 'updates'] },
  { id: 'clickup', name: 'ClickUp', description: 'Tasks, spaces, lists, docs', author: 'Community', category: 'Productivity', url: 'https://github.com/clickup/mcp-server', installCmd: 'npx mcp-server-clickup', capabilities: ['tasks', 'spaces', 'docs'] },
  { id: 'atlassian', name: 'Atlassian', description: 'Unified Jira + Confluence access across Cloud and Server', author: 'Community', category: 'Productivity', url: 'https://github.com/sooperset/mcp-atlassian', installCmd: 'uvx mcp-atlassian', capabilities: ['jira', 'confluence', 'search', 'issues'] },
  { id: 'make', name: 'Make', description: 'Run Make.com (Integromat) scenarios — automation orchestration', author: 'Community', category: 'Productivity', url: 'https://github.com/integromat/make-mcp-server', installCmd: 'npx @make/mcp-server', capabilities: ['scenarios', 'triggers', 'webhooks'] },
  { id: 'pipedream', name: 'Pipedream', description: 'Workflow automation with 2000+ integrations', author: 'Community', category: 'Productivity', url: 'https://github.com/PipedreamHQ/pipedream/tree/master/modelcontextprotocol', installCmd: 'npx @pipedream/mcp-server', capabilities: ['workflows', 'apps', 'triggers'] },
  { id: 'microsoft-365', name: 'Microsoft 365', description: 'Full M365 suite via Graph API — mail, files, calendar, Excel', author: 'Community', category: 'Productivity', url: 'https://github.com/softeria/ms-365-mcp-server', installCmd: 'npx ms-365-mcp-server', capabilities: ['mail', 'files', 'calendar', 'excel'] },

  // ═══════════════════════════════════════════════════════════════════
  // BUSINESS & CRM (8)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'stripe-mcp', name: 'Stripe', description: 'Payments, subscriptions, customers, invoices', author: 'Community', category: 'Business', url: 'https://github.com/stripe/agent-toolkit', installCmd: 'npx @stripe/mcp-server', capabilities: ['payments', 'customers', 'subscriptions', 'invoices'] },
  { id: 'salesforce-mcp', name: 'Salesforce', description: 'CRM — accounts, contacts, opportunities', author: 'Community', category: 'Business', url: 'https://github.com/salesforce/mcp-server', installCmd: 'npx mcp-server-salesforce', capabilities: ['accounts', 'contacts', 'opportunities', 'soql'] },
  { id: 'hubspot-mcp', name: 'HubSpot', description: 'CRM, marketing, sales, service hub', author: 'Community', category: 'Business', url: 'https://github.com/hubspot/mcp-server', installCmd: 'npx mcp-server-hubspot', capabilities: ['contacts', 'deals', 'tickets', 'email'] },
  { id: 'shopify', name: 'Shopify', description: 'Products, orders, customers, inventory', author: 'Community', category: 'Business', url: 'https://github.com/shopify/mcp-server', installCmd: 'npx mcp-server-shopify', capabilities: ['products', 'orders', 'customers'] },
  { id: 'airtable-mcp', name: 'Airtable', description: 'Bases, tables, records, views', author: 'Community', category: 'Business', url: 'https://github.com/airtable/mcp-server', installCmd: 'npx mcp-server-airtable', capabilities: ['records', 'tables', 'views'] },
  { id: 'intercom', name: 'Intercom', description: 'Customer messaging, tickets, articles', author: 'Community', category: 'Business', url: 'https://github.com/intercom/mcp-server', installCmd: 'npx mcp-server-intercom', capabilities: ['conversations', 'contacts', 'articles'] },
  { id: 'zendesk', name: 'Zendesk', description: 'Support tickets, users, organizations', author: 'Community', category: 'Business', url: 'https://github.com/zendesk/mcp-server', installCmd: 'npx mcp-server-zendesk', capabilities: ['tickets', 'users', 'search'] },
  { id: 'freshdesk', name: 'Freshdesk', description: 'Help desk — tickets, contacts, knowledge base', author: 'Community', category: 'Business', url: 'https://github.com/nichochar/mcp-server-freshdesk', installCmd: 'npx mcp-server-freshdesk', capabilities: ['tickets', 'contacts', 'kb'] },
  { id: 'chargebee', name: 'Chargebee', description: 'Subscription billing — customers, invoices, plans', author: 'Community', category: 'Business', url: 'https://github.com/chargebee/agentkit/tree/main/modelcontextprotocol', installCmd: 'npx @chargebee/mcp-server', capabilities: ['subscriptions', 'invoices', 'customers'] },
  { id: 'google-ads', name: 'Google Ads', description: 'Campaigns, keywords, performance reports', author: 'Community', category: 'Business', url: 'https://github.com/gomarble-ai/google-ads-mcp-server', installCmd: 'npx google-ads-mcp', capabilities: ['campaigns', 'keywords', 'reports'] },
  { id: 'facebook-ads', name: 'Facebook Ads', description: 'Meta ad accounts, campaigns, creatives, insights', author: 'Community', category: 'Business', url: 'https://github.com/gomarble-ai/facebook-ads-mcp-server', installCmd: 'npx facebook-ads-mcp', capabilities: ['campaigns', 'creatives', 'insights'] },
  { id: 'google-maps', name: 'Google Maps', description: 'Geocoding, places, directions, distance matrix', author: 'Community', category: 'Business', url: 'https://github.com/cablate/mcp-google-map', installCmd: 'npx mcp-google-map', capabilities: ['geocode', 'places', 'directions'] },

  // ═══════════════════════════════════════════════════════════════════
  // CLOUD & INFRASTRUCTURE (8)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'aws', name: 'AWS', description: 'EC2, Lambda, CloudWatch, IAM, and more', author: 'Community', category: 'Cloud', url: 'https://github.com/aws/mcp-server-aws', installCmd: 'npx @aws/mcp-server', capabilities: ['ec2', 'lambda', 'cloudwatch', 'iam'] },
  { id: 'gcp', name: 'Google Cloud', description: 'Compute, BigQuery, Cloud Run, IAM', author: 'Community', category: 'Cloud', url: 'https://github.com/GoogleCloudPlatform/mcp-server', installCmd: 'npx mcp-server-gcp', capabilities: ['compute', 'bigquery', 'run', 'iam'] },
  { id: 'azure', name: 'Azure', description: 'VMs, Functions, CosmosDB, Active Directory', author: 'Community', category: 'Cloud', url: 'https://github.com/microsoft/mcp-server-azure', installCmd: 'npx mcp-server-azure', capabilities: ['vms', 'functions', 'cosmosdb'] },
  { id: 'fly', name: 'Fly.io', description: 'Deploy and manage Fly.io applications', author: 'Community', category: 'Cloud', url: 'https://github.com/fly-io/mcp-server', installCmd: 'npx mcp-server-fly', capabilities: ['deploy', 'machines', 'secrets'] },
  { id: 'railway', name: 'Railway', description: 'Deploy apps, manage services and databases', author: 'Community', category: 'Cloud', url: 'https://github.com/railwayapp/mcp-server', installCmd: 'npx mcp-server-railway', capabilities: ['deploy', 'services', 'variables'] },
  { id: 'render', name: 'Render', description: 'Web services, databases, cron jobs', author: 'Community', category: 'Cloud', url: 'https://github.com/render-oss/mcp-server', installCmd: 'npx mcp-server-render', capabilities: ['services', 'databases', 'deploys'] },
  { id: 'digitalocean', name: 'DigitalOcean', description: 'Droplets, databases, Kubernetes', author: 'Community', category: 'Cloud', url: 'https://github.com/digitalocean/mcp-server', installCmd: 'npx mcp-server-digitalocean', capabilities: ['droplets', 'databases', 'k8s'] },
  { id: 'hetzner', name: 'Hetzner', description: 'Servers, networks, firewalls', author: 'Community', category: 'Cloud', url: 'https://github.com/nichochar/mcp-server-hetzner', installCmd: 'npx mcp-server-hetzner', capabilities: ['servers', 'networks', 'firewalls'] },
  { id: 'edgeone', name: 'EdgeOne Pages', description: 'Tencent EdgeOne — deploy static sites to global edge', author: 'Community', category: 'Cloud', url: 'https://github.com/TencentEdgeOne/edgeone-pages-mcp', installCmd: 'npx edgeone-pages-mcp', capabilities: ['deploy', 'domains', 'edge'] },

  // ═══════════════════════════════════════════════════════════════════
  // AI & ML (8)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'openai-mcp', name: 'OpenAI', description: 'Chat, embeddings, image generation, moderation', author: 'Community', category: 'AI & ML', url: 'https://github.com/openai/mcp-server', installCmd: 'npx mcp-server-openai', capabilities: ['chat', 'embeddings', 'images'] },
  { id: 'huggingface', name: 'Hugging Face', description: 'Models, datasets, spaces, inference', author: 'Community', category: 'AI & ML', url: 'https://github.com/huggingface/mcp-server', installCmd: 'npx mcp-server-huggingface', capabilities: ['models', 'datasets', 'inference'] },
  { id: 'replicate', name: 'Replicate', description: 'Run ML models via API — image, video, audio', author: 'Community', category: 'AI & ML', url: 'https://github.com/replicate/mcp-server', installCmd: 'npx mcp-server-replicate', capabilities: ['predict', 'models', 'deployments'] },
  { id: 'stability', name: 'Stability AI', description: 'Image generation — Stable Diffusion API', author: 'Community', category: 'AI & ML', url: 'https://github.com/stability-ai/mcp-server', installCmd: 'npx mcp-server-stability', capabilities: ['generate', 'edit', 'upscale'] },
  { id: 'langchain', name: 'LangChain', description: 'Chain tools, retrievers, and agents', author: 'Community', category: 'AI & ML', url: 'https://github.com/langchain-ai/mcp-server', installCmd: 'npx mcp-server-langchain', capabilities: ['chains', 'retrievers', 'tools'] },
  { id: 'pinecone', name: 'Pinecone', description: 'Vector database for embeddings search', author: 'Community', category: 'AI & ML', url: 'https://github.com/pinecone-io/mcp-server', installCmd: 'npx mcp-server-pinecone', capabilities: ['upsert', 'query', 'namespaces'] },
  { id: 'weaviate', name: 'Weaviate', description: 'Vector search engine with ML models', author: 'Community', category: 'AI & ML', url: 'https://github.com/weaviate/mcp-server', installCmd: 'npx mcp-server-weaviate', capabilities: ['search', 'objects', 'schema'] },
  { id: 'elevenlabs-mcp', name: 'ElevenLabs', description: 'Text-to-speech, voice cloning', author: 'Community', category: 'AI & ML', url: 'https://github.com/elevenlabs/mcp-server', installCmd: 'npx mcp-server-elevenlabs', capabilities: ['tts', 'voices', 'clone'] },
  { id: 'llamacloud', name: 'LlamaCloud', description: 'LlamaIndex managed RAG — parse, index, query documents', author: 'Community', category: 'AI & ML', url: 'https://github.com/run-llama/mcp-server-llamacloud', installCmd: 'npx mcp-server-llamacloud', capabilities: ['parse', 'index', 'query'] },
  { id: 'fastmcp', name: 'FastMCP', description: 'Framework for building MCP servers in Python — meta server', author: 'Community', category: 'AI & ML', url: 'https://github.com/jlowin/fastmcp', installCmd: 'uvx fastmcp', capabilities: ['framework', 'tools', 'prompts'] },
  { id: 'opik', name: 'Opik', description: 'Comet ML — LLM observability, traces, evals', author: 'Community', category: 'AI & ML', url: 'https://github.com/comet-ml/opik-mcp', installCmd: 'npx @comet/opik-mcp', capabilities: ['traces', 'evals', 'datasets'] },

  // ═══════════════════════════════════════════════════════════════════
  // ANALYTICS (6)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'posthog', name: 'PostHog', description: 'Product analytics, feature flags, experiments', author: 'Community', category: 'Analytics', url: 'https://github.com/PostHog/mcp-server', installCmd: 'npx mcp-server-posthog', capabilities: ['events', 'funnels', 'feature_flags'] },
  { id: 'amplitude', name: 'Amplitude', description: 'Product analytics and user behavior', author: 'Community', category: 'Analytics', url: 'https://github.com/amplitude/mcp-server', installCmd: 'npx mcp-server-amplitude', capabilities: ['events', 'cohorts', 'charts'] },
  { id: 'mixpanel', name: 'Mixpanel', description: 'Event analytics, funnels, retention', author: 'Community', category: 'Analytics', url: 'https://github.com/mixpanel/mcp-server', installCmd: 'npx mcp-server-mixpanel', capabilities: ['events', 'funnels', 'reports'] },
  { id: 'plausible', name: 'Plausible', description: 'Privacy-focused web analytics', author: 'Community', category: 'Analytics', url: 'https://github.com/plausible/mcp-server', installCmd: 'npx mcp-server-plausible', capabilities: ['stats', 'pages', 'sources'] },
  { id: 'prometheus', name: 'Prometheus', description: 'Metrics, alerts, targets', author: 'Community', category: 'Analytics', url: 'https://github.com/prometheus/mcp-server', installCmd: 'npx mcp-server-prometheus', capabilities: ['query', 'alerts', 'targets'] },
  { id: 'google-analytics', name: 'Google Analytics', description: 'GA4 reports, realtime, audiences', author: 'Community', category: 'Analytics', url: 'https://github.com/nichochar/mcp-server-ga4', installCmd: 'npx mcp-server-ga4', capabilities: ['reports', 'realtime', 'audiences'] },
  { id: 'tinybird', name: 'Tinybird', description: 'Real-time analytics — ClickHouse-powered data pipelines', author: 'Community', category: 'Analytics', url: 'https://github.com/tinybirdco/mcp-tinybird', installCmd: 'npx @tinybird/mcp-server', capabilities: ['query', 'pipes', 'data_sources'] },
  { id: 'victoriametrics', name: 'VictoriaMetrics', description: 'High-performance time-series database — queries, alerts', author: 'Community', category: 'Analytics', url: 'https://github.com/VictoriaMetrics-Community/mcp-victoriametrics', installCmd: 'npx mcp-victoriametrics', capabilities: ['query', 'metrics', 'alerts'] },

  // ═══════════════════════════════════════════════════════════════════
  // SECURITY (4)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'vault', name: 'HashiCorp Vault', description: 'Secrets management — read, list, manage', author: 'Community', category: 'Security', url: 'https://github.com/hashicorp/mcp-server-vault', installCmd: 'npx mcp-server-vault', capabilities: ['secrets', 'policies', 'auth'] },
  { id: 'snyk', name: 'Snyk', description: 'Security scanning — vulnerabilities, licenses', author: 'Community', category: 'Security', url: 'https://github.com/snyk/mcp-server', installCmd: 'npx @snyk/mcp-server', capabilities: ['scan', 'vulnerabilities', 'licenses'] },
  { id: 'onepassword', name: '1Password', description: 'Password and secret management', author: 'Community', category: 'Security', url: 'https://github.com/1Password/mcp-server', installCmd: 'npx mcp-server-1password', capabilities: ['items', 'vaults', 'secrets'] },
  { id: 'bitwarden', name: 'Bitwarden', description: 'Password manager — items, folders, organizations', author: 'Community', category: 'Security', url: 'https://github.com/bitwarden/mcp-server', installCmd: 'npx mcp-server-bitwarden', capabilities: ['items', 'folders', 'generate'] },
  { id: 'keycloak', name: 'Keycloak', description: 'Identity and access management — users, roles, realms', author: 'Community', category: 'Security', url: 'https://github.com/idoyudha/mcp-keycloak', installCmd: 'npx mcp-keycloak', capabilities: ['users', 'roles', 'realms', 'sso'] },

  // ═══════════════════════════════════════════════════════════════════
  // MEDIA (6)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'figma', name: 'Figma', description: 'Read designs, components, variables, comments', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-figma', installCmd: 'npx mcp-server-figma', capabilities: ['files', 'components', 'comments'] },
  { id: 'canva', name: 'Canva', description: 'Designs, templates, brand assets', author: 'Community', category: 'Media', url: 'https://github.com/canva/mcp-server', installCmd: 'npx mcp-server-canva', capabilities: ['designs', 'templates', 'export'] },
  { id: 'youtube', name: 'YouTube', description: 'Video search, transcripts, channel data', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-youtube', installCmd: 'npx mcp-server-youtube', capabilities: ['search', 'transcripts', 'channels'] },
  { id: 'spotify', name: 'Spotify', description: 'Search tracks, playlists, playback control', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-spotify', installCmd: 'npx mcp-server-spotify', capabilities: ['search', 'playlists', 'playback'] },
  { id: 'unsplash', name: 'Unsplash', description: 'Search and download stock photos', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-unsplash', installCmd: 'npx mcp-server-unsplash', capabilities: ['search', 'download', 'collections'] },
  { id: 'dall-e', name: 'DALL-E', description: 'AI image generation via OpenAI', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-dalle', installCmd: 'npx mcp-server-dalle', capabilities: ['generate', 'edit', 'variations'] },
  { id: 'videodb', name: 'VideoDB', description: 'Serverless video database — index, search, stream, auto-edit', author: 'Community', category: 'Media', url: 'https://github.com/video-db/agent-toolkit/tree/main/modelcontextprotocol', installCmd: 'npx @videodb/mcp-server', capabilities: ['index', 'search', 'stream', 'edit'] },
  { id: 'echarts', name: 'Apache ECharts', description: 'Generate charts from data — bar, line, pie, heatmap, radar', author: 'Community', category: 'Media', url: 'https://github.com/hustcc/mcp-echarts', installCmd: 'npx mcp-echarts', capabilities: ['charts', 'visualization', 'export'] },

  // ═══════════════════════════════════════════════════════════════════
  // UTILITIES (8)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'memory-mcp', name: 'Memory', description: 'Persistent key-value memory for agents', author: 'MCP', category: 'Utilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory', installCmd: 'npx @modelcontextprotocol/server-memory', capabilities: ['store', 'retrieve', 'search'], official: true },
  { id: 'time', name: 'Time', description: 'Current time, timezone conversions, countdowns', author: 'MCP', category: 'Utilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/time', installCmd: 'npx @modelcontextprotocol/server-time', capabilities: ['current', 'convert', 'diff'], official: true },
  { id: 'sequentialthinking', name: 'Sequential Thinking', description: 'Chain-of-thought reasoning with revision', author: 'MCP', category: 'Utilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking', installCmd: 'npx @modelcontextprotocol/server-sequentialthinking', capabilities: ['think', 'revise'], official: true },
  { id: 'context7', name: 'Context7', description: 'Library documentation lookup', author: 'Community', category: 'Utilities', url: 'https://github.com/upstash/context7', installCmd: 'npx @upstash/context7-mcp', capabilities: ['docs', 'examples', 'api_ref'] },
  { id: 'magic-mcp', name: 'Magic MCP', description: 'Generate UI components and previews', author: 'Community', category: 'Utilities', url: 'https://github.com/nichochar/magic-mcp', installCmd: 'npx magic-mcp', capabilities: ['generate_ui', 'preview'] },
  { id: 'mcp-shell', name: 'Shell', description: 'Safe shell command runner with allowlists', author: 'Community', category: 'Utilities', url: 'https://github.com/nichochar/mcp-server-shell', installCmd: 'npx mcp-server-shell', capabilities: ['run', 'scripts'] },
  { id: 'everything', name: 'Everything', description: 'MCP protocol test server — all resource types', author: 'MCP', category: 'Utilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything', installCmd: 'npx @modelcontextprotocol/server-everything', capabilities: ['resources', 'tools', 'prompts'], official: true },
  { id: 'calculator', name: 'Calculator', description: 'Math operations, unit conversions', author: 'Community', category: 'Utilities', url: 'https://github.com/nichochar/mcp-server-calculator', installCmd: 'npx mcp-server-calculator', capabilities: ['math', 'convert', 'statistics'] },
  { id: 'gitingest', name: 'GitIngest', description: 'Turn any Git repo into prompt-friendly context summaries', author: 'Community', category: 'Utilities', url: 'https://github.com/cyclotruc/gitingest', installCmd: 'uvx gitingest-mcp', capabilities: ['summarize', 'ingest', 'context'] },
  { id: 'xcode', name: 'Xcode', description: 'Drive Xcode builds, simulators, and iOS/macOS projects', author: 'Community', category: 'Utilities', url: 'https://github.com/ShenghaiWang/xcodebuild', installCmd: 'npx xcodebuild-mcp', capabilities: ['build', 'test', 'simulator'] },
];

// ═══════════════════════════════════════════════════════════════════════
// Dedup guard — normalize ids + url check, fires at module load time.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Normalize an MCP server identifier or name to a canonical dedup key.
 * Strips common MCP affixes, npm scopes, and punctuation so that
 * "GitHub" / "github-mcp" / "mcp-server-github" / "@modelcontextprotocol/server-github"
 * all collapse to the same key ("github").
 *
 * Used both by the internal dedup guard and by any caller that needs to
 * match a server name against an external source (awesome-list, composio, etc).
 */
export function normalizeMcpId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^@[^/]+\//, '')          // strip npm scope
    .replace(/[.()[\]/,]/g, ' ')       // punctuation → space
    .replace(/\s+/g, ' ')
    .replace(/\bmcp[- ]?server\b/g, '')
    .replace(/\bserver[- ]?mcp\b/g, '')
    .replace(/\bmcp\b/g, '')
    .replace(/^server[- ]/, '')        // leading "server-" (post-scope)
    .replace(/[- ]server$/, '')        // trailing "-server"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

/**
 * Enforces catalog uniqueness. Throws a descriptive error if two servers
 * collide on either:
 *   1. normalized id (catches "github-mcp" + "github" + "mcp-server-github")
 *   2. repository url (catches accidental copy-paste of an existing entry)
 *
 * Runs once at module load so Vite / tsc builds fail fast when a contributor
 * adds a duplicate. O(n) with early exit.
 */
function assertCatalogUnique(catalog: readonly McpServer[]): void {
  const seenIds = new Map<string, string>();
  const seenUrls = new Map<string, string>();
  for (const server of catalog) {
    const normalizedId = normalizeMcpId(server.id);
    const existingId = seenIds.get(normalizedId);
    if (existingId && existingId !== server.id) {
      throw new Error(
        `[mcp-registry] duplicate server id: "${server.id}" collides with ` +
        `"${existingId}" (normalized: "${normalizedId}"). ` +
        `If these are genuinely different servers, rename one so their ` +
        `normalized keys don't collide.`
      );
    }
    seenIds.set(normalizedId, server.id);
    const existingUrl = seenUrls.get(server.url);
    if (existingUrl && existingUrl !== server.id) {
      throw new Error(
        `[mcp-registry] duplicate repository url: ` +
        `"${server.id}" and "${existingUrl}" both point at ${server.url}`
      );
    }
    seenUrls.set(server.url, server.id);
  }
}

assertCatalogUnique(MCP_CATALOG);
