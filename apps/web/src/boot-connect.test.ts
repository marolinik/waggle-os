import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  armDesktopServiceGate: vi.fn(),
  connect: vi.fn(),
  connectDesktopService: vi.fn(),
  failDesktopServiceGate: vi.fn(),
}));
const tauriMocks = vi.hoisted(() => ({
  ensureDesktopService: vi.fn(),
  isTauri: vi.fn(),
  listenDesktopServiceLifecycle: vi.fn(),
}));

vi.mock('./lib/adapter', () => ({ adapter: adapterMocks }));
vi.mock('./lib/tauri-bindings', () => tauriMocks);

type DesktopEndpoint = { port: number; instanceId: string };
type LifecycleEvent =
  | { status: 'restarting' }
  | { status: 'ready'; endpoint: DesktopEndpoint }
  | { status: 'failed'; error?: string };

describe('boot connection', () => {
  let emitLifecycle!: (event: LifecycleEvent) => void;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    adapterMocks.armDesktopServiceGate.mockReturnValue(7);
    adapterMocks.connect.mockResolvedValue({ status: 'ok' });
    adapterMocks.connectDesktopService.mockResolvedValue({ status: 'ok' });
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.listenDesktopServiceLifecycle.mockImplementation(async (listener) => {
      emitLifecycle = listener as (event: LifecycleEvent) => void;
      return () => {};
    });
  });

  it('does not release Tauri startup until the owned endpoint is connected', async () => {
    const endpoint = { port: 49151, instanceId: 'desktop-instance-a' };
    let publishEndpoint!: (value: typeof endpoint) => void;
    tauriMocks.ensureDesktopService.mockReturnValue(
      new Promise<typeof endpoint>((resolve) => { publishEndpoint = resolve; }),
    );

    const { armBootConnection } = await import('./boot-connect');
    const startup = armBootConnection();

    expect(armBootConnection()).toBe(startup);
    await Promise.resolve();
    expect(adapterMocks.connectDesktopService).not.toHaveBeenCalled();

    publishEndpoint(endpoint);
    await expect(startup).resolves.toBeUndefined();
    expect(adapterMocks.connectDesktopService).toHaveBeenCalledWith(endpoint, 7);
    expect(adapterMocks.failDesktopServiceGate).not.toHaveBeenCalled();
  });

  it('survives a stale initial launch and resolves from the replacement generation', async () => {
    const replacement = { port: 49152, instanceId: 'desktop-instance-b' };
    let rejectInitial!: (error: Error) => void;
    tauriMocks.ensureDesktopService.mockReturnValue(
      new Promise<DesktopEndpoint>((_resolve, reject) => { rejectInitial = reject; }),
    );
    adapterMocks.armDesktopServiceGate.mockReturnValueOnce(7).mockReturnValueOnce(8);

    const { armBootConnection } = await import('./boot-connect');
    const startup = armBootConnection();
    await Promise.resolve();

    emitLifecycle({ status: 'restarting' });
    emitLifecycle({ status: 'ready', endpoint: replacement });
    await expect(startup).resolves.toBeUndefined();
    rejectInitial(new Error('stale managed launch changed'));
    await Promise.resolve();

    expect(adapterMocks.connectDesktopService).toHaveBeenCalledWith(replacement, 8);
    expect(adapterMocks.failDesktopServiceGate).not.toHaveBeenCalled();
  });

  it('recovers when the stale launch rejects before its replacement event arrives', async () => {
    const replacement = { port: 49152, instanceId: 'desktop-instance-b' };
    let rejectInitial!: (error: Error) => void;
    tauriMocks.ensureDesktopService.mockReturnValue(
      new Promise<DesktopEndpoint>((_resolve, reject) => { rejectInitial = reject; }),
    );
    adapterMocks.armDesktopServiceGate.mockReturnValueOnce(7).mockReturnValueOnce(8);

    const { armBootConnection } = await import('./boot-connect');
    const startup = armBootConnection();
    const outcome = startup.then(() => 'ready', () => 'failed');
    await Promise.resolve();

    rejectInitial(new Error('stale managed launch changed'));
    await Promise.resolve();
    emitLifecycle({ status: 'restarting' });
    emitLifecycle({ status: 'ready', endpoint: replacement });

    await expect(outcome).resolves.toBe('ready');
    expect(adapterMocks.connectDesktopService).toHaveBeenCalledWith(replacement, 8);
    expect(adapterMocks.failDesktopServiceGate).not.toHaveBeenCalled();
  });

  it('actively relaunches when an early child exit produces no lifecycle event', async () => {
    vi.useFakeTimers();
    try {
      const replacement = { port: 49152, instanceId: 'desktop-instance-b' };
      tauriMocks.ensureDesktopService
        .mockRejectedValueOnce(new Error('managed child exited before ready'))
        .mockResolvedValueOnce(replacement);
      adapterMocks.armDesktopServiceGate.mockReturnValueOnce(7).mockReturnValueOnce(8);

      const { armBootConnection } = await import('./boot-connect');
      const startup = armBootConnection();
      const outcome = startup.then(() => 'ready', () => 'failed');

      await vi.advanceTimersByTimeAsync(15_000);

      await expect(outcome).resolves.toBe('ready');
      expect(tauriMocks.ensureDesktopService).toHaveBeenCalledTimes(2);
      expect(adapterMocks.connectDesktopService).toHaveBeenCalledWith(replacement, 8);
      expect(adapterMocks.failDesktopServiceGate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('deduplicates lifecycle-ready and ensure results for the same endpoint', async () => {
    const endpoint = { port: 49151, instanceId: 'desktop-instance-a' };
    let publishEndpoint!: (value: DesktopEndpoint) => void;
    let finishConnection!: (value: { status: string }) => void;
    tauriMocks.ensureDesktopService.mockReturnValue(
      new Promise<DesktopEndpoint>((resolve) => { publishEndpoint = resolve; }),
    );
    adapterMocks.connectDesktopService.mockReturnValue(
      new Promise<{ status: string }>((resolve) => { finishConnection = resolve; }),
    );

    const { armBootConnection } = await import('./boot-connect');
    const startup = armBootConnection();
    await Promise.resolve();

    emitLifecycle({ status: 'ready', endpoint });
    publishEndpoint(endpoint);
    await Promise.resolve();
    expect(adapterMocks.connectDesktopService).toHaveBeenCalledOnce();

    finishConnection({ status: 'ok' });
    await expect(startup).resolves.toBeUndefined();
  });

  it('cancels a concurrent ensure failure when the current endpoint binds successfully', async () => {
    vi.useFakeTimers();
    try {
      const endpoint = { port: 49151, instanceId: 'desktop-instance-a' };
      let rejectEnsure!: (error: Error) => void;
      let finishConnection!: (value: { status: string }) => void;
      tauriMocks.ensureDesktopService.mockReturnValue(
        new Promise<DesktopEndpoint>((_resolve, reject) => { rejectEnsure = reject; }),
      );
      adapterMocks.connectDesktopService.mockReturnValue(
        new Promise<{ status: string }>((resolve) => { finishConnection = resolve; }),
      );

      const { armBootConnection } = await import('./boot-connect');
      const startup = armBootConnection();
      await Promise.resolve();

      emitLifecycle({ status: 'ready', endpoint });
      rejectEnsure(new Error('stale ensure failed'));
      await Promise.resolve();
      finishConnection({ status: 'ok' });

      await expect(startup).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(adapterMocks.failDesktopServiceGate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects startup and fails the current gate on a terminal ensure error', async () => {
    vi.useFakeTimers();
    const failure = new Error('managed service failed');
    tauriMocks.ensureDesktopService.mockRejectedValue(failure);

    const { armBootConnection } = await import('./boot-connect');
    const startup = armBootConnection();
    const rejection = expect(startup).rejects.toThrow('managed service failed');

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(tauriMocks.ensureDesktopService).toHaveBeenCalledTimes(2);
    expect(adapterMocks.failDesktopServiceGate).toHaveBeenCalledWith(failure, 7);
    vi.useRealTimers();
  });

  it('keeps browser startup non-blocking while its health connection runs', async () => {
    tauriMocks.isTauri.mockReturnValue(false);
    adapterMocks.connect.mockReturnValue(new Promise(() => {}));

    const { armBootConnection } = await import('./boot-connect');

    await expect(armBootConnection()).resolves.toBeUndefined();
    expect(adapterMocks.connect).toHaveBeenCalledOnce();
    expect(adapterMocks.armDesktopServiceGate).not.toHaveBeenCalled();
  });
});
