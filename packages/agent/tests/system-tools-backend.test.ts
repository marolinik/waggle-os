/**
 * system-tools FileBackend routing tests (L-18).
 *
 * Verifies read_file / write_file / edit_file / multi_edit route through a
 * provided FileBackend instead of node:fs, while the legacy string-workspace
 * signature keeps working for callers that haven't migrated.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSystemTools, type FileBackend, type SystemToolDeps } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';

class InMemoryBackend implements FileBackend {
  private files = new Map<string, Buffer>();

  async read(filePath: string): Promise<Buffer> {
    const key = this.normalize(filePath);
    const data = this.files.get(key);
    if (!data) throw new Error(`not found: ${filePath}`);
    return data;
  }
  async write(filePath: string, data: Buffer): Promise<void> {
    this.files.set(this.normalize(filePath), data);
  }
  async exists(filePath: string): Promise<boolean> {
    return this.files.has(this.normalize(filePath));
  }
  async delete(filePath: string): Promise<void> {
    this.files.delete(this.normalize(filePath));
  }

  // Seeding helper — tests pre-populate with string content.
  seed(filePath: string, content: string): void {
    this.files.set(this.normalize(filePath), Buffer.from(content, 'utf-8'));
  }
  dump(filePath: string): string | null {
    const buf = this.files.get(this.normalize(filePath));
    return buf ? buf.toString('utf-8') : null;
  }

  private normalize(filePath: string): string {
    return filePath.startsWith('/') ? filePath : `/${filePath}`;
  }
}

describe('createSystemTools — FileBackend routing (L-18)', () => {
  let backend: InMemoryBackend;
  let tools: ToolDefinition[];
  let toolsByName: Map<string, ToolDefinition>;

  beforeEach(() => {
    backend = new InMemoryBackend();
    // Process cwd works as an innocuous workspace for bash/glob; file tools
    // are routed to the backend when present.
    const deps: SystemToolDeps = { workspace: process.cwd(), fileBackend: backend };
    tools = createSystemTools(deps);
    toolsByName = new Map(tools.map(t => [t.name, t]));
  });

  it('accepts the legacy string workspace signature without a backend', () => {
    const legacy = createSystemTools(process.cwd());
    expect(Array.isArray(legacy)).toBe(true);
    expect(legacy.some(t => t.name === 'read_file')).toBe(true);
  });

  describe('read_file', () => {
    it('reads from the backend instead of disk', async () => {
      backend.seed('/notes/hello.md', '# hi there\nsecond line');
      const out = await toolsByName.get('read_file')!.execute({ path: '/notes/hello.md' });
      expect(out).toContain('# hi there');
      expect(out).toContain('second line');
    });

    it('applies offset/limit against backend-sourced content', async () => {
      backend.seed('/notes/a.txt', 'line1\nline2\nline3\nline4');
      const out = await toolsByName.get('read_file')!.execute({ path: '/notes/a.txt', offset: 2, limit: 2 });
      expect(out).toBe('line2\nline3');
    });

    it('line_numbers flag still works', async () => {
      backend.seed('/notes/a.md', 'alpha\nbeta');
      const out = await toolsByName.get('read_file')!.execute({ path: '/notes/a.md', line_numbers: true });
      expect(out).toContain('1\talpha');
      expect(out).toContain('2\tbeta');
    });

    it('returns the backend error on missing file', async () => {
      const out = await toolsByName.get('read_file')!.execute({ path: '/missing.md' });
      expect(typeof out).toBe('string');
      expect(out).toMatch(/not found/i);
    });

    it('PDF files return a backend-specific placeholder', async () => {
      backend.seed('/doc.pdf', 'not actually a pdf');
      const out = await toolsByName.get('read_file')!.execute({ path: '/doc.pdf' });
      expect(out).toContain('backend-routed read does not yet extract PDF');
    });
  });

  describe('write_file', () => {
    it('writes via the backend, not to disk', async () => {
      const result = await toolsByName.get('write_file')!.execute({
        path: '/notes/new.md',
        content: 'hello from backend',
      });
      expect(String(result)).toContain('Successfully wrote /notes/new.md');
      expect(backend.dump('/notes/new.md')).toBe('hello from backend');
    });

    it('overwrites an existing file via backend', async () => {
      backend.seed('/notes/a.md', 'original');
      await toolsByName.get('write_file')!.execute({
        path: '/notes/a.md',
        content: 'replaced',
      });
      expect(backend.dump('/notes/a.md')).toBe('replaced');
    });
  });

  describe('edit_file', () => {
    it('edits via the backend (read+write round trip)', async () => {
      backend.seed('/src/a.md', 'The quick brown fox');
      const result = await toolsByName.get('edit_file')!.execute({
        path: '/src/a.md',
        old_string: 'brown',
        new_string: 'red',
      });
      expect(String(result)).toContain('Successfully edited');
      expect(backend.dump('/src/a.md')).toBe('The quick red fox');
    });

    it('rejects multi-occurrence edits without replace_all', async () => {
      backend.seed('/src/a.md', 'ab ab ab');
      const result = await toolsByName.get('edit_file')!.execute({
        path: '/src/a.md',
        old_string: 'ab',
        new_string: 'zz',
      });
      expect(String(result)).toMatch(/multiple times/);
      // File unchanged.
      expect(backend.dump('/src/a.md')).toBe('ab ab ab');
    });

    it('replace_all true applies every match', async () => {
      backend.seed('/src/a.md', 'ab ab ab');
      await toolsByName.get('edit_file')!.execute({
        path: '/src/a.md',
        old_string: 'ab',
        new_string: 'zz',
        replace_all: true,
      });
      expect(backend.dump('/src/a.md')).toBe('zz zz zz');
    });

    it('missing old_string returns a clear error and leaves file alone', async () => {
      backend.seed('/src/a.md', 'hello');
      const result = await toolsByName.get('edit_file')!.execute({
        path: '/src/a.md',
        old_string: 'nope',
        new_string: 'should not appear',
      });
      expect(String(result)).toContain('not found');
      expect(backend.dump('/src/a.md')).toBe('hello');
    });
  });

  describe('multi_edit', () => {
    it('applies multiple edits through the backend atomically', async () => {
      backend.seed('/a.md', 'AAA');
      backend.seed('/b.md', 'BBB');
      const result = await toolsByName.get('multi_edit')!.execute({
        edits: [
          { file_path: '/a.md', old_string: 'AAA', new_string: 'AAA!' },
          { file_path: '/b.md', old_string: 'BBB', new_string: 'BBB?' },
        ],
      });
      expect(String(result)).toContain('Successfully applied 2 edit');
      expect(backend.dump('/a.md')).toBe('AAA!');
      expect(backend.dump('/b.md')).toBe('BBB?');
    });

    it('rejects path traversal (`..`) even on the backend route', async () => {
      backend.seed('/a.md', 'AAA');
      const result = await toolsByName.get('multi_edit')!.execute({
        edits: [
          { file_path: '/../escape.md', old_string: 'AAA', new_string: 'AAA!' },
        ],
      });
      expect(String(result)).toMatch(/outside workspace/);
      // File unchanged.
      expect(backend.dump('/a.md')).toBe('AAA');
    });

    it('rolls back if any validation fails (no writes)', async () => {
      backend.seed('/a.md', 'AAA');
      backend.seed('/b.md', 'does not contain the target');
      const result = await toolsByName.get('multi_edit')!.execute({
        edits: [
          { file_path: '/a.md', old_string: 'AAA', new_string: 'AAA!' },
          { file_path: '/b.md', old_string: 'MISSING', new_string: 'X' },
        ],
      });
      expect(String(result)).toContain('No edits applied (atomic rollback)');
      // Neither file touched.
      expect(backend.dump('/a.md')).toBe('AAA');
      expect(backend.dump('/b.md')).toBe('does not contain the target');
    });
  });
});
