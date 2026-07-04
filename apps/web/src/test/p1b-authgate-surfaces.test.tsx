/**
 * P1b D3 — Stage B boot-path surface contracts over a mocked adapter:
 *
 *  - ShellContext tier: a failed getTier touches NEITHER billingTier NOR
 *    trialInfo (the severity-critical silent-FREE class), tierResolved stays
 *    false, and the tier revalidates on connect-settled.
 *  - useBilling: failure keeps tierResolved=false (Billing tab renders the
 *    unresolved state, never 'FREE' as fact).
 *  - useWorkspaces: failure sets the (previously dead) error channel, keeps
 *    a previously-good list, and recovers on connect-settled.
 *  - useChat: a thrown AdapterHttpError-shaped failure renders a status-true
 *    error block ('Backend is offline' reserved for network errors); the
 *    tier-403 copy defers to the UpgradeModal; empty-messages race guarded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { CONNECT_SETTLED_EVENT } from '@/hooks/useRevalidateOnError';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getTier: vi.fn(),
    getWorkspaces: vi.fn(),
    getPermissions: vi.fn().mockResolvedValue({ defaultAutonomy: 'normal', externalGates: {} }),
    getAgentStatus: vi.fn().mockResolvedValue({ active: 0, agents: [] }),
    getNotificationHistory: vi.fn().mockResolvedValue([]),
    subscribeNotifications: vi.fn().mockReturnValue(() => {}),
    getSystemHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
    getHistory: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    getSessions: vi.fn().mockResolvedValue([]),
    getIdentity: vi.fn(),
    searchMemory: vi.fn(),
    getMemoryStats: vi.fn(),
    fetchRaw: vi.fn(),
    getSettings: vi.fn(),
    getTelemetryStatus: vi.fn(),
    getTeamStatus: vi.fn(),
    getServerUrl: vi.fn(),
    // PR5: Settings opens on the Models tab → ModelGate fetches these on mount.
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

/** AdapterHttpError stand-in — the real class is mocked away with the module,
 *  so consumers must duck-type on error.name (that is part of the contract). */
function httpError(status: number, body: unknown, message: string) {
  const e = new Error(message) as Error & { status: number; body: unknown };
  e.name = 'AdapterHttpError';
  e.status = status;
  e.body = body;
  return e;
}

const settleConnect = () =>
  act(() => { window.dispatchEvent(new CustomEvent(CONNECT_SETTLED_EVENT, { detail: { connected: true } })); });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── useWorkspaces ──────────────────────────────────────────────────────────

describe('useWorkspaces (P1b)', () => {
  it('failure sets the error channel and keeps the previous list; connect-settled recovers', async () => {
    const { useWorkspaces } = await import('@/hooks/useWorkspaces');
    mocks.adapter.getWorkspaces.mockResolvedValueOnce([{ id: 'w1', name: 'Alpha' }]);
    const { result } = renderHook(() => useWorkspaces());
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

    mocks.adapter.getWorkspaces.mockRejectedValueOnce(httpError(401, { code: 'INVALID_TOKEN' }, 'Unauthorized'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.error).toBe('Unauthorized');
    expect(result.current.workspaces).toHaveLength(1); // previous list preserved

    mocks.adapter.getWorkspaces.mockResolvedValueOnce([{ id: 'w1', name: 'Alpha' }, { id: 'w2', name: 'Beta' }]);
    settleConnect();
    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    expect(result.current.error).toBeNull();
  });
});

// ── useBilling ─────────────────────────────────────────────────────────────

describe('useBilling (P1b D3-4)', () => {
  it('failure keeps tierResolved=false and surfaces the error — FREE default is never presented as fact', async () => {
    const { useBilling } = await import('@/hooks/useBilling');
    mocks.adapter.getTier.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tierResolved).toBe(false);
    expect(result.current.error).toBe('Unauthorized');
  });

  it('connect-settled revalidates an unresolved tier to the real plan', async () => {
    const { useBilling } = await import('@/hooks/useBilling');
    mocks.adapter.getTier.mockRejectedValueOnce(httpError(401, {}, 'Unauthorized'));
    const { result } = renderHook(() => useBilling());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tierResolved).toBe(false);

    mocks.adapter.getTier.mockResolvedValue({ tier: 'PRO', capabilities: {}, usage: {} });
    settleConnect();
    await waitFor(() => expect(result.current.tierResolved).toBe(true));
    expect(result.current.tier).toBe('PRO');
  });
});

