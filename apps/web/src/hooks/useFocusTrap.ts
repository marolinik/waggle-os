import { useEffect, useRef } from 'react';

/**
 * useFocusTrap — WCAG 2.1.1 / 2.4.3 modal focus management.
 *
 * When `active` is true, on the returned container ref:
 *  - moves focus into the dialog on open (the container itself if it is
 *    focusable, else its first tabbable descendant);
 *  - traps Tab / Shift+Tab so focus cycles within the dialog instead of
 *    escaping to the page behind it;
 *  - invokes `onEscape` on the Escape key;
 *  - restores focus to the previously-focused element on close.
 *
 * Single source of focus-trap correctness shared by all modal overlays so the
 * behavior is implemented (and fixed) once.
 */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const isHidden = (el: HTMLElement): boolean => {
      // Skip elements explicitly hidden. Avoid offsetParent (always null in
      // jsdom, and null for position:fixed in real browsers) — use the
      // hidden attribute + aria-hidden, which is reliable in both.
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
      return el.closest('[hidden],[aria-hidden="true"]') !== null && el !== document.activeElement;
    };

    const tabbables = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(el => !isHidden(el));

    // Move focus inside. Prefer the dialog container itself when it is
    // focusable (tabIndex set, incl. the conventional -1 for programmatic
    // focus) so screen readers announce the dialog and Escape is heard even
    // with no focusable children; otherwise focus the first tabbable child.
    const first = tabbables()[0];
    if (typeof container.focus === 'function' && container.hasAttribute('tabindex')) {
      container.focus();
    } else if (first) {
      first.focus();
    } else {
      container.tabIndex = -1;
      container.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = tabbables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === firstEl || !container.contains(current)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (current === lastEl || !container.contains(current)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      // Restore focus to where it was before the modal opened.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, onEscape]);

  return containerRef;
}
