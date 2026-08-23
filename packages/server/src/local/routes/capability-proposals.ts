import crypto from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  MarketplaceInstaller,
  type InstallResult,
  type MarketplaceApprovalIdentity,
} from '@waggle/marketplace';
import { safeFetch } from '@waggle/agent';

const CAPABILITY_MARKER_AT_END_RE = /<!--\s*waggle:capability_request\s+(\{[^\r\n]*\})\s*-->\s*$/;
const CAPABILITY_MARKER_RE = /<!--\s*waggle:capability_request\b[\s\S]*?-->/g;
const DEFAULT_TTL_MS = 10 * 60 * 1_000;
const DEFAULT_MAX_PROPOSALS = 256;

export function stripCapabilityRequestMarker(output: string): string {
  return output.replace(CAPABILITY_MARKER_RE, '').trimEnd();
}

export interface CapabilityProposal {
  id: string;
  workspaceId: string;
  sessionId: string;
  identity: MarketplaceApprovalIdentity;
  expiresAt: number;
  state: 'pending' | 'confirming' | 'used' | 'expired';
}

export type CapabilityProposalConfirmResult =
  | { status: 'completed'; result: InstallResult }
  | { status: 'unavailable' }
  | { status: 'expired' }
  | { status: 'used' };

export class CapabilityProposalStore {
  private readonly proposals = new Map<string, CapabilityProposal>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: { now?: () => number; ttlMs?: number; maxEntries?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_TTL_MS);
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_PROPOSALS);
  }

  issue(
    workspaceId: string,
    sessionId: string,
    identity: MarketplaceApprovalIdentity,
  ): CapabilityProposal {
    this.evict();
    const proposal: CapabilityProposal = {
      id: crypto.randomUUID(),
      workspaceId,
      sessionId,
      identity: structuredClone(identity),
      expiresAt: this.now() + this.ttlMs,
      state: 'pending',
    };
    this.proposals.set(proposal.id, proposal);
    this.evict();
    return structuredClone(proposal);
  }

  async confirm(
    id: string,
    workspaceId: string,
    sessionId: string,
    install: (identity: MarketplaceApprovalIdentity) => Promise<InstallResult>,
  ): Promise<CapabilityProposalConfirmResult> {
    const proposal = this.proposals.get(id);
    if (!proposal || proposal.workspaceId !== workspaceId || proposal.sessionId !== sessionId) {
      return { status: 'unavailable' };
    }
    if (proposal.state === 'confirming' || proposal.state === 'used') return { status: 'used' };
    if (proposal.state === 'expired' || this.now() >= proposal.expiresAt) {
      proposal.state = 'expired';
      return { status: 'expired' };
    }

    // Claim synchronously before the first await. Every attempted install is terminal.
    proposal.state = 'confirming';
    try {
      const result = await install(structuredClone(proposal.identity));
      return { status: 'completed', result };
    } finally {
      proposal.state = 'used';
      this.evict();
    }
  }

  private evict(): void {
    for (const [id, proposal] of this.proposals) {
      if (this.now() >= proposal.expiresAt) {
        this.proposals.delete(id);
      }
    }
    while (this.proposals.size > this.maxEntries) {
      const oldest = this.proposals.keys().next().value as string | undefined;
      if (!oldest) break;
      this.proposals.delete(oldest);
    }
  }
}

function marketplaceInstaller(server: FastifyInstance): MarketplaceInstaller | null {
  if (!server.marketplace) return null;
  return new MarketplaceInstaller(
    server.marketplace,
    {
      enable_gen_trust_hub: false,
      enable_cisco_scanner: false,
      enable_mcp_guardian: false,
      enable_heuristics: true,
    },
    (url, init) => safeFetch(url, init),
  );
}

export async function resolveMarketplaceApprovalIdentity(
  server: FastifyInstance,
  packageId: number,
): Promise<MarketplaceApprovalIdentity | null> {
  const pkg = server.marketplace?.getPackage(packageId);
  const installer = marketplaceInstaller(server);
  if (!pkg || !installer) return null;
  const scan = await installer.scanOnly(packageId);
  return scan ? MarketplaceInstaller.createApprovalIdentity(pkg, scan) : null;
}

export async function installMarketplaceApprovalIdentity(
  server: FastifyInstance,
  identity: MarketplaceApprovalIdentity,
): Promise<InstallResult> {
  if (!server.marketplace) {
    return {
      success: false,
      packageId: identity.packageId,
      packageName: identity.name,
      installType: identity.installType,
      installPath: '',
      message: 'Marketplace is not available',
      errors: ['Marketplace is not available'],
    };
  }
  const injected = await server.inject({
    method: 'POST',
    url: '/api/marketplace/install',
    headers: { authorization: `Bearer ${server.agentState.wsSessionToken}` },
    payload: {
      packageId: identity.packageId,
      expectedInstallType: identity.installType,
      expectedApprovalIdentity: identity,
    },
  });
  const body = injected.json() as InstallResult & { error?: string };
  return body;
}

