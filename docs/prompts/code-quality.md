# Code quality review

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: `git diff main...HEAD`)

Review against the standards in `.cursor/rules/code-quality.mdc`, `typescript-conventions.mdc`, and `domain-model.mdc` (read them first; do not restate them). Do not edit code.

## Check

- **Simplicity** — abstractions with fewer than 2 call sites, helpers for one-shot logic, speculative options/flags, validation for impossible cases, fallbacks that mask errors.
- **Structure** — files past ~300 lines, functions doing several jobs, barrel re-exports, dependency direction violations (core must not import UI/adapters), side effects buried in domain logic.
- **Naming** — generic names (`data`, `item`, `manager`, `util`) where a domain term exists; synonyms for Finding / Requirement / Remediation / Evidence; names that lie about behavior.
- **Types** — `any`, `as` casts silencing the compiler, non-null `!`, loosely typed Zod/DB boundaries, missing discriminated unions, missing exhaustive `switch` + `never`.
- **Hygiene** — dead or commented-out code, stray `console.log`, empty `catch`, narration comments ("what" instead of "why"), TODOs without owner or ticket.
- **Tests** — colocated `*.test.ts(x)`, behavior not implementation, accessible-role queries, status transitions covered.
- **Consistency** — does the change look like its neighbors (error style, result types, `action-state.ts`, `useActionToast`, shared page primitives)? Prefer extending the canonical implementation over a parallel one.
- **Gate honesty** — no new lint-disable, `@ts-expect-error`, skipped test, or loosened `tsconfig`.

## Output

```text
[MUST|SHOULD|NIT] path/file.ts:LINE — issue (rule or principle it breaks)
  Fix: smallest change
```

Group by file, MUST first. End with a one-line verdict: ship / ship after MUSTs / rework. Don't flag formatting that Prettier or ESLint already enforce.
