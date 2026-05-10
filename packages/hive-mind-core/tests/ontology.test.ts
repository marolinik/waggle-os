import { describe, it, expect } from 'vitest';
import { Ontology, validateEntity } from '../src/mind/ontology.js';

describe('Ontology Grounding', () => {
  function makeOntology(): Ontology {
    const ont = new Ontology();
    ont.define('Person', {
      required: ['name', 'email'],
      optional: ['age', 'bio'],
    });
    ont.define('Project', {
      required: ['title'],
      optional: ['description', 'status'],
    });
    return ont;
  }

  it('valid entity passes validation', () => {
    const ont = makeOntology();
    const result = validateEntity(ont, {
      type: 'Person',
      properties: { name: 'Alice', email: 'alice@example.com', age: 30 },
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('unknown type fails with issue', () => {
    const ont = makeOntology();
    const result = validateEntity(ont, {
      type: 'Animal',
      properties: { species: 'cat' },
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Unknown entity type: Animal');
  });

  it('unknown/unexpected properties get flagged', () => {
    const ont = makeOntology();
    const result = validateEntity(ont, {
      type: 'Person',
      properties: { name: 'Bob', email: 'bob@test.com', favoriteColor: 'blue' },
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('Unknown property: favoriteColor');
  });

  it('missing required = invalid, missing optional = still valid', () => {
    const ont = makeOntology();

    // Missing required 'email'
    const missing = validateEntity(ont, {
      type: 'Person',
      properties: { name: 'Charlie' },
    });
    expect(missing.valid).toBe(false);
    expect(missing.issues).toContain('Missing required property: email');

    // All required present, no optional — still valid
    const minimal = validateEntity(ont, {
      type: 'Project',
      properties: { title: 'Waggle' },
    });
    expect(minimal.valid).toBe(true);
    expect(minimal.issues).toHaveLength(0);
  });
});
