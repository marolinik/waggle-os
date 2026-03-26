/**
 * ThemeProvider — React context for dark/light theme.
 *
 * Provides `{ theme, toggleTheme }` via context.
 * Adds `data-theme` attribute to document root.
 * Persists preference to localStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'waggle-theme';

/**
 * Read saved theme from localStorage (pure function, extractable for testing).
 */
export function getSavedTheme(storage?: Storage): Theme {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage unavailable (SSR, etc.)
  }
  return 'dark';
}

/**
 * Get the opposite theme (pure function, extractable for testing).
 */
export function toggleThemeValue(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme ?? getSavedTheme());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => toggleThemeValue(prev));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
