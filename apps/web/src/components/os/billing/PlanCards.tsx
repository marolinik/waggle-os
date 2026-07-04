/**
 * PlanCards — warm-Hive PR7a Billing (design screen 14 "Plans" state).
 *
 * The 3-card Plans grid (Free / Pro · most-popular / Teams) + the Monthly|Annual
 * −20% cycle toggle, themed to the warm tokens (PR1). Prices are DISPLAY COPY from
 * `tiers.ts` (D10) — the *charged* amount is whatever Stripe renders on the hosted
 * Checkout page; this UI never asserts the real charge. Choosing a plan hands off to
 * hosted Stripe Checkout via `onChoose` (D5) — no in-app card capture.
 *
 * The toggle resolves a real `billingPeriod` that threads to the annual Stripe price
 * (D8/F9) — it is NOT a cosmetic `× 0.8` client number.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';

type CheckoutTier = 'PRO' | 'TEAMS';
type BillingPeriod = 'monthly' | 'annual';

interface PlanDef {
  /** Canonical tier id this card maps to (FREE has no checkout). */
  tier: 'FREE' | CheckoutTier;
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  unitMonthly: string;
  unitAnnual: string;
  tagline: string;
  features: readonly string[];
  popular?: boolean;
}

/** Display copy only (D10) — mirrors `billing.html` + `tiers.ts` doc prices. */
const PLANS: readonly PlanDef[] = [
  {
    tier: 'FREE',
    name: 'Free',
    priceMonthly: '$0',
    priceAnnual: '$0',
    unitMonthly: '/ forever',
    unitAnnual: '/ forever',
    tagline: 'For individuals exploring an AI workspace.',
    features: ['Personal memory graph', 'All major LLMs + local', 'Local-first by default'],
  },
  {
    tier: 'PRO',
    name: 'Pro',
    priceMonthly: '$19',
    priceAnnual: '$15',
    unitMonthly: '/ month',
    unitAnnual: '/ mo · billed yearly',
    tagline: 'For power users compounding across projects.',
    features: ['Everything in Free', 'Sync across devices', 'Marketplace skills & connectors', 'Self-evolving skills'],
    popular: true,
  },
  {
    tier: 'TEAMS',
    name: 'Teams',
    priceMonthly: '$49',
    priceAnnual: '$39',
    unitMonthly: '/ seat / mo',
    unitAnnual: '/ seat · yearly',
    tagline: 'Shared memory without losing privacy.',
    features: ['Everything in Pro', 'Shared team memory', 'WaggleDance multi-agent', 'SSO & role-based access'],
  },
];

/** Upgrade ordering. TRIAL collapses to the FREE entry-point for the "current" marker. */
const RANK: Record<string, number> = { FREE: 0, TRIAL: 0, PRO: 1, TEAMS: 2, ENTERPRISE: 3 };

interface PlanCardsProps {
  /** Resolved current tier (caller must only render this on a resolved tier — F7). */
  currentTier: string;
  /** Hand off to hosted Stripe Checkout for an upgrade. */
  onChoose: (tier: CheckoutTier, period: BillingPeriod) => void;
  /** Stripe not configured (503) — render CTAs as a disabled honest state (F8). */
  disabled?: boolean;
}

export default function PlanCards({ currentTier, onChoose, disabled = false }: PlanCardsProps) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const currentRank = RANK[currentTier] ?? 0;

  return (
    <div className="space-y-6">
      {/* Monthly | Annual −20% cycle toggle */}
      <div className="flex justify-center">
        <div
          className="inline-flex p-1 gap-[3px] rounded-[11px] bg-[var(--surface-2)] border border-[var(--line-soft)]"
          role="group"
          aria-label="Billing cycle"
        >
          {(['monthly', 'annual'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                period === p ? 'bg-primary text-primary-foreground' : 'text-[var(--text-muted)] hover:text-foreground'
              }`}
            >
              {p === 'monthly' ? 'Monthly' : 'Annual'}
              {p === 'annual' && (
                <span className={`ml-1.5 text-[10.5px] ${period === 'annual' ? 'text-primary-foreground' : 'text-[var(--healthy)]'}`}>
                  −20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3-card plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {PLANS.map((plan) => {
          const planRank = RANK[plan.tier];
          // A TRIAL user is not on the Free plan — the honest "Trial — everything
          // unlocked" badge lives above the grid, so no card claims to be "current".
          const isCurrent = planRank === currentRank && currentTier !== 'TRIAL';
          const isUpgrade = planRank > currentRank && plan.tier !== 'FREE';
          const price = period === 'annual' ? plan.priceAnnual : plan.priceMonthly;
          const unit = period === 'annual' ? plan.unitAnnual : plan.unitMonthly;

          return (
            <div
              key={plan.tier}
              // Honey glow via inline style (the BenchmarkApp pattern): Tailwind v4's
              // arbitrary `shadow-[var(--shadow-honey)]` resolves to box-shadow:none
              // here (live-verified), so the focal card sets the shadow var inline.
              style={plan.popular ? { boxShadow: 'var(--shadow-honey)' } : undefined}
              className={`relative flex flex-col p-6 rounded-[18px] border bg-[var(--surface)] ${
                plan.popular
                  ? 'border-[var(--honey-line)]'
                  : isCurrent
                  ? 'border-[var(--work)]'
                  : 'border-[var(--line-soft)]'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-[11px] left-6 text-[11px] font-bold uppercase tracking-[0.04em] text-primary-foreground bg-primary px-[11px] py-1 rounded-full">
                  Most popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-[11px] right-6 text-[11px] font-bold uppercase text-white bg-[var(--work)] px-[11px] py-1 rounded-full">
                  Current
                </span>
              )}

              <div className="text-[15px] font-semibold text-[var(--text-2)]">{plan.name}</div>
              <div className="text-[38px] font-[750] tracking-[-0.03em] mt-3 mb-0.5 text-foreground">
                {price}
                <small className="text-[15px] font-medium text-[var(--text-muted)] tracking-normal"> {unit}</small>
              </div>
              <div className="text-[13px] text-[var(--text-muted)] mb-5 min-h-[36px]">{plan.tagline}</div>

              <ul className="list-none m-0 mb-6 p-0 grid gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-[13px] text-[var(--text-2)] grid grid-cols-[17px_1fr] gap-2 leading-snug">
                    <Check className="w-3.5 h-3.5 mt-0.5 text-[var(--healthy)]" strokeWidth={2.4} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {isUpgrade ? (
                <button
                  onClick={() => onChoose(plan.tier as CheckoutTier, period)}
                  disabled={disabled}
                  className={`py-2.5 rounded-[10px] text-[14px] font-[650] text-center border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.popular
                      ? 'bg-primary text-primary-foreground border-transparent hover:bg-[var(--honey-bright)]'
                      : 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--line-strong)] hover:border-[var(--honey-line)] hover:text-primary'
                  }`}
                >
                  {disabled ? 'Unavailable' : `Choose ${plan.name}`}
                </button>
              ) : (
                <div className="py-2.5 rounded-[10px] text-[14px] font-[650] text-center border border-[var(--line-soft)] bg-transparent text-[var(--text-dim)] cursor-default">
                  {isCurrent ? 'Your plan' : 'Included'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
