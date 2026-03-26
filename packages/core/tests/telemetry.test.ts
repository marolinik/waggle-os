import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryCollector } from '../src/telemetry.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('TelemetryCollector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `waggle-telemetry-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  it('records events when enabled', () => {
    const collector = new TelemetryCollector(tmpDir, true);
    collector.recordToolUse('web_search');
    collector.recordToolUse('web_search');
    collector.recordToolUse('save_memory');

    const report = collector.getReport();
    expect(report.totalEvents).toBe(3);
    const webSearch = report.events.find(e => e.name === 'web_search');
    expect(webSearch?.count).toBe(2);
  });

  it('silently drops events when disabled', () => {
    const collector = new TelemetryCollector(tmpDir, false);
    collector.recordToolUse('web_search');
    collector.recordCommand('/research');
    collector.recordError('timeout');

    const report = collector.getReport();
    expect(report.totalEvents).toBe(0);
  });

  it('no PII in collected data — tool names only', () => {
    const collector = new TelemetryCollector(tmpDir, true);
    collector.recordToolUse('connector_github_create_issue');
    collector.recordError('api_timeout');
    collector.recordCapabilityGap('email sending');

    const report = collector.getReport();
    for (const event of report.events) {
      // Only category, name, count, date — no message content or file paths
      expect(Object.keys(event).sort()).toEqual(['category', 'count', 'date', 'name']);
    }
  });

  it('daily aggregation: same-day events merge counts', () => {
    const collector = new TelemetryCollector(tmpDir, true);
    collector.recordToolUse('bash');
    collector.recordToolUse('bash');
    collector.recordToolUse('bash');

    const report = collector.getReport();
    const bashEvents = report.events.filter(e => e.name === 'bash');
    expect(bashEvents).toHaveLength(1);
    expect(bashEvents[0].count).toBe(3);
  });

  it('flush writes to telemetry.json', () => {
    const collector = new TelemetryCollector(tmpDir, true);
    collector.recordToolUse('search_memory');
    collector.flush();

    const filePath = path.join(tmpDir, 'telemetry.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('search_memory');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('report covers last N days', () => {
    const collector = new TelemetryCollector(tmpDir, true);
    collector.recordToolUse('today_tool');

    const report = collector.getReport(7);
    expect(report.events.length).toBeGreaterThan(0);
    expect(report.dateRange.from).toBeTruthy();
  });

  it('setEnabled toggles collection', () => {
    const collector = new TelemetryCollector(tmpDir, false);
    expect(collector.isEnabled()).toBe(false);

    collector.setEnabled(true);
    expect(collector.isEnabled()).toBe(true);

    collector.recordToolUse('test_tool');
    expect(collector.getReport().totalEvents).toBe(1);
  });

  it('recordSession aggregates duration and interaction count', () => {
    const collector = new TelemetryCollector(tmpDir, true);
    collector.recordSession(30000, 15);
    collector.recordSession(20000, 10);

    const report = collector.getReport();
    const duration = report.events.find(e => e.name === 'duration_total_ms');
    const interactions = report.events.find(e => e.name === 'interaction_count');
    const sessions = report.events.find(e => e.name === 'session_count');

    expect(duration?.count).toBe(50000);
    expect(interactions?.count).toBe(25);
    expect(sessions?.count).toBe(2);
  });
});
