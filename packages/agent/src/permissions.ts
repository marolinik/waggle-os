import type { ToolDefinition } from './tools.js';

export const READONLY_TOOLS = [
  'read_file', 'search_files', 'search_content',
  'git_status', 'git_diff', 'git_log',
  'web_search', 'web_fetch',
  'show_plan', 'search_memory',
  'get_identity', 'get_awareness',
  'query_knowledge', 'query_audit',
];

export class PermissionManager {
  private blacklist: Set<string>;
  private whitelist: Set<string> | null;

  constructor(config: { blacklist?: string[]; whitelist?: string[] } = {}) {
    this.blacklist = new Set(config.blacklist ?? []);
    this.whitelist = config.whitelist ? new Set(config.whitelist) : null;
  }

  static sandbox(): PermissionManager {
    return new PermissionManager({ whitelist: READONLY_TOOLS });
  }

  isAllowed(toolName: string): boolean {
    if (this.blacklist.has(toolName)) return false;
    if (this.whitelist && !this.whitelist.has(toolName)) return false;
    return true;
  }

  filterTools(tools: ToolDefinition[]): ToolDefinition[] {
    return tools.filter(t => this.isAllowed(t.name));
  }
}
