/**
 * W2C — one display-name formatter for model ids.
 *
 * Model ids surface from three disconnected stores (agent runtime, config.json,
 * LiteLLM /models) and were formatted ad-hoc in ~7 places (raw `split('/').pop()`,
 * date-suffix strips, catalog lookups), so the same model read differently in the
 * top-bar chip, Settings, the New-Agent modal, Telemetry, and chat headers.
 *
 * `formatModelLabel(id, providers?)`:
 *   1. exact catalog match (providers[].models[].name) — the friendly name.
 *   2. heuristic fallback — strip provider prefix + date suffix, surface a
 *      cloud/free tag, title-case the tokens. Load-bearing for Ollama models,
 *      whose catalog `name` equals the bare tag (providers.ts), so lookup alone
 *      can't prettify them.
 */
import type { Provider } from '@/hooks/useProviders';

/** Acronym tokens to uppercase rather than title-case. */
const ACRONYMS = new Set(['gpt', 'glm', 'ai', 'llm']);

function titleCaseToken(tok: string): string {
  if (!tok) return tok;
  if (ACRONYMS.has(tok.toLowerCase())) return tok.toUpperCase();
  return tok.charAt(0).toUpperCase() + tok.slice(1);
}

function heuristicLabel(rawId: string): string {
  let id = rawId;

  // Drop the provider/router prefix (ollama/, openai/, anthropic/, …).
  const slash = id.lastIndexOf('/');
  if (slash >= 0) id = id.slice(slash + 1);

  // Split off a `:cloud` / `:free` / other tag suffix → " (tag)".
  let suffix = '';
  const colon = id.indexOf(':');
  if (colon >= 0) {
    const tag = id.slice(colon + 1);
    id = id.slice(0, colon);
    suffix = tag ? ` (${tag})` : '';
  }

  // Strip a trailing 8-digit date stamp (e.g. -20260115).
  id = id.replace(/-\d{8}$/, '');

  const label = id
    .split(/[-_]/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(' ');

  return (label || id) + suffix;
}

export function formatModelLabel(id: string | undefined | null, providers?: Provider[]): string {
  if (!id) return '';
  if (providers) {
    for (const p of providers) {
      for (const m of p.models) {
        if (m.id === id && m.name && m.name !== id) return m.name;
      }
    }
  }
  return heuristicLabel(id);
}
