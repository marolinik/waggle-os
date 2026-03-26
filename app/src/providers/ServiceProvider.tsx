/**
 * ServiceProvider — React context providing the WaggleService (LocalAdapter)
 * to all components in the tree.
 *
 * Handles connection lifecycle: shows loading/error states until connected.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { WaggleService } from '@waggle/ui';

const ServiceContext = createContext<WaggleService | null>(null);

export function useService(): WaggleService {
  const service = useContext(ServiceContext);
  if (!service) throw new Error('useService must be used within ServiceProvider');
  return service;
}

interface ServiceProviderProps {
  adapter: WaggleService;
  children: React.ReactNode;
}

export function ServiceProvider({ adapter, children }: ServiceProviderProps) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // If running in Tauri, ensure the server process is started first
      if ((window as any).__TAURI_INTERNALS__) {
        try {
          const coreModule = '@tauri-apps/' + 'api/core';
          const { invoke } = await import(/* @vite-ignore */ coreModule);
          await invoke('ensure_service');
        } catch (err) {
          console.warn('[waggle] ensure_service failed:', err);
        }
      }

      try {
        await adapter.connect();
        if (!cancelled) setConnected(true);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      adapter.disconnect();
    };
  }, [adapter]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background font-sans flex-col gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <div className="text-lg font-semibold text-destructive">Failed to connect</div>
        <div className="text-sm text-muted-foreground">{error}</div>
        <div className="text-xs text-muted-foreground/60 mt-2">
          Make sure the Waggle service is running on localhost:3333
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-screen bg-background font-sans gap-2">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        <span className="text-foreground">Connecting to Waggle...</span>
      </div>
    );
  }

  return (
    <ServiceContext.Provider value={adapter}>
      {children}
    </ServiceContext.Provider>
  );
}
