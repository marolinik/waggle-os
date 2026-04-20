/**
 * FileIndexer unit tests (L-20)
 *
 * Covers: format gate, indexing, overwrite semantics, move, remove, truncation,
 * shared-content dedup safety, and the underlying file_index table.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MindDB } from '../src/mind/db.js';
import { FrameStore } from '../src/mind/frames.js';
import { FileIndexer, MAX_CONTENT_BYTES } from '../src/file-indexer.js';

describe('FileIndexer', () => {
  let db: MindDB;
  let indexer: FileIndexer;

  beforeEach(() => {
    db = new MindDB(':memory:');
    indexer = new FileIndexer(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('shouldIndex', () => {
    it('accepts markdown + text', () => {
      expect(FileIndexer.shouldIndex('/notes/a.md')).toBe(true);
      expect(FileIndexer.shouldIndex('/notes/a.markdown')).toBe(true);
      expect(FileIndexer.shouldIndex('/notes/a.txt')).toBe(true);
    });

    it('ignores case differences in the extension', () => {
      expect(FileIndexer.shouldIndex('/a.MD')).toBe(true);
      expect(FileIndexer.shouldIndex('/a.TXT')).toBe(true);
    });

    it('rejects formats deferred to Bucket 2', () => {
      expect(FileIndexer.shouldIndex('/a.pdf')).toBe(false);
      expect(FileIndexer.shouldIndex('/a.docx')).toBe(false);
      expect(FileIndexer.shouldIndex('/a.xlsx')).toBe(false);
    });

    it('rejects files with no extension', () => {
      expect(FileIndexer.shouldIndex('/a')).toBe(false);
      expect(FileIndexer.shouldIndex('/README')).toBe(false);
    });
  });

  describe('indexFile', () => {
    it('returns unsupported_format for non-indexable extensions', () => {
      const result = indexer.indexFile('/a.pdf', Buffer.from('PDF content'));
      expect(result.skipped).toBe(true);
      if (result.skipped) expect(result.reason).toBe('unsupported_format');
    });

    it('indexes a markdown file and creates a backing frame', () => {
      const content = Buffer.from('# Hello\n\nThis is a note.');
      const result = indexer.indexFile('/notes/hello.md', content, 'text/markdown');

      expect(result.skipped).toBe(false);
      if (!result.skipped) {
        expect(result.frameId).toBeGreaterThan(0);
        expect(result.truncated).toBe(false);

        const frames = new FrameStore(db);
        const frame = frames.getById(result.frameId);
        expect(frame).toBeTruthy();
        expect(frame!.content).toContain('# Hello');
        expect(frame!.content).toContain('[FILE: /notes/hello.md');
        expect(frame!.content).toContain('text/markdown');
        expect(frame!.source).toBe('system');
      }
    });

    it('records the index row with hash + size + mime', () => {
      const content = Buffer.from('hello world');
      indexer.indexFile('/a.txt', content, 'text/plain');
      const row = indexer.getRow('/a.txt');
      expect(row).toBeTruthy();
      expect(row!.sizeBytes).toBe(content.length);
      expect(row!.mimeType).toBe('text/plain');
      expect(row!.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row!.indexedAt).toBeTruthy();
    });

    it('returns unchanged when re-indexed with identical content', () => {
      const content = Buffer.from('same bytes');
      const first = indexer.indexFile('/a.md', content);
      expect(first.skipped).toBe(false);

      const second = indexer.indexFile('/a.md', content);
      expect(second.skipped).toBe(true);
      if (second.skipped) expect(second.reason).toBe('unchanged');
    });

    it('swaps the frame on content change (overwrite path)', () => {
      const first = indexer.indexFile('/a.md', Buffer.from('original'));
      const second = indexer.indexFile('/a.md', Buffer.from('updated'));
      expect(first.skipped).toBe(false);
      expect(second.skipped).toBe(false);
      if (!first.skipped && !second.skipped) {
        expect(second.frameId).not.toBe(first.frameId);

        // Old frame is gone.
        const frames = new FrameStore(db);
        expect(frames.getById(first.frameId)).toBeUndefined();
        // New frame exists and row points at it.
        expect(frames.getById(second.frameId)).toBeTruthy();
        const row = indexer.getRow('/a.md');
        expect(row!.frameId).toBe(second.frameId);
      }
    });

    it('truncates content over MAX_CONTENT_BYTES and sets the truncated flag', () => {
      const giant = Buffer.alloc(MAX_CONTENT_BYTES + 5000, 0x41); // lots of 'A'
      const result = indexer.indexFile('/big.md', giant);
      expect(result.skipped).toBe(false);
      if (!result.skipped) {
        expect(result.truncated).toBe(true);
        const frames = new FrameStore(db);
        const frame = frames.getById(result.frameId);
        expect(frame!.content).toContain('[…truncated');
      }
    });

    it('treats an empty file as remove-if-present', () => {
      indexer.indexFile('/a.md', Buffer.from('something'));
      expect(indexer.getRow('/a.md')).toBeTruthy();

      const emptyResult = indexer.indexFile('/a.md', Buffer.from(''));
      expect(emptyResult.skipped).toBe(true);
      if (emptyResult.skipped) expect(emptyResult.reason).toBe('empty');
      expect(indexer.getRow('/a.md')).toBeNull();
    });

    it('rolls back atomically when a mutation throws mid-overwrite (L-20 BLOCKER-1)', () => {
      // Index a file, then simulate a crash during the overwrite path by
      // making frames.delete throw. The whole transaction (new frame +
      // old-frame delete + file_index UPDATE) must roll back together. Table
      // state after the throw must match state before the throw.
      const first = indexer.indexFile('/a.md', Buffer.from('original'));
      expect(first.skipped).toBe(false);
      if (first.skipped) return;
      const originalFrameId = first.frameId;

      const raw = db.getDatabase();
      const framesBefore = (raw.prepare('SELECT COUNT(*) as c FROM memory_frames').get() as { c: number }).c;
      const indexBefore = (raw.prepare('SELECT COUNT(*) as c FROM file_index').get() as { c: number }).c;

      // Inject crash mid-transaction: the old-frame delete step throws.
      const framesProp = (indexer as unknown as { frames: FrameStore }).frames;
      const deleteSpy = vi.spyOn(framesProp, 'delete').mockImplementation(() => {
        throw new Error('simulated crash mid-overwrite');
      });

      try {
        expect(() => indexer.indexFile('/a.md', Buffer.from('updated'))).toThrow('simulated crash mid-overwrite');
      } finally {
        deleteSpy.mockRestore();
      }

      // Rollback invariants:
      // 1. Frame-table row count unchanged (new frame not committed).
      // 2. Old frame still present (delete was rolled back).
      // 3. file_index row count unchanged + row still points at original frame.
      const framesAfter = (raw.prepare('SELECT COUNT(*) as c FROM memory_frames').get() as { c: number }).c;
      const indexAfter = (raw.prepare('SELECT COUNT(*) as c FROM file_index').get() as { c: number }).c;
      expect(framesAfter).toBe(framesBefore);
      expect(indexAfter).toBe(indexBefore);

      const framesStore = new FrameStore(db);
      expect(framesStore.getById(originalFrameId)).toBeTruthy();
      expect(indexer.getRow('/a.md')!.frameId).toBe(originalFrameId);
    });
  });

  describe('removeFile', () => {
    it('returns false when the path is not indexed', () => {
      expect(indexer.removeFile('/not-indexed.md')).toBe(false);
    });

    it('deletes the frame + row when indexed', () => {
      const result = indexer.indexFile('/a.md', Buffer.from('goodbye'));
      expect(result.skipped).toBe(false);
      if (!result.skipped) {
        expect(indexer.removeFile('/a.md')).toBe(true);
        expect(indexer.getRow('/a.md')).toBeNull();
        const frames = new FrameStore(db);
        expect(frames.getById(result.frameId)).toBeUndefined();
      }
    });

    it('two paths with identical bodies get distinct frames (path is in the header)', () => {
      // The header `[FILE: <path>]` is part of the frame content, so two files
      // with the same body but different paths produce different frame hashes.
      // This is intentional: a file is a file, not just its bytes.
      const body = Buffer.from('shared body');
      const first = indexer.indexFile('/dir-a/shared.md', body);
      const second = indexer.indexFile('/dir-b/shared.md', body);
      expect(first.skipped).toBe(false);
      expect(second.skipped).toBe(false);
      if (!first.skipped && !second.skipped) {
        expect(second.frameId).not.toBe(first.frameId);

        // Removing one file removes its own frame + row without touching the other.
        indexer.removeFile('/dir-a/shared.md');
        const frames = new FrameStore(db);
        expect(frames.getById(first.frameId)).toBeUndefined();
        expect(frames.getById(second.frameId)).toBeTruthy();
        expect(indexer.getRow('/dir-b/shared.md')).toBeTruthy();
      }
    });
  });

  describe('moveFile', () => {
    it('updates the recorded path + keeps the frame', () => {
      const res = indexer.indexFile('/old.md', Buffer.from('body'));
      expect(res.skipped).toBe(false);
      if (!res.skipped) {
        expect(indexer.moveFile('/old.md', '/new.md')).toBe(true);
        expect(indexer.getRow('/old.md')).toBeNull();
        const row = indexer.getRow('/new.md');
        expect(row!.frameId).toBe(res.frameId);

        const frames = new FrameStore(db);
        expect(frames.getById(res.frameId)).toBeTruthy();
      }
    });

    it('returns false when the source is not indexed', () => {
      expect(indexer.moveFile('/missing.md', '/somewhere.md')).toBe(false);
    });

    it('overwrites a pre-existing destination index row', () => {
      indexer.indexFile('/src.md', Buffer.from('src-body'));
      indexer.indexFile('/dst.md', Buffer.from('dst-body'));
      expect(indexer.moveFile('/src.md', '/dst.md')).toBe(true);
      expect(indexer.getRow('/src.md')).toBeNull();
      expect(indexer.getRow('/dst.md')).toBeTruthy();
    });
  });

  describe('listAll', () => {
    it('returns an empty array with no index rows', () => {
      expect(indexer.listAll()).toEqual([]);
    });

    it('returns rows newest-indexed first', async () => {
      indexer.indexFile('/a.md', Buffer.from('a'));
      await new Promise(resolve => setTimeout(resolve, 1100));
      indexer.indexFile('/b.md', Buffer.from('b'));
      const all = indexer.listAll();
      expect(all).toHaveLength(2);
      expect(all[0].filePath).toBe('/b.md');
      expect(all[1].filePath).toBe('/a.md');
    });
  });

  describe('constructor side effects', () => {
    it('ensureTable is idempotent (second instance on same DB is OK)', () => {
      indexer.indexFile('/a.md', Buffer.from('x'));
      const indexer2 = new FileIndexer(db);
      expect(indexer2.getRow('/a.md')).toBeTruthy();
    });
  });
});
