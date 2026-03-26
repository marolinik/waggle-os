import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { HealthData } from './types';
import { statusColor, statusDotBg, formatTime } from './helpers';

interface SystemHealthCardProps {
  health: HealthData | null;
  healthError: boolean;
}

export function SystemHealthCard({ health, healthError }: SystemHealthCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Agent Status</CardTitle>
      </CardHeader>
      <CardContent>
        {healthError && !health ? (
          <p className="text-xs text-muted-foreground py-2">
            Server unreachable. Is the server running on localhost:3333?
          </p>
        ) : !health ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Overall */}
            <div className="flex items-center gap-2 text-xs">
              <span className={cn('size-2 rounded-full shrink-0', statusDotBg(health.status))} />
              <span className="font-semibold">Overall:</span>
              <span className={cn('uppercase text-[11px] font-semibold', statusColor(health.status))}>
                {health.status}
              </span>
            </div>

            {/* LLM */}
            <div className="flex items-center gap-2 text-xs">
              <span className={cn('size-2 rounded-full shrink-0', statusDotBg(health.llm.health))} />
              <span>LLM Provider:</span>
              <span className="text-primary">{health.llm.provider || 'none'}</span>
              <span className="text-muted-foreground text-[11px]">({health.llm.health})</span>
            </div>
            {health.llm.detail && (
              <p className="text-[11px] text-muted-foreground pl-4">{health.llm.detail}</p>
            )}

            {/* Database */}
            <div className="flex items-center gap-2 text-xs">
              <span className={cn('size-2 rounded-full shrink-0', health.database.healthy ? 'bg-green-500' : 'bg-red-500')} />
              <span>Database:</span>
              <span className={health.database.healthy ? 'text-green-500' : 'text-red-500'}>
                {health.database.healthy ? 'healthy' : 'unhealthy'}
              </span>
            </div>

            {/* Refresh note */}
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border">
              Auto-refreshes every 30s
              {health.timestamp && ` | Last: ${formatTime(health.timestamp)}`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
