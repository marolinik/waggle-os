import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserTier } from '@/lib/dock-tiers';
import { adapter } from '@/lib/adapter';
import type { OnboardingState } from '@/hooks/useOnboarding';
import { TEMPLATES, TEMPLATE_PERSONA } from './onboarding/constants';
import {
  WelcomeStep,
  WhyWaggleStep,
  TierStep,
  ImportStep,
  TemplateStep,
  PersonaStep,
  ApiKeyStep,
  ReadyStep,
} from './onboarding';

/* ─── Props ─── */
interface OnboardingWizardProps {
  serverBaseUrl: string;
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onComplete: (serverBaseUrl: string) => void;
  onDismiss: () => void;
  onFinish: (workspaceId: string, firstMessage: string) => void;
}

/* ─── M2-7: Fire-and-forget telemetry via adapter ─── */
function trackTelemetry(_serverBaseUrl: string, event: string, properties?: Record<string, unknown>) {
  adapter.trackTelemetry(event, properties);
}

const STEP_NAMES = ['welcome', 'why-waggle', 'tier', 'memory-import', 'template', 'persona', 'api-key', 'ready'];

/* ─── Main Component (shell) ─── */
const OnboardingWizard = ({ serverBaseUrl, state, onUpdate, onComplete, onDismiss, onFinish }: OnboardingWizardProps) => {
  const [step, setStep] = useState(state.step);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>();

  /* ── Step-local state ── */
  const [selectedTier, setSelectedTier] = useState<UserTier>(state.tier || 'professional');
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
  const [createError, setCreateError] = useState<string | null>(null);

  /* ── Connect on mount + track start ── */
  useEffect(() => {
    adapter.connect().catch(() => {});
    trackTelemetry(serverBaseUrl, 'onboarding_start');
  }, []);

  const goToStep = useCallback((n: number) => {
    setStep(n);
    onUpdate({ step: n });
    trackTelemetry(serverBaseUrl, 'onboarding_step', { step: n, stepName: STEP_NAMES[n] ?? `step-${n}` });
  }, [onUpdate, serverBaseUrl]);

  /* ── Auto-advance for step 0 (3s) ── */
  useEffect(() => {
    if (step === 0) {
      autoTimer.current = setTimeout(() => goToStep(1), 3000);
      return () => clearTimeout(autoTimer.current);
    }
  }, [step, goToStep]);

  /* ── Template -> persona auto-mapping ── */
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
      const result = await adapter.importPreview(data, source);
      setImportPreview(result.knowledgeExtracted || []);
    } catch { /* ignore parse errors */ }
  };

  const handleImportCommit = async () => {
    if (!importData || !importSource) return;
    setImporting(true);
    try {
      await adapter.importCommit(importData, importSource);
      setImportDone(true);
      setTimeout(() => goToStep(4), 800);
    } catch { /* ignore */ }
    finally { setImporting(false); }
  };

  const handleCreateCustomPersona = async () => {
    if (!customPersonaName.trim()) return;
    setCreatingPersona(true);
    try {
      const persona = await adapter.createPersona({
        name: customPersonaName,
        description: customPersonaDesc,
        systemPrompt: customPersonaDesc,
      });
      setSelectedPersona(persona.id || customPersonaName.toLowerCase().replace(/\s+/g, '-'));
    } catch {
      setSelectedPersona(customPersonaName.toLowerCase().replace(/\s+/g, '-'));
    }
    finally {
      setCreatingPersona(false);
      setShowCustomPersona(false);
    }
  };

  const handleSelectProvider = (id: string) => {
    setSelectedProvider(id);
    setApiKey('');
    setKeyValid(null);
    setKeySaved(false);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    setKeyValid(null);
    setKeySaved(false);
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
      setKeyValid(false);
      setKeySaved(false);
    } finally {
      setValidating(false);
    }
  };

  const handleSelectTemplate = (id: string, name: string) => {
    setSelectedTemplate(id);
    setWorkspaceName(name);
  };

  const handleSelectTier = (tier: UserTier) => {
    onUpdate({ tier });
    setSelectedTier(tier);
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
        setCreateError(null);
      } catch {
        setCreateError('Could not connect to server — workspace created locally. Connect to sync later.');
        wsId = `local-${Date.now()}`;
      }

      onUpdate({
        workspaceId: wsId,
        templateId: selectedTemplate,
        personaId: selectedPersona,
      });
      trackTelemetry(serverBaseUrl, 'onboarding_complete', {
        templateId: selectedTemplate || null,
        personaId: selectedPersona || null,
        apiKeySet: !!keySaved,
      });
      goToStep(7);
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

  /* ── Auto-finish step 7 after 2s ── */
  useEffect(() => {
    if (step === 7) {
      autoTimer.current = setTimeout(handleLetsGo, 2000);
      return () => clearTimeout(autoTimer.current);
    }
  }, [step, handleLetsGo]);

  if (state.completed) return null;

  const progressPct = (step / 7) * 100;
  const displayStep = step >= 1 && step <= 6 ? step : null;

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
              Step {displayStep} of 6
            </span>
          )}
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
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
          onClick={() => {
            trackTelemetry(serverBaseUrl, 'onboarding_skip', { atStep: step });
            onDismiss();
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-display"
        >
          Skip setup
        </button>
      </div>

      {/* Content area — renders current step */}
      <div className="flex-1 flex items-center justify-center px-6 overflow-y-auto">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <WelcomeStep
                goToStep={goToStep}
                onClickAnywhere={() => { clearTimeout(autoTimer.current); goToStep(1); }}
              />
            )}
            {step === 1 && <WhyWaggleStep goToStep={goToStep} />}
            {step === 2 && (
              <TierStep
                selectedTier={selectedTier}
                onSelectTier={handleSelectTier}
                goToStep={goToStep}
              />
            )}
            {step === 3 && (
              <ImportStep
                importSource={importSource}
                importPreview={importPreview}
                importDone={importDone}
                importing={importing}
                onFileImport={handleFileImport}
                onImportCommit={handleImportCommit}
                goToStep={goToStep}
              />
            )}
            {step === 4 && (
              <TemplateStep
                selectedTemplate={selectedTemplate}
                workspaceName={workspaceName}
                onSelectTemplate={handleSelectTemplate}
                onWorkspaceNameChange={setWorkspaceName}
                goToStep={goToStep}
              />
            )}
            {step === 5 && (
              <PersonaStep
                selectedTemplate={selectedTemplate}
                selectedPersona={selectedPersona}
                onSelectPersona={setSelectedPersona}
                showCustomPersona={showCustomPersona}
                onToggleCustomPersona={setShowCustomPersona}
                customPersonaName={customPersonaName}
                customPersonaDesc={customPersonaDesc}
                onCustomPersonaNameChange={setCustomPersonaName}
                onCustomPersonaDescChange={setCustomPersonaDesc}
                onCreateCustomPersona={handleCreateCustomPersona}
                creatingPersona={creatingPersona}
                goToStep={goToStep}
              />
            )}
            {step === 6 && (
              <ApiKeyStep
                selectedProvider={selectedProvider}
                apiKey={apiKey}
                validating={validating}
                keyValid={keyValid}
                keySaved={keySaved}
                creatingWorkspace={creatingWorkspace}
                onSelectProvider={handleSelectProvider}
                onApiKeyChange={handleApiKeyChange}
                onValidateKey={handleValidateKey}
                onFinish={handleFinish}
                goToStep={goToStep}
              />
            )}
            {step === 7 && (
              <ReadyStep
                createError={createError}
                onLetsGo={handleLetsGo}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default OnboardingWizard;
