import { AlertTriangle, RotateCcw, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ErrorContentBlock } from '@/lib/types';

/**
 * F4 — an actionable error block (was a dead-end 11px warning line).
 *
 * Shows the server's error copy in a risk-toned panel with a Retry action and,
 * when the failure is auth/API-key shaped, a deep link to Settings → Models
 * (the "Provider API Keys" surface named by the server copy).
 */

/** Endpoint-connectivity copy → offer the model endpoint settings action. */
function isConnectivityShapedError(message: string): boolean {
  return /could not reach (?:the )?(?:ai )?model|model endpoint (?:is )?not responding|ECONNREFUSED|fetch failed|server error retry cap exceeded.*(?:502|503|504)/i.test(message);
}

/** Auth/API-key-shaped error copy → offer the "Open API key settings" action.
 *  Connectivity takes precedence so old persisted outage copy that also told
 *  users to check an API key cannot keep sending them down the wrong path. */
export function isAuthShapedError(message: string): boolean {
  return !isConnectivityShapedError(message) && /api key|unauthorized|401/i.test(message);
}

interface ErrorBlockProps {
  block: ErrorContentBlock;
  onRetry?: () => void;
}

export default function ErrorBlock({ block, onRetry }: ErrorBlockProps) {
  const navigate = useNavigate();
  const showKeyAction = isAuthShapedError(block.message);
  const showModelAction = isConnectivityShapedError(block.message);

  return (
    <div
      role="alert"
      data-testid="chat-error-block"
      className="rounded-[12px] border border-[var(--risk)]/40 bg-[var(--risk)]/10 px-3 py-2.5"
    >
      <div className="flex items-start gap-2 text-[12px] text-[var(--text)]">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--risk)]" />
        <span className="whitespace-pre-wrap">{block.message}</span>
      </div>
      {(onRetry || showKeyAction || showModelAction) && (
        <div className="mt-2 flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border border-[var(--risk)]/40 text-[var(--text)] hover:bg-[var(--risk)]/10 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Retry
            </button>
          )}
          {showKeyAction && (
            <button
              onClick={() => navigate('/settings?tab=models')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border border-border/60 text-[var(--text)] hover:bg-muted/50 transition-colors"
            >
              <KeyRound className="w-3 h-3" /> Open API key settings
            </button>
          )}
          {showModelAction && (
            <button
              onClick={() => navigate('/settings?tab=models')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border border-border/60 text-[var(--text)] hover:bg-muted/50 transition-colors"
            >
              <KeyRound className="w-3 h-3" /> Open model settings
            </button>
          )}
        </div>
      )}
    </div>
  );
}
