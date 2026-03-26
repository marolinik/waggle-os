/**
 * OpenAI-compatible chat completions adapter.
 *
 * Works with any provider that exposes the standard
 * POST /v1/chat/completions endpoint (OpenAI, Groq, Together,
 * Mistral, LiteLLM proxy, etc.).
 */

import type { ResolvedModel } from '../model-router.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Send a chat completion request to an OpenAI-compatible API.
 *
 * @param resolved  - Provider details from ModelRouter.resolve()
 * @param messages  - Conversation history
 * @param systemPrompt - Optional system prompt (prepended as a system message)
 */
export async function openaiChat(
  resolved: ResolvedModel,
  messages: ChatMessage[],
  systemPrompt?: string,
): Promise<ChatResponse> {
  const baseUrl = resolved.baseUrl ?? 'https://api.openai.com/v1';
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const allMessages: ChatMessage[] = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...messages);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model: resolved.model,
      messages: allMessages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `OpenAI-compatible API error ${res.status}: ${res.statusText}${body ? ` — ${body}` : ''}`,
    );
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error('No choices returned from API');
  }

  return {
    content: choice.message.content,
    model: data.model,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
