/**
 * extension-catalog — pure normalizers for the S21 Marketplace/Extend surface
 * (UX-Refactor Phase 4B). Merges the six B7 extension domains into ONE
 * `Extension[]` view-model, federating AT READ (A5 — no marketplace.db
 * migration, no fake remote entries):
 *
 *  | facet     | source                                            | install path        |
 *  |-----------|---------------------------------------------------|---------------------|
 *  | skill     | marketplace registry packages + skill packs       | real (marketplace)  |
 *  | mcp       | GET /api/mcps (catalog ⋈ runtime)                 | via MCP Hub (S08)   |
 *  | agent     | GET /api/personas                                 | local — Agent Center|
 *  | connector | GET /api/connectors                               | local — Connector Hub|
 *  | model     | GET /api/litellm/models                           | local — Settings    |
 *  | template  | GET /api/workspace-templates                      | local — Home        |
 *
 * Pure module (no adapter import) so the merge/derivation logic is unit-
 * testable without rendering React.
 */
import type { ExtensionType } from '@waggle/shared';
import type { ConnectorDefinition } from '@waggle/shared';
import { normalizeMcpId } from '@waggle/shared';
import type { Persona, WorkspaceTemplate } from './types';

// Re-exported so the dedup key can be computed by any caller (and tested) from
// one place. Same canonical normalizer the MCP catalog uses to collapse
// "Airtable" / "airtable-mcp" / "@scope/server-airtable" to one key.
export { normalizeMcpId };

/** §14.7 lifecycle subset derivable from today's backends. */
export type ExtensionLifecycle = 'available' | 'installed';

export interface Extension {
  /** Namespaced id — unique across all six domains. */
  id: string;
  name: string;
  description: string;
  type: ExtensionType;
  /** Honest provenance label rendered on the card. */
  source: string;
  installed: boolean;
  lifecycle: ExtensionLifecycle;
  /** True when S21 can install it directly (marketplace-backed). */
  installable: boolean;
  /** Install dispatch discriminator. */
  kind: 'package' | 'pack' | 'federated';
  /** Numeric registry id (kind 'package' only). */
  packageId?: number;
  /** Security-scan state from the marketplace registry. */
  scanStatus?: 'passed' | 'failed' | 'not_scanned';
  trust?: string;
  category?: string;
  /** Deep-link CTA for federated entries / advanced management (e.g. the Hub). */
  openIn?: { appId: string; label: string };
  /** Connector auth method — drives token-paste (bearer/api_key/basic) vs
   *  OAuth-redirect (the Hub) in the grid's in-place Connect flow (PR4 D3). */
  authType?: ConnectorDefinition['authType'];
  /** Namespaced ids of the alternate forms this winner absorbed at dedup
   *  (`dedupeExtensions`) — e.g. a connector winner records its `mcp:` and
   *  `pkg:` twins. Used to resolve installed-state across every form. */
  altIds?: string[];
  /** Distinct provenance forms this row represents ('connector' | 'mcp' |
   *  'package', precedence-ordered). `length > 1` ⇒ a genuinely multi-form
   *  integration — the card renders a "Connector + MCP" badge so it reads as
   *  merged, not silently dropped. Distinct from the singular `source` label. */
  sources?: string[];
}

/** Marketplace registry row (numeric-id /api/marketplace search envelope).
 *  Real rows discriminate the install domain via `waggle_install_type`
 *  (the packages table has no `type` column) — `type` is kept only for
 *  legacy fixtures. */
export interface MarketplacePackageRow {
  id: number;
  name: string;
  description: string;
  type?: string;
  waggle_install_type?: string;
  category?: string;
  source?: string;
  installed?: boolean;
  scanStatus?: 'passed' | 'failed' | 'not_scanned';
  scanScore?: number;
}

/** Raw GET /api/marketplace/packs row — the route returns db.listPacks()
 *  verbatim (MarketplacePack: id:number, slug, display_name, description,
 *  target_roles, icon, priority, connectors_needed, created_at). There is NO
 *  name/installed/trust/category on real rows; the optional fields below also
 *  accept the legacy FE SkillPack shape so older fixtures keep working. */
export interface MarketplacePackRow {
  id?: number | string;
  slug?: string;
  display_name?: string;
  name?: string;
  description?: string;
  category?: string;
  trust?: string;
  installed?: boolean;
}

