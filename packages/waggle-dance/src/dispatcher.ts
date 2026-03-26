import type { WaggleMessage, MessageSubtype } from '@waggle/shared';
import { validateMessageTypeCombo } from './protocol.js';

export interface DispatchDeps {
  /** Search memory for a query */
  searchMemory: (query: string) => Promise<string>;
  /** Resolve a capability via the router */
  resolveCapability: (query: string) => Array<{ source: string; name: string; description: string; available: boolean }>;
  /** Spawn a worker for a task delegation */
  spawnWorker: (task: string, role: string, context?: string) => Promise<string>;
}

export interface DispatchResult {
  handled: boolean;
  response?: string;
  error?: string;
}

/**
 * Dispatches Waggle Dance protocol messages to real handlers.
 * Maps message subtypes to orchestrator/agent actions.
 */
export class WaggleDanceDispatcher {
  private deps: DispatchDeps;

  constructor(deps: DispatchDeps) {
    this.deps = deps;
  }

  /** Dispatch a Waggle Dance message to the appropriate handler */
  async dispatch(message: WaggleMessage): Promise<DispatchResult> {
    // Validate the message type-subtype combo
    if (!validateMessageTypeCombo(message.type, message.subtype)) {
      return { handled: false, error: `Invalid message: ${message.type}/${message.subtype}` };
    }

    switch (message.subtype) {
      case 'task_delegation':
        return this.handleTaskDelegation(message);
      case 'knowledge_check':
        return this.handleKnowledgeCheck(message);
      case 'skill_request':
        return this.handleSkillRequest(message);
      case 'skill_share':
        return this.handleSkillShare(message);
      default:
        return { handled: false, error: `Unhandled subtype: ${message.subtype}` };
    }
  }

  private async handleTaskDelegation(message: WaggleMessage): Promise<DispatchResult> {
    const task = (message.content.task as string) ?? '';
    const role = (message.content.role as string) ?? 'analyst';
    const context = (message.content.context as string) ?? undefined;

    if (!task) {
      return { handled: false, error: 'task_delegation requires content.task' };
    }

    try {
      const result = await this.deps.spawnWorker(task, role, context);
      return { handled: true, response: result };
    } catch (err) {
      return { handled: false, error: `Worker spawn failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private async handleKnowledgeCheck(message: WaggleMessage): Promise<DispatchResult> {
    const query = (message.content.query as string) ?? (message.content.topic as string) ?? '';
    if (!query) {
      return { handled: false, error: 'knowledge_check requires content.query or content.topic' };
    }

    try {
      const result = await this.deps.searchMemory(query);
      return { handled: true, response: result };
    } catch (err) {
      return { handled: false, error: `Memory search failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private async handleSkillShare(message: WaggleMessage): Promise<DispatchResult> {
    const skillName = (message.content.name as string) ?? (message.content.skill as string) ?? '';
    const skillContent = (message.content.content as string) ?? '';

    if (!skillName || !skillContent) {
      return { handled: false, error: 'skill_share requires content.name and content.content' };
    }

    // Return parsed skill data — the caller (local server / WS handler) handles persistence.
    return {
      handled: true,
      response: JSON.stringify({
        action: 'install_shared_skill',
        skillName,
        skillContent,
        sharedBy: (message.content.sharedBy as string) ?? 'unknown',
      }),
    };
  }

  private async handleSkillRequest(message: WaggleMessage): Promise<DispatchResult> {
    const query = (message.content.skill as string) ?? (message.content.query as string) ?? '';
    if (!query) {
      return { handled: false, error: 'skill_request requires content.skill or content.query' };
    }

    const routes = this.deps.resolveCapability(query);
    if (routes.length === 0) {
      return { handled: true, response: `No capability found for "${query}"` };
    }

    const available = routes.filter(r => r.available);
    const routeList = routes
      .map(r => `- [${r.source}] ${r.name}: ${r.description} (${r.available ? 'available' : 'not available'})`)
      .join('\n');

    return {
      handled: true,
      response: `Found ${routes.length} capabilities (${available.length} available):\n${routeList}`,
    };
  }
}
