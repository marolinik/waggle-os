import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { InstallResult, MarketplaceApprovalIdentity } from '@waggle/marketplace';
import {
  CapabilityProposalStore,
  createCapabilityProposalRoutes,
  issueCapabilityProposalFromToolResult,
  stripCapabilityRequestMarker,
} from '../../src/local/routes/capability-proposals.js';

const IDENTITY: MarketplaceApprovalIdentity = {
  schemaVersion: 1,
  packageId: 73,
  sourceId: 4,
  name: 'web-scraper',
  publisher: 'Waggle Labs',
  version: '2.1.0',
  installType: 'skill',
  manifestDigest: `sha256:${'a'.repeat(64)}`,
  riskStatus: 'CLEAN',
  riskScore: 100,
  riskContentHash: 'approved-content',
  riskBlocked: false,
  riskDigest: `sha256:${'b'.repeat(64)}`,
};

const RAW_MARKER = '<!--waggle:capability_request {"name":"web-scraper","source":"marketplace","kind":"marketplace","packageId":73,"installType":"skill"}-->';

function installed(identity: MarketplaceApprovalIdentity): InstallResult {
  return {
    success: true,
    packageId: identity.packageId,
    packageName: identity.name,
    installType: identity.installType,
    installPath: '.waggle/skills/web-scraper.md',
    message: 'Installed',
  };
}

