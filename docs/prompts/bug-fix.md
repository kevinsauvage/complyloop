# Bug fix

**Mode:** edits · **Input:** `{{BUG}}` — symptom, error text, failing test, or issue link.

Fix the root cause with the smallest diff. Do not guess-and-patch.

## Steps

1. **Reproduce.** Write or run the failing case first (prefer a Vitest test next to the code; `npx vitest run <file>`). If it cannot be reproduced, say so and stop with what you checked.
2. **Locate.** `graft ask "<symptom>" --source`, then read only the cited spans. Trace data from the failing output back to where it first goes wrong — fix there, not where it surfaces.
3. **Explain.** State root cause in 2–3 lines before editing. If the cause is a wrong assumption elsewhere (contract, ask-first area), report instead of improvising.
4. **Fix.** Minimal change that fits existing patterns. No drive-by refactors, no new abstraction, no fallback for impossible cases.
5. **Prove.** The reproducing test fails before and passes after. Add edge cases the bug implies (empty, null, duplicate, concurrent).
6. **Sweep.** Search for the same pattern elsewhere (`graft grep "<literal>"`); fix siblings only if the same defect, and list them.
7. **Gate.** `npm run verify:gate`. Report real output if anything fails.

## Constraints

- Ask first before touching `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`.
- Never disable a lint rule, skip a test, or loosen types to get green.
- Never let AI output set a requirement/finding status.
- Multi-file fix (>2 files): post the plan (files / pattern / verification / `[ASSUMPTION]`s) and wait for approval.

## Output

Root cause · files changed · test added · gate result · related sites found (fixed or not).