function parseMarketplaceMarker(output: string): {
  prefix: string;
  marker: { packageId: number; name: string; reason?: string };
} | null {
  const match = output.match(CAPABILITY_MARKER_AT_END_RE);
  if (!match || match.index === undefined) return null;
  try {
    const marker = JSON.parse(match[1]) as Record<string, unknown>;
    if (
      marker.source !== 'marketplace'
      || marker.kind !== 'marketplace'
      || !Number.isSafeInteger(marker.packageId)
      || (marker.packageId as number) <= 0
      || typeof marker.name !== 'string'
      || !marker.name.trim()
    ) return null;
    return {
      prefix: output.slice(0, match.index).trimEnd(),
      marker: {
        packageId: marker.packageId as number,
        name: marker.name,
        ...(typeof marker.reason === 'string' ? { reason: marker.reason } : {}),
      },
    };
  } catch {
    return null;
  }
}

export async function issueCapabilityProposalFromToolResult(options: {
  store: CapabilityProposalStore;
  workspaceId: string;
  sessionId: string;
  output: string;
  resolveIdentity: (packageId: number) => Promise<MarketplaceApprovalIdentity | null>;
}): Promise<{ output: string; issued: boolean }> {
  const parsed = parseMarketplaceMarker(options.output);
  if (!parsed) return { output: options.output, issued: false };
  const identity = await options.resolveIdentity(parsed.marker.packageId).catch(() => null);
  if (!identity) return { output: stripCapabilityRequestMarker(options.output), issued: false };
  if (identity.packageId !== parsed.marker.packageId || identity.name !== parsed.marker.name) {
    return { output: stripCapabilityRequestMarker(options.output), issued: false };
  }
  const proposal = options.store.issue(options.workspaceId, options.sessionId, identity);
  const marker = {
    name: identity.name,
    source: 'marketplace',
    kind: 'marketplace',
    ...(parsed.marker.reason ? { reason: parsed.marker.reason } : {}),
    proposalId: proposal.id,
    expiresAt: new Date(proposal.expiresAt).toISOString(),
    packageId: identity.packageId,
    sourceId: identity.sourceId,
    publisher: identity.publisher,
    version: identity.version,
    installType: identity.installType,
    manifestDigest: identity.manifestDigest,
    riskStatus: identity.riskStatus,
    riskScore: identity.riskScore,
    riskContentHash: identity.riskContentHash,
    riskBlocked: identity.riskBlocked,
    riskDigest: identity.riskDigest,
  };
  return {
    output: `${parsed.prefix}${parsed.prefix ? '\n' : ''}<!--waggle:capability_request ${JSON.stringify(marker)}-->`,
    issued: true,
  };
}

type ProposalInstaller = (identity: MarketplaceApprovalIdentity) => Promise<InstallResult>;

export function createCapabilityProposalRoutes(
  store: CapabilityProposalStore,
  install: ProposalInstaller,
): FastifyPluginAsync {
  return async (fastify) => {
    fastify.post('/api/capability-proposals/:id/confirm', async (request, reply) => {
      const { id } = request.params as { id?: string };
      const body = request.body as { workspaceId?: unknown; sessionId?: unknown } | null;
      if (
        !id
        || typeof body?.workspaceId !== 'string'
        || !body.workspaceId
        || typeof body?.sessionId !== 'string'
        || !body.sessionId
      ) {
        return reply.code(400).send({ code: 'CAPABILITY_PROPOSAL_CONTEXT_REQUIRED' });
      }
      const outcome = await store.confirm(id, body.workspaceId, body.sessionId, install);
      if (outcome.status === 'unavailable') {
        return reply.code(404).send({ code: 'CAPABILITY_PROPOSAL_NOT_AVAILABLE' });
      }
      if (outcome.status === 'expired') {
        return reply.code(410).send({ code: 'CAPABILITY_PROPOSAL_EXPIRED' });
      }
      if (outcome.status === 'used') {
        return reply.code(409).send({ code: 'CAPABILITY_PROPOSAL_ALREADY_USED' });
      }
      if (outcome.result.errorCode === 'PACKAGE_IDENTITY_CHANGED') {
        return reply.code(409).send({ ...outcome.result, error: outcome.result.message });
      }
      return reply.code(outcome.result.success ? 200 : 422).send(outcome.result);
    });
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    capabilityProposalStore: CapabilityProposalStore;
  }
}
