/**
 * Marketplace Commands — slash commands for marketplace interaction.
 *
 * Sub-commands:
 *   /marketplace search <query>   — search marketplace catalog
 *   /marketplace install <name>   — install a package by name
 *   /marketplace packs            — list capability packs
 *   /marketplace installed        — list installed packages
 *   /marketplace sync             — sync marketplace from sources
 *
 * Aliases: /mp, /market
 */

import type { CommandRegistry, CommandDefinition } from './command-registry.js';

const BASE_URL = 'http://127.0.0.1:3333';

/** Format a marketplace search result table from API response. */
function formatSearchResults(data: {
  packages: Array<{
    id: number;
    name: string;
    description: string;
    package_type: string;
    category?: string;
  }>;
  total: number;
}): string {
  if (!data.packages || data.packages.length === 0) {
    return 'No packages found.';
  }

  const lines: string[] = [
    `## Marketplace Search Results (${data.total} total)`,
    '',
    '| # | Name | Type | Category | Description |',
    '|---|------|------|----------|-------------|',
  ];

  for (const [i, pkg] of data.packages.slice(0, 10).entries()) {
    const desc = pkg.description?.length > 60
      ? pkg.description.slice(0, 57) + '...'
      : (pkg.description || '—');
    lines.push(
      `| ${i + 1} | \`${pkg.name}\` | ${pkg.package_type} | ${pkg.category || '—'} | ${desc} |`,
    );
  }

  if (data.total > 10) {
    lines.push('', `_Showing top 10 of ${data.total} results._`);
  }

  return lines.join('\n');
}

