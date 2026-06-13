/**
 * ArtifactBlock (UX-Northstar 2026-06-13 Phase C2 — the Cowork take).
 *
 * When the agent finishes a file-producing tool call, the result IS the
 * artifact — render it as an openable card (icon + name + Open in Files),
 * not a collapsed tool-debug row. BlockRenderer routes completed
 * write_file/edit_file/file_write blocks here; running/failed calls keep
 * the generic ToolUseBlock so progress and errors stay visible.
 */
import { memo } from 'react';
import {
  FileText, FileCode, FileSpreadsheet, FileImage, File as FileIcon,
  ArrowUpRight, Sparkles,
} from 'lucide-react';
import { stashDeepLink } from '@/lib/app-deeplink';
import type { ToolUseContentBlock } from '@/lib/types';

const ARTIFACT_TOOLS = new Set(['write_file', 'edit_file', 'file_write']);

/** BlockRenderer's routing predicate: completed file-writes with a path. */
export function isArtifactBlock(block: ToolUseContentBlock): boolean {
  return (
    ARTIFACT_TOOLS.has(block.name) &&
    block.status === 'done' &&
    typeof block.input?.path === 'string' &&
    (block.input.path as string).length > 0
  );
}

function iconFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'txt', 'doc', 'docx', 'pdf', 'log'].includes(ext)) return FileText;
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'html', 'css', 'json', 'yaml', 'yml', 'sh'].includes(ext)) return FileCode;
  if (['csv', 'xlsx', 'xls'].includes(ext)) return FileSpreadsheet;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return FileImage;
  return FileIcon;
}

const ArtifactBlock = memo(({ block }: { block: ToolUseContentBlock }) => {
  const path = String(block.input?.path ?? '');
  const name = path.split('/').pop() || path;
  const Icon = iconFor(name);
  const verb = block.name === 'edit_file' ? 'Updated' : 'Created';

  const openInFiles = () => {
    stashDeepLink({ appId: 'files', path });
    window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'files' } }));
  };

  return (
    <div
      className="my-1.5 flex items-center gap-3 p-2.5 rounded-xl border border-primary/30 bg-primary/5"
      data-testid="chat-artifact-block"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-display font-medium text-foreground truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          <Sparkles className="w-3 h-3 inline mr-1 align-text-top" />
          {verb} by the agent{path !== name ? ` · ${path}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={openInFiles}
        data-testid="chat-artifact-open"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-display hover:bg-primary/20 transition-colors shrink-0"
      >
        Open in Files <ArrowUpRight className="w-3 h-3" />
      </button>
    </div>
  );
});

ArtifactBlock.displayName = 'ArtifactBlock';
export default ArtifactBlock;
