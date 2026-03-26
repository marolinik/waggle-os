import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ConnectorData } from './types';
import { connectorStatusColor, connectorDotBg } from './helpers';

interface ConnectorsCardProps {
  connectors: ConnectorData[];
  connectingId: string | null;
  connectToken: string;
  onConnectTokenChange: (token: string) => void;
  onConnect: (id: string, token: string) => void;
  onDisconnect: (id: string) => void;
}

export function ConnectorsCard({
  connectors,
  connectingId,
  connectToken,
  onConnectTokenChange,
  onConnect,
  onDisconnect,
}: ConnectorsCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">Connectors</CardTitle>
      </CardHeader>
      <CardContent>
        {connectors.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No connectors configured yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {connectors.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-border bg-muted/30 p-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
                        connectorDotBg(c.status),
                        c.status === 'connected' && 'shadow-[0_0_6px] shadow-green-400'
                      )}
                    />
                    <span className="text-[13px] font-semibold">{c.name}</span>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider',
                        connectorStatusColor(c.status)
                      )}
                    >
                      {c.status}
                    </span>
                    {c.status === 'connected' && c.capabilities && c.capabilities.length > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        · {c.capabilities.length} {c.capabilities.length === 1 ? 'action' : 'actions'}
                      </span>
                    )}
                  </div>

                  {(c.status === 'connected' || c.status === 'error') && (
                    <button
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded border',
                        'text-red-400 border-red-400/20',
                        connectingId === c.id && 'opacity-50 cursor-default'
                      )}
                      onClick={() => onDisconnect(c.id)}
                      disabled={connectingId === c.id}
                      aria-label={`Disconnect ${c.name}`}
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                  <span>service: {c.service}</span>
                  <span>auth: {c.authType}</span>
                  <span>substrate: {c.substrate}</span>
                </div>

                {/* Connect form -- shows only when disconnected */}
                {c.status === 'disconnected' && (
                  <div className="mt-2 pt-2 border-t border-border flex gap-1.5 items-center">
                    <input
                      type="password"
                      placeholder={
                        c.authType === 'bearer'
                          ? 'Paste personal access token...'
                          : 'Enter API key...'
                      }
                      value={connectToken}
                      onChange={(e) => onConnectTokenChange(e.target.value)}
                      aria-label={`${c.authType === 'bearer' ? 'Access token' : 'API key'} for ${c.name}`}
                      className="flex-1 bg-muted border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground font-mono placeholder:text-muted-foreground"
                    />
                    <button
                      className={cn(
                        'text-[11px] font-semibold px-3.5 py-1 rounded-md border-none transition-colors',
                        connectToken
                          ? 'bg-primary text-primary-foreground cursor-pointer'
                          : 'bg-muted text-muted-foreground cursor-default'
                      )}
                      onClick={() => connectToken && onConnect(c.id, connectToken)}
                      disabled={!connectToken || connectingId === c.id}
                      aria-label={`Connect ${c.name}`}
                    >
                      {connectingId === c.id ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
