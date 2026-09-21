import type { SearchResult } from '@waggle/core';
import type {
  MemorySearchPort,
} from './memory-ports.js';

export interface MemoryLink {
  frameId: number;
  content: string;
  score: number;
}

export class MemoryLinker {
  private search: MemorySearchPort;
  private threshold: number;

  constructor(config: { search: MemorySearchPort; threshold?: number }) {
    this.search = config.search;
    this.threshold = config.threshold ?? 0.1;
  }

  async findRelated(content: string, limit = 5): Promise<MemoryLink[]> {
    const results = await this.search.search(content, { limit });
    return results
      .filter(r => r.finalScore >= this.threshold)
      .map(r => ({
        frameId: r.frame.id,
        content: r.frame.content,
        score: r.finalScore,
      }));
  }
}
