/**
 * AI-OS Phase 1C — bridge the new WaggleDance v2 signal bus into the
 * legacy `/api/waggle/signals` stream consumed by the WaggleDanceApp UI.
 *
 * Why a bridge:
 *
 * The existing UI hook (`useWaggleDance`) talks to `/api/waggle/signals`
 * + `/api/waggle/stream` (SSE). Those endpoints have a higher-level
 * signal shape (`{type, workspaceId, content, metadata, timestamp,
 * acknowledged}`) where `type` is one of five UX categories —
 * discovery / handoff / insight / alert / coordination.
 *
 * The new v2 bus uses the protocol shape (`WaggleMessage` with
 * `subtype` of one of ten Waggle Dance protocol subtypes). To let
 * the UI surface cross-tool activity with NO frontend changes, we
 * subscribe the bus and re-emit each signal through the legacy
 * `emitWaggleSignal` with a mapped shape.
 *
 * The mapping is many-to-five:
 *
 *   discovery / knowledge_check / skill_request          → 'discovery'
 *   task_delegation / skill_share / routed_share         → 'handoff'
 *   knowledge_match                                      → 'insight'
 *   task_claim / model_recipe / model_recommendation     → 'coordination'
 *   (content.priority === 'critical')                    → 'alert'    (overrides)
 *
 * Provenance is preserved in `metadata`:
 *   { subtype, senderId, tool, teamId, referenceId, routing }
 *
 * Tests cover both the mapping (unit) and the end-to-end flow
 * (POST /api/waggle-dance/signal → GET /api/waggle/signals).
 */

import type { WaggleMessage, MessageSubtype } from '@waggle/shared';
import { SignalBus } from './signal-bus.js';
import { emitWaggleSignal } from './routes/waggle-signals.js';

/**
 * Categorize a Waggle Dance subtype into one of the five UX
 * signal categories the existing UI knows how to render.
 *
 * Exported for unit testing.
 */
export function categorizeSubtype(
  subtype: MessageSubtype,
): 'discovery' | 'handoff' | 'insight' | 'alert' | 'coordination' {
  switch (subtype) {
    case 'discovery':
    case 'knowledge_check':
    case 'skill_request':
      return 'discovery';
    case 'task_delegation':
    case 'skill_share':
    case 'routed_share':
      return 'handoff';
    case 'knowledge_match':
      return 'insight';
    case 'task_claim':
    case 'model_recipe':
    case 'model_recommendation':
      return 'coordination';
    default:
      // Defense in depth — runtime-malformed subtypes get a safe
      // bucket so the UI doesn't drop them silently.
      return 'coordination';
  }
}

/**
 * Build the human-readable `content` field for the legacy signal
 * from a v2 WaggleMessage. The UI shows this as the primary text.
 */
export function buildLegacyContent(message: WaggleMessage): string {
  const { content, subtype } = message;
  // Prefer a topic / title / query field if present, then fall back
  // to a structural summary.
  const topic =
    (content.topic as string) ??
    (content.title as string) ??
    (content.query as string) ??
    (content.task as string) ??
    (content.skill as string) ??
    null;
  if (topic) return `${subtype}: ${topic}`;
  // For broadcasts/responses without a topic, summarize the keys.
  const keys = Object.keys(content);
  if (keys.length === 0) return `${subtype}`;
  return `${subtype} (${keys.slice(0, 3).join(', ')})`;
}

/**
 * Determine the priority for the legacy signal. `content.priority`
 * wins if present and valid; otherwise infer a default from subtype.
 */
function inferPriority(message: WaggleMessage): 'low' | 'normal' | 'high' | 'critical' {
  const explicit = message.content.priority;
  if (
    explicit === 'low' ||
    explicit === 'normal' ||
    explicit === 'high' ||
    explicit === 'critical'
  ) {
    return explicit;
  }
  // Importance hint from hooks may surface as content.importance
  const importance = message.content.importance;
  if (importance === 'high') return 'high';
  if (importance === 'critical') return 'critical';
  return 'normal';
}

/**
 * Subscribe to the v2 signal bus and re-emit each signal through
 * the legacy `emitWaggleSignal` so the existing UI sees cross-tool
 * activity with zero frontend changes.
 *
 * Returns the unsubscribe function so the bridge can be torn down
 * (used in tests).
 */
export function installWaggleDanceBridge(bus: SignalBus): () => void {
  return bus.subscribe((msg) => {
    const priority = inferPriority(msg);
    // Critical priority always renders as 'alert' regardless of subtype.
    const type = priority === 'critical' ? 'alert' : categorizeSubtype(msg.subtype);
    emitWaggleSignal({
      type: `waggle-dance:${type}`,
      workspaceId: msg.teamId,
      content: buildLegacyContent(msg),
      metadata: {
        subtype: msg.subtype,
        senderId: msg.senderId,
        tool: msg.content.tool ?? null,
        teamId: msg.teamId,
        referenceId: msg.referenceId,
        routing: msg.routing,
        priority,
        // Keep the protocol message verbatim for any UI that wants
        // to drill into the raw protocol payload.
        protocolMessage: msg,
      },
    });
  });
}
