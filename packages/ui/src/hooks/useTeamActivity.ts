/**
 * useTeamActivity — fetches recent team activity for a workspace.
 *
 * Only active when the current workspace has a teamId.
 * Fetches on mount and when workspace changes.
 */

import { useState, useEffect } from 'react';
import type { ActivityItem } from '../components/events/ActivityFeed.js';

export interface UseTeamActivityOptions {
  baseUrl?: string;
  teamId?: string;
  limit?: number;
}

export interface UseTeamActivityReturn {
  items: ActivityItem[];
  loading: boolean;
  refresh: () => void;
}

export function useTeamActivity({
  baseUrl = 'http://127.0.0.1:3333',
  teamId,
  limit = 20,
}: UseTeamActivityOptions): UseTeamActivityReturn {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchActivity = async () => {
    if (!teamId) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${baseUrl}/api/team/activity?workspaceId=${teamId}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json() as { items: ActivityItem[] };
        setItems(data.items ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, [baseUrl, teamId, limit]);

  return { items, loading, refresh: fetchActivity };
}
