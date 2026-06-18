/**
 * PaymentSuccessApp — warm-Hive PR7a Billing (design screen 14 "Success" state).
 *
 * The post-Stripe-Checkout landing (`/payment-success?session_id=…`, set by
 * `checkout.ts:42`). `useBilling` auto-detects `?session_id=` on mount and calls
 * POST /api/stripe/sync (payment-gated) → flips the tier. This screen renders the
 * confirmation OFF THE SYNCED TIER only.
 *
 * No-fabrication (recon 04 §3 / plan F5): the design's receipt block (receipt #,
 * "Trial ends Jun 28", "Then $19/mo", "Emailed →") has NO data source — `/sync`
 * returns only `{ tier, customerId }`. Those rows are GATED OFF here; we never invent
 * a charge amount, a trial-end date, or a receipt link.
 */
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useBilling } from '@/hooks/useBilling';

const TIER_HEADLINE: Record<string, string> = {
  PRO: 'Pro',
  TEAMS: 'Teams',
  ENTERPRISE: 'Enterprise',
};

export default function PaymentSuccessApp() {
  const navigate = useNavigate();
  const billing = useBilling();
  const isPaid = billing.tier === 'PRO' || billing.tier === 'TEAMS' || billing.tier === 'ENTERPRISE';

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[520px] mx-auto px-8 py-[70px] text-center">
        {/* Syncing — the real payment confirmation is in flight */}
        {billing.syncing ? (
          <div className="flex flex-col items-center gap-4" data-testid="payment-success-syncing">
            <Loader2 className="w-9 h-9 animate-spin text-primary" />
            <p className="text-[15px] text-[var(--text-2)]">Confirming your payment…</p>
          </div>
        ) : billing.error ? (
          /* Honest failure — never fake a success (F10/F5) */
          <div className="flex flex-col items-center gap-4" data-testid="payment-success-error">
            <div className="w-[78px] h-[78px] rounded-full grid place-items-center bg-destructive/10 border border-destructive/30">
              <AlertCircle className="w-9 h-9 text-destructive" strokeWidth={2.2} />
            </div>
            <h1 className="text-[24px] font-[650] tracking-[-0.02em] text-foreground">We couldn’t confirm the payment</h1>
            <p className="text-[14px] text-[var(--text-muted)] max-w-[42ch]">{billing.error}</p>
            <button
              onClick={() => navigate('/settings?tab=billing')}
              className="mt-2 px-[22px] py-3 rounded-[11px] text-[14.5px] font-[650] bg-[var(--surface)] text-[var(--text-2)] border border-[var(--line-strong)] hover:border-[var(--honey-line)] hover:text-primary transition-colors"
            >
              Back to plans
            </button>
          </div>
        ) : isPaid ? (
          /* Confirmation off the SYNCED tier — no receipt rows (F5) */
          <>
            <div className="w-[78px] h-[78px] rounded-full mx-auto mb-6 grid place-items-center bg-[var(--healthy-wash)] border border-[color:color-mix(in_srgb,var(--healthy)_40%,transparent)]">
              <Check className="w-9 h-9 text-[var(--healthy)]" strokeWidth={2.2} />
            </div>
            <h1 className="text-[28px] font-[650] tracking-[-0.02em] mb-3 text-foreground">
              You’re <span className="text-primary">{TIER_HEADLINE[billing.tier] ?? billing.tier}.</span>
            </h1>
            <p className="text-[15px] text-[var(--text-2)] leading-relaxed mx-auto mb-7 max-w-[42ch]">
              Your hive just leveled up — <b className="text-foreground">sync, the marketplace, and self-evolving skills</b> are live.
            </p>
            <div className="inline-flex gap-2.5">
              <button
                onClick={() => navigate('/home')}
                className="px-[22px] py-3 rounded-[11px] text-[14.5px] font-[650] bg-primary text-primary-foreground hover:bg-[var(--honey-bright)] transition-colors"
              >
                Start using {TIER_HEADLINE[billing.tier] ?? billing.tier} →
              </button>
              <button
                onClick={() => navigate('/settings?tab=billing')}
                className="px-[22px] py-3 rounded-[11px] text-[14.5px] font-[650] bg-[var(--surface)] text-[var(--text-2)] border border-[var(--line-strong)] hover:border-[var(--honey-line)] hover:text-primary transition-colors"
              >
                Manage billing
              </button>
            </div>
          </>
        ) : (
          /* Synced but not on a paid tier (cancelled / unpaid) — honest, no fake success */
          <div className="flex flex-col items-center gap-4" data-testid="payment-success-unpaid">
            <h1 className="text-[24px] font-[650] tracking-[-0.02em] text-foreground">Nothing to confirm</h1>
            <p className="text-[14px] text-[var(--text-muted)] max-w-[42ch]">
              We didn’t detect a completed checkout. If you just paid, give it a moment and refresh.
            </p>
            <button
              onClick={() => navigate('/settings?tab=billing')}
              className="mt-2 px-[22px] py-3 rounded-[11px] text-[14.5px] font-[650] bg-[var(--surface)] text-[var(--text-2)] border border-[var(--line-strong)] hover:border-[var(--honey-line)] hover:text-primary transition-colors"
            >
              Back to plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
