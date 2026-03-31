import { useState, useEffect, useCallback } from 'react';
import { adapter } from '@/lib/adapter';
import type { WaggleSignal } from '@/lib/types';

export const useWaggleDance = () => {
  const [signals, setSignals] = useState<WaggleSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WaggleSignal['type'] | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getWaggleSignals();
      setSignals(data);
      setError(null);
    } catch (err) {
      console.error('[useWaggleDance] refresh failed:', err);
      setSignals([]);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    let unsub: (() => void) | undefined;
    try {
      unsub = adapter.subscribeWaggleDance?.((signal) => {
        setSignals(prev => [signal, ...prev]);
      }) || undefined;
    } catch (err) {
      console.error('[useWaggleDance] SSE subscribe failed:', err);
    }
    return () => { try { unsub?.(); } catch (err) { console.error('[useWaggleDance] cleanup failed:', err); } };
  }, [refresh]);

  const publishSignal = useCallback(async (data: Omit<WaggleSignal, 'id' | 'timestamp'>) => {
    try {
      const signal = await adapter.publishWaggleSignal(data);
      setSignals(prev => [signal, ...prev]);
      return signal;
    } catch (e) {
      throw e;
    }
  }, []);

  const acknowledge = useCallback(async (id: string) => {
    try {
      await adapter.acknowledgeWaggleSignal(id);
      setSignals(prev => prev.map(s => s.id === id ? { ...s, acknowledged: true } : s));
    } catch (err) { console.error('[useWaggleDance] acknowledge failed:', err); }
  }, []);

  const filtered = filter === 'all' ? signals : signals.filter(s => s.type === filter);

  return { signals: filtered, allSignals: signals, loading, error, filter, setFilter, refresh, publishSignal, acknowledge };
};
