import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, Gem, Check, ChevronRight, Loader2, ExternalLink, Lock, Cpu, Code2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { fadeSlide } from './constants';

/**
 * Three-tier model picker shown during onboarding.
 * - Free (default): OpenRouter free model — zero cost, no credit card
 * - Standard: Claude Sonnet 4.6 — balanced
 * - Power: Claude Opus 4.7 — deepest reasoning
 *
 * Advanced tray exposes Gemma 4 via local Ollama (if detected) and a
 * link to add any custom OpenRouter model later in Settings.
 */

interface ModelTierStepProps {
  onFinish: (selectedModel: string) => Promise<void> | void;
  goToStep: (n: number) => void;
  creatingWorkspace: boolean;
}

type TierId = 'free' | 'standard' | 'power' | 'local' | 'custom';

interface ProviderSummary {
  id: string;
  hasKey: boolean;
  reachable?: boolean;
  models: Array<{ id: string; name: string; source?: 'local' | 'cloud' }>;
}

// Preferred free model from OpenRouter — fast fallback if catalog fetch fails.
const OPENROUTER_FREE_FALLBACK = 'openrouter/auto';

const ModelTierStep = ({ onFinish, goToStep, creatingWorkspace }: ModelTierStepProps) => {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<TierId>('free');

  useEffect(() => {
    adapter.getProviders()
      .then(d => setProviders(d.providers as unknown as ProviderSummary[]))
      .finally(() => setLoading(false));
  }, []);

  // Resolve concrete model IDs from live provider data
  const freeModel = useMemo(() => {
    const or = providers.find(p => p.id === 'openrouter');
    if (!or?.hasKey) return null;
    // Prefer a known-good free chat model; fall back to openrouter/auto
    const preferred = [
      'qwen/qwen3-next-80b-a3b-instruct:free',
      'google/gemma-4-31b-it:free',
      'z-ai/glm-4.5-air:free',
      'openai/gpt-oss-120b:free',
    ];
    for (const id of preferred) {
      if (or.models.some(m => m.id === id)) return id;
    }
    const anyFree = or.models.find(m => m.id.endsWith(':free'));
    return anyFree?.id ?? OPENROUTER_FREE_FALLBACK;
  }, [providers]);

  const anthropic = providers.find(p => p.id === 'anthropic');
  const anthropicReady = !!anthropic?.hasKey;

  const ollama = providers.find(p => p.id === 'ollama');
  const gemmaLocal = ollama?.models.find(m => m.id.toLowerCase().startsWith('gemma'));

  const selectedModelId = (() => {
    switch (selectedTier) {
      case 'free': return freeModel;
      case 'standard': return anthropicReady ? 'claude-sonnet-4-6' : freeModel;
      case 'power': return anthropicReady ? 'claude-opus-4-7' : freeModel;
      case 'local': return gemmaLocal?.id ?? null;
      case 'custom': return null;
    }
  })();

  const canFinish = !!selectedModelId && !creatingWorkspace && !loading;

  return (
    <motion.div key="step-6-models" {...fadeSlide}>
      <div className="text-center mb-6">
        <Sparkles className="w-10 h-10 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Pick your starting brain
        </h2>
        <p className="text-sm text-muted-foreground">
          You can change this any time from Settings.
        </p>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* ── FREE — OpenRouter ─────────────────────────── */}
          <TierCard
            id="free"
            selected={selectedTier === 'free'}
            onSelect={() => setSelectedTier('free')}
            icon={<Sparkles className="w-5 h-5" />}
            title="Free"
            subtitle="Recommended to start"
            modelLabel={freeModel ?? 'Add an OpenRouter key'}
            modelSub={freeModel ? 'via OpenRouter · $0/mo · no credit card' : 'Free models require an OpenRouter account'}
            disabled={!freeModel}
            accent="emerald"
          />

          {/* ── STANDARD — Anthropic Sonnet ────────────────── */}
          <TierCard
            id="standard"
            selected={selectedTier === 'standard'}
            onSelect={() => anthropicReady && setSelectedTier('standard')}
            icon={<Zap className="w-5 h-5" />}
            title="Standard"
            subtitle="Balanced speed + quality"
            modelLabel="Claude Sonnet 4.6"
            modelSub={anthropicReady ? 'via Anthropic · $$/M tokens' : 'Needs Anthropic key — add in Vault'}
            disabled={!anthropicReady}
            accent="sky"
          />

          {/* ── POWER — Anthropic Opus ─────────────────────── */}
          <TierCard
            id="power"
            selected={selectedTier === 'power'}
            onSelect={() => anthropicReady && setSelectedTier('power')}
            icon={<Gem className="w-5 h-5" />}
            title="Power"
            subtitle="Deepest reasoning, best for hard problems"
            modelLabel="Claude Opus 4.7"
            modelSub={anthropicReady ? 'via Anthropic · $$$/M tokens' : 'Needs Anthropic key — add in Vault'}
            disabled={!anthropicReady}
            accent="violet"
          />

          {/* ── ADVANCED: Local Ollama ─────────────────────── */}
          {gemmaLocal && (
            <TierCard
              id="local"
              selected={selectedTier === 'local'}
              onSelect={() => setSelectedTier('local')}
              icon={<Cpu className="w-5 h-5" />}
              title="Local (Private)"
              subtitle="Runs on your machine, no network"
              modelLabel={gemmaLocal.id}
              modelSub="via Ollama · free · fully offline"
              disabled={false}
              accent="amber"
              compact
            />
          )}

          {/* ── ADVANCED: Custom OpenRouter model ─────────── */}
          <button
            type="button"
            onClick={() => setSelectedTier('custom')}
            className="w-full text-left px-4 py-3 rounded-xl border border-border/30 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <Code2 className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
              <div className="flex-1">
                <p className="text-xs font-display font-semibold text-foreground">Custom OpenRouter model</p>
                <p className="text-[11px] text-muted-foreground">
                  Pick any of 300+ models — set in Settings after onboarding
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </div>
          </button>
        </div>
      )}

      {/* ── Where-keys-live explainer ────────────────────────── */}
      <div className="flex items-start gap-2.5 p-3 mt-5 rounded-lg bg-primary/5 border border-primary/20">
        <Lock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          All API keys are encrypted with AES-256-GCM and stored locally at
          <code className="mx-1 px-1 py-0.5 rounded bg-muted text-[10px] text-primary">~/.waggle/vault</code>.
          They never leave your machine. Manage keys in the <strong className="text-primary">Vault</strong> app after onboarding.
        </p>
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={() => goToStep(5)}
          className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => selectedModelId && onFinish(selectedModelId)}
          disabled={!canFinish}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors glow-primary"
        >
          {creatingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          {creatingWorkspace ? 'Creating workspace…' : 'Create Workspace'}
        </button>
      </div>
    </motion.div>
  );
};

