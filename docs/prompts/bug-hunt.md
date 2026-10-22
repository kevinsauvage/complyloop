# Bug hunt

**Mode:** read-only · **Scope:** `{{SCOPE}}` (module, directory, or `git diff main...HEAD`)

Find latent defects in the scope. Do not edit code. Trace real execution paths; a bug you cannot walk through with concrete inputs is not a finding.

## Look for

- **Logic** — off-by-one, inverted conditions, wrong operator, unhandled `null`/`undefined`/empty array, wrong default, mutation of shared input.
- **State machines** — status transitions that skip a guard, non-exhaustive `switch` (no `never` default), impossible states representable in types.
- **Async** — missing `await`, unhandled rejections, races between read-then-write, double-submit, non-idempotent retries (jobs run via `repository_dispatch` + schedule backstop, so every job must tolerate re-delivery).
- **Persistence** — missing transaction, stale-write overwrite, N+1 hiding a correctness issue, pagination that skips or duplicates rows, timezone/date boundary errors.
- **Error handling** — swallowed errors, empty `catch`, catch-and-continue that corrupts state, errors that lose context.
- **Boundaries** — unvalidated external input (user, GitHub payloads, AI output, scanned repo content); trusting client-provided ids or counts.
- **Next.js 16 / React 19** — stale cache or revalidation gaps after mutations, server/client serialization mistakes, effects with wrong deps, key misuse. Check `node_modules/next/dist/docs/` before asserting framework behavior.
- **Tests that lie** — assertions that cannot fail, mocks that hide the bug, snapshot noise.

## Method

1. Read the scope, then callers and callees one hop out (`graft callers <symbol>`).
2. For each suspect, write the failing input and expected vs. actual result.
3. Check whether a test already covers it; if not, name the test that would.

## Output

Ranked list:

```text
[SEVERITY] path/file.ts:LINE — one-line defect
  Repro: concrete input/state → wrong output/crash
  Why it holds: the code path, in 1–3 lines
  Fix: minimal direction · Test: the case to add
```

Mark confidence `CONFIRMED` (traced) or `PLAUSIBLE` (needs runtime check). No findings is a valid answer.
