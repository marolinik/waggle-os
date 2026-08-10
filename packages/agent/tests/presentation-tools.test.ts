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
});
