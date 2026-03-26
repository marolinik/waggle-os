/**
 * TeamSync — Syncs memory frames between local .mind and team server.
 *
 * Uses the team server's entities API (entityType='memory_frame') for storage.
 * Push-on-write: new frames are pushed to team server after local write.
 * Pull-on-activate: frames are pulled from team server when workspace is activated.
 * Attribution: each frame carries the author's userId and displayName.
 *
 * Sync protocol:
 * - Frames are identified by a composite key: gopId + t (group-of-pictures ID + temporal index)
 * - Pull uses ?type=memory_frame&since=<timestamp> to get only new frames
 * - Push sends each frame as a teamEntity with entityType='memory_frame'
 * - Last-write-wins at frame level (frames are append-mostly, conflicts are rare)
 */

import type { MemoryFrame, FrameType, Importance } from './mind/frames.js';

export interface TeamSyncConfig {
  teamServerUrl: string;
  teamSlug: string;
  authToken: string;
  userId: string;
  displayName: string;
}

export interface SyncedFrame {
  /** Server-side entity ID (UUID). */
  remoteId: string;
  gopId: string;
  t: number;
  frameType: FrameType;
  content: string;
  importance: Importance;
  authorId: string;
  authorName: string;
  createdAt: string;
}

/**
 * Convert a local MemoryFrame to the team server entity format.
 */
export function frameToEntity(frame: MemoryFrame, authorId: string, authorName: string) {
  return {
    entityType: 'memory_frame',
    name: frame.gop_id,
    properties: {
      frameType: frame.frame_type,
      t: frame.t,
      baseFrameId: frame.base_frame_id,
      content: frame.content,
      importance: frame.importance,
      authorId,
      authorName,
      localId: frame.id,
    },
  };
}

/**
 * Convert a team server entity back to a SyncedFrame.
 */
export function entityToSyncedFrame(entity: {
  id: string;
  name: string;
  properties: Record<string, unknown>;
  createdAt: string;
}): SyncedFrame {
  const props = entity.properties;
  return {
    remoteId: entity.id,
    gopId: entity.name,
    t: (props.t as number) ?? 0,
    frameType: (props.frameType as FrameType) ?? 'I',
    content: (props.content as string) ?? '',
    importance: (props.importance as Importance) ?? 'normal',
    authorId: (props.authorId as string) ?? '',
    authorName: (props.authorName as string) ?? '',
    createdAt: entity.createdAt,
  };
}

/**
 * TeamSync handles push/pull of memory frames to/from the team server.
 * This is a stateless client — call pushFrame() after writing locally,
 * call pullFrames() on workspace activation.
 */
export class TeamSync {
  private config: TeamSyncConfig;
  private lastSyncTimestamp: string | null = null;

  constructor(config: TeamSyncConfig) {
    this.config = config;
  }

  /**
   * Push a single frame to the team server.
   * Call this after writing a frame to the local workspace .mind.
   */
  async pushFrame(frame: MemoryFrame): Promise<{ remoteId: string } | null> {
    const entity = frameToEntity(frame, this.config.userId, this.config.displayName);

    try {
      const response = await fetch(
        `${this.config.teamServerUrl}/api/teams/${this.config.teamSlug}/entities`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.authToken}`,
          },
          body: JSON.stringify(entity),
        }
      );

      if (!response.ok) {
        console.error(`TeamSync push failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const created = await response.json() as { id: string };
      return { remoteId: created.id };
    } catch (err) {
      console.error('TeamSync push error:', err);
      return null;
    }
  }

  /**
   * Pull all memory frames from the team server.
   * Returns frames sorted by creation time (newest first).
   * Optionally pass `since` to get only frames created after that timestamp.
   */
  async pullFrames(since?: string): Promise<SyncedFrame[]> {
    try {
      let url = `${this.config.teamServerUrl}/api/teams/${this.config.teamSlug}/entities?type=memory_frame`;
      // Note: `since` filtering would require server-side support. For now, pull all and filter client-side.

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.config.authToken}`,
        },
      });

      if (!response.ok) {
        console.error(`TeamSync pull failed: ${response.status} ${response.statusText}`);
        return [];
      }

      const entities = await response.json() as Array<{
        id: string;
        name: string;
        properties: Record<string, unknown>;
        createdAt: string;
      }>;

      const frames = entities.map(entityToSyncedFrame);

      // Client-side filter by timestamp if requested
      if (since) {
        return frames.filter(f => f.createdAt > since);
      }

      this.lastSyncTimestamp = new Date().toISOString();
      return frames;
    } catch (err) {
      console.error('TeamSync pull error:', err);
      return [];
    }
  }

  /**
   * Get the last sync timestamp (for incremental sync).
   */
  getLastSyncTimestamp(): string | null {
    return this.lastSyncTimestamp;
  }

  /**
   * Set the last sync timestamp (e.g. loaded from persistent storage).
   */
  setLastSyncTimestamp(ts: string): void {
    this.lastSyncTimestamp = ts;
  }
}
