/**
 * WsTeamClient — WebSocket client connecting local server to team server
 * for real-time Waggle Dance agent-to-agent communication.
 *
 * Protocol:
 * 1. Connect to ws://{serverUrl}/ws
 * 2. Send: { type: 'authenticate', token: '...' }
 * 3. Receive: { type: 'authenticated', userId: '...' }
 * 4. Send: { type: 'join_team', teamSlug: '...' }
 * 5. Receive: { type: 'joined_team', teamSlug: '...' }
 * 6. Receive: { type: 'waggle_message', message: WaggleMessage }
 */

import { EventEmitter } from 'node:events';

export interface WsTeamClientConfig {
  serverUrl: string;
  token: string;
  teamSlug: string;
}

export class WsTeamClient extends EventEmitter {
  private config: WsTeamClientConfig;
  private ws: any = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = true;
  private _authenticated = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WsTeamClientConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.ws) return; // Already connecting/connected

    try {
      const { default: WebSocket } = await import('ws');
      const url = this.config.serverUrl.replace(/^http/, 'ws') + '/ws';

      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.reconnectDelay = 1000; // Reset backoff on success
        // Step 1: Authenticate
        this.send({ type: 'authenticate', token: this.config.token });
      });

      this.ws.on('message', (data: any) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch { /* invalid JSON — ignore */ }
      });

      this.ws.on('close', () => {
        this._authenticated = false;
        this.ws = null;
        this.emit('disconnect');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        console.warn('[waggle] WS team client error:', err.message);
        // 'close' event will follow — reconnect happens there
      });
    } catch (err) {
      console.warn('[waggle] WS team client connect failed:', (err as Error).message);
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private handleEvent(event: any): void {
    switch (event.type) {
      case 'authenticated':
        this._authenticated = true;
        // Step 2: Join team
        this.send({ type: 'join_team', teamSlug: this.config.teamSlug });
        break;
      case 'joined_team':
        this.emit('connected', { teamSlug: event.teamSlug });
        break;
      case 'waggle_message':
        this.emit('message', event.message);
        break;
      case 'error':
        console.warn('[waggle] WS team server error:', event.message);
        break;
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return; // Already scheduled

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => { /* handled in connect */ });
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this._authenticated = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this._authenticated && this.ws?.readyState === 1; // WebSocket.OPEN
  }

  send(event: any): void {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(event));
    }
  }
}
