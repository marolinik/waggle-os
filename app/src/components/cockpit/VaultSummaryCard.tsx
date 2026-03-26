import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { ConnectorData } from './types';

interface VaultSummaryCardProps {
  connectors: ConnectorData[];
}

export function VaultSummaryCard({ connectors }: VaultSummaryCardProps) {
  const totalConnectors = connectors.length;
  const connectedCount = connectors.filter((c) => c.status === 'connected').length;
  const disconnectedCount = connectors.filter((c) => c.status === 'disconnected').length;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Vault Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
            <div className="text-xl font-bold text-primary leading-none">{totalConnectors}</div>
            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Connectors</div>
          </div>
          <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
            <div className={`text-xl font-bold leading-none ${connectedCount > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>{connectedCount}</div>
            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Active</div>
          </div>
          <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
            <div className="text-xl font-bold text-muted-foreground leading-none">{disconnectedCount}</div>
            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Inactive</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
