import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AuditEntry } from './types';
import { actionDotColor, actionTextColor, riskColor, relativeTime } from './helpers';

interface AuditTrailCardProps {
  auditEntries: AuditEntry[];
}

export function AuditTrailCard({ auditEntries }: AuditTrailCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {auditEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No install events recorded yet. Install a skill to see audit history.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {auditEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 py-1 text-xs border-b border-white/[0.04]"
              >
                <span
                  className={cn('size-2 rounded-full shrink-0', actionDotColor(entry.action))}
                  title={entry.action}
                />
                <span className="font-semibold min-w-[120px] truncate">
                  {entry.capabilityName}
                </span>
                <span className={cn('text-[11px] min-w-[60px]', actionTextColor(entry.action))}>
                  {entry.action}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase min-w-[36px]',
                    riskColor(entry.riskLevel)
                  )}
                >
                  {entry.riskLevel}
                </span>
                <span className="text-[11px] text-muted-foreground flex-1 truncate">
                  {entry.trustSource.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
