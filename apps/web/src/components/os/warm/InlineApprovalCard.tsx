import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '@/components/ui/approval-modal';
import { RISK_LABELS, canAlwaysAllow } from '@/lib/risk-display';

interface InlineApprovalCardProps {
  request: ApprovalRequest;
  title?: string;
  onApprove: () => void;
  onDecline: () => void;
  /** Offered only when the approval class permits it (A6 policy). */
  onAlwaysAllow?: () => void;
  approveLabel?: string;
  className?: string;
}

/**
 * Inline (in-thread) approval card — `--honey-wash` fill + attention border +
 * warning icon. Shares the risk vocabulary with `ApprovalModal` via
 * `risk-display.ts`; "Always allow" is gated by `canAlwaysAllow` so a
 * CRITICAL/blocked action can never offer it.
 */
export function InlineApprovalCard({
  request,
  title = 'Approve before I leave your machine',
  onApprove,
  onDecline,
  onAlwaysAllow,
  approveLabel = 'Approve & continue',
  className,
}: InlineApprovalCardProps) {
  const showAlways = onAlwaysAllow && canAlwaysAllow(request.approvalClass);
  const target = request.scope.length ? `${request.action} › ${request.scope.join(' · ')}` : request.action;
  return (
    <div className={cn('rounded-[14px] border border-[var(--honey-line)] bg-[var(--honey-wash)] p-4', className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--attention)]" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--text)]">{title}</p>
          <p className="mt-1 break-words font-mono text-[12px] text-[var(--text-2)]">{target}</p>
          <p className="mt-1 text-[11.5px] text-[var(--text-dim)]">{RISK_LABELS[request.riskLevel]} risk</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onApprove}
              className="rounded-[10px] bg-[var(--honey)] px-3.5 py-1.5 text-[13px] font-medium text-[#1a1407]"
            >
              {approveLabel}
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
            >
              Not now
            </button>
            {showAlways && (
              <button
                type="button"
                onClick={onAlwaysAllow}
                className="rounded-[10px] px-3.5 py-1.5 text-[13px] text-[var(--text-dim)] transition-colors hover:text-[var(--text-2)]"
              >
                Always allow
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
