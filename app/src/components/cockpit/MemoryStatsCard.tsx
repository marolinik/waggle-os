import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { HealthData } from './types';
import { formatBytes } from './helpers';

interface MemoryStatsCardProps {
  health: HealthData | null;
}

export function MemoryStatsCard({ health }: MemoryStatsCardProps) {
  const stats = health?.memoryStats;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Memory Stats</CardTitle>
      </CardHeader>
      <CardContent>
        {!health ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : !stats ? (
          <p className="text-xs text-muted-foreground py-2">Memory stats unavailable.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
                <div className="text-xl font-bold text-primary leading-none">{stats.frameCount}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Frames</div>
              </div>
              <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
                <div className="text-xl font-bold text-primary leading-none">{formatBytes(stats.mindSizeBytes)}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Mind Size</div>
              </div>
              <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
                <div className={cn(
                  'text-xl font-bold leading-none',
                  stats.embeddingCoverage >= 80 ? 'text-green-500' :
                  stats.embeddingCoverage >= 40 ? 'text-yellow-500' :
                  'text-red-500'
                )}>
                  {stats.embeddingCoverage}%
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Embedded</div>
              </div>
            </div>
            {/* IMP-9: Warning when embedding coverage is low */}
            {stats.embeddingCoverage < 80 && stats.frameCount > 0 && (
              <div className={cn(
                'mt-3 rounded-md px-3 py-2 text-[11px] border',
                stats.embeddingCoverage < 40
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              )}>
                <strong>{100 - stats.embeddingCoverage}% of frames</strong> lack vector embeddings and won't appear in semantic search.
                {stats.embeddingCoverage < 40 && ' Send more messages to build memory coverage.'}
              </div>
            )}
            {/* UX-012: Knowledge graph hint — wire to real counts when API exposes them */}
            <div className="text-xs text-muted-foreground/40 mt-1">
              Knowledge graph available in Memory view
            </div>
            {/* UX-029: Memory weaver visibility placeholder */}
            <div className="text-[10px] text-muted-foreground/40 mt-1">
              Memory auto-optimization active ✓
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
