import { getTranslations } from 'next-intl/server';
import DownloadCTA from './DownloadCTA';
import HeroVisual from './HeroVisual';
import styles from './Hero.module.css';

const MICROCOPY_KEYS = [
  'microcopy_free',
  'microcopy_platforms',
  'microcopy_oss',
] as const;

/**
 * Hero — single committed headline (the A/B variant infra was removed with
 * the 2026-07 rebuild). Two columns: positioning copy left, the memory-core
 * window visual right. All strings under `landing.hero.*`.
 */
export default async function Hero() {
  const t = await getTranslations('landing.hero');

  return (
    <section id="hero" className={`${styles.section} honeycomb-bg`}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.grid}>
        <div className={styles.copy}>
          <p className="eyebrow">{t('eyebrow')}</p>

          <h1 className={styles.headline}>
            {t('headline_lead')}{' '}
            <span className={styles.headlineEmphasis}>
              {t('headline_emphasis')}
            </span>
            .
          </h1>

          <p className={styles.subhead}>{t('subhead')}</p>

          <div className={styles.ctaRow}>
            <DownloadCTA section="hero" variant="primary" />
            <a href="#proof" className="btn btn-ghost">
              {t('cta_secondary')}
            </a>
          </div>

          <ul className={styles.microcopy}>
            {MICROCOPY_KEYS.map((key) => (
              <li key={key} className={styles.microItem}>
                <span aria-hidden="true" className={styles.microDot} />
                {t(key)}
              </li>
            ))}
          </ul>

          {/* Round-7: the hero's dead bottom quarter carries the product's
              strongest proof — one benchmark strip, linking to #proof.
              Wave R Lane E: the 86.49% number is lifted to a flagship stat
              (larger mono, honey) so the leaderboard claim carries visual
              weight near the CTAs; the rest stays quiet supporting copy. */}
          <a href="#proof" className={styles.proofStrip}>
            <span className={styles.proofStat}>{t('proof_stat')}</span>
            <span className={styles.proofLabel}>{t('proof_strip')}</span>
            <span aria-hidden="true">→</span>
          </a>
        </div>

        <div className={styles.visual}>
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}
