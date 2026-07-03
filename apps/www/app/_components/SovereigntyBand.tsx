import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import styles from './SovereigntyBand.module.css';

const ITEMS = ['device', 'egress', 'erasure', 'injection'] as const;

/**
 * Data-sovereignty band: four specific, verifiable statements about where
 * data lives and what leaves the machine. Trust through specificity — no
 * compliance badges we don't hold. Strings under `landing.sovereignty.*`.
 */
export default async function SovereigntyBand() {
  const t = await getTranslations('landing.sovereignty');

  return (
    <section
      id="trust"
      className={`section ${styles.band}`}
      aria-labelledby="trust-heading"
    >
      <div className="container">
        <header className={styles.header}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="trust-heading" className="section-headline">
            {t('headline')}
          </h2>
        </header>

        <div className={styles.grid}>
          {ITEMS.map((item, i) => (
            <Reveal key={item} delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
              <div className={styles.item}>
                <h3 className={styles.title}>{t(`items.${item}.title`)}</h3>
                <p className={styles.body}>{t(`items.${item}.body`)}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <a href="/eu-ai-act" className="btn btn-ghost btn-small">
          {t('cta')}
        </a>
      </div>
    </section>
  );
}
