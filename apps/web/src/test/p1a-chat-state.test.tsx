/**
 * P1a Stage B — chat machinery (conversion plan §3.2/§4.2/§5.2):
 *   - useChatWidgetState: the useWindowManager:316-361 relocation re-keyed to
 *     workspaceId (persona set, autonomy TTL + 10s auto-revert, P4 default
 *     inheritance) persisted under waggle-chat-state-v1.
 *   - seedChat one-shot semantics (§4.2).
 *   - chat-title composition (§3.2, getWindowTitle relocation).
 *   - The founder-ratified two-seam WorkspaceDesktopApp edit, test-pinned
 *     (§5.2): controlled activeTab/onTabChange + chat-slot render, with the
 *     uncontrolled/placeholder defaults preserved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react';
import {
  CHAT_STATE_KEY,
  composeChatTitle,
  loadChatEntries,
  rekeyLocalDefaultChatState,
  seedChat,
  takeChatSeed,
  useChatWidgetState,
  writeChatEntry,
} from '@/hooks/useChatWidgetState';

// WorkspaceDesktopApp deps (the §5.2 pin renders the real component).
const mocks = vi.hoisted(() => ({
  adapter: {
    getWorkspaceContext: vi.fn(),
    getWorkspaceState: vi.fn(),
    getWorkspaceActivity: vi.fn(),
    getTeamMembers: vi.fn(),
    getWorkspaceFiles: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/useRoomState', () => ({ useRoomState: () => ({ workspaceMap: new Map() }) }));
// WorkspaceActionsMenu (G1) reads ShellContext for patch/delete — these tests
// render the desktop bare, so stub the shell surface the menu needs.
vi.mock('@/providers/ShellContext', () => ({
  useShell: () => ({ patchWorkspace: vi.fn().mockResolvedValue(true), deleteWorkspace: vi.fn().mockResolvedValue(true) }),
}));

import WorkspaceDesktopApp from '@/components/os/apps/WorkspaceDesktopApp';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.adapter.getWorkspaceContext.mockResolvedValue({
    workspace: { name: 'Acme', status: 'active' },
  });
  // One pending task so the Tasks tab renders its list body (ws-tasks-tab)
  // rather than the no-tasks placeholder.
  mocks.adapter.getWorkspaceState.mockResolvedValue({
    pending: [{ id: 't1', content: 'Draft the launch brief' }], blocked: [], completed: [],
  });
  mocks.adapter.getWorkspaceActivity.mockResolvedValue({ events: [] });
  mocks.adapter.getTeamMembers.mockResolvedValue([]);
  mocks.adapter.getWorkspaceFiles.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useChatWidgetState (§3.2 relocation)', () => {
  it('setPersona persists under waggle-chat-state-v1 keyed by workspaceId', () => {
    const { result } = renderHook(() => useChatWidgetState('ws-1'));
    act(() => result.current.setPersona('coder'));

    expect(result.current.entry).toMatchObject({ personaId: 'coder', personaLabel: 'Coder' });
    const persisted = JSON.parse(localStorage.getItem(CHAT_STATE_KEY)!);
    expect(persisted.version).toBe(1);
    expect(persisted.chats['ws-1']).toMatchObject({ personaId: 'coder', personaLabel: 'Coder' });
  });

  it('keeps per-workspace state isolated (re-key instanceId → workspaceId)', () => {
    const a = renderHook(() => useChatWidgetState('ws-a'));
    const b = renderHook(() => useChatWidgetState('ws-b'));
    act(() => a.result.current.setPersona('writer'));

    expect(a.result.current.entry.personaId).toBe('writer');
    expect(b.result.current.entry.personaId).toBeUndefined();
  });

  it('auto-reverts an expired elevated autonomy on the 10s sweep', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChatWidgetState('ws-2'));
    act(() => result.current.setAutonomy('trusted', 1)); // 1 minute TTL
    expect(result.current.entry.autonomyLevel).toBe('trusted');
    expect(result.current.entry.autonomyExpiresAt).toBeGreaterThan(Date.now());

    act(() => { vi.advanceTimersByTime(80_000); }); // past TTL + a 10s tick
    expect(result.current.entry.autonomyLevel).toBe('normal');
    expect(result.current.entry.autonomyExpiresAt).toBeNull();
  });

  it('null TTL ("until explicitly lowered") never auto-reverts', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChatWidgetState('ws-3'));
    act(() => result.current.setAutonomy('yolo', null));

    act(() => { vi.advanceTimersByTime(600_000); });
    expect(result.current.entry.autonomyLevel).toBe('yolo');
    expect(result.current.entry.autonomyExpiresAt).toBeNull();
  });

  it('P4: a never-seen workspace inherits an elevated defaultAutonomy with null expiry', () => {
    const { result } = renderHook(() =>
      useChatWidgetState('ws-new', { defaultAutonomy: 'trusted' }));
    expect(result.current.entry).toMatchObject({ autonomyLevel: 'trusted', autonomyExpiresAt: null });
  });

  it('P4: an entry with an autonomy level is NOT overridden by defaultAutonomy (restored-window parity via the §3.3 normal marker)', () => {
    writeChatEntry('ws-old', { personaId: 'analyst', autonomyLevel: 'normal', autonomyExpiresAt: null });
    const { result } = renderHook(() =>
      useChatWidgetState('ws-old', { defaultAutonomy: 'yolo' }));
    expect(result.current.entry.autonomyLevel).toBe('normal');
    expect(result.current.entry.personaId).toBe('analyst');
  });

  it('P4: a persona-only entry (PersonaSwitcher pre-visit) does NOT block inheritance (review finding)', () => {
    // PersonaSwitcher can write {personaId} for a never-visited workspace via
    // setActiveChatPersona — that must not count as "seen" for P4.
    writeChatEntry('ws-persona-only', { personaId: 'analyst' });
    const { result } = renderHook(() =>
      useChatWidgetState('ws-persona-only', { defaultAutonomy: 'trusted' }));
    expect(result.current.entry).toMatchObject({
      personaId: 'analyst', autonomyLevel: 'trusted', autonomyExpiresAt: null,
    });
  });

  it('P4: a defaultAutonomy arriving AFTER mount (async getPermissions) still stamps the widget (review finding)', () => {
    // ShellContext fetches defaultAutonomy asynchronously; a deep-link-mounted
    // widget first renders with the 'normal' initial value. The effect must
    // re-fire when the elevated value arrives — the keep-alive instance never
    // remounts.
    const { result, rerender } = renderHook(
      ({ level }: { level: 'normal' | 'trusted' | 'yolo' }) =>
        useChatWidgetState('ws-late', { defaultAutonomy: level }),
      { initialProps: { level: 'normal' as const } },
    );
    expect(result.current.entry.autonomyLevel).toBeUndefined();

    rerender({ level: 'trusted' });
    expect(result.current.entry).toMatchObject({ autonomyLevel: 'trusted', autonomyExpiresAt: null });
  });

  it('P4: a late defaultAutonomy never overrides an autonomy level the user already set', () => {
    const { result, rerender } = renderHook(
      ({ level }: { level: 'normal' | 'trusted' | 'yolo' }) =>
        useChatWidgetState('ws-late-set', { defaultAutonomy: level }),
      { initialProps: { level: 'normal' as const } },
    );
    // User explicitly chooses 'normal' before the permissions fetch resolves.
    act(() => result.current.setAutonomy('normal'));
    rerender({ level: 'yolo' });
    expect(result.current.entry.autonomyLevel).toBe('normal');
  });

  it('rekeyLocalDefaultChatState moves the placeholder entry; an existing real entry wins', () => {
    writeChatEntry('local-default', { personaId: 'writer' });
    rekeyLocalDefaultChatState('ws-real');
    expect(loadChatEntries()['local-default']).toBeUndefined();
    expect(loadChatEntries()['ws-real']).toMatchObject({ personaId: 'writer' });

    // Placeholder vs an already-present real entry: real entry wins.
    writeChatEntry('local-default', { personaId: 'coder' });
    rekeyLocalDefaultChatState('ws-real');
    expect(loadChatEntries()['local-default']).toBeUndefined();
    expect(loadChatEntries()['ws-real']).toMatchObject({ personaId: 'writer' });
  });
});

describe('seedChat (§4.2 one-shot)', () => {
  it('takeChatSeed returns the seed exactly once', () => {
    seedChat('ws-seed', { personaId: 'writer', initialMessage: 'Hello!' });
    expect(takeChatSeed('ws-seed')).toEqual({ personaId: 'writer', initialMessage: 'Hello!' });
    expect(takeChatSeed('ws-seed')).toBeUndefined();
  });

  it('seeds are per-workspace and never persisted', () => {
    seedChat('ws-x', { initialMessage: 'draft' });
    expect(takeChatSeed('ws-y')).toBeUndefined();
    expect(localStorage.getItem(CHAT_STATE_KEY)).toBeNull();
    expect(takeChatSeed('ws-x')).toEqual({ initialMessage: 'draft' });
  });
});

describe('composeChatTitle (§3.2 getWindowTitle relocation)', () => {
  it('composes workspace · template · persona with the short labels', () => {
    expect(composeChatTitle('Acme', 'sales-pipeline', 'coder')).toBe('Acme · Sales · Coder');
    expect(composeChatTitle('Acme', 'blank', 'unknown-persona')).toBe('Acme · unknown-persona');
    expect(composeChatTitle(undefined, undefined, undefined)).toBe('Chat');
  });
});

describe('WorkspaceDesktopApp two-seam edit (§5.2, founder-ratified, test-pinned)', () => {
  it('seam (a): controlled activeTab renders that tab; clicks call onTabChange without internal flips', async () => {
    const onTabChange = vi.fn();
    render(
      <WorkspaceDesktopApp
        workspaceId="ws-1" workspaceName="Acme"
        activeTab="tasks" onTabChange={onTabChange}
      />,
    );

    expect(await screen.findByTestId('ws-tasks-tab')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ws-tab-chat'));
    expect(onTabChange).toHaveBeenCalledWith('chat');
    // Still controlled by the prop — the panel did not flip internally.
    expect(screen.getByTestId('ws-tab-tasks')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('ws-tasks-tab')).toBeInTheDocument();
  });

  it('seam (a): uncontrolled default preserves the original internal tab behavior', async () => {
    render(<WorkspaceDesktopApp workspaceId="ws-1" workspaceName="Acme" />);
    expect(await screen.findByTestId('ws-tab-bar')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ws-tab-tasks'));
    expect(screen.getByTestId('ws-tasks-tab')).toBeInTheDocument();
    expect(screen.getByTestId('ws-tab-tasks')).toHaveAttribute('aria-selected', 'true');
  });

  it('seam (b): the chat tab renders the provided chatSlot instead of the placeholder', async () => {
    render(
      <WorkspaceDesktopApp
        workspaceId="ws-1" workspaceName="Acme"
        activeTab="chat" chatSlot={<div data-testid="chat-slot-stub" />}
      />,
    );

    expect(await screen.findByTestId('chat-slot-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('ws-chat-tab-open')).not.toBeInTheDocument();
  });

  it('seam (b): without chatSlot the original deep-link placeholder is preserved', async () => {
    render(
      <WorkspaceDesktopApp workspaceId="ws-1" workspaceName="Acme" activeTab="chat" />,
    );
    expect(await screen.findByTestId('ws-chat-tab-open')).toBeInTheDocument();
  });
});
