'use client';

import {
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  HEX_TEXTURE_PATH,
  personas,
  type Persona,
  type PersonaSlug,
} from '../_data/personas';

/**
 * 4x4 grid sequence in row-major order. `'filler'` slots occupy top-left,
 * top-right, and bottom-right corners. Numbers reference `Persona.order`.
 */
const LANDING_GRID_SEQUENCE: ReadonlyArray<'filler' | number> = [
  'filler', 1, 2, 'filler',
  3, 4, 5, 6,
  7, 8, 9, 10,
  11, 12, 13, 'filler',
];

const personaByOrder = new Map<number, Persona>(
  personas.map((p) => [p.order, p]),
);

/**
 * Per-persona accent — a curated, warm-Hive-cohesive palette (honey/amber/
 * copper family with a few muted cool notes for rhythm; no purple, no
 * gradients). Each tile gets its own hue on the title, top hairline, and hover
 * border/glow so the grid reads as a cast of characters, not a spreadsheet.
 * Hues are chosen so horizontally/vertically adjacent tiles never repeat, and
 * a few map to meaning (confused → terracotta flag, sleeping → night blue,
 * analyst/team → data green, researcher → analytical blue).
 */
const PERSONA_ACCENTS: Readonly<Record<PersonaSlug, string>> = {
  hunter: '#f6c45a',
  researcher: '#7aa6d6',
  analyst: '#6cb78c',
  connector: '#f2b950',
  architect: '#d98a3d',
  builder: '#e9a52c',
  writer: '#e0916f',
  orchestrator: '#7aa6d6',
  marketer: '#f6c45a',
  team: '#6cb78c',
  celebrating: '#f9d27e',
  confused: '#db8068',
  sleeping: '#86a9d1',
};

export interface BrandPersonasCardProps {
  /** Optional uppercase kicker rendered above the heading (e.g. "Built for"). */
  eyebrow?: string;
  heading?: string;
  subtitle?: string;
  showFillerTiles?: boolean;
  variant?: 'landing' | 'compact';
  onTileHover?: (slug: PersonaSlug) => void;
  onPersonaClick?: (slug: PersonaSlug) => void;
  cta?: ReactNode;
}

/**
 * Single-surface canon of the 13 Waggle bee personas.
 *
 * @remarks
 * Copy is imported verbatim from `_data/personas.ts` — do not override in-place.
 * Assets are loaded via plain `<img>` tags with an `onError` fallback that flips
 * the tile to a hex-texture placeholder. The placeholder auto-disables when an
 * asset loads successfully, so shipping new PNGs requires no code change.
 *
 * @todo compact variant scaffolding — implement in future sprint
 */
