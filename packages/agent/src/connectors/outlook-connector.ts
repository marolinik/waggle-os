/**
 * Outlook Connector — calendar events and email via Microsoft Graph API.
 * Auth: Bearer (Microsoft Graph API access token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://graph.microsoft.com/v1.0';

export class OutlookConnector extends BaseConnector {
  readonly id = 'outlook';
  readonly name = 'Outlook Calendar & Email';
  readonly description = 'Access calendar events and email via Microsoft Graph';
  readonly service = 'outlook.office365.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_events',
      description: 'List upcoming calendar events',
      inputSchema: {
        properties: {
          $top: { type: 'number', description: 'Max events to return (default 25)' },
          $orderby: { type: 'string', description: 'Order by field (default "start/dateTime")' },
          $filter: { type: 'string', description: 'OData filter expression (e.g., "start/dateTime ge \'2026-01-01\'")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_event',
      description: 'Create a new calendar event',
      inputSchema: {
        properties: {
          subject: { type: 'string', description: 'Event subject/title' },
          start: { type: 'string', description: 'Start datetime in ISO 8601 (e.g., "2026-03-20T10:00:00")' },
          end: { type: 'string', description: 'End datetime in ISO 8601 (e.g., "2026-03-20T11:00:00")' },
          timeZone: { type: 'string', description: 'Time zone (default "UTC")' },
          body: { type: 'string', description: 'Event body/description (HTML supported)' },
          location: { type: 'string', description: 'Event location' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
          isOnlineMeeting: { type: 'boolean', description: 'Create as online meeting (default false)' },
        },
        required: ['subject', 'start', 'end'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_emails',
      description: 'List recent emails from inbox',
      inputSchema: {
        properties: {
          $top: { type: 'number', description: 'Max emails to return (default 25)' },
          $filter: { type: 'string', description: 'OData filter (e.g., "isRead eq false")' },
          $orderby: { type: 'string', description: 'Order by field (default "receivedDateTime desc")' },
          $select: { type: 'string', description: 'Fields to select (e.g., "subject,from,receivedDateTime")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'send_email',
      description: 'Send an email',
      inputSchema: {
        properties: {
          to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (HTML supported)' },
          cc: { type: 'array', items: { type: 'string' }, description: 'CC email addresses' },
          importance: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Email importance (default "normal")' },
        },
        required: ['to', 'subject', 'body'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_emails',
      description: 'Search emails by keyword',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query (searches subject, body, and sender)' },
          $top: { type: 'number', description: 'Max results to return (default 25)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
    {
      name: 'get_email',
      description: 'Get a specific email by ID',
      inputSchema: {
        properties: {
          message_id: { type: 'string', description: 'Email message ID' },
          $select: { type: 'string', description: 'Fields to select' },
        },
        required: ['message_id'],
      },
      riskLevel: 'low',
    },
  ];

  private token: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.token ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.token) {
      try {
        const res = await fetch(`${API_BASE}/me`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Graph API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Microsoft Graph token in vault' };

    switch (action) {
      case 'list_events': return this.apiGet('/me/events', params);
      case 'create_event': return this.createEvent(params);
      case 'list_emails': return this.apiGet('/me/messages', params);
      case 'send_email': return this.sendEmail(params);
      case 'search_emails': return this.searchEmails(params);
      case 'get_email': return this.apiGet(`/me/messages/${params.message_id}`, params, ['message_id']);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async apiGet(path: string, params: Record<string, unknown>, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async createEvent(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const tz = (params.timeZone as string) ?? 'UTC';
      const body: Record<string, unknown> = {
        subject: params.subject,
        start: { dateTime: params.start, timeZone: tz },
        end: { dateTime: params.end, timeZone: tz },
      };
      if (params.body) {
        body.body = { contentType: 'html', content: String(params.body) };
      }
      if (params.location) {
        body.location = { displayName: String(params.location) };
      }
      if (Array.isArray(params.attendees)) {
        body.attendees = (params.attendees as string[]).map(email => ({
          emailAddress: { address: email },
          type: 'required',
        }));
      }
      if (params.isOnlineMeeting) {
        body.isOnlineMeeting = true;
        body.onlineMeetingProvider = 'teamsForBusiness';
      }

      const res = await fetch(`${API_BASE}/me/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendEmail(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const toRecipients = (params.to as string[]).map(email => ({
        emailAddress: { address: email },
      }));
      const message: Record<string, unknown> = {
        subject: params.subject,
        body: { contentType: 'html', content: String(params.body) },
        toRecipients,
      };
      if (Array.isArray(params.cc) && params.cc.length > 0) {
        message.ccRecipients = (params.cc as string[]).map(email => ({
          emailAddress: { address: email },
        }));
      }
      if (params.importance) {
        message.importance = params.importance;
      }

      const res = await fetch(`${API_BASE}/me/sendMail`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(10000),
      });
      // sendMail returns 202 Accepted with no body on success
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: { sent: true } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async searchEmails(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      query.set('$search', `"${String(params.query)}"`);
      if (params.$top !== undefined) query.set('$top', String(params.$top));
      const url = `${API_BASE}/me/messages?${query.toString()}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Graph API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
