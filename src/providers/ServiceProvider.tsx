import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { adapter } from '@/lib/adapter';
import type LocalAdapter from '@/lib/adapter';

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

export const ServiceProvider = ({ children }: { children: ReactNode }) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await adapter.connect();
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => { connect(); }, []);

  return (
    <ServiceContext.Provider value={{ adapter: adapter as LocalAdapter, connected, connecting, error, reconnect: connect }}>
      {children}
    </ServiceContext.Provider>
  );
};
