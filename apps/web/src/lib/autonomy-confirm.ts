/**
 * F18 — "Never ask" (yolo) confirm-gate decision.
 *
 * The Permissions "Default approval level" radiogroup lets a user pick
 * `yolo` (auto-pass every write/edit/mutating tool call except a hardcoded
 * critical blacklist). Selecting it should carry one-time friction: a
 * confirmation fires only on the TRANSITION into `yolo`, never on the safe
 * levels and never when re-selecting the already-active level.
 *
 * NB: this permissions-approval union (`normal | trusted | yolo`) is a
 * distinct concept from `@waggle/shared`'s agent-lifecycle `AutonomyLevel`
 * (`manual | guided | medium | high`) — keep them separate.
 */

/** Permissions default-approval level for new chat windows. */
export type ApprovalLevel = 'normal' | 'trusted' | 'yolo';

/**
 * Whether switching the default approval level from `current` to `next`
 * requires an explicit confirmation. Only the transition INTO `yolo`
 * ("Never ask") is gated; re-selecting the already-active level or moving
 * to any safer level is friction-free.
 */
export function requiresYoloConfirm(current: ApprovalLevel, next: ApprovalLevel): boolean {
  return next === 'yolo' && current !== 'yolo';
}
