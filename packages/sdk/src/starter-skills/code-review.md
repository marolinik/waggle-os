---
permissions:
  fileSystem: true
---

# Code Review — Structured Code Analysis

Perform a thorough, structured code review with actionable feedback organized by priority.

## What to do

When the user shares code or points to files, review systematically across these dimensions:

1. **Correctness** — Does the code do what it claims to do? Check logic errors, off-by-one errors, null/undefined handling, async/await correctness, error propagation.

2. **Edge cases** — What inputs or conditions could break this? Empty arrays, null values, concurrent access, very large inputs, network failures, timeout scenarios.

3. **Naming and clarity** — Are variables, functions, and types named clearly? Could someone unfamiliar with the codebase understand the intent?

4. **Tests** — Are there tests? Do they cover the important paths? Are edge cases tested? Suggest specific test cases that are missing.

5. **Security** — Input validation, injection risks, authentication checks, sensitive data exposure, dependency vulnerabilities.

6. **Performance** — Unnecessary loops, N+1 queries, missing indexes, large allocations, blocking operations in async contexts.

## Output structure

Organize findings by severity:

- **Critical**: Bugs, security issues, data loss risks — must fix
- **Important**: Logic issues, missing error handling, test gaps — should fix
- **Suggestion**: Style improvements, refactoring opportunities, alternative approaches — nice to fix

For each finding:
- **Location**: File and line reference
- **Issue**: What is wrong
- **Fix**: Specific suggestion for how to resolve it

## Guidelines

- Be specific — reference exact lines and provide concrete fix suggestions
- Praise good patterns too, not just problems
- Keep suggestions proportional — do not nitpick style in code with logic bugs
- If the code is solid, say so confidently
