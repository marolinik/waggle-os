/**
 * Waggle Marketplace — Source Sync Engine
 *
 * Fetches live package data from marketplace sources and updates
 * the local SQLite database. Supports incremental and full syncs.
 *
 * Supported sources:
 *   - ClawHub API (https://clawhub.ai/api/v1/skills)
 *   - SkillsMP API (https://skillsmp.dev/api/v1/skills)
 *   - GitHub Organizations (anthropics, modelcontextprotocol, lobehub, cursor, etc.)
 *   - LobeHub Plugin Registry (https://chat-plugins.lobehub.com/index.json)
 *   - AITMPL Skills (https://www.aitmpl.com/api/skills)
 *   - Awesome-List repos (awesome-mcp-servers, awesome-claude-skills, etc.)
 *   - GitHub Repo Content (repos with SKILL.md files in subdirectories)
 *   - Web Registries (skills.sh, mcpmarket.com, skillsdirectory.com, etc.)
 *   - NPM Registry (mcp-server keyword search)
 *
 * Rate limits are respected per source. Default: 500 req/day for SkillsMP,
 * 100 req/min for GitHub API, unlimited for ClawHub.
 */

import { MarketplaceDB } from './db';
import type {
  MarketplacePackage,
  MarketplaceSource,
  SyncOptions,
  SyncResult,
  InstallManifest,
} from './types';

// ─── Helpers ───────────────────────────────────────────────────────

/** Truncate error messages to a reasonable length */
function safeErrorText(err: unknown, maxLen = 200): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > maxLen ? msg.slice(0, maxLen) + '...' : msg;
}

/** Check if a URL is an awesome-list repo (has 'awesome' anywhere in the repo name) */
function isAwesomeListUrl(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]*awesome[^/]*/i.test(url);
}

/** Build GitHub API headers */
function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'waggle-marketplace-sync',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/** Detect package type from name/URL */
function detectPackageType(name: string, url?: string): 'skill' | 'plugin' | 'mcp' {
  const combined = `${name} ${url || ''}`.toLowerCase();
  if (combined.includes('mcp') || combined.includes('model-context-protocol')) return 'mcp';
  if (combined.includes('plugin')) return 'plugin';
  return 'skill';
}

/** Make a URL-friendly slug from a name */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Make a display name from a slug */
function displayNameFromSlug(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

// ─── Interface ─────────────────────────────────────────────────────

/**
 * Optional function to look up API keys from the vault.
 * Accepts a vault key name and returns the secret value or null.
 */
export type VaultLookupFn = (key: string) => string | null;

interface SyncAdapter {
  name: string;
  canSync(source: MarketplaceSource): boolean;
  sync(source: MarketplaceSource, db: MarketplaceDB, vaultLookup?: VaultLookupFn): Promise<SyncResult>;
}

// ─── Awesome-List Parser Adapter ───────────────────────────────────
// Handles GitHub "awesome-*" repos that contain markdown lists of links.

/**
 * Parse a markdown README for links, supporting:
 *   - Bullet lists: `- [name](url) - description`
 *   - Table rows: `| [name](url) | description |`
 *   - Heading-level links: `### [name](url)`
 */
export function parseAwesomeListMarkdown(markdown: string): Array<{
  name: string;
  url: string;
  description: string;
}> {
  const results: Array<{ name: string; url: string; description: string }> = [];
  const seen = new Set<string>();

  // Process line by line to prevent cross-line greedy matching
  const lines = markdown.split('\n');
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?:[ \t]*[-\u2013|:][ \t]*(.*))?/;

  for (const line of lines) {
    const match = linkPattern.exec(line);
    if (!match) continue;

    const name = match[1].trim();
    const url = match[2].trim();
    const description = (match[3] || '').trim();

    // Skip badges, images, ToC links, and anchors
    if (url.includes('shields.io') || url.includes('badge') || url.startsWith('#')) continue;
    if (/\.(png|jpg|jpeg|gif|svg)$/i.test(url)) continue;
    if (name.length < 2 || name.length > 120) continue;

    // Dedup by URL
    if (seen.has(url)) continue;
    seen.add(url);

    results.push({ name, url, description });
  }

  return results;
}

