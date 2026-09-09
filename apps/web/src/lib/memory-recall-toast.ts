import type { ChatMessage, MemoryContextReceipt } from './types';

export interface MemoryRecallNotice {
  title: string;
  description: string;
}

export interface PendingMemoryRecallNotice {
  receipt: MemoryContextReceipt;
  notice: MemoryRecallNotice;
}

/**
 * Accept only the terminal server receipt that proves saved memory passed the
 * recall safety gate and entered this assistant turn's model context.
 */
export function normalizeMemoryContextReceipt(
  value: unknown,
  receiptId: string,
): MemoryContextReceipt | undefined {
  if (!value || typeof value !== 'object' || !receiptId) return undefined;
  const candidate = value as { included?: unknown; count?: unknown };
  if (candidate.included !== true) return undefined;
  if (!Number.isSafeInteger(candidate.count) || (candidate.count as number) <= 0) return undefined;
  return {
    included: true,
    count: candidate.count as number,
    live: true,
    receiptId,
  };
}

/**
 * Build calm, content-free delight from a real accepted receipt. Callers own
 * the seen set so rerenders and session revisits never replay the notice.
 */
export function createMemoryRecallNotice(
  receipt: MemoryContextReceipt | undefined,
  seenReceiptIds: ReadonlySet<string>,
): MemoryRecallNotice | null {
  if (!receipt || receipt.included !== true || receipt.live !== true) return null;
  if (!Number.isSafeInteger(receipt.count) || receipt.count <= 0 || !receipt.receiptId) return null;
  if (seenReceiptIds.has(receipt.receiptId)) return null;
  return {
    title: 'Memory brought forward',
    description: `Used ${receipt.count} relevant saved item${receipt.count === 1 ? '' : 's'} for this reply.`,
  };
}

export function findNewestMemoryRecallNotice(
  messages: readonly ChatMessage[],
  seenReceiptIds: ReadonlySet<string>,
): PendingMemoryRecallNotice | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || !message.memoryContext) continue;
    const notice = createMemoryRecallNotice(message.memoryContext, seenReceiptIds);
    return notice ? { receipt: message.memoryContext, notice } : null;
  }
  return null;
}

/**
 * Live receipts are an ephemeral UI signal, not chat history. Strip them before
 * caching so returning to a settled thread restores the conversation without
 * replaying an old "memory used" notice.
 */
export function stripLiveMemoryReceipts(messages: readonly ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (!message.memoryContext) return message;
    const { memoryContext: _memoryContext, ...rest } = message;
    return rest;
  });
}
