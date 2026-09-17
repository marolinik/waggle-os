/**
 * PR5 Phase C — the onboarding hard model gate. Continue is disabled until a
 * working model exists; "I'll do this later" is the single soft escape (→ Home).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ useHasWorkingModel: vi.fn() }));
vi.mock('@/hooks/useHasWorkingModel', () => ({ useHasWorkingModel: mocks.useHasWorkingModel }));
vi.mock('@/components/os/model-gate/ModelGate', () => ({ ModelGate: () => <div data-testid="model-gate" /> }));

import ModelGateStep from './ModelGateStep';

const state = (over: Record<string, unknown> = {}) => ({
  hasWorkingModel: false, cloudReady: false, localReady: false, loading: false, refresh: vi.fn(), ...over,
});
const props = () => ({ onContinue: vi.fn(), onLater: vi.fn() });

beforeEach(() => mocks.useHasWorkingModel.mockReturnValue(state()));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ModelGateStep — the hard model gate', () => {
  it('embeds the shared ModelGate', () => {
    render(<ModelGateStep {...props()} />);
    expect(screen.getByTestId('model-gate')).toBeInTheDocument();
    expect(screen.getByText(/use an on-device model, a lan gateway/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing leaves your machine without your key/i)).not.toBeInTheDocument();
  });

  it('disables Continue until a working model exists', () => {
    const p = props();
    render(<ModelGateStep {...p} />);
    const cont = screen.getByRole('button', { name: /continue/i });
    expect(cont).toBeDisabled();
    fireEvent.click(cont);
    expect(p.onContinue).not.toHaveBeenCalled();
  });

  it('enables Continue and advances once a model is working', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({ hasWorkingModel: true }));
    const p = props();
    render(<ModelGateStep {...p} />);
    const cont = screen.getByRole('button', { name: /continue/i });
    expect(cont).toBeEnabled();
    fireEvent.click(cont);
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('shows a local-ready state while keeping the setup gate available for another provider', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({ hasWorkingModel: true, localReady: true, loading: true }));
    render(<ModelGateStep {...props()} />);

    expect(screen.getByTestId('model-gate')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/model ready/i);
  });

  it('keeps cloud readiness owned by the shared gate so rejected keys remain visible', () => {
    mocks.useHasWorkingModel.mockReturnValue(state({ hasWorkingModel: true, cloudReady: true, loading: true }));
    render(<ModelGateStep {...props()} />);

    expect(screen.getByTestId('model-gate')).toBeInTheDocument();
    expect(screen.queryByText(/model ready/i)).not.toBeInTheDocument();
  });

  it('"I\'ll do this later" escapes even with no model (dismiss to Home)', () => {
    const p = props();
    render(<ModelGateStep {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /do this later/i }));
    expect(p.onLater).toHaveBeenCalledTimes(1);
  });
});
