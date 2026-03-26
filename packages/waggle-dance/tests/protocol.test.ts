import { describe, it, expect } from 'vitest';
import { validateMessageTypeCombo, isRoutedMessage } from '../src/protocol.js';

describe('Waggle Dance protocol', () => {
  describe('validateMessageTypeCombo', () => {
    it('validates correct request subtypes', () => {
      expect(validateMessageTypeCombo('request', 'knowledge_check')).toBe(true);
      expect(validateMessageTypeCombo('request', 'task_delegation')).toBe(true);
      expect(validateMessageTypeCombo('request', 'skill_request')).toBe(true);
      expect(validateMessageTypeCombo('request', 'model_recommendation')).toBe(true);
    });

    it('validates correct response subtypes', () => {
      expect(validateMessageTypeCombo('response', 'knowledge_match')).toBe(true);
      expect(validateMessageTypeCombo('response', 'task_claim')).toBe(true);
    });

    it('validates correct broadcast subtypes', () => {
      expect(validateMessageTypeCombo('broadcast', 'discovery')).toBe(true);
      expect(validateMessageTypeCombo('broadcast', 'routed_share')).toBe(true);
      expect(validateMessageTypeCombo('broadcast', 'skill_share')).toBe(true);
      expect(validateMessageTypeCombo('broadcast', 'model_recipe')).toBe(true);
    });

    it('rejects invalid type-subtype combinations', () => {
      expect(validateMessageTypeCombo('request', 'discovery')).toBe(false);
      expect(validateMessageTypeCombo('broadcast', 'knowledge_check')).toBe(false);
      expect(validateMessageTypeCombo('response', 'skill_share')).toBe(false);
      expect(validateMessageTypeCombo('request', 'task_claim')).toBe(false);
    });

    it('rejects completely invalid types', () => {
      expect(validateMessageTypeCombo('invalid' as any, 'discovery')).toBe(false);
    });

    it('rejects completely invalid subtypes', () => {
      expect(validateMessageTypeCombo('request', 'invalid' as any)).toBe(false);
    });
  });

  describe('isRoutedMessage', () => {
    it('identifies routed_share as routed', () => {
      expect(isRoutedMessage('routed_share')).toBe(true);
    });

    it('identifies non-routed subtypes', () => {
      expect(isRoutedMessage('discovery')).toBe(false);
      expect(isRoutedMessage('knowledge_check')).toBe(false);
      expect(isRoutedMessage('task_claim')).toBe(false);
      expect(isRoutedMessage('skill_share')).toBe(false);
      expect(isRoutedMessage('model_recipe')).toBe(false);
    });
  });
});
