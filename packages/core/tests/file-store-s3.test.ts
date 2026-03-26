import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3FileStore, type S3Config } from '../src/file-store.js';

// ── Mock @aws-sdk/client-s3 ────────────────────────────────────────

const mockSend = vi.fn();

class MockS3Client {
  send = mockSend;
  constructor(_config: any) {}
}

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: MockS3Client,
    GetObjectCommand: class { [k: string]: any; _type = 'GetObject'; constructor(input: any) { Object.assign(this, input); } },
    PutObjectCommand: class { [k: string]: any; _type = 'PutObject'; constructor(input: any) { Object.assign(this, input); } },
    DeleteObjectCommand: class { [k: string]: any; _type = 'DeleteObject'; constructor(input: any) { Object.assign(this, input); } },
    ListObjectsV2Command: class { [k: string]: any; _type = 'ListObjects'; constructor(input: any) { Object.assign(this, input); } },
    CopyObjectCommand: class { [k: string]: any; _type = 'CopyObject'; constructor(input: any) { Object.assign(this, input); } },
  };
});

// ── Test setup ──────────────────────────────────────────────────────

const testConfig: S3Config = {
  endpoint: 'minio:9000',
  bucket: 'waggle-files',
  accessKey: 'waggle',
  secretKey: 'waggle_s3_prod',
  prefix: 'workspaces/ws-123/',
};

describe('S3FileStore', () => {
  let store: S3FileStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new S3FileStore(testConfig);
  });

  // ── Meta ────────────────────────────────────────────────────────

  it('getStorageType returns virtual', () => {
    expect(store.getStorageType()).toBe('virtual');
  });

  it('getRootPath returns s3:// URL', () => {
    expect(store.getRootPath()).toBe('s3://waggle-files/workspaces/ws-123/');
  });

  // ── writeFile ───────────────────────────────────────────────────

  it('writeFile sends PutObjectCommand with correct bucket and key', async () => {
    mockSend.mockResolvedValueOnce({});

    await store.writeFile('docs/notes.md', 'hello world');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe('PutObject');
    expect(cmd.Bucket).toBe('waggle-files');
    expect(cmd.Key).toBe('workspaces/ws-123/docs/notes.md');
    expect(cmd.Body).toEqual(Buffer.from('hello world'));
  });

  it('writeFile accepts Buffer content', async () => {
    mockSend.mockResolvedValueOnce({});
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await store.writeFile('image.png', buf);

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.Body).toBe(buf);
  });

  // ── readFile ────────────────────────────────────────────────────

  it('readFile sends GetObjectCommand and returns Buffer', async () => {
    const chunks = [Buffer.from('chunk1'), Buffer.from('chunk2')];
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    };
    mockSend.mockResolvedValueOnce({ Body: asyncIterable });

    const result = await store.readFile('docs/notes.md');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe('GetObject');
    expect(cmd.Bucket).toBe('waggle-files');
    expect(cmd.Key).toBe('workspaces/ws-123/docs/notes.md');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe('chunk1chunk2');
  });

  // ── deleteFile ──────────────────────────────────────────────────

  it('deleteFile sends DeleteObjectCommand', async () => {
    mockSend.mockResolvedValueOnce({});

    await store.deleteFile('old-file.txt');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe('DeleteObject');
    expect(cmd.Bucket).toBe('waggle-files');
    expect(cmd.Key).toBe('workspaces/ws-123/old-file.txt');
  });

  // ── listFiles ───────────────────────────────────────────────────

  it('listFiles sends ListObjectsV2Command and returns FileEntry[]', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'workspaces/ws-123/readme.md', Size: 1024, LastModified: new Date('2025-06-01T00:00:00Z') },
        { Key: 'workspaces/ws-123/src/index.ts', Size: 512, LastModified: new Date('2025-06-02T00:00:00Z') },
      ],
      CommonPrefixes: [
        { Prefix: 'workspaces/ws-123/docs/' },
      ],
    });

    const entries = await store.listFiles();

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe('ListObjects');
    expect(cmd.Bucket).toBe('waggle-files');
    expect(cmd.Prefix).toBe('workspaces/ws-123/');
    expect(cmd.Delimiter).toBe('/');

    expect(entries).toHaveLength(3);
    // File entries
    expect(entries[0]).toEqual({
      name: 'readme.md',
      path: 'readme.md',
      size: 1024,
      modified: '2025-06-01T00:00:00.000Z',
      isDirectory: false,
    });
    expect(entries[1]).toEqual({
      name: 'index.ts',
      path: 'src/index.ts',
      size: 512,
      modified: '2025-06-02T00:00:00.000Z',
      isDirectory: false,
    });
    // Directory entry
    expect(entries[2]).toEqual({
      name: 'docs',
      path: 'docs',
      size: 0,
      modified: '',
      isDirectory: true,
    });
  });

  it('listFiles with directory argument appends to prefix', async () => {
    mockSend.mockResolvedValueOnce({ Contents: [], CommonPrefixes: [] });

    await store.listFiles('src');

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.Prefix).toBe('workspaces/ws-123/src/');
  });

  it('listFiles handles empty response', async () => {
    mockSend.mockResolvedValueOnce({});

    const entries = await store.listFiles();
    expect(entries).toEqual([]);
  });

  // ── moveFile ────────────────────────────────────────────────────

  it('moveFile copies then deletes', async () => {
    mockSend.mockResolvedValueOnce({}); // CopyObject
    mockSend.mockResolvedValueOnce({}); // DeleteObject

    await store.moveFile('old.txt', 'new.txt');

    expect(mockSend).toHaveBeenCalledTimes(2);
    const copyCmd = mockSend.mock.calls[0][0];
    expect(copyCmd._type).toBe('CopyObject');
    expect(copyCmd.CopySource).toBe('waggle-files/workspaces/ws-123/old.txt');
    expect(copyCmd.Key).toBe('workspaces/ws-123/new.txt');

    const deleteCmd = mockSend.mock.calls[1][0];
    expect(deleteCmd._type).toBe('DeleteObject');
    expect(deleteCmd.Key).toBe('workspaces/ws-123/old.txt');
  });

  // ── searchFiles ─────────────────────────────────────────────────

  it('searchFiles filters listFiles results by pattern', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'workspaces/ws-123/readme.md', Size: 100, LastModified: new Date() },
        { Key: 'workspaces/ws-123/notes.txt', Size: 200, LastModified: new Date() },
        { Key: 'workspaces/ws-123/data.md', Size: 50, LastModified: new Date() },
      ],
      CommonPrefixes: [],
    });

    const results = await store.searchFiles('*.md');

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('readme.md');
    expect(results[1].name).toBe('data.md');
  });

  // ── getStorageInfo ──────────────────────────────────────────────

  it('getStorageInfo sums sizes from S3 listing', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'workspaces/ws-123/a.txt', Size: 100 },
        { Key: 'workspaces/ws-123/b.txt', Size: 250 },
        { Key: 'workspaces/ws-123/c.txt', Size: 50 },
      ],
    });

    const info = await store.getStorageInfo();

    expect(info).toEqual({
      usedBytes: 400,
      fileCount: 3,
      storageType: 'virtual',
    });
  });
});
