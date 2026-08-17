import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactMocks = vi.hoisted(() => ({
  applyStoredThemeEarly: vi.fn(),
  createRoot: vi.fn(() => ({ render: vi.fn() })),
  flushSync: vi.fn((callback: () => void) => callback()),
}));
const bootMocks = vi.hoisted(() => ({
  armBootConnection: vi.fn(),
}));

vi.mock('./boot-connect', () => ({
  armBootConnection: bootMocks.armBootConnection,
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
    bootMocks.armBootConnection.mockReset();
    bootMocks.armBootConnection.mockResolvedValue(undefined);
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('keeps the startup surface mounted until the managed desktop service is ready', async () => {
    let releaseService!: () => void;
    const serviceReady = new Promise<void>((resolve) => { releaseService = resolve; });
    bootMocks.armBootConnection.mockReturnValue(serviceReady);

    let markAppEntryImported!: () => void;
    const appEntryImported = new Promise<void>((resolve) => { markAppEntryImported = resolve; });
    const mountApp = vi.fn();
    vi.doMock('./app-entry', () => {
      markAppEntryImported();
      return { mountApp };
    });

    await import('./main');
    const earlyImport = await Promise.race([
      appEntryImported.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
    ]);

    expect(earlyImport).toBe(false);
    expect(mountApp).not.toHaveBeenCalled();
    expect(document.querySelector('[data-waggle-startup="loading"]')).not.toBeNull();

    releaseService();
    await vi.waitFor(() => expect(mountApp).toHaveBeenCalledOnce());
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

  it('keeps the app graph unloaded and shows a visible alert when service startup fails', async () => {
    const mountApp = vi.fn();
    bootMocks.armBootConnection.mockRejectedValue(new Error('managed service failed'));
    vi.doMock('./app-entry', () => ({ mountApp }));

    await import('./main');

    await vi.waitFor(() => {
      const alert = document.querySelector<HTMLElement>('[data-waggle-startup="failed"]');
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain('Waggle could not start');
    });
    expect(mountApp).not.toHaveBeenCalled();
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
