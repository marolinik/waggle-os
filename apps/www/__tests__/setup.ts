import '@testing-library/jest-dom';

/**
 * jsdom does not implement `matchMedia`; our component queries
 * `prefers-reduced-motion` via plain CSS, but consumer code using matchMedia
 * (existing `Pricing` component paths, etc.) still needs a shim during tests.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
