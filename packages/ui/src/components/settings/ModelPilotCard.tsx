/**
 * ModelPilotCard — 3-lane model selector with automatic fallback.
 * Sits above ModelsSection in Settings > Models tab.
 */

import { useState, useEffect, useCallback } from 'react';

interface ProviderModel {
  id: string;
  name: string;
  cost: '$' | '$$' | '$$$';
  speed: 'fast' | 'medium' | 'slow';
}

interface Provider {
  id: string;
  name: string;
  badge: string | null;
  hasKey: boolean;
  models: ProviderModel[];
}

export interface ModelPilotCardProps {
  defaultModel: string;
  fallbackModel: string | null;
  budgetModel: string | null;
  budgetThreshold: number;
  dailyBudget: number | null;
  onUpdate: (fields: {
    defaultModel?: string;
    fallbackModel?: string | null;
    budgetModel?: string | null;
    budgetThreshold?: number;
  }) => void;
  serverUrl?: string;
  onNavigateToVault?: () => void;
}

type Lane = 'primary' | 'fallback' | 'budget';

const LANE_CONFIG: Record<Lane, { label: string; color: string; bgColor: string; borderColor: string; description: string }> = {
  primary: {
    label: 'PRIMARY',
    color: '#22c55e',
    bgColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
    description: 'Your daily driver. Used for all chats by default.',
  },
  fallback: {
    label: 'FALLBACK',
    color: '#eab308',
    bgColor: 'rgba(234,179,8,0.08)',
    borderColor: 'rgba(234,179,8,0.25)',
    description: 'Auto-activates if primary fails or hits rate limit.',
  },
  budget: {
    label: 'BUDGET SAVER',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(59,130,246,0.25)',
    description: 'Activates when daily budget threshold is reached.',
  },
};

const COST_TIPS: Record<string, string> = { '$': '~$0.001/msg', '$$': '~$0.01/msg', '$$$': '~$0.05/msg' };
const SPEED_TIPS: Record<string, string> = { fast: '< 2s', medium: '2-8s', slow: '8-30s' };

