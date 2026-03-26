import { describe, it, expect } from 'vitest';
import { AdminClient, formatTable } from '../src/commands/admin.js';

describe('AdminClient', () => {
  it('constructs with defaults', () => {
    const client = new AdminClient();
    expect(client).toBeInstanceOf(AdminClient);
  });

  it('constructs with custom base URL and token', () => {
    const client = new AdminClient('http://localhost:9999', 'my-token');
    expect(client).toBeInstanceOf(AdminClient);
  });

  it('has all admin methods', () => {
    const client = new AdminClient('http://localhost:3100', 'test-token');
    expect(typeof client.listTeams).toBe('function');
    expect(typeof client.listJobs).toBe('function');
    expect(typeof client.listCron).toBe('function');
    expect(typeof client.listAudit).toBe('function');
    expect(typeof client.getStats).toBe('function');
  });

  it('methods return promises', () => {
    const client = new AdminClient('http://localhost:3100', 'test-token');
    // These will fail to connect, but they should return promises
    const p = client.listTeams();
    expect(p).toBeInstanceOf(Promise);
    // Suppress unhandled rejection
    p.catch(() => {});
  });
});

describe('formatTable', () => {
  it('returns "(no data)" for empty array', () => {
    expect(formatTable([])).toBe('  (no data)');
  });

  it('formats rows into aligned columns', () => {
    const rows = [
      { id: '1', name: 'Alice', role: 'admin' },
      { id: '2', name: 'Bob', role: 'member' },
    ];
    const result = formatTable(rows);
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('role');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('admin');
    expect(result).toContain('member');
  });

  it('respects explicit column selection', () => {
    const rows = [
      { id: '1', name: 'Alice', secret: 'hidden' },
    ];
    const result = formatTable(rows, ['id', 'name']);
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('hidden');
  });

  it('handles missing values gracefully', () => {
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2' },
    ];
    const result = formatTable(rows);
    expect(result).toContain('Alice');
    // Second row should have empty name
    expect(result).toContain('2');
  });
});
