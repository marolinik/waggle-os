import { useState, useEffect, useCallback } from 'react';
import { adapter } from '@/lib/adapter';
import type { WaggleSignal } from '@/lib/types';

export const useWaggleDance = () => {
  const [signals, setSignals] = useState<WaggleSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<WaggleSignal['type'] | 'all'>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getWaggleSignals();
      setSignals(data);
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = adapter.subscribeWaggleDance((signal) => {
      setSignals(prev => [signal, ...prev]);
    });
    return unsub;
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
    } catch { /* ignore */ }
  }, []);

  const filtered = filter === 'all' ? signals : signals.filter(s => s.type === filter);

  return { signals: filtered, allSignals: signals, loading, filter, setFilter, refresh, publishSignal, acknowledge };
};
