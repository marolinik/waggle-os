/**
 * PR7a — Billing (screen 14) themed over the REAL useBilling→Stripe flow.
 * Pins the load-bearing behaviors + the no-fabrication gates:
 *  - PlanCards: 3-card grid, annual toggle swaps the displayed price AND threads
 *    the real `billingPeriod` to checkout (D8/F9), current tier marked "Your plan".
 *  - useBilling.startCheckout passes billingPeriod to the adapter (D8).
 *  - SettingsApp `?tab=billing` deep-link snaps to the Plan tab (D12).
 *  - PaymentSuccessApp confirms off the SYNCED tier and renders NO fabricated
 *    receipt rows (F5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  adapter: {
    getSettings: vi.fn().mockResolvedValue({}),
    getPermissions: vi.fn().mockResolvedValue({ defaultAutonomy: 'normal', externalGates: [] }),
    getTeamStatus: vi.fn().mockResolvedValue({ connected: false }),
    getTelemetryStatus: vi.fn().mockResolvedValue({ enabled: false, totalEvents: 0 }),
    getTier: vi.fn().mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} }),
    getServerUrl: vi.fn().mockReturnValue('http://127.0.0.1:3333'),
    getProviders: vi.fn().mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' }),
    getLocalInferenceStatus: vi.fn().mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 }),
    createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/abc' }),
    createPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal.stripe.test/abc' }),
    syncStripeCheckout: vi.fn().mockResolvedValue({ tier: 'PRO', customerId: 'cus_1' }),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState({}, '', '/'); });

describe('PR7a · PlanCards', () => {
  it('renders the 3-card grid (Solo / Pro · most-popular / Teams)', async () => {
    const { default: PlanCards } = await import('@/components/os/billing/PlanCards');
    render(<PlanCards currentTier="FREE" onChoose={vi.fn()} />);
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByText('Most popular')).toBeInTheDocument();
    // FREE user → Solo is the current plan
    expect(screen.getByText('Your plan')).toBeInTheDocument();
  });

  it('annual toggle swaps the displayed price AND threads billingPeriod to onChoose (D8/F9)', async () => {
    const { default: PlanCards } = await import('@/components/os/billing/PlanCards');
    const onChoose = vi.fn();
    render(<PlanCards currentTier="FREE" onChoose={onChoose} />);

    // Monthly default → Pro shows $19
    expect(screen.getByText('$19')).toBeInTheDocument();
    // Switch to annual → Pro shows $15 (the real annual price label, not a client × 0.8)
    fireEvent.click(screen.getByRole('radio', { name: /Annual/i }));
    expect(screen.getByText('$15')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Choose Pro/i }));
    expect(onChoose).toHaveBeenCalledWith('PRO', 'annual');
  });

  it('does not offer an in-app downgrade — lower tiers show "Included", not a CTA (D6)', async () => {
    const { default: PlanCards } = await import('@/components/os/billing/PlanCards');
    const onChoose = vi.fn();
    render(<PlanCards currentTier="PRO" onChoose={onChoose} />);
    // PRO user: Pro = "Your plan", Solo = "Included", Teams = "Choose Teams"
    expect(screen.getByText('Your plan')).toBeInTheDocument();
    expect(screen.getByText('Included')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose Teams/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose Solo/i })).not.toBeInTheDocument();
  });
});

describe('PR7a · useBilling.startCheckout', () => {
  it('threads billingPeriod to adapter.createCheckoutSession (D8)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { useBilling } = await import('@/hooks/useBilling');
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(mocks.adapter.getTier).toHaveBeenCalled());

    await act(async () => { await result.current.startCheckout('PRO', 'annual'); });
    expect(mocks.adapter.createCheckoutSession).toHaveBeenCalledWith('PRO', 'annual');
    expect(openSpy).toHaveBeenCalledWith('https://checkout.stripe.test/abc', '_blank');
    openSpy.mockRestore();
  });
});

describe('PR7a · SettingsApp ?tab= deep-link (D12)', () => {
  it('?tab=billing snaps Settings to the Plan tab', async () => {
    mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
    const { default: SettingsApp } = await import('@/components/os/apps/SettingsApp');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    render(
      <MemoryRouter initialEntries={['/settings?tab=billing']}>
        <TooltipProvider><SettingsApp /></TooltipProvider>
      </MemoryRouter>,
    );
    // The Plan tab is selected (the rail tab labelled "Plan")
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /plan/i })).toHaveAttribute('aria-selected', 'true');
    });
    expect(await screen.findByText('Plan & Subscription')).toBeInTheDocument();
  });
});

describe('PR7a · PaymentSuccessApp', () => {
  it('confirms off the synced tier with NO fabricated receipt (F5)', async () => {
    mocks.adapter.getTier.mockResolvedValue({ tier: 'PRO', capabilities: {}, usage: {} });
    const { default: PaymentSuccessApp } = await import('@/components/os/apps/PaymentSuccessApp');
    render(
      <MemoryRouter initialEntries={['/payment-success']}>
        <PaymentSuccessApp />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/You’re/i)).toBeInTheDocument();
    expect(screen.getByText('Pro.')).toBeInTheDocument();
    // No-fabrication: the mock's receipt rows must NOT appear
    expect(screen.queryByText(/Trial ends/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Emailed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Receipt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$19\.00/)).not.toBeInTheDocument();
  });
});
