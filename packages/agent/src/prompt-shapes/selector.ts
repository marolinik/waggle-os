/**
 * Prompt shape selector — picks the right PromptShape for a given model
 * alias. Exact matches override prefix patterns; both override the default.
 * CLI override bypasses everything except validation.
 *
 * Per sprint plan §1.2: "auto-select by model alias; CLI override".
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type PromptShape } from './types.js';
import { claudeShape } from './claude.js';
import { qwenThinkingShape } from './qwen-thinking.js';
import { qwenNonThinkingShape } from './qwen-non-thinking.js';
import { gptShape } from './gpt.js';
import { genericSimpleShape } from './generic-simple.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConfigSchema {
  default: string;
  exact_aliases: Record<string, string>;
  prefix_patterns: Array<{ prefix: string; shape: string }>;
}

/** Static registry of all shipped shapes. New shapes register here. */
export const REGISTRY: Record<string, PromptShape> = {
  claude: claudeShape,
  'qwen-thinking': qwenThinkingShape,
  'qwen-non-thinking': qwenNonThinkingShape,
  gpt: gptShape,
  'generic-simple': genericSimpleShape,
};

/**
 * Canonical mutation API for the prompt-shape REGISTRY.
 *
 * BACKGROUND (manifest v7 Amendment 8 §canonical_mutation_api): under tsx +
 * Node ESM with workspace path resolution, importing REGISTRY via a deep
 * relative path (e.g., '../../../../packages/agent/src/prompt-shapes/selector.js')
 * vs via the package path '@waggle/agent' produces TWO distinct module
 * instances, each with its own REGISTRY object. Mutations to one instance
 * do NOT propagate to the other. This was confirmed empirically via the
 * Gen 1 partial run b5avslp51 + diagnostic probe (probe-registry-injection.ts).
 *
 * To inject a runtime-defined shape (e.g., a GEPA mutation candidate) into
 * the REGISTRY in a way that selectShape() — wherever it's called from —
 * can see, callers MUST import this function from '@waggle/agent' (the same
 * import path the agent-loop uses internally) and invoke it. Direct
 * `(REGISTRY as any)[name] = shape` assignment from a non-package import
 * path will silently mutate the wrong instance.
 *
 * RULE (Amendment 8 §lint_rule_or_grep_check): no direct REGISTRY assignment
 * outside this function. Codebase grep should return zero matches for
 * `REGISTRY[`<key>`] = ` outside selector.ts.
 *
 * @param name unique shape name (typically `<base-shape>-<variant>`, e.g.
 *             `claude-gen1-v1`); empty string rejected.
 * @param shape PromptShape object satisfying the public contract.
 * @throws if `name` is empty or `shape` is missing required PromptShape fields.
 */
export function registerShape(name: string, shape: PromptShape): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('prompt-shapes registerShape: name must be a non-empty string');
  }
  if (!shape || typeof shape !== 'object' || typeof shape.systemPrompt !== 'function') {
    throw new Error(
      `prompt-shapes registerShape: shape for "${name}" missing required PromptShape fields ` +
      `(expected object with systemPrompt method)`,
    );
  }
  REGISTRY[name] = shape;
}

let cachedConfig: ConfigSchema | null = null;
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '../../config/model-prompt-shapes.json');

function loadConfig(configPath?: string): ConfigSchema {
  if (cachedConfig && !configPath) return cachedConfig;
  const resolvedPath = configPath ?? DEFAULT_CONFIG_PATH;
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown> & ConfigSchema;
  // Validate required fields are present.
  if (typeof parsed.default !== 'string') {
    throw new Error(`prompt-shapes selector: config at ${resolvedPath} missing "default" field`);
  }
  if (typeof parsed.exact_aliases !== 'object' || parsed.exact_aliases === null) {
    throw new Error(`prompt-shapes selector: config at ${resolvedPath} missing "exact_aliases" field`);
  }
  if (!Array.isArray(parsed.prefix_patterns)) {
    throw new Error(`prompt-shapes selector: config at ${resolvedPath} missing "prefix_patterns" array`);
  }
  if (!configPath) cachedConfig = parsed;
  return parsed;
}

/** Reset the cached config (test helper; not part of stable API). */
export function _resetConfigCache(): void {
  cachedConfig = null;
}

export interface SelectShapeOptions {
  /** Override the auto-selected shape. Must be a valid registered shape name. */
  override?: string;
  /** Override the config file location (test/integration use). */
  configPath?: string;
}

/**
 * Pick a prompt shape for the given model alias. Resolution order:
 *   1. `override` if provided (validated against REGISTRY)
 *   2. exact alias match in config.exact_aliases
 *   3. longest matching prefix in config.prefix_patterns
 *   4. config.default
 *
 * Throws if the resolved shape name is not registered. Throws if override
 * names a non-registered shape.
 */
export function selectShape(modelAlias: string, options: SelectShapeOptions = {}): PromptShape {
  const config = loadConfig(options.configPath);

  if (options.override) {
    const shape = REGISTRY[options.override];
    if (!shape) {
      throw new Error(
        `prompt-shapes selector: override "${options.override}" not in REGISTRY. ` +
        `Available: ${Object.keys(REGISTRY).join(', ')}`,
      );
    }
    return shape;
  }

  // 1. Exact alias match.
  const exactName = config.exact_aliases[modelAlias];
  if (exactName) {
    return resolve(exactName, modelAlias);
  }

  // 2. Longest matching prefix wins (so "claude-opus-" beats "claude-").
  const sortedPatterns = [...config.prefix_patterns].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { prefix, shape } of sortedPatterns) {
    if (modelAlias.startsWith(prefix)) {
      return resolve(shape, modelAlias);
    }
  }

  // 3. Fallback to config.default.
  return resolve(config.default, modelAlias);
}

function resolve(shapeName: string, alias: string): PromptShape {
  const shape = REGISTRY[shapeName];
  if (!shape) {
    throw new Error(
      `prompt-shapes selector: shape "${shapeName}" (resolved for alias "${alias}") ` +
      `not in REGISTRY. Available: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  return shape;
}

/** Inspector: list all available shape names from the registry. */
export function listShapes(): string[] {
  return Object.keys(REGISTRY);
}

/** Inspector: get a shape's metadata without invoking its build methods. */
export function getShapeMetadata(name: string) {
  const shape = REGISTRY[name];
  if (!shape) {
    throw new Error(`prompt-shapes selector: unknown shape "${name}"`);
  }
  return shape.metadata;
}
