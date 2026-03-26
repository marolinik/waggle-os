import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { HealthData, CapabilitiesData } from './types';

interface AgentTopologyCardProps {
  health: HealthData | null;
  capabilities: CapabilitiesData | null;
}

export function AgentTopologyCard({ health, capabilities }: AgentTopologyCardProps) {
  // Use real model name from health endpoint (which now includes defaultModel)
  const modelName = health?.defaultModel || 'unknown';
  const toolCount = capabilities?.tools.count ?? 0;
  const workflowTemplates = capabilities?.workflows ?? [];
  const skillCount = capabilities?.skills.length ?? 0;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">AI Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        {!health ? (
          <p className="text-xs text-muted-foreground py-2">Loading...</p>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Model info */}
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Active Model</div>
              <div className="text-sm font-semibold text-primary">{modelName}</div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-center">
                <div className="text-lg font-bold text-primary leading-none">{toolCount}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Tools</div>
              </div>
              <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-center">
                <div className="text-lg font-bold text-primary leading-none">{skillCount}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Skills</div>
              </div>
              <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-center">
                <div className="text-lg font-bold text-primary leading-none">{workflowTemplates.length}</div>
                <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Workflows</div>
              </div>
            </div>

            {/* Workflow templates */}
            {workflowTemplates.length > 0 && (
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Workflow Templates</div>
                <div className="flex flex-col gap-1">
                  {workflowTemplates.map((wf) => (
                    <div key={wf.name} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{wf.name}</span>
                      <span className="text-muted-foreground">{wf.steps} steps</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LLM provider info */}
            <div className="text-[11px] text-muted-foreground pt-1 border-t border-border">
              Provider: {health.llm.provider} | Mode: {health.mode}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
