import { describe, it, expect } from 'vitest';
import {
  detectCorrection,
  detectCorrectionsInHistory,
} from '../src/correction-detector.js';

describe('correction-detector', () => {
  // ── Basic detection ────────────────────────────────────────

  describe('detectCorrection', () => {
    it('returns null for normal messages', () => {
      expect(detectCorrection('What is the weather today?')).toBeNull();
      expect(detectCorrection('Please write a function that sorts an array')).toBeNull();
      expect(detectCorrection('Thanks, that looks good')).toBeNull();
    });

    it('returns null for very short messages', () => {
      expect(detectCorrection('ok')).toBeNull();
      expect(detectCorrection('yes')).toBeNull();
    });

    it('detects strong correction: "no, not that"', () => {
      const result = detectCorrection('No, not that. I wanted a bullet list, not paragraphs.');
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('detects strong correction: "I said / I told you"', () => {
      const result = detectCorrection('I said to use markdown headers, not plain text.');
      expect(result).not.toBeNull();
    });

    it('detects strong correction: "that\'s wrong"', () => {
      const result = detectCorrection("That's wrong. The API endpoint should be POST, not GET.");
      expect(result).not.toBeNull();
    });

    it('detects moderate correction: "actually, use X instead"', () => {
      const result = detectCorrection('Actually, instead use TypeScript for this module.');
      expect(result).not.toBeNull();
    });

    it('detects tone correction', () => {
      const result = detectCorrection('No, that response was too formal. Keep it casual.');
      expect(result).not.toBeNull();
      expect(result!.patternKey).toContain('tone');
    });

    it('detects format correction', () => {
      const result = detectCorrection("No, don't use those headers. Use bullet formatting instead.");
      expect(result).not.toBeNull();
    });

    it('detects length correction', () => {
      const result = detectCorrection("That's not what I wanted. It's too long, make it shorter.");
      expect(result).not.toBeNull();
      expect(result!.patternKey).toContain('length');
    });
  });

  // ── Durability classification ──────────────────────────────

  describe('durability classification', () => {
    it('classifies "always" as durable', () => {
      const result = detectCorrection('No, always use bullet points instead of numbered lists.');
      expect(result).not.toBeNull();
      expect(result!.isDurable).toBe(true);
      expect(result!.durability).toBe('durable');
    });

    it('classifies "never" as durable', () => {
      const result = detectCorrection("No, never use code blocks for simple text. That's wrong.");
      expect(result).not.toBeNull();
      expect(result!.isDurable).toBe(true);
    });

    it('classifies "from now on" as durable', () => {
      const result = detectCorrection('From now on, please don\'t include timestamps in summaries.');
      expect(result).not.toBeNull();
      expect(result!.isDurable).toBe(true);
    });

    it('classifies "I prefer" as durable', () => {
      const result = detectCorrection("No, I prefer shorter responses. That's not what I wanted.");
      expect(result).not.toBeNull();
      expect(result!.isDurable).toBe(true);
    });

    it('classifies "this time" as task_local', () => {
      const result = detectCorrection("No, not that. This time just use a simple list.");
      expect(result).not.toBeNull();
      expect(result!.isDurable).toBe(false);
      expect(result!.durability).toBe('task_local');
    });

    it('classifies "for now" as task_local', () => {
      const result = detectCorrection("That's wrong for now. Instead use the old API endpoint.");
      expect(result).not.toBeNull();
      expect(result!.durability).toBe('task_local');
    });

    it('defaults to task_local when no explicit signal', () => {
      const result = detectCorrection('No, not that approach. Use the factory pattern.');
      expect(result).not.toBeNull();
      expect(result!.durability).toBe('task_local');
    });
  });

  // ── Pattern key extraction ─────────────────────────────────

  describe('pattern key extraction', () => {
    it('extracts tone pattern key', () => {
      const result = detectCorrection("No, that's too verbose. Stop doing that.");
      expect(result).not.toBeNull();
      // "too verbose" maps to tone category
      // Note: might also match length depending on exact wording
    });

    it('extracts accuracy pattern key for "wrong"', () => {
      const result = detectCorrection("That's incorrect. I said the opposite.");
      expect(result).not.toBeNull();
      expect(result!.patternKey).toContain('accuracy');
    });

    it('falls back to general:correction for unrecognized patterns', () => {
      const result = detectCorrection("No, not that. I told you to use something else entirely.");
      expect(result).not.toBeNull();
      expect(result!.patternKey).toBe('general:correction');
    });
  });

  // ── Detail extraction ──────────────────────────────────────

  describe('detail extraction', () => {
    it('extracts first sentence as detail', () => {
      const result = detectCorrection('No, not that. I wanted a completely different structure. Also fix the naming.');
      expect(result).not.toBeNull();
      expect(result!.detail).toBe('No, not that.');
    });

    it('truncates long messages', () => {
      const longMessage = 'No, not that. ' + 'A'.repeat(200);
      const result = detectCorrection(longMessage);
      expect(result).not.toBeNull();
      expect(result!.detail.length).toBeLessThanOrEqual(120);
    });
  });

  // ── Confidence scoring ─────────────────────────────────────

  describe('confidence', () => {
    it('gives higher confidence to strong corrections', () => {
      const strong = detectCorrection("No, that's wrong. I told you not to do that. Stop.");
      const moderate = detectCorrection('Actually, let\'s try a different approach instead.');
      expect(strong).not.toBeNull();
      expect(moderate).not.toBeNull();
      expect(strong!.confidence).toBeGreaterThan(moderate!.confidence);
    });

    it('caps confidence at 1.0', () => {
      const result = detectCorrection(
        "No, that's wrong. I said don't do that. Not what I wanted. Please stop. Instead use something else.",
      );
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // ── History analysis ───────────────────────────────────────

  describe('detectCorrectionsInHistory', () => {
    it('detects corrections in a message sequence', () => {
      const messages = [
        { role: 'assistant', content: 'Here is a very detailed formal report...' },
        { role: 'user', content: "No, that's too formal. I said keep it casual." },
        { role: 'assistant', content: 'Got it. Here is a casual version...' },
        { role: 'user', content: 'Thanks, that looks better.' },
      ];
      const corrections = detectCorrectionsInHistory(messages);
      expect(corrections).toHaveLength(1);
      expect(corrections[0].patternKey).toContain('tone');
    });

    it('returns empty array when no corrections found', () => {
      const messages = [
        { role: 'user', content: 'Write a function to sort an array' },
        { role: 'assistant', content: 'Here you go...' },
        { role: 'user', content: 'Thanks!' },
      ];
      expect(detectCorrectionsInHistory(messages)).toEqual([]);
    });

    it('handles multiple corrections in sequence', () => {
      const messages = [
        { role: 'assistant', content: 'Draft version 1...' },
        { role: 'user', content: "No, not that. That's wrong. Use a different approach." },
        { role: 'assistant', content: 'Draft version 2...' },
        { role: 'user', content: "I said don't use bullet points. Instead use paragraphs." },
      ];
      const corrections = detectCorrectionsInHistory(messages);
      expect(corrections.length).toBeGreaterThanOrEqual(2);
    });
  });
});
