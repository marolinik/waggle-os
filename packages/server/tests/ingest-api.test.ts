/**
 * Ingest API tests — POST /api/ingest
 *
 * Uses server.inject() with JSON body (no multipart).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

describe('POST /api/ingest', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ingest-test-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Validation ──────────────────────────────────────────────────

  it('returns 400 when files array is missing', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/ingest', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('files');
  });

  it('returns 400 when files is empty', async () => {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/ingest', payload: { files: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when a file entry has no name', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ content: 'abc' }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 413 for oversized files', async () => {
    // Create a base64 string that decodes to > 10 MB
    const bigContent = 'A'.repeat(14 * 1024 * 1024); // ~10.5 MB decoded
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'big.txt', content: bigContent }] },
    });
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toContain('10 MB');
  });

  // ── Image processing ────────────────────────────────────────────

  it('processes an image file and returns data URI', async () => {
    const content = Buffer.from('fake-png-data').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'photo.png', content }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].type).toBe('image');
    expect(body.files[0].summary).toContain('PNG');
    expect(body.files[0].content).toMatch(/^data:image\/png;base64,/);
  });

  it('handles JPEG extension correctly', async () => {
    const content = Buffer.from('fake-jpg').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'pic.jpg', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].content).toMatch(/^data:image\/jpeg;base64,/);
  });

  // ── PDF processing ──────────────────────────────────────────────

  it('processes a PDF and returns document type', async () => {
    // Fake PDF data won't parse — should gracefully handle extraction failure
    const content = Buffer.from('fake-pdf').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'report.pdf', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('document');
    expect(body.files[0].summary).toContain('PDF');
  });

  // ── CSV processing ──────────────────────────────────────────────

  it('processes a CSV and returns column/row stats', async () => {
    const csvText = 'name,age,city\nAlice,30,NYC\nBob,25,LA\n';
    const content = Buffer.from(csvText).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'data.csv', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('csv');
    expect(body.files[0].summary).toContain('3 columns');
    expect(body.files[0].summary).toContain('2 rows');
    expect(body.files[0].content).toContain('Alice');
  });

  // ── Text processing ─────────────────────────────────────────────

  it('processes a markdown file and returns content + line count', async () => {
    const text = '# Hello\n\nSome content\nMore lines\n';
    const content = Buffer.from(text).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'readme.md', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('text');
    expect(body.files[0].summary).toContain('lines');
    expect(body.files[0].content).toContain('# Hello');
  });

  it('processes TypeScript source code', async () => {
    const code = 'const x = 1;\nconsole.log(x);\n';
    const content = Buffer.from(code).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'main.ts', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('text');
    expect(body.files[0].content).toContain('const x');
  });

  // ── Archive files ───────────────────────────────────────────────

  it('processes a ZIP and returns archive type', async () => {
    const content = Buffer.from('fake-zip-data').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'archive.zip', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('archive');
  });

  // ── Unsupported files ───────────────────────────────────────────

  it('returns unsupported for unknown extensions', async () => {
    const content = Buffer.from('binary').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'data.xyz', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('unsupported');
    expect(body.files[0].summary).toContain('Unsupported');
  });

  // ── Multiple files ──────────────────────────────────────────────

  it('processes multiple files in one request', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: {
        files: [
          { name: 'a.png', content: Buffer.from('img').toString('base64') },
          { name: 'b.csv', content: Buffer.from('h\n1').toString('base64') },
          { name: 'c.md', content: Buffer.from('# Hi').toString('base64') },
        ],
      },
    });
    const body = JSON.parse(res.body);
    expect(body.files).toHaveLength(3);
    expect(body.files[0].type).toBe('image');
    expect(body.files[1].type).toBe('csv');
    expect(body.files[2].type).toBe('text');
  });

  // ── Base64 validation ──────────────────────────────────────────

  it('returns 400 for invalid base64 content', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'bad.txt', content: '!!!not-base64!!!' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Invalid base64');
  });

  // ── CSV with quoted fields ────────────────────────────────────

  it('processes CSV with quoted fields containing commas', async () => {
    const csvText = 'name,address,city\n"Smith, John","123 Main St, Apt 4",NYC\n';
    const content = Buffer.from(csvText).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'quoted.csv', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('csv');
    expect(body.files[0].summary).toContain('3 columns');
    expect(body.files[0].summary).toContain('1 rows');
  });

  // ── Text line count accuracy ──────────────────────────────────

  it('reports correct line count for text ending with newline', async () => {
    const text = 'line1\nline2\nline3\n';
    const content = Buffer.from(text).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'test.txt', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].summary).toBe('TXT file — 3 lines');
  });

  it('reports correct line count for text without trailing newline', async () => {
    const text = 'line1\nline2\nline3';
    const content = Buffer.from(text).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'test.txt', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].summary).toBe('TXT file — 3 lines');
  });

  // ── DOCX processing ─────────────────────────────────────────────

  it('processes DOCX and returns document type', async () => {
    const content = Buffer.from('fake-docx').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'report.docx', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('document');
    expect(body.files[0].summary).toContain('DOCX');
  });

  // ── XLSX processing ────────────────────────────────────────────

  it('processes XLSX and returns spreadsheet type', async () => {
    const content = Buffer.from('fake-xlsx').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'data.xlsx', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('spreadsheet');
  });

  // ── New text extensions ────────────────────────────────────────

  it('processes HTML files as text', async () => {
    const html = '<html><body>Hello</body></html>';
    const content = Buffer.from(html).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'page.html', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('text');
    expect(body.files[0].content).toContain('<html>');
  });

  it('processes SQL files as text', async () => {
    const sql = 'SELECT * FROM users WHERE id = 1;';
    const content = Buffer.from(sql).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'query.sql', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('text');
    expect(body.files[0].content).toContain('SELECT');
  });

  // ── SVG as image ──────────────────────────────────────────────

  it('processes SVG as image', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
    const content = Buffer.from(svg).toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'icon.svg', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('image');
    expect(body.files[0].content).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  // ── PPTX processing ───────────────────────────────────────────

  it('processes PPTX and returns document type', async () => {
    const content = Buffer.from('fake-pptx').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'slides.pptx', content }] },
    });
    const body = JSON.parse(res.body);
    expect(body.files[0].type).toBe('document');
    expect(body.files[0].summary).toContain('PPTX');
  });

  // ── workspaceId ─────────────────────────────────────────────────

  it('accepts optional workspaceId without error', async () => {
    const content = Buffer.from('text').toString('base64');
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/ingest',
      payload: { files: [{ name: 'note.txt', content }], workspaceId: 'ws-123' },
    });
    expect(res.statusCode).toBe(200);
  });
});
