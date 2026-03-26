import type { MessageType, MessageSubtype } from '@waggle/shared';

// Valid type-subtype combinations for the Waggle Dance protocol
const VALID_COMBINATIONS: Record<MessageType, MessageSubtype[]> = {
  request: ['knowledge_check', 'task_delegation', 'skill_request', 'model_recommendation'],
  response: ['knowledge_match', 'task_claim'],
  broadcast: ['discovery', 'routed_share', 'skill_share', 'model_recipe'],
};

export function validateMessageTypeCombo(type: MessageType, subtype: MessageSubtype): boolean {
  return VALID_COMBINATIONS[type]?.includes(subtype) ?? false;
}

export function isRoutedMessage(subtype: MessageSubtype): boolean {
  return subtype === 'routed_share';
}
