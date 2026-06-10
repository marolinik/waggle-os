/**
 * Extend-layer shared routes (UX-Refactor Phase 4, S21 + shared S06/S07/S08).
 *
 *  - GET /api/marketplace        — bare-path alias of /api/marketplace/search
 *    (delegated via internal inject, zero duplicated search/annotation logic).
 *    Accepts the six-domain `type` facet from EXTENSION_TYPES (B7); domains
 *    with no marketplace representation (A5 federate-at-read: agent / model /
 *    template / connector live on their own routes) return an honest empty
 *    envelope instead of fake entries.
 *  - GET /api/extend/audit       — C18: ONE shared install-audit read serving
 *    S06+S07+S08+S21, extending the existing /api/audit/installs read (same
 *    store, same camelCased entry shape) with ?type= / ?capability= filters.
 */

import type { FastifyInstance } from 'fastify';
import { EXTENSION_TYPES, type ExtensionType } from '@waggle/shared';
import type { AuditCapabilityType, InstallAuditEntry } from '@waggle/core';
import { authHeaders } from './validate.js';

/** ExtensionType → marketplace InstallationType, where representable (A5). */
const MARKETPLACE_REPRESENTABLE: Partial<Record<ExtensionType, string>> = {
  skill: 'skill',
  mcp: 'mcp',
};

const AUDIT_TYPES: ReadonlyArray<AuditCapabilityType> = [
  'native', 'skill', 'plugin', 'mcp', 'connector', 'marketplace',
];

/** Same camelCase projection as GET /api/audit/installs (skills.ts). */
function toAuditResponse(e: InstallAuditEntry) {
  return {
    id: e.id,
    timestamp: e.timestamp,
    capabilityName: e.capability_name,
    capabilityType: e.capability_type,
    source: e.source,
    riskLevel: e.risk_level,
    trustSource: e.trust_source,
    approvalClass: e.approval_class,
    action: e.action,
    initiator: e.initiator,
    detail: e.detail,
  };
}

export async function extendRoutes(fastify: FastifyInstance) {
  // ── GET /api/marketplace — bare-path alias (S21) ───────────────────────
  fastify.get('/api/marketplace', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;

    if (q.type !== undefined && !(EXTENSION_TYPES as readonly string[]).includes(q.type)) {
      return reply.code(400).send({
        error: `type must be one of: ${EXTENSION_TYPES.join(', ')}`,
      });
    }

    if (q.type !== undefined && !(q.type in MARKETPLACE_REPRESENTABLE)) {
      // A5: no marketplace representation for this domain — the FE federates
      // it from /api/connectors, /api/personas, /api/litellm/models,
      // /api/workspace-templates. Honest empty result, never fake entries.
      return {
        packages: [],
        total: 0,
        federated: true,
        note: `'${q.type}' extensions are not marketplace-backed; query their dedicated route`,
      };
    }

    const params = new URLSearchParams();
    if (q.query) params.set('query', q.query);
    if (q.type) params.set('type', MARKETPLACE_REPRESENTABLE[q.type as ExtensionType]!);
    if (q.category) params.set('category', q.category);
    if (q.sort) params.set('sort', q.sort);
    if (q.limit) params.set('limit', q.limit);
    if (q.offset) params.set('offset', q.offset);

    const qs = params.toString();
    const res = await fastify.inject({
      method: 'GET',
      url: `/api/marketplace/search${qs ? `?${qs}` : ''}`,
      headers: authHeaders(request),
    });
    return reply.code(res.statusCode).send(res.json());
  });

  // ── GET /api/extend/audit — C18 shared install-audit feed ─────────────
  fastify.get('/api/extend/audit', async (request, reply) => {
    const q = request.query as { type?: string; capability?: string; limit?: string };
    // Clamp BOTH ends: SQLite treats a negative LIMIT as "no limit", so an
    // unclamped ?limit=-1 would return the entire table past the 100 cap.
    const limit = Math.min(Math.max(parseInt(q.limit ?? '20', 10) || 20, 1), 100);

    if (q.type !== undefined && !AUDIT_TYPES.includes(q.type as AuditCapabilityType)) {
      return reply.code(400).send({ error: `type must be one of: ${AUDIT_TYPES.join(', ')}` });
    }
    if (!fastify.auditStore) {
      return reply.code(503).send({ error: 'Audit store not available' });
    }

    let entries: InstallAuditEntry[];
    if (q.capability) {
      // ?capability= ANDs with ?type= — capability names collide across types
      // (e.g. 'github' is both a connector id and an MCP package name), so a
      // type-scoped feed must not leak the other type's rows.
      const byCapability = fastify.auditStore.getByCapability(q.capability);
      entries = (q.type ? byCapability.filter((e) => e.capability_type === q.type) : byCapability)
        .slice(0, limit);
    } else if (q.type) {
      entries = fastify.auditStore.getRecentByType(q.type as AuditCapabilityType, limit);
    } else {
      entries = fastify.auditStore.getRecent(limit);
    }

    return { entries: entries.map(toAuditResponse) };
  });
}
