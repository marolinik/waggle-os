import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach } from 'vitest';
import BrandPersonasCard from '../src/components/BrandPersonasCard';
import { personas, type PersonaSlug } from '../src/data/personas';

afterEach(() => {
  cleanup();
});

describe('BrandPersonasCard — landing variant', () => {
  it('renders 13 persona tiles + 3 filler tiles by default', () => {
    render(<BrandPersonasCard />);

    const tiles = screen.getAllByTestId(/^persona-tile-/);
    expect(tiles).toHaveLength(13);

    const fillers = screen.getAllByTestId('brand-personas-filler');
    expect(fillers).toHaveLength(3);

    // Fillers must be marked aria-hidden to stay out of AT navigation.
    for (const filler of fillers) {
      expect(filler).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('renders correct title + role copy for all 13 personas (verbatim from locked decision)', () => {
    render(<BrandPersonasCard />);

    for (const persona of personas) {
      const tile = screen.getByTestId(`persona-tile-${persona.slug}`);
      const scope = within(tile);
      expect(scope.getByText(persona.title)).toBeInTheDocument();
      expect(scope.getByText(persona.role)).toBeInTheDocument();
    }
  });

  it('fires onPersonaClick with the correct slug when a tile is clicked', () => {
    const handler = vi.fn<(slug: PersonaSlug) => void>();
    render(<BrandPersonasCard onPersonaClick={handler} />);

    const hunterTile = screen.getByTestId('persona-tile-hunter');
    const button = within(hunterTile).getByRole('button', {
      name: /Waggle The Hunter bee mascot/i,
    });
    fireEvent.click(button);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('hunter');
  });

  it('fires onTileHover with the correct slug on mouseenter', () => {
    const handler = vi.fn<(slug: PersonaSlug) => void>();
    render(<BrandPersonasCard onTileHover={handler} />);

    const connectorTile = screen.getByTestId('persona-tile-connector');
    fireEvent.mouseEnter(connectorTile);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('connector');
  });

  it('renders the cta slot below the grid', () => {
    render(
      <BrandPersonasCard
        cta={<a href="https://example.test/cta">Meet the hive</a>}
      />,
    );

    const ctaSlot = screen.getByTestId('brand-personas-cta');
    expect(ctaSlot).toBeInTheDocument();
    expect(
      within(ctaSlot).getByRole('link', { name: /Meet the hive/i }),
    ).toHaveAttribute('href', 'https://example.test/cta');
  });

  it('hides filler tiles when showFillerTiles={false}', () => {
    render(<BrandPersonasCard showFillerTiles={false} />);

    expect(screen.queryAllByTestId('brand-personas-filler')).toHaveLength(0);
    // Persona tiles remain intact — feature is filler-scoped.
    expect(screen.getAllByTestId(/^persona-tile-/)).toHaveLength(13);
  });

  it('flips to a placeholder when a persona asset fails to load', () => {
    render(<BrandPersonasCard />);

    const writerTile = screen.getByTestId('persona-tile-writer');
    const img = within(writerTile).getByRole('img', {
      name: /Waggle The Writer bee mascot/i,
    });

    // Simulate the 404/onerror path that fires when an asset is missing
    // (e.g., mid-regen Task #24 state before the new PNG lands).
    fireEvent.error(img);

    expect(writerTile).toHaveAttribute('data-placeholder', 'true');
    expect(
      screen.getByTestId('persona-placeholder-writer'),
    ).toBeInTheDocument();
    // Role copy must stay readable even while the image degrades.
    expect(
      within(writerTile).getByText(
        'Shapes the story the memory wants to tell.',
      ),
    ).toBeInTheDocument();
  });

  it('supports keyboard activation (Enter + Space) when onPersonaClick is provided', () => {
    const handler = vi.fn<(slug: PersonaSlug) => void>();
    render(<BrandPersonasCard onPersonaClick={handler} />);

    const teamTile = screen.getByTestId('persona-tile-team');
    const button = within(teamTile).getByRole('button');

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    // A non-activation key must not fire the handler.
    fireEvent.keyDown(button, { key: 'Tab' });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, 'team');
    expect(handler).toHaveBeenNthCalledWith(2, 'team');
  });

  it('honours custom heading + subtitle overrides', () => {
    render(
      <BrandPersonasCard
        heading="Internal reference"
        subtitle="Brand canon for the team."
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Internal reference' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Brand canon for the team.')).toBeInTheDocument();
  });
});

describe('BrandPersonasCard — compact variant', () => {
  it('renders the compact stub without errors and exposes the data-variant hook', () => {
    render(<BrandPersonasCard variant="compact" />);

    const stub = screen.getByTestId('brand-personas-card-compact');
    expect(stub).toBeInTheDocument();
    expect(stub).toHaveAttribute('data-variant', 'compact');
    // Landing DOM must not leak into compact path.
    expect(
      screen.queryByTestId('brand-personas-card'),
    ).not.toBeInTheDocument();
  });
});
