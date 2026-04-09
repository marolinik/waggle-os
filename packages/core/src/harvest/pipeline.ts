/**
 * HarvestPipeline — orchestrates the 4-pass distillation pipeline.
 *
 * Pass 1: Classify (Haiku — cheap)
 * Pass 2: Extract (Sonnet — accurate)
 * Pass 3: Synthesize (Sonnet — accurate)
 * Pass 4: Dedup (local — no LLM)
 *
 * The pipeline accepts UniversalImportItems and produces DistilledKnowledge[].
 * LLM calls are batched (20 items per call) to optimize cost.
 */

import type {
  UniversalImportItem, ClassifiedItem, ExtractedContent,
  DistilledKnowledge, HarvestPipelineResult, ImportSourceType,
} from './types.js';
import { CLASSIFY_PROMPT, EXTRACT_PROMPT, SYNTHESIZE_PROMPT } from './prompts.js';
import { dedup, type DedupResult } from './dedup.js';

const BATCH_SIZE = 20;

export interface LLMCallFn {
  (prompt: string, model: 'fast' | 'accurate'): Promise<string>;
}

export interface PipelineOptions {
  llmCall: LLMCallFn;
  existingContents?: string[];
  onProgress?: (stage: string, current: number, total: number) => void;
}

/** Safely parse JSON from LLM response, handling markdown code fences. */
function parseLLMJson<T>(raw: string): T[] {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** Split array into batches. */
function batch<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export class HarvestPipeline {
  private llmCall: LLMCallFn;
  private existingContents: string[];
  private onProgress?: (stage: string, current: number, total: number) => void;

  constructor(options: PipelineOptions) {
    this.llmCall = options.llmCall;
    this.existingContents = options.existingContents ?? [];
    this.onProgress = options.onProgress;
  }

  async run(items: UniversalImportItem[], source: ImportSourceType): Promise<HarvestPipelineResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Pass 1: Classify
    this.onProgress?.('classify', 0, items.length);
    const classified = await this.classify(items, errors);
    const valuable = classified.filter(c => c.value !== 'skip');

    // Pass 2: Extract
    this.onProgress?.('extract', 0, valuable.length);
    const extracted = await this.extract(valuable, errors);

    // Pass 3: Synthesize
    this.onProgress?.('synthesize', 0, extracted.length);
    const distilled = await this.synthesize(extracted, source, errors);

    // Pass 4: Dedup
    this.onProgress?.('dedup', 0, distilled.length);
    const dedupResult = dedup(distilled, this.existingContents);

    return {
      source,
      itemsReceived: items.length,
      itemsClassified: classified.length,
      itemsSkipped: classified.length - valuable.length,
      itemsExtracted: extracted.length,
      knowledgeDistilled: dedupResult.unique,
      framesSaved: 0, // Caller handles persistence
      entitiesCreated: 0,
      relationsCreated: 0,
      identityUpdates: dedupResult.unique.filter(k => k.targetLayer === 'identity').length,
      duplicatesSkipped: dedupResult.duplicatesSkipped,
      errors,
      costUsd: 0, // Caller tracks cost
      durationMs: Date.now() - startTime,
    };
  }

  private async classify(items: UniversalImportItem[], errors: string[]): Promise<ClassifiedItem[]> {
    const results: ClassifiedItem[] = [];
    const batches = batch(items, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      this.onProgress?.('classify', i * BATCH_SIZE, items.length);
      const b = batches[i];
      const prompt = CLASSIFY_PROMPT + b.map((item, idx) => (
        `\n--- Item ${idx} (id: ${item.id}) ---\nTitle: ${item.title}\nSource: ${item.source}\nType: ${item.type}\nContent (first 500 chars): ${item.content.slice(0, 500)}\n`
      )).join('');

      try {
        const response = await this.llmCall(prompt, 'fast');
        const parsed = parseLLMJson<any>(response);

        for (const entry of parsed) {
          const item = b.find(it => it.id === entry.itemId) ?? b[parsed.indexOf(entry)];
          if (!item) continue;
          results.push({
            item,
            domain: entry.domain ?? 'mixed',
            value: entry.value ?? 'medium',
            categories: entry.categories ?? [],
          });
        }
      } catch (err) {
        errors.push(`Classify batch ${i} failed: ${err instanceof Error ? err.message : 'unknown'}`);
        // On failure, pass all items through as medium value
        for (const item of b) {
          results.push({ item, domain: 'mixed', value: 'medium', categories: [] });
        }
      }
    }

    return results;
  }

  private async extract(classified: ClassifiedItem[], errors: string[]): Promise<ExtractedContent[]> {
    const results: ExtractedContent[] = [];
    const batches = batch(classified, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      this.onProgress?.('extract', i * BATCH_SIZE, classified.length);
      const b = batches[i];
      const prompt = EXTRACT_PROMPT + b.map((c, idx) => (
        `\n--- Conversation ${idx} (id: ${c.item.id}, value: ${c.value}, categories: ${c.categories.join(',')}) ---\nTitle: ${c.item.title}\n${c.item.content.slice(0, 2000)}\n`
      )).join('');

      try {
        const response = await this.llmCall(prompt, 'accurate');
        const parsed = parseLLMJson<any>(response);

        for (const entry of parsed) {
          results.push({
            itemId: entry.itemId ?? b[parsed.indexOf(entry)]?.item.id ?? '',
            decisions: entry.decisions ?? [],
            preferences: entry.preferences ?? [],
            facts: entry.facts ?? [],
            knowledge: entry.knowledge ?? [],
            entities: entry.entities ?? [],
            relations: entry.relations ?? [],
          });
        }
      } catch (err) {
        errors.push(`Extract batch ${i} failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return results;
  }

  private async synthesize(
    extracted: ExtractedContent[],
    source: ImportSourceType,
    errors: string[],
  ): Promise<DistilledKnowledge[]> {
    const results: DistilledKnowledge[] = [];
    const batches = batch(extracted, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      this.onProgress?.('synthesize', i * BATCH_SIZE, extracted.length);
      const b = batches[i];
      const prompt = SYNTHESIZE_PROMPT + JSON.stringify(b, null, 2).slice(0, 8000);

      try {
        const response = await this.llmCall(prompt, 'accurate');
        const parsed = parseLLMJson<any>(response);

        for (const entry of parsed) {
          results.push({
            targetLayer: entry.targetLayer ?? 'frame',
            frameType: entry.frameType ?? 'I',
            importance: entry.importance ?? 'normal',
            content: entry.content ?? '',
            provenance: {
              originalSource: source,
              importedAt: new Date().toISOString(),
              distillationModel: entry.targetLayer === 'identity' ? 'accurate' : 'accurate',
              confidence: entry.confidence ?? 0.7,
              pass: 3,
            },
          });
        }
      } catch (err) {
        errors.push(`Synthesize batch ${i} failed: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return results;
  }
}
