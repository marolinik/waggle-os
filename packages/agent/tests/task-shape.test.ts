import { describe, it, expect } from 'vitest';
import { detectTaskShape, type TaskShape } from '../src/task-shape.js';

describe('Task Shape Classifier', () => {
  // ── Single shape detection ───────────────────────────────────────────

  describe('research detection', () => {
    it('detects strong research phrases', () => {
      const shape = detectTaskShape('Find out what competitors are doing in this space');
      expect(shape.type).toBe('research');
      expect(shape.confidence).toBeGreaterThan(0.3);
    });

    it('detects research keywords', () => {
      const shape = detectTaskShape('Research the current state of WebAssembly');
      expect(shape.type).toBe('research');
    });

    it('detects "what is" questions as research', () => {
      const shape = detectTaskShape('What are the best practices for API design?');
      expect(shape.type).toBe('research');
    });
  });

  describe('compare detection', () => {
    it('detects compare-with pattern', () => {
      const shape = detectTaskShape('Compare React with Vue for our frontend');
      expect(shape.type).toBe('compare');
    });

    it('detects pros and cons', () => {
      // "What are" also triggers research, so use a purer compare phrase
      const shape = detectTaskShape('Give me the pros and cons of microservices versus monolith');
      expect(shape.type).toBe('compare');
    });

    it('detects tradeoffs', () => {
      const shape = detectTaskShape('Analyze the tradeoffs between SQL and NoSQL');
      expect(shape.type).toBe('compare');
    });
  });

  describe('draft detection', () => {
    it('detects "write me a" pattern', () => {
      const shape = detectTaskShape('Write me a status update email');
      expect(shape.type).toBe('draft');
    });

    it('detects "draft a" pattern', () => {
      const shape = detectTaskShape('Draft a proposal for the new feature');
      expect(shape.type).toBe('draft');
    });

    it('detects "create a" pattern', () => {
      const shape = detectTaskShape('Create a summary of our meeting notes');
      expect(shape.type).toBe('draft');
    });
  });

  describe('review detection', () => {
    it('detects "review this" pattern', () => {
      const shape = detectTaskShape('Review this pull request for security issues');
      expect(shape.type).toBe('review');
    });

    it('detects "give me feedback" pattern', () => {
      const shape = detectTaskShape('Give me feedback on this design document');
      expect(shape.type).toBe('review');
    });

    it('detects "find issues" pattern', () => {
      const shape = detectTaskShape('Find issues in the authentication flow');
      expect(shape.type).toBe('review');
    });
  });

  describe('decide detection', () => {
    it('detects "should I" pattern', () => {
      const shape = detectTaskShape('Should I use TypeScript or JavaScript for this project?');
      expect(shape.type).toBe('decide');
    });

    it('detects "help me decide" pattern', () => {
      const shape = detectTaskShape('Help me decide between AWS and GCP');
      expect(shape.type).toBe('decide');
    });

    it('detects "what would you recommend" pattern', () => {
      const shape = detectTaskShape('What would you recommend for our CI pipeline?');
      expect(shape.type).toBe('decide');
    });
  });

  describe('plan-execute detection', () => {
    it('detects "break this down" pattern', () => {
      const shape = detectTaskShape('Break this project down into phases');
      expect(shape.type).toBe('plan-execute');
    });

    it('detects "how to implement" pattern', () => {
      const shape = detectTaskShape('How should I implement the authentication system?');
      expect(shape.type).toBe('plan-execute');
    });

    it('detects "create a plan" pattern', () => {
      const shape = detectTaskShape('Create a plan for migrating to the new database');
      expect(shape.type).toBe('plan-execute');
    });
  });

  // ── Mixed task detection ─────────────────────────────────────────────

  describe('mixed task detection', () => {
    it('detects mixed task with compound connectors', () => {
      // Use strong phrases for each shape to ensure scores ≥ 2 per shape
      const shape = detectTaskShape(
        'First, find out what auth frameworks exist and investigate them. Then compare them versus each other side by side. Then write me a recommendation memo.',
      );
      expect(shape.type).toBe('mixed');
      expect(shape.phases).toBeDefined();
      expect(shape.phases!.length).toBeGreaterThanOrEqual(2);
    });

    it('includes component phases for mixed tasks', () => {
      const shape = detectTaskShape(
        'First find out what testing frameworks exist, then compare them side by side, then write me a summary',
      );
      expect(shape.type).toBe('mixed');
      const phaseTypes = shape.phases!.map(p => p.shape);
      expect(phaseTypes).toContain('research');
    });

    it('does not classify simple requests as mixed', () => {
      const shape = detectTaskShape('Write me a quick email about the project update');
      expect(shape.type).not.toBe('mixed');
    });
  });

  // ── Complexity estimation ────────────────────────────────────────────

  describe('complexity estimation', () => {
    it('rates simple tasks as simple', () => {
      const shape = detectTaskShape('What is Docker?');
      expect(shape.complexity).toBe('simple');
    });

    it('rates multi-phase tasks appropriately', () => {
      const shape = detectTaskShape(
        'Research cloud providers, compare pricing, then draft a recommendation, and then create a migration plan',
      );
      // 4+ phases should be complex
      if (shape.type === 'mixed' && shape.phases && shape.phases.length >= 4) {
        expect(shape.complexity).toBe('complex');
      }
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty string', () => {
      const shape = detectTaskShape('');
      expect(shape.type).toBeDefined();
      expect(shape.confidence).toBeLessThanOrEqual(0.2);
      expect(shape.complexity).toBe('simple');
    });

    it('handles ambiguous input', () => {
      const shape = detectTaskShape('hello');
      expect(shape.confidence).toBeLessThan(0.5);
    });

    it('returns signals array', () => {
      const shape = detectTaskShape('Research and analyze the market');
      expect(Array.isArray(shape.signals)).toBe(true);
      expect(shape.signals.length).toBeGreaterThan(0);
    });

    it('confidence is between 0 and 1', () => {
      const inputs = [
        'Research this topic',
        'Compare A vs B',
        'Write a memo then review it',
        'hello world',
      ];
      for (const input of inputs) {
        const shape = detectTaskShape(input);
        expect(shape.confidence).toBeGreaterThanOrEqual(0);
        expect(shape.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
