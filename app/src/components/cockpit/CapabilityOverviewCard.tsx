import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { CapabilitiesData } from './types';

interface CapabilityOverviewCardProps {
  capabilities: CapabilitiesData | null;
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
      <div className="text-xl font-bold text-primary leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

export function CapabilityOverviewCard({ capabilities }: CapabilityOverviewCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Installed Tools</CardTitle>
      </CardHeader>
      <CardContent>
        {!capabilities ? (
          <p className="text-xs text-muted-foreground py-2">Loading capabilities...</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <StatBox value={capabilities.tools.count} label="Tools" />
              <StatBox value={capabilities.skills.length} label="Skills" />
              <StatBox value={capabilities.commands.length} label="Commands" />
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <StatBox value={capabilities.plugins.length} label="Plugins" />
              <StatBox value={capabilities.mcpServers.length} label="MCP Servers" />
              <StatBox value={capabilities.workflows.length} label="Workflows" />
            </div>
            {/* Tool breakdown */}
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span>Native: {capabilities.tools.native}</span>
              <span>Plugin: {capabilities.tools.plugin}</span>
              <span>MCP: {capabilities.tools.mcp}</span>
            </div>
            {/* UX-028: Improvement signals visibility placeholder */}
            <div className="mt-2 pt-2 text-xs text-muted-foreground/60" style={{ borderTop: '1px solid var(--hive-700)' }}>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400/60 animate-pulse" />
                <span>Agent learning active — patterns tracked automatically</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
