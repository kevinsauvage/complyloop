# Architecture boundaries review

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: `git diff main...HEAD`, or a package/directory)

Verify the change respects the module layout in `docs/ai/architecture.md` and the conventions in `AGENTS.md`, `server-conventions.mdc`, `typescript-conventions.mdc`. Do not edit. The code is the source of truth — if docs and code disagree, report the drift.

## Check

1. **Dependency direction** — `src/core` (kernel) imports nothing from UI/server adapters; `packages/analysis-core` is framework-free and has no imports from `src/`; UI and adapters import from the core, never the reverse; no import cycles (`npx madge --circular` if available, otherwise trace by hand).
2. **Server/client split** — no `"use client"` above a file importing `@/server/*`; interactivity lives in client leaves with server content passed as children/slots; secrets and `server-only` modules never reachable from client bundles; env read via lazy getters.
3. **Persistence access** — Server Actions use `withProjectTx` / `withOrgWrite` / `withConnectWrite` + the concrete `repo/*` functions; no raw `getDrizzle()` in actions; `packages/db` owns schema and queries; evidence insert-only.
4. **Contract stability** — nothing changes `packages/analysis-core/src/contract/` without approval; public exports of the published package stay backward compatible; analysis is deterministic (AST + jsx-a11y + optional runtime), AI is never in the verdict path.
5. **Jobs** — assessment runs through GH Actions `repository_dispatch` + schedule backstop; no long-lived worker process, no Vercel Cron introduced; jobs are idempotent.
6. **Cohesion** — one responsibility per module; no barrel files; no "utils" dumping ground; new shared code has 2+ consumers.
7. **Banned imports** — `@axe-core/playwright` and `ssrf-guard/node` in app code; Radix/`ui/` primitives with <2 consumers; new `sonner` calls outside the centralized toast path.
8. **Docs** — if persistence or system shape changed, `docs/ai/architecture.md` was updated; new stack decisions are in `AGENTS.md`.

## Output

```text
[MUST|SHOULD] path/file.ts:LINE — boundary crossed (rule and where it is defined)
  Why it matters: concrete failure (build break, SSR crash, tenant leak, …)
  Fix: smallest restructuring
```

End with `BOUNDARIES INTACT` or `VIOLATIONS`; list doc drift separately.
