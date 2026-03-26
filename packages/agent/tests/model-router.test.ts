import { describe, it, expect } from 'vitest';
import { ModelRouter, createLiteLLMRouter, type ProviderConfig } from '../src/model-router.js';

const testConfig: ProviderConfig = {
  providers: {
    anthropic: {
      apiKey: 'sk-ant-test-key',
      models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
    },
    openai: {
      apiKey: 'sk-openai-test-key',
      models: ['gpt-4o', 'gpt-4o-mini'],
      baseUrl: 'https://api.openai.com/v1',
    },
    groq: {
      apiKey: 'gsk-groq-test-key',
      models: ['llama-3.1-70b-versatile'],
      baseUrl: 'https://api.groq.com/openai/v1',
    },
  },
  defaultModel: 'claude-sonnet-4-20250514',
};

describe('ModelRouter', () => {
  it('resolves provider from model name', () => {
    const router = new ModelRouter(testConfig);
    const resolved = router.resolve('llama-3.1-70b-versatile');
    expect(resolved.provider).toBe('groq');
    expect(resolved.model).toBe('llama-3.1-70b-versatile');
    expect(resolved.apiKey).toBe('gsk-groq-test-key');
    expect(resolved.baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('resolves openai model', () => {
    const router = new ModelRouter(testConfig);
    const resolved = router.resolve('gpt-4o');
    expect(resolved.provider).toBe('openai');
    expect(resolved.model).toBe('gpt-4o');
    expect(resolved.apiKey).toBe('sk-openai-test-key');
    expect(resolved.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('uses default model when none specified', () => {
    const router = new ModelRouter(testConfig);
    const resolved = router.resolve();
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-20250514');
    expect(resolved.apiKey).toBe('sk-ant-test-key');
    expect(resolved.baseUrl).toBeUndefined();
  });

  it('throws on unknown model', () => {
    const router = new ModelRouter(testConfig);
    expect(() => router.resolve('nonexistent-model')).toThrow('Unknown model: nonexistent-model');
  });

  it('lists available models', () => {
    const router = new ModelRouter(testConfig);
    const models = router.listModels();
    expect(models).toContain('claude-sonnet-4-20250514');
    expect(models).toContain('claude-haiku-4-20250514');
    expect(models).toContain('gpt-4o');
    expect(models).toContain('gpt-4o-mini');
    expect(models).toContain('llama-3.1-70b-versatile');
    expect(models).toHaveLength(5);
  });

  it('returns default model name', () => {
    const router = new ModelRouter(testConfig);
    expect(router.getDefaultModel()).toBe('claude-sonnet-4-20250514');
  });
});

describe('createLiteLLMRouter', () => {
  it('creates router with all models pointing to LiteLLM', () => {
    const router = createLiteLLMRouter({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'sk-test',
    });
    const resolved = router.resolve('claude-sonnet');
    expect(resolved.provider).toBe('litellm');
    expect(resolved.baseUrl).toBe('http://localhost:4000/v1');
    expect(resolved.apiKey).toBe('sk-test');
  });

  it('uses custom models list', () => {
    const router = createLiteLLMRouter({
      litellmUrl: 'http://localhost:4000/v1',
      litellmApiKey: 'sk-test',
      models: ['my-model'],
      defaultModel: 'my-model',
    });
    expect(router.listModels()).toEqual(['my-model']);
  });
});
