import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPresentationTools } from '../src/presentation-tools.js';

describe('createPresentationTools', () => {
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
});
