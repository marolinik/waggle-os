import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Brain, Layers, Wrench, Upload,
  Target, Microscope, Laptop, Megaphone, Rocket, Scale, Building, Plus,
  PenLine, BarChart3, Code, ClipboardList, Mail,
  Key, Check, Loader2, ExternalLink, Hexagon, Sparkles, FileJson,
} from 'lucide-react';
import waggleLogo from '@/assets/waggle-logo.jpeg';
import { adapter } from '@/lib/adapter';
import type { OnboardingState } from '@/hooks/useOnboarding';

/* ─── Props ─── */
interface OnboardingWizardProps {
  serverBaseUrl: string;
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onComplete: (serverBaseUrl: string) => void;
  onDismiss: () => void;
  onFinish: (workspaceId: string, firstMessage: string) => void;
}

/* ─── Constants ─── */
const TEMPLATES = [
  { id: 'sales-pipeline', name: 'Sales Pipeline', icon: Target, hint: 'Research the top 5 competitors in my industry', desc: 'Track deals and prospects' },
  { id: 'research-project', name: 'Research Project', icon: Microscope, hint: 'Help me design a literature review on my topic', desc: 'Deep dive into any subject' },
  { id: 'code-review', name: 'Code Review', icon: Laptop, hint: 'Read my project and tell me what you see', desc: 'Analyze and review code' },
  { id: 'marketing-campaign', name: 'Marketing Campaign', icon: Megaphone, hint: 'Draft a campaign brief for my product launch', desc: 'Plan campaigns & content' },
  { id: 'product-launch', name: 'Product Launch', icon: Rocket, hint: 'Help me write a PRD for my next feature', desc: 'Ship products faster' },
  { id: 'legal-review', name: 'Legal Review', icon: Scale, hint: 'Draft a standard NDA template', desc: 'Review contracts & docs' },
  { id: 'agency-consulting', name: 'Agency Consulting', icon: Building, hint: 'Set up client workspaces for my biggest accounts', desc: 'Manage client work' },
  { id: 'blank', name: 'Blank Workspace', icon: Plus, hint: 'Hello! What can you help me with?', desc: 'Start from scratch' },
] as const;

const TEMPLATE_PERSONA: Record<string, string> = {
  'sales-pipeline': 'sales-rep',
  'research-project': 'researcher',
  'code-review': 'coder',
  'marketing-campaign': 'marketer',
  'product-launch': 'project-manager',
  'legal-review': 'analyst',
  'agency-consulting': 'executive-assistant',
  'blank': 'researcher',
};

const ONBOARDING_PERSONAS = [
  { id: 'researcher', name: 'Researcher', icon: Microscope, desc: 'Deep investigation & synthesis' },
  { id: 'writer', name: 'Writer', icon: PenLine, desc: 'Long-form content & editing' },
  { id: 'analyst', name: 'Analyst', icon: BarChart3, desc: 'Data analysis & reporting' },
  { id: 'coder', name: 'Coder', icon: Code, desc: 'Code review & development' },
  { id: 'project-manager', name: 'Project Manager', icon: ClipboardList, desc: 'Planning & coordination' },
  { id: 'executive-assistant', name: 'Executive Assistant', icon: Mail, desc: 'Email, scheduling, briefs' },
  { id: 'sales-rep', name: 'Sales Rep', icon: Target, desc: 'Prospecting & outreach' },
  { id: 'marketer', name: 'Marketer', icon: Megaphone, desc: 'Campaigns & copy' },
] as const;

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', badge: null, keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', prefix: 'sk-', badge: null, keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google', name: 'Google', prefix: 'AI', badge: null, keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'mistral', name: 'Mistral', prefix: '', badge: null, keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', prefix: 'sk-', badge: null, keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'openrouter', name: 'OpenRouter', prefix: 'sk-or-', badge: 'Free models!', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'ollama', name: 'Local / Ollama', prefix: '', badge: 'No key needed', keyUrl: 'https://ollama.ai/download' },
] as const;

