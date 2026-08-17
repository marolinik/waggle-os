import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({
  applyStoredThemeEarly: vi.fn(),
  createRoot: vi.fn(() => ({ render: vi.fn() })),
  flushSync: vi.fn((callback: () => void) => callback()),
}));

vi.mock('./boot-connect', () => ({
  armBootConnection: vi.fn(),
}));

vi.mock('react-dom/client', () => ({
  createRoot: reactMocks.createRoot,
}));

vi.mock('react-dom', () => ({
  flushSync: reactMocks.flushSync,
}));

vi.mock('./App.tsx', () => ({
  default: () => null,
}));

vi.mock('@/providers/ThemeProvider', () => ({
  applyStoredThemeEarly: reactMocks.applyStoredThemeEarly,
}));

vi.mock('@/lib/posthog', () => ({
  initPostHog: vi.fn(),
}));

describe('desktop startup surface', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows a visible alert when the application bundle cannot mount', async () => {
    vi.doMock('./app-entry', () => ({
      mountApp: vi.fn(() => {
        throw new Error('simulated app bundle failure');
      }),
    }));
    await import('./main');

    await vi.waitFor(() => {
      const alert = document.querySelector<HTMLElement>('[data-waggle-startup="failed"]');
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain('Waggle could not start');
    });
  });

  it('marks the desktop shell ready only after the synchronous app mount', async () => {
    vi.doUnmock('./app-entry');
    await import('./main');

    await vi.waitFor(() => {
      const root = document.getElementById('root');
      expect(reactMocks.applyStoredThemeEarly).toHaveBeenCalledOnce();
      expect(reactMocks.createRoot).toHaveBeenCalledWith(root);
      expect(root?.dataset.waggleUiReady).toBe('ready');
    });
  });
});
