/**
 * AI-OS #5 — the tool-adapter registry. Pure data: the built-in manifests
 * (source of truth in @waggle/shared) merged with validated third-party
 * manifests from the loader. Built-in ids always win a collision so a
 * third-party file can never hijack a first-party tool.
 */
import { BUILTIN_TOOL_MANIFESTS, type ToolManifest } from '@waggle/shared';
import { loadThirdPartyManifests, type ManifestLoaderDeps } from './tool-manifest-loader.js';

export function getToolRegistry(deps?: ManifestLoaderDeps): ToolManifest[] {
  const builtins = [...BUILTIN_TOOL_MANIFESTS];
  const builtinIds = new Set(builtins.map((m) => m.id));
  const thirdParty = loadThirdPartyManifests(deps).filter((m) => !builtinIds.has(m.id));
  return [...builtins, ...thirdParty];
}
