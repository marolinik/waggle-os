import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UserTier } from '@/lib/dock-tiers';
import { adapter } from '@/lib/adapter';
import type { OnboardingState } from '@/hooks/useOnboarding';
import { TEMPLATES, TEMPLATE_PERSONA } from './onboarding/constants';
import { SKIP_SETUP_DEFAULTS } from '@/lib/onboarding-skip';
import {
  WelcomeStep,
  WhyWaggleStep,
  TierStep,
  ImportStep,
  TemplateStep,
  PersonaStep,
  ModelTierStep,
  ReadyStep,
} from './onboarding';

/* ─── Props ─── */
interface OnboardingWizardProps {
  serverBaseUrl: string;
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onComplete: (serverBaseUrl: string) => void;
  onDismiss: () => void;
  onFinish: (workspaceId: string, workspaceName: string, firstMessage: string, personaId?: string) => void;
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

  // M-10: source widened from chatgpt|claude to the harvest UniversalAdapter
  // source set so onboarding can accept Gemini/Perplexity/Cursor/Claude Code.
  const [importSource, setImportSource] = useState<string | null>(null);
  const [importData, setImportData] = useState<unknown>(null);
  const [importPreview, setImportPreview] = useState<unknown[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  // M-10: Claude Code auto-detect status (mirrors HarvestTab pattern). Banner
  // surfaces above source tiles when found so users see "we already see your
  // history" before they bother choosing a tile.
  const [claudeCodeDetected, setClaudeCodeDetected] = useState<{ found: boolean; itemCount: number; path: string } | null>(null);

  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /* ── Connect on mount + track start ── */
  useEffect(() => {
    adapter.connect().catch(() => {});
    trackTelemetry(serverBaseUrl, 'onboarding_start');
  }, []);

  /* ── A11y audit (WCAG 2.1.1): Escape maps to Skip for the full-screen wizard.
       Gives keyboard users a predictable exit. Clears auto-advance timer to
       prevent focus jumping after dismiss. ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimeout(autoTimer.current);
        trackTelemetry(serverBaseUrl, 'onboarding_skip', { atStep: step, via: 'escape' });
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onDismiss, serverBaseUrl]);

  /* ── Bug #3: detect existing API key in vault on mount, so we don't
       re-prompt the user for a key they already configured. Any secret
       whose name matches the selected provider (case-insensitive match
       on either `anthropic` or `ANTHROPIC_API_KEY`) counts. ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vault = await adapter.getVault() as { secrets?: Array<{ name: string }> };
        if (cancelled) return;
        const wantedNames = [
          selectedProvider.toLowerCase(),
          `${selectedProvider.toUpperCase()}_API_KEY`,
        ];
        const alreadyHasKey = vault?.secrets?.some(s =>
          wantedNames.some(w => s.name.toLowerCase() === w.toLowerCase())
        );
        if (alreadyHasKey) {
          console.info(`[OnboardingWizard] vault already has ${selectedProvider} key — marking step 6 complete`);
          setKeyValid(true);
          setKeySaved(true);
          onUpdate({ apiKeySet: true });
        }
      } catch {
        /* sidecar not ready or no vault — leave the step in its default state */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

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
  // M-10: switched from /api/import/* to /api/harvest/* so onboarding shares
  // the same UniversalAdapter pipeline as MemoryApp's HarvestTab. The harvest
  // preview shape is `{ source, itemCount, types, preview: [{id, title, type}] }`
  // so we surface `result.preview` instead of the legacy `knowledgeExtracted`.
  // Falls back to raw text for non-JSON sources (Cursor pastes, markdown, txt).
  const handleFileImport = async (file: File, source: string) => {
    try {
      const text = await file.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      setImportData(data);
      setImportSource(source);
      const result = await adapter.harvestPreview(data, source);
      setImportPreview(result.preview || []);
    } catch { /* ignore parse errors */ }
  };

  const handleImportCommit = async () => {
    if (!importData || !importSource) return;
    setImporting(true);
    try {
      await adapter.harvestCommit(importData, importSource);
      setImportDone(true);
      setTimeout(() => goToStep(4), 800);
    } catch { /* ignore */ }
    finally { setImporting(false); }
  };

  // M-10: Claude Code auto-detect on mount. If found, ImportStep shows a
  // banner with a one-click harvest button so users with Claude Code
  // installed don't have to figure out the file-export dance.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adapter.scanClaudeCode();
        if (!cancelled) setClaudeCodeDetected(data);
      } catch { /* sidecar offline — banner just stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleClaudeCodeHarvest = async () => {
    setImporting(true);
    setImportSource('claude-code');
    try {
      await adapter.harvestCommit({ scanLocal: true }, 'claude-code');
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

  /**
   * M-18 / UX-1 — "Skip and set me up" escape hatch from WhyWaggle.
   * Applies SKIP_SETUP_DEFAULTS (blank template, general-purpose persona)
   * and lands on the Ready step after workspace creation. Bypasses the
   * state-driven handleFinish path because React setState is async and
   * handleFinish reads selectedTemplate/selectedPersona from closure.
   */
  const handleSkipSetup = useCallback(async () => {
    setCreatingWorkspace(true);
    try {
      setSelectedTemplate(SKIP_SETUP_DEFAULTS.templateId);
      setSelectedPersona(SKIP_SETUP_DEFAULTS.personaId);
      let wsId: string;
      try {
        const ws = await adapter.createWorkspace({
          name: SKIP_SETUP_DEFAULTS.workspaceName,
          group: SKIP_SETUP_DEFAULTS.group,
          persona: SKIP_SETUP_DEFAULTS.personaId,
          templateId: SKIP_SETUP_DEFAULTS.templateId,
        });
        wsId = ws.id;
        setCreateError(null);
      } catch {
        setCreateError('Could not connect to server — workspace created locally. Connect to sync later.');
        wsId = `local-${Date.now()}`;
      }
      onUpdate({
        workspaceId: wsId,
        templateId: SKIP_SETUP_DEFAULTS.templateId,
        personaId: SKIP_SETUP_DEFAULTS.personaId,
      });
      trackTelemetry(serverBaseUrl, 'onboarding_skip_setup', {
        atStep: step,
        templateId: SKIP_SETUP_DEFAULTS.templateId,
        personaId: SKIP_SETUP_DEFAULTS.personaId,
      });
      goToStep(7);
    } finally {
      setCreatingWorkspace(false);
    }
  }, [goToStep, onUpdate, serverBaseUrl, step]);

  const handleFinish = async (selectedModel?: string) => {
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
          ...(selectedModel ? { model: selectedModel } : {}),
        });
        wsId = ws.id;
        setCreateError(null);
      } catch {
        setCreateError('Could not connect to server — workspace created locally. Connect to sync later.');
        wsId = `local-${Date.now()}`;
      }

      // Persist the chosen model as the server's default so the chat
      // route and future workspaces inherit it.
      if (selectedModel) {
        try { await adapter.saveSettings({ defaultModel: selectedModel } as any); } catch { /* non-blocking */ }
      }

      onUpdate({
        workspaceId: wsId,
        templateId: selectedTemplate,
        personaId: selectedPersona,
      });
      trackTelemetry(serverBaseUrl, 'onboarding_complete', {
        templateId: selectedTemplate || null,
        personaId: selectedPersona || null,
        model: selectedModel ?? null,
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
    // Bug #4: pass the workspace name through so the chat window doesn't
    // open with an empty title. We prefer the user-entered name, fall back
    // to the template name, and finally to a readable default.
    const wsName = workspaceName || template?.name || 'My Workspace';
    // P1 fix: forward the persona explicitly so Desktop's openChatForWorkspace
    // can seed the first window with it. Without this, useWindowManager looks
    // up the workspace in its (stale) closure list and falls back to
    // 'general-purpose'. Prefer onboarding state (latest persisted value) over
    // the local selectedPersona ref so manual restarts pick up the right id.
    const personaId = state.personaId || selectedPersona || undefined;
    onFinish(wsId, wsName, hint, personaId);
  }, [serverBaseUrl, onComplete, onFinish, state.workspaceId, state.templateId, state.personaId, selectedTemplate, selectedPersona, workspaceName]);

  /* ── Bug #3: if the vault pre-check already saved a key before the
       user reaches step 6, auto-advance straight past the API-key
       screen. No re-prompting for a key they already configured. ── */
  useEffect(() => {
    if (step !== 6) return;
    if (!keySaved) return;
    if (creatingWorkspace) return;
    handleFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, keySaved]);

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
      role="region"
      aria-label="Waggle onboarding"
      // FR #33: PM walkthrough on 2026-05-01 surfaced the desktop wallpaper +
      // Chat + LoginBriefing bleeding through step 1. Initial fix attempted
      // Tailwind utilities (`bg-black/85 backdrop-blur-md`) but the bleed-
      // through persisted — likely Tailwind v3 JIT serving stale CSS for a
      // class string that was new in this file. Inline style bypasses the
      // scanner entirely so the backdrop is deterministic regardless of any
      // Vite HMR cache state, theme token alpha, or build pipeline quirk.
      // -webkit- prefix carried for Safari/older Tauri WebView2 builds.
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Progress bar — A11y audit #2: carries the semantic progress signal for screen readers */}
      <div
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={7}
        aria-label="Onboarding progress"
        className="h-1 w-full bg-muted/30"
      >
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Top bar: step dots + back + skip */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {/* QW-4: Back button on steps 2-6 so users can revise earlier choices
              without losing their progress. Step 1 (why-waggle) is the first
              real step — no point going back to the auto-advancing welcome. */}
          {step >= 2 && step <= 6 && (
            <button
              onClick={() => {
                clearTimeout(autoTimer.current);
                goToStep(step - 1);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-display px-3 py-2 rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Go to previous step"
            >
              ← Back
            </button>
          )}
          {displayStep !== null && (
            // FR #34: previously "Step X of 6" — but step 6 (API key) auto-skips
            // when the vault already has a key for the selected provider, so a
            // returning user only sees 5 interactive steps. The fixed "of 6"
            // would mislabel the total. Dots below carry the progress signal;
            // dropping the explicit total avoids the mismatch and removes the
            // PM-visible "CC said 8, screen says 6" friction without churning
            // every visible-step caller.
            <span className="text-xs font-display text-muted-foreground">
              Step {displayStep}
            </span>
          )}
          {/* A11y audit #6: render 6 dots matching the "of 6" label (was 8, confusing).
              Decorative — the progressbar above carries the semantic. */}
          {displayStep !== null && (
            <div className="flex gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i <= step ? 'bg-primary' : 'bg-muted/40'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            trackTelemetry(serverBaseUrl, 'onboarding_skip', { atStep: step });
            onDismiss();
          }}
          /* A11y audit #12: touch target ≥44×44 via padding. Was raw text-xs with no padding. */
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-display px-3 py-2 rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
            {step === 1 && (
              <WhyWaggleStep
                goToStep={goToStep}
                onSkipSetup={handleSkipSetup}
                skipDisabled={creatingWorkspace}
              />
            )}
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
                claudeCodeDetected={claudeCodeDetected}
                onClaudeCodeHarvest={handleClaudeCodeHarvest}
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
              <ModelTierStep
                creatingWorkspace={creatingWorkspace}
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
