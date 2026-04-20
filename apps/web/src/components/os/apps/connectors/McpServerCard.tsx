/**
 * McpServerCard — one entry in the MCP catalog grid.
 *
 * Layout (2-column grid, responsive):
 *   ┌──────┬────────────────────────────────────────┐
 *   │ Tile │ Name · Official · ↗                    │
 *   │ 48px │ Description (2 lines clamped)          │
 *   │      │ [cap] [cap] [cap]                      │
 *   ├──────┴────────────────────────────────────────┤
 *   │ $ install command                     [Copy]  │
 *   └────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import { ExternalLink, Check, Copy, Info } from 'lucide-react';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import BrandTile from './BrandTile';
import { getBrandIdentity } from './brand-identity';
import type { McpServer } from './mcp-registry';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface McpServerCardProps {
  server: McpServer;
}

const McpServerCard = ({ server }: McpServerCardProps) => {
  const [copied, setCopied] = useState(false);
  const identity = getBrandIdentity(server.id, server.name, server.category);

  const handleCopy = (event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(server.installCmd).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="group relative flex flex-col gap-2.5 rounded-2xl border border-border/40 bg-secondary/20 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-secondary/40 hover:shadow-[0_12px_32px_-16px_rgba(229,160,0,0.35)]">
      {/* Top row — tile + meta */}
      <div className="flex items-start gap-3">
        <BrandTile identity={identity} size={48} official={server.official} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h4 className="truncate font-display text-[13px] font-semibold leading-tight text-foreground">
                  {server.name}
                </h4>
                {server.official && (
                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-primary">
                    Official
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {server.category} · {server.author}
              </p>
            </div>
            <HintTooltip content="View source repository">
              <a
                href={server.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-lg p-1 text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </HintTooltip>
          </div>

          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {server.description}
          </p>

          {server.capabilities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {server.capabilities.slice(0, 3).map((cap) => (
                <span
                  key={cap}
                  className="rounded-md bg-background/60 px-1.5 py-[1px] text-[10px] font-medium text-muted-foreground/90 ring-1 ring-border/40"
                >
                  {cap}
                </span>
              ))}
              {server.capabilities.length > 3 && (
                <span className="rounded-md px-1.5 py-[1px] text-[10px] font-medium text-muted-foreground/60">
                  +{server.capabilities.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Install command strip */}
      <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/60 px-2 py-1.5">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="How to install"
              className="shrink-0 rounded-md p-0.5 text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-[260px] text-xs p-3 space-y-1.5">
            <p className="font-display font-semibold text-foreground">Install an MCP server</p>
            <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
              <li>Copy the command below</li>
              <li>Run it in your terminal</li>
              <li>Restart Waggle — the server auto-appears in Connectors</li>
            </ol>
          </TooltipContent>
        </Tooltip>
        <span className="shrink-0 font-mono text-[10px] text-primary/70">$</span>
        <code className="flex-1 truncate font-mono text-[10px] text-foreground/90">
          {server.installCmd}
        </code>
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
          aria-label={copied ? 'Copied — paste in terminal' : 'Copy install command'}
        >
          {copied ? (
            <>
              <Check className="h-2.5 w-2.5" /> Copied — paste in terminal
            </>
          ) : (
            <>
              <Copy className="h-2.5 w-2.5" /> Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default McpServerCard;
