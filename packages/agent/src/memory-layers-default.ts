/**
 * The default wiring from the memory ports to their `@waggle/core` gateways.
 *
 * CA-4. `memory-ports.ts` says what the use cases need; this file says which
 * implementation they get when a caller does not supply one. Keeping it apart
 * is the point: the use-case modules (`orchestrator.ts`, `cognify.ts`,
 * `tools.ts`) now name no gateway class at all, and every concrete choice the
 * agent makes about persistence is in one file named for exactly that job.
 *
 * What this does NOT claim: `@waggle/agent` still imports `@waggle/core` here,
 * so the package edge is relocated, not removed. Removing it would mean every
 * one of the 54 `new Orchestrator(...)` sites composing its own layers, which
 * buys a cleaner dependency graph by making every caller do the work — a worse
 * trade at this size. A caller that wants no `@waggle/core` at all already has
 * the seam: pass `layers`.
 */

import {
  AwarenessLayer,
  FrameStore,
  HybridSearch,
  IdentityLayer,
  ImprovementSignalStore,
  KnowledgeGraph,
  SessionStore,
  type Embedder,
  type MindDB,
} from '@waggle/core';
import type { MemoryLayerPorts, MemorySearchPort } from './memory-ports.js';
import type { OrchestratorLayers } from './orchestrator.js';

/** The seven layers the orchestrator runs on, all bound to one mind. */
export function defaultMemoryLayers(db: MindDB, embedder: Embedder): OrchestratorLayers {
  return {
    identity: new IdentityLayer(db),
    awareness: new AwarenessLayer(db),
    frames: new FrameStore(db),
    sessions: new SessionStore(db),
    search: new HybridSearch(db, embedder),
    knowledge: new KnowledgeGraph(db),
    improvementSignals: new ImprovementSignalStore(db),
  };
}

/**
 * The four layers a workspace mind gets. Identity and awareness are absent by
 * design — they stay personal, and a workspace never carries its own.
 */
export function defaultWorkspaceLayers(db: MindDB, embedder: Embedder): MemoryLayerPorts {
  return {
    frames: new FrameStore(db),
    sessions: new SessionStore(db),
    search: new HybridSearch(db, embedder),
    knowledge: new KnowledgeGraph(db),
  };
}

/** Retrieval over one other workspace's mind, for the cross-workspace tools. */
export function defaultMemorySearch(db: MindDB, embedder: Embedder): MemorySearchPort {
  return new HybridSearch(db, embedder);
}
