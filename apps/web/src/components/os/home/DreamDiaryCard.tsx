/**
 * Dream Diary card — "While you slept" (docs/plans/DREAM-DIARY-2026-07-09.md).
 *
 * Shows the latest nightly memory-curation narrative from /api/dreams with
 * an expandable history of previous nights. Renders NOTHING until the first
 * dream exists (new installs see no empty shell). The narrative is the
 * lazily-LLM-polished text; until (or unless) it lands, the deterministic
 * summary shows — both trace to real curation counters, never invention.
 *
 * Sits directly under the OvernightHero (automation runs) on HomeCockpit —
 * automations and memory curation are sibling "overnight work" stories.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MoonStar } from 'lucide-react';
import { adapter } from '@/lib/adapter';

export interface DreamDayView {
  date: string;
  summary: string;
  narrative?: string;
  events: Array<{ action: string; at: string; stats: Record<string, number> }>;
}

/** "Last night" for today/yesterday; a readable date otherwise. */
export function dreamDateLabel(date: string, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${date}T00:00:00`);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays <= 1) return 'Last night';
  if (diffDays < 7) return target.toLocaleDateString(undefined, { weekday: 'long' });
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const DreamDiaryCard = () => {
  const [dreams, setDreams] = useState<DreamDayView[]>([]);
  const [expanded, setExpanded] = useState(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<DreamDayView[]> => {
      try {
        const res = await adapter.fetch('/api/dreams?days=7');
        if (!res.ok) return [];
        const body = await res.json() as DreamDayView[];
        if (alive) setDreams(body);
        return body;
      } catch {
        return []; // service unreachable — card simply stays hidden
      }
    };
    void load().then(body => {
      // The narrative is polished lazily server-side; if the newest entry
      // hasn't got one yet, pick it up with a single delayed refetch.
      if (alive && body[0] && !body[0].narrative) {
        refetchTimer.current = setTimeout(() => { void load(); }, 6000);
      }
    });
    return () => {
      alive = false;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, []);

  if (dreams.length === 0) return null;
  const [latest, ...older] = dreams;

  return (
    <div
      className="mb-9 rounded-[14px] border border-[var(--line)] bg-[var(--surface-1)] px-4 py-3.5"
      data-testid="home-dream-diary"
    >
      <div className="flex items-center gap-2">
        <MoonStar className="h-4 w-4 shrink-0 text-[var(--honey-text)]" />
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          While you slept · {dreamDateLabel(latest.date)}
        </p>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--text-2)]" data-testid="dream-latest-text">
        {latest.narrative ?? latest.summary}
      </p>

      {older.length > 0 && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1 text-[13px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            data-testid="dream-history-toggle"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Previous nights ({older.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-2 border-l border-[var(--line)] pl-3" data-testid="dream-history">
              {older.map(day => (
                <div key={day.date}>
                  <p className="text-[11.5px] uppercase tracking-wide text-[var(--text-dim)]">
                    {dreamDateLabel(day.date)}
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {day.narrative ?? day.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DreamDiaryCard;
