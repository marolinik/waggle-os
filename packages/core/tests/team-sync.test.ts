import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { frameToEntity, entityToSyncedFrame, TeamSync, type TeamSyncConfig } from '../src/team-sync.js';
import type { MemoryFrame } from '../src/mind/frames.js';

describe('frameToEntity', () => {
  it('converts a MemoryFrame to team entity format', () => {
    const frame: MemoryFrame = {
      id: 42,
      frame_type: 'I',
      gop_id: 'project-context',
      t: 3,
      base_frame_id: null,
      content: 'The project uses React and TypeScript',
      importance: 'important',
      access_count: 5,
      created_at: '2026-03-12T10:00:00.000Z',
      last_accessed: '2026-03-12T12:00:00.000Z',
    };

    const entity = frameToEntity(frame, 'user-abc', 'Marko');

    expect(entity.entityType).toBe('memory_frame');
    expect(entity.name).toBe('project-context');
    expect(entity.properties.frameType).toBe('I');
    expect(entity.properties.t).toBe(3);
    expect(entity.properties.baseFrameId).toBeNull();
    expect(entity.properties.content).toBe('The project uses React and TypeScript');
    expect(entity.properties.importance).toBe('important');
    expect(entity.properties.authorId).toBe('user-abc');
    expect(entity.properties.authorName).toBe('Marko');
    expect(entity.properties.localId).toBe(42);
  });

  it('preserves P-frame base_frame_id', () => {
    const frame: MemoryFrame = {
      id: 43,
      frame_type: 'P',
      gop_id: 'project-context',
      t: 4,
      base_frame_id: 42,
      content: 'Updated: now also using Tailwind',
      importance: 'normal',
      access_count: 0,
      created_at: '2026-03-12T11:00:00.000Z',
      last_accessed: '2026-03-12T11:00:00.000Z',
    };

    const entity = frameToEntity(frame, 'user-xyz', 'Ana');

    expect(entity.properties.frameType).toBe('P');
    expect(entity.properties.baseFrameId).toBe(42);
    expect(entity.properties.authorName).toBe('Ana');
  });
});

describe('entityToSyncedFrame', () => {
  it('converts a team entity back to SyncedFrame', () => {
    const entity = {
      id: 'uuid-remote-1',
      name: 'project-context',
      properties: {
        frameType: 'I',
        t: 3,
        baseFrameId: null,
        content: 'The project uses React and TypeScript',
        importance: 'important',
        authorId: 'user-abc',
        authorName: 'Marko',
        localId: 42,
      },
      createdAt: '2026-03-12T10:00:00.000Z',
    };

    const frame = entityToSyncedFrame(entity);

    expect(frame.remoteId).toBe('uuid-remote-1');
    expect(frame.gopId).toBe('project-context');
    expect(frame.t).toBe(3);
    expect(frame.frameType).toBe('I');
    expect(frame.content).toBe('The project uses React and TypeScript');
    expect(frame.importance).toBe('important');
    expect(frame.authorId).toBe('user-abc');
    expect(frame.authorName).toBe('Marko');
    expect(frame.createdAt).toBe('2026-03-12T10:00:00.000Z');
  });

  it('handles missing properties gracefully', () => {
    const entity = {
      id: 'uuid-remote-2',
      name: 'some-gop',
      properties: {},
      createdAt: '2026-03-12T10:00:00.000Z',
    };

    const frame = entityToSyncedFrame(entity);

    expect(frame.remoteId).toBe('uuid-remote-2');
    expect(frame.gopId).toBe('some-gop');
    expect(frame.t).toBe(0);
    expect(frame.frameType).toBe('I');
    expect(frame.content).toBe('');
    expect(frame.importance).toBe('normal');
    expect(frame.authorId).toBe('');
    expect(frame.authorName).toBe('');
  });
});

