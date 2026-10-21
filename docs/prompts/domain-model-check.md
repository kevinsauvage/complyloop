# Domain model check

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: `git diff main...HEAD`)

Verify the change respects the compliance domain. Read `.cursor/rules/domain-model.mdc` and `product-context.mdc` first; they are the authority. Do not edit code.

## Check

1. **Canonical statuses** — only the statuses defined in `domain-model.mdc`; no ad-hoc strings, no new status without updating the model and every `switch`. Each `switch` is exhaustive with a `never` default.
2. **Transitions** — every status change goes through the single transition path; guards enforce who/what may move it; illegal transitions are rejected, not coerced.
3. **Source of truth** — status source (`automated` vs `human_review`) is recorded and surfaced where it matters; a human decision is never silently overwritten by a re-scan.
4. **Evidence** — append-only; each evidence row carries provenance (what produced it, commit/ref, timestamp); nothing "re-derives" or edits historical evidence.
5. **Claims** — no code or copy asserts compliance that was not verified; "verified" can only come from the verification path, never from AI or from a client payload.
6. **Vocabulary** — Finding, Requirement, Remediation, Evidence used consistently in code, UI chrome, and docs; no "issue"/"violation" in user-facing chrome.
7. **Multi-domain direction** — anything accessibility-specific (RGAA/WCAG ids, criteria) is isolated so eco-design/performance/security domains can slot in (`docs/ai/platform-direction.md` is _planned_, not shipped — don't build for it, just don't block it).
8. **Idempotency & re-assessment** — re-running an assessment on the same commit yields the same findings and no duplicates; resolved findings that regress reopen with history intact.

## Output

```text
[MUST|SHOULD] path/file.ts:LINE — invariant broken (which rule)
  Scenario: concrete sequence that violates it
  Fix: minimal direction
```

End with `CONSISTENT` or `VIOLATIONS FOUND`. Unclear rule? List it under "model gaps" instead of inventing a rule.
