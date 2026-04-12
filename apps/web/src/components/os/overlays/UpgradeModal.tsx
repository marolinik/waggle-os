import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, Check, Crown, Users } from 'lucide-react';
import { TIER_CAPABILITIES } from '@waggle/shared';

interface TierEvent {
  required: string;
  actual: string;
  message: string;
}

type CapKey = keyof typeof TIER_CAPABILITIES.FREE;

const FEATURE_ROWS: Array<{ label: string; key: CapKey; format: (v: unknown) => string }> = [
  { label: 'Workspaces', key: 'workspaceLimit', format: v => (v as number) === -1 ? 'Unlimited' : String(v) },
  { label: 'Agents', key: 'spawnAgents', format: v => v ? 'Yes' : '—' },
  { label: 'Connectors', key: 'connectorLimit', format: v => (v as number) === -1 ? 'Unlimited' : String(v) },
  { label: 'Custom Skills', key: 'customSkills', format: v => v ? 'Yes' : '—' },
  { label: 'Export Formats', key: 'exportFormats', format: v => {
    const fmts = v as string[];
    if (fmts.length <= 2) return fmts.join(', ');
    return `All (${fmts.length})`;
  }},
  { label: 'Shared Workspaces', key: 'sharedWorkspaces', format: v => v ? 'Yes' : '—' },
  { label: 'Team Governance', key: 'adminPanel', format: v => v ? 'Yes' : '—' },
  { label: 'Audit Log', key: 'auditLog', format: v => {
    if (v === 'none') return '—';
    return String(v).charAt(0).toUpperCase() + String(v).slice(1);
  }},
];

function CellValue({ value, isBool }: { value: string; isBool: boolean }) {
  if (value === 'Yes' && isBool) return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === '—') return <span className="text-muted-foreground/40">—</span>;
  return <span className="text-foreground">{value}</span>;
}

interface UpgradeModalProps {
  onStartTrial?: () => void;
  onUpgrade?: (tier: 'PRO' | 'TEAMS') => void;
}

export default function UpgradeModal({ onStartTrial, onUpgrade }: UpgradeModalProps) {
  const [event, setEvent] = useState<TierEvent | null>(null);

  const handleTierInsufficient = useCallback((e: Event) => {
    setEvent((e as CustomEvent<TierEvent>).detail);
  }, []);

  useEffect(() => {
    window.addEventListener('waggle:tier-insufficient', handleTierInsufficient);
    return () => window.removeEventListener('waggle:tier-insufficient', handleTierInsufficient);
  }, [handleTierInsufficient]);

  const close = () => setEvent(null);

  const free = TIER_CAPABILITIES.FREE;
  const pro = TIER_CAPABILITIES.PRO;
  const teams = TIER_CAPABILITIES.TEAMS;

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-2xl glass-strong rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={close} className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-display font-bold text-foreground">
                  Upgrade to unlock this feature
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {event.message}
              </p>
            </div>

            <div className="px-6 pb-4">
              <div className="rounded-xl border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-3 text-muted-foreground font-medium">Feature</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-24">Free</th>
                      <th className="text-center p-3 font-medium w-28">
                        <span className="text-primary flex items-center justify-center gap-1">
                          <Crown className="w-3.5 h-3.5" /> Pro
                        </span>
                      </th>
                      <th className="text-center p-3 font-medium w-28">
                        <span className="text-accent-foreground flex items-center justify-center gap-1">
                          <Users className="w-3.5 h-3.5" /> Teams
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_ROWS.map(row => {
                      const freeVal = row.format(free[row.key]);
                      const proVal = row.format(pro[row.key]);
                      const teamsVal = row.format(teams[row.key]);
                      const isBool = typeof free[row.key] === 'boolean';
                      return (
                        <tr key={row.key} className="border-b border-border/30 last:border-0">
                          <td className="p-3 text-foreground">{row.label}</td>
                          <td className="p-3 text-center text-muted-foreground">{freeVal}</td>
                          <td className="p-3 text-center"><CellValue value={proVal} isBool={isBool} /></td>
                          <td className="p-3 text-center"><CellValue value={teamsVal} isBool={isBool} /></td>
                        </tr>
                      );
                    })}
                    {/* Memory row — always free, hardcoded as marketing highlight */}
                    <tr className="border-b border-border/30 last:border-0">
                      <td className="p-3 text-foreground">Memory & Harvest</td>
                      <td className="p-3 text-center text-muted-foreground">Unlimited</td>
                      <td className="p-3 text-center"><span className="text-foreground">Unlimited</span></td>
                      <td className="p-3 text-center"><span className="text-foreground">Unlimited</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 pb-6 flex items-center gap-3">
              <button
                onClick={() => { onStartTrial?.(); close(); }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-primary/30 text-primary font-display text-sm font-semibold hover:bg-primary/10 transition-colors"
              >
                Start 15-day free trial
              </button>
              <button
                onClick={() => { onUpgrade?.(event.required === 'TEAMS' ? 'TEAMS' : 'PRO'); close(); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Upgrade to {event.required === 'TEAMS' ? 'Teams — $49/seat' : 'Pro — $19/mo'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