/** MCP Hub list item subset needed here (see mcp-hub-types.ts). */
export interface McpCatalogRow {
  id: string;
  name: string;
  description: string;
  category: string;
  installed: boolean;
}

const lifecycle = (installed: boolean): ExtensionLifecycle => (installed ? 'installed' : 'available');

export function fromMarketplacePackage(pkg: MarketplacePackageRow): Extension {
  // Real rows carry waggle_install_type, never `type` (legacy fixtures only).
  const installType = pkg.waggle_install_type ?? pkg.type;
  const installed = Boolean(pkg.installed); // SQLite emits 0/1
  return {
    id: `pkg:${pkg.id}`,
    name: pkg.name ?? '',
    description: pkg.description ?? '',
    type: installType === 'mcp' ? 'mcp' : 'skill',
    source: pkg.source ?? 'marketplace',
    installed,
    lifecycle: lifecycle(installed),
    installable: true,
    kind: 'package',
    packageId: pkg.id,
    ...(pkg.scanStatus ? { scanStatus: pkg.scanStatus } : {}),
    ...(pkg.category ? { category: pkg.category } : {}),
  };
}

export function fromSkillPack(pack: MarketplacePackRow): Extension {
  // Normalize the RAW MarketplacePack row at the boundary: real rows have
  // slug/display_name only (no name/installed/trust) — reading pack.name
  // unguarded crashed sortExtensions with the live 18-pack registry.
  const name = pack.display_name ?? pack.name ?? String(pack.slug ?? pack.id ?? 'pack');
  const installed = pack.installed === true;
  return {
    id: `pack:${pack.slug ?? pack.id ?? name}`,
    name,
    description: pack.description ?? '',
    type: 'skill',
    source: 'marketplace pack',
    installed,
    lifecycle: lifecycle(installed),
    // Browse-only (A4 honesty): no pack-install route exists server-side —
    // POST /api/marketplace/install resolves PACKAGE ids, so posting a pack
    // id would install an unrelated entity (or 404). Flip this back when a
    // real install-pack route ships.
    installable: false,
    kind: 'pack',
    ...(pack.trust ? { trust: pack.trust } : {}),
    ...(pack.category ? { category: pack.category } : {}),
  };
}

export function fromConnector(conn: ConnectorDefinition): Extension {
  const installed = conn.status === 'connected';
  return {
    id: `connector:${conn.id}`,
    name: conn.name,
    description: conn.description ?? '',
    type: 'connector',
    source: 'local registry',
    installed,
    lifecycle: lifecycle(installed),
    // PR4 D3: connectable in-place — token-paste (bearer/api_key/basic) writes
    // the credential to the vault here; OAuth-only falls back to the Hub (the
    // card branches on authType). The Hub deep-link stays for management.
    installable: true,
    kind: 'federated',
    authType: conn.authType,
    ...(conn.category ? { category: conn.category } : {}),
    openIn: { appId: 'connectors', label: 'Connector Hub' },
  };
}

export function fromPersona(persona: Persona): Extension {
  return {
    id: `agent:${persona.id}`,
    name: persona.name,
    description: persona.description ?? '',
    type: 'agent',
    source: 'built-in persona',
    installed: true,
    lifecycle: 'installed',
    installable: false,
    kind: 'federated',
    openIn: { appId: 'agents', label: 'Agents' },
  };
}

export function fromModel(modelId: string): Extension {
  return {
    id: `model:${modelId}`,
    name: modelId,
    description: 'Model available through the configured providers',
    type: 'model',
    source: 'LLM router',
    installed: true,
    lifecycle: 'installed',
    installable: false,
    kind: 'federated',
    openIn: { appId: 'settings', label: 'Settings' },
  };
}

export function fromTemplate(tpl: WorkspaceTemplate): Extension {
  return {
    id: `template:${tpl.id}`,
    name: tpl.name,
    description: tpl.description ?? '',
    type: 'template',
    source: tpl.builtIn ? 'built-in template' : 'custom template',
    installed: true,
    lifecycle: 'installed',
    installable: false,
    kind: 'federated',
    ...(tpl.category ? { category: tpl.category } : {}),
    openIn: { appId: 'home', label: 'Home' },
  };
}

