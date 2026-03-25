import { useState, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { adapter } from '@/lib/adapter';
import ChatApp from './ChatApp';

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
    adapter.getModels().then(setAvailableModels).catch(() => setAvailableModels([]));
    adapter.getModel().then(setCurrentModel).catch(() => setCurrentModel(''));
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
