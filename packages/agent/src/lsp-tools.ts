/**
 * LSP Tools — Language Server Protocol integration via typescript-language-server.
 *
 * Tools:
 *   lsp_diagnostics  — Get errors/warnings for a file
 *   lsp_definition   — Go-to-definition (file + line)
 *   lsp_references   — Find all references (file + line for each)
 *   lsp_hover        — Get type info and documentation
 *
 * The LSP client spawns typescript-language-server as a child process,
 * communicating via stdio using JSON-RPC (LSP protocol). The server is
 * started on first tool use and stopped on session end.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ToolDefinition } from './tools.js';

// Module-level LSP state
let lspProcess: ChildProcess | null = null;
let lspInitialized = false;
let lspWorkspace: string = '';
let requestId = 0;
let pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
let receiveBuffer = '';

/** Reset module-level state (for testing). */
export function _resetLspState(): void {
  lspProcess = null;
  lspInitialized = false;
  lspWorkspace = '';
  requestId = 0;
  pendingRequests = new Map();
  receiveBuffer = '';
}

/** Send a JSON-RPC message to the LSP server. */
function sendMessage(msg: object): void {
  if (!lspProcess?.stdin?.writable) {
    throw new Error('LSP server not running');
  }
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  lspProcess.stdin.write(header + json);
}

/** Send a request and wait for a response. */
function sendRequest(method: string, params: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });
    sendMessage({ jsonrpc: '2.0', id, method, params });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`LSP request "${method}" timed out after 10s`));
      }
    }, 10_000);
  });
}

/** Send a notification (no response expected). */
function sendNotification(method: string, params: object): void {
  sendMessage({ jsonrpc: '2.0', method, params });
}

/** Process incoming data from the LSP server. */
function handleData(data: string): void {
  receiveBuffer += data;

  while (true) {
    // Look for Content-Length header
    const headerEnd = receiveBuffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = receiveBuffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      // Skip malformed header
      receiveBuffer = receiveBuffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (receiveBuffer.length < bodyStart + contentLength) break; // Wait for more data

    const body = receiveBuffer.slice(bodyStart, bodyStart + contentLength);
    receiveBuffer = receiveBuffer.slice(bodyStart + contentLength);

    try {
      const msg = JSON.parse(body);
      if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        const pending = pendingRequests.get(msg.id)!;
        pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        } else {
          pending.resolve(msg.result);
        }
      }
      // Notifications and other messages are ignored for now
    } catch {
      // Malformed JSON — skip
    }
  }
}

/** Start the LSP server if not already running. */
async function ensureLsp(workspacePath: string): Promise<void> {
  if (lspProcess && lspInitialized && lspWorkspace === workspacePath) return;

  // Check if typescript-language-server is available
  const tsServerCmd = process.platform === 'win32'
    ? 'typescript-language-server.cmd'
    : 'typescript-language-server';

  // Try to spawn
  try {
    lspProcess = spawn(tsServerCmd, ['--stdio'], {
      cwd: workspacePath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32',
    });
  } catch (err: any) {
    throw new Error(
      'LSP requires typescript-language-server. Install with: npm install -g typescript-language-server typescript',
    );
  }

  lspWorkspace = workspacePath;

  // Wire up data handling
  lspProcess.stdout?.setEncoding('utf-8');
  lspProcess.stdout?.on('data', handleData);

  lspProcess.on('error', () => {
    lspProcess = null;
    lspInitialized = false;
  });

  lspProcess.on('exit', () => {
    lspProcess = null;
    lspInitialized = false;
  });

  // Send initialize request
  try {
    const result = await sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file:///${workspacePath.replace(/\\/g, '/')}`,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          definition: { linkSupport: false },
          references: {},
          publishDiagnostics: { relatedInformation: true },
        },
      },
      workspaceFolders: [
        {
          uri: `file:///${workspacePath.replace(/\\/g, '/')}`,
          name: path.basename(workspacePath),
        },
      ],
    });

    // Send initialized notification
    sendNotification('initialized', {});
    lspInitialized = true;
  } catch (err: any) {
    await stopLsp();
    throw new Error(
      `LSP initialization failed: ${err.message}. Ensure typescript-language-server is installed globally.`,
    );
  }
}

