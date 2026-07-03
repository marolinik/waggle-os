import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import styles from './MemoryDiagram.module.css';

const CHIP_KEYS = ['local', 'provenance', 'erasure'] as const;

/**
 * "Under the hood" — the real memory pipeline, named after the actual
 * subsystems (frames → hybrid search → knowledge graph → any model).
 * Copy under `landing.memory.*`; the diagram is semantic HTML so it
 * stacks naturally and needs no JS.
 */
export default async function MemoryDiagram() {
  const t = await getTranslations('landing.memory');

  return (
    <section id="memory" className="section" aria-labelledby="memory-heading">
      <div className="container">
        <div className={styles.grid}>
          <div>
            <p className="eyebrow">{t('eyebrow')}</p>
            <h2 id="memory-heading" className="section-headline">
              {t('headline')}
            </h2>
            <p className={styles.body}>{t('body')}</p>
            <ul className={styles.chips}>
              {CHIP_KEYS.map((key) => (
                <li key={key} className={styles.chip}>
                  {t(`chips.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <Reveal>
            <div className={styles.pipeline} role="img" aria-label={t('headline')}>
              <div className={styles.node}>
                <span className={styles.nodeTitle}>{t('diagram.input')}</span>
              </div>
              <Arrow />
              <div className={styles.node}>
                <span className={styles.nodeTitle}>{t('diagram.frames')}</span>
              </div>
              <Arrow />
              <div className={styles.node}>
                <span className={styles.nodeTitle}>{t('diagram.search')}</span>
                <span className={styles.nodeSub}>{t('diagram.search_sub')}</span>
              </div>
              <Arrow />
              <div className={styles.node}>
                <span className={styles.nodeTitle}>{t('diagram.graph')}</span>
                <span className={styles.nodeSub}>{t('diagram.graph_sub')}</span>
              </div>
              <Arrow />
              <div className={`${styles.node} ${styles.nodeAccent}`}>
                <span className={styles.nodeTitle}>{t('diagram.output')}</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Arrow() {
  return (
    <span className={styles.connector} aria-hidden="true">
      <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
        <path
          d="M6 0 V11 M2 8 L6 12 L10 8"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