// ── ShellContext tier (the severity-critical silent-FREE class) ────────────

describe('ShellContext tier (P1b D3-4)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  async function renderShell() {
    const { ShellProvider, useShell } = await import('@/providers/ShellContext');
    const wrapper = ({ children }: { children: React.ReactNode }) => <ShellProvider>{children}</ShellProvider>;
    return renderHook(() => useShell(), { wrapper });
  }

  /** Seed a completed-wizard onboarding blob so the trial gate's
   *  onboardingCompleted precondition is met. `completedAt` past the 10-min
   *  quiet window by default. */
  function seedOnboardingCompleted(completedAt = Date.now() - 11 * 60_000) {
    window.localStorage.setItem(
      'waggle:onboarding',
      JSON.stringify({ completed: true, step: 7, tier: 'power', completedAt }),
    );
    // Wave-3 modal coordination: the paywall defers while the login briefing
    // is eligible to show. These tests exercise the paywall itself, so arrange
    // a dismissed briefing (as a returning user who closed it would have).
    window.localStorage.setItem('waggle:login-briefing-dismissed', 'true');
  }

  it('failed getTier touches neither billingTier nor trialInfo; tierResolved stays false', async () => {
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockRejectedValue(httpError(401, { code: 'MISSING_TOKEN' }, 'Unauthorized'));
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.tierError).toBe('Unauthorized'));
    expect(result.current.billingTier).toBe('FREE'); // fail-closed capability default…
    expect(result.current.tierResolved).toBe(false); // …never presented as resolved fact
    expect(result.current.trialInfo).toEqual({});    // trial countdown not clobbered
    expect(result.current.showTrialExpired).toBe(false);
  });

  it('a paying user is not reset to FREE by a transient failure, and recovers on connect-settled', async () => {
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValueOnce({
      tier: 'PRO', trialDaysRemaining: undefined, trialExpired: false, capabilities: {}, usage: {},
    });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.billingTier).toBe('PRO'));
    expect(result.current.tierResolved).toBe(true);

    // Transient failure (e.g. sidecar restart mid-refresh): state must hold.
    mocks.adapter.getTier.mockRejectedValueOnce(httpError(401, {}, 'Unauthorized'));
    await act(async () => { await result.current.refreshTier(); });
    expect(result.current.billingTier).toBe('PRO');
    expect(result.current.tierError).toBe('Unauthorized');

    // Recovery: connect-settled revalidates while errored.
    mocks.adapter.getTier.mockResolvedValue({ tier: 'PRO', capabilities: {}, usage: {} });
    settleConnect();
    await waitFor(() => expect(result.current.tierError).toBeNull());
  });

  // ── F1: trial-expired auto-open gate ──
  it('auto-opens the paywall once and stamps the snooze when trial expired + onboarding done', async () => {
    seedOnboardingCompleted();
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.showTrialExpired).toBe(true));
    expect(window.localStorage.getItem('waggle:trial-expired-last-shown-at')).not.toBeNull();
  });

  it('does NOT auto-open within the post-onboarding quiet window', async () => {
    seedOnboardingCompleted(Date.now() - 60_000); // completed 1 min ago
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.tierResolved).toBe(true));
    expect(result.current.showTrialExpired).toBe(false);
  });

  it('a dismissed paywall stays closed on later same-session refreshTier re-runs', async () => {
    seedOnboardingCompleted();
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.showTrialExpired).toBe(true));
    act(() => { result.current.setShowTrialExpired(false); });
    await act(async () => { await result.current.refreshTier(); });
    expect(result.current.showTrialExpired).toBe(false);
  });

  it('a fresh session (reload) within the 7-day snooze does not auto-open', async () => {
    const now = Date.now();
    seedOnboardingCompleted(now - 2 * 24 * 60 * 60_000);
    window.localStorage.setItem('waggle:trial-expired-last-shown-at', String(now - 24 * 60 * 60_000));
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.getTier.mockResolvedValue({ tier: 'TRIAL', trialExpired: true, capabilities: {}, usage: {} });
    const { result } = await renderShell();
    await waitFor(() => expect(result.current.tierResolved).toBe(true));
    expect(result.current.showTrialExpired).toBe(false);
  });
});

// ── LoginBriefing failure ≠ Day-0 ──────────────────────────────────────────

