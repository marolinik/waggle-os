import { useState, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { useToast } from '@/hooks/use-toast';
import { adapter } from '@/lib/adapter';
import ChatApp from './ChatApp';
import type { TeamMember } from './ChatApp';

// Fallback models shown when backend is offline — latest flagships from top providers.
// IMPORTANT: the first entry is used as the default selected model when the sidecar
// /api/agent/model fetch fails (e.g. boot race). Keep this in sync with the sidecar's
// real default (claude-sonnet-4-6) so users don't see a misleading Opus label on
// first render. Bug #1.
const FALLBACK_MODELS = [
  // Anthropic (sonnet first — matches sidecar default)
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-haiku-4.6',
  // OpenAI
  'openai/gpt-5.4',
  'openai/gpt-5.4-mini',
  'openai/o3-pro',
  'openai/o4-mini',
  // Google
  'google/gemini-3.1-pro',
  'google/gemini-3.1-flash',
  'google/gemini-2.5-pro',
  // Meta
  'meta/llama-4-maverick',
  'meta/llama-4-scout',
  // Mistral
  'mistral/mistral-large-3',
  'mistral/codestral-2',
  // DeepSeek
  'deepseek/deepseek-r2',
  'deepseek/deepseek-v4',
  // Alibaba
  'alibaba/qwen-3-235b',
  'alibaba/qwen-3-72b',
  // Zhipu
  'zhipu/glm-5',
  // Baidu
  'baidu/ernie-5.0',
  // xAI
  'xai/grok-3',
];

type AutonomyLevel = 'normal' | 'trusted' | 'yolo';

interface ChatWindowInstanceProps {
  workspaceId: string;
  workspaceName?: string;
  initialPersona?: string;
  templateId?: string;
  storageType?: 'virtual' | 'local' | 'team';
  /**
   * Phase A.2: called when the user changes the persona inside this window.
   * Should update the window's local persona state via useWindowManager.
   * Takes precedence over the legacy workspace-patch path when provided.
   */
  onPersonaChange?: (personaId: string) => void;
  /** Phase B.5: current autonomy level for this window. */
  autonomyLevel?: AutonomyLevel;
  /** Phase B.5: expiry of the current elevated autonomy, if any. */
  autonomyExpiresAt?: number | null;
  /** Phase B.5: change autonomy from inside ChatApp's header. */
  onAutonomyChange?: (level: AutonomyLevel, ttlMinutes: number | null) => void;
  /** ContextRail: triggered when user double-clicks a message. */
  onContextRail?: (target: { type: 'message'; id: string; label: string }) => void;
}

const ChatWindowInstance = ({
  workspaceId,
  workspaceName,
  initialPersona,
  templateId,
  storageType,
  onPersonaChange,
  autonomyLevel = 'normal',
  autonomyExpiresAt = null,
  onAutonomyChange,
  onContextRail,
}: ChatWindowInstanceProps) => {
  const [currentPersona, setCurrentPersona] = useState(initialPersona || 'general-purpose');

  // Sync the local persona state when the parent sends a new initialPersona
  // (e.g. when PersonaSwitcher updates the window from outside ChatWindowInstance).
  useEffect(() => {
    if (initialPersona && initialPersona !== currentPersona) {
      setCurrentPersona(initialPersona);
    }
  }, [initialPersona]);

  const { sessions, activeSessionId, setActiveSessionId, createSession } = useSessions(workspaceId);
  const { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction } = useChat({
    workspaceId,
    sessionId: activeSessionId,
    persona: currentPersona,
    autonomy: { level: autonomyLevel, expiresAt: autonomyExpiresAt },
  });

  const [currentModel, setCurrentModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [teamPresence, setTeamPresence] = useState<TeamMember[]>([]);

  const { toast } = useToast();

  const handlePersonaChange = (personaId: string) => {
    setCurrentPersona(personaId);
    // Phase A.2: per-window persona. Prefer the window-scoped callback if
    // the parent wired it — otherwise fall back to the legacy workspace
    // patch so older call sites keep working.
    if (onPersonaChange) {
      onPersonaChange(personaId);
      toast({ title: 'Persona switched', description: `This window now uses ${personaId}` });
      return;
    }
    adapter.patchWorkspace(workspaceId, { persona: personaId })
      .then(() => toast({ title: 'Persona updated', description: `Switched to ${personaId}` }))
      .catch(() => toast({ title: 'Persona updated locally', description: 'Backend offline — will sync when connected', variant: 'destructive' }));
  };

  useEffect(() => {
    let cancelled = false;
    let modelsLanded = false;
    let currentLanded = false;

    // Try fetching models from the backend (litellm models filtered by vault keys).
    // Retries every 2s for up to 20s so the sidecar boot race (bug #1) doesn't
    // leave the dropdown stuck on the fallback list.
    const fetchModels = async () => {
      try {
        const models = await adapter.getModels();
        if (cancelled) return;
        if (models && models.length > 0) {
          setAvailableModels(models);
          modelsLanded = true;
        } else {
          setAvailableModels(FALLBACK_MODELS);
        }
      } catch (err) {
        console.error('[ChatWindowInstance] fetch models failed:', err);
        if (!cancelled) setAvailableModels(FALLBACK_MODELS);
      }
    };

    // Try fetching the current active model from the sidecar. Also retries on
    // transient failure — the initial render may race the sidecar spawning.
    const fetchCurrentModel = async () => {
      try {
        const model = await adapter.getModel();
        if (cancelled) return;
        if (typeof model === 'string' && model) {
          setCurrentModel(model);
          currentLanded = true;
          return;
        }
        const settings = await adapter.getSettings();
        if (cancelled) return;
        const fromSettings = (settings as { defaultModel?: string; model?: string }).defaultModel
          ?? (settings as { model?: string }).model;
        if (fromSettings) {
          setCurrentModel(fromSettings);
          currentLanded = true;
        } else {
          setCurrentModel(FALLBACK_MODELS[0]);
        }
      } catch (err) {
        console.error('[ChatWindowInstance] fetch current model failed:', err);
        if (!cancelled) setCurrentModel(FALLBACK_MODELS[0]);
      }
    };

    fetchModels();
    fetchCurrentModel();

    // Retry loop for the first 20 seconds of a window's life. Stops as soon as
    // both the model list and the current model have landed from the server.
    let tries = 0;
    const retryInterval = setInterval(() => {
      tries += 1;
      if (cancelled || (modelsLanded && currentLanded) || tries > 10) {
        clearInterval(retryInterval);
        return;
      }
      if (!modelsLanded) fetchModels();
      if (!currentLanded) fetchCurrentModel();
    }, 2000);

    // Fetch team members for presence display
    const fetchTeam = async () => {
      try {
        const members = await adapter.getTeamMembers();
        setTeamPresence(members.filter(m => m.status === 'online'));
      } catch (err) {
        console.error('[ChatWindowInstance] fetch team failed:', err);
        setTeamPresence([]);
      }
    };
    fetchTeam();
    const teamInterval = setInterval(fetchTeam, 10000);
    return () => {
      cancelled = true;
      clearInterval(teamInterval);
      clearInterval(retryInterval);
    };
  }, []);

  const handleModelChange = (model: string) => {
    setCurrentModel(model);
    adapter.setModel(model).catch((err) => console.error('[ChatWindowInstance] set model failed:', err));
    adapter.patchWorkspace(workspaceId, { model })
      .then(() => toast({ title: 'Model updated', description: `Now using ${model.split('/').pop()}` }))
      .catch(() => toast({ title: 'Model updated locally', description: 'Backend offline — will sync when connected', variant: 'destructive' }));
  };

  return (
    <ChatApp
      messages={messages}
      isLoading={isLoading}
      onSendMessage={sendMessage}
      onClearHistory={clearHistory}
      pendingApproval={pendingApproval}
      onApprove={approveAction}
      currentPersona={currentPersona}
      onPersonaChange={handlePersonaChange}
      currentModel={currentModel}
      onModelChange={handleModelChange}
      availableModels={availableModels}
      teamPresence={teamPresence}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={setActiveSessionId}
      onNewSession={createSession}
      workspaceId={workspaceId}
      templateId={templateId}
      storageType={storageType}
      autonomyLevel={autonomyLevel}
      autonomyExpiresAt={autonomyExpiresAt}
      onAutonomyChange={onAutonomyChange}
      onContextRail={onContextRail}
    />
  );
};

export default ChatWindowInstance;
