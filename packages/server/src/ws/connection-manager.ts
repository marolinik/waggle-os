import type { WebSocket } from 'ws';
import type { WsServerEvent } from '@waggle/shared';

export class ConnectionManager {
  private connections = new Map<string, Map<string, WebSocket>>(); // teamId -> userId -> ws

  add(teamId: string, userId: string, ws: WebSocket): void {
    if (!this.connections.has(teamId)) {
      this.connections.set(teamId, new Map());
    }
    this.connections.get(teamId)!.set(userId, ws);
  }

  remove(teamId: string, userId: string): void {
    this.connections.get(teamId)?.delete(userId);
    if (this.connections.get(teamId)?.size === 0) {
      this.connections.delete(teamId);
    }
  }

  broadcast(teamId: string, event: WsServerEvent, excludeUserId?: string): void {
    const team = this.connections.get(teamId);
    if (!team) return;
    const data = JSON.stringify(event);
    for (const [userId, ws] of team) {
      if (userId !== excludeUserId && ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  sendTo(teamId: string, userId: string, event: WsServerEvent): void {
    const ws = this.connections.get(teamId)?.get(userId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  getConnectedUsers(teamId: string): string[] {
    return Array.from(this.connections.get(teamId)?.keys() ?? []);
  }

  getTeamCount(): number {
    return this.connections.size;
  }
}