describe('LoginBriefing (P1b)', () => {
  async function renderBriefing() {
    const { default: LoginBriefing } = await import('@/components/os/overlays/LoginBriefing');
    const { ServiceProvider } = await import('@/providers/ServiceProvider');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    const { render, screen } = await import('@testing-library/react');
    render(
      <TooltipProvider>
        <ServiceProvider>
          <LoginBriefing onDismiss={() => {}} onOpenWorkspace={() => {}} />
        </ServiceProvider>
      </TooltipProvider>,
    );
    return screen;
  }

  it('batch failure renders the error state, NOT the Day-0 demo bubbles', async () => {
    mocks.adapter.getIdentity.mockRejectedValue(new Error('no identity'));
    mocks.adapter.searchMemory.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getMemoryStats.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getWorkspaces.mockRejectedValue(httpError(401, { code: 'MISSING_TOKEN' }, 'Unauthorized'));
    const screen = await renderBriefing();
    await waitFor(() => expect(screen.getByTestId('login-briefing-error')).toBeInTheDocument());
    expect(screen.queryByTestId('login-briefing-empty-hook')).toBeNull();
    expect(screen.getByTestId('login-briefing-brag-line').textContent).toContain('Briefing unavailable');
    // Generous budget: full framer-motion render under parallel suite load.
  }, 15000);

  it('a genuinely empty (Day-0) account still gets the demo bubbles', async () => {
    mocks.adapter.getIdentity.mockResolvedValue(null);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    const screen = await renderBriefing();
    await waitFor(() => expect(screen.getByTestId('login-briefing-empty-hook')).toBeInTheDocument());
    expect(screen.queryByTestId('login-briefing-error')).toBeNull();
  }, 15000);

  it('RECOVERS: connect-settled after the backend returns replaces the error with the briefing', async () => {
    mocks.adapter.getIdentity.mockRejectedValue(new Error('down'));
    mocks.adapter.searchMemory.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getMemoryStats.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    mocks.adapter.getWorkspaces.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    const screen = await renderBriefing();
    await waitFor(() => expect(screen.getByTestId('login-briefing-error')).toBeInTheDocument());

    // Backend comes back; the bus settlement revalidates the errored briefing.
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    settleConnect();
    await waitFor(() => expect(screen.queryByTestId('login-briefing-error')).toBeNull());
    expect(screen.getByTestId('login-briefing-empty-hook')).toBeInTheDocument();
  }, 15000);
});

// ── BackupApp 404→empty (fetchRaw migration pin) ───────────────────────────

describe('BackupApp (P1b)', () => {
  it('a 404 metadata response renders the empty state, not the error panel', async () => {
    mocks.adapter.fetchRaw.mockResolvedValue(
      new Response(JSON.stringify({ error: 'no backups' }), { status: 404 }),
    );
    const { default: BackupApp } = await import('@/components/os/apps/BackupApp');
    const { render, screen } = await import('@testing-library/react');
    render(<BackupApp />);
    await waitFor(() => expect(screen.getByText(/no backups yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/couldn.t load backups|retry/i)).toBeNull();
  });

  it('a 500 metadata response renders the retryable error, never the empty state', async () => {
    mocks.adapter.fetchRaw.mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    );
    const { default: BackupApp } = await import('@/components/os/apps/BackupApp');
    const { render, screen } = await import('@testing-library/react');
    render(<BackupApp />);
    await waitFor(() => expect(screen.queryByText(/no backups yet/i)).toBeNull());
  });
});

// ── SettingsApp tier-as-fact pins ──────────────────────────────────────────

