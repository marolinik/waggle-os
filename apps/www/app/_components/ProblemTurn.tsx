import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import styles from './ProblemTurn.module.css';

const BEATS = ['reintroduce', 'tabs', 'compound'] as const;

/**
 * The problem statement ("every AI session starts from zero") in three
 * beats, then the turn — Waggle's opposite bet — as a pull-quote with a
 * honey rule. Strings under `landing.problem.*`.
 */
export default async function ProblemTurn() {
  const t = await getTranslations('landing.problem');

  return (
    <section
      id="problem"
      className="section"
      aria-labelledby="problem-heading"
    >
      <div className="container">
        <header className={styles.header}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="problem-heading" className="section-headline">
            {t('headline')}
          </h2>
        </header>

        <div className={styles.grid}>
          {BEATS.map((beat, i) => (
            <Reveal key={beat} delay={(i + 1) as 1 | 2 | 3}>
              <div className={styles.beat}>
                <span className={styles.beatIndex} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.beatTitle}>{t(`beats.${beat}.title`)}</h3>
                <p className={styles.beatBody}>{t(`beats.${beat}.body`)}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className={styles.turn}>
            <p className={styles.turnText}>{t('turn')}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
