import { describe, it, expect } from 'vitest';
import { processInteractionForImprovement } from '../src/improvement-wiring.js';

describe('improvement-wiring', () => {
  const baseParams = {
    workspaceId: 'ws-1',
    sessionId: 'sess-1',
    toolsUsed: [],
    agentResponse: 'Here is the result.',
    userMessage: '',
  };

  // ── Correction detection ─────────────────────────────────────

  describe('correction detection', () => {
    it('detects corrections in user messages', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: "No, that's wrong. I told you to use bullet points, not paragraphs.",
      });
      expect(result.wasCorrection).toBe(true);
      expect(result.correctionDetail).toBeDefined();
      expect(result.correctionDetail!.length).toBeGreaterThan(0);
    });

    it('returns wasCorrection false for normal messages', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Can you help me write a function to sort an array?',
      });
      expect(result.wasCorrection).toBe(false);
      expect(result.correctionDetail).toBeUndefined();
    });

    it('returns wasCorrection false for very short messages', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'ok',
      });
      expect(result.wasCorrection).toBe(false);
    });

    it('detects "I said" corrections', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'I said to use markdown headers, not plain text.',
      });
      expect(result.wasCorrection).toBe(true);
    });

    it('detects "actually instead use" corrections', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Actually, instead use TypeScript for this module.',
      });
      expect(result.wasCorrection).toBe(true);
    });
  });

  // ── Capability gap detection ─────────────────────────────────

  describe('capability gap detection', () => {
    it('identifies capability gaps from tool-not-found in response', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Read this PDF for me.',
        agentResponse: 'Tool "pdf_reader" not found. I cannot read PDFs directly.',
      });
      expect(result.capabilityGap).toBe('pdf_reader');
    });

    it('identifies capability gaps from "I don\'t have a tool" in response', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Can you send this to Slack?',
        agentResponse: "I don't have a tool for sending Slack messages.",
      });
      expect(result.capabilityGap).toBe('sending Slack messages');
    });

    it('identifies gaps from user requesting integration', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Can you send to Slack the summary?',
        agentResponse: 'Let me try to do that.',
        toolsUsed: [],
      });
      expect(result.capabilityGap).toBe('slack');
    });

    it('returns no gap for normal interactions', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'What is the weather today?',
        agentResponse: 'The weather today is sunny and 72F.',
      });
      expect(result.capabilityGap).toBeUndefined();
    });
  });

  // ── Workflow pattern detection ───────────────────────────────

  describe('workflow pattern detection', () => {
    it('detects multi-step workflow patterns with "then"', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'First research the competitors, then compare their features, then draft a summary report.',
      });
      expect(result.workflowPattern).toBeDefined();
    });

    it('does not flag single-step requests as workflow patterns', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Write a summary of this document.',
      });
      expect(result.workflowPattern).toBeUndefined();
    });

    it('returns undefined for simple questions', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'What is the status of the project?',
      });
      expect(result.workflowPattern).toBeUndefined();
    });
  });

  // ── Combined signals ─────────────────────────────────────────

  describe('combined signals', () => {
    it('can detect correction and gap simultaneously', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: "No, that's wrong. I told you to use the Jira tool.",
        agentResponse: 'Tool "jira_create" not found.',
      });
      expect(result.wasCorrection).toBe(true);
      expect(result.capabilityGap).toBe('jira_create');
    });

    it('returns all-false for benign exchange', () => {
      const result = processInteractionForImprovement({
        ...baseParams,
        userMessage: 'Thanks, that looks great!',
        agentResponse: "You're welcome! Let me know if you need anything else.",
      });
      expect(result.wasCorrection).toBe(false);
      expect(result.capabilityGap).toBeUndefined();
      expect(result.workflowPattern).toBeUndefined();
    });
  });
});
