import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Key, User, Briefcase, Rocket, TestTube, Loader2, CheckCircle2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import waggleLogo from '@/assets/waggle-logo.jpeg';
import { adapter } from '@/lib/adapter';

interface OnboardingWizardProps {
  open: boolean;
  onComplete: (data: { name: string; apiKey: string; provider: string; workspace: { name: string; group: string; persona?: string } }) => void;
}

type Step = 'name' | 'apikey' | 'workspace' | 'ready';

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: 'name', label: 'Name', icon: User },
  { id: 'apikey', label: 'API Key', icon: Key },
  { id: 'workspace', label: 'Workspace', icon: Briefcase },
  { id: 'ready', label: 'Ready', icon: Rocket },
];

const OnboardingWizard = ({ open, onComplete }: OnboardingWizardProps) => {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [wsName, setWsName] = useState('');
  const [wsGroup, setWsGroup] = useState('Personal');
  const [wsPersona, setWsPersona] = useState<string | undefined>();

  const stepIndex = STEPS.findIndex(s => s.id === step);

  const handleTestKey = async () => {
    setTesting(true);
    try {
      const result = await adapter.testApiKey(provider, apiKey);
      setKeyValid(result.valid);
    } catch { setKeyValid(false); }
    finally { setTesting(false); }
  };

  const handleComplete = () => {
    onComplete({
      name,
      apiKey,
      provider,
      workspace: { name: wsName || 'Default Workspace', group: wsGroup, persona: wsPersona },
    });
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={waggleLogo} alt="Waggle AI" className="w-16 h-16 mx-auto rounded-2xl mb-3 shadow-xl" />
          <h1 className="text-2xl font-display font-bold text-foreground">Welcome to Waggle AI</h1>
          <p className="text-sm text-muted-foreground mt-1">Let's get you set up</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display transition-colors ${
                i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 rounded ${i < stepIndex ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="glass-strong rounded-2xl p-6">
          <AnimatePresence mode="wait">
            {step === 'name' && (
              <motion.div key="name" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="text-sm font-display font-semibold text-foreground mb-4">What should we call you?</h3>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && name.trim() && setStep('apikey')}
                />
                <button
                  onClick={() => setStep('apikey')}
                  disabled={!name.trim()}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm hover:bg-primary/80 disabled:opacity-50 transition-colors"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {step === 'apikey' && (
              <motion.div key="apikey" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="text-sm font-display font-semibold text-foreground mb-4">Connect your AI provider</h3>
                <div className="space-y-3">
                  <select
                    value={provider}
                    onChange={e => setProvider(e.target.value)}
                    className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="local">Local (Ollama)</option>
                  </select>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleTestKey}
                      disabled={!apiKey || testing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50 transition-colors"
                    >
                      {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />}
                      Test
                    </button>
                    {keyValid !== null && (
                      <span className={`flex items-center gap-1 text-xs ${keyValid ? 'text-emerald-400' : 'text-destructive'}`}>
                        {keyValid ? <><CheckCircle2 className="w-3 h-3" /> Valid</> : 'Invalid'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStep('name')} className="flex-1 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Back
                  </button>
                  <button
                    onClick={() => setStep('workspace')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm hover:bg-primary/80 transition-colors"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'workspace' && (
              <motion.div key="workspace" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3 className="text-sm font-display font-semibold text-foreground mb-4">Create your first workspace</h3>
                <div className="space-y-3">
                  <input
                    value={wsName}
                    onChange={e => setWsName(e.target.value)}
                    placeholder="Workspace name"
                    className="w-full bg-muted/50 border border-border/50 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none"
                  />
                  <div className="flex gap-2">
                    {['Personal', 'Work', 'Research'].map(g => (
                      <button
                        key={g}
                        onClick={() => setWsGroup(g)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                          wsGroup === g ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PERSONAS.slice(0, 4).map(p => (
                      <button
                        key={p.id}
                        onClick={() => setWsPersona(wsPersona === p.id ? undefined : p.id)}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${
                          wsPersona === p.id ? 'bg-primary/20 border border-primary/50' : 'bg-secondary/30 border border-transparent'
                        }`}
                      >
                        <Avatar className="w-7 h-7">
                          <AvatarImage src={p.avatar} />
                          <AvatarFallback className="text-[8px]">{p.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-[8px] text-muted-foreground truncate w-full text-center">{p.name.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStep('apikey')} className="flex-1 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Back
                  </button>
                  <button
                    onClick={() => setStep('ready')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm hover:bg-primary/80 transition-colors"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'ready' && (
              <motion.div key="ready" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="text-center">
                <Rocket className="w-12 h-12 text-primary mx-auto mb-3" />
                <h3 className="text-lg font-display font-bold text-foreground mb-2">You're all set, {name}!</h3>
                <div className="text-xs text-muted-foreground space-y-1 mb-4">
                  <p>Provider: <span className="text-foreground capitalize">{provider}</span></p>
                  <p>Workspace: <span className="text-foreground">{wsName || 'Default Workspace'}</span></p>
                  {wsPersona && <p>Persona: <span className="text-foreground">{PERSONAS.find(p => p.id === wsPersona)?.name}</span></p>}
                </div>
                <button
                  onClick={handleComplete}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors glow-primary"
                >
                  🐝 Start Using Waggle
                </button>
                <button onClick={() => setStep('workspace')} className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Go back
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default OnboardingWizard;
