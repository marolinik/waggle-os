import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { HealthData } from './types';

interface ServiceHealthCardProps {
  health: HealthData | null;
}

export function ServiceHealthCard({ health }: ServiceHealthCardProps) {
  const svc = health?.serviceHealth;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Service Health</CardTitle>
      </CardHeader>
      <CardContent>
        {!health ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : !svc ? (
          <p className="text-xs text-muted-foreground py-2">Service health unavailable.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'size-2 rounded-full shrink-0',
                  svc.watchdogRunning ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span>Cron Scheduler:</span>
              <span className={cn('font-semibold', svc.watchdogRunning ? 'text-green-500' : 'text-red-500')}>
                {svc.watchdogRunning ? 'running' : 'stopped'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'size-2 rounded-full shrink-0',
                  svc.notificationSSEActive ? 'bg-green-500' : 'bg-yellow-500'
                )}
              />
              <span>Notification SSE:</span>
              <span className={cn('font-semibold', svc.notificationSSEActive ? 'text-green-500' : 'text-yellow-500')}>
                {svc.notificationSSEActive ? 'connected' : 'no listeners'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