export default function BrandPersonasCard({
  eyebrow,
  heading,
  subtitle,
  showFillerTiles = true,
  variant = 'landing',
  onTileHover,
  onPersonaClick,
  cta,
}: BrandPersonasCardProps) {
  const t = useTranslations('landing.brand_personas');
  const resolvedHeading = heading ?? t('default_heading');
  const resolvedSubtitle = subtitle ?? t('default_subtitle');
  const [erroredSlugs, setErroredSlugs] = useState<ReadonlySet<PersonaSlug>>(
    () => new Set(),
  );

  const handleAssetError = useCallback((slug: PersonaSlug) => {
    setErroredSlugs((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  }, []);

  if (variant === 'compact') {
    return (
      <div
        data-testid="brand-personas-card-compact"
        data-variant="compact"
        aria-label={t('compact_aria')}
      >
        {/* Compact variant scaffolding — intentional stub.
            TypeScript interface is stable; parent pages may wire props today
            and receive a fuller layout in a future sprint without refactor. */}
      </div>
    );
  }

  return (
    <section
      data-testid="brand-personas-card"
      data-variant="landing"
      aria-labelledby="waggle-hive-heading"
      style={sectionStyle}
    >
      <header style={headerStyle}>
        {eyebrow ? <p style={eyebrowStyle}>{eyebrow}</p> : null}
        <h2 id="waggle-hive-heading" style={headingStyle}>
          {resolvedHeading}
        </h2>
        <p style={subtitleStyle}>{resolvedSubtitle}</p>
      </header>

      <ul
        role="list"
        data-testid="brand-personas-grid"
        className="waggle-persona-grid"
      >
        {LANDING_GRID_SEQUENCE.map((entry, index) => {
          if (entry === 'filler') {
            if (!showFillerTiles) return null;
            return (
              <li
                key={`filler-${index}`}
                aria-hidden="true"
                data-testid="brand-personas-filler"
                className="waggle-persona-filler"
              />
            );
          }

          const persona = personaByOrder.get(entry);
          if (!persona) {
            // Guard: should never happen — sequence mirrors canonical order.
            return null;
          }

          return (
            <PersonaTile
              key={persona.slug}
              persona={persona}
              hasError={erroredSlugs.has(persona.slug)}
              onAssetError={handleAssetError}
              onPersonaClick={onPersonaClick}
              onTileHover={onTileHover}
            />
          );
        })}
      </ul>

      {cta ? (
        <div data-testid="brand-personas-cta" style={ctaWrapperStyle}>
          {cta}
        </div>
      ) : null}

      <style>{scopedCss}</style>
    </section>
  );
}

interface PersonaTileProps {
  persona: Persona;
  hasError: boolean;
  onAssetError: (slug: PersonaSlug) => void;
  onPersonaClick?: (slug: PersonaSlug) => void;
  onTileHover?: (slug: PersonaSlug) => void;
}

function PersonaTile({
  persona,
  hasError,
  onAssetError,
  onPersonaClick,
  onTileHover,
}: PersonaTileProps) {
  const handleClick = useCallback(() => {
    onPersonaClick?.(persona.slug);
  }, [onPersonaClick, persona.slug]);

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!onPersonaClick) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPersonaClick(persona.slug);
      }
    },
    [onPersonaClick, persona.slug],
  );

  const handleHover = useCallback(() => {
    onTileHover?.(persona.slug);
  }, [onTileHover, persona.slug]);

  const handleFocus = useCallback(() => {
    // Keyboard-only "hover" equivalent so a11y consumers get the same signal.
    onTileHover?.(persona.slug);
  }, [onTileHover, persona.slug]);

  const isInteractive = Boolean(onPersonaClick);

  const figure = (
    <figure className="waggle-persona-figure">
      <div className="waggle-persona-asset-frame">
        {hasError ? (
          <div
            data-testid={`persona-placeholder-${persona.slug}`}
            data-placeholder="true"
            className="waggle-persona-placeholder"
            aria-hidden="true"
          >
            <span className="waggle-persona-placeholder-dot" />
          </div>
        ) : (
          <img
            src={persona.imagePath}
            alt={persona.alt}
            decoding="async"
            loading="lazy"
            width={256}
            height={256}
            className="waggle-persona-asset"
            onError={() => onAssetError(persona.slug)}
          />
        )}
      </div>
      <figcaption className="waggle-persona-caption">
        <strong className="waggle-persona-title">{persona.title}</strong>
        <span className="waggle-persona-role">{persona.role}</span>
      </figcaption>
    </figure>
  );

  const tileStyle = {
    '--accent': PERSONA_ACCENTS[persona.slug],
  } as CSSProperties;

  return (
    <li
      data-testid={`persona-tile-${persona.slug}`}
      data-slug={persona.slug}
      data-placeholder={hasError ? 'true' : undefined}
      className="waggle-persona-tile"
      style={tileStyle}
      onMouseEnter={handleHover}
      onFocus={handleFocus}
    >
      {isInteractive ? (
        <button
          type="button"
          className="waggle-persona-button"
          aria-label={persona.alt}
          onClick={handleClick}
          onKeyDown={handleKey}
        >
          {figure}
        </button>
      ) : (
        figure
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Inline styles (match existing apps/www convention — no Tailwind)   */
/* ------------------------------------------------------------------ */

const sectionStyle: CSSProperties = {
  background: 'var(--hive-950, #0e0c07)',
  padding: '96px 24px',
  width: '100%',
  boxSizing: 'border-box',
};

const headerStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto 48px',
  textAlign: 'center',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--honey-500, #e9a52c)',
  margin: 0,
  marginBottom: 12,
};

const headingStyle: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 'clamp(28px, 4vw, 32px)',
  fontWeight: 700,
  color: 'var(--hive-50, #f6f1e4)',
  margin: 0,
  marginBottom: 12,
};

const subtitleStyle: CSSProperties = {
  fontFamily: "var(--sans)",
  fontSize: 'clamp(16px, 2vw, 18px)',
  fontWeight: 400,
  color: 'var(--hive-300, #c8bfa9)',
  margin: 0,
};

const ctaWrapperStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '48px auto 0',
  display: 'flex',
  justifyContent: 'center',
};

