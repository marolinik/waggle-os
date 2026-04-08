/**
 * OnboardingWizard — premium first-run experience for new Waggle users.
 *
 * 8 steps: Welcome → Why Waggle → Memory Import → Template → Persona → API Key → Tier Selection → Hive Ready
 * Full-screen overlay with smooth transitions. Goal: "wow" within 60 seconds.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { HiveIcon, BeeImage } from '@/components/HiveIcon';
import type { OnboardingState } from '@/hooks/useOnboarding';

// ── Constants ───────────────────────────────────────────────────────

const TEMPLATES = [
  { id: 'strategy-consulting', name: 'Strategy & Consulting', icon: '🏛️', hint: 'Build a competitive landscape for my market', desc: 'Frameworks, research, client deliverables' },
  { id: 'legal-compliance', name: 'Legal & Compliance', icon: '⚖️', hint: 'Review this contract for non-standard clauses', desc: 'Contract review, legal research, compliance' },
  { id: 'finance-investment', name: 'Finance & Investment', icon: '💹', hint: 'Analyze this company\'s financials and valuation', desc: 'Modelling, due diligence, investment research' },
  { id: 'sales-bizdev', name: 'Sales & Business Dev', icon: '🤝', hint: 'Research this prospect and draft a personalised outreach', desc: 'Prospect research, outreach, pipeline management' },
  { id: 'marketing-brand', name: 'Marketing & Brand', icon: '📣', hint: 'Draft a campaign brief for our product launch', desc: 'Content, campaigns, brand voice, copy' },
  { id: 'product-management', name: 'Product Management', icon: '🗺️', hint: 'Help me write a PRD for my next feature', desc: 'PRDs, roadmaps, user research synthesis' },
  { id: 'operations-process', name: 'Operations & Process', icon: '⚙️', hint: 'Map and improve this operational workflow', desc: 'Process design, SOPs, efficiency analysis' },
  { id: 'hr-people', name: 'HR & People', icon: '👥', hint: 'Write a job description for a senior engineer', desc: 'JDs, policies, performance, L&D' },
  { id: 'research-intelligence', name: 'Research & Intelligence', icon: '🔬', hint: 'Deep research on this topic with source triangulation', desc: 'Multi-source research, synthesis, briefings' },
  { id: 'executive-leadership', name: 'Executive & Leadership', icon: '🎯', hint: 'Prepare my board update for next week', desc: 'Briefings, comms, strategic decisions' },
  { id: 'technology-engineering', name: 'Technology & Engineering', icon: '💻', hint: 'Review my codebase and tell me what you see', desc: 'Code review, debugging, architecture' },
  { id: 'startup-founder', name: 'Startup & Founder', icon: '🚀', hint: 'Help me structure my Series A pitch narrative', desc: 'Fundraising, PMF, all-hands execution' },
  { id: 'independent-consultant', name: 'Independent Consultant', icon: '🎓', hint: 'Draft a proposal for this client engagement', desc: 'Proposals, client work, business development' },
  { id: 'government-policy', name: 'Government & Policy', icon: '🏛️', hint: 'Draft a policy brief on this issue', desc: 'Policy briefs, regulatory analysis, stakeholder comms' },
  { id: 'personal-productivity', name: 'Personal Productivity', icon: '✨', hint: 'Help me think through this decision', desc: 'Personal knowledge, writing, learning, life admin' },
];

const PERSONAS = [
  // Universal Modes
  { id: 'general-purpose', name: 'General Purpose', icon: '🧠', desc: 'Adapts to any task' },
  { id: 'planner', name: 'Planner', icon: '🗂️', desc: 'Strategic planning — read only' },
  { id: 'researcher', name: 'Researcher', icon: '🔬', desc: 'Deep investigation & synthesis' },
  { id: 'analyst', name: 'Analyst', icon: '📊', desc: 'Data analysis & structured evaluation' },
  { id: 'writer', name: 'Writer', icon: '✍️', desc: 'Long-form content & editing' },
  { id: 'verifier', name: 'Verifier', icon: '🔍', desc: 'Adversarial quality assurance' },
  { id: 'coordinator', name: 'Coordinator', icon: '🎛️', desc: 'Multi-agent orchestration' },
  { id: 'coder', name: 'Coder', icon: '💻', desc: 'Code review & development' },
  // Domain Specialists
  { id: 'legal-professional', name: 'Legal Counsel', icon: '⚖️', desc: 'Contracts, compliance, legal research' },
  { id: 'finance-owner', name: 'Financial Advisor', icon: '💰', desc: 'Financial analysis & modelling' },
  { id: 'sales-rep', name: 'Sales Strategist', icon: '🎯', desc: 'Prospecting, outreach, pipeline' },
  { id: 'marketer', name: 'Marketing Strategist', icon: '📢', desc: 'Campaigns, copy, brand voice' },
  { id: 'project-manager', name: 'Project Manager', icon: '📋', desc: 'Planning, tracking, coordination' },
  { id: 'executive-assistant', name: 'Executive Assistant', icon: '📧', desc: 'Briefings, comms, scheduling' },
  { id: 'hr-manager', name: 'HR Specialist', icon: '👥', desc: 'People ops, policies, talent' },
  { id: 'product-manager-senior', name: 'Product Manager', icon: '🗺️', desc: 'PRDs, roadmaps, product thinking' },
  { id: 'consultant', name: 'Operations Manager', icon: '⚙️', desc: 'Process design, SOPs, efficiency' },
];

const TEMPLATE_PERSONA: Record<string, string> = {
  'strategy-consulting':    'consultant',
  'legal-compliance':       'legal-professional',
  'finance-investment':     'finance-owner',
  'sales-bizdev':           'sales-rep',
  'marketing-brand':        'marketer',
  'product-management':     'product-manager-senior',
  'operations-process':     'consultant',
  'hr-people':              'hr-manager',
  'research-intelligence':  'researcher',
  'executive-leadership':   'executive-assistant',
  'technology-engineering': 'coder',
  'startup-founder':        'general-purpose',
  'independent-consultant': 'consultant',
  'government-policy':      'analyst',
  'personal-productivity':  'general-purpose',
};

const PERSONA_RECOMMENDATIONS: Record<string, {
  skills: string[]; connectors: string[]; mcp: string[]
}> = {
  'general-purpose':        { skills: [], connectors: [], mcp: ['filesystem', 'brave-search'] },
  'planner':                { skills: [], connectors: ['notion', 'gdrive'], mcp: [] },
  'researcher':             { skills: ['browser-automation'], connectors: ['gdrive', 'notion'], mcp: ['brave-search', 'fetch'] },
  'analyst':                { skills: ['xlsx-generator', 'chart-generator'], connectors: ['gsheets', 'postgres'], mcp: ['sqlite'] },
  'writer':                 { skills: ['pdf-generator', 'pptx-generator'], connectors: ['gdrive', 'gdocs', 'notion'], mcp: [] },
  'verifier':               { skills: [], connectors: [], mcp: ['filesystem', 'git'] },
  'coordinator':            { skills: [], connectors: ['slack'], mcp: [] },
  'coder':                  { skills: [], connectors: ['github', 'gitlab'], mcp: ['filesystem', 'git', 'github'] },
  'legal-professional':     { skills: ['pdf-generator'], connectors: ['gdrive', 'gdocs', 'email'], mcp: [] },
  'finance-owner':          { skills: ['xlsx-generator', 'chart-generator'], connectors: ['gsheets', 'postgres'], mcp: [] },
  'sales-rep':              { skills: [], connectors: ['hubspot', 'salesforce', 'gmail', 'slack'], mcp: [] },
  'marketer':               { skills: ['pdf-generator', 'pptx-generator'], connectors: ['gmail', 'notion', 'airtable'], mcp: [] },
  'project-manager':        { skills: [], connectors: ['jira', 'linear', 'asana', 'slack'], mcp: ['github'] },
  'executive-assistant':    { skills: ['pdf-generator'], connectors: ['gmail', 'gcal', 'slack', 'outlook'], mcp: [] },
  'hr-manager':             { skills: ['pdf-generator'], connectors: ['gmail', 'gdrive', 'notion'], mcp: [] },
  'product-manager-senior': { skills: ['pdf-generator', 'pptx-generator'], connectors: ['jira', 'linear', 'notion', 'github'], mcp: [] },
  'consultant':             { skills: ['pdf-generator', 'pptx-generator', 'xlsx-generator'], connectors: ['gdrive', 'notion', 'slack'], mcp: ['brave-search'] },
};

const VALUE_PROPS = [
  { label: 'Remembers everything across sessions', iconName: 'remember' },
  { label: 'Workspace-native — one brain per project', iconName: 'frames' },
  { label: 'Real tools — search, draft, code, plan', iconName: 'capabilities' },
];

// ── Provider Definitions (onboarding-specific) ──────────────────────

interface OnboardingProvider {
  id: string;
  name: string;
  keyPrefix: string;
  keyPlaceholder: string;
  keyUrl: string;
  badge?: string;
}

const ONBOARDING_PROVIDERS: OnboardingProvider[] = [
  { id: 'anthropic', name: 'Anthropic', keyPrefix: 'sk-ant-', keyPlaceholder: 'sk-ant-api03-...', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', keyPrefix: 'sk-', keyPlaceholder: 'sk-proj-...', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'google', name: 'Google', keyPrefix: 'AI', keyPlaceholder: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'mistral', name: 'Mistral', keyPrefix: '', keyPlaceholder: 'your-mistral-key...', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'deepseek', name: 'DeepSeek', keyPrefix: '', keyPlaceholder: 'sk-...', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'openrouter', name: 'OpenRouter', keyPrefix: 'sk-or-', keyPlaceholder: 'sk-or-v1-...', keyUrl: 'https://openrouter.ai/keys', badge: 'Free models available!' },
  { id: 'ollama', name: 'Local / Ollama', keyPrefix: '', keyPlaceholder: '', keyUrl: 'https://ollama.com/download', badge: 'No key needed' },
];

// ── Props ───────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  serverBaseUrl: string;
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onComplete: (serverBaseUrl: string) => void;
  onDismiss: () => void;
  /** Called when wizard finishes and user should land in their workspace */
  onFinish: (workspaceId: string, firstMessage: string) => void;
}

