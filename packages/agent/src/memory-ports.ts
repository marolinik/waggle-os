/**
 * The memory ports — the persistence abstractions `@waggle/agent` owns.
 *
 * CA-3. Before this file, the use cases named concrete `@waggle/core` gateway
 * classes (`FrameStore`, `SessionStore`, `HybridSearch`, …) and the
 * `Orchestrator` constructor built them itself, so the inner layer depended on
 * the outer one. The Dependency Rule wants the arrow the other way: the use
 * case declares what it needs, and persistence implements it.
 *
 * Two things this file deliberately does NOT do:
 *
 * 1. It does not mirror the gateway classes. Each port lists only the methods
 *    the use cases actually call — measured, not guessed. `FrameStore` has 22
 *    public methods; the agent uses 8. A port that copied all 22 would be an
 *    interface in name and a concrete class in every other respect.
 *
 * 2. It does not redeclare the data types. `MemoryFrame`, `Session`, `Entity`,
 *    `Identity` and friends are enterprise data structures — the innermost
 *    circle, which every layer may depend on — not gateways. Importing them as
 *    types keeps one definition of a frame in the system. What was inverted is
 *    the *behavior* the agent depends on, which is the part that was binding it
 *    to SQLite.
 *
 * `@waggle/core`'s classes satisfy these ports structurally, so nothing had to
 * change on the implementation side and no `implements` clause was added.
 */

import type {
  ActionableSignal,
  ActionableThresholds,
  AwarenessCategory,
  AwarenessItem,
  AwarenessMetadata,
  Entity,
  FrameSource,
  Identity,
  Importance,
  ImprovementSignal,
  MemoryFrame,
  Relation,
  SearchOptions,
  SearchResult,
  Session,
  SignalCategory,
} from '@waggle/core';

/** `IdentityLayer` keeps its input type private, so the port restates it. */
export type IdentityInput = Omit<Identity, 'id' | 'created_at' | 'updated_at'>;
export type IdentityUpdate = Partial<IdentityInput>;

/** Append-only frame storage — the memory substrate's write and read path. */
export interface FrameStorePort {
  createIFrame(
    gopId: string,
    content: string,
    importance?: Importance,
    source?: FrameSource,
    createdAt?: string | null,
  ): MemoryFrame;
  createPFrame(
    gopId: string,
    content: string,
    baseFrameId: number,
    importance?: Importance,
    source?: FrameSource,
  ): MemoryFrame;
  getById(id: number): MemoryFrame | undefined;
  getLatestIFrame(gopId: string): MemoryFrame | undefined;
  getRecent(limit?: number): MemoryFrame[];
  findDuplicate(content: string): MemoryFrame | null;
  update(id: number, content: string, importance?: Importance): MemoryFrame | undefined;
  setMetadata(id: number, metadata: string): MemoryFrame | undefined;
}

/** Session (GOP) lifecycle — frames are foreign-keyed to these. */
export interface SessionStorePort {
  create(projectId?: string): Session;
  getActive(): Session[];
  ensureActive(projectId?: string): Session;
}

/** Retrieval over the frames — vector plus keyword, and the write-side index. */
export interface MemorySearchPort {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  indexFrame(frameId: number, content: string): Promise<void>;
}

/** Entity-relation graph over the frames. */
export interface KnowledgeGraphPort {
  createEntity(
    entityType: string,
    name: string,
    properties: Record<string, unknown>,
    temporal?: { valid_from?: string; valid_to?: string },
  ): Entity;
  getEntity(id: number): Entity | undefined;
  getEntitiesByType(entityType: string, limit?: number): Entity[];
  searchEntities(query: string, limit?: number): Entity[];
  createRelation(
    sourceId: number,
    targetId: number,
    relationType: string,
    confidence?: number,
    properties?: Record<string, unknown>,
  ): Relation;
  getRelationsFrom(sourceId: number, relationType?: string): Relation[];
  linkEntityToFrame(entityId: number, frameId: number): void;
  updateEntity(id: number, changes: { name?: string; properties?: Record<string, unknown> }): Entity;
  retireEntity(id: number): void;
}

/** The single identity row — who the user is. Always personal, never workspace. */
export interface IdentityPort {
  create(input: IdentityInput): Identity;
  get(): Identity;
  exists(): boolean;
  update(changes: IdentityUpdate): Identity;
  toContext(): string;
}

/** Active tasks and pending state surfaced into the prompt. */
export interface AwarenessPort {
  add(
    category: AwarenessCategory,
    content: string,
    priority?: number,
    expires_at?: string,
    metadata?: AwarenessMetadata,
  ): AwarenessItem;
  getAll(): AwarenessItem[];
  getByCategory(category: AwarenessCategory): AwarenessItem[];
  toContext(): string;
}

/** Write-path conflict signals consumed by the improvement loops. */
export interface ImprovementSignalPort {
  record(
    category: SignalCategory,
    patternKey: string,
    detail?: string,
    metadata?: Record<string, unknown>,
  ): ImprovementSignal;
  getActionable(thresholds?: ActionableThresholds): ActionableSignal[];
  markSurfaced(id: number): void;
}

/**
 * The set of layers bound to one mind. The `Orchestrator` holds one of these
 * for the personal mind and, when a workspace is active, a second for it.
 */
export interface MemoryLayerPorts {
  frames: FrameStorePort;
  sessions: SessionStorePort;
  search: MemorySearchPort;
  knowledge: KnowledgeGraphPort;
}
