/**
 * Reports the content-box width of a DOM element via ResizeObserver.
 *
 * Returns `null` until the first observation fires so consumers can
 * distinguish "not measured yet" from "0 px wide" and avoid layout
 * thrash on mount.
 */
import { useEffect, useState, type RefObject } from 'react';

export function useContainerWidth<T extends HTMLElement>(ref: RefObject<T>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof ResizeObserver === 'undefined') {
      // Fallback for non-browser / SSR contexts — measure once on mount.
      setWidth(element.clientWidth);
      return;
    }
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(element);
    // Seed with the current width so consumers see a value on the next
    // render rather than waiting for the first resize event.
    setWidth(element.clientWidth);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