describe('capability proposal lifecycle', () => {
  it('replaces a raw marketplace marker with a server-issued scoped proposal', async () => {
    const store = new CapabilityProposalStore({ now: () => 1_000 });

    const issued = await issueCapabilityProposalFromToolResult({
      store,
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      output: `Recommended.\n${RAW_MARKER}`,
      resolveIdentity: vi.fn().mockResolvedValue(IDENTITY),
    });

    expect(issued.issued).toBe(true);
    expect(issued.output).not.toContain(RAW_MARKER);
    expect(issued.output).toContain('"proposalId"');
    expect(issued.output).toContain('"publisher":"Waggle Labs"');
    expect(issued.output).toContain('"expiresAt":"1970-01-01T00:10:01.000Z"');
  });

  it('strips an actionable marker when immutable identity cannot be resolved', async () => {
    const store = new CapabilityProposalStore();
    const issued = await issueCapabilityProposalFromToolResult({
      store,
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      output: `Unavailable.\n${RAW_MARKER}`,
      resolveIdentity: vi.fn().mockResolvedValue(null),
    });

    expect(issued.issued).toBe(false);
    expect(issued.output).not.toContain('waggle:capability_request');
  });

  it('strips rejected markers even when untrusted prose follows them', () => {
    expect(stripCapabilityRequestMarker(`Before. ${RAW_MARKER} after.`))
      .toBe('Before.  after.');
    const multiline = '<!--waggle:capability_request {\n"name":"web-scraper",\n"source":"marketplace"\n}-->';
    expect(stripCapabilityRequestMarker(`Before. ${multiline} after.`))
      .toBe('Before.  after.');
  });

  it('claims once before awaiting so concurrent confirmation cannot double-install', async () => {
    const store = new CapabilityProposalStore();
    const proposal = store.issue('workspace-a', 'session-a', IDENTITY);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const install = vi.fn(async (identity: MarketplaceApprovalIdentity) => {
      await gate;
      return installed(identity);
    });

    const first = store.confirm(proposal.id, 'workspace-a', 'session-a', install);
    const second = await store.confirm(proposal.id, 'workspace-a', 'session-a', install);
    release();

    expect(second.status).toBe('used');
    expect((await first).status).toBe('completed');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('does not disclose or consume a proposal on workspace or session mismatch', async () => {
    const store = new CapabilityProposalStore();
    const proposal = store.issue('workspace-a', 'session-a', IDENTITY);
    const install = vi.fn(async () => installed(IDENTITY));

    expect((await store.confirm(proposal.id, 'workspace-b', 'session-a', install)).status)
      .toBe('unavailable');
    expect((await store.confirm(proposal.id, 'workspace-a', 'session-b', install)).status)
      .toBe('unavailable');
    expect((await store.confirm(proposal.id, 'workspace-a', 'session-a', install)).status)
      .toBe('completed');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('expires at the exact deadline without invoking installation', async () => {
    let now = 5_000;
    const store = new CapabilityProposalStore({ now: () => now, ttlMs: 600_000 });
    const proposal = store.issue('workspace-a', 'session-a', IDENTITY);
    const install = vi.fn(async () => installed(IDENTITY));
    now = proposal.expiresAt;

    expect((await store.confirm(proposal.id, 'workspace-a', 'session-a', install)).status)
      .toBe('expired');
    expect(install).not.toHaveBeenCalled();
  });

  it('keeps an identity-change failure terminal', async () => {
    const store = new CapabilityProposalStore();
    const proposal = store.issue('workspace-a', 'session-a', IDENTITY);
    const install = vi.fn(async (): Promise<InstallResult> => ({
      ...installed(IDENTITY),
      success: false,
      errorCode: 'PACKAGE_IDENTITY_CHANGED',
      message: 'Changed',
    }));

    const first = await store.confirm(proposal.id, 'workspace-a', 'session-a', install);
    const replay = await store.confirm(proposal.id, 'workspace-a', 'session-a', install);

    expect(first).toMatchObject({ status: 'completed', result: { success: false, errorCode: 'PACKAGE_IDENTITY_CHANGED' } });
    expect(replay.status).toBe('used');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('confirm route ignores client target and force substitutions', async () => {
    const server = Fastify();
    const store = new CapabilityProposalStore();
    const proposal = store.issue('workspace-a', 'session-a', IDENTITY);
    const install = vi.fn(async (identity: MarketplaceApprovalIdentity) => installed(identity));
    await server.register(createCapabilityProposalRoutes(store, install));
    await server.ready();

    const response = await server.inject({
      method: 'POST',
      url: `/api/capability-proposals/${proposal.id}/confirm`,
      payload: {
        workspaceId: 'workspace-a',
        sessionId: 'session-a',
        packageId: 999,
        force: true,
        forceInsecure: true,
        expectedApprovalIdentity: { ...IDENTITY, packageId: 999 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(install).toHaveBeenCalledWith(IDENTITY);
    expect(install).toHaveBeenCalledTimes(1);
    await server.close();
  });

  it('confirm route maps unavailable, expired, replay, and identity drift fail closed', async () => {
    let now = 10_000;
    const store = new CapabilityProposalStore({ now: () => now, ttlMs: 1_000 });
    const install = vi.fn(async (): Promise<InstallResult> => ({
      ...installed(IDENTITY),
      success: false,
      errorCode: 'PACKAGE_IDENTITY_CHANGED',
      message: 'Changed',
    }));
    const server = Fastify();
    await server.register(createCapabilityProposalRoutes(store, install));
    await server.ready();

    const scoped = store.issue('workspace-a', 'session-a', IDENTITY);
    const wrongScope = await server.inject({
      method: 'POST',
      url: `/api/capability-proposals/${scoped.id}/confirm`,
      payload: { workspaceId: 'workspace-b', sessionId: 'session-a' },
    });
    expect(wrongScope.statusCode).toBe(404);
    expect(wrongScope.json().code).toBe('CAPABILITY_PROPOSAL_NOT_AVAILABLE');

    const drift = await server.inject({
      method: 'POST',
      url: `/api/capability-proposals/${scoped.id}/confirm`,
      payload: { workspaceId: 'workspace-a', sessionId: 'session-a' },
    });
    expect(drift.statusCode).toBe(409);
    expect(drift.json().errorCode).toBe('PACKAGE_IDENTITY_CHANGED');

    const replay = await server.inject({
      method: 'POST',
      url: `/api/capability-proposals/${scoped.id}/confirm`,
      payload: { workspaceId: 'workspace-a', sessionId: 'session-a' },
    });
    expect(replay.statusCode).toBe(409);
    expect(replay.json().code).toBe('CAPABILITY_PROPOSAL_ALREADY_USED');

    const expiring = store.issue('workspace-a', 'session-a', IDENTITY);
    now = expiring.expiresAt;
    const expired = await server.inject({
      method: 'POST',
      url: `/api/capability-proposals/${expiring.id}/confirm`,
      payload: { workspaceId: 'workspace-a', sessionId: 'session-a' },
    });
    expect(expired.statusCode).toBe(410);
    expect(expired.json().code).toBe('CAPABILITY_PROPOSAL_EXPIRED');
    await server.close();
  });
});
