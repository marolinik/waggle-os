import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { adapter } from '@/lib/adapter';
import { captureOnboardingComplete } from '@/lib/posthog';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import type { OnboardingState } from '@/hooks/useOnboarding';
import type { UserProfile, ClassifiedHarvestItem } from '@/lib/types';
import {
  WelcomeStep,
  WhoAreYouStep,
  ModelGateStep,
  ImportStep,
  TemplateStep,
  FirstTaskStep,
} from './onboarding';
import type { OnboardingProfileFields } from './onboarding';
import { CURATED_ONBOARDING_TEMPLATES, TEMPLATE_PERSONA } from './onboarding/constants';

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

/* ─── PR5 6-step chain (S12→S17, C33) with the hard model gate at step 3.
   `ready` is terminal. All navigation is driven off STEP_NAMES.indexOf(name) —
   never a magic number — so re-keying the chain can't strand the user mid-flow.
   The model-gate sits between who-are-you and memory-import (D4 order: Welcome ·
   About-you · Model · Import · Template · First-task). */
const STEP_NAMES = ['first-launch', 'who-are-you', 'model-gate', 'memory-import', 'template', 'first-task'] as const;
type StepName = typeof STEP_NAMES[number];
const stepIndex = (name: StepName): number => STEP_NAMES.indexOf(name);
const LAST_INDEX = STEP_NAMES.length - 1;
/** Steps that show the Back affordance + numbered dots (every interactive step
 *  after first-launch, excluding the terminal first-task). */
const FIRST_NAV_INDEX = stepIndex('who-are-you');
const LAST_NAV_INDEX = stepIndex('template');

const DEFAULT_FIRST_MESSAGE = 'Hello! What can you help me with?';

