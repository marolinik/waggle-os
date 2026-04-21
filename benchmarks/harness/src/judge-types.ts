/**
 * Harness-local mirror of the public surface of
 * `packages/server/src/benchmarks/judge/failure-mode-judge.ts`.
 *
 * Why a mirror: the harness tsconfig has `rootDir: "src"` and the judge
 * module lives in a sibling workspace, so direct `import from '../../../…'`
 * trips TS6059 ("File is not under rootDir"). Declaring the narrow
 * interface surface here keeps TypeScript honest at build time while
 * runtime imports still resolve against the real server module via the
 * `.js` extension convention (vite-node / tsx follow the symlink to the
 * .ts source).
 *
 * Keep this file in sync with the canonical definitions — if a new field
 * or method is added there, mirror it here. The mirror carries only the
 * types the harness imports; it intentionally does not re-export the
 * concrete classes (JudgeParseError) or functions (judgeAnswer,
 * judgeEnsemble) — those come from the real module at runtime.
 */

export type FailureMode = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
export type Verdict = 'correct' | 'incorrect';

export interface JudgeResult {
  verdict: Verdict;
  failure_mode: null | FailureMode;
  rationale: string;
  judge_model: string;
}

export interface LlmClient {
  complete(prompt: string): Promise<string>;
}