const awesomeListAdapter: SyncAdapter = {
  name: 'awesome-list',

  canSync(source) {
    // Match community_repo or aggregator sources with awesome-* in URL
    if (source.source_type !== 'community_repo' && source.source_type !== 'aggregator') return false;
    return isAwesomeListUrl(source.url);
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };
    // No cap — we store metadata only, actual content fetched on install

    try {
      // Extract owner/repo from URL
      const match = source.url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error(`Cannot parse GitHub URL: ${source.url}`);
      const [, owner, repo] = match;

      // Fetch README.md via raw.githubusercontent.com
      const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`;
      const response = await fetch(readmeUrl, {
        headers: { 'User-Agent': 'waggle-marketplace-sync' },
      });

      let markdown: string;
      if (!response.ok) {
        // Try master branch as fallback
        const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`;
        const fallbackResp = await fetch(fallbackUrl, {
          headers: { 'User-Agent': 'waggle-marketplace-sync' },
        });
        if (!fallbackResp.ok) throw new Error(`README fetch failed: ${response.status} / ${fallbackResp.status}`);
        markdown = await fallbackResp.text();
      } else {
        markdown = await response.text();
      }

      const links = parseAwesomeListMarkdown(markdown);

      for (const link of links) {
        const installType = detectPackageType(link.name, link.url);
        const slug = slugify(link.name);
        if (!slug) continue;

        const manifest: InstallManifest = installType === 'mcp'
          ? { mcp_config: { name: slug, command: 'npx', args: ['-y', slug] } }
          : { skill_url: link.url };

        try {
          db.upsertPackage({
            source_id: source.id,
            name: `${source.name}-${slug}`,
            display_name: link.name,
            description: link.description || `${installType} from ${source.display_name}`,
            author: owner,
            package_type: installType === 'mcp' ? 'mcp_server' : installType,
            waggle_install_type: installType,
            waggle_install_path: installType === 'skill'
              ? `skills/${slug}.md`
              : installType === 'plugin'
                ? `plugins/${slug}/`
                : `.mcp.json`,
            version: '1.0.0',
            license: null,
            repository_url: link.url.includes('github.com') ? link.url : null,
            homepage_url: link.url,
            downloads: 0,
            stars: 0,
            category: installType === 'mcp' ? 'integration' : 'general',
            platforms: JSON.stringify(['claude_code', 'waggle']) as any,
            dependencies: JSON.stringify([]) as any,
            packs: JSON.stringify([]) as any,
            install_manifest: JSON.stringify(manifest) as any,
          });
          result.added++;
        } catch (itemErr) {
          result.errors.push(safeErrorText(itemErr));
        }
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── GitHub Repo Content Adapter ───────────────────────────────────
// Handles single repos with multiple skills in subdirectories.

const githubRepoContentAdapter: SyncAdapter = {
  name: 'github-repo-content',

  canSync(source) {
    if (source.source_type !== 'community_repo') return false;
    // Must be a github.com URL but NOT an awesome-list
    if (!source.url.includes('github.com')) return false;
    if (isAwesomeListUrl(source.url)) return false;
    // Must have a repo path (owner/repo), not just an org
    const match = source.url.match(/github\.com\/([^/]+)\/([^/]+)/);
    return !!match;
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };
    // No cap — metadata only, content fetched on install

    try {
      const match = source.url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error(`Cannot parse GitHub repo URL: ${source.url}`);
      const [, owner, repo] = match;

      // Use GitHub API to get repo tree
      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
      const response = await fetch(treeUrl, { headers: githubHeaders() });

      let treeData: any;
      if (!response.ok) {
        // Try master branch
        const fallbackUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`;
        const fallbackResp = await fetch(fallbackUrl, { headers: githubHeaders() });
        if (!fallbackResp.ok) throw new Error(`GitHub tree API: ${response.status} / ${fallbackResp.status}`);
        treeData = await fallbackResp.json();
      } else {
        treeData = await response.json();
      }

      const tree = treeData.tree || [];

      // Look for SKILL.md, skill.md, *.skill.md files
      const skillFiles = tree.filter((item: any) =>
        item.type === 'blob' &&
        /(?:^|\/)(?:SKILL\.md|skill\.md|[^/]+\.skill\.md)$/i.test(item.path)
      );

      for (const file of skillFiles) {
        // Derive skill name from file path
        const pathParts = file.path.split('/');
        const dirName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : pathParts[0];
        const slug = slugify(dirName.replace(/\.skill\.md$/i, '').replace(/\.md$/i, ''));
        if (!slug) continue;

        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}`;

        try {
          db.upsertPackage({
            source_id: source.id,
            name: `${source.name}-${slug}`,
            display_name: displayNameFromSlug(slug),
            description: `Skill from ${owner}/${repo}`,
            author: owner,
            package_type: 'skill',
            waggle_install_type: 'skill',
            waggle_install_path: `skills/${slug}.md`,
            version: '1.0.0',
            license: null,
            repository_url: `https://github.com/${owner}/${repo}/tree/main/${pathParts.slice(0, -1).join('/')}`,
            homepage_url: `https://github.com/${owner}/${repo}`,
            downloads: 0,
            stars: 0,
            category: 'general',
            platforms: JSON.stringify(['claude_code', 'waggle']) as any,
            dependencies: JSON.stringify([]) as any,
            packs: JSON.stringify([]) as any,
            install_manifest: JSON.stringify({ skill_url: rawUrl }) as any,
          });
          result.added++;
        } catch (itemErr) {
          result.errors.push(safeErrorText(itemErr));
        }
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── Web Registry Adapter ──────────────────────────────────────────
// Handles web-based skill/MCP registries.

const webRegistryAdapter: SyncAdapter = {
  name: 'web-registry',

  canSync(source) {
    // Match aggregator sources with api_endpoint, but NOT github URLs
    if (source.source_type === 'aggregator' && source.api_endpoint && !source.url.includes('github.com')) return true;
    return false;
  },

  async sync(source, db, vaultLookup?) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      // Build headers — check vault for API keys (premium sources like skillsdirectory.com)
      const headers: Record<string, string> = {
        'User-Agent': 'waggle-marketplace-sync',
        'Accept': 'application/json',
      };

      if (vaultLookup) {
        const apiKey = vaultLookup(`marketplace:source:${source.name}:api_key`);
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
          headers['X-Api-Key'] = apiKey;
        }
      }

      // Resume from saved sync state (for rate-limited sources)
      const syncState = db.getSyncState(source.id) || {};
      let offset = (syncState.lastOffset as number) || 0;
      const totalSyncedPrior = (syncState.totalSynced as number) || 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore) {
        // Append pagination params to the endpoint URL
        const baseUrl = source.api_endpoint!;
        const sep = baseUrl.includes('?') ? '&' : '?';
        const pageUrl = `${baseUrl}${sep}limit=${pageSize}&offset=${offset}`;

        const response = await fetch(pageUrl, { headers });

        if (response.status === 401 || response.status === 403) {
          result.errors.push(
            `${source.display_name} API requires authentication (${response.status}). ` +
            `Configure an API key in the vault as "marketplace:source:${source.name}:api_key".`,
          );
          return result;
        }

        // Rate limited — save progress and return gracefully
        if (response.status === 429) {
          db.setSyncState(source.id, {
            lastOffset: offset,
            totalSynced: totalSyncedPrior + result.added,
            lastSyncedAt: new Date().toISOString(),
          });
          result.errors.push(
            `${source.display_name} rate limit reached at offset ${offset}. ` +
            `Progress saved — next sync will resume from offset ${offset}.`,
          );
          return result;
        }

        if (!response.ok) throw new Error(`API ${response.status}: ${response.statusText}`);

        const data = await response.json() as any;

        // Try multiple JSON response formats
        let items: any[] = [];
        if (Array.isArray(data)) {
          items = data;
        } else if (data.skills && Array.isArray(data.skills)) {
          items = data.skills;
        } else if (data.data && Array.isArray(data.data)) {
          items = data.data;
        } else if (data.items && Array.isArray(data.items)) {
          items = data.items;
        } else if (data.tools && Array.isArray(data.tools)) {
          items = data.tools;
        } else if (data.plugins && Array.isArray(data.plugins)) {
          items = data.plugins;
        } else if (data.results && Array.isArray(data.results)) {
          items = data.results;
        }

        if (items.length === 0) {
          if (offset === 0) {
            result.errors.push(`No structured data found in response from ${source.api_endpoint}`);
          }
          // Full sync complete — reset sync state
          db.setSyncState(source.id, null);
          hasMore = false;
          break;
        }

      for (const item of items) {
        const name = item.slug || item.name || item.title || item.id;
        if (!name) continue;

        const slug = slugify(String(name));
        if (!slug) continue;

        const installType = detectPackageType(
          String(name),
          item.url || item.repository_url || item.homepage,
        );

        const manifest: InstallManifest = installType === 'mcp'
          ? { mcp_config: { name: slug, command: 'npx', args: ['-y', item.npm_package || slug] } }
          : { skill_url: item.raw_url || item.content_url || item.download_url || item.url };

        try {
          db.upsertPackage({
            source_id: source.id,
            name: `${source.name}-${slug}`,
            display_name: item.name || item.title || displayNameFromSlug(slug),
            description: item.description || item.summary || '',
            author: item.author || item.creator || item.owner || source.name,
            package_type: installType === 'mcp' ? 'mcp_server' : installType,
            waggle_install_type: installType,
            waggle_install_path: installType === 'skill'
              ? `skills/${slug}.md`
              : installType === 'plugin'
                ? `plugins/${slug}/`
                : `.mcp.json`,
            version: item.version || '1.0.0',
            license: item.license || null,
            repository_url: item.repository_url || item.repo_url || null,
            homepage_url: item.url || item.homepage || null,
            downloads: item.downloads || item.installs || item.download_count || 0,
            stars: item.stars || item.likes || item.rating || 0,
            category: item.category || item.tags?.[0] || 'general',
            platforms: JSON.stringify(item.platforms || ['claude_code', 'waggle']) as any,
            dependencies: JSON.stringify(item.dependencies || []) as any,
            packs: JSON.stringify([]) as any,
            install_manifest: JSON.stringify(manifest) as any,
          });
          result.added++;
        } catch (itemErr) {
          result.errors.push(safeErrorText(itemErr));
        }
      }

        // Save progress after each page
        offset += items.length;
        db.setSyncState(source.id, {
          lastOffset: offset,
          totalSynced: totalSyncedPrior + result.added,
          lastSyncedAt: new Date().toISOString(),
        });

        // Check if we should fetch the next page
        if (items.length < pageSize) {
          // Full sync complete — reset sync state
          db.setSyncState(source.id, null);
          hasMore = false;
        } else {
          // Brief delay to respect rate limits
          await new Promise(r => setTimeout(r, 200));
        }
      } // end while (hasMore)
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── NPM Search Adapter ───────────────────────────────────────────
// Searches npm registry for MCP server packages.

/** Parse npm search API response into package entries */
export function parseNpmSearchResults(data: any): Array<{
  name: string;
  description: string;
  version: string;
  author: string;
  npm_package: string;
  repository_url: string | null;
  homepage_url: string | null;
  keywords: string[];
}> {
  const objects = data.objects || data.results || [];
  if (!Array.isArray(objects)) return [];

  return objects.map((obj: any) => {
    const pkg = obj.package || obj;
    return {
      name: pkg.name || '',
      description: pkg.description || '',
      version: pkg.version || '1.0.0',
      author: pkg.publisher?.username || pkg.author?.name || pkg.maintainers?.[0]?.username || 'community',
      npm_package: pkg.name || '',
      repository_url: pkg.links?.repository || pkg.repository?.url || null,
      homepage_url: pkg.links?.homepage || pkg.links?.npm || null,
      keywords: pkg.keywords || [],
    };
  }).filter((pkg: any) => pkg.name);
}

const npmSearchAdapter: SyncAdapter = {
  name: 'npm-search',

  canSync(source) {
    return source.source_type === 'npm_registry';
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      const apiUrl = source.api_endpoint || 'https://registry.npmjs.org/-/v1/search?text=keywords:mcp-server&size=250';
      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'waggle-marketplace-sync' },
      });

      if (!response.ok) throw new Error(`npm API ${response.status}: ${response.statusText}`);

      const data = await response.json() as any;
      const packages = parseNpmSearchResults(data);

      for (const pkg of packages) {
        const slug = slugify(pkg.name);
        if (!slug) continue;

        const manifest: InstallManifest = {
          npm_package: pkg.npm_package,
          mcp_config: {
            name: slug,
            command: 'npx',
            args: ['-y', pkg.npm_package],
          },
        };

        try {
          db.upsertPackage({
            source_id: source.id,
            name: `${source.name}-${slug}`,
            display_name: displayNameFromSlug(slug),
            description: pkg.description || `MCP server from npm: ${pkg.npm_package}`,
            author: pkg.author,
            package_type: 'mcp_server',
            waggle_install_type: 'mcp',
            waggle_install_path: '.mcp.json',
            version: pkg.version,
            license: null,
            repository_url: pkg.repository_url,
            homepage_url: pkg.homepage_url || `https://www.npmjs.com/package/${pkg.npm_package}`,
            downloads: 0,
            stars: 0,
            category: 'integration',
            platforms: JSON.stringify(['claude_code', 'waggle', 'cursor']) as any,
            dependencies: JSON.stringify([]) as any,
            packs: JSON.stringify([]) as any,
            install_manifest: JSON.stringify(manifest) as any,
          });
          result.added++;
        } catch (itemErr) {
          result.errors.push(safeErrorText(itemErr));
        }
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── GitHub Org Adapter ────────────────────────────────────────────
// Handles GitHub organization repos (org-level, no specific repo path).

const githubAdapter: SyncAdapter = {
  name: 'github',

  canSync(source) {
    if (source.source_type === 'github_org') return true;
    // GitHub URLs that are org-level (no specific repo)
    if (!source.url.includes('github.com')) return false;
    const match = source.url.match(/github\.com\/([^/]+)(\/([^/]+))?/);
    // Only match if no repo path (org-level) and not npm_registry
    if (match && !match[3] && source.source_type !== 'npm_registry') return true;
    // For sources with repo path, only match official_marketplace types
    // (not community_repo - those go to content/awesome adapters)
    if (match && match[3] && source.source_type === 'official_marketplace') return true;
    return false;
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      // Extract org/user from URL
      const match = source.url.match(/github\.com\/([^/]+)/);
      if (!match) throw new Error(`Cannot parse GitHub URL: ${source.url}`);
      const owner = match[1];

      // Fetch repos with topic filters
      const apiUrl = source.api_endpoint || `https://api.github.com/orgs/${owner}/repos?per_page=100&sort=updated`;

      const response = await fetch(apiUrl, { headers: githubHeaders() });
      if (!response.ok) throw new Error(`GitHub API ${response.status}: ${response.statusText}`);

      const repos = await response.json() as any[];

      for (const repo of repos) {
        // Filter for skill/MCP/plugin repos
        const topics = repo.topics || [];
        const isSkill = topics.some((t: string) =>
          ['skill', 'agent-skill', 'claude-code', 'mcp', 'mcp-server', 'plugin'].includes(t)
        ) || repo.name.includes('skill') || repo.name.includes('mcp');

        if (!isSkill && repos.length > 20) continue; // Skip non-skill repos in large orgs

        const installType = repo.name.includes('mcp') ? 'mcp' :
                           topics.includes('plugin') ? 'plugin' : 'skill';

        const manifest: InstallManifest = installType === 'skill'
          ? { skill_url: `https://raw.githubusercontent.com/${owner}/${repo.name}/main/SKILL.md` }
          : installType === 'mcp'
            ? { mcp_config: { name: repo.name, command: 'npx', args: ['-y', repo.full_name] } }
            : { git_url: repo.clone_url };

        db.upsertPackage({
          source_id: source.id,
          name: repo.name,
          display_name: repo.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: repo.description || `${installType} from ${owner}`,
          author: owner,
          package_type: installType === 'mcp' ? 'mcp_server' : installType,
          waggle_install_type: installType as 'skill' | 'plugin' | 'mcp',
          waggle_install_path: installType === 'skill'
            ? `skills/${repo.name}.md`
            : installType === 'plugin'
              ? `plugins/${repo.name}/`
              : `.mcp.json`,
          version: '1.0.0',
          license: repo.license?.spdx_id || null,
          repository_url: repo.html_url,
          homepage_url: repo.homepage || null,
          downloads: 0,
          stars: repo.stargazers_count || 0,
          category: installType === 'mcp' ? 'integration' : 'development',
          platforms: JSON.stringify(['claude_code', 'waggle']) as any,
          dependencies: JSON.stringify([]) as any,
          packs: JSON.stringify([]) as any,
          install_manifest: JSON.stringify(manifest) as any,
        });

        result.added++;
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── ClawHub Adapter ────────────────────────────────────────────────

const clawhubAdapter: SyncAdapter = {
  name: 'clawhub',

  canSync(source) {
    return source.name === 'clawhub' || source.url.includes('clawhub.ai');
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      const apiBase = source.api_endpoint || 'https://clawhub.ai/api/v1';
      const perPage = 50;
      let hasMore = true;

      // Resume from saved sync state
      const syncState = db.getSyncState(source.id) || {};
      let page = (syncState.lastPage as number) || 1;
      const totalSyncedPrior = (syncState.totalSynced as number) || 0;
      const maxPage = 10; // Cap at 500 skills per full sync cycle

      while (hasMore && page <= maxPage) {
        const url = `${apiBase}/skills?page=${page}&per_page=${perPage}&sort=downloads`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'waggle-marketplace-sync' },
        });

        // Rate limited — save progress and return gracefully
        if (response.status === 429) {
          db.setSyncState(source.id, {
            lastPage: page,
            totalSynced: totalSyncedPrior + result.added,
            lastSyncedAt: new Date().toISOString(),
          });
          result.errors.push(
            `ClawHub rate limit reached at page ${page}. ` +
            `Progress saved — next sync will resume from page ${page}.`,
          );
          return result;
        }

        if (!response.ok) {
          result.errors.push(`ClawHub API page ${page}: ${response.status}`);
          break;
        }

        const data = await response.json() as any;
        const skills = data.skills || data.data || data;

        if (!Array.isArray(skills) || skills.length === 0) {
          // Full sync complete — reset sync state
          db.setSyncState(source.id, null);
          hasMore = false;
          break;
        }

        for (const skill of skills) {
          const manifest: InstallManifest = {
            skill_url: skill.raw_url || skill.download_url || `${apiBase}/skills/${skill.id || skill.slug}/raw`,
          };

          db.upsertPackage({
            source_id: source.id,
            name: skill.slug || skill.name?.toLowerCase().replace(/\s+/g, '-'),
            display_name: skill.name || skill.title,
            description: skill.description || '',
            author: skill.author || skill.creator || 'community',
            package_type: 'skill',
            waggle_install_type: 'skill',
            waggle_install_path: `skills/${skill.slug || skill.name?.toLowerCase().replace(/\s+/g, '-')}.md`,
            version: skill.version || '1.0.0',
            license: skill.license || 'MIT',
            repository_url: skill.repository_url || null,
            homepage_url: skill.homepage || `https://clawhub.ai/skills/${skill.slug || skill.id}`,
            downloads: skill.downloads || skill.download_count || 0,
            stars: skill.stars || skill.likes || 0,
            rating: skill.rating || 0,
            rating_count: skill.rating_count || 0,
            category: skill.category || 'general',
            platforms: JSON.stringify(skill.platforms || ['claude_code', 'waggle']) as any,
            dependencies: JSON.stringify(skill.dependencies || []) as any,
            packs: JSON.stringify([]) as any,
            install_manifest: JSON.stringify(manifest) as any,
          });

          result.added++;
        }

        hasMore = skills.length === perPage;
        page++;

        // Save progress after each page
        if (hasMore) {
          db.setSyncState(source.id, {
            lastPage: page,
            totalSynced: totalSyncedPrior + result.added,
            lastSyncedAt: new Date().toISOString(),
          });
        } else {
          // Full sync complete (or reached last page) — reset sync state
          db.setSyncState(source.id, null);
        }
      }

      // If we hit the page cap, save state for next run
      if (page > maxPage && hasMore) {
        db.setSyncState(source.id, {
          lastPage: page,
          totalSynced: totalSyncedPrior + result.added,
          lastSyncedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── SkillsMP Adapter ───────────────────────────────────────────────

const skillsmpAdapter: SyncAdapter = {
  name: 'skillsmp',

  canSync(source) {
    return source.name === 'skillsmp' || source.url.includes('skillsmp.dev') || source.url.includes('skillsmp.com');
  },

  async sync(source, db, vaultLookup?) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      const apiBase = source.api_endpoint || 'https://skillsmp.com/api/v1';
      const perPage = 50; // SkillsMP caps at 50 per page

      // Build auth headers from vault
      const headers: Record<string, string> = { 'User-Agent': 'waggle-marketplace-sync', 'Accept': 'application/json' };
      if (vaultLookup) {
        const apiKey = vaultLookup(`marketplace:source:${source.name}:api_key`);
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      }

      // SkillsMP uses a search endpoint (no list-all). Query by broad categories to cover all skills.
      const queries = [
        'code', 'python', 'javascript', 'typescript', 'react', 'api', 'data', 'test',
        'deploy', 'docker', 'git', 'write', 'research', 'design', 'security', 'database',
        'marketing', 'web', 'ai', 'agent', 'claude', 'devops', 'aws', 'linux', 'css',
        'node', 'rust', 'go', 'java', 'swift', 'mobile', 'review', 'debug', 'build',
        'format', 'lint', 'document', 'email', 'sql', 'graphql', 'frontend', 'backend',
      ];
      const seenIds = new Set<string>();

      // Resume from saved sync state
      const syncState = db.getSyncState(source.id) || {};
      const completedQueries = new Set<string>((syncState.completedQueries as string[]) || []);
      let startQueryIndex = (syncState.lastQueryIndex as number) || 0;
      let startPage = (syncState.lastPage as number) || 1;
      const totalSyncedPrior = (syncState.totalSynced as number) || 0;

      for (let qi = startQueryIndex; qi < queries.length; qi++) {
        const query = queries[qi];

        // Skip queries already fully synced in a previous run
        if (completedQueries.has(query)) continue;

        // For the resumed query, start from lastPage; for subsequent queries, start from 1
        let page = (qi === startQueryIndex) ? startPage : 1;
        let hasMore = true;

        while (hasMore) {
          const url = `${apiBase}/skills/search?q=${encodeURIComponent(query)}&limit=${perPage}&page=${page}`;
          const response = await fetch(url, { headers });

          if (!response.ok) {
            if (response.status === 429) {
              // Rate limited — save progress and return gracefully
              db.setSyncState(source.id, {
                lastQueryIndex: qi,
                lastPage: page,
                completedQueries: Array.from(completedQueries),
                totalSynced: totalSyncedPrior + result.added,
                lastSyncedAt: new Date().toISOString(),
              });
              result.errors.push(
                `SkillsMP rate limit reached at query "${query}" page ${page}. ` +
                `Progress saved (${completedQueries.size}/${queries.length} queries complete). ` +
                `Next sync will resume from here.`,
              );
              return result;
            }
            result.errors.push(`SkillsMP API q=${query} page ${page}: ${response.status}`);
            break;
          }

          const data = await response.json() as any;
          const skills = data?.data?.skills || data?.skills || data?.data || [];

          if (!Array.isArray(skills) || skills.length === 0) {
            hasMore = false;
            break;
          }

        for (const skill of skills) {
          // Dedup across queries by skill ID
          const skillId = skill.id || skill.slug || skill.name;
          if (!skillId || seenIds.has(skillId)) continue;
          seenIds.add(skillId);

          const manifest: InstallManifest = {
            skill_url: skill.githubUrl
              ? `https://raw.githubusercontent.com/${skill.githubUrl.replace('https://github.com/', '').replace('/tree/main/', '/main/')}/SKILL.md`
              : skill.skillUrl || `https://skillsmp.com/skills/${skillId}`,
          };

          db.upsertPackage({
            source_id: source.id,
            name: `skillsmp-${slugify(String(skill.name || skillId))}`,
            display_name: skill.name || skill.title || skillId,
            description: skill.description || '',
            author: skill.author || 'community',
            package_type: 'skill',
            waggle_install_type: 'skill',
            waggle_install_path: `skills/${slugify(String(skill.name || skillId))}.md`,
            version: '1.0.0',
            license: 'MIT',
            repository_url: skill.githubUrl || null,
            homepage_url: skill.skillUrl || `https://skillsmp.com/skills/${skillId}`,
            downloads: 0,
            stars: skill.stars || 0,
            category: skill.category || 'general',
            platforms: JSON.stringify(['claude_code', 'codex', 'cursor', 'waggle']) as any,
            dependencies: JSON.stringify([]) as any,
            packs: JSON.stringify([]) as any,
            install_manifest: JSON.stringify(manifest) as any,
          });

          result.added++;
        }

          const pagination = data?.data?.pagination;
          hasMore = pagination?.hasNext === true && skills.length > 0;
          page++;

          // Respect rate limits
          await new Promise(r => setTimeout(r, 250));
        } // end while pages

        // This query is fully synced
        completedQueries.add(query);
      } // end for queries

      // All queries complete — reset sync state (ready for next full cycle)
      db.setSyncState(source.id, null);
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── LobeHub Adapter ────────────────────────────────────────────────

const lobehubAdapter: SyncAdapter = {
  name: 'lobehub',

  canSync(source) {
    return source.name === 'lobehub_plugins' || source.url.includes('lobehub');
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      const indexUrl = source.api_endpoint || 'https://chat-plugins.lobehub.com/index.json';
      const response = await fetch(indexUrl);
      if (!response.ok) throw new Error(`LobeHub index: ${response.status}`);

      const data = await response.json() as any;
      const plugins = data.plugins || data;

      if (!Array.isArray(plugins)) throw new Error('Unexpected LobeHub response format');

      for (const plugin of plugins) {
        const manifest: InstallManifest = {
          plugin_manifest: {
            name: plugin.identifier || plugin.name,
            version: plugin.version || '1.0.0',
            description: plugin.description || '',
            skills: [],
            mcpServers: plugin.api ? [{
              name: plugin.identifier,
              command: 'npx',
              args: ['-y', `@lobehub/${plugin.identifier}`],
            }] : [],
          },
        };

        db.upsertPackage({
          source_id: source.id,
          name: plugin.identifier || plugin.name?.toLowerCase().replace(/\s+/g, '-'),
          display_name: plugin.name || plugin.identifier,
          description: plugin.description || '',
          author: plugin.author || 'lobehub',
          package_type: 'plugin',
          waggle_install_type: 'plugin',
          waggle_install_path: `plugins/${plugin.identifier}/`,
          version: plugin.version || '1.0.0',
          license: 'MIT',
          repository_url: `https://github.com/lobehub/lobe-chat-plugins/tree/main/plugins/${plugin.identifier}`,
          homepage_url: plugin.homepage || `https://lobehub.com/plugins/${plugin.identifier}`,
          downloads: plugin.installs || 0,
          stars: 0,
          category: plugin.category || 'integration',
          platforms: JSON.stringify(['lobehub', 'waggle']) as any,
          dependencies: JSON.stringify([]) as any,
          packs: JSON.stringify([]) as any,
          install_manifest: JSON.stringify(manifest) as any,
        });

        result.added++;
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── Generic JSON Adapter ───────────────────────────────────────────

const genericAdapter: SyncAdapter = {
  name: 'generic',

  canSync(source) {
    return !!source.api_endpoint;
  },

  async sync(source, db) {
    const result: SyncResult = { source: source.name, added: 0, updated: 0, removed: 0, errors: [] };

    try {
      const response = await fetch(source.api_endpoint!);
      if (!response.ok) throw new Error(`API ${response.status}`);

      const data = await response.json() as any;
      const items = Array.isArray(data) ? data : data.skills || data.plugins || data.data || [];

      for (const item of items) {
        db.upsertPackage({
          source_id: source.id,
          name: item.slug || item.name?.toLowerCase().replace(/\s+/g, '-') || `${source.name}-${result.added}`,
          display_name: item.name || item.title || item.slug,
          description: item.description || '',
          author: item.author || source.name,
          package_type: item.type || 'skill',
          waggle_install_type: item.type === 'mcp' ? 'mcp' : item.type === 'plugin' ? 'plugin' : 'skill',
          waggle_install_path: `skills/${item.slug || item.name?.toLowerCase().replace(/\s+/g, '-')}.md`,
          version: item.version || '1.0.0',
          repository_url: item.repository_url || null,
          homepage_url: item.url || null,
          downloads: item.downloads || item.installs || 0,
          stars: item.stars || item.likes || 0,
          category: item.category || 'general',
          platforms: JSON.stringify(['waggle']) as any,
          dependencies: JSON.stringify([]) as any,
          packs: JSON.stringify([]) as any,
          install_manifest: JSON.stringify({
            skill_url: item.raw_url || item.content_url,
          }) as any,
        });

        result.added++;
      }
    } catch (err) {
      result.errors.push(safeErrorText(err));
    }

    return result;
  },
};

// ─── Deduplication ─────────────────────────────────────────────────

/**
 * Normalize a package name for dedup comparison.
 * Strips source-name prefixes, lowercases, removes hyphens/underscores.
 */
export function normalizeName(name: string): string {
  // Remove common source prefixes (e.g., "awesome-mcp-servers-" prefix, "npm-mcp-servers-")
  let n = name.replace(
    /^(?:awesome-mcp-servers|awesome-claude-skills-travisvn|awesome-agent-skills-[a-z]+|awesome-cc-plugins|awesome-claude-plugins-[a-z]+|npm-mcp-servers|npm-mcp-protocol|skills-sh|agent-skills-cc|mcpmarket|skillsdirectory|mcpservers-org|awesome-skills-app|claude-skills-collection|plugins-plus-skills|antigravity-awesome-skills|skillmatic-awesome-skills|alirezarezvani-claude-skills|microsoft-skills|muratcankoylan-context-engineering|hoodini-ai-agents-skills|hashicorp-agent-skills|supabase-agent-skills|callstack-agent-skills|ckanner-agent-skills)-/i,
    '',
  );
  return n.toLowerCase().replace(/[-_]/g, '');
}

/**
 * Remove duplicate packages from the database.
 * Keeps the entry with the highest (stars + downloads) for each normalized name.
 *
 * @returns Count of duplicates removed
 */
export function deduplicatePackages(db: MarketplaceDB): number {
  const rawDb = (db as any).db;

  // Get all packages with their scores
  const allPackages = rawDb.prepare(
    `SELECT id, name, stars, downloads FROM packages ORDER BY (stars + downloads) DESC`
  ).all() as Array<{ id: number; name: string; stars: number; downloads: number }>;

  // Group by normalized name
  const groups = new Map<string, typeof allPackages>();
  for (const pkg of allPackages) {
    const norm = normalizeName(pkg.name);
    if (!norm) continue;
    const group = groups.get(norm) || [];
    group.push(pkg);
    groups.set(norm, group);
  }

  // Find duplicates (groups with > 1 entry)
  const toDelete: number[] = [];
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    // Already sorted by score desc -- keep the first, delete the rest
    for (let i = 1; i < group.length; i++) {
      toDelete.push(group[i].id);
    }
  }

  if (toDelete.length === 0) return 0;

  // Delete in batches (SQLite has a limit on bound parameters)
  const batchSize = 100;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    // Delete from related tables first
    rawDb.prepare(`DELETE FROM pack_packages WHERE package_id IN (${placeholders})`).run(...batch);
    rawDb.prepare(`DELETE FROM package_tags WHERE package_id IN (${placeholders})`).run(...batch);
    // Delete from packages (FTS content-sync table is external-content;
    // stale FTS entries for deleted rows are harmless and cleaned on rebuild)
    rawDb.prepare(`DELETE FROM packages WHERE id IN (${placeholders})`).run(...batch);
  }

  return toDelete.length;
}

// ─── Sync Engine ────────────────────────────────────────────────────

/**
 * Adapter priority order matters! More specific adapters must come before
 * generic ones. The first adapter whose canSync() returns true is used.
 */
const ADAPTERS: SyncAdapter[] = [
  clawhubAdapter,
  skillsmpAdapter,
  lobehubAdapter,
  awesomeListAdapter,       // Before github -- matches awesome-* community repos
  githubRepoContentAdapter, // Before github -- matches community repos with specific repo path
  npmSearchAdapter,         // NPM registry sources
  webRegistryAdapter,       // Before generic -- handles aggregators with api_endpoint
  githubAdapter,            // GitHub orgs and official repos
  genericAdapter,           // Fallback for anything with an api_endpoint
];

export class MarketplaceSync {
  private db: MarketplaceDB;
  private vaultLookup?: VaultLookupFn;

  constructor(db: MarketplaceDB, vaultLookup?: VaultLookupFn) {
    this.db = db;
    this.vaultLookup = vaultLookup;
  }

  /**
   * Sync packages from all (or specified) sources.
   */
  async syncAll(options: SyncOptions = {}): Promise<SyncResult[]> {
    const sources = this.db.listSources();
    const filteredSources = options.sources
      ? sources.filter(s => options.sources!.includes(s.name))
      : sources;

    const results: SyncResult[] = [];

    for (const source of filteredSources) {
      console.log(`[sync] Syncing from ${source.display_name}...`);

      const adapter = ADAPTERS.find(a => a.canSync(source));
      if (!adapter) {
        results.push({
          source: source.name,
          added: 0,
          updated: 0,
          removed: 0,
          errors: [`No sync adapter for source type: ${source.source_type}`],
        });
        continue;
      }

      try {
        const result = await adapter.sync(source, this.db, this.vaultLookup);
        results.push(result);
        console.log(`[sync] ${source.display_name}: +${result.added} added, ${result.errors.length} errors`);
      } catch (err) {
        results.push({
          source: source.name,
          added: 0,
          updated: 0,
          removed: 0,
          errors: [safeErrorText(err)],
        });
      }
    }

    // Run dedup after syncing all sources
    if (!options.sources) {
      const removed = deduplicatePackages(this.db);
      if (removed > 0) {
        console.log(`[sync] Dedup: removed ${removed} duplicate packages`);
      }
    }

    return results;
  }
}
