import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import { useSessions } from '@/hooks/useSessions';
import { toast as showToast, useToast } from '@/hooks/use-toast';
import { adapter, MODEL_SETTINGS_CHANGED_EVENT } from '@/lib/adapter';
import { formatModelLabel } from '@/lib/model-label';
import {
  acknowledgeChatDispatch,
  claimNewChatSessionIntent,
  completeNewChatSessionIntent,
  enqueueChatDispatch,
  usePendingChatDispatch,
  usePendingNewChatSessionIntent,
} from '@/hooks/useChatWidgetState';
import ChatApp from './ChatApp';
import type { ModelCatalogStatus, ModelHealthStatus, TeamMember } from './ChatApp';

type AutonomyLevel = 'normal' | 'trusted' | 'yolo';

interface ChatWindowInstanceProps {
  workspaceId: string;
  workspaceName?: string;
  initialPersona?: string;
  /** Workspace-scoped model already loaded by the shell. */
  initialModel?: string;
  /** QW-1: starter prompt prefilled into the chat input once on first mount. */
  initialMessage?: string;
  /** F2: auto-send the initialMessage once the chat is ready (wizard "Let's go"). */
  autoSendInitial?: boolean;
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
  /** Exact session requested by the active workspace route. Undefined means
   * this kept-alive workspace is hidden and should preserve its selection. */
  preferredSessionId?: string | null;
  /** Records an explicit user session choice in the active route. */
  onSessionNavigate?: (sessionId: string, options?: { replace?: boolean }) => void;
}

