import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EraseDataDialog from './EraseDataDialog';

const mocks = vi.hoisted(() => ({
  adapter: {
    eraseData: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EraseDataDialog', () => {
  it('a11y: destructive confirmation field exposes stable metadata and focus treatment', () => {
    render(<EraseDataDialog open onClose={vi.fn()} />);

    const phrase = screen.getByLabelText(/to confirm, type exactly/i);
    expect(phrase).toHaveAttribute('id', 'erase-data-confirmation-phrase');
    expect(phrase).toHaveAttribute('name', 'eraseDataConfirmationPhrase');
    expect(phrase).toHaveAttribute('autocomplete', 'off');
    expect(phrase.className).toContain('focus-visible:ring-2');
    expect(phrase.className).toContain('focus-visible:ring-destructive');
  });
});
