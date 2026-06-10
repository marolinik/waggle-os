import { useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

/**
 * ApprovalModal — the reusable approval pattern (UX-Refactor Phase 3C,
 * design-system delta; PRD §17.3 "all elevated access is reviewed").
 *
 * Wraps ui/alert-dialog (Radix — traps focus + restores it on its own).
 * The requested action, scope and risk level all render as TEXT so screen
 * readers announce the full request (design-system-delta a11y #7). Phase-3
 * consumers: agent elevation (S18) and automation activation (S20); Phase 4
 * reuses it for install-risk.
 */
export interface ApprovalRequest {
  /** What will happen, in plain language. */
  readonly action: string;
  /** What it touches — one line per granted surface. */
  readonly scope: ReadonlyArray<string>;
  readonly riskLevel: 'low' | 'medium' | 'high';
}

interface ApprovalModalProps {
  /** Null = closed. */
  request: ApprovalRequest | null;
  approveLabel?: string;
  busy?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

const RISK_LABELS: Record<ApprovalRequest['riskLevel'], string> = {
  low: 'Low', medium: 'Medium', high: 'High',
};
const RISK_CLASSES: Record<ApprovalRequest['riskLevel'], string> = {
  low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-destructive',
};

export const ApprovalModal = ({ request, approveLabel = 'Approve', busy, onApprove, onCancel }: ApprovalModalProps) => {
  // Radix's Action/Cancel both auto-close → onOpenChange(false). Make
  // onOpenChange the SINGLE close path and skip onCancel when the close was
  // caused by Approve — otherwise every approval would also fire the cancel
  // handler (harmless today, wrong the moment onCancel carries "user
  // declined" semantics, e.g. the Phase-4 install-risk audit log).
  const approvedRef = useRef(false);
  return (
  <AlertDialog
    open={!!request}
    onOpenChange={(open) => {
      if (open) return;
      if (approvedRef.current) { approvedRef.current = false; return; }
      onCancel();
    }}
  >
    <AlertDialogContent data-testid="approval-modal">
      <AlertDialogHeader>
        <AlertDialogTitle>Approval required</AlertDialogTitle>
        <AlertDialogDescription>{request?.action}</AlertDialogDescription>
      </AlertDialogHeader>
      {request && (
        <div className="space-y-2">
          <p className="text-xs">
            <span className="text-muted-foreground">Risk level: </span>
            <span className={`font-medium ${RISK_CLASSES[request.riskLevel]}`}>{RISK_LABELS[request.riskLevel]}</span>
          </p>
          <div>
            <p className="text-[11px] font-display uppercase tracking-wide text-muted-foreground">Requested access</p>
            <ul className="mt-1 space-y-0.5">
              {request.scope.map((s) => (
                <li key={s} className="text-xs text-foreground/90">• {s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => { approvedRef.current = true; onApprove(); }}
          disabled={busy}
          data-testid="approval-modal-approve"
        >
          {approveLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  );
};
