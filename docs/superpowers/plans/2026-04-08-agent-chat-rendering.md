# Claude-Style Agent Chat Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat `content: string` message rendering with an interleaved `blocks: ContentBlock[]` system that shows agent steps, tool usage, and streaming text inline — matching the visual pattern of Claude.ai's agent interface.

**Architecture:** The change is entirely in the frontend rendering layer (`apps/web/`). No backend changes needed — the SSE events (`token`, `step`, `tool`, `tool_result`, `done`, `model_switch`, `error`) already provide all required data. The core refactor is: `ChatMessage.content: string` → `ChatMessage.blocks: ContentBlock[]`, with `useChat` hook assembling blocks from SSE events in arrival order. Backward-compatible: historical messages (loaded from API) convert to a single `text` block.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Framer Motion (already in project)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/lib/types.ts` | Modify | Add `ContentBlock` union type, update `ChatMessage`, update `StreamEvent` |
| `apps/web/src/hooks/useChat.ts` | Modify | Assemble `ContentBlock[]` from SSE events instead of string concatenation |
| `apps/web/src/components/os/apps/chat-blocks/TextBlock.tsx` | Create | Streaming text with markdown + blinking cursor |
| `apps/web/src/components/os/apps/chat-blocks/StepBlock.tsx` | Create | Inline step indicator (running/done) |
| `apps/web/src/components/os/apps/chat-blocks/ToolUseBlock.tsx` | Create | Collapsible tool card (replaces ToolCard in ChatApp) |
| `apps/web/src/components/os/apps/chat-blocks/ModelSwitchBlock.tsx` | Create | Inline model switch notice |
| `apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx` | Create | Switch-case renderer that maps ContentBlock → component |
| `apps/web/src/components/os/apps/chat-blocks/index.ts` | Create | Barrel export |
| `apps/web/src/components/os/apps/ChatApp.tsx` | Modify | Replace inline message rendering with `<BlockRenderer />` |

---

### Task 1: Define ContentBlock types and update ChatMessage

**Files:**
- Modify: `apps/web/src/lib/types.ts:87-214`

- [ ] **Step 1: Add ContentBlock union type**

Add after the `AgentStep` interface (around line 134) in `apps/web/src/lib/types.ts`:

```typescript
// ── Content Block System ─────────────────────────────────────────────
// Messages are composed of ordered blocks that interleave text, tool usage,
// and agent activity — matching Claude.ai's visual rendering pattern.

export type ContentBlock =
  | TextContentBlock
  | StepContentBlock
  | ToolUseContentBlock
  | ModelSwitchContentBlock
  | ErrorContentBlock;

export interface TextContentBlock {
  type: 'text';
  content: string;
}

export interface StepContentBlock {
  type: 'step';
  description: string;
  status: 'running' | 'done';
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'done' | 'error' | 'denied';
  result?: string;
  duration?: number;
}

export interface ModelSwitchContentBlock {
  type: 'model_switch';
  from: string;
  to: string;
  reason: string;
}

