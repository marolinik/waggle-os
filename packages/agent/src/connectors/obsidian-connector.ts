/**
 * Obsidian Connector — read, search, and manage notes in a local Obsidian vault.
 * Auth: api_key (vault directory path stored as the credential)
 *
 * This is a LOCAL file-based connector — it uses fs/path, not HTTP.
 * The "api_key" credential is the absolute path to the Obsidian vault directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

export class ObsidianConnector extends BaseConnector {
  readonly id = 'obsidian';
  readonly name = 'Obsidian';
  readonly description = 'Read, search, and manage notes in a local Obsidian vault';
  readonly service = 'local';
  readonly authType = 'api_key' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'search_notes',
      description: 'Search notes by filename or content (simple text matching)',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query — matches against file names and content' },
          folder: { type: 'string', description: 'Limit search to a specific folder (relative path)' },
          limit: { type: 'number', description: 'Max results (default 20)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_note',
      description: 'Read the contents of a specific note',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Relative path to the note file (e.g., "Projects/my-note.md")' },
        },
        required: ['path'],
      },
      riskLevel: 'low',
    },
    {
      name: 'list_notes',
      description: 'List all markdown files in the vault or a subfolder',
      inputSchema: {
        properties: {
          folder: { type: 'string', description: 'Subfolder to list (relative path, default: vault root)' },
          limit: { type: 'number', description: 'Max results (default 100)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_note',
      description: 'Create a new markdown note in the vault',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Relative path for the note (e.g., "Projects/new-note.md")' },
          content: { type: 'string', description: 'Note content (markdown)' },
        },
        required: ['path', 'content'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_note',
      description: 'Update (overwrite) the contents of an existing note',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Relative path to the note (e.g., "Projects/my-note.md")' },
          content: { type: 'string', description: 'New note content (markdown)' },
        },
        required: ['path', 'content'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_folders',
      description: 'List folders in the vault or a subfolder',
      inputSchema: {
        properties: {
          folder: { type: 'string', description: 'Parent folder (relative path, default: vault root)' },
        },
      },
      riskLevel: 'low',
    },
  ];

  private vaultPath: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.vaultPath = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.vaultPath ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.vaultPath) {
      try {
        fs.accessSync(this.vaultPath, fs.constants.R_OK);
        const stat = fs.statSync(this.vaultPath);
        if (!stat.isDirectory()) {
          health.status = 'error';
          health.error = 'Vault path exists but is not a directory';
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.vaultPath) return { success: false, error: 'Not connected — add Obsidian vault directory path in vault' };

    switch (action) {
      case 'search_notes': return this.searchNotes(params);
      case 'get_note': return this.getNote(params);
      case 'list_notes': return this.listNotes(params);
      case 'create_note': return this.createNote(params);
      case 'update_note': return this.updateNote(params);
      case 'list_folders': return this.listFolders(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  /** Resolve a relative path safely within the vault directory */
  private resolveSafe(relativePath: string): string | null {
    const resolved = path.resolve(this.vaultPath!, relativePath);
    // Guard against path traversal
    if (!resolved.startsWith(this.vaultPath!)) return null;
    return resolved;
  }

  /** Recursively collect all .md files under a directory */
  private collectMarkdownFiles(dir: string, limit: number): string[] {
    const results: string[] = [];
    const walk = (d: string) => {
      if (results.length >= limit) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (results.length >= limit) return;
        const fullPath = path.join(d, entry.name);
        if (entry.isDirectory()) {
          // Skip hidden directories (e.g., .obsidian, .trash)
          if (!entry.name.startsWith('.')) walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(fullPath);
        }
      }
    };
    walk(dir);
    return results;
  }

  private searchNotes(params: Record<string, unknown>): ConnectorResult {
    try {
      const query = (params.query as string).toLowerCase();
      const limit = (params.limit as number) ?? 20;
      const searchDir = params.folder
        ? this.resolveSafe(params.folder as string)
        : this.vaultPath!;

      if (!searchDir) return { success: false, error: 'Invalid folder path' };

      const allFiles = this.collectMarkdownFiles(searchDir, 1000); // scan up to 1000 files
      const matches: Array<{ path: string; name: string; snippet: string }> = [];

      for (const filePath of allFiles) {
        if (matches.length >= limit) break;

        const relativePath = path.relative(this.vaultPath!, filePath).replace(/\\/g, '/');
        const fileName = path.basename(filePath, '.md').toLowerCase();

        // Check filename match
        if (fileName.includes(query)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const snippet = content.slice(0, 200);
          matches.push({ path: relativePath, name: path.basename(filePath), snippet });
          continue;
        }

        // Check content match
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lowerContent = content.toLowerCase();
          const idx = lowerContent.indexOf(query);
          if (idx !== -1) {
            const start = Math.max(0, idx - 50);
            const end = Math.min(content.length, idx + query.length + 150);
            const snippet = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
            matches.push({ path: relativePath, name: path.basename(filePath), snippet });
          }
        } catch {
          // Skip unreadable files
        }
      }

      return { success: true, data: { results: matches, total: matches.length } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private getNote(params: Record<string, unknown>): ConnectorResult {
    try {
      const notePath = this.resolveSafe(params.path as string);
      if (!notePath) return { success: false, error: 'Invalid path — path traversal not allowed' };

      if (!fs.existsSync(notePath)) return { success: false, error: `Note not found: ${params.path}` };

      const content = fs.readFileSync(notePath, 'utf-8');
      const stat = fs.statSync(notePath);

      return {
        success: true,
        data: {
          path: (params.path as string).replace(/\\/g, '/'),
          name: path.basename(notePath),
          content,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private listNotes(params: Record<string, unknown>): ConnectorResult {
    try {
      const limit = (params.limit as number) ?? 100;
      const listDir = params.folder
        ? this.resolveSafe(params.folder as string)
        : this.vaultPath!;

      if (!listDir) return { success: false, error: 'Invalid folder path' };

      const allFiles = this.collectMarkdownFiles(listDir, limit);
      const notes = allFiles.map(filePath => {
        const stat = fs.statSync(filePath);
        return {
          path: path.relative(this.vaultPath!, filePath).replace(/\\/g, '/'),
          name: path.basename(filePath),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      });

      return { success: true, data: { notes, total: notes.length } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private createNote(params: Record<string, unknown>): ConnectorResult {
    try {
      const notePath = this.resolveSafe(params.path as string);
      if (!notePath) return { success: false, error: 'Invalid path — path traversal not allowed' };

      if (fs.existsSync(notePath)) return { success: false, error: `Note already exists: ${params.path}` };

      // Ensure parent directory exists
      const dir = path.dirname(notePath);
      fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(notePath, params.content as string, 'utf-8');
      return {
        success: true,
        data: {
          path: (params.path as string).replace(/\\/g, '/'),
          name: path.basename(notePath),
          created: true,
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private updateNote(params: Record<string, unknown>): ConnectorResult {
    try {
      const notePath = this.resolveSafe(params.path as string);
      if (!notePath) return { success: false, error: 'Invalid path — path traversal not allowed' };

      if (!fs.existsSync(notePath)) return { success: false, error: `Note not found: ${params.path}` };

      fs.writeFileSync(notePath, params.content as string, 'utf-8');
      return {
        success: true,
        data: {
          path: (params.path as string).replace(/\\/g, '/'),
          name: path.basename(notePath),
          updated: true,
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private listFolders(params: Record<string, unknown>): ConnectorResult {
    try {
      const listDir = params.folder
        ? this.resolveSafe(params.folder as string)
        : this.vaultPath!;

      if (!listDir) return { success: false, error: 'Invalid folder path' };

      const entries = fs.readdirSync(listDir, { withFileTypes: true });
      const folders = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: path.relative(this.vaultPath!, path.join(listDir, e.name)).replace(/\\/g, '/'),
        }));

      return { success: true, data: { folders, total: folders.length } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
