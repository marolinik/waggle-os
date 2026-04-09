/**
 * MCP Server Registry — curated catalog of 100+ community MCP servers.
 *
 * Sources:
 * - modelcontextprotocol/servers (official Anthropic reference)
 * - punkpeye/awesome-mcp-servers (community, 77K stars)
 * - tolkonepiu/best-of-mcp-servers (450 ranked, 34 categories)
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

  // ═══════════════════════════════════════════════════════════════════
  // ANALYTICS (6)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'posthog', name: 'PostHog', description: 'Product analytics, feature flags, experiments', author: 'Community', category: 'Analytics', url: 'https://github.com/PostHog/mcp-server', installCmd: 'npx mcp-server-posthog', capabilities: ['events', 'funnels', 'feature_flags'] },
  { id: 'amplitude', name: 'Amplitude', description: 'Product analytics and user behavior', author: 'Community', category: 'Analytics', url: 'https://github.com/amplitude/mcp-server', installCmd: 'npx mcp-server-amplitude', capabilities: ['events', 'cohorts', 'charts'] },
  { id: 'mixpanel', name: 'Mixpanel', description: 'Event analytics, funnels, retention', author: 'Community', category: 'Analytics', url: 'https://github.com/mixpanel/mcp-server', installCmd: 'npx mcp-server-mixpanel', capabilities: ['events', 'funnels', 'reports'] },
  { id: 'plausible', name: 'Plausible', description: 'Privacy-focused web analytics', author: 'Community', category: 'Analytics', url: 'https://github.com/plausible/mcp-server', installCmd: 'npx mcp-server-plausible', capabilities: ['stats', 'pages', 'sources'] },
  { id: 'prometheus', name: 'Prometheus', description: 'Metrics, alerts, targets', author: 'Community', category: 'Analytics', url: 'https://github.com/prometheus/mcp-server', installCmd: 'npx mcp-server-prometheus', capabilities: ['query', 'alerts', 'targets'] },
  { id: 'google-analytics', name: 'Google Analytics', description: 'GA4 reports, realtime, audiences', author: 'Community', category: 'Analytics', url: 'https://github.com/nichochar/mcp-server-ga4', installCmd: 'npx mcp-server-ga4', capabilities: ['reports', 'realtime', 'audiences'] },

  // ═══════════════════════════════════════════════════════════════════
  // SECURITY (4)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'vault', name: 'HashiCorp Vault', description: 'Secrets management — read, list, manage', author: 'Community', category: 'Security', url: 'https://github.com/hashicorp/mcp-server-vault', installCmd: 'npx mcp-server-vault', capabilities: ['secrets', 'policies', 'auth'] },
  { id: 'snyk', name: 'Snyk', description: 'Security scanning — vulnerabilities, licenses', author: 'Community', category: 'Security', url: 'https://github.com/snyk/mcp-server', installCmd: 'npx @snyk/mcp-server', capabilities: ['scan', 'vulnerabilities', 'licenses'] },
  { id: 'onepassword', name: '1Password', description: 'Password and secret management', author: 'Community', category: 'Security', url: 'https://github.com/1Password/mcp-server', installCmd: 'npx mcp-server-1password', capabilities: ['items', 'vaults', 'secrets'] },
  { id: 'bitwarden', name: 'Bitwarden', description: 'Password manager — items, folders, organizations', author: 'Community', category: 'Security', url: 'https://github.com/bitwarden/mcp-server', installCmd: 'npx mcp-server-bitwarden', capabilities: ['items', 'folders', 'generate'] },

  // ═══════════════════════════════════════════════════════════════════
  // MEDIA (6)
  // ═══════════════════════════════════════════════════════════════════
  { id: 'figma', name: 'Figma', description: 'Read designs, components, variables, comments', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-figma', installCmd: 'npx mcp-server-figma', capabilities: ['files', 'components', 'comments'] },
  { id: 'canva', name: 'Canva', description: 'Designs, templates, brand assets', author: 'Community', category: 'Media', url: 'https://github.com/canva/mcp-server', installCmd: 'npx mcp-server-canva', capabilities: ['designs', 'templates', 'export'] },
  { id: 'youtube', name: 'YouTube', description: 'Video search, transcripts, channel data', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-youtube', installCmd: 'npx mcp-server-youtube', capabilities: ['search', 'transcripts', 'channels'] },
  { id: 'spotify', name: 'Spotify', description: 'Search tracks, playlists, playback control', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-spotify', installCmd: 'npx mcp-server-spotify', capabilities: ['search', 'playlists', 'playback'] },
  { id: 'unsplash', name: 'Unsplash', description: 'Search and download stock photos', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-unsplash', installCmd: 'npx mcp-server-unsplash', capabilities: ['search', 'download', 'collections'] },
  { id: 'dall-e', name: 'DALL-E', description: 'AI image generation via OpenAI', author: 'Community', category: 'Media', url: 'https://github.com/nichochar/mcp-server-dalle', installCmd: 'npx mcp-server-dalle', capabilities: ['generate', 'edit', 'variations'] },

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
];
