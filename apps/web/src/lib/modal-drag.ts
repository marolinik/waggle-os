/**
 * Drag-constraint helper for modals that need to be repositionable
 * without drifting off-screen.
 *
 * P15 · Create-template modal drag handle. framer-motion's
 * `dragConstraints` takes `{ top, left, right, bottom }` as pixel
 * offsets from the initial position. For a centered modal that means
 * symmetric constraints bounded by the container/modal size gap.
 */

export interface DragConstraints {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/**
 * Compute framer-motion drag constraints for a centered modal.
 *
 * Assumes the modal starts centered inside the container (e.g. via
 * `flex items-center justify-center` on the backdrop). Returns the
 * maximum offsets in each direction that keep the modal fully inside
 * the container, so the user can't drag its header off-screen and
 * lose the handle.
 *
 * @param containerWidth  Viewport (or backdrop) width in px.
 * @param containerHeight Viewport height in px.
 * @param modalWidth      Rendered modal width in px.
 * @param modalHeight     Rendered modal height in px.
 */
export function computeDragConstraints(
  containerWidth: number,
  containerHeight: number,
  modalWidth: number,
  modalHeight: number,
): DragConstraints {
  const horizontalPad = Math.max(0, (containerWidth - modalWidth) / 2);
  const verticalPad = Math.max(0, (containerHeight - modalHeight) / 2);
  // Normalise -0 to +0 so deep-equal checks don't trip on the sign bit.
  return {
    left: horizontalPad === 0 ? 0 : -horizontalPad,
    right: horizontalPad,
    top: verticalPad === 0 ? 0 : -verticalPad,
    bottom: verticalPad,
  };
}
