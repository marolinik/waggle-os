import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// React/Vite tests load a Next.js dependency chain that still imports Node's
// deprecated built-in `punycode`; propagate the narrow suppression to Vitest
// workers so expected upstream noise does not hide real test failures.
if (!process.env.NODE_OPTIONS?.includes('--disable-warning=DEP0040')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --disable-warning=DEP0040`.trim();
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // jsdom environment setup is heavy (~3s/file); under full parallel load the
    // event loop starves and render-heavy waitFor/findBy assertions overran the
    // default 5s timeout intermittently (every observed failure was a timeout,
    // and the failing set varied run-to-run — classic load flakiness, not logic:
    // the same tests pass sub-second in isolation). Give generous headroom so the
    // suite is deterministic in CI, plus one retry to absorb transient spikes.
    testTimeout: 20000,
    hookTimeout: 20000,
    retry: 1,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
