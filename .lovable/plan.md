

## Make App Windows Draggable

### Problem
Windows currently use fixed `defaultPosition` via framer-motion `animate`, so they can't be repositioned by the user.

### Approach
Use framer-motion's built-in `drag` prop on the window container, constrained by a `dragConstraints` ref (the desktop). The title bar acts as the drag handle via `dragListener={false}` on the main div + `dragControls` triggered from the title bar.

### Changes

**`src/components/os/AppWindow.tsx`**
- Add `useState` for `position` (initialized from `defaultPosition`)
- Use `useDragControls` from framer-motion
- Add `drag` prop to `motion.div` with `dragControls`, `dragMomentum={false}`, `dragListener={false}`
- Add `dragConstraints` prop (parent bounds or screen-based object)
- Title bar gets `onPointerDown` to start drag via `dragControls.start()`
- When maximized, disable drag
- Track position via `onDragEnd` to persist position across re-renders
- Remove the `x`/`y`/`top`/`left` from the `animate` prop (use `style` for initial positioning instead, so drag offset works correctly)
- Set `cursor-grab` / `cursor-grabbing` on title bar

