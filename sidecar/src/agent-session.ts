import { Orchestrator, type OrchestratorConfig } from '@waggle/agent';
import type { MindDB } from '@waggle/core';
import { createEmbeddingProvider } from '@waggle/core';

export type StreamCallback = (event: StreamEvent) => void;

export interface StreamEvent {
  type: 'token' | 'tool_use' | 'tool_result' | 'done' | 'error';
  data: unknown;
}

export class AgentSession {
  private orchestrator!: Orchestrator;
  private initPromise: Promise<void>;

  constructor(db: MindDB) {
    this.initPromise = this.init(db);
  }

  private async init(db: MindDB): Promise<void> {
    const embeddingProvider = await createEmbeddingProvider({
      targetDimensions: 1024,
    });
    this.orchestrator = new Orchestrator({
      db,
      embedder: embeddingProvider,
    });
  }

  async sendMessage(
    message: string,
    apiKey: string,
    model: string,
    onStream?: StreamCallback,
  ): Promise<string> {
    await this.initPromise;
    const systemPrompt = this.orchestrator.buildSystemPrompt();
    const tools = this.orchestrator.getTools();

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const anthropicTools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: 'object' as const,
          properties: {},
          ...t.parameters,
        },
      }));

      let messages: Array<{ role: 'user' | 'assistant'; content: string | Array<unknown> }> = [
        { role: 'user', content: message },
      ];

      let maxTurns = 10;
      while (maxTurns-- > 0) {
        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: anthropicTools as never,
          messages: messages as never,
        });

        const toolBlocks = response.content.filter((b: { type: string }) => b.type === 'tool_use');
        const textBlocks = response.content.filter((b: { type: string }) => b.type === 'text');

        if (toolBlocks.length === 0) {
          const text = textBlocks.map((b) => (b as { text: string }).text).join('');
          onStream?.({ type: 'done', data: text });
          return text;
        }

        const toolResults: Array<unknown> = [];
        for (const block of toolBlocks) {
          const tb = block as { id: string; name: string; input: Record<string, unknown> };
          onStream?.({ type: 'tool_use', data: { name: tb.name, id: tb.id } });

          try {
            const result = await this.orchestrator.executeTool(tb.name, tb.input);
            onStream?.({ type: 'tool_result', data: { name: tb.name, result } });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tb.id,
              content: result,
            });
          } catch (err) {
            const errMsg = (err as Error).message;
            onStream?.({ type: 'tool_result', data: { name: tb.name, error: errMsg } });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tb.id,
              content: `Error: ${errMsg}`,
              is_error: true,
            });
          }
        }

        messages = [
          ...messages,
          { role: 'assistant', content: response.content as Array<unknown> },
          { role: 'user', content: toolResults as Array<unknown> },
        ];
      }

      return 'Max tool turns reached.';
    } catch (err) {
      const errMsg = (err as Error).message;
      onStream?.({ type: 'error', data: errMsg });

      if (errMsg.includes('API key') || errMsg.includes('authentication')) {
        return 'Please set your API key in Settings to start chatting.';
      }
      return `Error: ${errMsg}`;
    }
  }

  getOrchestrator(): Orchestrator {
    return this.orchestrator;
  }
}
