/**
 * Claude Adapter — parse Claude web/desktop JSON export into UniversalImportItems.
 *
 * Claude export contains conversations with chat_messages array,
 * plus project knowledge and artifacts.
 */

import { randomUUID } from 'node:crypto';
import type { SourceAdapter, UniversalImportItem, ConversationMessage } from './types.js';
import { asRecord, firstString, getArray, getString, type RawRecord } from './raw-types.js';

export class ClaudeAdapter implements SourceAdapter {
  readonly sourceType = 'claude' as const;
  readonly displayName = 'Claude';

  parse(input: unknown): UniversalImportItem[] {
    const root = asRecord(input);
    const conversations = Array.isArray(input) ? input : root && getArray(root, 'conversations');
    if (!Array.isArray(conversations)) return [];

    const items: UniversalImportItem[] = [];

    for (const rawConv of conversations) {
      const conv = asRecord(rawConv);
      if (!conv) continue;
      const title = firstString(conv, 'name', 'title') || 'Untitled';
      const messages: ConversationMessage[] = [];

      const chatMessages = getArray(conv, 'chat_messages') ?? getArray(conv, 'messages') ?? [];
      for (const rawMsg of chatMessages) {
        const msg = asRecord(rawMsg);
        if (!msg) continue;
        const role = (getString(msg, 'sender') === 'human' || getString(msg, 'role') === 'user')
          ? 'user' as const
          : 'assistant' as const;

        // Handle content blocks (Claude format)
        let text: string;
        const blocks = getArray(msg, 'content');
        if (blocks) {
          text = blocks
            .map(asRecord)
            .filter((b): b is RawRecord => b !== null && b.type === 'text')
            .map(b => getString(b, 'text') ?? '')
            .join('\n')
            .trim();
        } else {
          text = (getString(msg, 'text') ?? getString(msg, 'content') ?? '').trim();
        }

        // W4.4 (caption parity): Claude exports carry message-level
        // `attachments` (with extracted_content — text already extracted
        // from images/docs) and `files` arrays; both were never accessed.
        const extras: string[] = [];
        for (const key of ['attachments', 'files'] as const) {
          for (const rawAtt of getArray(msg, key) ?? []) {
            const att = asRecord(rawAtt);
            if (!att) continue;
            const name = getString(att, 'file_name') ?? getString(att, 'name');
            const extracted = getString(att, 'extracted_content');
            if (extracted && extracted.trim()) {
              extras.push(`[Attached: ${name ?? 'file'}] ${extracted.trim().slice(0, 500)}`);
            } else if (name) {
              extras.push(`[Shared file: ${name}]`);
            }
          }
        }
        if (extras.length > 0) text = [text, ...extras].filter(Boolean).join('\n').trim();
        if (!text) continue;

        messages.push({
          role,
          text,
          timestamp: getString(msg, 'created_at') ?? getString(msg, 'timestamp'),
        });
      }

      if (messages.length === 0) continue;

      items.push({
        id: randomUUID(),
        source: 'claude',
        type: 'conversation',
        title,
        content: messages.map(m => `${m.role}: ${m.text}`).join('\n\n'),
        messages,
        timestamp: firstString(conv, 'created_at', 'create_time') ?? new Date().toISOString(),
        metadata: {
          conversationId: firstString(conv, 'uuid', 'id'),
          messageCount: messages.length,
          projectId: getString(conv, 'project_uuid') ?? undefined,
        },
      });
    }

    // Extract project knowledge files if present
    const projects = root && getArray(root, 'projects');
    if (projects) {
      for (const rawProject of projects) {
        const project = asRecord(rawProject);
        const docs = project && getArray(project, 'docs');
        if (!docs) continue;
        for (const rawDoc of docs) {
          const doc = asRecord(rawDoc);
          if (!doc) continue;
          items.push({
            id: randomUUID(),
            source: 'claude',
            type: 'artifact',
            title: firstString(doc, 'filename', 'title') ?? 'Project Document',
            content: getString(doc, 'content') ?? '',
            timestamp: getString(doc, 'created_at') ?? new Date().toISOString(),
            metadata: { projectName: getString(project, 'name'), type: 'project_knowledge' },
          });
        }
      }
    }

    return items;
  }
}
