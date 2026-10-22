# Duplication audit

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: whole repo excluding `node_modules`, `.next`, `dist`, `coverage`, `graft/`, `drizzle/`)

Find duplicated logic worth consolidating. Do not edit code. Remember the repo rule: a new abstraction needs **2+ call sites** — three similar lines are not a finding; two diverging copies of a rule are.

## Hunt for

1. **Exact and near clones** — same function body with renamed identifiers; copy-pasted components, hooks, Server Actions, query builders, Zod schemas.
2. **Parallel implementations** — two ways to do one job (e.g. two status mappers, two URL/route normalizers, two date/format helpers, two toast patterns instead of `useActionToast`, hand-rolled pagination next to the shared one).
3. **Duplicated domain rules** — status/severity/priority mapping or WCAG/RGAA criterion lookups defined in more than one place; enum values re-declared as string literals instead of imported.
4. **Duplicated types** — hand-written interfaces mirroring Zod schemas or Drizzle rows instead of inferred types.
5. **Duplicated UI** — markup that should be `PageHeader`, `EmptyState`, `page-primitives.tsx`, existing badges/tokens.
6. **Duplicated tests** — fixtures and setup repeated instead of `src/test-fixtures`.
7. **Duplicated config** — the same constant, env name, or threshold in several files.

## Method

Start with `graft grep "<literal>"`, `rg -n` on distinctive literals, and `npx knip` for orphaned copies. Compare candidates side by side; confirm they are _semantically_ the same before reporting. Exclude generated code, deliberate test duplication for clarity, and cases where merging would couple unrelated modules.

## Output

```text
#N  [IMPACT: high|med|low] — what is duplicated
    Sites: path:LINE, path:LINE, …
    Divergence: how the copies already differ (bug risk)
    Consolidate into: existing canonical module, or the one new home (with justification)
    Risk: what could break · Tests covering it: yes/no
```

Rank by divergence risk first, then size. Finish with the top 3 to act on and which prompt to run next (`refactor.md`).
