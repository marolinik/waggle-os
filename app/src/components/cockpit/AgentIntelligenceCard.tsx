import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FeedbackStats } from './types';

interface AgentIntelligenceCardProps {
  feedbackStats: FeedbackStats | null;
}

/**
 * Parse an improvement trend string like "+12%" or "-5%" into a numeric value.
 * Returns 0 if unparseable.
 */
function parseTrend(trend: string): number {
  const match = trend.match(/^([+-]?\d+)%$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Format reason keys (e.g. "wrong_answer") into human-readable labels.
 */
function formatReason(reason: string): string {
  return reason
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function AgentIntelligenceCard({ feedbackStats }: AgentIntelligenceCardProps) {
  if (!feedbackStats) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-wide">Agent Intelligence</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const trendValue = parseTrend(feedbackStats.improvementTrend);
  const positivePercent = Math.round(feedbackStats.positiveRate * 100);

  // Positive trend means fewer corrections (good), negative means more corrections (bad)
  const trendIsPositive = trendValue > 0;
  const trendIsNegative = trendValue < 0;
  const trendLabel = trendIsPositive
    ? `${feedbackStats.improvementTrend} fewer corrections`
    : trendIsNegative
      ? `${feedbackStats.improvementTrend} more corrections`
      : 'No change';

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Agent Intelligence</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Metric tiles */}
          <div className="grid grid-cols-2 gap-2">
            {/* Corrections this week */}
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
              <div className="text-xl font-bold text-primary leading-none">
                {feedbackStats.correctionsThisWeek}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                Corrections / Week
              </div>
            </div>

            {/* Positive feedback rate */}
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
              <div className={cn(
                'text-xl font-bold leading-none',
                positivePercent >= 80 ? 'text-green-500' :
                positivePercent >= 50 ? 'text-yellow-500' :
                'text-red-500',
              )}>
                {positivePercent}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                Positive
              </div>
            </div>
          </div>

          {/* Improvement trend */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Trend:</span>
            <span
              className={cn(
                'font-semibold',
                trendIsPositive && 'text-green-500',
                trendIsNegative && 'text-red-500',
                !trendIsPositive && !trendIsNegative && 'text-muted-foreground',
              )}
            >
              {trendLabel}
            </span>
          </div>

          {/* Top issues */}
          {feedbackStats.topIssues.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Top Issues</span>
              <ul className="flex flex-col gap-0.5">
                {feedbackStats.topIssues.map((issue) => (
                  <li key={issue} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-red-400 shrink-0" />
                    {formatReason(issue)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {feedbackStats.totalFeedback === 0 && (
            <p className="text-[11px] text-muted-foreground">
              No feedback yet. Use thumbs up/down on agent responses to start tracking.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
