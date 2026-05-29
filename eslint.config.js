// Root ESLint flat config — repo-wide lint gate.
//
// Phase 0 (gate repair): before this file, `npm run lint` (`eslint .`) aborted under ESLint 9
// flat-config mode with NO root config — linting zero files and giving the CI lint gate zero
// signal. This config makes `eslint .` lint every workspace.
//
// Design notes:
//   - Syntactic + `recommended` rules only. Type-aware linting (parserOptions.project) is
//     intentionally NOT enabled: it would require every workspace tsconfig wired and run ~10x
//     slower. Phase 0 wants a fast, functional gate; type errors are already covered by the
//     `build:packages` (tsc --build) and `build`/`tauri-tsc` gates.
//   - High-frequency stylistic rules are set to `warn` (not `error`) so the gate is
//     green-with-signal on first adoption rather than a blocking wall of pre-existing findings.
//     Ratchet `warn` -> `error` over subsequent phases. See PRODUCTION-PLAN Phase 0 exit gate.
//   - Mirrors apps/web/eslint.config.js (same plugins/levels) so behavior is consistent whether
//     run from root or inside apps/web.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    // Generated, vendored, and non-source paths — never lint these.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vite/**",
      "playwright-report/**",
      "test-results/**",
      "external/**",
      ".workspace/**",
      ".scratch/**",
      ".planning/**",
      "tmp/**",
      "benchmarks/**/runs/**",
      "benchmarks/**/data/**",
      "gepa-phase-5/**",
      "**/*.min.js",
      "**/*.d.ts",
    ],
  },

  // Base: all TypeScript across the monorepo.
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-this-alias": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-control-regex": "off",
      "no-case-declarations": "warn",
      "prefer-const": "warn",
      // --- Phase-0 adoption baseline (pre-existing findings, kept VISIBLE as warnings) ---
      // Ratchet these back to "error" after triage. Priority review item:
      //   no-fallthrough @ packages/hive-mind-cli/src/dispatch.ts:154 (possible real bug).
      // Do NOT blindly auto-fix no-misleading-character-class — those regexes are in the
      // marketplace SecurityGate (security.ts:904) and agent quality-controller (:17) and are
      // likely intentional (emoji / combined-char matching); changing them can break detection.
      "no-misleading-character-class": "warn",
      "no-fallthrough": "warn",
      "no-constant-binary-expression": "warn",
      "no-useless-catch": "warn",
    },
  },

  // React surface (apps/web only — app/ TS is build tooling, not components).
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Tests + build tooling: Node env, relaxed expression rule for assertion styles.
  {
    files: [
      "**/*.{test,spec}.{ts,tsx}",
      "**/tests/**/*.{ts,tsx}",
      "scripts/**/*.{ts,js,mjs}",
      "**/scripts/**/*.{ts,js,mjs}",
      "**/*.config.{ts,js,mjs,cts,mts}",
    ],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
);