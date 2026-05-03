'use client';

import {
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  HEX_TEXTURE_PATH,
  personas,
  type Persona,
  type PersonaSlug,
} from '../_data/personas';

const DEFAULT_HEADING = 'The Waggle Hive';
const DEFAULT_SUBTITLE =
  'Thirteen personas for the work your AI does while you sleep.';

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

export interface BrandPersonasCardProps {
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
  heading = DEFAULT_HEADING,
  subtitle = DEFAULT_SUBTITLE,
  showFillerTiles = true,
  variant = 'landing',
  onTileHover,
  onPersonaClick,
  cta,
}: BrandPersonasCardProps) {
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
        aria-label="Waggle persona grid (compact variant)"
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
        <h2 id="waggle-hive-heading" style={headingStyle}>
          {heading}
        </h2>
        <p style={subtitleStyle}>{subtitle}</p>
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

  return (
    <li
      data-testid={`persona-tile-${persona.slug}`}
      data-slug={persona.slug}
      data-placeholder={hasError ? 'true' : undefined}
      className="waggle-persona-tile"
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
  background: 'var(--hive-950, #08090c)',
  padding: '96px 24px',
  width: '100%',
  boxSizing: 'border-box',
};

const headerStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto 48px',
  textAlign: 'center',
};

const headingStyle: CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 'clamp(28px, 4vw, 32px)',
  fontWeight: 700,
  color: 'var(--hive-50, #f0f2f7)',
  margin: 0,
  marginBottom: 12,
};

const subtitleStyle: CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 'clamp(16px, 2vw, 18px)',
  fontWeight: 400,
  color: 'var(--hive-300, #a0a3ad)',
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
    background: linear-gradient(180deg, #0f1218 0%, #080a0f 100%);
    border: 1px solid #1a1e27;
    border-radius: 16px;
    padding: 20px;
    min-height: 260px;
    transition: border-color 200ms ease-out, transform 200ms ease-out;
  }
  .waggle-persona-tile:hover,
  .waggle-persona-tile:focus-within {
    border-color: #e5a000;
    transform: scale(1.02);
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
    outline: 2px solid #e5a000;
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
    background-color: #0f1218;
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
    background: #f5b731;
    box-shadow: 0 0 24px rgba(245, 183, 49, 0.4);
  }
  .waggle-persona-caption {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .waggle-persona-title {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: #f5b731;
    letter-spacing: 0.01em;
  }
  .waggle-persona-role {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: #a0a3ad;
    line-height: 1.45;
  }
  .waggle-persona-filler {
    list-style: none;
    min-height: 260px;
    border-radius: 16px;
    background-image: url("${HEX_TEXTURE_PATH}");
    background-size: cover;
    background-position: center;
    opacity: 0.4;
    border: 1px solid #1a1e27;
  }
`;
