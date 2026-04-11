import { useState, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { useToast } from '@/hooks/use-toast';
import { adapter } from '@/lib/adapter';
import ChatApp from './ChatApp';
import type { TeamMember } from './ChatApp';

// Fallback models shown when backend is offline — latest flagships from top providers
const FALLBACK_MODELS = [
  // Anthropic
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
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

interface ChatWindowInstanceProps {
  workspaceId: string;
  workspaceName?: string;
  initialPersona?: string;
  templateId?: string;
  /**
   * Phase A.2: called when the user changes the persona inside this window.
   * Should update the window's local persona state via useWindowManager.
   * Takes precedence over the legacy workspace-patch path when provided.
   */
  onPersonaChange?: (personaId: string) => void;
}

const ChatWindowInstance = ({ workspaceId, workspaceName, initialPersona, templateId, onPersonaChange }: ChatWindowInstanceProps) => {
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
    // Try fetching models from the backend (litellm models filtered by vault keys)
    const fetchModels = async () => {
      try {
        const models = await adapter.getModels();
        if (models && models.length > 0) {
          setAvailableModels(models);
        } else {
          setAvailableModels(FALLBACK_MODELS);
        }
      } catch (err) {
        console.error('[ChatWindowInstance] fetch models failed:', err);
        setAvailableModels(FALLBACK_MODELS);
      }
    };

    // Try fetching current active model from settings/agent
    const fetchCurrentModel = async () => {
      try {
        const model = await adapter.getModel();
        if (typeof model === 'string' && model) {
          setCurrentModel(model);
        } else {
          // Try from settings
          const settings = await adapter.getSettings();
          setCurrentModel(settings.model || FALLBACK_MODELS[0]);
        }
      } catch (err) {
        console.error('[ChatWindowInstance] fetch current model failed:', err);
        setCurrentModel(FALLBACK_MODELS[0]);
      }
    };

    fetchModels();
    fetchCurrentModel();

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
    return () => clearInterval(teamInterval);
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
    />
  );
};

export default ChatWindowInstance;
