/**
 * Turn Recalled Context — what one chat turn recalled, and where it goes.
 *
 * A turn can adopt two kinds of recalled context: saved memory from automatic
 * recall, and recent workspace sessions for a catch-up request. Each is adopted
 * only after it passed the injection scan. The adopted text then feeds four
 * readers: the PromptAssembler input, the static system-prompt tail, the
 * grounding guard, and the `done` receipt. Before this module that was four
 * hoisted mutable variables inside the `POST /api/chat` closure, two of them
 * the same recall text with and without its blank-line prefix.
 *
 * Replace Method with Method Object applied to that cluster (TD-CHAT-3). It
 * imports nothing.
 *
 * Invariants the route relied on implicitly and this module now states:
 *  - The assembler gets the recall text unprefixed; the static prompt gets it
 *    blank-line separated. When the assembler ran, the recall block is already
 *    inside the assembled prompt, and appending it again would inject every
 *    recalled memory twice (W4.5).
 *  - The receipt reports memory as included only when a recall was adopted. An
 *    empty, failed or safety-dropped lookup never reaches it.
 *  - Grounding evidence is the recalled memory plus the workspace sessions plus
 *    the user's own message. With neither kind of context adopted, the guard has
 *    nothing to check a reply against and stays silent.
 */

/** Content-free proof of whether saved memory entered the turn's model context. */
export type MemoryContextReceipt = { included: boolean; count: number };

export class TurnRecalledContext {
  private recalledText = '';
  private recalledBlock = '';
  private workspaceSessionBlock = '';
  private memoryReceipt: MemoryContextReceipt = { included: false, count: 0 };

  /** Adopt a memory recall that passed the injection scan. */
  adoptRecall(text: string, count: number): void {
    this.recalledBlock = '\n\n' + text;
    this.recalledText = text;
    this.memoryReceipt = { included: true, count };
  }

  /** Adopt recent workspace-session context that passed the injection scan. */
  adoptWorkspaceSessions(text: string): void {
    this.workspaceSessionBlock = `\n\n${text}`;
  }

  /** The recall text for the PromptAssembler, unprefixed; empty when none was adopted. */
  get assemblerText(): string {
    return this.recalledText;
  }

  /** What the static system prompt appends. The recall block is left out when the assembler already holds it. */
  staticPromptTail(assemblerRan: boolean): string {
    return (assemblerRan ? '' : this.recalledBlock) + this.workspaceSessionBlock;
  }

  /** True when any recalled context was adopted, so a reply can be grounded against it. */
  get hasGroundingEvidence(): boolean {
    return Boolean(this.recalledBlock || this.workspaceSessionBlock);
  }

  /** Everything a reply may be grounded in: the adopted context plus the user's message. */
  groundingEvidence(message: string): string {
    return this.recalledBlock + this.workspaceSessionBlock + '\n' + message;
  }

  get receipt(): MemoryContextReceipt {
    return this.memoryReceipt;
  }
}