describe('TeamSync', () => {
  const mockConfig: TeamSyncConfig = {
    teamServerUrl: 'https://team.waggle.dev',
    teamSlug: 'test-team',
    authToken: 'test-jwt-token',
    userId: 'user-abc',
    displayName: 'Marko',
  };

  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pushFrame', () => {
    it('sends frame to team server entities endpoint', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'remote-uuid-1' }),
      });

      const sync = new TeamSync(mockConfig);
      const frame: MemoryFrame = {
        id: 1,
        frame_type: 'I',
        gop_id: 'test-gop',
        t: 0,
        base_frame_id: null,
        content: 'Test content',
        importance: 'normal',
        access_count: 0,
        created_at: '2026-03-12T10:00:00.000Z',
        last_accessed: '2026-03-12T10:00:00.000Z',
      };

      const result = await sync.pushFrame(frame);

      expect(result).toEqual({ remoteId: 'remote-uuid-1' });
      expect(fetchSpy).toHaveBeenCalledOnce();

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://team.waggle.dev/api/teams/test-team/entities');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer test-jwt-token');

      const body = JSON.parse(opts.body);
      expect(body.entityType).toBe('memory_frame');
      expect(body.name).toBe('test-gop');
      expect(body.properties.content).toBe('Test content');
      expect(body.properties.authorId).toBe('user-abc');
      expect(body.properties.authorName).toBe('Marko');
    });

    it('returns null on server error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const sync = new TeamSync(mockConfig);
      const frame: MemoryFrame = {
        id: 1, frame_type: 'I', gop_id: 'test', t: 0, base_frame_id: null,
        content: 'x', importance: 'normal', access_count: 0,
        created_at: '2026-03-12T10:00:00.000Z', last_accessed: '2026-03-12T10:00:00.000Z',
      };

      const result = await sync.pushFrame(frame);
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      fetchSpy.mockRejectedValue(new Error('Network unreachable'));

      const sync = new TeamSync(mockConfig);
      const frame: MemoryFrame = {
        id: 1, frame_type: 'I', gop_id: 'test', t: 0, base_frame_id: null,
        content: 'x', importance: 'normal', access_count: 0,
        created_at: '2026-03-12T10:00:00.000Z', last_accessed: '2026-03-12T10:00:00.000Z',
      };

      const result = await sync.pushFrame(frame);
      expect(result).toBeNull();
    });
  });

  describe('pullFrames', () => {
    it('fetches frames from team server', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            id: 'uuid-1',
            name: 'gop-a',
            properties: { frameType: 'I', t: 0, content: 'First', importance: 'important', authorId: 'u1', authorName: 'Marko' },
            createdAt: '2026-03-12T10:00:00.000Z',
          },
          {
            id: 'uuid-2',
            name: 'gop-b',
            properties: { frameType: 'P', t: 1, content: 'Second', importance: 'normal', authorId: 'u2', authorName: 'Ana' },
            createdAt: '2026-03-12T11:00:00.000Z',
          },
        ]),
      });

      const sync = new TeamSync(mockConfig);
      const frames = await sync.pullFrames();

      expect(frames).toHaveLength(2);
      expect(frames[0].gopId).toBe('gop-a');
      expect(frames[0].authorName).toBe('Marko');
      expect(frames[1].gopId).toBe('gop-b');
      expect(frames[1].authorName).toBe('Ana');

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/teams/test-team/entities?type=memory_frame');
      expect(opts.headers['Authorization']).toBe('Bearer test-jwt-token');
    });

    it('filters by since timestamp when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ([
          {
            id: 'uuid-1', name: 'gop-a',
            properties: { frameType: 'I', t: 0, content: 'Old', authorId: 'u1', authorName: 'M' },
            createdAt: '2026-03-11T10:00:00.000Z',
          },
          {
            id: 'uuid-2', name: 'gop-b',
            properties: { frameType: 'I', t: 0, content: 'New', authorId: 'u2', authorName: 'A' },
            createdAt: '2026-03-12T15:00:00.000Z',
          },
        ]),
      });

      const sync = new TeamSync(mockConfig);
      const frames = await sync.pullFrames('2026-03-12T00:00:00.000Z');

      // Only the frame after the since timestamp
      expect(frames).toHaveLength(1);
      expect(frames[0].content).toBe('New');
    });

    it('returns empty array on server error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, status: 500, statusText: 'Error' });

      const sync = new TeamSync(mockConfig);
      const frames = await sync.pullFrames();
      expect(frames).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      fetchSpy.mockRejectedValue(new Error('Offline'));

      const sync = new TeamSync(mockConfig);
      const frames = await sync.pullFrames();
      expect(frames).toEqual([]);
    });
  });

  describe('sync timestamp tracking', () => {
    it('starts with null timestamp', () => {
      const sync = new TeamSync(mockConfig);
      expect(sync.getLastSyncTimestamp()).toBeNull();
    });

    it('updates timestamp after successful pull', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ([]) });

      const sync = new TeamSync(mockConfig);
      await sync.pullFrames();

      expect(sync.getLastSyncTimestamp()).toBeTruthy();
    });

    it('allows manual timestamp setting', () => {
      const sync = new TeamSync(mockConfig);
      sync.setLastSyncTimestamp('2026-03-12T10:00:00.000Z');
      expect(sync.getLastSyncTimestamp()).toBe('2026-03-12T10:00:00.000Z');
    });
  });
});
