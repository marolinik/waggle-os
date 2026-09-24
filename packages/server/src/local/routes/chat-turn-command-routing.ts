/**
 * Slash-command routing for a chat turn, and the replies that end a turn
 * without the agent loop.
 *
 * Extract Method on the POST /api/chat handler (TD-CHAT-3 slice 16c), moved
 * verbatim with the canned-reply pacing constants. A slash command is
 * answered by its canned reply, by the "requires AI" reply when it asks for
 * the agent loop and no model is ready, or rerouted into the loop; a plain
 * message with no model ready gets the setup-required reply. Returns
 * `{ ended: true }` when the turn already finished its stream (a command
 * reply, or a cancellation) and otherwise whether the agent loop runs, on
 * which rerouted message.
 */
import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { AGENT_LOOP_REROUTE_PREFIX, type Orchestrator } from '@waggle/agent';
import { persistMessage, type ChatHistoryMessage } from './chat-persistence.js';
import type { TurnMutationPolicy } from './chat-helpers.js';
import type { TurnRetention } from './chat-turn-retention.js';
import type { buildChatCommandContext } from './chat.js';

/** Per-word pacing when a canned reply is streamed: slash-command output. */
const COMMAND_REPLY_WORD_DELAY_MS = 10;
/** Per-word pacing for the "No AI model is ready" setup reply. */
const SETUP_REQUIRED_REPLY_WORD_DELAY_MS = 15;

export interface TurnCommandRoutingInput {
  server: FastifyInstance;
  message: string;
  modelAvailable: boolean;
  turnSignal: AbortSignal;
  sendEvent: (event: string, data: unknown) => void;
  raw: ServerResponse;
  history: ChatHistoryMessage[];
  turnMutationPolicy: TurnMutationPolicy;
  sessionPersistenceDataDir: string;
  activeWorkspaceId: string;
  sessionId: string;
  sessionOrch: Orchestrator;
  executionWorkspaceId: string | undefined;
  persistedMemoryReadAllowed: boolean;
  retention: TurnRetention;
  /** Passed in: importing it from chat.ts would be a runtime cycle. */
  buildChatCommandContext: typeof buildChatCommandContext;
}

/** `ended`: the turn already finished its stream. */
export type TurnCommandRouting =
  | { ended: true }
  | { ended: false; shouldRunAgentLoop: boolean; reroutedMessage: string | undefined };

