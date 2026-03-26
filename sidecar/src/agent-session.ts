import { Orchestrator, type OrchestratorConfig } from '@waggle/agent';
import type { MindDB, Embedder } from '@waggle/core';

// Mock embedder for M1 — real embeddings in M2
const mockEmbedder: Embedder = {
  embed: async (text: string) => {
    const arr = new Float32Array(1024);
    const bytes = new TextEncoder().encode(text);
    for (let i = 0; i < Math.min(bytes.length, 1024); i++) {
      arr[i] = (bytes[i] - 128) / 128;
    }
    return arr;
  },
  embedBatch: async (texts: string[]) => {
    const results: Float32Array[] = [];
    for (const text of texts) {
      const arr = new Float32Array(1024);
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < Math.min(bytes.length, 1024); i++) {
        arr[i] = (bytes[i] - 128) / 128;
      }
      results.push(arr);
    }
    return results;
  },
  dimensions: 1024,
};

export type StreamCallback = (event: StreamEvent) => void;

export interface StreamEvent {
  type: 'token' | 'tool_use' | 'tool_result' | 'done' | 'error';
  data: unknown;
}

export class AgentSession {
  private orchestrator: Orchestrator;

  constructor(db: MindDB) {
    this.orchestrator = new Orchestrator({
      db,
      embedder: mockEmbedder,
    });
  }

  async sendMessage(
    message: string,
    apiKey: string,
    model: string,
    onStream?: StreamCallback,
  ): Promise<string> {
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
          const text = textBlocks.map((b: { text: string }) => b.text).join('');
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
