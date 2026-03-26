/**
 * useAgentStatus — Polls agent status (tokens, cost, model) and
 * manages model selection + available models list.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WaggleService } from '@waggle/ui';

export interface UseAgentStatusOptions {
  /** WaggleService instance for getAgentStatus() */
  service: WaggleService;
  /** Server base URL for model endpoints */
  serverBaseUrl: string;
  /** Polling interval in ms (default: 30000) */
  pollInterval?: number;
}

export interface UseAgentStatusReturn {
  agentTokens: number;
  agentCost: number;
  agentModel: string;
  setAgentModel: React.Dispatch<React.SetStateAction<string>>;
  availableModels: string[];
  handleModelSelect: (newModel: string, addSystemMessage: (msg: string) => void) => Promise<void>;
}

export function useAgentStatus({
  service,
  serverBaseUrl,
  pollInterval = 30_000,
}: UseAgentStatusOptions): UseAgentStatusReturn {
  const [agentTokens, setAgentTokens] = useState(0);
  const [agentCost, setAgentCost] = useState(0);
  const [agentModel, setAgentModel] = useState('claude-sonnet-4-6');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Initial fetch + polling
  useEffect(() => {
    service.getAgentStatus().then((status) => {
      setAgentTokens(status.tokensUsed);
      setAgentCost(status.estimatedCost);
      setAgentModel(status.model);
    }).catch(() => {});

    // Fetch available models for the picker
    fetch(`${serverBaseUrl}/api/litellm/models`)
      .then(r => r.ok ? r.json() as Promise<{ models: string[] }> : null)
      .then(data => { if (data?.models) setAvailableModels(data.models); })
      .catch(() => {});

    const poll = setInterval(() => {
      service.getAgentStatus().then((status) => {
        setAgentTokens(status.tokensUsed);
        setAgentCost(status.estimatedCost);
        setAgentModel(status.model);
      }).catch(() => {});
    }, pollInterval);
    return () => clearInterval(poll);
  }, [service, serverBaseUrl, pollInterval]);

  const handleModelSelect = useCallback(async (newModel: string, addSystemMessage: (msg: string) => void) => {
    try {
      await fetch(`${serverBaseUrl}/api/agent/model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      });
      setAgentModel(newModel);
      addSystemMessage(`Switched to model: **${newModel}**`);
    } catch {
      addSystemMessage('Failed to switch model.');
    }
  }, [serverBaseUrl]);

  return {
    agentTokens,
    agentCost,
    agentModel,
    setAgentModel,
    availableModels,
    handleModelSelect,
  };
}
