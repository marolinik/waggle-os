import type { CliBridge, MemoryHit, RecallMemoryOptions } from './cli-bridge.js';

export interface RecallContextOptions {
  limit: number;
  workspaceId?: string;
  profile?: RecallMemoryOptions['profile'];
}

/** Recall personal and current-workspace memory without ever widening to all workspaces. */
export async function recallPersonalAndWorkspace(
  bridge: CliBridge,
  query: string,
  options: RecallContextOptions,
): Promise<MemoryHit[]> {
  const limit = Math.max(1, Math.floor(options.limit));
  const workspaceId = options.workspaceId ?? bridge.getActiveWorkspaceId();
  const personal = bridge.recallMemory(query, {
    limit,
    scope: 'personal',
    workspace: null,
    ...(options.profile ? { profile: options.profile } : {}),
  });
  const workspace = workspaceId
    ? bridge.recallMemory(query, {
        limit,
        scope: 'current',
        workspace: workspaceId,
        ...(options.profile ? { profile: options.profile } : {}),
      })
    : Promise.resolve([]);
  const [personalHits, workspaceHits] = await Promise.all([personal, workspace]);
  return mergeRankedHits([...personalHits, ...workspaceHits], limit);
}

function mergeRankedHits(hits: MemoryHit[], limit: number): MemoryHit[] {
  const ranked = [...hits].sort((left, right) => right.score - left.score);
  const seen = new Set<string>();
  const merged: MemoryHit[] = [];
  for (const hit of ranked) {
    const key = hit.content.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= limit) break;
  }
  return merged;
}
