import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

vi.mock('next/font/google', () => ({
  Hanken_Grotesk: () => ({ variable: '__font_hanken' }),
  JetBrains_Mono: () => ({ variable: '__font_mono' }),
}));

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(async () => 'en'),
  getMessages: vi.fn(async () => ({})),
}));

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@clerk/themes', () => ({
  dark: {},
}));

import RootLayout from '../app/layout';

describe('RootLayout', () => {
  it('keeps the progressive-enhancement js class as an intentional hydration mismatch', async () => {
    const tree = (await RootLayout({
      children: <main>content</main>,
    })) as ReactElement<{
      className: string;
      suppressHydrationWarning?: boolean;
      children: ReactNode;
    }>;

    expect(tree.type).toBe('html');
    expect(tree.props.className).toBe('scroll-smooth __font_hanken __font_mono');
    expect(tree.props.className).not.toContain(' js');
    expect(tree.props.suppressHydrationWarning).toBe(true);
  });
});
