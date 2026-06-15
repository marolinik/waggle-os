import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Warm-Hive theme provider.
 *
 * Owns the single source of truth for the app's theme: the `data-theme`
 * attribute on `<html>` (`light` = warm paper; absent = warm graphite / dark,
 * matching the design CSS `:root` vs `:root[data-theme="light"]` selectors) plus
 * the persisted user choice in `localStorage['waggle-theme']`.
 *
 * Replaces the previous ad-hoc theme plumbing (boot snippet in App.tsx + inline
 * toggle in SettingsApp + scattered DOM writes). Readers that only need the
 * resolved value can keep using `useIsLightTheme()` — it reactively observes the
 * same `data-theme` attribute this provider writes.
 */

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  /** The user's chosen mode (may be "system"). */
  theme: ThemeMode;
  /** The actual applied theme after resolving "system". */
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
  /** Convenience flip between light and dark (resolves "system" first). */
  toggleTheme: () => void;
}

const STORAGE_KEY = "waggle-theme";

// Default context value. Lets `useTheme()` work without a wrapping provider —
// e.g. isolated unit tests that render a single app (SettingsApp) outside the
// full provider tree, mirroring SettingsApp's previous standalone behaviour.
// Reads are live (getters re-read the DOM/storage on access); writes still apply
// to `data-theme` + localStorage. Inside <ThemeProvider>, the reactive value
// below takes over and re-renders consumers on change.
const standaloneTheme: ThemeContextValue = {
  get theme() {
    return readStored();
  },
  get resolvedTheme() {
    return resolve(readStored());
  },
  setTheme(mode) {
    applyTheme(resolve(mode));
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* storage disabled — non-fatal */
    }
  },
  toggleTheme() {
    const next: ResolvedTheme = resolve(readStored()) === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage disabled — non-fatal */
    }
  },
};

const ThemeContext = createContext<ThemeContextValue>(standaloneTheme);

function readStored(): ThemeMode {
  if (typeof localStorage === "undefined") return "dark";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "dark";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}

/**
 * Apply the persisted theme synchronously, before React mounts, to avoid a
 * flash of the wrong theme on load. Call once from `main.tsx` ahead of
 * `createRoot(...).render()`.
 */
export function applyStoredThemeEarly(): void {
  applyTheme(resolve(readStored()));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readStored);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolve(readStored()),
  );

  // Apply + persist whenever the chosen mode changes. useLayoutEffect runs
  // before paint, so the first render after a toggle is never the old theme.
  useLayoutEffect(() => {
    const r = resolve(theme);
    setResolvedTheme(r);
    applyTheme(r);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private mode / storage disabled — non-fatal, theme still applies */
    }
  }, [theme]);

  // In "system" mode, follow OS preference changes live.
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: ResolvedTheme = mql.matches ? "dark" : "light";
      setResolvedTheme(r);
      applyTheme(r);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => setThemeState(mode), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (resolve(prev) === "light" ? "dark" : "light")),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
