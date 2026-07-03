import { getTranslations } from 'next-intl/server';
import styles from './HeroVisual.module.css';

const CHIPS = [
  { key: 'claude', x: 28, y: 36, flow: 'out' },
  { key: 'gpt', x: 374, y: 36, flow: 'out' },
  { key: 'qwen', x: 28, y: 258, flow: 'in' },
  { key: 'gemini', x: 374, y: 258, flow: 'out' },
] as const;

const CHIP_W = 118;
const CHIP_H = 44;

/**
 * Hero visualization — a desktop-app window (Waggle ships as a Tauri
 * binary) framing the true architecture: one local memory core serving
 * four model chips. Edges pulse honey; the `qwen · local` edge flows
 * INTO the core (commit) while the others flow out (recall).
 *
 * Server component: the animation is pure CSS (HeroVisual.module.css),
 * disabled under `prefers-reduced-motion`. No invented numbers anywhere —
 * labels name real subsystems only.
 */
export default async function HeroVisual() {
  const t = await getTranslations('landing.hero_visual');

  return (
    <figure className={styles.window} aria-label={t('aria_label')}>
      <div className={styles.titleBar}>
        <span className={styles.trafficDots} aria-hidden="true">
          <span className={styles.trafficDot} />
          <span className={styles.trafficDot} />
          <span className={styles.trafficDot} />
        </span>
        <span className={styles.titleText}>{t('window_title')}</span>
        <span className={styles.titleBadge}>{t('window_badge')}</span>
      </div>

      <svg
        className={styles.svg}
        viewBox="0 0 520 340"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id="hv-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(233,165,44,0.22)" />
            <stop offset="70%" stopColor="rgba(233,165,44,0.05)" />
            <stop offset="100%" stopColor="rgba(233,165,44,0)" />
          </radialGradient>
        </defs>

        {/* Edges: base line + honey pulse. Recall edges run core → chip;
            the commit edge (qwen · local) runs chip → core. */}
        <path className={styles.edge} d="M 232,140 C 200,112 182,84 150,62" />
        <path
          className={`${styles.edgePulse}`}
          d="M 232,140 C 200,112 182,84 150,62"
        />

        <path className={styles.edge} d="M 288,140 C 320,112 338,84 370,62" />
        <path
          className={`${styles.edgePulse} ${styles.edgePulse2}`}
          d="M 288,140 C 320,112 338,84 370,62"
        />

        <path className={styles.edge} d="M 150,278 C 182,256 200,224 232,196" />
        <path
          className={`${styles.edgePulse} ${styles.edgePulse3}`}
          d="M 150,278 C 182,256 200,224 232,196"
        />

        <path className={styles.edge} d="M 288,196 C 320,224 338,256 370,278" />
        <path
          className={`${styles.edgePulse} ${styles.edgePulse4}`}
          d="M 288,196 C 320,224 338,256 370,278"
        />

        {/* Memory core */}
        <circle
          className={styles.coreGlow}
          cx="260"
          cy="168"
          r="78"
          fill="url(#hv-core-glow)"
        />
        <path
          d="M260 112 L308.5 140 L308.5 196 L260 224 L211.5 196 L211.5 140 Z"
          fill="rgba(31, 26, 18, 0.85)"
          stroke="var(--honey-500)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <text
          x="260"
          y="165"
          textAnchor="middle"
          fill="var(--hive-50)"
          fontSize="13.5"
          fontWeight="600"
          fontFamily="var(--sans)"
        >
          {t('center_label')}
        </text>
        <text
          x="260"
          y="184"
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="9"
          fontFamily="var(--mono)"
        >
          {t('center_sublabel')}
        </text>

        {/* Model chips */}
        {CHIPS.map((chip) => (
          <g key={chip.key}>
            <rect
              x={chip.x}
              y={chip.y}
              width={CHIP_W}
              height={CHIP_H}
              rx="10"
              fill="var(--surface)"
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            <text
              x={chip.x + 14}
              y={chip.y + 19}
              fill="var(--hive-100)"
              fontSize="12"
              fontWeight="600"
              fontFamily="var(--mono)"
            >
              {t(`chips.${chip.key}_primary`)}
            </text>
            <text
              x={chip.x + 14}
              y={chip.y + 33}
              fill={chip.flow === 'in' ? 'var(--honey-400)' : 'var(--text-muted)'}
              fontSize="9"
              fontFamily="var(--mono)"
            >
              {chip.flow === 'in' ? '↑ ' : '↓ '}
              {t(`chips.${chip.key}_sub`)}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.footerBar}>
        <span>{t('footer_left')}</span>
        <span>{t('footer_right')}</span>
      </div>
    </figure>
  );
}
