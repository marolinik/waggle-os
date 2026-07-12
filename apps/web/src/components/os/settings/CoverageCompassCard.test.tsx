import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CoverageCompassCard from './CoverageCompassCard';

describe('CoverageCompassCard', () => {
  it('does not claim Browser Companion coverage before native entry points are proven', () => {
    render(<CoverageCompassCard />);

    const partialRows = screen.getAllByTestId('coverage-compass-row-partial');
    const browserRow = partialRows.find((row) => row.textContent?.includes('Browser AI extensions'));

    expect(browserRow).toBeDefined();
    expect(browserRow).toHaveTextContent(/native toolbar\/context menu pending/i);
  });
});
