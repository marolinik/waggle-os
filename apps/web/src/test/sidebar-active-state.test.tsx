/**
 * F8 — Sidebar active-state predicate.
 *
 * The Chat spine item resolves active via `activeWhen` (only /workspaces/:id/chat),
 * NOT a static '/workspaces' prefix that wrongly lit Chat on Overview and every
 * other workspace tab. Home stays prefix-matched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home, MessageSquare, Brain } from 'lucide-react';
import Sidebar, { type SidebarNavItem } from '@/components/os/Sidebar';

afterEach(cleanup);

const spine: SidebarNavItem[] = [
  { key: 'home', label: 'Home', icon: Home, to: '/home', match: ['/home'] },
  {
    key: 'chat', label: 'Chat', icon: MessageSquare, to: '/workspaces/ws-1/chat',
    match: [], activeWhen: (p: string) => /^\/workspaces\/[^/]+\/chat(\/|$)/.test(p),
  },
  { key: 'memory', label: 'Memory', icon: Brain, to: '/memory', match: ['/memory'] },
];

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Sidebar
        workspaceName="Acme"
        spine={spine}
        onOpenWorkspaceSwitcher={() => {}}
        onOpenCommand={() => {}}
        onSpawnAgent={() => {}}
        userName="Marko"
        tierLabel="Pro"
      />
    </MemoryRouter>,
  );
}

const isActive = (testId: string) =>
  screen.getByTestId(testId).getAttribute('aria-current') === 'page';

describe('Sidebar active state (F8)', () => {
  it('Chat is active on the chat tab', () => {
    renderAt('/workspaces/ws-1/chat');
    expect(isActive('nav-chat')).toBe(true);
    expect(isActive('nav-memory')).toBe(false);
  });

  it('Chat is NOT active on the workspace Overview (bare /workspaces/:id)', () => {
    renderAt('/workspaces/ws-1');
    expect(isActive('nav-chat')).toBe(false);
  });

  it('Chat is NOT active on another workspace tab (memory)', () => {
    renderAt('/workspaces/ws-1/memory');
    expect(isActive('nav-chat')).toBe(false);
  });

  it('Home is active on /home via prefix match', () => {
    renderAt('/home');
    expect(isActive('nav-home')).toBe(true);
    expect(isActive('nav-chat')).toBe(false);
  });
});
