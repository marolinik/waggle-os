/**
 * Email Connector — send emails via SendGrid.
 * Auth: API Key (SendGrid API key)
 * ALL send operations are high-risk (external communication) and require approval.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.sendgrid.com/v3';

export class EmailConnector extends BaseConnector {
  readonly id = 'email';
  readonly name = 'Email (SendGrid)';
  readonly description = 'Send emails, use templates, and track delivery via SendGrid';
  readonly service = 'sendgrid.com';
  readonly authType = 'api_key' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'send_email',
      description: 'Send a plain text or HTML email',
      inputSchema: {
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body (plain text or HTML)' },
          html: { type: 'boolean', description: 'If true, body is treated as HTML (default: false)' },
          cc: { type: 'string', description: 'CC email address (optional)' },
          bcc: { type: 'string', description: 'BCC email address (optional)' },
        },
        required: ['to', 'subject', 'body'],
      },
      riskLevel: 'high',
    },
    {
      name: 'send_template',
      description: 'Send an email using a SendGrid dynamic template',
      inputSchema: {
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          template_id: { type: 'string', description: 'SendGrid dynamic template ID' },
          variables: { type: 'object', description: 'Template variable key-value pairs' },
        },
        required: ['to', 'template_id'],
      },
      riskLevel: 'high',
    },
    {
      name: 'check_delivery',
      description: 'Check delivery status of a sent message',
      inputSchema: {
        properties: {
          message_id: { type: 'string', description: 'SendGrid message ID' },
        },
        required: ['message_id'],
      },
      riskLevel: 'low',
    },
  ];

  private apiKey: string | null = null;
  private fromEmail = 'noreply@waggle.dev';
  private fromName = 'Waggle';
  private dailySendCount = 0;
  private dailyResetDate = new Date().toISOString().slice(0, 10);
  private maxDailyEmails = 100;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.apiKey = cred?.value ?? null;

    // Optional from_email/from_name config
    const fromEmailEntry = vault.get(`connector:${this.id}:from_email`);
    if (fromEmailEntry) this.fromEmail = fromEmailEntry.value;
    const fromNameEntry = vault.get(`connector:${this.id}:from_name`);
    if (fromNameEntry) this.fromName = fromNameEntry.value;
    const maxEntry = vault.get(`connector:${this.id}:max_daily`);
    if (maxEntry) this.maxDailyEmails = parseInt(maxEntry.value, 10) || 100;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.apiKey ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.apiKey) {
      try {
        const res = await fetch(`${API_BASE}/user/profile`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `SendGrid API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.apiKey) return { success: false, error: 'Not connected — add SendGrid API key in vault' };

    switch (action) {
      case 'send_email': return this.sendEmail(params);
      case 'send_template': return this.sendTemplate(params);
      case 'check_delivery': return this.checkDelivery(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private checkRateLimit(): string | null {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.dailyResetDate) {
      this.dailySendCount = 0;
      this.dailyResetDate = today;
    }
    if (this.dailySendCount >= this.maxDailyEmails) {
      return `Daily email limit reached (${this.maxDailyEmails}/day). Resets at midnight UTC.`;
    }
    return null;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async sendEmail(params: Record<string, unknown>): Promise<ConnectorResult> {
    const limitError = this.checkRateLimit();
    if (limitError) return { success: false, error: limitError };

    try {
      const personalizations: Record<string, unknown>[] = [{ to: [{ email: params.to }] }];
      if (params.cc) (personalizations[0] as any).cc = [{ email: params.cc }];
      if (params.bcc) (personalizations[0] as any).bcc = [{ email: params.bcc }];

      const content = params.html
        ? [{ type: 'text/html', value: params.body }]
        : [{ type: 'text/plain', value: params.body }];

      const res = await fetch(`${API_BASE}/mail/send`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          personalizations,
          from: { email: this.fromEmail, name: this.fromName },
          subject: params.subject,
          content,
        }),
        signal: AbortSignal.timeout(10000),
      });

      // SendGrid returns 202 Accepted for successful sends
      if (res.status !== 202 && !res.ok) {
        return { success: false, error: await this.safeErrorText(res, 'SendGrid API') };
      }

      this.dailySendCount++;
      const messageId = res.headers.get('X-Message-Id');
      return { success: true, data: { sent: true, to: params.to, messageId, dailySendCount: this.dailySendCount } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async sendTemplate(params: Record<string, unknown>): Promise<ConnectorResult> {
    const limitError = this.checkRateLimit();
    if (limitError) return { success: false, error: limitError };

    try {
      const res = await fetch(`${API_BASE}/mail/send`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: params.to }],
            dynamic_template_data: params.variables ?? {},
          }],
          from: { email: this.fromEmail, name: this.fromName },
          template_id: params.template_id,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status !== 202 && !res.ok) {
        return { success: false, error: await this.safeErrorText(res, 'SendGrid API') };
      }

      this.dailySendCount++;
      return { success: true, data: { sent: true, to: params.to, template: params.template_id } };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkDelivery(params: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(String(params.message_id))}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'SendGrid API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
