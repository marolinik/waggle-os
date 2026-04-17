import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, Gem, Check, ChevronRight, Loader2, ExternalLink, Lock, Cpu, Code2, AlertCircle } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { Input } from '@/components/ui/input';
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
  const [customOpenInput, setCustomOpenInput] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [customModelStatus, setCustomModelStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

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
  const openrouter = providers.find(p => p.id === 'openrouter');
  const openrouterReady = !!openrouter?.hasKey;

  // When native Anthropic key is missing but OR is available, fall back
  // to the OR-routed alias (defined in litellm-config.yaml).
  const viaOpenRouter = !anthropicReady && openrouterReady;
  const standardModel = anthropicReady ? 'claude-sonnet-4-6' : viaOpenRouter ? 'claude-sonnet-4-6-via-openrouter' : null;
  const powerModel = anthropicReady ? 'claude-opus-4-7' : viaOpenRouter ? 'claude-opus-4-7-via-openrouter' : null;

  const ollama = providers.find(p => p.id === 'ollama');
  const gemmaLocal = ollama?.models.find(m => m.id.toLowerCase().startsWith('gemma'));

  const selectedModelId = (() => {
    switch (selectedTier) {
      case 'free': return freeModel;
      case 'standard': return standardModel ?? freeModel;
      case 'power': return powerModel ?? freeModel;
      case 'local': return gemmaLocal?.id ?? null;
      case 'custom': return customModelStatus === 'valid' ? customModelId : null;
    }
  })();

  const canFinish = !!selectedModelId && !creatingWorkspace && !loading;

  // Validate any OpenRouter model ID against the live catalog
  const validateCustomModel = async () => {
    const id = customModelId.trim();
    if (!id.includes('/')) {
      setCustomModelStatus('invalid');
      return;
    }
    setCustomModelStatus('validating');
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      if (!res.ok) throw new Error('catalog fetch failed');
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      const exists = (data.data ?? []).some(m => m.id === id);
      setCustomModelStatus(exists ? 'valid' : 'invalid');
    } catch {
      // Can't verify — accept optimistically so user isn't blocked offline
      setCustomModelStatus('valid');
    }
  };

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

          {/* ── STANDARD — Anthropic Sonnet (or OR-routed) ───── */}
          <TierCard
            id="standard"
            selected={selectedTier === 'standard'}
            onSelect={() => !!standardModel && setSelectedTier('standard')}
            icon={<Zap className="w-5 h-5" />}
            title="Standard"
            subtitle="Balanced speed + quality"
            modelLabel="Claude Sonnet 4.6"
            modelSub={
              anthropicReady ? 'via Anthropic · $$/M tokens' :
              viaOpenRouter ? 'via OpenRouter · $$/M tokens (+OR markup)' :
              'Add Anthropic or OpenRouter key in Vault'
            }
            disabled={!standardModel}
            accent="sky"
          />

          {/* ── POWER — Anthropic Opus (or OR-routed) ────────── */}
          <TierCard
            id="power"
            selected={selectedTier === 'power'}
            onSelect={() => !!powerModel && setSelectedTier('power')}
            icon={<Gem className="w-5 h-5" />}
            title="Power"
            subtitle="Deepest reasoning, best for hard problems"
            modelLabel="Claude Opus 4.7"
            modelSub={
              anthropicReady ? 'via Anthropic · $$$/M tokens' :
              viaOpenRouter ? 'via OpenRouter · $$$/M tokens (+OR markup)' :
              'Add Anthropic or OpenRouter key in Vault'
            }
            disabled={!powerModel}
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
          <div
            className={`w-full rounded-xl border transition-all ${
              selectedTier === 'custom'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/30 bg-secondary/20 hover:border-primary/30'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedTier('custom');
                setCustomOpenInput(true);
              }}
              className="w-full text-left px-4 py-3 flex items-center gap-3"
            >
              <Code2 className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-xs font-display font-semibold text-foreground">Custom OpenRouter model</p>
                <p className="text-[11px] text-muted-foreground">
                  Paste any OR model ID — 300+ available, including routed Claude / Gemini / Qwen
                </p>
              </div>
              {selectedTier === 'custom' && <Check className="w-4 h-4 text-primary" />}
            </button>

            {customOpenInput && (
              <div className="px-4 pb-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={customModelId}
                    onChange={e => { setCustomModelId(e.target.value); setCustomModelStatus('idle'); }}
                    placeholder="e.g. anthropic/claude-opus-4.7 or qwen/qwen3-coder:free"
                    className="flex-1 bg-muted/30 rounded-lg font-mono text-xs h-auto py-1.5"
                  />
                  <button
                    type="button"
                    onClick={validateCustomModel}
                    disabled={customModelId.trim().length < 3 || customModelStatus === 'validating'}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-40 transition-colors"
                  >
                    {customModelStatus === 'validating' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Validate'}
                  </button>
                </div>
                {customModelStatus === 'valid' && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5"><Check className="w-3 h-3" /> Model available on OpenRouter</p>
                )}
                {customModelStatus === 'invalid' && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3" /> Not found on OpenRouter — check the ID (format: <code className="font-mono">provider/model-slug</code>)
                  </p>
                )}
                <a
                  href="https://openrouter.ai/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-2.5 h-2.5" /> Browse all OpenRouter models
                </a>
              </div>
            )}
          </div>
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
