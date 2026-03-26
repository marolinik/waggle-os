/**
 * ToolResultRenderer — smart per-tool-type result rendering.
 *
 * Renders tool results with contextual formatting based on the tool name.
 * YOLO permissions: most tools execute silently (no approval needed).
 * Only external mutations require approval gates (handled separately).
 */

export interface ToolResultRendererProps {
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
}

/** Extract a safe summary from the result string. Show full text. */
function truncate(text: string, _maxLen: number): string {
  return text;
}

/** Count lines in a string. */
function lineCount(text: string): number {
  return text.split('\n').length;
}

function ReadFileResult({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const filePath = String(input.file_path ?? input.path ?? '');
  const lines = result ? lineCount(result) : 0;

  return (
    <div className="tool-result tool-result--read-file">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm">{'\uD83D\uDCC4'}</span>
        <span className="font-mono text-primary/70">{filePath}</span>
        {result && (
          <span className="text-muted-foreground">({lines} lines)</span>
        )}
      </div>
    </div>
  );
}

function BashResult({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const command = String(input.command ?? '');
  const hasOutput = result && result.trim().length > 0;

  return (
    <div className="tool-result tool-result--bash">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="text-sm">{'\u2728'}</span>
        <code className="font-mono text-green-300">{truncate(command, 80)}</code>
      </div>
      {hasOutput && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-background px-2 py-1 text-xs text-muted-foreground">
          {truncate(result, 500)}
        </pre>
      )}
    </div>
  );
}

function WebSearchResult({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const query = String(input.query ?? input.q ?? '');
  let resultCount = 0;
  if (result) {
    try {
      const parsed = JSON.parse(result);
      resultCount = Array.isArray(parsed) ? parsed.length : (parsed.count ?? 0);
    } catch {
      resultCount = result.split('\n').filter((l: string) => l.trim()).length;
    }
  }

  return (
    <div className="tool-result tool-result--web-search">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm">{'\uD83D\uDD0D'}</span>
        <span>Searched: </span>
        <span className="font-medium text-purple-300">{query}</span>
        {resultCount > 0 && (
          <span className="text-muted-foreground">({resultCount} results)</span>
        )}
      </div>
    </div>
  );
}

function SearchMemoryResult({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const query = String(input.query ?? '');
  let matchCount = 0;
  if (result) {
    try {
      const parsed = JSON.parse(result);
      matchCount = Array.isArray(parsed) ? parsed.length : (parsed.count ?? 0);
    } catch {
      matchCount = result.split('\n').filter((l: string) => l.trim()).length;
    }
  }

  return (
    <div className="tool-result tool-result--search-memory">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm">{'\uD83E\uDDE0'}</span>
        <span>Memory: </span>
        <span className="font-medium text-cyan-300">{query}</span>
        {matchCount > 0 && (
          <span className="text-muted-foreground">({matchCount} matches)</span>
        )}
      </div>
    </div>
  );
}

function WriteFileResult({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? '');

  return (
    <div className="tool-result tool-result--write-file">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm">{'\u270F\uFE0F'}</span>
        <span>Wrote: </span>
        <span className="font-mono text-yellow-300">{filePath}</span>
      </div>
    </div>
  );
}

function EditFileResult({ input }: { input: Record<string, unknown> }) {
  const filePath = String(input.file_path ?? input.path ?? '');

  return (
    <div className="tool-result tool-result--edit-file">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm">{'\u270F\uFE0F'}</span>
        <span>Edited: </span>
        <span className="font-mono text-yellow-300">{filePath}</span>
      </div>
    </div>
  );
}

function SearchFilesResult({ input, result }: { input: Record<string, unknown>; result?: string }) {
  const pattern = String(input.pattern ?? input.glob ?? '');
  const matchCount = result ? result.split('\n').filter((l: string) => l.trim()).length : 0;

  return (
    <div className="tool-result tool-result--search-files">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-sm">{'\uD83D\uDCC2'}</span>
        <span>Found: </span>
        <span className="font-mono text-orange-300">{pattern}</span>
        <span className="text-muted-foreground">({matchCount} files)</span>
      </div>
    </div>
  );
}

function DocxResult({ input }: { input: Record<string, unknown>; result?: string }) {
  const filePath = String(input.path ?? input.file_path ?? '');
  const title = String(input.title ?? '');
  return (
    <div className="tool-result tool-result--docx">
      <div className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2">
        <span className="text-lg">{'\uD83D\uDCC4'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{filePath || 'document.docx'}</div>
          {title && <div className="text-xs text-muted-foreground truncate">{title}</div>}
        </div>
      </div>
    </div>
  );
}

function DefaultResult({ toolName, input, result }: ToolResultRendererProps) {
  return (
    <div className="tool-result tool-result--default">
      <div className="mb-1 text-xs text-muted-foreground">
        <span className="font-mono font-medium text-muted-foreground">{toolName}</span>
      </div>
      <pre className="max-h-24 overflow-auto rounded bg-background px-2 py-1 text-xs text-muted-foreground">
        {JSON.stringify(input, null, 2)}
      </pre>
      {result && (
        <pre className="mt-1 max-h-24 overflow-auto rounded bg-background px-2 py-1 text-xs text-muted-foreground">
          {truncate(result, 300)}
        </pre>
      )}
    </div>
  );
}

/**
 * YOLO permissions model:
 * All internal tools (read, search, memory) execute without approval.
 * External mutations (git push, web requests, file deletion outside workspace)
 * are flagged via requiresApproval on the ToolUseEvent — handled by ApprovalGate.
 *
 * This renderer focuses on displaying results, not gating execution.
 */
export function ToolResultRenderer({ toolName, input, result }: ToolResultRendererProps) {
  const isDemo = result != null && (
    result.includes('[DEMO]') ||
    result.includes('"demo":true') ||
    result.includes('"demo": true')
  );

  return (
    <div>
      {isDemo && (
        <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-900/30 text-yellow-400 px-1.5 py-0.5 rounded mb-1">
          DEMO
        </span>
      )}
      <ToolResultInner toolName={toolName} input={input} result={result} />
    </div>
  );
}

function ToolResultInner({ toolName, input, result }: ToolResultRendererProps) {
  switch (toolName) {
    case 'read_file':
      return <ReadFileResult input={input} result={result} />;
    case 'bash':
      return <BashResult input={input} result={result} />;
    case 'web_search':
      return <WebSearchResult input={input} result={result} />;
    case 'search_memory':
      return <SearchMemoryResult input={input} result={result} />;
    case 'write_file':
      return <WriteFileResult input={input} />;
    case 'edit_file':
      return <EditFileResult input={input} />;
    case 'search_files':
    case 'search_content':
      return <SearchFilesResult input={input} result={result} />;
    case 'generate_docx':
      return (
        <>
          <DocxResult input={input} result={result} />
          <div className="text-[10px] text-muted-foreground/50 mt-1">
            Your agent can also create plans (/plan) and research reports (/research)
          </div>
        </>
      );
    default:
      return <DefaultResult toolName={toolName} input={input} result={result} />;
  }
}
