import type { CapabilityRequest } from './CapabilityRequestCard';

export type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'capability'; request: CapabilityRequest };

// Pattern A: structured marker the agent can emit explicitly (preferred):
//   <!--waggle:capability_request {"name":"X","source":"Y","reason":"..."}-->
const MARKER_RE = /<!--\s*waggle:capability_request\s+(\{[^}]+\})\s*-->/g;

// Pattern B: legacy markdown phrasing from acquire_capability's recommendation:
//   `install_capability` with name "X" and source "Y"
// Falls back to this when the agent hasn't been updated to emit Pattern A.
const LEGACY_RE = /`install_capability`\s+with\s+name\s+"([^"]+)"\s+and\s+source\s+"([^"]+)"/gi;

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/i;
const CONTENT_HASH_RE = /^(?:|[0-9a-f]{64})$/i;
const RISK_STATUSES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'CLEAN']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMarketplaceProposal(obj: Partial<CapabilityRequest>): boolean {
  return Number.isSafeInteger(obj.packageId)
    && (obj.packageId ?? 0) > 0
    && Number.isSafeInteger(obj.sourceId)
    && (obj.sourceId ?? 0) > 0
    && isNonEmptyString(obj.proposalId)
    && UUID_V4_RE.test(obj.proposalId)
    && isNonEmptyString(obj.expiresAt)
    && Number.isFinite(Date.parse(obj.expiresAt))
    && Date.parse(obj.expiresAt) > Date.now()
    && isNonEmptyString(obj.publisher)
    && isNonEmptyString(obj.version)
    && (obj.installType === 'skill' || obj.installType === 'plugin' || obj.installType === 'mcp')
    && isNonEmptyString(obj.manifestDigest)
    && SHA256_RE.test(obj.manifestDigest)
    && isNonEmptyString(obj.riskStatus)
    && RISK_STATUSES.has(obj.riskStatus)
    && typeof obj.riskScore === 'number'
    && Number.isFinite(obj.riskScore)
    && typeof obj.riskContentHash === 'string'
    && CONTENT_HASH_RE.test(obj.riskContentHash)
    && typeof obj.riskBlocked === 'boolean'
    && isNonEmptyString(obj.riskDigest)
    && SHA256_RE.test(obj.riskDigest);
}

function parseRequest(jsonRaw: string): CapabilityRequest | null {
  try {
    const obj = JSON.parse(jsonRaw) as Partial<CapabilityRequest>;
    if (!obj.name || !obj.source) return null;
    const isMarketplace = obj.source === 'marketplace' && obj.kind === 'marketplace';
    if (isMarketplace && !isMarketplaceProposal(obj)) return null;
    return {
      name: String(obj.name),
      source: String(obj.source),
      kind: obj.kind,
      reason: obj.reason ? String(obj.reason) : undefined,
      ...(isMarketplace ? {
        proposalId: obj.proposalId,
        expiresAt: obj.expiresAt,
        packageId: obj.packageId,
        sourceId: obj.sourceId,
        publisher: obj.publisher,
        version: obj.version,
        installType: obj.installType,
        manifestDigest: obj.manifestDigest,
        riskStatus: obj.riskStatus,
        riskScore: obj.riskScore,
        riskContentHash: obj.riskContentHash,
        riskBlocked: obj.riskBlocked,
        riskDigest: obj.riskDigest,
      } : {}),
      ...(obj.connectorId ? { connectorId: String(obj.connectorId) } : {}),
      ...(obj.authType ? { authType: String(obj.authType) } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Split a chat-text block into [text, capability_request, text, ...] segments
 * so the renderer can inline install buttons next to the prose that prompted
 * the recommendation.
 */
export function segmentText(content: string): Segment[] {
  if (!content.includes('capability_request') && !content.includes('install_capability')) {
    return [{ kind: 'text', content }];
  }

  type Hit = { start: number; end: number; request: CapabilityRequest };
  const hits: Hit[] = [];

  for (const m of content.matchAll(MARKER_RE)) {
    const request = parseRequest(m[1]);
    if (request && m.index !== undefined) {
      hits.push({ start: m.index, end: m.index + m[0].length, request });
    }
  }

  for (const m of content.matchAll(LEGACY_RE)) {
    if (m.index === undefined) continue;
    // Skip if a Pattern A marker already covers this region.
    const covered = hits.some(h => m.index! >= h.start && m.index! < h.end);
    if (covered) continue;
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      request: { name: m[1], source: m[2] },
    });
  }

  if (hits.length === 0) return [{ kind: 'text', content }];

  hits.sort((a, b) => a.start - b.start);
  // Deduplicate same-name+source repeats — acquire_capability summaries
  // sometimes mention the install call twice (body + recommendation).
  // Two identical install cards is noise.
  const seen = new Set<string>();
  const dedupedHits = hits.filter(h => {
    const key = `${h.request.source}::${h.request.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const segments: Segment[] = [];
  let cursor = 0;
  for (const h of dedupedHits) {
    if (h.start > cursor) {
      segments.push({ kind: 'text', content: content.slice(cursor, h.start) });
    }
    segments.push({ kind: 'capability', request: h.request });
    cursor = h.end;
  }
  if (cursor < content.length) {
    segments.push({ kind: 'text', content: content.slice(cursor) });
  }
  return segments;
}
