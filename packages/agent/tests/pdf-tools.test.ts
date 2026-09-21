import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createPdfTools } from '../src/pdf-tools.js';

describe('createPdfTools', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-pdf-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a renderable PDF with bundled fonts', async () => {
    const [tool] = createPdfTools(tmpDir);
    const result = await tool.execute({
      filePath: 'documents/readiness.pdf',
      title: 'Readiness',
      author: 'Waggle',
      content: '# Readiness\n\n- Word\n- Excel\n- PDF\n- PPTX',
    });

    const filePath = path.join(tmpDir, 'documents', 'readiness.pdf');
    expect(result).toContain('Successfully generated documents/readiness.pdf');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders one title and formats inline markdown inside bullets', async () => {
    const [tool] = createPdfTools(tmpDir);
    await tool.execute({
      filePath: 'summary.pdf',
      title: 'PM Readiness Summary',
      content: '# PM Readiness Summary\n\n- **Model:** Pass\n- **Library:** Pass',
    });

    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: fs.readFileSync(path.join(tmpDir, 'summary.pdf')) });
    await parser.load();
    const extracted = (await parser.getText()).text;
    await parser.destroy();

    expect(extracted.match(/PM Readiness Summary/g)).toHaveLength(1);
    expect(extracted).not.toContain('**');
    expect(extracted).toContain('Model: Pass');
    expect(extracted).toContain('Library: Pass');
  });
});