/** Format pack list grouped by priority tier. */
function formatPacks(data: {
  packs: Array<{
    slug: string;
    display_name: string;
    description: string;
    priority: string;
    target_roles?: string;
  }>;
  total: number;
}): string {
  if (!data.packs || data.packs.length === 0) {
    return 'No capability packs available.';
  }

  // Group by priority
  const groups = new Map<string, typeof data.packs>();
  for (const pack of data.packs) {
    const tier = pack.priority || 'default';
    if (!groups.has(tier)) groups.set(tier, []);
    groups.get(tier)!.push(pack);
  }

  const lines: string[] = [
    `## Capability Packs (${data.total} total)`,
    '',
  ];

  for (const [tier, packs] of groups) {
    lines.push(`### ${tier.charAt(0).toUpperCase() + tier.slice(1)} Priority`);
    lines.push('');
    for (const pack of packs) {
      lines.push(`- **${pack.display_name}** (\`${pack.slug}\`)`);
      if (pack.description) lines.push(`  ${pack.description}`);
      if (pack.target_roles) lines.push(`  _Roles: ${pack.target_roles}_`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Format installed packages list. */
function formatInstalled(data: {
  installations: Array<{
    id: number;
    package_id: number;
    package_name?: string;
    name?: string;
    install_type?: string;
    installed_at?: string;
    status?: string;
  }>;
  total: number;
}): string {
  if (!data.installations || data.installations.length === 0) {
    return 'No packages currently installed.';
  }

  const lines: string[] = [
    `## Installed Packages (${data.total})`,
    '',
    '| # | Name | Type | Status | Installed |',
    '|---|------|------|--------|-----------|',
  ];

  for (const [i, inst] of data.installations.entries()) {
    const name = inst.package_name || inst.name || `pkg-${inst.package_id}`;
    const dateStr = inst.installed_at
      ? new Date(inst.installed_at).toLocaleDateString()
      : '—';
    lines.push(
      `| ${i + 1} | \`${name}\` | ${inst.install_type || '—'} | ${inst.status || 'installed'} | ${dateStr} |`,
    );
  }

  return lines.join('\n');
}

function marketplaceCommand(): CommandDefinition {
  return {
    name: 'marketplace',
    aliases: ['mp', 'market'],
    description: 'Marketplace — search, install, list packs, view installed, sync',
    usage: '/marketplace <search|install|packs|installed|sync> [args]',
    handler: async (args, _ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        return [
          '## Marketplace Commands',
          '',
          '| Sub-command | Description |',
          '|-------------|-------------|',
          '| `/marketplace search <query>` | Search the marketplace catalog |',
          '| `/marketplace install <name>` | Install a package by name |',
          '| `/marketplace packs` | List capability packs |',
          '| `/marketplace installed` | List installed packages |',
          '| `/marketplace sync` | Sync marketplace from sources |',
          '',
          '_Aliases: `/mp`, `/market`_',
        ].join('\n');
      }

      // Parse sub-command and remaining args
      const spaceIdx = trimmed.indexOf(' ');
      const subCommand = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const subArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

      switch (subCommand.toLowerCase()) {
        case 'search': {
          if (!subArgs) {
            return 'Missing query. Usage: `/marketplace search <query>`\n\nExample: `/marketplace search research`';
          }

          try {
            const url = `${BASE_URL}/api/marketplace/search?query=${encodeURIComponent(subArgs)}&limit=10`;
            const response = await fetch(url);
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: response.statusText }));
              return `Marketplace search failed: ${(err as any).error || response.statusText}`;
            }
            const data = await response.json();
            return formatSearchResults(data as any);
          } catch (err) {
            return `Marketplace search error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        case 'install': {
          if (!subArgs) {
            return 'Missing package name. Usage: `/marketplace install <name>`\n\nExample: `/marketplace install deep-research`';
          }

          try {
            // Step 1: Search for the package by name to get its ID
            const searchUrl = `${BASE_URL}/api/marketplace/search?query=${encodeURIComponent(subArgs)}&limit=5`;
            const searchResp = await fetch(searchUrl);
            if (!searchResp.ok) {
              return `Failed to search marketplace: ${searchResp.statusText}`;
            }
            const searchData = await searchResp.json() as {
              packages: Array<{ id: number; name: string; description: string }>;
              total: number;
            };

            // Find exact match or best match
            const exact = searchData.packages.find(
              p => p.name.toLowerCase() === subArgs.toLowerCase(),
            );
            const target = exact || searchData.packages[0];

            if (!target) {
              return `No package found matching "${subArgs}". Try \`/marketplace search ${subArgs}\` to see available packages.`;
            }

            if (!exact && target.name.toLowerCase() !== subArgs.toLowerCase()) {
              // Warn if we're installing a non-exact match
              // Still proceed with best match
            }

            // Step 2: Install by package ID
            const installResp = await fetch(`${BASE_URL}/api/marketplace/install`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ packageId: target.id }),
            });

            const installData = await installResp.json() as {
              success: boolean;
              message?: string;
              error?: string;
            };

            if (installData.success) {
              return `Successfully installed **${target.name}**.\n\n${installData.message || ''}`;
            } else {
              return `Failed to install "${target.name}": ${installData.message || installData.error || 'Unknown error'}`;
            }
          } catch (err) {
            return `Install error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        case 'packs': {
          try {
            const response = await fetch(`${BASE_URL}/api/marketplace/packs`);
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: response.statusText }));
              return `Failed to list packs: ${(err as any).error || response.statusText}`;
            }
            const data = await response.json();
            return formatPacks(data as any);
          } catch (err) {
            return `Packs error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        case 'installed': {
          try {
            const response = await fetch(`${BASE_URL}/api/marketplace/installed`);
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: response.statusText }));
              return `Failed to list installed: ${(err as any).error || response.statusText}`;
            }
            const data = await response.json();
            return formatInstalled(data as any);
          } catch (err) {
            return `Installed error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        case 'sync': {
          try {
            const response = await fetch(`${BASE_URL}/api/marketplace/sync`, {
              method: 'POST',
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: response.statusText }));
              return `Sync failed: ${(err as any).error || response.statusText}`;
            }
            const data = await response.json() as {
              results?: Array<{ source: string; added: number; updated: number; errors: string[] }>;
              message?: string;
            };

            if (data.results && data.results.length > 0) {
              const lines = ['## Marketplace Sync Complete', ''];
              for (const r of data.results) {
                const errorNote = r.errors.length > 0 ? ` (${r.errors.length} errors)` : '';
                lines.push(`- **${r.source}**: +${r.added} added, ${r.updated} updated${errorNote}`);
              }
              return lines.join('\n');
            }

            return data.message || 'Marketplace sync complete.';
          } catch (err) {
            return `Sync error: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        default:
          return [
            `Unknown sub-command \`${subCommand}\`.`,
            '',
            'Available sub-commands: `search`, `install`, `packs`, `installed`, `sync`',
            '',
            'Usage: `/marketplace <sub-command> [args]`',
          ].join('\n');
      }
    },
  };
}

// ── Registration ────────────────────────────────────────────────────────

export function registerMarketplaceCommands(registry: CommandRegistry): void {
  registry.register(marketplaceCommand());
}
