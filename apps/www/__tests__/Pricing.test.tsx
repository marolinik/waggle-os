import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Pricing from '../app/_components/Pricing';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('Pricing', () => {
  it('uses the canonical GET checkout URL for Team checkout', () => {
    render(<Pricing />);

    const monthlyCta = screen.getByRole('link', {
      name: 'landing.pricing.tiers.teams.cta',
    });
    expect(monthlyCta).toHaveAttribute(
      'href',
      '/api/stripe/checkout?tier=teams&billing=monthly',
    );

    fireEvent.click(
      screen.getByRole('button', { name: /landing\.pricing\.toggle\.annual/ }),
    );

    const annualCta = screen.getByRole('link', {
      name: 'landing.pricing.tiers.teams.cta',
    });
    expect(annualCta).toHaveAttribute(
      'href',
      '/api/stripe/checkout?tier=teams&billing=annual',
    );
  });

  it('shows a retry path after a cancelled checkout', async () => {
    window.history.pushState({}, '', '/?checkout=cancelled#pricing');

    render(<Pricing />);

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('landing.pricing.notices.cancelled');
    expect(
      screen.getByRole('link', {
        name: 'landing.pricing.notices.retry',
      }),
    ).toHaveAttribute(
      'href',
      '/api/stripe/checkout?tier=teams&billing=monthly',
    );
  });
});
