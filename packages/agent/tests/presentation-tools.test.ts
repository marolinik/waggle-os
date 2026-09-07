import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createPresentationTools } from '../src/presentation-tools.js';

describe('createPresentationTools', () => {
  it('serializes the slide fields so the model can distinguish paragraphs from bullet lists', () => {
    const [tool] = createPresentationTools('C:\\workspace');
    const slides = tool.parameters.properties?.slides as {
      items?: { properties?: Record<string, { description?: string }> };
    };

    expect(slides.items?.properties).toHaveProperty('content');
    expect(slides.items?.properties).toHaveProperty('bullets');
    expect(slides.items?.properties?.content?.description).toMatch(/paragraph/i);
    expect(slides.items?.properties?.bullets?.description).toMatch(/list/i);
    expect(tool.description).toMatch(/must put items in bullets\[\]/i);
    expect(tool.description).toMatch(/never encode a list as newline-separated content/i);
  });

  it.each(['image', 'images'])('rejects %s inputs before the PPTX library can parse them', async (key) => {
    const [tool] = createPresentationTools('C:\\workspace');

    const result = await tool.execute({
      filePath: 'deck.pptx',
      slides: [{ title: 'Untrusted image', [key]: { data: 'data:image/png;base64,AAAA' } }],
    });

    expect(result).toBe('Error: image inputs are not supported by the Waggle presentation tool');
  });

  it('generates a text-and-table deck with the vendored runtime', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'waggle-pptx-'));
    try {
      const [tool] = createPresentationTools(workspace);
      const result = await tool.execute({
        filePath: 'deck.pptx',
        slides: [
          { title: 'Readiness', content: 'Installer and router evidence are captured.' },
          {
            title: 'Gates',
            table: { headers: ['Gate', 'Status'], rows: [['PPTX generation', 'pass']] },
          },
        ],
      });

      expect(result).toMatch(/^Successfully generated deck\.pptx/);
      const archive = await readFile(path.join(workspace, 'deck.pptx'));
      expect(archive.subarray(0, 2).toString()).toBe('PK');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('renders terse newline-separated content as a real bullet list', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'waggle-pptx-'));
    try {
      const [tool] = createPresentationTools(workspace);
      await tool.execute({
        filePath: 'bullets.pptx',
        slides: [{ title: 'Completed', content: 'Model ready\nNew sessions work\nMemory recall works' }],
      });

      const archive = await readFile(path.join(workspace, 'bullets.pptx'));
      const zip = await JSZip.loadAsync(archive);
      const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string');

      expect(slideXml).toMatch(/<a:buChar/);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
