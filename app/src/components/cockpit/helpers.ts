/**
 * Cockpit shared helper functions — formatting, color mapping.
 */

export function formatTime(iso: string | null): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--';
  }
}

export function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return 'just now';
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '--';
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'ok':
    case 'healthy':
      return 'text-green-500';
    case 'degraded':
      return 'text-yellow-500';
    default:
      return 'text-red-500';
  }
}

export function statusDotBg(status: string): string {
  switch (status) {
    case 'ok':
    case 'healthy':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    default:
      return 'bg-red-500';
  }
}

export function actionDotColor(action: string): string {
  switch (action) {
    case 'installed':
      return 'bg-green-500';
    case 'proposed':
      return 'bg-blue-400';
    case 'approved':
      return 'bg-yellow-500';
    case 'failed':
    case 'rejected':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

export function actionTextColor(action: string): string {
  switch (action) {
    case 'installed':
      return 'text-green-500';
    case 'proposed':
      return 'text-blue-400';
    case 'approved':
      return 'text-yellow-500';
    case 'failed':
    case 'rejected':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

export function riskColor(risk: string): string {
  switch (risk) {
    case 'low':
      return 'text-green-500';
    case 'medium':
      return 'text-yellow-500';
    case 'high':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

export function connectorStatusColor(status: string): string {
  switch (status) {
    case 'connected':
      return 'text-green-400';
    case 'disconnected':
      return 'text-muted-foreground';
    case 'expired':
      return 'text-yellow-400';
    case 'error':
      return 'text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

export function connectorDotBg(status: string): string {
  switch (status) {
    case 'connected':
      return 'bg-green-400';
    case 'disconnected':
      return 'bg-muted-foreground';
    case 'expired':
      return 'bg-yellow-400';
    case 'error':
      return 'bg-red-400';
    default:
      return 'bg-muted-foreground';
  }
}

/** Format bytes into human-readable KB/MB/GB */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
