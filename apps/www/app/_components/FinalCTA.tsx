import { getTranslations } from 'next-intl/server';
import DownloadCTA from './DownloadCTA';
import styles from './FinalCTA.module.css';

const WAGGLE_REPO_URL = 'https://github.com/marolinik/waggle-os';
const KVARK_CONTACT =
  'mailto:kvark@egzakta.com?subject=Waggle%20%E2%86%92%20KVARK%20sovereign%20deployment';

/**
 * Closing CTA — echoes the hero promise, then routes to Download or GitHub,
 * with the KVARK sovereign-deployment escape hatch underneath. Strings
 * under `landing.final_cta.*`.
 */
export default async function FinalCTA() {
  const t = await getTranslations('landing.final_cta');

  return (
    <section
      id="final-cta"
      className={`${styles.section} honeycomb-bg`}
      aria-labelledby="final-heading"
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <h2 id="final-heading" className={styles.headline}>
          {t('headline')}
        </h2>
        <p className={styles.subhead}>{t('subhead')}</p>

        <div className={styles.ctaRow}>
          <DownloadCTA section="final-cta" variant="primary" />
          <a
            href={WAGGLE_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
          >
            {t('cta_github')}
          </a>
        </div>

        <p className={styles.kvark}>
          {t('kvark_text')}
          <a href={KVARK_CONTACT} className={styles.kvarkLink}>
            {t('kvark_cta')} →
          </a>
        </p>
      </div>
    </section>
  );
}