/* ─── Main Component (shell) ─── */
const OnboardingWizard = ({ serverBaseUrl, state, onUpdate, onComplete, onDismiss, onFinish }: OnboardingWizardProps) => {
  // Resume guard: a pre-rework interrupted session could have persisted a
  // `state.step` (5-7) that no longer maps to the re-keyed 5-step chain. Clamp
  // into [0, LAST_INDEX] so resume always lands on a renderable step rather
  // than a blank screen. `?forceWizard=true` already resets step to 0.
  const [step, setStep] = useState(() => Math.min(Math.max(state.step, 0), LAST_INDEX));
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const offline = useOfflineStatus();

  /* ── Profile (S13 / B8) ── */
  const [profile, setProfile] = useState<OnboardingProfileFields>({
    name: '', role: '', industry: '', workType: '', teamSize: '', goals: [],
  });
  const [savingProfile, setSavingProfile] = useState(false);

  /* ── Import (S15 / C33) ── */
  const [importSource, setImportSource] = useState<string | null>(null);
  const [importData, setImportData] = useState<unknown>(null);
  const [importItems, setImportItems] = useState<ClassifiedHarvestItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [claudeCodeDetected, setClaudeCodeDetected] = useState<{ found: boolean; itemCount: number; path: string } | null>(null);

  /* ── Workspace + first task (PR5 Template → First-task steps) ── */
  const [workspaceName, setWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState(DEFAULT_FIRST_MESSAGE);

  /* ── Connect on mount + track start; hydrate any existing profile ── */
  useEffect(() => {
    adapter.connect().catch(() => {});
    trackTelemetry(serverBaseUrl, 'onboarding_start');
    let cancelled = false;
    (async () => {
      try {
        const p = (await adapter.getProfile()) as UserProfile | null;
        if (cancelled || !p) return;
        setProfile(prev => ({
          name: p.name ?? prev.name,
          role: p.role ?? prev.role,
          industry: p.industry ?? prev.industry,
          workType: p.workType ?? prev.workType,
          teamSize: p.teamSize ?? prev.teamSize,
          goals: p.goals ?? prev.goals ?? [],
        }));
      } catch { /* sidecar not ready — start with empty profile */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── A11y (WCAG 2.1.1): Escape maps to Skip. Clears any pending timer. ── */
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

  const goToStep = useCallback((n: number) => {
    setStep(n);
    onUpdate({ step: n });
    trackTelemetry(serverBaseUrl, 'onboarding_step', { step: n, stepName: STEP_NAMES[n] ?? `step-${n}` });
  }, [onUpdate, serverBaseUrl]);

  const goToName = useCallback((name: StepName) => goToStep(stepIndex(name)), [goToStep]);

  /* ── S13 / B8: write profile AND seed identity in one Continue. ── */
  const handleProfileContinue = useCallback(async () => {
    setSavingProfile(true);
    try {
      const payload: Partial<OnboardingProfileFields> = {
        name: profile.name?.trim() || undefined,
        role: profile.role?.trim() || undefined,
        industry: profile.industry || undefined,
        workType: profile.workType || undefined,
        teamSize: profile.teamSize || undefined,
        goals: profile.goals && profile.goals.length > 0 ? profile.goals : undefined,
      };
      try {
        await adapter.updateProfile(payload as Record<string, unknown>);
        // B8: seed the per-mind identity so the Home cockpit greets by name.
        await adapter.setIdentity({
          name: payload.name,
          role: payload.role,
          department: payload.industry,
        });
        onUpdate({ profileSeeded: true });
      } catch { /* sidecar offline — proceed; profile can be set later in My Profile */ }
      trackTelemetry(serverBaseUrl, 'onboarding_profile_seeded', {
        hasName: Boolean(payload.name),
        hasRole: Boolean(payload.role),
        goalCount: payload.goals?.length ?? 0,
      });
      goToName('model-gate');
    } finally {
      setSavingProfile(false);
    }
  }, [profile, onUpdate, serverBaseUrl, goToName]);

  /* ── S15 / C33: file import → classified preview ── */
  const handleFileImport = async (file: File, source: string) => {
    try {
      const text = await file.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      setImportData(data);
      setImportSource(source);
      const result = await adapter.harvestPreview(data, source);
      const items = (result?.items ?? result?.preview ?? []) as ClassifiedHarvestItem[];
      setImportItems(items);
    } catch { /* ignore parse errors */ }
  };

  // C33: commit-all default — every item lands `status:'unreviewed'` server-side.
  const handleImportCommit = async () => {
    if (!importData || !importSource) return;
    setImporting(true);
    try {
      await adapter.harvestCommit(importData, importSource);
      setImportDone(true);
      setTimeout(() => goToName('template'), 800);
    } catch { /* ignore */ }
    finally { setImporting(false); }
  };

  /* ── Claude Code auto-detect on mount ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adapter.scanClaudeCode();
        if (!cancelled) setClaudeCodeDetected(data);
      } catch { /* sidecar offline — banner stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleClaudeCodeHarvest = async () => {
    setImporting(true);
    setImportSource('claude-code');
    try {
      await adapter.harvestCommit({ scanLocal: true }, 'claude-code');
      setImportDone(true);
      setTimeout(() => goToName('template'), 800);
    } catch { /* ignore */ }
    finally { setImporting(false); }
  };

  /* ── PR5 Template step: create the first workspace from the chosen template
       (matching specialist persona + template id), then seed the first task. The
       template names + types the workspace (D4 folds the old workspace-create step). ── */
  const handleCreateFromTemplate = useCallback(async (templateId: string) => {
    const tmpl = CURATED_ONBOARDING_TEMPLATES.find(t => t.id === templateId);
    const persona = TEMPLATE_PERSONA[templateId] ?? 'general-purpose';
    const wsName = tmpl?.name || 'My Workspace';
    setCreatingWorkspace(true);
    setCreatingTemplateId(templateId);
    try {
      let wsId: string;
      try {
        const ws = await adapter.createWorkspace({
          name: wsName,
          group: 'Personal',
          type: 'project',
          persona,
          templateId,
        });
        wsId = ws.id;
        setCreateError(null);
      } catch {
        setCreateError('Could not connect to server — workspace created locally. Connect to sync later.');
        wsId = `local-${Date.now()}`;
      }
      setWorkspaceName(wsName);
      // Seed the first task with the template's hint — the user can edit it.
      setFirstMessage(tmpl?.hint?.trim() || DEFAULT_FIRST_MESSAGE);
      onUpdate({ workspaceId: wsId, personaId: persona });
      trackTelemetry(serverBaseUrl, 'onboarding_complete', { templateId, importedMemory: importDone });
      captureOnboardingComplete({ templateId, personaId: persona, model: null });
      goToName('first-task');
    } finally {
      setCreatingWorkspace(false);
      setCreatingTemplateId(null);
    }
  }, [importDone, onUpdate, serverBaseUrl, goToName]);

  const handleLetsGo = useCallback(() => {
    clearTimeout(autoTimer.current);
    onComplete(serverBaseUrl);
    const wsId = state.workspaceId || `local-${Date.now()}`;
    const wsName = workspaceName.trim() || 'My Workspace';
    const personaId = state.personaId || 'general-purpose';
    onFinish(wsId, wsName, firstMessage.trim() || DEFAULT_FIRST_MESSAGE, personaId);
  }, [serverBaseUrl, onComplete, onFinish, state.workspaceId, state.personaId, workspaceName, firstMessage]);

  if (state.completed) return null;

  const progressPct = LAST_INDEX > 0 ? (step / LAST_INDEX) * 100 : 0;
  const showNavChrome = step >= FIRST_NAV_INDEX && step <= LAST_NAV_INDEX;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="region"
      aria-label="Waggle onboarding"
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Progress bar — carries the semantic progress signal for screen readers */}
      <div
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={0}
        aria-valuemax={LAST_INDEX}
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
          {showNavChrome && (
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
          {showNavChrome && (
            <span className="text-xs font-display text-muted-foreground">
              Step {step - FIRST_NAV_INDEX + 1} of {LAST_NAV_INDEX - FIRST_NAV_INDEX + 1}
            </span>
          )}
          {showNavChrome && (
            <div className="flex gap-1.5" aria-hidden="true">
              {STEP_NAMES.slice(FIRST_NAV_INDEX, LAST_NAV_INDEX + 1).map((_, idx) => {
                const navStep = FIRST_NAV_INDEX + idx;
                return (
                  <div
                    key={navStep}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      navStep <= step ? 'bg-primary' : 'bg-muted/40'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            trackTelemetry(serverBaseUrl, 'onboarding_skip', { atStep: step });
            onDismiss();
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-display px-3 py-2 rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Skip setup
        </button>
      </div>

      {/* Content area — renders current step by NAME */}
      <div className="flex-1 flex items-center justify-center px-6 overflow-y-auto">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {step === stepIndex('first-launch') && (
              <WelcomeStep
                onClickAnywhere={() => { clearTimeout(autoTimer.current); goToName('who-are-you'); }}
                offline={offline}
              />
            )}
            {step === stepIndex('who-are-you') && (
              <WhoAreYouStep
                profile={profile}
                onChange={(patch) => setProfile(prev => ({ ...prev, ...patch }))}
                onContinue={handleProfileContinue}
                onBack={() => goToName('first-launch')}
                saving={savingProfile}
              />
            )}
            {step === stepIndex('model-gate') && (
              <ModelGateStep
                onContinue={() => goToName('memory-import')}
                onBack={() => goToName('who-are-you')}
                onLater={() => {
                  clearTimeout(autoTimer.current);
                  trackTelemetry(serverBaseUrl, 'onboarding_skip', { atStep: step, via: 'model-gate-later' });
                  onDismiss();
                }}
              />
            )}
            {step === stepIndex('memory-import') && (
              <ImportStep
                importSource={importSource}
                importItems={importItems}
                importDone={importDone}
                importing={importing}
                onFileImport={handleFileImport}
                onImportCommit={handleImportCommit}
                claudeCodeDetected={claudeCodeDetected}
                onClaudeCodeHarvest={handleClaudeCodeHarvest}
                onBack={() => goToName('model-gate')}
                onContinue={() => goToName('template')}
              />
            )}
            {step === stepIndex('template') && (
              <TemplateStep
                templates={CURATED_ONBOARDING_TEMPLATES}
                onSelect={handleCreateFromTemplate}
                onBack={() => goToName('memory-import')}
                creating={creatingWorkspace}
                creatingId={creatingTemplateId}
                createError={createError}
              />
            )}
            {step === stepIndex('first-task') && (
              <FirstTaskStep
                message={firstMessage}
                onMessageChange={setFirstMessage}
                suggestions={CURATED_ONBOARDING_TEMPLATES.map(t => t.hint)}
                onPickSuggestion={setFirstMessage}
                onLetsGo={handleLetsGo}
                createError={createError}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default OnboardingWizard;
