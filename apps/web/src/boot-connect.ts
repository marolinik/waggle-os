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

let bootArmed = false;

export function armBootConnection(): void {
  if (bootArmed) return;
  bootArmed = true;

  if (!isTauri()) {
    void adapter.connect().catch(() => {
      /* ServiceProvider surfaces browser connection state. */
    });
    return;
  }

  let activeGateId = adapter.armDesktopServiceGate();
  let bindingKey: string | null = null;

  const failActiveGate = (error: unknown) => {
    bindingKey = null;
    adapter.failDesktopServiceGate(error, activeGateId);
  };
  const restartGate = () => {
    bindingKey = null;
    activeGateId = adapter.armDesktopServiceGate();
  };
  const bindEndpoint = (endpoint: DesktopServiceEndpoint, gateId: number) => {
    if (gateId !== activeGateId) return;
    const key = `${gateId}:${endpoint.port}:${endpoint.instanceId}`;
    if (bindingKey === key) return;
    bindingKey = key;
    void adapter.connectDesktopService(endpoint, gateId).catch((error) => {
      if (gateId !== activeGateId || bindingKey !== key) return;
      failActiveGate(error);
    });
  };

  void (async () => {
    try {
      await listenDesktopServiceLifecycle((event) => {
        if (event.status === 'restarting') {
          restartGate();
        } else if (event.status === 'ready') {
          bindEndpoint(event.endpoint, activeGateId);
        } else {
          failActiveGate(new Error(event.error ?? 'The managed desktop service failed'));
        }
      });
    } catch (error) {
      failActiveGate(error);
      return;
    }

    const initialGateId = activeGateId;
    try {
      const endpoint = await ensureDesktopService();
      bindEndpoint(endpoint, initialGateId);
    } catch (error) {
      if (initialGateId === activeGateId) failActiveGate(error);
    }
  })();
}
