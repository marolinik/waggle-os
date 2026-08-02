import { beforeEach, describe, expect, it, vi } from 'vitest';

const transformers = vi.hoisted(() => ({
  env: { allowRemoteModels: false, cacheDir: '' },
  model: vi.fn(),
  modelFromPretrained: vi.fn(),
  tokenizer: vi.fn(),
  tokenizerFromPretrained: vi.fn(),
}));

vi.mock('@huggingface/transformers', () => ({
  env: transformers.env,
  AutoModelForSequenceClassification: {
    from_pretrained: transformers.modelFromPretrained,
  },
  AutoTokenizer: {
    from_pretrained: transformers.tokenizerFromPretrained,
  },
}));

import { createInProcessReranker } from '../../src/mind/inprocess-reranker.js';

describe('createInProcessReranker', () => {
  beforeEach(() => {
    transformers.env.allowRemoteModels = false;
    transformers.env.cacheDir = '';
    transformers.model.mockReset();
    transformers.modelFromPretrained.mockReset();
    transformers.tokenizer.mockReset();
    transformers.tokenizerFromPretrained.mockReset();
    transformers.modelFromPretrained.mockResolvedValue(transformers.model);
    transformers.tokenizerFromPretrained.mockResolvedValue(transformers.tokenizer);
  });

  it('requests tensors with the supported tokenizer option for single and batch scoring', async () => {
    transformers.tokenizer.mockResolvedValue({ input_ids: 'tokens' });
    transformers.model
      .mockResolvedValueOnce({ logits: { data: new Float32Array([0.75]), dims: [1, 1] } })
      .mockResolvedValueOnce({ logits: { data: new Float32Array([0.25, 0.5]), dims: [2, 1] } });

    const reranker = await createInProcessReranker({ cacheDir: 'model-cache' });

    await expect(reranker.score('query', 'document')).resolves.toBeCloseTo(0.75);
    await expect(reranker.scoreBatch('query', ['first', 'second'])).resolves.toEqual([
      0.25, 0.5,
    ]);
    expect(transformers.tokenizer).toHaveBeenNthCalledWith(1, 'query', {
      text_pair: 'document',
      padding: true,
      truncation: true,
      return_tensor: true,
    });
    expect(transformers.tokenizer).toHaveBeenNthCalledWith(2, ['query', 'query'], {
      text_pair: ['first', 'second'],
      padding: true,
      truncation: true,
      return_tensor: true,
    });
  });
});
