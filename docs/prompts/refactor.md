# Refactor

**Mode:** edits · **Target:** `{{TARGET}}` · **Goal:** `{{GOAL}}` (e.g. split file, remove duplication, clarify naming)

Behavior-preserving only. If you find a bug on the way, report it — do not fix it in the same change.

## Before editing

1. Read the target and its callers (`graft callers <symbol> --depth 2`) to know the blast radius.
2. Confirm tests cover the behavior you will move. If not, add characterization tests **first** and run them green on the untouched code.
3. If the change spans >2 files, or touches `src/core/`, `drizzle/`, or `packages/analysis-core/src/contract/`: output a plan (files / pattern / verification / `[ASSUMPTION]`s) and wait for approval.

## Rules

- Smallest diff that reaches the goal; extend the canonical implementation rather than adding a parallel one. New abstraction only with 2+ call sites.
- Keep public signatures stable, or update every caller in the same change.
- Pure functions in the domain core; side effects at the edges. Dependencies point inward (UI/adapters → core).
- Never add `"use client"` above a file importing `@/server/*` (Server Action modules under `@/server/actions/*` excepted); put interactivity in a client leaf and pass server content as children.
- Use domain vocabulary for names; no barrel re-exports; split files past ~300 lines along responsibility, not line count.
- No opportunistic cleanups outside the stated goal.

## After editing

- Same tests pass unchanged (modifying an existing assertion means behavior changed — stop and reconsider).
- `npx vitest run <touched files>` during work; `npm run verify:gate` at the end.
- Update `docs/ai/architecture.md` only if module boundaries or data flow changed.

## Output

What moved and why · callers updated · tests added/unchanged · gate result · anything deliberately left alone.
