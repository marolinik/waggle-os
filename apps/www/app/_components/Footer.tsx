import { getTranslations } from 'next-intl/server';
import BrandMark from './BrandMark';
import styles from './Footer.module.css';

interface FooterLink {
  readonly key: string;
  readonly href: string;
  readonly external?: boolean;
}

/**
 * Footer link map. Rule: every link must resolve to a real destination —
 * no `#` placeholders. Columns whose content does not exist yet (blog,
 * press, changelog) are omitted until they do.
 */
const PRODUCT_LINKS: readonly FooterLink[] = [
  {
    key: 'download',
    href: '/download',
  },
  { key: 'pricing', href: '/#pricing' },
  { key: 'how_it_works', href: '/#how-it-works' },
  { key: 'memory', href: '/#memory' },
];

const RESEARCH_LINKS: readonly FooterLink[] = [
  { key: 'methodology', href: '/docs/methodology' },
  {
    key: 'benchmarks',
    href: 'https://github.com/marolinik/hive-mind',
    external: true,
  },
  {
    key: 'hive_mind',
    href: 'https://github.com/marolinik/hive-mind',
    external: true,
  },
];

const COMPANY_LINKS: readonly FooterLink[] = [
  { key: 'about_egzakta', href: 'https://egzakta.com', external: true },
  { key: 'kvark', href: 'https://www.kvark.ai', external: true },
  { key: 'contact', href: 'mailto:hello@egzakta.com' },
];

const LEGAL_LINKS: readonly FooterLink[] = [
  { key: 'terms', href: '/terms' },
  { key: 'privacy', href: '/privacy' },
  { key: 'cookies', href: '/cookies' },
  { key: 'eu_ai_act', href: '/eu-ai-act' },
  {
    key: 'apache',
    href: 'https://github.com/marolinik/hive-mind/blob/master/LICENSE',
    external: true,
  },
];

const COLUMN_DEFS = [
  { ns: 'product', links: PRODUCT_LINKS },
  { ns: 'research', links: RESEARCH_LINKS },
  { ns: 'company', links: COMPANY_LINKS },
  { ns: 'legal', links: LEGAL_LINKS },
] as const;

export default async function Footer() {
  const t = await getTranslations('landing.footer');

  return (
    <footer id="footer" className={styles.footer}>
      <div className={styles.grid}>
        <div className={styles.brandBlock}>
          <BrandMark withWordmark />
          <p className={styles.brandDescription}>{t('brand.description')}</p>
          <p className={styles.attribution}>{t('brand.attribution')}</p>
        </div>

        {COLUMN_DEFS.map((col) => (
          <div key={col.ns}>
            <h3 className={styles.columnTitle}>{t(`columns.${col.ns}.title`)}</h3>
            <ul className={styles.columnList}>
              {col.links.map((l) => (
                <li key={l.key}>
                  <a
                    href={l.href}
                    {...(l.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : null)}
                    className={styles.columnLink}
                  >
                    {t(`columns.${col.ns}.links.${l.key}`)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.baseline}>
        <span>{t('base_line.left')}</span>
        <span className={styles.baselineRight}>{t('base_line.right')}</span>
      </div>
    </footer>
  );
}
