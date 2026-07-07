/**
 * Wave T Lane F item 3 — BeeLoader (the signature waggle-dance loader).
 * Locks the accessible contract (status role + screen-reader label), the
 * honey figure-eight trail, and the animated bee (SMIL animateMotion present
 * when motion is allowed — the test env's matchMedia reports no reduced-motion).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BeeLoader } from './BeeLoader';

afterEach(cleanup);

describe('BeeLoader', () => {
  it('exposes a polite status region with a default label', () => {
    render(<BeeLoader />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-testid', 'bee-loader');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('honours a custom label', () => {
    render(<BeeLoader label="Loading agents…" />);
    expect(screen.getByText('Loading agents…')).toBeInTheDocument();
  });

  it('renders the honey figure-eight trail and the traveling bee (motion allowed)', () => {
    const { container } = render(<BeeLoader />);
    // The decorative SVG is aria-hidden; query the DOM directly.
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('stroke')).toBe('var(--honey)');
    // matchMedia in the test env reports matches:false → motion is allowed.
    expect(container.querySelector('animateMotion')).not.toBeNull();
  });

  it('keeps the requested width and 44:28 aspect ratio', () => {
    const { container } = render(<BeeLoader size={88} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('88');
    expect(svg?.getAttribute('height')).toBe('56');
  });
});