/* ------------------------------------------------------------------ */
/* Scoped CSS — component-local selectors to avoid global collisions  */
/* ------------------------------------------------------------------ */

const scopedCss = `
  .waggle-persona-grid {
    list-style: none;
    padding: 0;
    margin: 0 auto;
    max-width: 1200px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  @media (max-width: 1023px) {
    .waggle-persona-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .waggle-persona-filler { display: none; }
  }
  @media (max-width: 640px) {
    .waggle-persona-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  .waggle-persona-tile {
    position: relative;
    list-style: none;
    overflow: hidden;
    background: linear-gradient(180deg, #14110b 0%, #0e0c07 100%);
    border: 1px solid #1f1a12;
    border-radius: 16px;
    padding: 20px;
    min-height: 260px;
    transition: border-color 200ms ease-out, transform 200ms ease-out,
      box-shadow 200ms ease-out;
  }
  /* Per-role accent hairline across the top edge of each tile. */
  .waggle-persona-tile::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent, #e9a52c);
    opacity: 0.5;
    transition: opacity 200ms ease-out;
  }
  .waggle-persona-tile:hover,
  .waggle-persona-tile:focus-within {
    border-color: var(--accent, #e9a52c);
    transform: translateY(-3px);
    box-shadow: 0 12px 34px -16px color-mix(in srgb, var(--accent, #e9a52c) 55%, transparent);
  }
  .waggle-persona-tile:hover::before,
  .waggle-persona-tile:focus-within::before {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .waggle-persona-tile,
    .waggle-persona-tile:hover,
    .waggle-persona-tile:focus-within {
      transition: none;
      transform: none;
    }
  }
  .waggle-persona-button {
    all: unset;
    display: block;
    width: 100%;
    cursor: pointer;
    border-radius: 12px;
  }
  .waggle-persona-button:focus-visible {
    outline: 2px solid var(--accent, #e9a52c);
    outline-offset: 2px;
  }
  .waggle-persona-figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .waggle-persona-asset-frame {
    width: 100%;
    aspect-ratio: 1 / 1;
    max-width: 256px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .waggle-persona-asset {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .waggle-persona-placeholder {
    width: 100%;
    height: 100%;
    background-image: url("${HEX_TEXTURE_PATH}");
    background-size: cover;
    background-position: center;
    background-color: #14110b;
    opacity: 0.6;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .waggle-persona-placeholder-dot {
    display: block;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #f6c45a;
    box-shadow: 0 0 24px rgba(246, 196, 90, 0.4);
  }
  .waggle-persona-caption {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .waggle-persona-title {
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 600;
    color: var(--accent, #f6c45a);
    letter-spacing: 0.01em;
  }
  .waggle-persona-role {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 400;
    color: #c8bfa9;
    line-height: 1.45;
  }
  /* Filler slots are intentional "empty comb" cells — a honey-lit hex motif,
     not dead space. Decorative only (aria-hidden on the element). */
  .waggle-persona-filler {
    position: relative;
    list-style: none;
    min-height: 260px;
    border-radius: 16px;
    border: 1px solid #241d12;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 42%, rgba(233, 165, 44, 0.12), rgba(233, 165, 44, 0) 60%),
      linear-gradient(180deg, #14110b 0%, #0e0c07 100%);
  }
  .waggle-persona-filler::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: url("${HEX_TEXTURE_PATH}");
    background-size: cover;
    background-position: center;
    opacity: 0.2;
  }
  .waggle-persona-filler::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 42px;
    height: 46px;
    transform: translate(-50%, -50%);
    background: no-repeat center / contain
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='42' height='46' viewBox='0 0 42 46' fill='none'%3E%3Cpath d='M21 2 L39 12.5 V33.5 L21 44 L3 33.5 V12.5 Z' stroke='%23e9a52c' stroke-width='1.4' stroke-linejoin='round'/%3E%3C/svg%3E");
    opacity: 0.4;
  }
`;
