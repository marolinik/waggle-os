/**
 * DiffViewer — displays file diffs in unified or side-by-side mode.
 *
 * Uses computeUnifiedDiff to produce line-by-line diff output with
 * red/green coloring for removed/added lines.
 */

import { useMemo } from 'react';
import type { DiffEntry, DiffLine, DiffViewMode } from './utils.js';
import { computeUnifiedDiff } from './utils.js';

interface DiffRow {
  left?: DiffLine;
  right?: DiffLine;
}

export interface DiffViewerProps {
  diff: DiffEntry;
  mode?: DiffViewMode;
  onModeChange?: (mode: DiffViewMode) => void;
}

const LINE_COLORS = {
  added: 'bg-green-900/30 text-green-300',
  removed: 'bg-red-900/30 text-red-300',
  unchanged: 'text-muted-foreground',
} as const;

const LINE_MARKERS = {
  added: '+',
  removed: '-',
  unchanged: ' ',
} as const;

export function DiffViewer({ diff, mode = 'unified', onModeChange }: DiffViewerProps) {
  const diffLines = useMemo(
    () => computeUnifiedDiff(diff.oldContent, diff.newContent),
    [diff.oldContent, diff.newContent],
  );

  // Build paired rows for side-by-side mode
  const sideBySideRows = useMemo((): DiffRow[] => {
    const rows: DiffRow[] = [];
    let i = 0;
    while (i < diffLines.length) {
      const line = diffLines[i];
      if (line.type === 'unchanged') {
        rows.push({ left: line, right: line });
        i++;
      } else {
        // Collect consecutive removed+added block
        const removed: DiffLine[] = [];
        const added: DiffLine[] = [];
        while (i < diffLines.length && diffLines[i].type === 'removed') {
          removed.push(diffLines[i]);
          i++;
        }
        while (i < diffLines.length && diffLines[i].type === 'added') {
          added.push(diffLines[i]);
          i++;
        }
        const maxLen = Math.max(removed.length, added.length);
        for (let k = 0; k < maxLen; k++) {
          rows.push({
            left: k < removed.length ? removed[k] : undefined,
            right: k < added.length ? added[k] : undefined,
          });
        }
      }
    }
    return rows;
  }, [diffLines]);

  return (
    <div className="diff-viewer bg-background rounded overflow-auto text-sm font-mono">
      {/* Toolbar */}
      <div className="diff-viewer__toolbar flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs text-muted-foreground">{diff.name}</span>
        {onModeChange && (
          <div className="flex gap-1">
            <button
              className={`text-xs px-2 py-0.5 rounded ${
                mode === 'unified' ? 'bg-secondary text-primary-foreground' : 'text-muted-foreground hover:text-primary-foreground'
              }`}
              onClick={() => onModeChange('unified')}
              type="button"
            >
              Unified
            </button>
            <button
              className={`text-xs px-2 py-0.5 rounded ${
                mode === 'side-by-side' ? 'bg-secondary text-primary-foreground' : 'text-muted-foreground hover:text-primary-foreground'
              }`}
              onClick={() => onModeChange('side-by-side')}
              type="button"
            >
              Side by Side
            </button>
          </div>
        )}
      </div>

      {/* Diff content */}
      {mode === 'unified' ? (
        <div className="diff-viewer__unified py-1">
          {diffLines.map((line, i) => (
            <div key={i} className={`flex ${LINE_COLORS[line.type]} px-3 leading-5`}>
              <span className="select-none w-10 text-right pr-2 text-muted-foreground/60 shrink-0">
                {line.lineNumber.old ?? ''}
              </span>
              <span className="select-none w-10 text-right pr-2 text-muted-foreground/60 shrink-0">
                {line.lineNumber.new ?? ''}
              </span>
              <span className="select-none w-4 text-center shrink-0">
                {LINE_MARKERS[line.type]}
              </span>
              <span className="flex-1 whitespace-pre">{line.content || '\u00A0'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="diff-viewer__side-by-side flex">
          {/* Old side */}
          <div className="flex-1 border-r border-border py-1">
            {sideBySideRows.map((row, i) => {
              const line = row.left;
              const type = line?.type === 'unchanged' ? 'unchanged' : line ? 'removed' : 'unchanged';
              return (
                <div key={i} className={`flex ${line ? LINE_COLORS[type] : ''} px-3 leading-5`}>
                  <span className="select-none w-10 text-right pr-2 text-muted-foreground/60 shrink-0">
                    {line?.lineNumber.old ?? ''}
                  </span>
                  <span className="flex-1 whitespace-pre">{line?.content || '\u00A0'}</span>
                </div>
              );
            })}
          </div>
          {/* New side */}
          <div className="flex-1 py-1">
            {sideBySideRows.map((row, i) => {
              const line = row.right;
              const type = line?.type === 'unchanged' ? 'unchanged' : line ? 'added' : 'unchanged';
              return (
                <div key={i} className={`flex ${line ? LINE_COLORS[type] : ''} px-3 leading-5`}>
                  <span className="select-none w-10 text-right pr-2 text-muted-foreground/60 shrink-0">
                    {line?.lineNumber.new ?? ''}
                  </span>
                  <span className="flex-1 whitespace-pre">{line?.content || '\u00A0'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
