/**
 * Arms backend connectivity before the React application graph is imported.
 * Browser development keeps the existing fixed-URL behavior. Tauri builds
 * accept only the endpoint that the Rust shell has verified belongs to its
 * current managed sidecar generation.
 */
import { adapter } from './lib/adapter';
import {
  ensureDesktopService,
  isTauri,
  listenDesktopServiceLifecycle,
  type DesktopServiceEndpoint,
} from './lib/tauri-bindings';

let bootPromise: Promise<void> | null = null;
const RECOVERY_RETRY_DELAY_MS = 15_000;
const MAX_ACTIVE_RECOVERY_ATTEMPTS = 1;

export function armBootConnection(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = startBootConnection();
  return bootPromise;
}

function startBootConnection(): Promise<void> {
  if (!isTauri()) {
    void adapter.connect().catch(() => {
      /* ServiceProvider surfaces browser connection state. */
    });
    return Promise.resolve();
  }

  return new Promise<void>((resolveBoot, rejectBoot) => {
    let bootSettled = false;
    let activeGateId = adapter.armDesktopServiceGate();
    let bindingKey: string | null = null;
    let bindingPromise: Promise<void> | null = null;
    let pendingFailure: { gateId: number; timer: ReturnType<typeof setTimeout> } | null = null;
    let activeRecoveryAttempts = 0;

    const cancelPendingFailure = (gateId?: number) => {
      if (!pendingFailure || (gateId !== undefined && pendingFailure.gateId !== gateId)) return;
      clearTimeout(pendingFailure.timer);
      pendingFailure = null;
    };

    const failActiveGate = (error: unknown, gateId: number) => {
      if (gateId !== activeGateId) return;
      cancelPendingFailure(gateId);
      const failure = error instanceof Error ? error : new Error(String(error));
      bindingKey = null;
      bindingPromise = null;
      adapter.failDesktopServiceGate(failure, gateId);
      if (!bootSettled) {
        bootSettled = true;
        rejectBoot(failure);
      }
    };
    function deferOperationalFailure(error: unknown, gateId: number) {
      if (gateId !== activeGateId || bootSettled) return;
      cancelPendingFailure();
      const failure = error instanceof Error ? error : new Error(String(error));
      const timer = setTimeout(() => {
        if (pendingFailure?.gateId !== gateId) return;
        pendingFailure = null;
        if (activeRecoveryAttempts < MAX_ACTIVE_RECOVERY_ATTEMPTS) {
          activeRecoveryAttempts += 1;
          const recoveryGateId = restartGate(false);
          void ensureActiveGate(recoveryGateId);
          return;
        }
        failActiveGate(failure, gateId);
      }, RECOVERY_RETRY_DELAY_MS);
      pendingFailure = { gateId, timer };
    }
    function restartGate(resetRecoveryAttempts = true): number {
      cancelPendingFailure();
      bindingKey = null;
      bindingPromise = null;
      if (resetRecoveryAttempts) activeRecoveryAttempts = 0;
      activeGateId = adapter.armDesktopServiceGate();
      return activeGateId;
    }
    function bindEndpoint(endpoint: DesktopServiceEndpoint, gateId: number): Promise<void> {
      if (gateId !== activeGateId) return Promise.resolve();
      cancelPendingFailure(gateId);
      const key = `${gateId}:${endpoint.port}:${endpoint.instanceId}`;
      if (bindingKey === key && bindingPromise) return bindingPromise;
      bindingKey = key;
      bindingPromise = adapter.connectDesktopService(endpoint, gateId)
        .then(() => {
          if (gateId !== activeGateId || bindingKey !== key) return;
          cancelPendingFailure(gateId);
          if (bootSettled) return;
          bootSettled = true;
          resolveBoot();
        })
        .catch((error) => {
          if (gateId === activeGateId && bindingKey === key) {
            bindingKey = null;
            bindingPromise = null;
            deferOperationalFailure(error, gateId);
          }
        });
      return bindingPromise;
    }
    async function ensureActiveGate(gateId: number): Promise<void> {
      try {
        const endpoint = await ensureDesktopService();
        if (gateId === activeGateId) await bindEndpoint(endpoint, gateId);
      } catch (error) {
        deferOperationalFailure(error, gateId);
      }
    }

    void (async () => {
      try {
        await listenDesktopServiceLifecycle((event) => {
          if (event.status === 'restarting') {
            restartGate();
          } else if (event.status === 'ready') {
            void bindEndpoint(event.endpoint, activeGateId);
          } else {
            failActiveGate(
              new Error(event.error ?? 'The managed desktop service failed'),
              activeGateId,
            );
          }
        });
      } catch (error) {
        failActiveGate(error, activeGateId);
        return;
      }

      await ensureActiveGate(activeGateId);
    })();
  });
}
