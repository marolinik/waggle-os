/**
 * Guards the docker-compose LiteLLM env passthrough against drift
 * versus `litellm-config.yaml`.
 *
 * LiteLLM resolves `os.environ/<KEY>` at request time inside the
 * container. Every `api_key: os.environ/XXX` entry in the LiteLLM
 * model list therefore requires a matching `- XXX=${XXX}` line in
 * the docker-compose service `environment:` block. Missing a
 * passthrough means the model registers and looks routable via
 * `GET /v1/models`, but every chat/completions call fails at
 * request time with a provider auth error (caught in the field
 * when testing Qwen3.6-35B-A3B via DashScope — the key was in
 * `.env` but the compose file only piped Anthropic + OpenAI).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const REPO_ROOT = resolve(__dirname, '..');

type LiteLLMConfig = {
  model_list?: Array<{
    model_name?: string;
    litellm_params?: { api_key?: string };
  }>;
};

type ComposeConfig = {
  services?: Record<string, {
    image?: string;
    environment?: string[] | Record<string, string>;
  }>;
};

function loadYaml<T>(relPath: string): T {
  return yaml.load(readFileSync(resolve(REPO_ROOT, relPath), 'utf-8')) as T;
}

/** Pull the unique set of env-var names referenced by litellm-config's model list. */
function collectLiteLLMEnvRefs(config: LiteLLMConfig): Set<string> {
  const refs = new Set<string>();
  for (const entry of config.model_list ?? []) {
    const keyRef = entry.litellm_params?.api_key;
    if (typeof keyRef !== 'string') continue;
    const match = keyRef.match(/^os\.environ\/(.+)$/);
    if (match) refs.add(match[1]);
  }
  return refs;
}

/** Pull the set of env-var names the compose service exposes. */
function collectComposeEnv(env: string[] | Record<string, string> | undefined): Set<string> {
  const names = new Set<string>();
  if (!env) return names;
  if (Array.isArray(env)) {
    for (const entry of env) {
      const [name] = entry.split('=');
      if (name) names.add(name.trim());
    }
  } else {
    for (const name of Object.keys(env)) names.add(name);
  }
  return names;
}

describe('docker-compose LiteLLM env passthrough parity with litellm-config.yaml', () => {
  const litellmConfig = loadYaml<LiteLLMConfig>('litellm-config.yaml');
  const composeConfig = loadYaml<ComposeConfig>('docker-compose.yml');
  const litellmService = composeConfig.services?.litellm;
  const expected = collectLiteLLMEnvRefs(litellmConfig);
  const exposed = collectComposeEnv(litellmService?.environment);

  it('litellm service is defined in docker-compose.yml', () => {
    expect(litellmService).toBeDefined();
    expect(litellmService?.image).toMatch(/litellm/i);
  });

  it('every os.environ/<KEY> referenced in litellm-config has a matching passthrough', () => {
    const missing = [...expected].filter(name => !exposed.has(name));
    expect(
      missing,
      `docker-compose.yml is missing env passthrough for: ${missing.join(', ')} — this will cause chat/completions to fail with provider auth errors even though the model shows up in /v1/models.`,
    ).toEqual([]);
  });

  it('DASHSCOPE_API_KEY is exposed (LOCKED target model Qwen3.6-35B-A3B routes through it)', () => {
    expect(exposed.has('DASHSCOPE_API_KEY')).toBe(true);
  });

  it('exposes LITELLM_MASTER_KEY so the proxy itself is reachable', () => {
    expect(exposed.has('LITELLM_MASTER_KEY')).toBe(true);
  });
});
