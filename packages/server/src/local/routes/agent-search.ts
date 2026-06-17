/**
 * POST /api/marketplace/agent-search — the agent-pick engine as an HTTP
 * surface (PR4 Variation A / screen 09's centered ask bar). Wraps the existing
 * `searchCapabilities()` engine (which the acquire_capability chat tool calls
 * but discards) and ALSO adds a connector lane the engine cannot produce
 * (connectors live in the registry, not the marketplace), so the suggestion
 * box can show the design's "connector + skill + tool" three-up — each with a
 * deterministic "why" (matchReason) and an FE-actionable install descriptor.
 */
import type { FastifyInstance } from 'fastify';
import { searchCapabilities, type CapabilityCandidate, type MarketplaceCandidate } from '@waggle/agent';
import type { ConnectorDefinition } from '@waggle/shared';
import type { MarketplacePackage } from '@waggle/marketplace';
import { getStarterSkillsDir } from '@waggle/sdk';

declare module 'fastify' {
  interface FastifyInstance {
    /** Union of every registered agent tool name — the agent-pick native lane
     *  (decorated at boot from the full base tool set, so it is not blind to
     *  search/browser/cli/cron/connector tools the way the agent's own union is). */
    agentToolNames: string[];
  }
}

/** Tells the FE how to act on a suggestion (which store path / handoff). */
export type InstallDescriptor =
  | { mode: 'store'; extensionId: string; type: 'skill' | 'mcp' | 'connector'; kind: 'package' | 'federated'; packageId?: number; authType?: string }
  | { mode: 'starter-pack'; name: string }
  | { mode: 'open-in'; appId: string }
  | { mode: 'active' };

export interface AgentSearchCandidate extends CapabilityCandidate {
  install: InstallDescriptor;
}

export interface AgentSearchPicks {
  connector?: AgentSearchCandidate;
  skill?: AgentSearchCandidate;
  tool?: AgentSearchCandidate;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'of', 'and', 'or', 'with', 'my', 'our', 'i',
  'need', 'want', 'can', 'you', 'help', 'me', 'some', 'that', 'this', 'in', 'on',
  'is', 'it', 'from', 'get', 'use', 'using', 'into', 'about', 'how', 'do',
]);

/** Significant lowercased tokens from a natural-language need. */
export function tokenizeNeed(need: string): string[] {
  return Array.from(new Set(
    need.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOPWORDS.has(t)),
  ));
}

/** Keyword-match the connector registry — the lane searchCapabilities omits. */
export function scoreConnectors(defs: ConnectorDefinition[], need: string): AgentSearchCandidate[] {
  const tokens = tokenizeNeed(need);
  if (tokens.length === 0) return [];
  const scored = defs.map(def => {
    const hay = `${def.name} ${def.description ?? ''} ${def.service} ${def.category ?? ''} ${(def.tools ?? []).join(' ')}`.toLowerCase();
    const hits = tokens.filter(t => hay.includes(t));
    return { def, hits, score: hits.length / tokens.length };
  }).filter(s => s.hits.length > 0).sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(({ def, hits, score }): AgentSearchCandidate => {
    const connected = def.status === 'connected';
    return {
      name: def.name,
      type: 'connector',
      availability: connected ? 'active' : 'installable',
      description: def.description ?? '',
      source: 'connector-registry',
      matchScore: Math.min(score, 1),
      matchReason: `matches: ${hits.join(', ')}`,
      installAction: connected ? null : 'connect_connector',
      install: connected
        ? { mode: 'active' }
        : def.authType === 'oauth2'
          ? { mode: 'open-in', appId: 'connectors' } // OAuth can't finish inline (D3)
          : { mode: 'store', extensionId: `connector:${def.id}`, type: 'connector', kind: 'federated', authType: def.authType },
    };
  });
}

