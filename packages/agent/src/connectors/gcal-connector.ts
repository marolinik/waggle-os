/**
 * Google Calendar Connector — manage events and find free time.
 * Auth: OAuth2 (access + refresh tokens in vault, auto-refresh on expiry)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleCalendarConnector extends BaseConnector {
  readonly id = 'gcal';
  readonly name = 'Google Calendar';
  readonly description = 'List events, create events, find free time on Google Calendar';
  readonly service = 'calendar.google.com';
  readonly authType = 'oauth2' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_events',
      description: 'List upcoming calendar events',
      inputSchema: {
        properties: {
          timeMin: { type: 'string', description: 'Start time (ISO 8601, default: now)' },
          timeMax: { type: 'string', description: 'End time (ISO 8601, default: 7 days from now)' },
          maxResults: { type: 'number', description: 'Max events to return (default 10)' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_event',
      description: 'Create a new calendar event',
      inputSchema: {
        properties: {
          summary: { type: 'string', description: 'Event title' },
          start: { type: 'string', description: 'Start time (ISO 8601)' },
          end: { type: 'string', description: 'End time (ISO 8601)' },
          description: { type: 'string', description: 'Event description' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
        },
        required: ['summary', 'start', 'end'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_event',
      description: 'Update an existing calendar event',
      inputSchema: {
        properties: {
          eventId: { type: 'string', description: 'Event ID to update' },
          summary: { type: 'string', description: 'New event title' },
          start: { type: 'string', description: 'New start time (ISO 8601)' },
          end: { type: 'string', description: 'New end time (ISO 8601)' },
          description: { type: 'string', description: 'New description' },
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
        },
        required: ['eventId'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'find_free_time',
      description: 'Find available time slots across calendars',
      inputSchema: {
        properties: {
          attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses to check availability for' },
          duration: { type: 'number', description: 'Desired slot duration in minutes' },
          timeMin: { type: 'string', description: 'Start of search range (ISO 8601)' },
          timeMax: { type: 'string', description: 'End of search range (ISO 8601)' },
        },
        required: ['duration', 'timeMin', 'timeMax'],
      },
      riskLevel: 'low',
    },
  ];

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: string | null = null;
  private clientId: string | null = null;
  private clientSecret: string | null = null;
  private vault: VaultStore | null = null;

  async connect(vault: VaultStore): Promise<void> {
    this.vault = vault;
    const cred = vault.getConnectorCredential(this.id);
    if (cred) {
      this.accessToken = cred.value;
      this.refreshToken = cred.refreshToken ?? null;
      this.expiresAt = cred.expiresAt ?? null;
    }

    const clientIdEntry = vault.get(`connector:${this.id}:client_id`);
    this.clientId = clientIdEntry?.value ?? null;
    const clientSecretEntry = vault.get(`connector:${this.id}:client_secret`);
    this.clientSecret = clientSecretEntry?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.accessToken ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
      tokenExpiresAt: this.expiresAt ?? undefined,
    };

    if (this.accessToken) {
      try {
        await this.ensureValidToken();
        const res = await fetch(`${CALENDAR_API}/users/me/calendarList?maxResults=1`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Google Calendar API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.accessToken) return { success: false, error: 'Not connected — complete Google Calendar OAuth in Settings' };

    try {
      await this.ensureValidToken();
    } catch (err: unknown) {
      return { success: false, error: `Token refresh failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    switch (action) {
      case 'list_events': return this.listEvents(params);
      case 'create_event': return this.createEvent(params);
      case 'update_event': return this.updateEvent(params);
      case 'find_free_time': return this.findFreeTime(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /** Refresh the access token if expired */
  private async ensureValidToken(): Promise<void> {
    if (!this.expiresAt) return; // No expiry info — assume valid
    if (new Date(this.expiresAt) > new Date()) return; // Still valid
    if (!this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new Error('Cannot refresh token — missing refresh_token, client_id, or client_secret');
    }

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

    const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
    this.accessToken = data.access_token;
    this.expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    if (data.refresh_token) this.refreshToken = data.refresh_token;

    // Persist updated tokens back to vault
    if (this.vault) {
      this.vault.setConnectorCredential(this.id, {
        type: 'oauth2',
        value: this.accessToken,
        refreshToken: this.refreshToken ?? undefined,
        expiresAt: this.expiresAt,
      });
    }
  }

  private async listEvents(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const calendarId = (params.calendarId as string) || 'primary';
      const timeMin = (params.timeMin as string) || new Date().toISOString();
      const timeMax = (params.timeMax as string) || new Date(Date.now() + 7 * 86400000).toISOString();
      const maxResults = (params.maxResults as number) || 10;

      const query = new URLSearchParams({
        timeMin, timeMax, maxResults: String(maxResults),
        singleEvents: 'true', orderBy: 'startTime',
      });
      const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${query}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createEvent(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const calendarId = (params.calendarId as string) || 'primary';
      const body: Record<string, unknown> = {
        summary: params.summary,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
      };
      if (params.description) body.description = params.description;
      if (params.attendees) {
        body.attendees = (params.attendees as string[]).map(email => ({ email }));
      }

      const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async updateEvent(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const calendarId = (params.calendarId as string) || 'primary';
      const { eventId, calendarId: _, ...updates } = params;
      const body: Record<string, unknown> = {};
      if (updates.summary) body.summary = updates.summary;
      if (updates.start) body.start = { dateTime: updates.start };
      if (updates.end) body.end = { dateTime: updates.end };
      if (updates.description) body.description = updates.description;

      const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(String(eventId))}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async findFreeTime(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const attendees = (params.attendees as string[]) ?? [];
      const items = attendees.length > 0
        ? attendees.map(email => ({ id: email }))
        : [{ id: 'primary' }];

      const res = await fetch(`${CALENDAR_API}/freeBusy`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          items,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Google API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
