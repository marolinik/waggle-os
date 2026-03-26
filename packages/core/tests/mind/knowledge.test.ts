import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import {
  KnowledgeGraph,
  type Entity,
  type Relation,
  type ValidationSchema,
} from '../../src/mind/knowledge.js';

describe('Knowledge Graph (Layer 3)', () => {
  let db: MindDB;
  let kg: KnowledgeGraph;

  beforeEach(() => {
    db = new MindDB(':memory:');
    kg = new KnowledgeGraph(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Entity CRUD', () => {
    it('creates an entity with typed properties', () => {
      const entity = kg.createEntity('person', 'John Doe', { email: 'john@example.com', role: 'engineer' });
      expect(entity.id).toBeDefined();
      expect(entity.entity_type).toBe('person');
      expect(entity.name).toBe('John Doe');
      const props = JSON.parse(entity.properties);
      expect(props.email).toBe('john@example.com');
    });

    it('reads an entity by id', () => {
      const created = kg.createEntity('project', 'Waggle', { status: 'active' });
      const fetched = kg.getEntity(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe('Waggle');
    });

    it('updates entity properties', () => {
      const entity = kg.createEntity('person', 'Jane', { role: 'designer' });
      const updated = kg.updateEntity(entity.id, { name: 'Jane Smith', properties: { role: 'lead designer', team: 'UX' } });
      expect(updated.name).toBe('Jane Smith');
      const props = JSON.parse(updated.properties);
      expect(props.role).toBe('lead designer');
      expect(props.team).toBe('UX');
    });

    it('soft-deletes by setting valid_to', () => {
      const entity = kg.createEntity('document', 'Old Report', {});
      kg.retireEntity(entity.id);
      const retired = kg.getEntity(entity.id);
      expect(retired!.valid_to).not.toBeNull();
    });

    it('queries by entity type', () => {
      kg.createEntity('person', 'Alice', {});
      kg.createEntity('person', 'Bob', {});
      kg.createEntity('project', 'Waggle', {});

      const people = kg.getEntitiesByType('person');
      expect(people).toHaveLength(2);
      expect(people.every(e => e.entity_type === 'person')).toBe(true);
    });

    it('searches entities by name', () => {
      kg.createEntity('person', 'Alice Smith', {});
      kg.createEntity('person', 'Bob Jones', {});
      kg.createEntity('person', 'Alice Johnson', {});

      const results = kg.searchEntities('Alice');
      expect(results).toHaveLength(2);
    });
  });

  describe('Relation CRUD', () => {
    it('creates a directed relation with confidence', () => {
      const alice = kg.createEntity('person', 'Alice', {});
      const waggle = kg.createEntity('project', 'Waggle', {});

      const rel = kg.createRelation(alice.id, waggle.id, 'works_on', 0.95, { role: 'lead' });
      expect(rel.source_id).toBe(alice.id);
      expect(rel.target_id).toBe(waggle.id);
      expect(rel.relation_type).toBe('works_on');
      expect(rel.confidence).toBe(0.95);
    });

    it('gets relations from a source entity', () => {
      const alice = kg.createEntity('person', 'Alice', {});
      const p1 = kg.createEntity('project', 'P1', {});
      const p2 = kg.createEntity('project', 'P2', {});

      kg.createRelation(alice.id, p1.id, 'works_on', 1.0);
      kg.createRelation(alice.id, p2.id, 'manages', 0.8);

      const rels = kg.getRelationsFrom(alice.id);
      expect(rels).toHaveLength(2);
    });

    it('gets relations to a target entity', () => {
      const alice = kg.createEntity('person', 'Alice', {});
      const bob = kg.createEntity('person', 'Bob', {});
      const waggle = kg.createEntity('project', 'Waggle', {});

      kg.createRelation(alice.id, waggle.id, 'works_on', 1.0);
      kg.createRelation(bob.id, waggle.id, 'works_on', 1.0);

      const rels = kg.getRelationsTo(waggle.id);
      expect(rels).toHaveLength(2);
    });

    it('filters relations by type', () => {
      const alice = kg.createEntity('person', 'Alice', {});
      const p1 = kg.createEntity('project', 'P1', {});
      const p2 = kg.createEntity('project', 'P2', {});

      kg.createRelation(alice.id, p1.id, 'works_on', 1.0);
      kg.createRelation(alice.id, p2.id, 'manages', 0.8);

      const worksOn = kg.getRelationsFrom(alice.id, 'works_on');
      expect(worksOn).toHaveLength(1);
      expect(worksOn[0].relation_type).toBe('works_on');
    });

    it('soft-deletes relation by setting valid_to', () => {
      const a = kg.createEntity('person', 'A', {});
      const b = kg.createEntity('person', 'B', {});
      const rel = kg.createRelation(a.id, b.id, 'knows', 1.0);
      kg.retireRelation(rel.id);
      const retired = kg.getRelation(rel.id);
      expect(retired!.valid_to).not.toBeNull();
    });
  });

  describe('Bi-temporal queries', () => {
    it('queries what was true at a specific time', () => {
      const alice = kg.createEntity('person', 'Alice', { role: 'junior' });
      // Simulate a temporal update: retire old, create new version
      kg.retireEntity(alice.id);
      const alice2 = kg.createEntity('person', 'Alice', { role: 'senior' });

      // Both versions exist
      const all = kg.getEntitiesByType('person');
      // Only active (valid_to IS NULL) returned by default
      const active = all.filter(e => e.valid_to === null);
      expect(active).toHaveLength(1);
      expect(JSON.parse(active[0].properties).role).toBe('senior');
    });

    it('queries entities valid at a specific point in time', () => {
      const entity = kg.createEntity('person', 'Alice', {});
      // Entity is valid from creation, no end date
      const atTime = new Date().toISOString();
      const results = kg.getEntitiesValidAt(atTime);
      expect(results.some(e => e.name === 'Alice')).toBe(true);
    });

    it('retired entities excluded from validAt queries', () => {
      const entity = kg.createEntity('person', 'Old Person', {});
      kg.retireEntity(entity.id);

      const future = new Date(Date.now() + 60000).toISOString();
      const results = kg.getEntitiesValidAt(future);
      expect(results.some(e => e.name === 'Old Person')).toBe(false);
    });
  });

  describe('Graph traversal', () => {
    it('follows relation types N levels deep', () => {
      const a = kg.createEntity('person', 'A', {});
      const b = kg.createEntity('person', 'B', {});
      const c = kg.createEntity('person', 'C', {});
      const d = kg.createEntity('person', 'D', {});

      kg.createRelation(a.id, b.id, 'knows', 1.0);
      kg.createRelation(b.id, c.id, 'knows', 1.0);
      kg.createRelation(c.id, d.id, 'knows', 1.0);

      // Depth 1: A → B
      const depth1 = kg.traverse(a.id, 'knows', 1);
      expect(depth1.map(e => e.name)).toEqual(['B']);

      // Depth 2: A → B → C
      const depth2 = kg.traverse(a.id, 'knows', 2);
      expect(depth2.map(e => e.name)).toContain('B');
      expect(depth2.map(e => e.name)).toContain('C');

      // Depth 3: A → B → C → D
      const depth3 = kg.traverse(a.id, 'knows', 3);
      expect(depth3).toHaveLength(3);
    });

    it('handles cycles without infinite loop', () => {
      const a = kg.createEntity('person', 'A', {});
      const b = kg.createEntity('person', 'B', {});

      kg.createRelation(a.id, b.id, 'knows', 1.0);
      kg.createRelation(b.id, a.id, 'knows', 1.0);

      const result = kg.traverse(a.id, 'knows', 5);
      expect(result).toHaveLength(1); // Only B (A is start, not included)
    });

    it('BFS shortest distances for scoring', () => {
      const a = kg.createEntity('person', 'A', {});
      const b = kg.createEntity('person', 'B', {});
      const c = kg.createEntity('person', 'C', {});
      const d = kg.createEntity('person', 'D', {});

      kg.createRelation(a.id, b.id, 'related', 1.0);
      kg.createRelation(b.id, c.id, 'related', 1.0);
      kg.createRelation(c.id, d.id, 'related', 1.0);

      const distances = kg.bfsDistances(a.id, 3);
      expect(distances.get(b.id)).toBe(1);
      expect(distances.get(c.id)).toBe(2);
      expect(distances.get(d.id)).toBe(3);
      expect(distances.has(a.id)).toBe(false); // start node excluded
    });
  });

  describe('SHACL-like validation', () => {
    it('validates required properties', () => {
      const schema: ValidationSchema = {
        person: {
          required: ['name', 'email'],
          allowedRelations: ['works_on', 'knows', 'manages'],
        },
      };
      kg.setValidationSchema(schema);

      // Valid: has required properties
      expect(() => {
        kg.createEntity('person', 'Alice', { name: 'Alice', email: 'alice@test.com' });
      }).not.toThrow();

      // Invalid: missing required property
      expect(() => {
        kg.createEntity('person', 'Bob', { name: 'Bob' }); // missing email
      }).toThrow(/required property.*email/i);
    });

    it('validates allowed relations', () => {
      const schema: ValidationSchema = {
        person: {
          required: [],
          allowedRelations: ['works_on', 'knows'],
        },
      };
      kg.setValidationSchema(schema);

      const alice = kg.createEntity('person', 'Alice', {});
      const project = kg.createEntity('project', 'P1', {});

      // Allowed relation
      expect(() => {
        kg.createRelation(alice.id, project.id, 'works_on', 1.0);
      }).not.toThrow();

      // Disallowed relation
      expect(() => {
        kg.createRelation(alice.id, project.id, 'owns', 1.0);
      }).toThrow(/relation.*owns.*not allowed/i);
    });

    it('skips validation for types without schema', () => {
      const schema: ValidationSchema = {
        person: { required: ['email'], allowedRelations: ['knows'] },
      };
      kg.setValidationSchema(schema);

      // 'project' has no schema → no validation
      expect(() => {
        kg.createEntity('project', 'P1', {});
      }).not.toThrow();
    });
  });
});
