/**
 * ChatWorkCanvas (warm-Hive PR3 Phase B3, SCREENS §02 Variation B).
 *
 * The right "work canvas" — a live-drafting side panel for the latest artifact
 * the agent produced. There is no document-body stream channel today (recon
 * chat.md §2/§5): the canvas shows the most recent COMPLETED file-write's
 * drafted content (`input.content`, falling back to the opaque `result`); the
 * "live draft" cursor is cosmetic while streaming. Lives INSIDE ChatApp's
 * kept-alive flex root so its open state survives navigation. Hidden below
 * 820px so the thread keeps the full width on narrow screens.
 */
import { memo } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { stashDeepLink } from '@/lib/app-deeplink';
import { renderChatMarkdown } from '@/lib/render-markdown';

const ARTIFACT_TOOLS = new Set(['write_file', 'edit_file', 'file_write']);

export interface CanvasArtifact {
  path: string;
  body: string;
}

/**
 * Latest completed file-write across the thread → the canvas doc. Mirrors
 * `ArtifactBlock.isArtifactBlock`; body prefers the drafted `input.content`,
 * falling back to the (opaque) `result` string.
 */
export function selectCanvasArtifact(messages: ChatMessage[]): CanvasArtifact | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const blocks = messages[i].blocks;
    if (!blocks) continue;
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j];
      if (b.type !== 'tool_use') continue;
      if (!ARTIFACT_TOOLS.has(b.name) || b.status !== 'done') continue;
      const rawPath = b.input?.path;
      if (typeof rawPath !== 'string' || !rawPath) continue;
      const rawContent = b.input?.content;
      const body =
        typeof rawContent === 'string' ? rawContent
        : typeof b.result === 'string' ? b.result
        : '';
      return { path: rawPath, body };
    }
  }
  return null;
}

interface ChatWorkCanvasProps {
  artifact: CanvasArtifact;
  isStreaming?: boolean;
  onClose: () => void;
}

const ChatWorkCanvas = memo(({ artifact, isStreaming, onClose }: ChatWorkCanvasProps) => {
  const name = artifact.path.split('/').pop() || artifact.path;

  const openInFiles = () => {
    stashDeepLink({ appId: 'files', path: artifact.path });
    window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'files' } }));
  };

  return (
    <aside
      className="hidden w-[42%] min-w-[320px] shrink-0 flex-col border-l border-[var(--line-soft)] bg-[var(--bg-2)] min-[820px]:flex"
      data-testid="chat-work-canvas"
      aria-label="Work canvas"
    >
      <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-4 py-2.5">
        <span className="truncate font-mono text-[12.5px] text-[var(--text)]">{name}</span>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--healthy)]">
          <span
            aria-hidden
            className={`inline-block h-[6px] w-[6px] rounded-full bg-[var(--healthy)] ${isStreaming ? 'dot-live motion-reduce:animate-none' : ''}`}
          />
          {isStreaming ? 'live draft' : 'draft'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={openInFiles}
            title="Open in Files"
            aria-label="Open in Files"
            data-testid="chat-canvas-open"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close canvas"
            aria-label="Close canvas"
            data-testid="chat-canvas-close"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-5 py-4 text-[14px] leading-[1.7] text-[var(--text-2)]">
        {artifact.body ? (
          <>
            <span dangerouslySetInnerHTML={{ __html: renderChatMarkdown(artifact.body) }} />
            {isStreaming && (
              <span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[var(--honey)] motion-reduce:animate-none" />
            )}
          </>
        ) : (
          <p className="font-mono text-[12px] text-[var(--text-dim)]">
            {name} was written — open it in Files to view the contents.
          </p>
        )}
      </div>
    </aside>
  );
});

ChatWorkCanvas.displayName = 'ChatWorkCanvas';
export default ChatWorkCanvas;
