# Feature plan

**Mode:** read-only (plan only, no edits) · **Request:** `{{FEATURE}}`

Produce a plan to approve before any code is written. Required for changes spanning >2 files or any architecture decision.

## Steps

1. **Ground it.** Read the relevant section of `docs/compliance-engineering-product-spec.md`, `.cursor/rules/product-context.mdc`, and `domain-model.mdc`. Use `graft ask "<topic>" --source` for the existing implementation. Read the Next.js guide in `node_modules/next/dist/docs/` for any framework API you will rely on. The code is the truth; docs may be stale.
2. **Map to the core loop.** Which stage does this serve? If none, challenge whether it belongs.
3. **Find the canonical home.** Which existing module should be extended (not paralleled)? Which ask-first areas (`drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`) would it touch, and is that avoidable?
4. **Check invariants.** Statuses via the domain model; evidence append-only; AI never sets status; tenancy; SSRF; idempotent jobs.
5. **Design the smallest slice** that delivers value; list what is explicitly _not_ included.

## Output

```text
Goal / non-goals
Core-loop stage & spec section
Approach (2–3 options max, with a recommendation and why)
Files: path → change (grouped: schema/db · server · domain · UI · tests · docs)
Data model & migration plan (expand → migrate → contract), if any
Failure modes & edge cases (concurrency, retries, empty states, permissions)
Security & a11y considerations
Verification: tests to write first, commands, manual checks
[ASSUMPTION] items — each phrased as a yes/no question for the owner
Open decisions needing a human
Slicing: ordered, independently shippable steps
```

Stop after the plan and wait for approval. Do not start implementing.
