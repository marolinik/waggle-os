import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// Testing-library's findBy*/waitFor use their OWN async timeout (default 1000ms),
// which vitest's testTimeout does NOT govern. Under heavy parallel jsdom load the
// event loop starves and these DOM-polling queries can exceed 1s. Raising the
// ceiling is pure insurance: a passing query still resolves the instant the
// element appears (zero cost on green runs); only a starved query gets more room
// before throwing. Pairs with vitest.config.ts testTimeout/hookTimeout + retry.
configure({ asyncUtilTimeout: 8000 });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
