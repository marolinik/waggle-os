import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import styles from './OpenSource.module.css';

const HIVE_MIND_URL = 'https://github.com/marolinik/hive-mind';
const NPM_URL = 'https://www.npmjs.com/package/@hive-mind/core';

/**
 * Open-source section: hive-mind (the memory substrate) with a terminal
 * showing the offline benchmark reproduction path. Command + output are
 * verbatim from the OSS repo (benchmarks/locomo/artifacts/w4-n1540/
 * recount.mjs — verified against the local clone 2026-07-03); if that
 * script moves, update this terminal. Strings under `landing.open_source.*`.
 */
export default async function OpenSource() {
  const t = await getTranslations('landing.open_source');

  return (
    <section
      id="open-source"
      className="section"
      aria-labelledby="oss-heading"
    >
      <div className="container">
        <div className={styles.grid}>
          <div>
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 id="oss-heading" className="section-headline">
              {t('headline')}
            </h2>
            <p className={styles.body}>{t('body')}</p>
            <div className={styles.ctaRow}>
              <a
                href={HIVE_MIND_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                {t('cta_github')}
              </a>
              <a
                href={NPM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                {t('cta_npm')}
              </a>
            </div>
          </div>

          <Reveal>
            <div className={styles.terminal} aria-label={t('terminal_aria')}>
              <div className={styles.terminalBar}>
                <span className={styles.terminalDots} aria-hidden="true">
                  <span className={styles.terminalDot} />
                  <span className={styles.terminalDot} />
                  <span className={styles.terminalDot} />
                </span>
                <span className={styles.terminalTitle}>
                  {t('terminal_title')}
                </span>
              </div>
              <pre className={styles.terminalBody}>
                <code>
                  <span className={styles.prompt}>$ </span>
                  git clone https://github.com/marolinik/hive-mind{'\n'}
                  <span className={styles.prompt}>$ </span>
                  cd hive-mind/benchmarks/locomo{'\n'}
                  <span className={styles.comment}>
                    # recount the committed judgments — no API keys, no network
                  </span>
                  {'\n'}
                  <span className={styles.prompt}>$ </span>
                  node artifacts/w4-n1540/recount.mjs{'\n'}
                  <span className={styles.output}>
                    overall 1332/1540 = 86.49%{'\n'}
                    RECOUNT OK — committed judgments reproduce 86.49%.
                  </span>
                </code>
              </pre>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