export async function routeTurnCommand(input: TurnCommandRoutingInput): Promise<TurnCommandRouting> {
  const {
    server, message, modelAvailable, turnSignal, sendEvent, raw, history, turnMutationPolicy,
    sessionPersistenceDataDir, activeWorkspaceId, sessionId, sessionOrch, executionWorkspaceId,
    persistedMemoryReadAllowed, retention, buildChatCommandContext,
  } = input;

  // Rerouted message from slash command processing — set by the
  // AGENT_LOOP_REROUTE_PREFIX branch of the command dispatch, read by
  // `hasReroute`/`agentMessage` and the last-user-message swap before the loop.
  let reroutedMessage: string | undefined;

  // Streams a canned assistant reply word by word, persists it unless the
  // turn denies conversation history, and emits the terminal `done` event.
  // Resolves false when the turn was aborted before `done` was sent.
  // Does not end the stream: the caller owns `raw.end()`. The two
  // slash-command callers call it; the setup-required caller
  // deliberately does not, and reaches the handler's outer `finally`
  // through the skipped agent-loop block instead.
  const streamCannedReply = async (text: string, wordDelayMs: number): Promise<boolean> => {
    for (const word of text.split(' ')) {
      if (turnSignal.aborted) return false;
      sendEvent('token', { content: word + ' ' });
      await new Promise((r) => setTimeout(r, wordDelayMs));
    }
    if (turnSignal.aborted) return false;
    if (!turnMutationPolicy.denyConversationHistory) {
      history.push({ role: 'assistant', content: text });
      persistMessage(sessionPersistenceDataDir, activeWorkspaceId, sessionId, { role: 'assistant', content: text });
    }
    sendEvent('done', {
      content: text,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      toolsUsed: [],
    });
    return true;
  };

  // ── Slash command routing (works even when no model is ready) ──
  if (turnSignal.aborted) return { ended: true };
  const { commandRegistry } = server.agentState;
  const isSlashCommand = commandRegistry.isCommand(message);
  if (isSlashCommand) {
    const cmdContext = buildChatCommandContext({
      server,
      orchestrator: sessionOrch,
      executionWorkspaceId,
      sessionId,
      turnMutationPolicy,
    });
    const marketplaceSubcommand = message.trim().match(
      /^\/(?:marketplace|mp|market)\s+(installed|install|sync)\b/i,
    )?.[1]?.toLowerCase();
    const blocksMarketplaceRead = marketplaceSubcommand === 'installed'
      && !persistedMemoryReadAllowed;
    const blocksMarketplaceMutation = (marketplaceSubcommand === 'install'
      || marketplaceSubcommand === 'sync')
      && (!persistedMemoryReadAllowed || !retention.allowDerivedPersistence);
    const cmdResult = blocksMarketplaceRead || blocksMarketplaceMutation
      ? 'Persisted marketplace state is disabled for this turn.'
      : await commandRegistry.execute(message, cmdContext);

    // Check if the command wants to be re-processed through the agent loop
    if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && modelAvailable) {
      // Extract the rewritten message and fall through to agent loop processing
      const rerouted = cmdResult.slice(AGENT_LOOP_REROUTE_PREFIX.length);
      sendEvent('step', { content: `Processing /${message.trim().split(/\s+/)[0].slice(1)} via AI...` });
      // Replace the message in history with the original slash command (already persisted)
      // and process the rewritten message through the agent loop below
      // We achieve this by NOT returning here — the code falls through to the agent loop
      // with the rerouted message replacing the original
      reroutedMessage = rerouted;
    } else if (cmdResult.startsWith(AGENT_LOOP_REROUTE_PREFIX) && !modelAvailable) {
      const cmdName = message.trim().split(/\s+/)[0];
      const friendlyError = `**${cmdName} requires AI** — This command needs a working LLM connection.\n\nConfigure an API key in Settings > API Keys, then try again.`;
      if (!(await streamCannedReply(friendlyError, COMMAND_REPLY_WORD_DELAY_MS))) return { ended: true };
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return { ended: true }; // explicit terminal — don't fall through to agent loop
    } else {
      // Stream the command result as SSE tokens and persist it
      if (!(await streamCannedReply(cmdResult, COMMAND_REPLY_WORD_DELAY_MS))) return { ended: true };
      if (!raw.destroyed && !raw.writableEnded) raw.end();
      return { ended: true }; // explicit terminal — don't fall through to agent loop
    }
  }

  // Check if a slash command requested agent-loop rerouting.
  // A reroute is the command asking for the loop, whatever its body says;
  // reading the body as a boolean let an empty one end the turn with no
  // answer and no done (TD-CHAT-25).
  const hasReroute = reroutedMessage !== undefined;
  const shouldRunAgentLoop = hasReroute || (!isSlashCommand && modelAvailable);
  const shouldReplySetupRequired = !hasReroute && !isSlashCommand && !modelAvailable;

  if (shouldReplySetupRequired) {
    // Setup-required mode — respond without pretending the user's input
    // was answered. The raw turn is still persisted for continuity.
    const setupRequiredReply = '**No AI model is ready.**\n\nConfigure a provider key in Settings > API Keys, or install and verify a local model in Settings > Models, then try again.';
    // Persist the setup-required reply so session continuity is maintained
    if (!(await streamCannedReply(setupRequiredReply, SETUP_REQUIRED_REPLY_WORD_DELAY_MS))) return { ended: true };
  }

  return { ended: false, shouldRunAgentLoop, reroutedMessage };
}
