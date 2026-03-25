import { useState, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { adapter } from '@/lib/adapter';
import ChatApp from './ChatApp';

// Fallback models shown when backend is offline
const FALLBACK_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-3-5-sonnet-20241022',
  'claude-3-haiku-20240307',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'llama-3.1-70b',
  'llama-3.1-8b',
  'deepseek-chat',
  'mistral-large-latest',
];

interface ChatWindowInstanceProps {
  workspaceId: string;
  workspaceName?: string;
  initialPersona?: string;
}

const ChatWindowInstance = ({ workspaceId, workspaceName, initialPersona }: ChatWindowInstanceProps) => {
  const { sessions, activeSessionId, setActiveSessionId, createSession } = useSessions(workspaceId);
  const { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction } = useChat({
    workspaceId,
    sessionId: activeSessionId,
  });

  const [currentPersona, setCurrentPersona] = useState(initialPersona || 'analytics');
  const [currentModel, setCurrentModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

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
      } catch {
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
      } catch {
        setCurrentModel(FALLBACK_MODELS[0]);
      }
    };

    fetchModels();
    fetchCurrentModel();
  }, []);

  const handleModelChange = (model: string) => {
    setCurrentModel(model);
    adapter.setModel(model).catch(() => {});
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
      onPersonaChange={setCurrentPersona}
      currentModel={currentModel}
      onModelChange={handleModelChange}
      availableModels={availableModels}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={setActiveSessionId}
      onNewSession={createSession}
      workspaceId={workspaceId}
    />
  );
};

export default ChatWindowInstance;
