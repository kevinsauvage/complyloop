# Pull request review

**Mode:** read-only · **Scope:** `{{PR_OR_BRANCH}}` (default: `git diff main...HEAD`) · Run in a fresh context, never on your own implementation.

Review for merge-readiness. Do not edit code. Verify claims in code; read the PR description last so it doesn't bias you.

## Steps

1. **Intent** — in 2 lines: what does the diff do, and which core-loop stage (`product-context.mdc`) and product-spec section does it serve? Flag anything out of scope.
2. **Correctness** — walk the changed paths with concrete inputs (use `bug-hunt.md` criteria). Edge cases, error paths, idempotency, concurrency.
3. **Risk triage** — classify: touches auth / evidence / status transitions / migrations / webhooks / AI output? If yes, run the matching specialist prompt and include its verdict:
   - [security-review](./security-review.md) · [domain-model-check](./domain-model-check.md) · [db-migration-review](./db-migration-review.md) · [ai-boundary-review](./ai-boundary-review.md)
4. **Quality** — apply [code-quality](./code-quality.md) and [architecture-boundaries](./architecture-boundaries.md); check duplication against existing code ([duplication](./duplication.md)).
5. **UI changes** — run [accessibility-review](./accessibility-review.md); check states (empty/loading/error) and the finding-page contract.
6. **Tests** — do tests prove the behavior and fail without the change? Domain-core modules and status transitions covered?
7. **Gate** — `npm run verify:gate` result (run it; don't assume). No new lint-disable, skip, or loosened types.
8. **Docs & ops** — `architecture.md` / `.env.example` / `AGENTS.md` updated where the change requires; migrations ordered safely; `ops:check` implications noted.
9. **Size** — could this be split? Mixed refactor + behavior change should be separate.

## Output

```text
Verdict: APPROVE | APPROVE WITH NITS | REQUEST CHANGES | BLOCK
Summary: 2–3 lines
Blocking:   [path:LINE] issue → fix
Non-blocking: [path:LINE] suggestion
Specialist verdicts: security … · domain … · db … · ai … · a11y …
Gate: pass/fail (paste failing output)
```

Prefer fewer, verified findings over a long speculative list. Praise nothing; state only what must change or is notably risky.
