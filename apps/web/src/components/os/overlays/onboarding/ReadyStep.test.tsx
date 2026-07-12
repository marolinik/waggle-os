import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ReadyStep from './ReadyStep';

describe('ReadyStep', () => {
  it('renders the Waggle logo with stable intrinsic dimensions', () => {
    render(<ReadyStep createError={null} onLetsGo={vi.fn()} />);

    const logo = screen.getByAltText('Waggle');
    expect(logo).toHaveAttribute('width', '80');
    expect(logo).toHaveAttribute('height', '80');
  });
});
