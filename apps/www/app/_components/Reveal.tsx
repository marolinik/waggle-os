'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

interface RevealProps {
  readonly children: ReactNode;
  /** Stagger slot 1–5 → transition-delay 60ms steps (see globals.css). */
  readonly delay?: 1 | 2 | 3 | 4 | 5;
  readonly as?: 'div' | 'section' | 'li' | 'span';
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Scroll-reveal wrapper: fades + lifts children in when they enter the
 * viewport. Purely presentational — content is in the DOM at SSR (SEO-safe)
 * and `prefers-reduced-motion` disables the effect entirely via globals.css.
 */
export default function Reveal({
  children,
  delay,
  as: Tag = 'div',
  className,
  style,
}: RevealProps) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const classes = [
    'reveal',
    visible ? 'is-visible' : '',
    delay ? `reveal-d${delay}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag ref={setNode} className={classes} style={style}>
      {children}
    </Tag>
  );
}
