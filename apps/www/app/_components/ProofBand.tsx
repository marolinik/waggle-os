import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import { LOCOMO_BARS } from '../_data/proof-points';
import styles from './ProofBand.module.css';

const HIVE_MIND_URL = 'https://github.com/marolinik/hive-mind';

/**
 * Benchmark proof band. The chart is honest by construction: bar widths are
 * raw scores on a 0–100 axis (no truncated baseline), the protocol footnote
 * names the judge, N, and significance, and both CTAs lead to verification
 * paths (methodology page, reproducible repo). Data from `_data/proof-points`.
 */
export default async function ProofBand() {
  const t = await getTranslations('landing.proof');

  return (
    <section
      id="proof"
      className={`section ${styles.band}`}
      aria-labelledby="proof-heading"
    >
      <div className="container">
        <header className={styles.header}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="proof-heading" className="section-headline">
            {t('headline')}
          </h2>
          <p className="section-lead">{t('body')}</p>
        </header>

        <Reveal>
          <div className={styles.chart} role="img" aria-label={t('chart_aria')}>
            {LOCOMO_BARS.map((bar) => (
              <div key={bar.id} className={styles.row}>
                <span className={styles.system}>
                  <span className={styles.systemName}>{bar.system}</span>
                  <span className={styles.systemDetail}>{bar.detail}</span>
                </span>
                <span className={styles.track}>
                  <span
                    className={[
                      styles.bar,
                      bar.highlight ? styles.barHighlight : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ width: `${bar.score}%` }}
                  />
                </span>
                <span
                  className={[
                    styles.score,
                    bar.highlight ? styles.scoreHighlight : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {bar.score.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        <p className={styles.footnote}>{t('footnote')}</p>

        <div className={styles.ctaRow}>
          <a href="/docs/methodology" className="btn btn-ghost">
            {t('cta_methodology')}
          </a>
          <a
            href={HIVE_MIND_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            {t('cta_reproduce')}
          </a>
        </div>
      </div>
    </section>
  );
}
