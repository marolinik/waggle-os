// Root flat ESLint config — repo-wide gate for `npm run lint` (`eslint .`).
// Scope: PRODUCT TypeScript source (packages/*/src + tests, sidecar). apps/web
// and apps/www carry their own eslint.config.js (run from their dirs). Bundled
// assets (resources/service.js), scratch scripts, benchmarks, and generated
// output are excluded — linting them is noise, not product signal.
// Rule set: @eslint/js recommended + typescript-eslint recommended (the chosen
// baseline). High-volume stylistic/legacy rules are "warn" so the gate is
// FUNCTIONAL (runs + exits 0 on zero errors) without a fix marathon; genuine-bug
// rules stay "error". Tighten severities incrementally over time.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/.next/**",
      "**/gen/**",
      "**/target/**",
      "**/.vite/**",
      "**/resources/**", // bundled sidecar (service.js) + native assets
      ".scratch/**",
      ".planning/**",
      ".mind/**",
      "benchmarks/**", // research scripts, not shipped product
      "external/**", // vendored third-party (gitignored — e.g. meta-agents-research-environments)
      "cowork/**",
      "docs/**",
      "scripts/**", // root build/bundle tooling
      "apps/web/**", // own eslint.config.js
      "apps/www/**", // own eslint.config.js
      "**/*.config.{js,ts,mjs,cjs}",
      "**/vitest.setup.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"], // product TypeScript source only
    plugins: {
      // Register react-hooks so inline `// eslint-disable react-hooks/*` comments
      // in .tsx files resolve (otherwise ESLint errors on the unknown rule). Both
      // rules are "warn" — real hook issues surface as documented tech debt, not
      // gate-blocking errors. (Plugin is hoisted to root node_modules via apps/web.)
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // RATCHET (lint-debt burndown): 937 no-explicit-any -> 210, all now in
      // packages/server. Every rule below is at 0 occurrences repo-wide, so they
      // are promoted warn->error to LOCK IN the burndown against regression.
      // packages/server keeps its residual rule-types at "warn" via the override below.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": "off", // intentionally off (noisy in a large TS codebase)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-this-alias": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      "no-empty": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-control-regex": "error",
      "no-useless-escape": "error",
      "no-case-declarations": "error",
      "no-prototype-builtins": "error",
    },
  },
  // (packages/server override removed — its 210 no-explicit-any + 3 tail warnings
  // were burned down to 0, so it is now ratcheted to "error" repo-wide like everything
  // else. The whole repo is at 0 lint errors AND 0 warnings under this config.)
);
