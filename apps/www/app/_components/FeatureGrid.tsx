import { getTranslations } from 'next-intl/server';
import Reveal from './Reveal';
import styles from './FeatureGrid.module.css';

type FeatureKey =
  | 'personas'
  | 'models'
  | 'harvest'
  | 'loops'
  | 'skills'
  | 'memory_center';

const FEATURES: readonly FeatureKey[] = [
  'personas',
  'models',
  'harvest',
  'loops',
  'skills',
  'memory_center',
];

/**
 * Six feature cards, each naming a real subsystem (persona roster, LiteLLM
 * routing, Harvest, Loops + approval queue, skills/connectors/MCP catalog,
 * Memory Center). Strings under `landing.features.*`.
 */
export default async function FeatureGrid() {
  const t = await getTranslations('landing.features');

  return (
    <section
      id="features"
      className="section"
      aria-labelledby="features-heading"
    >
      <div className="container-wide">
        <header className={styles.header}>
          <p className="eyebrow">{t('eyebrow')}</p>
          <h2 id="features-heading" className="section-headline">
            {t('headline')}
          </h2>
        </header>

        <div className={styles.grid}>
          {FEATURES.map((key, i) => (
            <Reveal key={key} delay={((i % 3) + 1) as 1 | 2 | 3}>
              <div className={styles.item}>
                <span className={styles.icon} aria-hidden="true">
                  <FeatureIcon feature={key} />
                </span>
                <h3 className={styles.title}>{t(`items.${key}.title`)}</h3>
                <p className={styles.body}>{t(`items.${key}.body`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Minimal 18px line icons — one per subsystem, stroke inherits currentColor. */
function FeatureIcon({ feature }: { readonly feature: FeatureKey }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 18 18',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;

  switch (feature) {
    case 'personas':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="6" cy="6.5" r="2.6" />
          <path d="M1.8 14.8 C2.4 11.8 4.4 10.6 6 10.6 C7.6 10.6 9.6 11.8 10.2 14.8" />
          <circle cx="12.8" cy="5.4" r="2" />
          <path d="M10.9 9.4 C12 8.8 14.6 9 16.2 12.4" />
        </svg>
      );
    case 'models':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="9" cy="9" r="2.2" />
          <path d="M9 6.8 V2.2 M9 11.2 V15.8 M6.8 9 H2.2 M11.2 9 H15.8" />
          <circle cx="9" cy="2.2" r="1.2" />
          <circle cx="9" cy="15.8" r="1.2" />
          <circle cx="2.2" cy="9" r="1.2" />
          <circle cx="15.8" cy="9" r="1.2" />
        </svg>
      );
    case 'harvest':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 2 V11 M5.4 7.6 L9 11.2 L12.6 7.6" />
          <path d="M2.5 12.5 V14.5 C2.5 15.3 3.2 16 4 16 H14 C14.8 16 15.5 15.3 15.5 14.5 V12.5" />
        </svg>
      );
    case 'loops':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M14.5 7 A6 6 0 1 0 15.5 10.5" />
          <path d="M15.8 3.4 L15.8 7.2 L12 7.2" />
        </svg>
      );
    case 'skills':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2.4" y="2.4" width="5.6" height="5.6" rx="1.4" />
          <rect x="10" y="2.4" width="5.6" height="5.6" rx="1.4" />
          <rect x="2.4" y="10" width="5.6" height="5.6" rx="1.4" />
          <path d="M12.8 10.4 V15.2 M10.4 12.8 H15.2" />
        </svg>
      );
    case 'memory_center':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 1.8 L15.2 5.4 L15.2 12.6 L9 16.2 L2.8 12.6 L2.8 5.4 Z" />
          <circle cx="9" cy="9" r="2.4" />
        </svg>
      );
  }
}
