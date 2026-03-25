import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import ChatApp from './ChatApp';

interface ChatWindowInstanceProps {
  workspaceId: string;
  workspaceName?: string;
}

const ChatWindowInstance = ({ workspaceId, workspaceName }: ChatWindowInstanceProps) => {
  const { sessions, activeSessionId, setActiveSessionId, createSession } = useSessions(workspaceId);
  const { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction } = useChat({
    workspaceId,
    sessionId: activeSessionId,
  });

  return (
    <ChatApp
      messages={messages}
      isLoading={isLoading}
      onSendMessage={sendMessage}
      onClearHistory={clearHistory}
      pendingApproval={pendingApproval}
      onApprove={approveAction}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={setActiveSessionId}
      onNewSession={createSession}
      workspaceId={workspaceId}
    />
  );
};

export default ChatWindowInstance;
