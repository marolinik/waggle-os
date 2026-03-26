import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createDocumentTools } from '../src/document-tools.js';

describe('createDocumentTools', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-docx-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a generate_docx tool', () => {
    const tools = createDocumentTools(tmpDir);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('generate_docx');
    expect(tools[0].description).toContain('Word document');
  });

  it('generates a basic .docx file', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'test.docx',
      content: '# Hello World\n\nThis is a test document.\n\n- Item 1\n- Item 2',
    });

    expect(result).toContain('Successfully generated test.docx');
    expect(result).toContain('1 headings');
    expect(result).toContain('1 paragraphs');
    expect(result).toContain('2 list items');

    const filePath = path.join(tmpDir, 'test.docx');
    expect(fs.existsSync(filePath)).toBe(true);
    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('generates a docx with title page', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'report.docx',
      content: '# Introduction\n\nContent here.\n\n## Section 2\n\nMore content.',
      title: 'Market Analysis Report',
      author: 'Waggle AI',
      subject: 'Liquid Cooling Market',
    });

    expect(result).toContain('Successfully generated report.docx');
    expect(fs.existsSync(path.join(tmpDir, 'report.docx'))).toBe(true);
  });

  it('handles tables in markdown', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'tables.docx',
      content: '# Data\n\n| Name | Value |\n|------|-------|\n| A | 10 |\n| B | 20 |',
    });

    expect(result).toContain('1 tables');
  });

  it('handles numbered lists', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'lists.docx',
      content: '1. First item\n2. Second item\n3. Third item',
    });

    expect(result).toContain('3 list items');
  });

  it('creates subdirectories as needed', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'reports/2024/q1/analysis.docx',
      content: '# Q1 Analysis\n\nContent.',
    });

    expect(result).toContain('Successfully');
    expect(fs.existsSync(path.join(tmpDir, 'reports', '2024', 'q1', 'analysis.docx'))).toBe(true);
  });

  it('rejects non-.docx extension', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'test.txt',
      content: 'Hello',
    });

    expect(result).toContain('Error: Output path must end with .docx');
  });

  it('rejects path traversal', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: '../../../etc/evil.docx',
      content: 'Hello',
    });

    expect(result).toContain('Error');
  });

  it('handles inline formatting', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'formatted.docx',
      content: 'This has **bold**, *italic*, and `code` formatting.',
    });

    expect(result).toContain('Successfully generated formatted.docx');
  });

  it('handles page breaks', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const result = await tool.execute({
      path: 'multipage.docx',
      content: '# Page 1\n\nContent.\n\n---pagebreak---\n\n# Page 2\n\nMore content.',
    });

    expect(result).toContain('Successfully');
    expect(result).toContain('2 headings');
  });

  it('includes a Summary in the chat result with meaningful content', async () => {
    const [tool] = createDocumentTools(tmpDir);
    const content =
      '# Market Analysis Report\n\n' +
      'The global liquid cooling market is projected to reach $8.5 billion by 2028, ' +
      'driven by increasing demand for high-performance computing and AI workloads.\n\n' +
      '## Key Findings\n\n' +
      '- Data center cooling accounts for 40% of energy costs\n' +
      '- Immersion cooling adoption grew 65% year-over-year\n\n' +
      '## Recommendations\n\n' +
      'Organizations should evaluate hybrid cooling strategies that combine air and liquid approaches.';

    const result = await tool.execute({ path: 'summary-test.docx', content });

    expect(result).toContain('Summary:');
    expect(result.length).toBeGreaterThan(100);
    // Summary should contain stripped plain text from content, not markdown symbols
    expect(result).toContain('liquid cooling market');
  });
});