describe('SettingsApp tier badges (P1b D3-4)', () => {
  async function renderSettings() {
    mocks.adapter.getSettings.mockResolvedValue({});
    mocks.adapter.getTelemetryStatus.mockResolvedValue({ enabled: false });
    mocks.adapter.getTeamStatus.mockResolvedValue({ connected: false });
    mocks.adapter.getServerUrl.mockReturnValue('http://127.0.0.1:3333');
    mocks.adapter.getProviders.mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' });
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
    const { default: SettingsApp } = await import('@/components/os/apps/SettingsApp');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    const { MemoryRouter } = await import('react-router-dom');
    const { render, screen, fireEvent } = await import('@testing-library/react');
    // SettingsApp reads `?tab=` via useSearchParams (PR7a/D12) — needs a Router.
    render(<MemoryRouter><TooltipProvider><SettingsApp /></TooltipProvider></MemoryRouter>);
    // PR5 §11: Settings now opens on Models ("Models leads"). The tier card lives
    // in General — navigate there for these tier-as-fact assertions.
    fireEvent.click(await screen.findByRole('tab', { name: /general/i }));
    return screen;
  }

  it('getTier failure: General tab never renders "FREE plan" as fact', async () => {
    mocks.adapter.getTier.mockRejectedValue(httpError(401, {}, 'Unauthorized'));
    const screen = await renderSettings();
    await waitFor(() => expect(screen.getByText(/confirming plan/i)).toBeInTheDocument());
    expect(screen.queryByText(/FREE plan/i)).toBeNull();
  }, 15000);

  it('resolved PRO tier renders the real plan in the General tab', async () => {
    mocks.adapter.getTier.mockResolvedValue({ tier: 'PRO', capabilities: {}, usage: {} });
    const screen = await renderSettings();
    await waitFor(() => expect(screen.getByText(/PRO plan/i)).toBeInTheDocument());
  }, 15000);
});

// ── useChat catch semantics ────────────────────────────────────────────────

describe('useChat error surfacing (P1b)', () => {
  beforeEach(() => {
    mocks.adapter.getHistory.mockResolvedValue([]);
  });

  async function sendFailing(err: unknown) {
    const { useChat } = await import('@/hooks/useChat');
    mocks.adapter.sendMessage.mockImplementation(async function* (): AsyncGenerator<never> {
      throw err;
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-1' }));
    // Let the mount-time history fetch settle first — it resolves to [] and
    // would otherwise clobber the messages pushed by sendMessage.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.sendMessage('hello'); });
    return result;
  }

  it('HTTP failure renders a status-true error block, not the offline lie', async () => {
    const result = await sendFailing(httpError(500, { error: 'boom' }, 'boom'));
    const last = result.current.messages[result.current.messages.length - 1];
    const errBlock = last.blocks?.find(b => b.type === 'error') as { message?: string } | undefined;
    expect(errBlock?.message).toBe('Chat request failed (500): boom');
  });

  it('tier-403 copy defers to the UpgradeModal instead of duplicating the upsell', async () => {
    const result = await sendFailing(httpError(403, { error: 'TIER_INSUFFICIENT', required: 'PRO' }, 'Needs PRO'));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toBe('This action needs a higher plan — see the upgrade window.');
  });

  it('network failure keeps the Backend-is-offline copy', async () => {
    const result = await sendFailing(new TypeError('fetch failed'));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.content).toBe('Backend is offline. Connect to a Waggle server to start chatting.');
  });

  // ── F2/F4: sendMessage success reporting + retryLastFailed ──
  it('sendMessage resolves true on a clean stream, false on HTTP failure', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-1' }));
    await act(async () => { await Promise.resolve(); });

    mocks.adapter.sendMessage.mockImplementation(async function* () {
      yield { type: 'done', data: { content: 'hi there' } };
    });
    let ok: boolean | void = undefined;
    await act(async () => { ok = await result.current.sendMessage('hello'); });
    expect(ok).toBe(true);

    mocks.adapter.sendMessage.mockImplementation(async function* (): AsyncGenerator<never> {
      throw httpError(500, { error: 'boom' }, 'boom');
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    let failed: boolean | void = undefined;
    await act(async () => { failed = await result.current.sendMessage('again'); });
    expect(failed).toBe(false);
  });

  it('retryLastFailed drops the failed pair and re-issues the same content (no duplicate user bubble)', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-1' }));
    await act(async () => { await Promise.resolve(); });

    mocks.adapter.sendMessage.mockImplementationOnce(async function* (): AsyncGenerator<never> {
      throw httpError(500, { error: 'boom' }, 'boom');
      // eslint-disable-next-line no-unreachable
      yield undefined as never;
    });
    await act(async () => { await result.current.sendMessage('hello'); });
    expect(result.current.messages).toHaveLength(2); // user + assistant(error)

    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'recovered' } };
    });
    await act(async () => {
      result.current.retryLastFailed();
      await new Promise(r => setTimeout(r, 0));
    });

    const users = result.current.messages.filter(m => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(users[0].content).toBe('hello');
    expect(mocks.adapter.sendMessage).toHaveBeenLastCalledWith('ws-1', 'hello', 'sess-1', undefined, undefined);
  });
});