const VALUE_PROPS = [
  { icon: Brain, title: 'Remembers everything', desc: 'Persistent memory across all sessions' },
  { icon: Layers, title: 'Workspace-native', desc: 'One brain per project, fully isolated' },
  { icon: Wrench, title: 'Real tools', desc: 'Search, draft, code, plan — not just chat' },
];

/* ─── Transition variants ─── */
const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.2 },
};

/* ─── Main Component ─── */
const OnboardingWizard = ({ serverBaseUrl, state, onUpdate, onComplete, onDismiss, onFinish }: OnboardingWizardProps) => {
  const [step, setStep] = useState(state.step);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>();

  // Step-local state
  const [selectedTemplate, setSelectedTemplate] = useState(state.templateId || '');
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedPersona, setSelectedPersona] = useState(state.personaId || '');
  const [showCustomPersona, setShowCustomPersona] = useState(false);
  const [customPersonaName, setCustomPersonaName] = useState('');
  const [customPersonaDesc, setCustomPersonaDesc] = useState('');
  const [creatingPersona, setCreatingPersona] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keySaved, setKeySaved] = useState(false);

  const [importSource, setImportSource] = useState<'chatgpt' | 'claude' | null>(null);
  const [importData, setImportData] = useState<unknown>(null);
  const [importPreview, setImportPreview] = useState<unknown[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  // Connect on mount (silent)
  useEffect(() => {
    adapter.connect().catch(() => {});
  }, []);

  const goToStep = useCallback((n: number) => {
    setStep(n);
    onUpdate({ step: n });
  }, [onUpdate]);

  // Auto-advance for step 0 only (3s)
  useEffect(() => {
    if (step === 0) {
      autoTimer.current = setTimeout(() => goToStep(1), 3000);
      return () => clearTimeout(autoTimer.current);
    }
  }, [step, goToStep]);

  // Template -> persona auto-mapping
  useEffect(() => {
    if (selectedTemplate && TEMPLATE_PERSONA[selectedTemplate]) {
      setSelectedPersona(TEMPLATE_PERSONA[selectedTemplate]);
    }
  }, [selectedTemplate]);

  /* ─── Handlers ─── */
  const handleFileImport = async (file: File, source: 'chatgpt' | 'claude') => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setImportData(data);
      setImportSource(source);
      const res = await fetch(`${serverBaseUrl}/api/import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, source }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportPreview(result.knowledgeExtracted || []);
      }
    } catch { /* ignore parse errors */ }
  };

  const handleImportCommit = async () => {
    if (!importData || !importSource) return;
    setImporting(true);
    try {
      await fetch(`${serverBaseUrl}/api/import/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: importData, source: importSource }),
      });
      setImportDone(true);
      setTimeout(() => goToStep(3), 800);
    } catch { /* ignore */ }
    finally { setImporting(false); }
  };

  const handleCreateCustomPersona = async () => {
    if (!customPersonaName.trim()) return;
    setCreatingPersona(true);
    try {
      const res = await fetch(`${serverBaseUrl}/api/personas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customPersonaName,
          description: customPersonaDesc,
          systemPrompt: customPersonaDesc,
        }),
      });
      if (res.ok) {
        const persona = await res.json();
        setSelectedPersona(persona.id || customPersonaName.toLowerCase().replace(/\s+/g, '-'));
      }
    } catch {
      // Use local ID if backend is offline
      setSelectedPersona(customPersonaName.toLowerCase().replace(/\s+/g, '-'));
    }
    finally {
      setCreatingPersona(false);
      setShowCustomPersona(false);
    }
  };

  const handleValidateKey = async () => {
    setValidating(true);
    setKeyValid(null);
    try {
      await adapter.addVaultSecret({ key: `${selectedProvider.toUpperCase()}_API_KEY`, value: apiKey });
      const health = await adapter.getSystemHealth();
      const isHealthy = health.status === 'healthy';
      setKeyValid(isHealthy);
      setKeySaved(true);
      onUpdate({ apiKeySet: true });
    } catch {
      // Key couldn't be validated but we can still proceed
      setKeyValid(false);
      setKeySaved(false);
    } finally {
      setValidating(false);
    }
  };

  const handleFinish = async () => {
    setCreatingWorkspace(true);
    try {
      const template = TEMPLATES.find(t => t.id === selectedTemplate);
      const wsName = workspaceName || template?.name || 'Default Workspace';
      
      let wsId: string;
      try {
        const ws = await adapter.createWorkspace({
          name: wsName,
          group: 'Personal',
          persona: selectedPersona || undefined,
          templateId: selectedTemplate || undefined,
        });
        wsId = ws.id;
      } catch {
        // Create local workspace ID if backend is offline
        wsId = `local-${Date.now()}`;
      }
      
      onUpdate({
        workspaceId: wsId,
        templateId: selectedTemplate,
        personaId: selectedPersona,
      });
      goToStep(6);
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleLetsGo = useCallback(() => {
    clearTimeout(autoTimer.current);
    onComplete(serverBaseUrl);
    const template = TEMPLATES.find(t => t.id === (state.templateId || selectedTemplate));
    const hint = template?.hint || 'Hello! What can you help me with?';
    const wsId = state.workspaceId || `local-${Date.now()}`;
    onFinish(wsId, hint);
  }, [serverBaseUrl, onComplete, onFinish, state.workspaceId, state.templateId, selectedTemplate]);

  // Auto-finish step 6 after 2s
  useEffect(() => {
    if (step === 6) {
      autoTimer.current = setTimeout(handleLetsGo, 2000);
      return () => clearTimeout(autoTimer.current);
    }
  }, [step, handleLetsGo]);

  if (state.completed) return null;

  const progressPct = (step / 6) * 100;
  const displayStep = step >= 1 && step <= 5 ? step : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-background flex flex-col"
    >
      {/* Progress bar */}
      <div className="h-1 w-full bg-muted/30">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Top bar: step dots + skip */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {displayStep !== null && (
            <span className="text-xs font-display text-muted-foreground">
              Step {displayStep} of 5
            </span>
          )}
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i <= step ? 'bg-primary' : 'bg-muted/40'
                }`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-display"
        >
          Skip setup
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center px-6 overflow-y-auto">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {/* ═══ STEP 0: Welcome ═══ */}
            {step === 0 && (
              <motion.div
                key="step-0"
                {...fadeSlide}
                className="text-center cursor-pointer"
                onClick={() => { clearTimeout(autoTimer.current); goToStep(1); }}
              >
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <img
                    src={waggleLogo}
                    alt="Waggle"
                    className="w-24 h-24 rounded-2xl"
                    style={{
                      boxShadow: '0 0 60px hsl(38 92% 50% / 0.3)',
                    }}
                  />
                </div>
                <span className="inline-block text-[11px] font-display font-semibold tracking-[0.3em] uppercase text-primary mb-4">
                  Your AI Operating System
                </span>
                <h1 className="text-4xl font-display font-bold text-foreground mb-3">
                  Welcome to the Hive
                </h1>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8">
                  Persistent memory. Workspace-native. Built for knowledge work.
                </p>
                <span className="text-xs text-muted-foreground/60 animate-pulse">
                  Click anywhere to continue
                </span>
              </motion.div>
            )}

            {/* ═══ STEP 1: Why Waggle ═══ */}
            {step === 1 && (
              <motion.div key="step-1" {...fadeSlide} className="text-center">
                <Hexagon className="w-10 h-10 text-primary mx-auto mb-4" />
                <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                  Why Waggle?
                </h2>
                <p className="text-sm text-muted-foreground mb-8">
                  Not just another chatbot. A full operating system for your AI.
                </p>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  {VALUE_PROPS.map((vp) => (
                    <div
                      key={vp.title}
                      className="glass-strong rounded-xl p-5 text-left"
                    >
                      <vp.icon className="w-5 h-5 text-primary mb-3" />
                      <h3 className="text-sm font-display font-semibold text-foreground mb-1">
                        {vp.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">{vp.desc}</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => goToStep(2)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* ═══ STEP 2: Memory Import ═══ */}
            {step === 2 && (
              <motion.div key="step-2" {...fadeSlide}>
                <div className="text-center mb-6">
                  <Brain className="w-10 h-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                    Bring your AI memories
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Import conversation history from other AI assistants
                  </p>
                </div>

                {!importSource && !importDone && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                      { id: 'chatgpt' as const, name: 'ChatGPT Export', desc: 'Import from OpenAI' },
                      { id: 'claude' as const, name: 'Claude Export', desc: 'Import from Anthropic' },
                    ].map((src) => (
                      <label
                        key={src.id}
                        className="glass-strong rounded-xl p-5 cursor-pointer hover:border-primary/40 transition-colors text-left group"
                      >
                        <FileJson className="w-5 h-5 text-primary mb-2" />
                        <h3 className="text-sm font-display font-semibold text-foreground mb-1">
                          {src.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">{src.desc}</p>
                        <div className="flex items-center gap-1.5 text-xs text-primary group-hover:text-primary/80">
                          <Upload className="w-3 h-3" /> Choose .json file
                        </div>
                        <input
                          type="file"
                          accept=".json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileImport(file, src.id);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {importPreview.length > 0 && !importDone && (
                  <div className="glass-strong rounded-xl p-4 mb-6">
                    <h3 className="text-sm font-display font-semibold text-foreground mb-2">
                      Preview — {importPreview.length} items found
                    </h3>
                    <div className="max-h-32 overflow-y-auto space-y-1 mb-3">
                      {importPreview.slice(0, 10).map((item: any, i) => (
                        <div key={i} className="text-xs text-muted-foreground truncate">
                          • {item.title || item.content || JSON.stringify(item).slice(0, 60)}
                        </div>
                      ))}
                      {importPreview.length > 10 && (
                        <div className="text-xs text-muted-foreground/60">
                          …and {importPreview.length - 10} more
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleImportCommit}
                      disabled={importing}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors"
                    >
                      {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Import {importPreview.length} items
                    </button>
                  </div>
                )}

                {importDone && (
                  <div className="glass-strong rounded-xl p-4 mb-6 text-center">
                    <Check className="w-6 h-6 text-primary mx-auto mb-2" />
                    <p className="text-sm text-foreground font-display">Memories imported!</p>
                  </div>
                )}

                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => goToStep(1)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => goToStep(3)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {importDone ? 'Continue' : 'Skip this step'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 3: Choose Template ═══ */}
            {step === 3 && (
              <motion.div key="step-3" {...fadeSlide}>
                <div className="text-center mb-6">
                  <Sparkles className="w-10 h-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                    What are you working on?
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Choose a template to pre-configure your first workspace
                  </p>
                </div>

                {/* Agent explainer tip */}
                <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-display font-medium text-foreground mb-0.5">Template = What your agent knows</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      This sets the <span className="text-foreground font-medium">domain, tools, and goals</span> for your workspace. 
                      In the next step, you'll choose <span className="text-foreground font-medium">how</span> the agent works — its personality and style. Together, they define your agent.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-5">
                  {TEMPLATES.map((t) => {
                    const Icon = t.icon;
                    const selected = selectedTemplate === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedTemplate(t.id);
                          setWorkspaceName(t.id === 'blank' ? '' : t.name);
                        }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center ${
                          selected
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border/40 bg-secondary/20 hover:border-border'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-xs font-display font-medium ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedTemplate && (
                  <div className="mb-5">
                    <label className="text-xs font-display text-muted-foreground mb-1.5 block">Workspace name</label>
                    <input
                      value={workspaceName}
                      onChange={e => setWorkspaceName(e.target.value)}
                      placeholder="My workspace"
                      className="w-full bg-muted/30 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => goToStep(2)}
                    className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => goToStep(4)}
                    disabled={!selectedTemplate}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-40 transition-colors"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 4: Choose Persona ═══ */}
            {step === 4 && (
              <motion.div key="step-4" {...fadeSlide}>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                    How should I work?
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Choose a working style for your agent
                  </p>
                </div>

                {/* Agent explainer tip */}
                <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
                  <Brain className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-display font-medium text-foreground mb-0.5">Persona = How your agent thinks</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      This sets the agent's <span className="text-foreground font-medium">tone, reasoning style, and specialization</span>. 
                      Combined with the template you chose ({selectedTemplate ? TEMPLATES.find(t => t.id === selectedTemplate)?.name : 'Blank'}), this creates your unique agent.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  {ONBOARDING_PERSONAS.map((p) => {
                    const Icon = p.icon;
                    const selected = selectedPersona === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPersona(p.id); setShowCustomPersona(false); }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                          selected
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border/40 bg-secondary/20 hover:border-border'
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-xs font-display font-medium ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {p.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 leading-tight">{p.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {!showCustomPersona ? (
                  <button
                    onClick={() => setShowCustomPersona(true)}
                    className="w-full p-3 rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors font-display"
                  >
                    + Create Custom Persona
                  </button>
                ) : (
                  <div className="glass-strong rounded-xl p-4 space-y-3">
                    <input
                      value={customPersonaName}
                      onChange={e => setCustomPersonaName(e.target.value)}
                      placeholder="Persona name"
                      className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                    />
                    <textarea
                      value={customPersonaDesc}
                      onChange={e => setCustomPersonaDesc(e.target.value)}
                      placeholder="Describe how this persona should work…"
                      rows={3}
                      className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCustomPersona(false)}
                        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateCustomPersona}
                        disabled={!customPersonaName.trim() || creatingPersona}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors"
                      >
                        {creatingPersona ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Create Persona
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={() => goToStep(3)}
                    className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => goToStep(5)}
                    disabled={!selectedPersona}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-40 transition-colors"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 5: API Key ═══ */}
            {step === 5 && (
              <motion.div key="step-5" {...fadeSlide}>
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
                      onClick={() => { setSelectedProvider(prov.id); setApiKey(''); setKeyValid(null); setKeySaved(false); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                        selectedProvider === prov.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {prov.name}
                      {prov.badge && (
                        <span className="ml-1.5 text-[9px] opacity-75">({prov.badge})</span>
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
                        <input
                          type="password"
                          value={apiKey}
                          onChange={e => { setApiKey(e.target.value); setKeyValid(null); setKeySaved(false); }}
                          placeholder={PROVIDERS.find(p => p.id === selectedProvider)?.prefix ? `${PROVIDERS.find(p => p.id === selectedProvider)?.prefix}…` : 'Paste your API key'}
                          className="w-full bg-muted/30 border border-border/40 rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleValidateKey}
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
                        href={PROVIDERS.find(p => p.id === selectedProvider)?.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Get a {PROVIDERS.find(p => p.id === selectedProvider)?.name} API key
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={() => goToStep(4)}
                    className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={creatingWorkspace}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors glow-primary"
                  >
                    {creatingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    {creatingWorkspace ? 'Creating workspace…' : 'Create Workspace'}
                  </button>
                </div>

                <div className="text-center mt-3">
                  <button
                    onClick={handleFinish}
                    disabled={creatingWorkspace}
                    className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    Skip — I'll add a key later
                  </button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 6: Celebration ═══ */}
            {step === 6 && (
              <motion.div key="step-6" {...fadeSlide} className="text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                >
                  <div className="relative w-20 h-20 mx-auto mb-5">
                    <img
                      src={waggleLogo}
                      alt="Waggle"
                      className="w-20 h-20 rounded-2xl"
                      style={{ boxShadow: '0 0 60px hsl(38 92% 50% / 0.4)' }}
                    />
                  </div>
                  <h2 className="text-3xl font-display font-bold text-foreground mb-2">
                    Your hive is ready ⬡
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Your workspace is ready. Let's get to work.
                  </p>
                  <button
                    onClick={handleLetsGo}
                    className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors glow-primary"
                  >
                    🐝 Let's go!
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default OnboardingWizard;