/** Stop the LSP server. */
async function stopLsp(): Promise<void> {
  if (lspProcess) {
    try {
      sendNotification('shutdown', {});
      sendNotification('exit', {});
    } catch {
      // Already dead
    }
    lspProcess.kill();
    lspProcess = null;
    lspInitialized = false;
  }
}

/** Convert a file path to a file:// URI. */
function fileUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return `file://${normalized}`;
  return `file:///${normalized}`;
}

/** Notify the LSP that a file is open (required before requesting info). */
async function openFile(filePath: string): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const uri = fileUri(filePath);

  // Determine language ID from extension
  const ext = path.extname(filePath).toLowerCase();
  const languageId = ext === '.tsx' ? 'typescriptreact'
    : ext === '.jsx' ? 'javascriptreact'
    : ext === '.js' || ext === '.mjs' || ext === '.cjs' ? 'javascript'
    : 'typescript';

  sendNotification('textDocument/didOpen', {
    textDocument: {
      uri,
      languageId,
      version: 1,
      text: content,
    },
  });

  // Give the LSP a moment to process
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Register cleanup on process exit
process.on('exit', () => { stopLsp().catch(() => {}); });

export function createLspTools(workspacePath: string): ToolDefinition[] {
  return [
    // 1. lsp_diagnostics — Get errors/warnings for a file
    {
      name: 'lsp_diagnostics',
      description:
        'Get TypeScript/JavaScript errors and warnings for a file using the Language Server Protocol.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'File path relative to workspace',
          },
        },
        required: ['file_path'],
      },
      execute: async (args) => {
        try {
          const filePath = args.file_path as string;
          const absPath = path.resolve(workspacePath, filePath);

          if (!fs.existsSync(absPath)) {
            return `Error: File not found: ${filePath}`;
          }

          await ensureLsp(workspacePath);
          await openFile(absPath);

          // Request diagnostics via textDocument/diagnostic (LSP 3.17+)
          // Fallback: use textDocument/codeAction as a probe, or rely on publishDiagnostics
          // For simplicity, wait a bit then request semantic tokens which triggers diagnostics
          const uri = fileUri(absPath);

          // Use document diagnostic request
          try {
            const result = await sendRequest('textDocument/diagnostic', {
              textDocument: { uri },
            });

            const items = result?.items ?? [];
            if (items.length === 0) {
              return `No diagnostics found for ${filePath}. File is clean.`;
            }

            return items
              .map((d: any) => {
                const severity = d.severity === 1 ? 'Error' : d.severity === 2 ? 'Warning' : d.severity === 3 ? 'Info' : 'Hint';
                const line = (d.range?.start?.line ?? 0) + 1;
                const col = (d.range?.start?.character ?? 0) + 1;
                return `${severity} [${line}:${col}]: ${d.message}`;
              })
              .join('\n');
          } catch {
            // Fallback: just report that we tried
            return `Diagnostics not available for ${filePath}. The language server may not support pull diagnostics.`;
          }
        } catch (err: any) {
          return `LSP diagnostics error: ${err.message}`;
        }
      },
    },

    // 2. lsp_definition — Go to definition
    {
      name: 'lsp_definition',
      description:
        'Go to the definition of a symbol at a given position. Returns the file path and line number.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'File path relative to workspace',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file_path', 'line', 'column'],
      },
      execute: async (args) => {
        try {
          const filePath = args.file_path as string;
          const line = (args.line as number) - 1; // Convert to 0-based
          const column = (args.column as number) - 1;
          const absPath = path.resolve(workspacePath, filePath);

          if (!fs.existsSync(absPath)) {
            return `Error: File not found: ${filePath}`;
          }

          await ensureLsp(workspacePath);
          await openFile(absPath);

          const result = await sendRequest('textDocument/definition', {
            textDocument: { uri: fileUri(absPath) },
            position: { line, character: column },
          });

          if (!result || (Array.isArray(result) && result.length === 0)) {
            return `No definition found at ${filePath}:${line + 1}:${column + 1}`;
          }

          const locations = Array.isArray(result) ? result : [result];
          return locations
            .map((loc: any) => {
              const uri = loc.uri ?? loc.targetUri ?? '';
              const range = loc.range ?? loc.targetRange ?? {};
              const startLine = (range.start?.line ?? 0) + 1;
              // Convert file URI back to path
              const defPath = uri.replace(/^file:\/\/\/?/, '').replace(/%20/g, ' ');
              const relPath = path.relative(workspacePath, defPath);
              return `Definition: ${relPath}:${startLine}`;
            })
            .join('\n');
        } catch (err: any) {
          return `LSP definition error: ${err.message}`;
        }
      },
    },

    // 3. lsp_references — Find all references
    {
      name: 'lsp_references',
      description:
        'Find all references to a symbol at a given position. Returns file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'File path relative to workspace',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file_path', 'line', 'column'],
      },
      execute: async (args) => {
        try {
          const filePath = args.file_path as string;
          const line = (args.line as number) - 1;
          const column = (args.column as number) - 1;
          const absPath = path.resolve(workspacePath, filePath);

          if (!fs.existsSync(absPath)) {
            return `Error: File not found: ${filePath}`;
          }

          await ensureLsp(workspacePath);
          await openFile(absPath);

          const result = await sendRequest('textDocument/references', {
            textDocument: { uri: fileUri(absPath) },
            position: { line, character: column },
            context: { includeDeclaration: true },
          });

          if (!result || result.length === 0) {
            return `No references found at ${filePath}:${line + 1}:${column + 1}`;
          }

          const lines: string[] = [`References (${result.length}):`];
          for (const ref of result) {
            const uri = ref.uri ?? '';
            const startLine = (ref.range?.start?.line ?? 0) + 1;
            const defPath = uri.replace(/^file:\/\/\/?/, '').replace(/%20/g, ' ');
            const relPath = path.relative(workspacePath, defPath);
            lines.push(`  ${relPath}:${startLine}`);
          }

          return lines.join('\n');
        } catch (err: any) {
          return `LSP references error: ${err.message}`;
        }
      },
    },

    // 4. lsp_hover — Get type info and documentation
    {
      name: 'lsp_hover',
      description:
        'Get type information and documentation for a symbol at a given position.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'File path relative to workspace',
          },
          line: {
            type: 'number',
            description: 'Line number (1-based)',
          },
          column: {
            type: 'number',
            description: 'Column number (1-based)',
          },
        },
        required: ['file_path', 'line', 'column'],
      },
      execute: async (args) => {
        try {
          const filePath = args.file_path as string;
          const line = (args.line as number) - 1;
          const column = (args.column as number) - 1;
          const absPath = path.resolve(workspacePath, filePath);

          if (!fs.existsSync(absPath)) {
            return `Error: File not found: ${filePath}`;
          }

          await ensureLsp(workspacePath);
          await openFile(absPath);

          const result = await sendRequest('textDocument/hover', {
            textDocument: { uri: fileUri(absPath) },
            position: { line, character: column },
          });

          if (!result || !result.contents) {
            return `No hover info at ${filePath}:${line + 1}:${column + 1}`;
          }

          // Parse hover contents — can be string, MarkupContent, or MarkedString[]
          const contents = result.contents;
          if (typeof contents === 'string') return contents;
          if (contents.value) return contents.value;
          if (Array.isArray(contents)) {
            return contents
              .map((c: any) => (typeof c === 'string' ? c : c.value ?? ''))
              .filter(Boolean)
              .join('\n\n');
          }

          return JSON.stringify(contents, null, 2);
        } catch (err: any) {
          return `LSP hover error: ${err.message}`;
        }
      },
    },
  ];
}

export { stopLsp };
