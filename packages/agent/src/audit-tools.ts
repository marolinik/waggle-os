import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolDefinition } from './tools.js';

interface AuditEntry {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: string;
  sessionId?: string;
}

export function createAuditTools(waggleDir: string): ToolDefinition[] {
  return [
    {
      name: 'query_audit',
      description: 'Query the audit trail of past tool invocations',
      parameters: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Filter by tool name' },
          search: { type: 'string', description: 'Search text in args/result' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
      },
      execute: async (args) => {
        const auditDir = path.join(waggleDir, 'audit');
        if (!fs.existsSync(auditDir)) return 'No audit data found.';

        const files = fs.readdirSync(auditDir).filter(f => f.endsWith('.jsonl'));
        const entries: AuditEntry[] = [];

        for (const file of files) {
          const content = fs.readFileSync(path.join(auditDir, file), 'utf-8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              entries.push(JSON.parse(line));
            } catch { /* skip malformed */ }
          }
        }

        let filtered = entries;
        if (args.tool) {
          filtered = filtered.filter(e => e.tool === args.tool);
        }
        if (args.search) {
          const s = (args.search as string).toLowerCase();
          filtered = filtered.filter(e =>
            JSON.stringify(e.args).toLowerCase().includes(s) ||
            (e.result ?? '').toLowerCase().includes(s),
          );
        }

        const limit = (args.limit as number) ?? 20;
        filtered = filtered.slice(-limit);

        if (filtered.length === 0) return 'No matching audit entries.';

        return filtered.map(e =>
          `[${e.timestamp}] ${e.tool}: ${JSON.stringify(e.args)} → ${(e.result ?? '').slice(0, 100)}`,
        ).join('\n');
      },
    },
  ];
}
