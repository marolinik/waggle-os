/**
 * PR5 Phase C / D2 — the Home safety-net banner. Visible only when no working
 * model exists; never flashes while readiness is loading.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ useHasWorkingModel: vi.fn() }));
vi.mock('@/hooks/useHasWorkingModel', () => ({ useHasWorkingModel: mocks.useHasWorkingModel }));

import { NoModelBanner } from './NoModelBanner';

const state = (over: Record<string, unknown> = {}) => ({
  hasWorkingModel: false, cloudReady: false, localReady: false, loading: false, refresh: vi.fn(), ...over,
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('NoModelBanner (PR5 D2)', () => {
  it('shows when there is no working model and fires onSetup', () => {
    mocks.useHasWorkingModel.mockReturnValue(state());
    const onSetup = vi.fn();
    render(<NoModelBanner onSetup={onSetup} />);
    expect(screen.getByText(/no model yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /set up a model/i }));
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('renders nothing once a model is working', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({ hasWorkingModel: true }));
    const { container } = render(<NoModelBanner onSetup={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while readiness is loading (no flash)', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({ loading: true }));
    const { container } = render(<NoModelBanner onSetup={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
