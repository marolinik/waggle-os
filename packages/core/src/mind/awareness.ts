import type { MindDB } from './db.js';

export type AwarenessCategory = 'task' | 'action' | 'pending' | 'flag';

export interface AwarenessMetadata {
  context?: string;
  status?: string;
  result?: string;
  priority?: string;
  [key: string]: unknown;
}

export interface AwarenessItem {
  id: number;
  category: AwarenessCategory;
  content: string;
  priority: number;
  metadata: string;
  created_at: string;
  expires_at: string | null;
}

type AwarenessUpdate = Partial<Pick<AwarenessItem, 'content' | 'priority' | 'expires_at'>>;

const MAX_ITEMS = 10;

export class AwarenessLayer {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureMetadataColumn();
  }

  /** Ensure metadata column exists for databases created before this feature */
  private ensureMetadataColumn(): void {
    const raw = this.db.getDatabase();
    const columns = raw.prepare("PRAGMA table_info(awareness)").all() as Array<{ name: string }>;
    const hasMetadata = columns.some(c => c.name === 'metadata');
    if (!hasMetadata) {
      raw.exec("ALTER TABLE awareness ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
    }
  }

  add(category: AwarenessCategory, content: string, priority = 0, expires_at?: string, metadata?: AwarenessMetadata): AwarenessItem {
    const raw = this.db.getDatabase();
    const metadataJson = metadata ? JSON.stringify(metadata) : '{}';
    const result = raw.prepare(`
      INSERT INTO awareness (category, content, priority, expires_at, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(category, content, priority, expires_at ?? null, metadataJson);
    return raw.prepare('SELECT * FROM awareness WHERE id = ?').get(result.lastInsertRowid) as AwarenessItem;
  }

  get(id: number): AwarenessItem | undefined {
    return this.db.getDatabase().prepare('SELECT * FROM awareness WHERE id = ?').get(id) as AwarenessItem | undefined;
  }

  remove(id: number): void {
    this.db.getDatabase().prepare('DELETE FROM awareness WHERE id = ?').run(id);
  }

  update(id: number, changes: AwarenessUpdate): AwarenessItem {
    const fields = Object.entries(changes).filter(([, v]) => v !== undefined);
    if (fields.length === 0) {
      return this.db.getDatabase().prepare('SELECT * FROM awareness WHERE id = ?').get(id) as AwarenessItem;
    }
    const sets = fields.map(([k]) => `${k} = ?`).join(', ');
    const values = fields.map(([, v]) => v);
    const raw = this.db.getDatabase();
    raw.prepare(`UPDATE awareness SET ${sets} WHERE id = ?`).run(...values, id);
    return raw.prepare('SELECT * FROM awareness WHERE id = ?').get(id) as AwarenessItem;
  }

  updateMetadata(id: number, metadata: AwarenessMetadata): AwarenessItem {
    const raw = this.db.getDatabase();
    const existing = raw.prepare('SELECT metadata FROM awareness WHERE id = ?').get(id) as { metadata: string } | undefined;
    if (!existing) {
      throw new Error(`Awareness item ${id} not found`);
    }
    const current: AwarenessMetadata = JSON.parse(existing.metadata);
    const merged = { ...current, ...metadata };
    raw.prepare('UPDATE awareness SET metadata = ? WHERE id = ?').run(JSON.stringify(merged), id);
    return raw.prepare('SELECT * FROM awareness WHERE id = ?').get(id) as AwarenessItem;
  }

  getByStatus(status: string): AwarenessItem[] {
    const raw = this.db.getDatabase();
    const items = raw.prepare(`
      SELECT * FROM awareness
      WHERE (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY priority DESC
    `).all() as AwarenessItem[];
    return items.filter(item => {
      try {
        const meta: AwarenessMetadata = JSON.parse(item.metadata);
        return meta.status === status;
      } catch {
        return false;
      }
    });
  }

  parseMetadata(item: AwarenessItem): AwarenessMetadata {
    try {
      return JSON.parse(item.metadata) as AwarenessMetadata;
    } catch {
      return {};
    }
  }

  getAll(): AwarenessItem[] {
    return this.db.getDatabase().prepare(`
      SELECT * FROM awareness
      WHERE expires_at IS NULL OR expires_at > datetime('now')
      ORDER BY priority DESC
      LIMIT ?
    `).all(MAX_ITEMS) as AwarenessItem[];
  }

  getByCategory(category: AwarenessCategory): AwarenessItem[] {
    return this.db.getDatabase().prepare(`
      SELECT * FROM awareness
      WHERE category = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY priority DESC
      LIMIT ?
    `).all(category, MAX_ITEMS) as AwarenessItem[];
  }

  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM awareness').run();
  }

  clearCategory(category: AwarenessCategory): void {
    this.db.getDatabase().prepare('DELETE FROM awareness WHERE category = ?').run(category);
  }

  toContext(): string {
    const items = this.getAll();
    if (items.length === 0) return 'No active awareness items.';

    const grouped = new Map<string, AwarenessItem[]>();
    for (const item of items) {
      const list = grouped.get(item.category) ?? [];
      list.push(item);
      grouped.set(item.category, list);
    }

    const sections: string[] = [];
    const labels: Record<AwarenessCategory, string> = {
      task: 'Active Tasks',
      action: 'Recent Actions',
      pending: 'Pending Items',
      flag: 'Context Flags',
    };

    for (const [cat, label] of Object.entries(labels)) {
      const catItems = grouped.get(cat);
      if (catItems && catItems.length > 0) {
        sections.push(`${label}:\n${catItems.map(i => `- ${i.content}`).join('\n')}`);
      }
    }

    return sections.join('\n\n');
  }
}