/** Attach an FE-actionable install descriptor to an engine candidate. */
export function annotateEngineCandidate(
  c: CapabilityCandidate,
  marketplaceByName: Map<string, Pick<MarketplacePackage, 'id' | 'waggle_install_type'>>,
): AgentSearchCandidate {
  if (c.type === 'marketplace') {
    const row = marketplaceByName.get(c.name);
    if (row) {
      const type = row.waggle_install_type === 'mcp' ? 'mcp' : 'skill';
      return { ...c, install: { mode: 'store', extensionId: `pkg:${row.id}`, type, kind: 'package', packageId: row.id } };
    }
  }
  if (c.type === 'skill' && c.availability === 'installable') {
    return { ...c, install: { mode: 'starter-pack', name: c.name } };
  }
  // native tool, active skill, or an unjoinable marketplace row → already
  // available / not directly installable here.
  return { ...c, install: { mode: 'active' } };
}

/** One-of-each-kind grouping for the three-up suggestion box (§09). A
 *  candidate fills at most ONE slot — an mcp-package satisfies both the skill
 *  and tool predicates, so without this it could appear twice. */
export function pickThreeUp(all: AgentSearchCandidate[]): AgentSearchPicks {
  const used = new Set<AgentSearchCandidate>();
  const take = (pred: (c: AgentSearchCandidate) => boolean): AgentSearchCandidate | undefined => {
    const c = all.find(x => !used.has(x) && pred(x));
    if (c) used.add(c);
    return c;
  };
  return {
    connector: take(c => c.type === 'connector'),
    skill: take(c => c.type === 'skill' || c.type === 'marketplace'),
    tool: take(c => c.type === 'native' || (c.install.mode === 'store' && c.install.type === 'mcp')),
  };
}

export async function agentSearchRoutes(fastify: FastifyInstance) {
  fastify.post('/api/marketplace/agent-search', async (request, reply) => {
    const body = (request.body ?? {}) as { need?: unknown };
    const need = typeof body.need === 'string' ? body.need.trim() : '';
    if (!need) return reply.code(400).send({ error: 'need is required' });

    // Marketplace candidates — keep the rows for the id rejoin (the engine's
    // MarketplaceCandidate drops the package id + kind).
    let mpRows: MarketplacePackage[] = [];
    try {
      mpRows = fastify.marketplace?.search({ query: need, limit: 10 }).packages ?? [];
    } catch { mpRows = []; }
    const mpByName = new Map(mpRows.map(p => [p.name, { id: p.id, waggle_install_type: p.waggle_install_type }]));
    const marketplaceCandidates: MarketplaceCandidate[] = mpRows.map(p => ({
      name: p.name, description: p.description, packageType: p.package_type, source: 'marketplace', score: undefined,
    }));

    const installedSkills = (fastify.agentState?.skills ?? []).map(
      (s: { name: string; content?: string }) => ({ name: s.name, content: s.content ?? '' }),
    );

    const proposal = searchCapabilities({
      need,
      installedSkills,
      starterSkillsDir: getStarterSkillsDir(),
      nativeToolNames: fastify.agentToolNames ?? [],
      marketplaceCandidates,
    });

    const engine = proposal.candidates
      // Connected connectors generate `connector_<id>_<action>` native tools;
      // those would double-surface (the dedicated connector lane already shows
      // them, actionably). Drop them so the three-up isn't polluted.
      .filter(c => !(c.type === 'native' && c.name.startsWith('connector_')))
      .map(c => annotateEngineCandidate(c, mpByName));
    const connectors = scoreConnectors(fastify.connectorRegistry?.getDefinitions() ?? [], need);
    const all = [...engine, ...connectors].sort((a, b) => b.matchScore - a.matchScore);

    // gapDetected over the MERGED set (the engine computes it over skills only,
    // so a connector-only match would wrongly read gapDetected:false).
    const hasInstallable = all.some(c => c.availability === 'installable');

    return {
      need,
      gapDetected: !proposal.alreadyHandled && hasInstallable,
      alreadyHandled: proposal.alreadyHandled,
      recommendation: proposal.recommendation,
      candidates: all.slice(0, 12),
      picks: pickThreeUp(all),
    };
  });
}
