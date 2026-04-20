/**
 * FileIndexer unit tests (L-20)
 *
 * Covers: format gate, indexing, overwrite semantics, move, remove, truncation,
 * shared-content dedup safety, and the underlying file_index table.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
