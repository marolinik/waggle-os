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
  hasWorkingModel: false,
  cloudReady: false,
  localReady: false,
  loading: false,
  availability: 'unconfigured',
  selectedModelId: null,
  refresh: vi.fn(),
  ...over,
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
    mocks.useHasWorkingModel.mockReturnValue(state({ loading: true, availability: 'checking' }));
    const { container } = render(<NoModelBanner onSetup={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('distinguishes a saved unavailable model and offers retry plus settings', () => {
    const refresh = vi.fn();
    const onSetup = vi.fn();
    mocks.useHasWorkingModel.mockReturnValue(state({
      availability: 'unavailable',
      selectedModelId: 'openai-compatible/qwen3.8-flash-next',
      refresh,
    }));

    render(<NoModelBanner onSetup={onSetup} />);

    expect(screen.getByText(/qwen3\.8 flash next isn’t responding/i)).toBeInTheDocument();
    expect(screen.queryByText(/no model yet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    fireEvent.click(screen.getByRole('button', { name: /review model settings/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('keeps unavailable recovery visible and disables duplicate retry while checking', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({
      availability: 'unavailable',
      selectedModelId: 'openai-compatible/qwen3.8-flash-next',
      loading: true,
    }));

    render(<NoModelBanner onSetup={vi.fn()} />);

    expect(screen.getByText(/qwen3\.8 flash next isn’t responding/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();
  });

  it('reports an unknown readiness check without claiming the user has no model', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({ availability: 'unknown' }));

    render(<NoModelBanner onSetup={vi.fn()} />);

    expect(screen.getByText(/couldn’t check your model/i)).toBeInTheDocument();
    expect(screen.queryByText(/no model yet/i)).not.toBeInTheDocument();
  });

  it('keeps unknown recovery visible and prevents duplicate Retry while checking', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({
      availability: 'unknown',
      loading: true,
    }));

    render(<NoModelBanner onSetup={vi.fn()} />);

    expect(screen.getByText(/couldn’t check your model/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();
  });
});
