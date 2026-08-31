/**
 * OfflineManager — Periodic LLM health check, offline state management,
 * and message queue for when LLM is unreachable.
 *
 * PM-6: Offline Mode
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export interface OfflineState {
  offline: boolean;
  since: string | null;
  queuedMessages: number;
}

export interface QueuedMessage {
  id: string;
  workspaceId: string;
  message: string;
  timestamp: string;
}

export interface OfflineManagerConfig {
  /** Directory for persistent storage (e.g. ~/.waggle) */
  dataDir: string;
  /** How often to check LLM health, in ms (default: 30000) */
  checkIntervalMs?: number;
  /** Function that returns the current LLM endpoint URL to probe */
  getLlmEndpoint: () => string;
  /** Function that returns the API key for the LLM endpoint */
  getLlmApiKey: () => string;
  /** Provider-aware check that confirms a model can serve completions */
  checkLlmReadiness?: (signal: AbortSignal) => Promise<boolean>;
  /** Event bus for emitting SSE notifications */
  eventBus: EventEmitter;
}

export class OfflineManager {
  private _offline = false;
  private _since: string | null = null;
  private _queue: QueuedMessage[] = [];
  private _queuePath: string;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _checkIntervalMs: number;
  private _getLlmEndpoint: () => string;
  private _getLlmApiKey: () => string;
  private _checkLlmReadiness: ((signal: AbortSignal) => Promise<boolean>) | undefined;
  private _activeCheck: Promise<boolean> | null = null;
  private _checkAbortController: AbortController | null = null;
  private _eventBus: EventEmitter;
  private _lastCheck: string = new Date().toISOString();

  constructor(config: OfflineManagerConfig) {
    this._checkIntervalMs = config.checkIntervalMs ?? 30_000;
    this._getLlmEndpoint = config.getLlmEndpoint;
    this._getLlmApiKey = config.getLlmApiKey;
    this._checkLlmReadiness = config.checkLlmReadiness;
    this._eventBus = config.eventBus;
    this._queuePath = path.join(config.dataDir, 'offline-queue.json');

    // Load persisted queue
    this._loadQueue();
  }

  /** Current offline state */
  get state(): OfflineState {
    return {
      offline: this._offline,
      since: this._since,
      queuedMessages: this._queue.length,
    };
  }

  /** Whether the LLM is currently unreachable */
  get isOffline(): boolean {
    return this._offline;
  }

  /** When the last health check was performed */
  get lastCheck(): string {
    return this._lastCheck;
  }

  /** Start periodic health checks */
  start(): void {
    if (this._timer) return;
    // Run an initial check
    void this._runManagedCheck().catch(() => {});
    this._timer = setInterval(() => {
      void this._runManagedCheck().catch(() => {});
    }, this._checkIntervalMs);
  }

  /** Stop periodic health checks */
  async stop(): Promise<void> {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    const activeCheck = this._activeCheck;
    this._checkAbortController?.abort();
    if (activeCheck) await activeCheck.catch(() => false);
  }

  /** Queue a message for later delivery */
  queueMessage(workspaceId: string, message: string): QueuedMessage {
    const entry: QueuedMessage = {
      id: crypto.randomUUID(),
      workspaceId,
      message,
      timestamp: new Date().toISOString(),
    };
    this._queue.push(entry);
    this._persistQueue();
    return entry;
  }

  /** List all queued messages */
  getQueue(): QueuedMessage[] {
    return [...this._queue];
  }

  /** Remove a message from the queue by ID */
  dequeue(id: string): boolean {
    const idx = this._queue.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this._queue.splice(idx, 1);
    this._persistQueue();
    return true;
  }

  /** Clear all queued messages */
  clearQueue(): number {
    const count = this._queue.length;
    this._queue = [];
    this._persistQueue();
    return count;
  }

  /** Perform a single health check (exposed for testing) */
  async checkHealth(): Promise<boolean> {
    return this._checkHealth();
  }

  // ── Internal ────────────────────────────────────────────────────

  private _runManagedCheck(): Promise<boolean> {
    if (this._activeCheck) return this._activeCheck;

    const controller = new AbortController();
    this._checkAbortController = controller;
    const activeCheck = this._checkHealth(controller.signal).finally(() => {
      if (this._activeCheck === activeCheck) {
        this._activeCheck = null;
        this._checkAbortController = null;
      }
    });
    this._activeCheck = activeCheck;
    return activeCheck;
  }

  private async _checkHealth(signal?: AbortSignal): Promise<boolean> {
    const wasOffline = this._offline;
    let reachable = false;

    try {
      if (this._checkLlmReadiness) {
        reachable = await this._checkLlmReadiness(signal ?? new AbortController().signal);
      } else {
        const endpoint = this._getLlmEndpoint();
        const apiKey = this._getLlmApiKey();

        // Legacy endpoint probe for standalone users that do not provide the
        // production completion-readiness callback.
        const probeUrl = endpoint.includes('anthropic')
          ? `${endpoint.replace(/\/+$/, '')}/v1/models`
          : `${endpoint.replace(/\/+$/, '')}/health`;

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 5_000);

        const headers: Record<string, string> = {};
        if (apiKey) {
          // Anthropic uses x-api-key, OpenAI-compat uses Authorization
          if (endpoint.includes('anthropic')) {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
          } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
        }

        let response: Response;
        try {
          response = await fetch(probeUrl, {
            method: 'GET',
            headers,
            signal: signal ? AbortSignal.any([signal, ac.signal]) : ac.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // Authentication failures and missing routes are not model-ready.
        reachable = response.status >= 200 && response.status < 300;
      }
    } catch {
      reachable = false;
    }

    // Shutdown cancellation is not a provider failure and must not emit a
    // stale offline transition after the server has begun closing.
    if (signal?.aborted) return false;

    this._lastCheck = new Date().toISOString();

    if (reachable && wasOffline) {
      // Connection restored
      this._offline = false;
      this._since = null;
      this._eventBus.emit('notification', {
        type: 'notification',
        timestamp: new Date().toISOString(),
        title: 'Back online',
        body: 'Model connection restored. Retry any failed chat turn.',
        category: 'agent',
      });
      this._eventBus.emit('offline_state_change', { offline: false, queuedMessages: this._queue.length });
    } else if (!reachable && !wasOffline) {
      // Connection lost
      this._offline = true;
      this._since = new Date().toISOString();
      this._eventBus.emit('notification', {
        type: 'notification',
        timestamp: new Date().toISOString(),
        title: 'Offline',
        body: 'Model connection lost. Local tools still work. Retry failed chat turns after it reconnects.',
        category: 'agent',
      });
      this._eventBus.emit('offline_state_change', { offline: true, since: this._since });
    }

    return reachable;
  }

  private _loadQueue(): void {
    try {
      if (fs.existsSync(this._queuePath)) {
        const raw = fs.readFileSync(this._queuePath, 'utf-8');
        this._queue = JSON.parse(raw) as QueuedMessage[];
      }
    } catch {
      this._queue = [];
    }
  }

  private _persistQueue(): void {
    try {
      fs.writeFileSync(this._queuePath, JSON.stringify(this._queue, null, 2), 'utf-8');
    } catch {
      // Non-blocking — queue persistence failure should not crash
    }
  }
}