const ChatWindowInstance = ({
  workspaceId,
  workspaceName,
  initialPersona,
  initialModel,
  initialMessage,
  autoSendInitial = false,
  templateId,
  storageType,
  onPersonaChange,
  autonomyLevel = 'normal',
  autonomyExpiresAt = null,
  onAutonomyChange,
  onContextRail,
  preferredSessionId,
  onSessionNavigate,
}: ChatWindowInstanceProps) => {
  const [currentPersona, setCurrentPersona] = useState(initialPersona || 'general-purpose');

  // Sync the local persona state when the parent sends a new initialPersona
  // (e.g. when PersonaSwitcher updates the window from outside ChatWindowInstance).
  useEffect(() => {
    if (initialPersona) {
      setCurrentPersona(current => current === initialPersona ? current : initialPersona);
    }
  }, [initialPersona]);

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    revalidateSessions,
    retrySessions,
    loading: sessionLoading,
    creating: sessionCreating,
    error: sessionError,
    listFailed: sessionListFailed,
  } = useSessions(workspaceId, preferredSessionId);
  const onSessionNavigateRef = useRef(onSessionNavigate);
  onSessionNavigateRef.current = onSessionNavigate;
  const isActiveChat = preferredSessionId !== undefined;
  const isActiveChatRef = useRef(isActiveChat);
  const wasActiveChatRef = useRef(isActiveChat);
  isActiveChatRef.current = isActiveChat;

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    onSessionNavigateRef.current?.(sessionId);
  }, [setActiveSessionId]);

  const handleCreateSession = useCallback(async () => {
    const session = await createSession();
    if (session) onSessionNavigateRef.current?.(session.id);
    return session;
  }, [createSession]);

  useEffect(() => {
    if (
      preferredSessionId === undefined
      || sessionLoading
      || !activeSessionId
      || (typeof preferredSessionId === 'string'
        && sessions.some(session => session.id === preferredSessionId))
    ) return;
    onSessionNavigateRef.current?.(activeSessionId, { replace: true });
  }, [activeSessionId, preferredSessionId, sessionLoading, sessions]);

  const [currentModel, setCurrentModel] = useState<string>(initialModel ?? '');
  const [modelHealthStatus, setModelHealthStatus] = useState<ModelHealthStatus>(
    initialModel ? 'checking' : 'unconfigured',
  );
  const currentModelRef = useRef(initialModel ?? '');
  const confirmedModelRef = useRef(initialModel ?? '');
  const initialModelRef = useRef(initialModel);
  const modelRevisionRef = useRef(0);
  const userSelectedModelRef = useRef(false);
  const modelPersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const refreshCurrentModelRef = useRef<() => Promise<void>>(async () => {});
  const refreshModelHealthRef = useRef<(announceChecking?: boolean) => Promise<void>>(async () => {});

  // The shell may finish loading the workspace after this kept-alive chat
  // mounts. Accept that workspace-scoped model until the user makes an
  // explicit per-window choice; a late shell refresh must not overwrite it.
  useEffect(() => {
    initialModelRef.current = initialModel;
    if (!initialModel || userSelectedModelRef.current) return;
    modelRevisionRef.current += 1;
    currentModelRef.current = initialModel;
    confirmedModelRef.current = initialModel;
    setCurrentModel(initialModel);
  }, [initialModel]);

  // chat-session-uuid-title (P2): the server returns a real title derived from the
  // first user message, or null for a brand-new untitled session. Render a friendly
  // placeholder instead of the raw `session-<uuid>` id — covering both null/empty
  // titles and legacy sessions persisted with the id as their title.
  const displaySessions = sessions.map(s =>
    !s.title
      || /^(?:local-)?session-/.test(s.title)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.title)
      ? { ...s, title: 'New session' }
      : s,
  );
  const {
    messages,
    isLoading,
    historyLoaded,
    historyReady = historyLoaded,
    historyStatus,
    historyError,
    retryHistory,
    sendMessage,
    retryLastFailed,
    stopStreaming,
    clearHistory,
    pendingApproval,
    approveAction,
  } = useChat({
    workspaceId,
    sessionId: activeSessionId,
    persona: currentPersona,
    model: currentModel,
    autonomy: { level: autonomyLevel, expiresAt: autonomyExpiresAt },
    onTurnSettled: ({ workspaceId: settledWorkspaceId, sessionId: settledSessionId }) => {
      void revalidateSessions(settledWorkspaceId, settledSessionId);
    },
  });
  const pendingNewChatSession = usePendingNewChatSessionIntent(workspaceId);
  const pendingDispatch = usePendingChatDispatch(workspaceId);
  const dispatchInFlightRef = useRef<string | null>(null);
  const lastHandledDispatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !pendingNewChatSession
      || isLoading
      || sessionLoading
      || sessionCreating
    ) return;
    if (!claimNewChatSessionIntent(workspaceId, pendingNewChatSession.id)) return;

    void (async () => {
      try {
        const session = await handleCreateSession();
        if (session && pendingNewChatSession.initialMessage) {
          enqueueChatDispatch(workspaceId, pendingNewChatSession.initialMessage, session.id);
        }
      } catch {
        // useSessions owns the visible error state; still release the intent.
      } finally {
        completeNewChatSessionIntent(workspaceId, pendingNewChatSession.id);
      }
    })();
  }, [handleCreateSession, isLoading, pendingNewChatSession, sessionCreating, sessionLoading, workspaceId]);

  useEffect(() => {
    if (
      !pendingDispatch
      || !activeSessionId
      || (pendingDispatch.targetSessionId && pendingDispatch.targetSessionId !== activeSessionId)
      || sessionLoading
      || sessionCreating
      || !historyReady
    ) return;
    if (
      dispatchInFlightRef.current === pendingDispatch.id
      || lastHandledDispatchIdRef.current === pendingDispatch.id
    ) return;

    const { id, content } = pendingDispatch;
    dispatchInFlightRef.current = id;
    let accepted = false;
    const discardUnaccepted = () => {
      if (accepted) return;
      lastHandledDispatchIdRef.current = id;
      acknowledgeChatDispatch(workspaceId, id);
      showToast({
        title: 'Message not sent',
        description: 'The chat was not ready. Try sending the message again.',
        variant: 'destructive',
      });
    };
    void sendMessage(content, {
      onAccepted: () => {
        accepted = true;
        lastHandledDispatchIdRef.current = id;
        acknowledgeChatDispatch(workspaceId, id);
      },
    })
      .then(discardUnaccepted)
      .catch(discardUnaccepted)
      .finally(() => {
        if (dispatchInFlightRef.current === id) dispatchInFlightRef.current = null;
      });
  }, [activeSessionId, historyReady, pendingDispatch, sendMessage, sessionCreating, sessionLoading, workspaceId]);

  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelCatalogStatus, setModelCatalogStatus] = useState<ModelCatalogStatus>('loading');
  const refreshModelsRef = useRef<(announceLoading?: boolean) => Promise<void>>(async () => {});
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
    let modelRequest = 0;
    let currentModelRequest = 0;
    let modelFetchInFlight = false;
    let currentModelFetchInFlight = false;

    // The sidecar merges LiteLLM, provider API catalogs, and local runtime models.
    // Keep an empty list on outage rather than presenting model IDs that may no
    // longer exist at the provider.
    const fetchModels = async (announceLoading = false) => {
      if (announceLoading) setModelCatalogStatus('loading');
      if (modelFetchInFlight) return;
      modelFetchInFlight = true;
      const request = ++modelRequest;
      try {
        const models = await adapter.getModels();
        if (cancelled || request !== modelRequest) return;
        modelsLanded = true;
        if (models && models.length > 0) {
          setAvailableModels(models);
          setModelCatalogStatus('ready');
        } else {
          setAvailableModels([]);
          setModelCatalogStatus('empty');
        }
      } catch (err) {
        console.error('[ChatWindowInstance] fetch models failed:', err);
        if (!cancelled && request === modelRequest) {
          setAvailableModels([]);
          setModelCatalogStatus('unavailable');
        }
      } finally {
        modelFetchInFlight = false;
      }
    };
    refreshModelsRef.current = fetchModels;

    // Try fetching the current active model from the sidecar. Also retries on
    // transient failure — the initial render may race the sidecar spawning.
    const fetchCurrentModel = async (supersede = false) => {
      if (initialModelRef.current || userSelectedModelRef.current) {
        currentLanded = true;
        return;
      }
      if (currentModelFetchInFlight && !supersede) return;
      currentModelFetchInFlight = true;
      const request = ++currentModelRequest;
      const loadRevision = modelRevisionRef.current;
      try {
        const model = await adapter.getModel();
        if (
          cancelled
          || request !== currentModelRequest
          || userSelectedModelRef.current
          || loadRevision !== modelRevisionRef.current
        ) {
          return;
        }
        if (typeof model === 'string' && model) {
          currentModelRef.current = model;
          confirmedModelRef.current = model;
          setCurrentModel(model);
          currentLanded = true;
          return;
        }
        const settings = await adapter.getSettings();
        if (
          cancelled
          || request !== currentModelRequest
          || userSelectedModelRef.current
          || loadRevision !== modelRevisionRef.current
        ) {
          return;
        }
        const fromSettings = (settings as { defaultModel?: string; model?: string }).defaultModel
          ?? (settings as { model?: string }).model;
        if (fromSettings) {
          currentModelRef.current = fromSettings;
          confirmedModelRef.current = fromSettings;
          setCurrentModel(fromSettings);
          currentLanded = true;
        }
      } catch (err) {
        console.error('[ChatWindowInstance] fetch current model failed:', err);
      } finally {
        if (request === currentModelRequest) currentModelFetchInFlight = false;
      }
    };
    refreshCurrentModelRef.current = fetchCurrentModel;

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

    const refreshModelsOnFocus = () => {
      if (!isActiveChatRef.current) return;
      void fetchModels();
      void fetchCurrentModel();
      void refreshModelHealthRef.current(true);
    };
    const refreshInheritedModel = () => {
      if (!isActiveChatRef.current) return;
      void fetchCurrentModel(true);
    };
    window.addEventListener('focus', refreshModelsOnFocus);
    window.addEventListener(MODEL_SETTINGS_CHANGED_EVENT, refreshInheritedModel);
    return () => {
      cancelled = true;
      currentModelRequest += 1;
      refreshModelsRef.current = async () => {};
      refreshCurrentModelRef.current = async () => {};
      window.removeEventListener('focus', refreshModelsOnFocus);
      window.removeEventListener(MODEL_SETTINGS_CHANGED_EVENT, refreshInheritedModel);
      clearInterval(retryInterval);
    };
  }, []);

  useEffect(() => {
    if (storageType !== 'team') {
      setTeamPresence([]);
      return;
    }

    let cancelled = false;
    let fetchInFlight = false;
    const fetchTeam = async () => {
      if (fetchInFlight) return;
      fetchInFlight = true;
      try {
        const members = await adapter.getTeamMembers();
        if (!cancelled) setTeamPresence(members.filter(m => m.status === 'online'));
      } catch (err) {
        console.error('[ChatWindowInstance] fetch team failed:', err);
        if (!cancelled) setTeamPresence([]);
      } finally {
        fetchInFlight = false;
      }
    };
    void fetchTeam();
    const teamInterval = setInterval(fetchTeam, 10000);
    return () => {
      cancelled = true;
      clearInterval(teamInterval);
    };
  }, [storageType]);

  useEffect(() => {
    let cancelled = false;
    let request = 0;

    const probeSelectedModel = async (announceChecking = true) => {
      const model = currentModelRef.current.trim();
      const probeRequest = ++request;
      if (!model) {
        setModelHealthStatus('unconfigured');
        return;
      }
      if (announceChecking) setModelHealthStatus('checking');
      try {
        const result = await adapter.probeModel(model);
        if (
          cancelled
          || probeRequest !== request
          || currentModelRef.current.trim() !== model
        ) return;
        setModelHealthStatus(result.configured && result.verified ? 'ready' : 'unavailable');
      } catch (err) {
        console.error('[ChatWindowInstance] probe selected model failed:', err);
        if (
          !cancelled
          && probeRequest === request
          && currentModelRef.current.trim() === model
        ) setModelHealthStatus('unavailable');
      }
    };

    refreshModelHealthRef.current = probeSelectedModel;
    void probeSelectedModel();
    return () => {
      cancelled = true;
      refreshModelHealthRef.current = async () => {};
    };
  }, [currentModel]);

  useEffect(() => {
    const wasActive = wasActiveChatRef.current;
    wasActiveChatRef.current = isActiveChat;
    if (wasActive || !isActiveChat) return;
    void refreshModelsRef.current(true);
    void refreshCurrentModelRef.current();
    void refreshModelHealthRef.current(true);
  }, [isActiveChat]);

  const handleRetryModels = useCallback(() => {
    void refreshModelsRef.current(true);
    void refreshModelHealthRef.current(true);
  }, []);

  const handleModelChange = (model: string) => {
    if (!model || model === currentModelRef.current) return;
    userSelectedModelRef.current = true;
    const revision = ++modelRevisionRef.current;
    currentModelRef.current = model;
    setCurrentModel(model);
    // Serialize workspace writes so two rapid clicks cannot resolve out of
    // order. The request itself already carries `model`, so the optimistic
    // selection is safe for an immediate Send while persistence completes.
    modelPersistenceRef.current = modelPersistenceRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await adapter.patchWorkspace(workspaceId, { model });
          confirmedModelRef.current = model;
          if (revision === modelRevisionRef.current) {
            toast({ title: 'Model updated', description: `Now using ${formatModelLabel(model)}` });
          }
        } catch (err) {
          console.error('[ChatWindowInstance] persist model failed:', err);
          if (revision !== modelRevisionRef.current) return;
          const confirmedModel = confirmedModelRef.current;
          currentModelRef.current = confirmedModel;
          setCurrentModel(confirmedModel);
          toast({
            title: 'Model change failed',
            description: confirmedModel
              ? `Still using ${formatModelLabel(confirmedModel)}`
              : 'The previous model remains active.',
            variant: 'destructive',
          });
        }
      });
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
      modelCatalogStatus={modelCatalogStatus}
      modelHealthStatus={modelHealthStatus}
      onRetryModels={handleRetryModels}
      teamPresence={teamPresence}
      sessions={displaySessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewSession={handleCreateSession}
      sessionCreating={sessionCreating}
      sessionLoading={sessionLoading}
      sessionReady={!sessionLoading && !sessionCreating && Boolean(activeSessionId)}
      sessionError={sessionError}
      sessionListFailed={sessionListFailed}
      onRetrySessions={retrySessions}
      workspaceId={workspaceId}
      templateId={templateId}
      storageType={storageType}
      autonomyLevel={autonomyLevel}
      autonomyExpiresAt={autonomyExpiresAt}
      onAutonomyChange={onAutonomyChange}
      onContextRail={onContextRail}
      initialMessage={initialMessage}
      autoSendInitial={autoSendInitial}
      historyLoaded={historyReady}
      historyStatus={historyStatus}
      historyError={historyError}
      onRetryHistory={retryHistory}
      onRetry={retryLastFailed}
      onStopStreaming={stopStreaming}
    />
  );
};

export default ChatWindowInstance;
