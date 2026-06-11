import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { adapter } from '@/lib/adapter';
import type { LocalAdapter } from '@/lib/adapter';
import { CONNECT_SETTLED_EVENT } from '@/hooks/useRevalidateOnError';

interface ServiceContextValue {
  adapter: LocalAdapter;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnect: () => void;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

export const useService = () => {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useService must be used within ServiceProvider');
  return ctx;
};

/** P1b D3: backoff schedule for the cold-sidecar boot window (the default
 *  desktop path — webview up before the sidecar listens; the boot-connect
 *  kickoff fails fast with ECONNREFUSED). Capped: steady-state recovery is
 *  owned by the adapter gate's re-arm + the 401-refresh leg, not a poll. */
const RETRY_DELAYS_MS = [1000, 3000, 9000];

export const ServiceProvider = ({ children }: { children: ReactNode }) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Review fix: a connect rejection landing AFTER unmount must not schedule a
  // new timer (the unmount cleanup already ran) or setState on a dead tree.
  const mounted = useRef(true);

  // P1b D3: every settlement (success or failure) is broadcast so errored
  // Stage-B surfaces (tier, workspaces, briefing, …) revalidate without
  // waiting for a focus event that never fires on an already-focused window.
  // `force` bypasses the adapter's retained settled-success memo — without it
  // a user-initiated reconnect after a sidecar death would silently no-op.
  const connect = async (attempt = 0, force = false) => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    setConnecting(true);
    setError(null);
    try {
      // Dedups onto the boot-connect.ts kickoff via the adapter's memo.
      await (force ? adapter.forceReconnect() : adapter.connect());
      if (!mounted.current) return;
      setConnected(true);
      setConnecting(false);
      window.dispatchEvent(new CustomEvent(CONNECT_SETTLED_EVENT, { detail: { connected: true } }));
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : 'Failed to connect');
      setConnected(false);
      setConnecting(false);
      window.dispatchEvent(new CustomEvent(CONNECT_SETTLED_EVENT, { detail: { connected: false } }));
      if (attempt < RETRY_DELAYS_MS.length) {
        retryTimer.current = setTimeout(() => { void connect(attempt + 1); }, RETRY_DELAYS_MS[attempt]);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    connect();
    return () => {
      mounted.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  return (
    <ServiceContext.Provider value={{ adapter: adapter as LocalAdapter, connected, connecting, error, reconnect: () => connect(0, true) }}>
      {children}
    </ServiceContext.Provider>
  );
};