// ── Main Component ──────────────────────────────────────────────────

export function OnboardingWizard({
  serverBaseUrl,
  state,
  onUpdate,
  onNext: _onNext,
  onComplete,
  onDismiss,
  onFinish,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(state.step);
  const [fadeClass, setFadeClass] = useState('opacity-100');
  const [apiKey, setApiKey] = useState('');
  const [keyValid, setKeyValid] = useState(false);
  const [keyChecking, setKeyChecking] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [customPersonaMode, setCustomPersonaMode] = useState(false);
  const [customPersonaDesc, setCustomPersonaDesc] = useState('');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [tierCheckoutLoading, setTierCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [customPersonaError, setCustomPersonaError] = useState<string | null>(null);

  // Fetch auth token from /health on mount
  useEffect(() => {
    fetch(`${serverBaseUrl}/health`)
      .then(r => r.json())
      .then((d: any) => { if (d.wsToken) setAuthToken(d.wsToken); })
      .catch(() => {
        // Auth token is optional — wizard works without it (unauthenticated mode).
        // No user-visible error needed; API calls will proceed without the token.
      });
  }, [serverBaseUrl]);

  // Auto-advance step 0 (Welcome) after 3 seconds
  useEffect(() => {
    if (step === 0) {
      const timer = setTimeout(() => goToStep(1), 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Auto-advance step 1 (Why Waggle) after 8 seconds
  useEffect(() => {
    if (step === 1) {
      const timer = setTimeout(() => goToStep(2), 8000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const goToStep = useCallback((next: number) => {
    setFadeClass('opacity-0');
    setTimeout(() => {
      setStep(next);
      onUpdate({ step: next });
      setFadeClass('opacity-100');
    }, 200);
  }, [onUpdate]);

  // ── Auth helper for API calls ────────────────────────────────────
  const authHeaders = useCallback((extra?: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = { ...extra };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  // ── API Key Validation ──────────────────────────────────────────
  const validateKey = useCallback(async (key: string) => {
    if (!key || key.length < 10) return;
    setKeyChecking(true);
    setKeyError('');
    try {
      // Store key in vault with provider name as key
      await fetch(`${serverBaseUrl}/api/vault`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: selectedProvider, value: key }),
      });
      // Check health
      const healthRes = await fetch(`${serverBaseUrl}/health`);
      if (healthRes.ok) {
        const health = await healthRes.json();
        if (health.llm?.health === 'healthy' || health.llm?.health === 'degraded') {
          setKeyValid(true);
          onUpdate({ apiKeySet: true });
        } else {
          setKeyError('Key stored but could not verify. You can continue and test later.');
          setKeyValid(true); // Allow proceeding
        }
      }
    } catch {
      setKeyError('Could not connect to server. Check that Waggle is running.');
    } finally {
      setKeyChecking(false);
    }
  }, [serverBaseUrl, onUpdate, selectedProvider]);

  // ── Workspace Creation ──────────────────────────────────────────
  const createWorkspace = useCallback(async () => {
    setCreating(true);
    try {
      const template = selectedTemplate && selectedTemplate !== 'blank' ? selectedTemplate : undefined;
      const name = workspaceName.trim() || (template ? TEMPLATES.find(t => t.id === template)?.name : null) || 'My Workspace';
      const persona = selectedPersona ?? (template ? TEMPLATE_PERSONA[template] : undefined);
      const res = await fetch(`${serverBaseUrl}/api/workspaces`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name,
          group: 'Workspaces',
          ...(template && { templateId: template }),
          ...(persona && { personaId: persona }),
        }),
      });
      if (res.ok) {
        const ws = await res.json();
        onUpdate({ workspaceId: ws.id, templateId: template, personaId: persona });
        return ws.id;
      }
    } catch { /* handled below */ }
    setCreating(false);
    return null;
  }, [selectedTemplate, workspaceName, selectedPersona, serverBaseUrl, onUpdate]);

  // ── Final Step: Finish ──────────────────────────────────────────
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFinish = useCallback(async () => {
    setCreating(true);
    const wsId = await createWorkspace();
    if (wsId) {
      // Show the "Hive is Ready" celebration step first
      goToStep(7);
      const hint = TEMPLATES.find(t => t.id === selectedTemplate)?.hint || 'Hello! What can you help me with?';
      // Then finish after 2s delay so the user sees the celebration
      finishTimerRef.current = setTimeout(() => {
        onComplete(serverBaseUrl);
        onFinish(wsId, hint);
      }, 2000);
    }
    setCreating(false);
  }, [createWorkspace, selectedTemplate, onComplete, onFinish, serverBaseUrl, goToStep]);

  // Also allow immediate finish from the celebration step
  const handleLetsGo = useCallback(() => {
    // Clear the auto-finish timer if it exists
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    // The workspace was already created in handleFinish, so we just need to trigger callbacks
    const wsId = state.workspaceId;
    if (wsId) {
      const hint = TEMPLATES.find(t => t.id === selectedTemplate)?.hint || 'Hello! What can you help me with?';
      onComplete(serverBaseUrl);
      onFinish(wsId, hint);
    }
  }, [state.workspaceId, selectedTemplate, onComplete, onFinish, serverBaseUrl]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  // ── Step rendering ──────────────────────────────────────────────
  const totalSteps = 8;
  const progress = Math.min((step / (totalSteps - 1)) * 100, 100);

  // Current provider object for the API key step
  const currentProvider = ONBOARDING_PROVIDERS.find(p => p.id === selectedProvider) ?? ONBOARDING_PROVIDERS[0];

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-auto honeycomb-bg"
      style={{ backgroundColor: 'var(--hive-950)' }}
    >
      {/* Progress bar — honey fill */}
      {step > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: 'var(--hive-800)' }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, backgroundColor: 'var(--honey-500)' }}
          />
        </div>
      )}

      {/* Hex step indicator dots */}
      {step > 0 && step < 7 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5">
          {[1, 2, 3, 4, 5, 6].map(s => (
            <span
              key={s}
              className="text-[10px] transition-all"
              style={{
                color: s === step ? 'var(--honey-500)' : s < step ? 'var(--honey-600)' : 'var(--hive-600)',
                transform: s === step ? 'scale(1.3)' : 'scale(1)',
              }}
            >
              ⬡
            </span>
          ))}
          <span className="text-[10px] ml-1" style={{ color: 'var(--hive-500)' }}>
            Step {step} of {totalSteps - 2}  {/* Steps 1-6 of 6 visible steps */}
          </span>
        </div>
      )}

      {/* Skip link */}
      {step > 0 && step < 7 && (
        <button
          onClick={onDismiss}
          className="absolute top-4 right-6 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          Skip setup
        </button>
      )}

      {/* Step content with fade transition */}
      <div className={`w-full max-w-2xl px-6 transition-opacity duration-200 ${fadeClass}`}>

        {/* ── Step 0: Welcome ────────────────────────────────── */}
        {step === 0 && (
          <div className="flex flex-col items-center gap-6 text-center animate-in fade-in duration-700 cursor-pointer" onClick={() => goToStep(1)}>
            {/* Architect bee with glow */}
            <div className="relative">
              <BeeImage role="orchestrator" className="w-[180px] h-[180px] float" />
              <div className="absolute -inset-8 rounded-full blur-2xl animate-pulse" style={{ backgroundColor: 'rgba(229, 160, 0, 0.08)' }} />
            </div>
            <p className="text-[11px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--honey-500)' }}>
              YOUR AI OPERATING SYSTEM
            </p>
            <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--hive-50)' }}>
              Welcome to the Hive
            </h1>
            <p className="text-base max-w-md" style={{ color: 'var(--hive-300)' }}>
              Persistent memory. Workspace-native. Built for knowledge work.
            </p>
            <p className="text-xs mt-6" style={{ color: 'var(--hive-600)' }}>Click anywhere to continue</p>
          </div>
        )}

        {/* ── Step 1: Why Waggle? ─────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col items-center gap-6 text-center">
            <BeeImage role="connector" className="w-16 h-16" />
            <h2 className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>
              Why Waggle?
            </h2>
            <p className="text-xs" style={{ color: 'var(--hive-500)' }}>
              Built for people who really work with AI every day
            </p>
            <div className="flex flex-col gap-4 mt-2 w-full max-w-md">
              {VALUE_PROPS.map(prop => (
                <div key={prop.iconName} className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: 'var(--hive-900)', border: '1px solid var(--hive-700)' }}>
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--honey-glow)', border: '1px solid var(--hive-700)' }}
                  >
                    <HiveIcon name={prop.iconName} size={28} />
                  </div>
                  <span className="text-sm font-medium text-left" style={{ color: 'var(--hive-200)' }}>{prop.label}</span>
                </div>
              ))}
            </div>
            <Button className="mt-4 px-8" size="lg" onClick={() => goToStep(2)}
              style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
            >
              Continue →
            </Button>
          </div>
        )}

        {/* ── Step 2: Memory Import (Optional) ────────────────── */}
        {step === 2 && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="text-4xl">🧠</div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>
              Bring your AI memories
            </h2>
            <p className="text-sm max-w-md" style={{ color: 'var(--hive-300)' }}>
              Import conversation history from ChatGPT or Claude to give your agent a head start.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full max-w-md mt-2">
              {/* ChatGPT Export Card */}
              <button
                className="flex flex-col items-center gap-3 p-5 rounded-xl border text-center transition-all hover:border-primary/30 hover:bg-card/80"
                style={{ backgroundColor: 'var(--hive-900)', borderColor: 'var(--hive-700)' }}
                onClick={() => {
                  // Placeholder: trigger file upload for ChatGPT JSON
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json,.zip';
                  input.onchange = () => {
                    // Placeholder handler — import logic will be wired later
                  };
                  input.click();
                }}
              >
                <span className="text-3xl">🟢</span>
                <span className="text-sm font-medium" style={{ color: 'var(--hive-100)' }}>ChatGPT Export</span>
                <span className="text-[10px]" style={{ color: 'var(--hive-500)' }}>Upload JSON or ZIP</span>
              </button>
              {/* Claude Export Card */}
              <button
                className="flex flex-col items-center gap-3 p-5 rounded-xl border text-center transition-all hover:border-primary/30 hover:bg-card/80"
                style={{ backgroundColor: 'var(--hive-900)', borderColor: 'var(--hive-700)' }}
                onClick={() => {
                  // Placeholder: trigger file upload for Claude JSON
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = () => {
                    // Placeholder handler — import logic will be wired later
                  };
                  input.click();
                }}
              >
                <span className="text-3xl">🟤</span>
                <span className="text-sm font-medium" style={{ color: 'var(--hive-100)' }}>Claude Export</span>
                <span className="text-[10px]" style={{ color: 'var(--hive-500)' }}>Upload JSON</span>
              </button>
            </div>
            <Button
              className="mt-4 px-8"
              size="lg"
              variant="outline"
              onClick={() => goToStep(3)}
              style={{ color: 'var(--hive-200)', borderColor: 'var(--hive-600)' }}
            >
              Skip this step
            </Button>
          </div>
        )}

        {/* ── Step 3: Choose Template ────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col items-center gap-5">
            <h2 className="text-2xl font-bold text-foreground text-center">What are you working on?</h2>
            <p className="text-sm text-muted-foreground text-center">Pick a template to get started instantly.</p>
            <div className="grid grid-cols-3 gap-3 w-full mt-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTemplate(t.id);
                    setWorkspaceName(t.name);
                    setSelectedPersona(TEMPLATE_PERSONA[t.id] ?? null);
                  }}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                    selectedTemplate === t.id
                      ? 'border-primary bg-primary/10 shadow-[0_0_12px_rgba(var(--primary-rgb),0.15)]'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-card/80'
                  }`}
                >
                  <span className="text-2xl shrink-0">{t.icon}</span>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground block">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">{t.desc}</span>
                  </div>
                </button>
              ))}
              <button
                onClick={() => {
                  setSelectedTemplate('blank');
                  setWorkspaceName('My Workspace');
                  setSelectedPersona(null);
                }}
                className={`flex items-start gap-3 p-4 rounded-xl border border-dashed text-left transition-all ${
                  selectedTemplate === 'blank'
                    ? 'border-primary bg-primary/10'
                    : 'border-border/50 bg-transparent hover:border-border'
                }`}
              >
                <span className="text-2xl shrink-0 opacity-40">+</span>
                <div className="min-w-0">
                  <span className="text-sm text-muted-foreground block">Blank workspace</span>
                  <span className="text-[10px] text-muted-foreground/60 block mt-0.5">Start from scratch</span>
                </div>
              </button>
            </div>
            {selectedTemplate && (
              <div className="w-full mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">Workspace name</label>
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            )}
            <Button
              className="mt-2 px-8"
              size="lg"
              disabled={!selectedTemplate}
              onClick={() => goToStep(4)}
            >
              Continue
            </Button>
          </div>
        )}

        {/* ── Step 4: Choose Persona ─────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col items-center gap-5">
            <h2 className="text-2xl font-bold text-foreground text-center">How should I work?</h2>
            <p className="text-sm text-muted-foreground text-center">Choose an agent persona for this workspace.</p>
            <div className="grid grid-cols-3 gap-2.5 w-full mt-2">
              {PERSONAS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPersona(p.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedPersona === p.id
                      ? 'border-[var(--honey-500)] bg-[var(--honey-500)]/10 shadow-[0_0_12px_rgba(229,160,0,0.2)]'
                      : 'border-border bg-card hover:border-[var(--honey-500)]/40 hover:bg-card/80'
                  }`}
                >
                  <span className="text-xl shrink-0">{p.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{p.desc}</div>
                  </div>
                  {selectedPersona === p.id && (
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--honey-500)' }}>Selected</span>
                  )}
                </button>
              ))}
              {/* Create Custom Persona */}
              <button
                type="button"
                onClick={() => setCustomPersonaMode(true)}
                className="flex items-center gap-3 p-3 rounded-lg border border-dashed text-left transition-all cursor-pointer border-border/50 bg-transparent hover:border-[var(--honey-500)]/40 col-span-3"
              >
                <span className="text-xl shrink-0 opacity-50">+</span>
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">Create Custom Persona</div>
                  <div className="text-[10px] text-muted-foreground/60">Describe your ideal agent and we'll build it</div>
                </div>
              </button>
            </div>
            {/* Custom persona inline form */}
            {customPersonaMode && (
              <div className="w-full mt-1 rounded-lg border border-border p-4 space-y-3" style={{ backgroundColor: 'var(--hive-900)' }}>
                <label className="text-xs font-medium text-muted-foreground block">Describe your ideal agent</label>
                <textarea
                  value={customPersonaDesc}
                  onChange={(e) => setCustomPersonaDesc(e.target.value)}
                  placeholder="e.g., A financial analyst who specializes in SaaS metrics, speaks in concise bullet points, and always cites data sources..."
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--honey-500)] resize-none"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setCustomPersonaMode(false); setCustomPersonaDesc(''); }}
                    className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!customPersonaDesc.trim()) return;
                      setCustomPersonaError(null);
                      // Create persona via API — agent will refine it later
                      const name = customPersonaDesc.trim().split(/[.,!?\n]/)[0].slice(0, 40);
                      try {
                        const res = await fetch(`${serverBaseUrl}/api/personas`, {
                          method: 'POST',
                          headers: authHeaders({ 'Content-Type': 'application/json' }),
                          body: JSON.stringify({
                            name: name || 'Custom Persona',
                            description: customPersonaDesc.trim().slice(0, 120),
                            systemPrompt: `You are a custom agent persona. ${customPersonaDesc.trim()}\n\nAdapt your communication style, tool usage, and focus areas to match this description.`,
                          }),
                        });
                        if (res.ok) {
                          const persona = await res.json();
                          setSelectedPersona(persona.id);
                          setCustomPersonaMode(false);
                          setCustomPersonaDesc('');
                        } else {
                          const data = await res.json().catch(() => ({}));
                          setCustomPersonaError((data as { error?: string }).error ?? 'Failed to create persona. You can pick a built-in one instead.');
                        }
                      } catch {
                        setCustomPersonaError('Could not connect to server. You can pick a built-in persona instead.');
                      }
                    }}
                    disabled={!customPersonaDesc.trim()}
                    className="rounded-md px-3 py-1.5 text-sm text-primary-foreground transition-colors disabled:opacity-50"
                    style={{ backgroundColor: 'var(--honey-500)' }}
                  >
                    Create Persona
                  </button>
                </div>
                {customPersonaError && (
                  <p className="text-xs text-red-400 mt-1">{customPersonaError}</p>
                )}
              </div>
            )}
            {/* Persona recommendation block */}
            {selectedPersona && (() => {
              const rec = PERSONA_RECOMMENDATIONS[selectedPersona];
              if (!rec) return null;
              const hasAny = rec.skills.length > 0 || rec.connectors.length > 0 || rec.mcp.length > 0;
              if (!hasAny) return null;
              return (
                <div className="mt-4 rounded-lg border border-border bg-card/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Recommended setup for this persona
                  </p>
                  {rec.skills.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      <span className="text-foreground">Skills: </span>{rec.skills.join(', ')}
                    </p>
                  )}
                  {rec.connectors.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="text-foreground">Connect: </span>{rec.connectors.join(', ')}
                    </p>
                  )}
                  {rec.mcp.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="text-foreground">MCP: </span>{rec.mcp.join(', ')}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2 opacity-60">
                    Install these after setup via Capabilities
                  </p>
                </div>
              );
            })()}
            <Button
              className="mt-2 px-8"
              size="lg"
              onClick={() => goToStep(5)}
            >
              Continue →
            </Button>
          </div>
        )}

        {/* ── Step 5: API Key (Multi-Provider) ────────────────── */}
        {step === 5 && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="text-4xl">🔑</div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>Connect your AI brain</h2>
            <p className="text-sm max-w-md" style={{ color: 'var(--hive-300)' }}>
              Choose your AI provider and paste an API key.
            </p>

            {/* Provider tabs */}
            <div className="flex flex-wrap justify-center gap-1.5 w-full max-w-lg mt-1">
              {ONBOARDING_PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedProvider(p.id);
                    setApiKey('');
                    setKeyValid(false);
                    setKeyError('');
                  }}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedProvider === p.id
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted/70'
                  }`}
                >
                  {p.name}
                  {p.badge && (
                    <span
                      className="absolute -top-2 -right-1 px-1 py-0.5 rounded text-[8px] font-bold whitespace-nowrap"
                      style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
                    >
                      {p.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Free & affordable callout */}
            <div
              className="w-full max-w-md rounded-lg p-3 text-left text-xs"
              style={{ backgroundColor: 'var(--honey-glow)', border: '1px solid var(--honey-500)', color: 'var(--hive-200)' }}
            >
              <strong style={{ color: 'var(--honey-500)' }}>Free & affordable options available</strong>
              <div className="mt-1.5 space-y-0.5" style={{ color: 'var(--hive-400)' }}>
                <p>OpenRouter free models (Llama, Gemini, DeepSeek, Qwen)</p>
                <p>Google Gemini Flash (free tier)</p>
                <p>DeepSeek V3 ($0.14/1M tokens)</p>
                <p>Local models via Ollama (free, no key needed)</p>
              </div>
            </div>

            {/* Key input — hidden for Ollama */}
            {currentProvider.id !== 'ollama' ? (
              <div className="w-full max-w-md">
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={currentProvider.keyPlaceholder}
                    className="w-full rounded-lg border border-border bg-muted px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary transition-colors"
                    autoFocus
                  />
                  {keyValid && (
                    <div className="absolute right-3 top-3 text-green-500 text-lg">✓</div>
                  )}
                </div>
                {keyError && <p className="text-xs text-yellow-500 mt-2">{keyError}</p>}
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={() => validateKey(apiKey)}
                    disabled={!apiKey || apiKey.length < 10 || keyChecking}
                    className="flex-1"
                  >
                    {keyChecking ? 'Validating...' : keyValid ? 'Key saved!' : 'Validate & save'}
                  </Button>
                  {keyValid && (
                    <Button variant="outline" onClick={() => goToStep(6)}>
                      Continue →
                    </Button>
                  )}
                </div>
                <a
                  href={currentProvider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary/70 hover:text-primary mt-3 inline-block"
                >
                  Get a {currentProvider.name} API key →
                </a>
              </div>
            ) : (
              <div className="w-full max-w-md">
                <p className="text-sm" style={{ color: 'var(--hive-300)' }}>
                  No API key needed. Make sure Ollama is running locally.
                </p>
                <a
                  href={currentProvider.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary/70 hover:text-primary mt-2 inline-block"
                >
                  Download Ollama →
                </a>
                <Button className="mt-4 px-8 block mx-auto" size="lg" onClick={() => goToStep(6)}>
                  Continue →
                </Button>
              </div>
            )}

            {/* Skip button — full opacity, prominent */}
            <button
              onClick={() => goToStep(6)}
              className="text-sm text-muted-foreground hover:text-foreground mt-2 transition-colors underline underline-offset-2"
            >
              Skip — I&apos;ll add a key later
            </button>
          </div>
        )}

        {/* ── Step 6: Choose Your Plan ─────────────────────────── */}
        {step === 6 && (
          <div className="flex flex-col items-center gap-5">
            <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--hive-50)' }}>Choose your plan</h2>
            <p className="text-sm text-center" style={{ color: 'var(--hive-300)' }}>Start free. Upgrade anytime.</p>

            <div className="grid grid-cols-3 gap-4 w-full mt-2">
              {/* SOLO — Free */}
              <div
                className="rounded-xl border p-5 flex flex-col"
                style={{ backgroundColor: 'var(--hive-900)', borderColor: 'var(--hive-700)' }}
              >
                <h3 className="text-base font-bold" style={{ color: 'var(--hive-50)' }}>Solo</h3>
                <div className="mt-1 mb-3">
                  <span className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>Free</span>
                </div>
                <ul className="text-xs space-y-1.5 flex-1 mb-4" style={{ color: 'var(--hive-300)' }}>
                  <li>5 workspaces</li>
                  <li>Local embeddings</li>
                  <li>Community marketplace</li>
                </ul>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    onUpdate({ selectedTier: 'SOLO' });
                    handleFinish();
                  }}
                  disabled={creating}
                  style={{ color: 'var(--hive-200)', borderColor: 'var(--hive-600)' }}
                >
                  {creating ? 'Creating...' : 'Start Free'}
                </Button>
              </div>

              {/* BASIC — $15/mo */}
              <div
                className="rounded-xl border p-5 flex flex-col relative"
                style={{ backgroundColor: 'var(--hive-850)', borderColor: 'var(--honey-500)', boxShadow: 'var(--shadow-honey)' }}
              >
                <span
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
                >
                  Most Popular
                </span>
                <h3 className="text-base font-bold" style={{ color: 'var(--hive-50)' }}>Basic</h3>
                <div className="mt-1 mb-3">
                  <span className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>$15</span>
                  <span className="text-xs ml-1" style={{ color: 'var(--hive-400)' }}>/mo</span>
                </div>
                <ul className="text-xs space-y-1.5 flex-1 mb-4" style={{ color: 'var(--hive-300)' }}>
                  <li>Unlimited workspaces</li>
                  <li>Sub-agent spawning</li>
                  <li>Custom skills</li>
                </ul>
                <Button
                  className="w-full"
                  onClick={async () => {
                    setTierCheckoutLoading(true);
                    setCheckoutError(null);
                    onUpdate({ selectedTier: 'BASIC', stripeSessionPending: true });
                    try {
                      const res = await fetch(`${serverBaseUrl}/api/stripe/create-checkout-session`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ tier: 'BASIC' }),
                      });
                      if (res.ok) {
                        const { url } = await res.json();
                        if (url) window.open(url, '_blank');
                      } else {
                        setCheckoutError('Could not start checkout. You can continue on Solo and upgrade later.');
                      }
                    } catch {
                      setCheckoutError('Could not connect to payment server. You can continue on Solo and upgrade later.');
                    }
                    setTierCheckoutLoading(false);
                    // After user returns from checkout, handleFinish will be called
                    // For now, also allow proceeding directly
                    handleFinish();
                  }}
                  disabled={tierCheckoutLoading || creating}
                  style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
                >
                  {tierCheckoutLoading ? 'Opening checkout...' : 'Start Basic'}
                </Button>
              </div>

              {/* TEAMS — $79/mo */}
              <div
                className="rounded-xl border p-5 flex flex-col"
                style={{ backgroundColor: 'var(--hive-900)', borderColor: 'var(--hive-700)' }}
              >
                <h3 className="text-base font-bold" style={{ color: 'var(--hive-50)' }}>Teams</h3>
                <div className="mt-1 mb-3">
                  <span className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>$79</span>
                  <span className="text-xs ml-1" style={{ color: 'var(--hive-400)' }}>/mo per seat</span>
                </div>
                <ul className="text-xs space-y-1.5 flex-1 mb-4" style={{ color: 'var(--hive-300)' }}>
                  <li>Shared workspaces</li>
                  <li>Team skill library</li>
                  <li>Admin panel &amp; audit</li>
                </ul>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={async () => {
                    setTierCheckoutLoading(true);
                    setCheckoutError(null);
                    onUpdate({ selectedTier: 'TEAMS', stripeSessionPending: true });
                    try {
                      const res = await fetch(`${serverBaseUrl}/api/stripe/create-checkout-session`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ tier: 'TEAMS' }),
                      });
                      if (res.ok) {
                        const { url } = await res.json();
                        if (url) window.open(url, '_blank');
                      } else {
                        setCheckoutError('Could not start checkout. You can continue on Solo and upgrade later.');
                      }
                    } catch {
                      setCheckoutError('Could not connect to payment server. You can continue on Solo and upgrade later.');
                    }
                    setTierCheckoutLoading(false);
                    handleFinish();
                  }}
                  disabled={tierCheckoutLoading || creating}
                  style={{ color: 'var(--hive-200)', borderColor: 'var(--hive-600)' }}
                >
                  {tierCheckoutLoading ? 'Opening checkout...' : 'Start Teams'}
                </Button>
              </div>
            </div>

            {checkoutError && (
              <p className="text-xs text-yellow-500 mt-2 text-center">{checkoutError}</p>
            )}
            <button
              onClick={() => {
                onUpdate({ selectedTier: 'SOLO' });
                handleFinish();
              }}
              disabled={creating}
              className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
            >
              {creating ? 'Creating workspace...' : 'Skip for now — start on Solo'}
            </button>
          </div>
        )}

        {/* ── Step 7: Your Hive is Ready ──────────────────────── */}
        {step === 7 && (
          <div className="flex flex-col items-center gap-4 text-center animate-in fade-in duration-500">
            <BeeImage role="celebrating" className="w-[160px] h-[160px] float" />
            <h2 className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>Your hive is ready ⬡</h2>
            <p style={{ color: 'var(--hive-300)' }}>Your workspace is ready. Let's get to work.</p>
            <Button
              className="mt-4 px-10"
              size="lg"
              onClick={handleLetsGo}
              style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
            >
              Let's go!
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Post-Wizard Tooltips ────────────────────────────────────────────

export function OnboardingTooltips({ onDismiss }: { onDismiss: () => void }) {
  const [tipIndex, setTipIndex] = useState(0);
  const tips = [
    { text: 'Type / for 22 powerful commands — research, draft, plan, and more', position: 'bottom' as const },
    { text: 'I remember everything — ask about past work anytime', position: 'top' as const },
    { text: 'Create workspaces to organize different projects', position: 'top' as const },
    { text: 'Your AI remembers everything — across every session, every workspace. No other AI does this.', position: 'top' as const },
    { text: 'Check your Memory tab (Ctrl+Shift+5) to see what your agent has learned', position: 'top' as const },
    { text: 'Type /help in chat for a list of all agent workflows', position: 'bottom' as const },
    { text: 'Try /research [any topic] in chat — watch your agent search the web and synthesize findings', position: 'bottom' as const },
  ];

  const handleNext = () => {
    if (tipIndex < tips.length - 1) {
      setTipIndex(tipIndex + 1);
    } else {
      onDismiss();
    }
  };

  if (tipIndex >= tips.length) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9998] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-primary text-primary-foreground rounded-xl px-5 py-3 shadow-lg max-w-sm flex items-center gap-3">
        <span className="text-sm">{tips[tipIndex].text}</span>
        <button
          onClick={handleNext}
          className="shrink-0 text-xs font-medium opacity-80 hover:opacity-100 bg-primary-foreground/20 rounded px-2 py-1"
        >
          {tipIndex < tips.length - 1 ? 'Next' : 'Got it'}
        </button>
      </div>
      <div className="flex justify-center gap-1 mt-2">
        {tips.map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === tipIndex ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
        ))}
      </div>
    </div>
  );
}