export function fromMcpCatalogRow(row: McpCatalogRow): Extension {
  return {
    id: `mcp:${row.id}`,
    name: row.name,
    description: row.description ?? '',
    type: 'mcp',
    source: 'MCP catalog',
    installed: row.installed,
    lifecycle: lifecycle(row.installed),
    // PR4 D3: enableable in-place — installMcp still rides the real
    // SecurityGate + PRO gate server-side; the Hub deep-link stays for
    // managing running servers.
    installable: true,
    kind: 'federated',
    category: row.category,
    openIn: { appId: 'mcp-hub', label: 'MCP Hub' },
  };
}

/** Case-insensitive name/description filter shared by every facet.
 *  Defensive `?? ''`: rows from raw server envelopes can miss fields the
 *  Extension typing promises — a search keystroke must never throw in render. */
export function filterExtensions(list: Extension[], query: string): Extension[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(e =>
    (e.name ?? '').toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q),
  );
}

/** Stable merged ordering: installed last within a facet, name asc. */
export function sortExtensions(list: Extension[]): Extension[] {
  return [...list].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? 1 : -1;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });
}

/** Collapsible provenance forms in winner-precedence order — the connector's
 *  vault-connect UX is the richest, then the catalog-mcp enable, then the
 *  marketplace package. Any other form (pack) never wins over these three. */
const SOURCE_PRECEDENCE = ['connector', 'mcp', 'package'] as const;

/** The provenance form of an extension, keyed off its namespaced-id prefix. */
function sourceForm(ext: Extension): string {
  if (ext.id.startsWith('connector:')) return 'connector';
  if (ext.id.startsWith('mcp:')) return 'mcp';
  if (ext.id.startsWith('pkg:')) return 'package';
  return ext.kind; // 'pack' / other — outranked by all three above
}

function precedenceRank(form: string): number {
  const i = (SOURCE_PRECEDENCE as readonly string[]).indexOf(form);
  return i === -1 ? SOURCE_PRECEDENCE.length : i;
}

/**
 * Collapse the three catalog sources (native connector / local MCP catalog /
 * marketplace package) into ONE deduped entry per integration — display-layer
 * only, no server/db change. The same integration otherwise appears up to 3×
 * with distinct namespaced ids (connector:airtable 'Connect' /
 * mcp:airtable-mcp 'Enable' / pkg:… 'Add'), and every installed MCP appears
 * twice within the mcp facet (catalog `mcp:` row + package `pkg:` row).
 *
 * Identity key = `normalizeMcpId(name)`. Within a colliding group the WINNER is
 * the highest-precedence form (connector > catalog-mcp > package); the losers'
 * ids fold into `altIds` and their forms into `sources`. Installed-state is
 * OR-ed across every form (installed if ANY form is). Entries whose key is
 * unique pass through untouched (no altIds/sources added).
 */
export function dedupeExtensions(list: Extension[]): Extension[] {
  const groups = new Map<string, Extension[]>();
  const order: string[] = [];
  for (const ext of list) {
    const key = normalizeMcpId(ext.name ?? '');
    const group = groups.get(key);
    if (group) {
      group.push(ext);
    } else {
      groups.set(key, [ext]);
      order.push(key);
    }
  }

  const out: Extension[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    // Winner = lowest precedence rank; stable (first-seen) on a tie.
    let winner = group[0];
    for (let i = 1; i < group.length; i++) {
      if (precedenceRank(sourceForm(group[i])) < precedenceRank(sourceForm(winner))) {
        winner = group[i];
      }
    }
    const installedAny = group.some(e => e.installed);
    // Distinct forms present, precedence-ordered, with any non-standard form
    // (pack) appended so the "N + M" badge stays deterministic.
    const forms = new Set(group.map(sourceForm));
    const sources = [
      ...SOURCE_PRECEDENCE.filter(f => forms.has(f)),
      ...[...forms].filter(f => !(SOURCE_PRECEDENCE as readonly string[]).includes(f)),
    ];
    out.push({
      ...winner,
      installed: installedAny,
      lifecycle: installedAny ? 'installed' : winner.lifecycle,
      altIds: group.filter(e => e !== winner).map(e => e.id),
      sources,
    });
  }
  return out;
}
