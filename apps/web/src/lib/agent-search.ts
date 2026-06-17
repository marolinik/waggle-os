/**
 * agent-search — FE types + helpers for the PR4 agent-pick suggestion box
 * (screen 09's centered ask bar). Mirrors the POST /api/marketplace/agent-search
 * response: each suggestion carries a deterministic "why" (matchReason) and an
 * install descriptor telling the FE how to act (store install / starter-pack /
 * Hub handoff / already-active).
 */
import type { InstallTarget } from './install-store';

export interface AgentSearchInstall {
  mode: 'store' | 'starter-pack' | 'open-in' | 'active';
  extensionId?: string;
  type?: 'skill' | 'mcp' | 'connector';
  kind?: 'package' | 'federated';
  packageId?: number;
  authType?: string;
  /** starter-pack mode — the skill id to install. */
  name?: string;
  /** open-in mode — the app to deep-link to (e.g. an OAuth connector → Hub). */
  appId?: string;
}

export interface AgentSearchSuggestion {
  name: string;
  type: string; // CapabilitySourceType: native | skill | marketplace | connector | …
  availability: string;
  description: string;
  /** The deterministic "why" the engine matched this. */
  matchReason: string;
  matchScore: number;
  install: AgentSearchInstall;
}

export interface AgentSearchResponse {
  need: string;
  gapDetected: boolean;
  alreadyHandled: boolean;
  recommendation: AgentSearchSuggestion | null;
  candidates: AgentSearchSuggestion[];
  picks: {
    connector?: AgentSearchSuggestion;
    skill?: AgentSearchSuggestion;
    tool?: AgentSearchSuggestion;
  };
}

/** Build an InstallTarget from a store-mode suggestion (null if not directly
 *  store-installable — connectors hand off to the Hub, starters to installPack). */
export function installTargetFor(s: AgentSearchSuggestion): InstallTarget | null {
  const i = s.install;
  if (i.mode !== 'store' || !i.extensionId || !i.type || !i.kind) return null;
  return {
    id: i.extensionId,
    type: i.type,
    kind: i.kind,
    name: s.name,
    ...(i.packageId != null ? { packageId: i.packageId } : {}),
  };
}
