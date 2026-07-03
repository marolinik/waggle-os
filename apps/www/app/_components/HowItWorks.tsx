import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import styles from './HowItWorks.module.css';

const STEPS = ['step_01', 'step_02', 'step_03'] as const;

/**
 * Three-step product story: import history → work in workspaces → memory
 * compounds. Strings under `landing.how_it_works.*`.
 */
export default async function HowItWorks() {
  const t = await getTranslations('landing.how_it_works');

  return (
    <section
      id="how-it-works"
      className="section"
      aria-labelledby="how-heading"
    >
      <div className="container">
        <header className={styles.header}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="how-heading" className="section-headline">
            {t('headline')}
          </h2>
        </header>

        <div className={styles.steps}>
          {STEPS.map((step, i) => (
            <Reveal key={step} delay={(i + 1) as 1 | 2 | 3}>
              <div className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {t(`${step}.number`)}
                </span>
                <h3 className={styles.stepTitle}>{t(`${step}.title`)}</h3>
                <p className={styles.stepBody}>{t(`${step}.body`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