export function ModelPilotCard({
  defaultModel, fallbackModel, budgetModel, budgetThreshold, dailyBudget,
  onUpdate, serverUrl, onNavigateToVault,
}: ModelPilotCardProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [openPicker, setOpenPicker] = useState<Lane | null>(null);
  const [simpleMode, setSimpleMode] = useState(!fallbackModel && !budgetModel);
  const baseUrl = serverUrl ?? 'http://127.0.0.1:3333';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/providers`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProviders(data.providers ?? []);
        }
      } catch { /* server not reachable */ }
    })();
    return () => { cancelled = true; };
  }, [baseUrl]);

  const findModel = useCallback((modelId: string | null): { model: ProviderModel; provider: Provider } | null => {
    if (!modelId) return null;
    for (const p of providers) {
      const m = p.models.find(mod => mod.id === modelId);
      if (m) return { model: m, provider: p };
    }
    return null;
  }, [providers]);

  const handleSelect = useCallback((lane: Lane, modelId: string) => {
    setOpenPicker(null);
    if (lane === 'primary') onUpdate({ defaultModel: modelId });
    else if (lane === 'fallback') { onUpdate({ fallbackModel: modelId }); setSimpleMode(false); }
    else { onUpdate({ budgetModel: modelId }); setSimpleMode(false); }
  }, [onUpdate]);

  const handleClear = useCallback((lane: 'fallback' | 'budget') => {
    onUpdate(lane === 'fallback' ? { fallbackModel: null } : { budgetModel: null });
  }, [onUpdate]);

  // ── Lane renderer ──

  function renderLane(lane: Lane, modelId: string | null, showClear: boolean) {
    const cfg = LANE_CONFIG[lane];
    const info = findModel(modelId);
    const isEmpty = !modelId || !info;

    return (
      <div
        key={lane}
        style={{
          padding: '14px 16px', borderRadius: 10,
          background: cfg.bgColor, border: `1px ${isEmpty ? 'dashed' : 'solid'} ${cfg.borderColor}`,
          minHeight: 72, position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: cfg.color }}>{cfg.label}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {showClear && !isEmpty && (
              <button onClick={() => handleClear(lane as 'fallback' | 'budget')}
                style={{ fontSize: 10, color: 'var(--hive-500)', background: 'none', border: 'none', cursor: 'pointer' }} title="Remove">&times;</button>
            )}
            <button onClick={() => setOpenPicker(openPicker === lane ? null : lane)}
              style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: 'none', border: `1px solid ${cfg.borderColor}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
              {isEmpty ? '+ Add' : 'Change'}
            </button>
          </div>
        </div>
        {isEmpty ? (
          <p style={{ fontSize: 11, color: 'var(--hive-500)', margin: 0 }}>{cfg.description}</p>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--hive-100)' }}>
              {info.model.name}
              {info.model.id.includes(':free') && (
                <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>FREE</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--hive-400)', marginTop: 2 }}>
              {info.provider.name}
              <span style={{ margin: '0 6px' }}>&middot;</span>
              <span title={COST_TIPS[info.model.cost]}>{info.model.cost}</span>
              <span style={{ margin: '0 6px' }}>&middot;</span>
              <span title={SPEED_TIPS[info.model.speed]}>{info.model.speed}</span>
            </div>
          </>
        )}
        {lane === 'budget' && !isEmpty && dailyBudget && dailyBudget > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--hive-500)', whiteSpace: 'nowrap' }}>At {Math.round(budgetThreshold * 100)}% spend</span>
            <input type="range" min={50} max={95} step={5} value={Math.round(budgetThreshold * 100)}
              onChange={(e) => onUpdate({ budgetThreshold: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: cfg.color }} />
          </div>
        )}
        {openPicker === lane && renderPicker(lane)}
      </div>
    );
  }

  // ── Picker dropdown ──

  function renderPicker(lane: Lane) {
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 50,
        background: 'var(--hive-900)', border: '1px solid var(--hive-700)', borderRadius: 8,
        maxHeight: 300, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}>
        {providers.map(provider => (
          <div key={provider.id}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: 'var(--hive-400)',
              padding: '8px 12px 4px', textTransform: 'uppercase', borderTop: '1px solid var(--hive-800)',
            }}>
              {provider.name}
              {provider.badge && <span style={{ marginLeft: 6, fontSize: 9, color: '#22c55e', fontWeight: 400 }}>{provider.badge}</span>}
            </div>
            {!provider.hasKey ? (
              <button onClick={() => { setOpenPicker(null); onNavigateToVault?.(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 11, color: 'var(--hive-600)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Add key in Vault &rarr;
              </button>
            ) : (
              provider.models.map(m => (
                <button key={m.id} onClick={() => handleSelect(lane, m.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, color: 'var(--hive-100)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--hive-800)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                  <span>
                    {m.name}
                    {m.id.includes(':free') && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '1px 4px', borderRadius: 3, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>FREE</span>}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--hive-500)' }}>{m.cost} &middot; {m.speed}</span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Main render ──

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      background: 'rgba(229,160,0,0.04)', border: '1px solid rgba(229,160,0,0.15)',
      marginBottom: 24, position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--hive-100)' }}>&#x2B21; Model Pilot</span>
        <span title="Model Pilot automatically switches models when your primary is rate-limited or your budget runs low. You'll see a notification when this happens."
          style={{ fontSize: 12, cursor: 'help', color: 'var(--hive-500)' }}>&#9432;</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: simpleMode ? '1fr' : '1fr 1fr', gap: 10 }}>
          {renderLane('primary', defaultModel, false)}
          {!simpleMode && renderLane('fallback', fallbackModel, true)}
        </div>
        {!simpleMode && renderLane('budget', budgetModel, true)}
      </div>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        {simpleMode ? (
          <button onClick={() => setSimpleMode(false)}
            style={{ fontSize: 11, color: 'var(--hive-500)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            Add fallback &amp; budget models
          </button>
        ) : (
          <button onClick={() => { onUpdate({ fallbackModel: null, budgetModel: null }); setSimpleMode(true); }}
            style={{ fontSize: 11, color: 'var(--hive-500)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            Just use one model &mdash; disable fallback &amp; budget
          </button>
        )}
      </div>
    </div>
  );
}
