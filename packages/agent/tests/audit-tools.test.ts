import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createAuditTools } from '../src/audit-tools.js';

describe('createAuditTools', () => {
  let tmpDir: string;

  const sampleLines = [
    '{"tool":"bash","args":{"command":"ls"},"result":"file1.txt","timestamp":"2024-01-01T00:00:00Z"}',
    '{"tool":"read_file","args":{"path":"file1.txt"},"result":"contents","timestamp":"2024-01-01T00:01:00Z"}',
    '{"tool":"bash","args":{"command":"cat foo"},"result":"bar","timestamp":"2024-01-01T00:02:00Z"}',
  ];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-tools-test-'));
    const auditDir = path.join(tmpDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    fs.writeFileSync(
      path.join(auditDir, 'session-001.jsonl'),
      sampleLines.join('\n') + '\n',
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the query_audit tool', () => {
    const tools = createAuditTools(tmpDir);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('query_audit');
    expect(tools[0].execute).toBeTypeOf('function');
  });

  it('query all returns all entries', async () => {
    const tools = createAuditTools(tmpDir);
    const result = await tools[0].execute({});
    expect(result).toContain('bash');
    expect(result).toContain('read_file');
    // All 3 entries should appear
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('filter by tool name returns only matching entries', async () => {
    const tools = createAuditTools(tmpDir);
    const result = await tools[0].execute({ tool: 'bash' });
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(result).toContain('bash');
    expect(result).not.toContain('read_file');
  });

  it('limit restricts number of results', async () => {
    const tools = createAuditTools(tmpDir);
    const result = await tools[0].execute({ limit: 1 });
    const lines = result.split('\n');
    expect(lines).toHaveLength(1);
    // Should return the most recent entry (last one)
    expect(result).toContain('cat foo');
  });
});
