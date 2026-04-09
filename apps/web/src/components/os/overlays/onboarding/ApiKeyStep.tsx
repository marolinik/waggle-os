import { motion } from 'framer-motion';
import { Key, ChevronRight, Loader2, Check, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fadeSlide } from './constants';
import type { ApiKeyStepProps, OnboardingProvider } from './types';
import { getProviders } from '@/lib/providers';

/* Build provider list from shared registry — single source of truth */
const PROVIDERS: readonly OnboardingProvider[] = getProviders().map(p => ({
  id: p.id,
  name: p.name,
  prefix: p.keyPrefix ?? '',
  badge: p.badge,
  keyUrl: p.keyUrl ?? '',
}));

const ApiKeyStep = ({
  selectedProvider,
  apiKey,
  validating,
  keyValid,
  keySaved,
  creatingWorkspace,
  onSelectProvider,
  onApiKeyChange,
  onValidateKey,
  onFinish,
  goToStep,
}: ApiKeyStepProps) => {
  const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <motion.div key="step-6" {...fadeSlide}>
      <div className="text-center mb-6">
        <Key className="w-10 h-10 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Connect your AI brain
        </h2>
        <p className="text-sm text-muted-foreground">
          Add an API key to power your agent
        </p>
      </div>

      {/* Provider tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {PROVIDERS.map((prov) => (
          <button
            key={prov.id}
            onClick={() => onSelectProvider(prov.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
              selectedProvider === prov.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {prov.name}
            {prov.badge && (
              <span className="ml-1.5 text-[11px] opacity-75">({prov.badge})</span>
            )}
          </button>
        ))}
      </div>

      <div className="glass-strong rounded-xl p-5">
        {selectedProvider === 'ollama' ? (
          <div className="text-center py-4">
            <p className="text-sm text-foreground mb-2">No API key needed</p>
            <p className="text-xs text-muted-foreground mb-4">
              Make sure Ollama is running locally on your machine.
            </p>
            <a
              href="https://ollama.ai/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Download Ollama
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Input
                type="password"
                value={apiKey}
                onChange={e => onApiKeyChange(e.target.value)}
                placeholder={currentProvider?.prefix ? `${currentProvider.prefix}…` : 'Paste your API key'}
                className="w-full bg-muted/30 rounded-xl font-mono"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onValidateKey}
                disabled={apiKey.length < 10 || validating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-40 transition-colors"
              >
                {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : keySaved ? <Check className="w-3 h-3" /> : <Key className="w-3 h-3" />}
                {keySaved ? 'Key saved!' : 'Validate & save'}
              </button>

              {keyValid === false && (
                <span className="text-xs text-primary/80">
                  Could not verify — you can still continue
                </span>
              )}
            </div>

            <a
              href={currentProvider?.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Get a {currentProvider?.name} API key
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={() => goToStep(5)}
          className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={onFinish}
          disabled={creatingWorkspace}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors glow-primary"
        >
          {creatingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          {creatingWorkspace ? 'Creating workspace…' : 'Create Workspace'}
        </button>
      </div>

      <div className="text-center mt-3">
        <button
          onClick={onFinish}
          disabled={creatingWorkspace}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Skip — I'll add a key later
        </button>
      </div>
    </motion.div>
  );
};

export default ApiKeyStep;
