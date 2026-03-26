/**
 * TelemetryCollector — local-only opt-in usage analytics.
 *
 * Collects: tool use, commands, errors, capability gaps, workflow modes, session metrics.
 * Does NOT collect: message content, file contents, workspace names, API keys, PII.
 * Storage: ~/.waggle/telemetry.json with daily aggregation.
 * No remote sending in V1 — collection only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TelemetryEvent {
  category: 'tool_use' | 'command' | 'error' | 'capability_gap' | 'workflow' | 'session';
  name: string;
  count: number;
  date: string; // YYYY-MM-DD
}

export interface TelemetryReport {
  events: TelemetryEvent[];
  totalEvents: number;
  dateRange: { from: string; to: string };
}

export class TelemetryCollector {
  private dataDir: string;
  private filePath: string;
  private enabled: boolean;
  private events: Map<string, TelemetryEvent> = new Map();

  constructor(dataDir: string, enabled = false) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'telemetry.json');
    this.enabled = enabled;

    // Load existing events from disk
    if (this.enabled) {
      this.loadFromDisk();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled && this.events.size === 0) {
      this.loadFromDisk();
    }
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private eventKey(category: string, name: string, date: string): string {
    return `${category}:${name}:${date}`;
  }

  private record(category: TelemetryEvent['category'], name: string): void {
    if (!this.enabled) return;

    const date = this.today();
    const key = this.eventKey(category, name, date);
    const existing = this.events.get(key);

    if (existing) {
      existing.count++;
    } else {
      this.events.set(key, { category, name, count: 1, date });
    }
  }

  recordToolUse(toolName: string): void {
    this.record('tool_use', toolName);
  }

  recordCommand(commandName: string): void {
    this.record('command', commandName);
  }

  recordError(errorType: string): void {
    this.record('error', errorType);
  }

  recordCapabilityGap(need: string): void {
    this.record('capability_gap', need);
  }

  recordWorkflow(mode: string): void {
    this.record('workflow', mode);
  }

  recordSession(durationMs: number, interactionCount: number): void {
    if (!this.enabled) return;
    const date = this.today();
    // Store as aggregated metrics
    const durationKey = this.eventKey('session', 'duration_total_ms', date);
    const countKey = this.eventKey('session', 'interaction_count', date);
    const sessionKey = this.eventKey('session', 'session_count', date);

    const durationEvt = this.events.get(durationKey);
    if (durationEvt) { durationEvt.count += durationMs; }
    else { this.events.set(durationKey, { category: 'session', name: 'duration_total_ms', count: durationMs, date }); }

    const countEvt = this.events.get(countKey);
    if (countEvt) { countEvt.count += interactionCount; }
    else { this.events.set(countKey, { category: 'session', name: 'interaction_count', count: interactionCount, date }); }

    const sessEvt = this.events.get(sessionKey);
    if (sessEvt) { sessEvt.count++; }
    else { this.events.set(sessionKey, { category: 'session', name: 'session_count', count: 1, date }); }
  }

  /** Write collected events to disk */
  flush(): void {
    if (!this.enabled) return;
    if (this.events.size === 0) return;

    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = [...this.events.values()];
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch {
      // Telemetry failure should never affect the app
    }
  }

  /** Get a report of collected events */
  getReport(days = 30): TelemetryReport {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const events = [...this.events.values()].filter(e => e.date >= cutoffStr);
    const dates = events.map(e => e.date).sort();

    return {
      events,
      totalEvents: events.reduce((sum, e) => sum + e.count, 0),
      dateRange: {
        from: dates[0] ?? this.today(),
        to: dates[dates.length - 1] ?? this.today(),
      },
    };
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (Array.isArray(raw)) {
        for (const evt of raw) {
          const key = this.eventKey(evt.category, evt.name, evt.date);
          this.events.set(key, evt);
        }
      }
    } catch {
      // Corrupted telemetry file — start fresh
    }
  }
}
