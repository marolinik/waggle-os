import type { MindDB } from './db.js';

export interface Session {
  id: number;
  gop_id: string;
  project_id: string | null;
  status: 'active' | 'closed' | 'archived';
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export class SessionStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
  }

  create(projectId?: string): Session {
    const gopId = `session:${new Date().toISOString()}:${Math.random().toString(36).slice(2, 8)}`;
    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      INSERT INTO sessions (gop_id, project_id, status, started_at)
      VALUES (?, ?, 'active', datetime('now'))
    `).run(gopId, projectId ?? null);
    return raw.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid) as Session;
  }

  close(gopId: string, summary?: string): Session {
    const raw = this.db.getDatabase();
    raw.prepare(`
      UPDATE sessions SET status = 'closed', ended_at = datetime('now'), summary = ?
      WHERE gop_id = ?
    `).run(summary ?? null, gopId);
    return raw.prepare('SELECT * FROM sessions WHERE gop_id = ?').get(gopId) as Session;
  }

  archive(gopId: string): Session {
    const raw = this.db.getDatabase();
    raw.prepare("UPDATE sessions SET status = 'archived' WHERE gop_id = ?").run(gopId);
    return raw.prepare('SELECT * FROM sessions WHERE gop_id = ?').get(gopId) as Session;
  }

  getByProject(projectId: string): Session[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC'
    ).all(projectId) as Session[];
  }

  getActive(): Session[] {
    return this.db.getDatabase().prepare(
      "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC"
    ).all() as Session[];
  }

  getByGopId(gopId: string): Session | undefined {
    return this.db.getDatabase().prepare(
      'SELECT * FROM sessions WHERE gop_id = ?'
    ).get(gopId) as Session | undefined;
  }
}