/* ─── Tier card subcomponent ─── */
interface TierCardProps {
  id: TierId;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  modelLabel: string;
  modelSub: string;
  disabled: boolean;
  accent: 'emerald' | 'sky' | 'violet' | 'amber';
  compact?: boolean;
}

const ACCENT_CLASSES: Record<TierCardProps['accent'], string> = {
  emerald: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/5',
  sky: 'text-sky-400 border-sky-400/40 bg-sky-400/5',
  violet: 'text-violet-400 border-violet-400/40 bg-violet-400/5',
  amber: 'text-amber-400 border-amber-400/40 bg-amber-400/5',
};

const TierCard = ({ selected, onSelect, icon, title, subtitle, modelLabel, modelSub, disabled, accent, compact }: TierCardProps) => {
  const selectedClass = selected ? ACCENT_CLASSES[accent] : 'border-border/30 bg-secondary/20';
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left rounded-xl border-2 transition-all ${selectedClass} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/60'} ${compact ? 'px-4 py-2.5' : 'px-4 py-3'}`}
    >
      <div className="flex items-center gap-3">
        <div className={selected ? '' : 'text-muted-foreground'}>{icon}</div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-display font-semibold text-foreground">{title}</span>
            <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          </div>
          <div className="text-[11px] text-foreground/80 font-mono truncate">{modelLabel}</div>
          <div className="text-[10px] text-muted-foreground">{modelSub}</div>
        </div>
        {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
      </div>
    </button>
  );
};

export default ModelTierStep;
