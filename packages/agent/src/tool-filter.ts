import type { ToolDefinition } from './tools.js';

const CODE_TOOLS = new Set([
  'bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content',
  'git_status', 'git_diff', 'git_log', 'git_commit',
]);

const RESEARCH_TOOLS = new Set([
  'web_search', 'web_fetch', 'search_memory', 'get_identity', 'get_awareness',
  'query_knowledge', 'read_file', 'search_files', 'search_content',
  // Connector discovery is research-flavored — the agent needs it when
  // the user asks what integrations exist or how to plug in a service.
  'find_connector', 'list_connector_categories',
]);

export type ToolContext = 'general' | 'code' | 'research';

export interface ToolFilterConfig {
  enabled_tools?: string[];
  disabled_tools?: string[];
}

export function filterToolsForContext(
  tools: ToolDefinition[],
  context: ToolContext,
  config?: ToolFilterConfig,
): ToolDefinition[] {
  let filtered: ToolDefinition[];

  if (config?.enabled_tools) {
    const allowed = new Set(config.enabled_tools);
    filtered = tools.filter(t => allowed.has(t.name));
  } else if (context === 'code') {
    filtered = tools.filter(t => CODE_TOOLS.has(t.name));
  } else if (context === 'research') {
    filtered = tools.filter(t => RESEARCH_TOOLS.has(t.name));
  } else {
    filtered = [...tools];
  }

  if (config?.disabled_tools) {
    const disabled = new Set(config.disabled_tools);
    filtered = filtered.filter(t => !disabled.has(t.name));
  }

  return filtered;
}

/**
 * Dynamic availability filter — runs each tool's checkAvailability function
 * and excludes tools that return false.
 *
 * Tools without checkAvailability are always included.
 * Catches exceptions in checkAvailability (treats as unavailable).
 */
export function filterAvailableTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(t => {
    if (!t.checkAvailability) return true;
    try {
      return t.checkAvailability();
    } catch {
      return false; // Broken check = unavailable
    }
  });
}

/**
 * PM-6: Filter tools to only those that work offline (no LLM needed).
 * Returns tools where offlineCapable is explicitly true.
 */
export function filterOfflineTools(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.filter(t => t.offlineCapable === true);
}

/**
 * PM-6: Get the list of tool names that are offline-capable.
 */
export function getOfflineCapableToolNames(tools: ToolDefinition[]): string[] {
  return tools.filter(t => t.offlineCapable === true).map(t => t.name);
}