export interface ErrorContentBlock {
  type: 'error';
  message: string;
}
```

- [ ] **Step 2: Update ChatMessage interface**

Replace the `ChatMessage` interface:

```typescript
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  blocks: ContentBlock[];
  timestamp: string;
  tools?: ToolExecution[];
  feedback?: 'up' | 'down' | null;
  pinned?: boolean;
  persona?: string;
}
```

Note: `content` is kept for backward compatibility (copy-to-clipboard, pins, search, history serialization). `blocks` is the rendering source.

- [ ] **Step 3: Update StreamEvent type**

Replace the `StreamEvent` interface to include all event types the backend actually sends:

```typescript
export interface StreamEvent {
  type: 'token' | 'step' | 'tool_start' | 'tool_end' | 'done' | 'error' | 'approval_request' | 'model_switch' | 'notification';
  data: unknown;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "feat(chat): add ContentBlock type system for interleaved message rendering"
```

---

### Task 2: Create block renderer components

**Files:**
- Create: `apps/web/src/components/os/apps/chat-blocks/TextBlock.tsx`
- Create: `apps/web/src/components/os/apps/chat-blocks/StepBlock.tsx`
- Create: `apps/web/src/components/os/apps/chat-blocks/ToolUseBlock.tsx`
- Create: `apps/web/src/components/os/apps/chat-blocks/ModelSwitchBlock.tsx`
- Create: `apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx`
- Create: `apps/web/src/components/os/apps/chat-blocks/index.ts`

- [ ] **Step 1: Create the chat-blocks directory**

```bash
ls apps/web/src/components/os/apps/
```

- [ ] **Step 2: Create TextBlock.tsx**

```typescript
import { memo } from 'react';
import type { TextContentBlock } from '@/lib/types';

interface TextBlockProps {
  block: TextContentBlock;
  isStreaming?: boolean;
}

const TextBlock = memo(({ block, isStreaming }: TextBlockProps) => {
  if (!block.content && !isStreaming) return null;

  return (
    <span className="whitespace-pre-wrap">
      {block.content}
      {isStreaming && !block.content && (
        <span className="inline-flex gap-1 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      )}
      {isStreaming && block.content && (
        <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
      )}
    </span>
  );
});

TextBlock.displayName = 'TextBlock';
export default TextBlock;
```

- [ ] **Step 3: Create StepBlock.tsx**

```typescript
import { memo } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import type { StepContentBlock } from '@/lib/types';

interface StepBlockProps {
  block: StepContentBlock;
}

const StepBlock = memo(({ block }: StepBlockProps) => (
  <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
    {block.status === 'running' ? (
      <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
    ) : (
      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
    )}
    <span className={block.status === 'done' ? 'opacity-60' : 'text-foreground/80'}>
      {block.description}
    </span>
  </div>
));

StepBlock.displayName = 'StepBlock';
export default StepBlock;
```

- [ ] **Step 4: Create ToolUseBlock.tsx**

```typescript
import { memo, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, Code, ChevronDown, ChevronRight } from 'lucide-react';
import type { ToolUseContentBlock } from '@/lib/types';

interface ToolUseBlockProps {
  block: ToolUseContentBlock;
}

const StatusIcon = ({ status }: { status: ToolUseContentBlock['status'] }) => {
  switch (status) {
    case 'running': return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    case 'done': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case 'error': return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case 'denied': return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

/** Human-readable tool name */
function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Brief summary of tool input for display */
function summarizeInput(name: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  if (input.query) return String(input.query);
  if (input.path) return String(input.path);
  if (input.url) return String(input.url);
  if (input.pattern) return String(input.pattern);
  if (input.command) return String(input.command).slice(0, 60);
  if (input.content) return String(input.content).slice(0, 60);
  const first = Object.values(input)[0];
  return first ? String(first).slice(0, 60) : '';
}

const ToolUseBlock = memo(({ block }: ToolUseBlockProps) => {
  const [expanded, setExpanded] = useState(false);
  const inputSummary = summarizeInput(block.name, block.input);

  return (
    <div className="my-1.5 rounded-lg border border-border/40 bg-secondary/30 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary/50 transition-colors"
      >
        <StatusIcon status={block.status} />
        <span className="font-display font-medium text-foreground">{formatToolName(block.name)}</span>
        {inputSummary && (
          <span className="text-muted-foreground truncate max-w-[200px]">{inputSummary}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          {block.duration != null && <span>{block.duration}ms</span>}
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      </button>
      {expanded && (block.input || block.result) && (
        <div className="px-2.5 pb-2 border-t border-border/30">
          {block.input && (
            <pre className="mt-1.5 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-24">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          )}
          {block.result && (
            <pre className="mt-1 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-32">
              {typeof block.result === 'string' ? block.result.slice(0, 2000) : JSON.stringify(block.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

ToolUseBlock.displayName = 'ToolUseBlock';
export default ToolUseBlock;
```

- [ ] **Step 5: Create ModelSwitchBlock.tsx**

```typescript
import { memo } from 'react';
import { Hexagon } from 'lucide-react';
import type { ModelSwitchContentBlock } from '@/lib/types';

interface ModelSwitchBlockProps {
  block: ModelSwitchContentBlock;
}

const ModelSwitchBlock = memo(({ block }: ModelSwitchBlockProps) => (
  <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
    <Hexagon className="w-3 h-3 text-amber-400 shrink-0" />
    <span>Switched to <span className="text-foreground font-medium">{block.to}</span> — {block.reason}</span>
  </div>
));

ModelSwitchBlock.displayName = 'ModelSwitchBlock';
export default ModelSwitchBlock;
```

- [ ] **Step 6: Create BlockRenderer.tsx**

```typescript
import type { ContentBlock } from '@/lib/types';
import TextBlock from './TextBlock';
import StepBlock from './StepBlock';
import ToolUseBlock from './ToolUseBlock';
import ModelSwitchBlock from './ModelSwitchBlock';

interface BlockRendererProps {
  blocks: ContentBlock[];
  isStreaming?: boolean;
}

const BlockRenderer = ({ blocks, isStreaming }: BlockRendererProps) => {
  return (
    <>
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        switch (block.type) {
          case 'text':
            return <TextBlock key={i} block={block} isStreaming={isStreaming && isLast} />;
          case 'step':
            return <StepBlock key={i} block={block} />;
          case 'tool_use':
            return <ToolUseBlock key={i} block={block} />;
          case 'model_switch':
            return <ModelSwitchBlock key={i} block={block} />;
          case 'error':
            return (
              <div key={i} className="flex items-center gap-2 py-1 text-[11px] text-destructive">
                <span>⚠️ {block.message}</span>
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
};

export default BlockRenderer;
```

- [ ] **Step 7: Create barrel export**

Create `apps/web/src/components/os/apps/chat-blocks/index.ts`:

```typescript
export { default as BlockRenderer } from './BlockRenderer';
export { default as TextBlock } from './TextBlock';
export { default as StepBlock } from './StepBlock';
export { default as ToolUseBlock } from './ToolUseBlock';
export { default as ModelSwitchBlock } from './ModelSwitchBlock';
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/os/apps/chat-blocks/
git commit -m "feat(chat): create ContentBlock renderer components — text, step, tool, model switch"
```

---

### Task 3: Refactor useChat to assemble ContentBlocks from SSE events

**Files:**
- Modify: `apps/web/src/hooks/useChat.ts`

This is the core refactor. Instead of `msg.content += token`, we build `msg.blocks[]`.

- [ ] **Step 1: Add block helper import and utility functions**

At the top of `useChat.ts`, update the import and add helpers:

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type {
  ChatMessage, StreamEvent, ToolExecution, ApprovalRequest,
  ContentBlock, TextContentBlock, ToolUseContentBlock,
} from '@/lib/types';

/** Create a ChatMessage with an initial empty blocks array */
function createAssistantMessage(): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    blocks: [],
    timestamp: new Date().toISOString(),
    tools: [],
  };
}

/** Convert legacy messages (from history API) to block format */
function ensureBlocks(msg: ChatMessage): ChatMessage {
  if (msg.blocks && msg.blocks.length > 0) return msg;
  const blocks: ContentBlock[] = [];
  if (msg.content) {
    blocks.push({ type: 'text', content: msg.content });
  }
  if (msg.tools) {
    for (const t of msg.tools) {
      blocks.push({
        type: 'tool_use',
        id: t.id,
        name: t.name,
        input: t.input,
        status: t.status === 'pending' ? 'running' : (t.status as 'running' | 'done' | 'error' | 'denied'),
        result: t.output as string | undefined,
        duration: t.duration,
      });
    }
  }
  return { ...msg, blocks };
}

/** Rebuild flat content string from blocks (for copy, pins, search) */
function flattenBlocksToContent(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextContentBlock => b.type === 'text')
    .map(b => b.content)
    .join('');
}
```

- [ ] **Step 2: Rewrite the SSE event handler**

Replace the entire `sendMessage` callback body. The key change: every SSE event appends to or updates `blocks[]` on the last assistant message.

```typescript
  const sendMessage = useCallback(async (content: string) => {
    if (!workspaceId || !content.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      blocks: [{ type: 'text', content: content.trim() }],
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const assistantMsg = createAssistantMessage();
    setMessages(prev => [...prev, assistantMsg]);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      for await (const event of adapter.sendMessage(workspaceId, content, sessionId || undefined, persona)) {
        if (abortRef.current?.signal.aborted) break;
        const evt = event as StreamEvent;
        const data = evt.data as Record<string, unknown>;

        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last.role !== 'assistant') return msgs;
          const blocks = [...last.blocks];

          switch (evt.type) {
            case 'token': {
              const tokenContent = typeof data === 'string' ? data : (data?.content as string ?? '');
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock?.type === 'text') {
                blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + tokenContent };
              } else {
                blocks.push({ type: 'text', content: tokenContent });
              }
              break;
            }

            case 'step': {
              const description = typeof data === 'string' ? data : (data?.content as string ?? '');
              if (description) {
                // Mark previous running steps as done
                for (let i = 0; i < blocks.length; i++) {
                  if (blocks[i].type === 'step' && (blocks[i] as { status: string }).status === 'running') {
                    blocks[i] = { ...blocks[i], status: 'done' } as ContentBlock;
                  }
                }
                blocks.push({ type: 'step', description, status: 'running' });
              }
              break;
            }

            case 'tool_start': {
              const toolBlock: ToolUseContentBlock = {
                type: 'tool_use',
                id: (data?.name as string) ?? crypto.randomUUID(),
                name: (data?.name as string) ?? 'unknown',
                input: data?.input as Record<string, unknown>,
                status: 'running',
              };
              blocks.push(toolBlock);
              // Also maintain legacy tools[] for backward compat
              if (last.tools) {
                last.tools = [...last.tools, {
                  id: toolBlock.id,
                  name: toolBlock.name,
                  status: 'running',
                  input: toolBlock.input,
                }];
              }
              break;
            }

            case 'tool_end': {
              const toolName = data?.name as string;
              const result = data?.result as string;
              const duration = data?.duration as number | undefined;
              // Find the matching running tool block (search from end)
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type === 'tool_use' && b.name === toolName && b.status === 'running') {
                  blocks[i] = { ...b, status: 'done', result, duration };
                  break;
                }
              }
              // Also update the most recent running step to done
              for (let i = blocks.length - 1; i >= 0; i--) {
                if (blocks[i].type === 'step' && (blocks[i] as { status: string }).status === 'running') {
                  blocks[i] = { ...blocks[i], status: 'done' } as ContentBlock;
                  break;
                }
              }
              // Legacy tools[]
              if (last.tools && toolName) {
                const idx = last.tools.findIndex(t => t.name === toolName && t.status === 'running');
                if (idx >= 0) {
                  const updated = [...last.tools];
                  updated[idx] = { ...updated[idx], status: 'done', output: result, duration };
                  last.tools = updated;
                }
              }
              break;
            }

            case 'model_switch': {
              blocks.push({
                type: 'model_switch',
                from: (data as Record<string, string>).primary ?? 'primary',
                to: (data as Record<string, string>).model ?? 'fallback',
                reason: (data as Record<string, string>).reason ?? 'primary unavailable',
              });
              break;
            }

            case 'error': {
              const errorMsg = typeof data === 'string' ? data : (data?.message as string ?? 'Unknown error');
              blocks.push({ type: 'error', message: errorMsg });
              break;
            }

            case 'done': {
              // Mark all running steps/tools as done
              for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                if ((b.type === 'step' && (b as { status: string }).status === 'running') ||
                    (b.type === 'tool_use' && b.status === 'running')) {
                  blocks[i] = { ...b, status: 'done' } as ContentBlock;
                }
              }
              // If no text blocks exist but done has content, add it
              const doneContent = data?.content as string;
              if (doneContent && !blocks.some(b => b.type === 'text' && b.content)) {
                blocks.push({ type: 'text', content: doneContent });
              }
              break;
            }

            case 'approval_request':
              setPendingApproval(data as unknown as ApprovalRequest);
              break;
          }

          // Rebuild flat content from text blocks
          const content = flattenBlocksToContent(blocks);
          return msgs.map((m, i) =>
            i === msgs.length - 1 ? { ...m, blocks, content } : m
          );
        });
      }
    } catch (e) {
      setMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last.role === 'assistant') {
          const blocks = [...last.blocks, { type: 'error' as const, message: 'Backend is offline. Connect to a Waggle server to start chatting.' }];
          return msgs.map((m, i) =>
            i === msgs.length - 1 ? { ...m, blocks, content: '⚠️ Backend is offline.' } : m
          );
        }
        return msgs;
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, sessionId, persona]);
```

- [ ] **Step 3: Update history loading to convert legacy messages**

Update the history useEffect:

```typescript
  useEffect(() => {
    if (workspaceId && sessionId) {
      adapter.getHistory(workspaceId, sessionId)
        .then((history) => setMessages(history.map(ensureBlocks)))
        .catch((err) => { console.error('[useChat] history fetch failed:', err); setMessages([]); });
    } else {
      setMessages([]);
    }
  }, [workspaceId, sessionId]);
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useChat.ts
git commit -m "feat(chat): refactor useChat to build ContentBlock[] from SSE events"
```

---

### Task 4: Update ChatApp to render blocks instead of flat content

**Files:**
- Modify: `apps/web/src/components/os/apps/ChatApp.tsx`

- [ ] **Step 1: Import BlockRenderer**

Add at the top of ChatApp.tsx:

```typescript
import { BlockRenderer } from './chat-blocks';
```

- [ ] **Step 2: Replace assistant message rendering**

Find the message rendering block (around line 622-681). Replace the inner content of the assistant message bubble. Find this block:

```typescript
{msg.role === 'assistant' && <Sparkles className="w-3 h-3 text-primary inline mr-1.5 -mt-0.5" />}
<span className="whitespace-pre-wrap">{msg.content}</span>
```

And the loading dots:

```typescript
{isLoading && msg === messages[messages.length - 1] && msg.role === 'assistant' && !msg.content && (
  <span className="inline-flex gap-1 ml-1">...
```

Replace ALL of that with:

```typescript
{msg.role === 'assistant' && <Sparkles className="w-3 h-3 text-primary inline mr-1.5 -mt-0.5" />}
{msg.role === 'assistant' && msg.blocks && msg.blocks.length > 0 ? (
  <BlockRenderer
    blocks={msg.blocks}
    isStreaming={isLoading && msg === messages[messages.length - 1]}
  />
) : (
  <span className="whitespace-pre-wrap">{msg.content}</span>
)}
```

- [ ] **Step 3: Remove the old ToolCard rendering below the message bubble**

Find this block (around line 671-674):

```typescript
{msg.tools && msg.tools.length > 0 && (
  <div className="mt-1 space-y-1">
    {msg.tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
  </div>
)}
```

Replace with a comment noting tools are now rendered inline via blocks:

```typescript
{/* Tools are now rendered inline via BlockRenderer — legacy ToolCard kept for non-block messages */}
{msg.tools && msg.tools.length > 0 && (!msg.blocks || msg.blocks.length === 0) && (
  <div className="mt-1 space-y-1">
    {msg.tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
  </div>
)}
```

- [ ] **Step 4: Remove the old loading dots**

The loading dots are now handled by TextBlock's `isStreaming` prop. Find and remove:

```typescript
{isLoading && msg === messages[messages.length - 1] && msg.role === 'assistant' && !msg.content && (
  <span className="inline-flex gap-1 ml-1">
    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
  </span>
)}
```

This is now covered by the `isStreaming` prop on TextBlock.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
```
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/os/apps/ChatApp.tsx
git commit -m "feat(chat): render interleaved ContentBlocks in ChatApp — steps, tools, text inline"
```

---

### Task 5: Final verification and push

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project packages/server/tsconfig.json
```
Expected: 0 errors for all

- [ ] **Step 2: Visual verification checklist**

Start the app and verify in the chat:
- Sending a message shows loading dots (TextBlock isStreaming)
- Agent steps appear inline: "Searching memory..." with spinner, then checkmark when done
- Tool usage appears as collapsible cards between text sections
- Text continues streaming after a tool block
- Model switch shows as an inline amber notice
- Errors show as inline red text
- Old messages (from history) render correctly with a single text block
- Copy button still works (reads from msg.content)
- Pin button still works (reads from msg.content)
- Feedback buttons still appear below completed assistant messages

- [ ] **Step 3: Push**

```bash
git push
```
