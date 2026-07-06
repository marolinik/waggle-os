'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import DownloadCTA from './DownloadCTA';
import { emit, events } from '../_lib/event-taxonomy';
import styles from './Pricing.module.css';

type BillingPeriod = 'monthly' | 'annual';
type TierId = 'SOLO' | 'TEAMS';

interface TierDef {
  readonly id: TierId;
  readonly nsKey: 'solo' | 'teams';
  readonly highlighted: boolean;
  readonly bulletKeys: readonly string[];
  readonly ctaType: 'download' | 'stripe';
}

/**
 * Tier content mirrors `packages/shared/src/tiers.ts` (the canonical tier
 * system): SOLO is free forever with full memory + Harvest, unlimited
 * workspaces, marketplace, all connectors, and BYO cloud models; TEAMS adds
 * shared workspaces, WaggleDance, and governance. No bullets beyond what
 * tiers.ts encodes. The 15-day Team trial lives in the section subhead —
 * it applies to every install, so listing it as a Solo feature misreads.
 */
const TIER_DEFS: readonly TierDef[] = [
  {
    id: 'SOLO',
    nsKey: 'solo',
    highlighted: false,
    bulletKeys: [
      'bullet_memory',
      'bullet_workspaces',
      'bullet_marketplace',
      'bullet_models',
      'bullet_skills',
    ],
    ctaType: 'download',
  },
  {
    id: 'TEAMS',
    nsKey: 'teams',
    highlighted: true,
    bulletKeys: [
      'bullet_everything_solo',
      'bullet_shared',
      'bullet_dance',
      'bullet_governance',
    ],
    ctaType: 'stripe',
  },
];

const STRIPE_ENDPOINT =
  (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '') +
  '/api/stripe/checkout';

const KVARK_URL = 'https://www.kvark.ai';

export default function Pricing() {
  const t = useTranslations('landing.pricing');
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [loading, setLoading] = useState<TierId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBillingChange = useCallback((mode: BillingPeriod) => {
    setBilling(mode);
    emit({ name: events.pricingBillingToggle, properties: { mode } });
  }, []);

  const handleStripeCheckout = useCallback(
    async (tier: TierId) => {
      setLoading(tier);
      setError(null);
      emit({
        name: events.ctaClick,
        properties: { section: 'pricing', tier, billing },
      });
      try {
        const res = await fetch(STRIPE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier, billingPeriod: billing }),
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          // Same-tab redirect: window.open is popup-blockable after an
          // async fetch, which silently killed paid conversions.
          if (data.url) window.location.assign(data.url);
        } else {
          const err = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setError(err.message ?? t('errors.checkout_default'));
        }
      } catch {
        setError(t('errors.network'));
      } finally {
        setLoading(null);
      }
    },
    [billing, t],
  );

  return (
    <section id="pricing" className="section" aria-labelledby="pricing-heading">
      <div className="container-wide">
        <header className={styles.header}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="pricing-heading" className="section-headline">
            {t('headline')}
          </h2>
          <p className="section-lead">{t('subhead')}</p>
        </header>

        <div
          role="group"
          aria-label={t('toggle.aria_group')}
          className={styles.toggleRow}
        >
          <button
            type="button"
            onClick={() => handleBillingChange('monthly')}
            className={[
              styles.toggle,
              billing === 'monthly' ? styles.toggleActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={billing === 'monthly'}
          >
            {t('toggle.monthly')}
          </button>
          <button
            type="button"
            onClick={() => handleBillingChange('annual')}
            className={[
              styles.toggle,
              billing === 'annual' ? styles.toggleActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={billing === 'annual'}
          >
            {t('toggle.annual')}
            <span className={styles.savePill}>{t('toggle.save_pill')}</span>
          </button>
        </div>

        <div className={styles.grid}>
          {TIER_DEFS.map((tier) => {
            const priceKey =
              billing === 'monthly' ? 'price_monthly' : 'price_annual';
            const cardClass = [
              styles.tierCard,
              tier.highlighted ? styles.tierCardHighlighted : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div key={tier.id} className={cardClass}>
                {tier.highlighted ? (
                  <span className={styles.badge}>{t('popular_badge')}</span>
                ) : null}
                <h3 className={styles.tierName}>
                  {t(`tiers.${tier.nsKey}.name`)}
                </h3>
                <p className={styles.tierTagline}>
                  {t(`tiers.${tier.nsKey}.tagline`)}
                </p>

                <p className={styles.price}>
                  {t(`tiers.${tier.nsKey}.${priceKey}`)}
                </p>
                <p className={styles.priceNote}>
                  {t(`tiers.${tier.nsKey}.note`)}
                </p>

                <ul className={styles.bullets}>
                  {tier.bulletKeys.map((bk) => (
                    <li key={bk} className={styles.bullet}>
                      <CheckIcon />
                      <span>{t(`tiers.${tier.nsKey}.${bk}`)}</span>
                    </li>
                  ))}
                </ul>

                {tier.ctaType === 'download' ? (
                  <DownloadCTA
                    section="solo-tier"
                    variant={tier.highlighted ? 'primary' : 'ghost'}
                    style={{ width: '100%' }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStripeCheckout(tier.id)}
                    disabled={loading === tier.id}
                    className={[
                      'btn',
                      tier.highlighted ? 'btn-primary' : 'btn-ghost',
                      styles.tierCta,
                    ].join(' ')}
                  >
                    {loading === tier.id
                      ? t('loading')
                      : t(`tiers.${tier.nsKey}.cta`)}
                  </button>
                )}
              </div>
            );
          })}

          {/* Enterprise = KVARK sovereign deployment. A quieter third card
              (description, no checklist) so the grid fills its row without
              inventing a tier — pricing stays consultative. */}
          <div className={[styles.tierCard, styles.tierCardQuiet].join(' ')}>
            <h3 className={styles.tierName}>{t('enterprise.name')}</h3>
            <p className={styles.tierTagline}>{t('enterprise.tagline')}</p>

            <p className={styles.price}>{t('enterprise.price')}</p>
            <p className={styles.priceNote}>{t('enterprise.note')}</p>

            <p className={styles.enterpriseBody}>{t('enterprise.text')}</p>

            <a
              href={KVARK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={['btn', 'btn-ghost', styles.tierCta].join(' ')}
            >
              {t('enterprise.cta')}
            </a>
          </div>
        </div>

        {error ? (
          <p role="alert" style={{ textAlign: 'center', color: 'var(--risk)', fontSize: 13, marginBottom: 24 }}>
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={styles.bulletIcon}
    >
      <path
        d="M3 8.5 L6.5 12 L13 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
