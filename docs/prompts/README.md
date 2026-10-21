# Agent prompts

Reusable, copy-paste prompts for AI agents (Claude Code, Cursor, OpenCode). Each file is self-contained: read the header, set the scope, run.

Prompts **point at** the enforceable rules ([`.cursor/rules/`](../../.cursor/rules/), [`AGENTS.md`](../../AGENTS.md)) instead of restating them — update the rule, not the prompt.

## Use

```text
Follow docs/prompts/security-review.md. Scope: src/server/github
```

or, when unsure which prompt fits, `Follow docs/prompts/master.md. Task: <what you want>`; or paste the file body. Scope defaults to `git diff main...HEAD`. For read-only prompts, run in a fresh context (never review your own implementation).

## Index

| Prompt                                                  | Mode      | Use when                                                     |
| ------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| [master](./master.md)                                   | router    | Unsure which prompt fits, or you want a full audit           |
| [security-review](./security-review.md)                 | read-only | Before merging auth, tokens, webhooks, SSRF, SQL, evidence   |
| [bug-hunt](./bug-hunt.md)                               | read-only | Looking for latent defects in a module or diff               |
| [bug-fix](./bug-fix.md)                                 | edits     | A reported bug, failing test, or production error            |
| [code-quality](./code-quality.md)                       | read-only | Review a diff or module against `code-quality.mdc`           |
| [duplication](./duplication.md)                         | read-only | Find duplicated logic, near-clones, parallel implementations |
| [dead-code](./dead-code.md)                             | edits     | Remove unused exports, files, deps, flags                    |
| [refactor](./refactor.md)                               | edits     | Behavior-preserving restructuring                            |
| [test-gaps](./test-gaps.md)                             | edits     | Missing or weak tests on domain core and risky paths         |
| [domain-model-check](./domain-model-check.md)           | read-only | Status transitions, vocabulary, evidence invariants          |
| [ai-boundary-review](./ai-boundary-review.md)           | read-only | Anything touching `src/ai/` or AI-derived data               |
| [accessibility-review](./accessibility-review.md)       | read-only | UI changes — the product must meet its own bar               |
| [performance-review](./performance-review.md)           | read-only | Slow pages, heavy queries, bundle growth                     |
| [db-migration-review](./db-migration-review.md)         | read-only | Any change under `drizzle/` or `packages/db`                 |
| [dependency-audit](./dependency-audit.md)               | read-only | New dependency, upgrade, or periodic audit                   |
| [architecture-boundaries](./architecture-boundaries.md) | read-only | Layering, server/client split, package boundaries            |
| [pr-review](./pr-review.md)                             | read-only | General pre-merge review — runs the others as needed         |
| [feature-plan](./feature-plan.md)                       | read-only | Multi-file change: plan before editing                       |
| [docs-sync](./docs-sync.md)                             | edits     | Docs drifted from code after a change                        |

## Conventions

- **Code is the source of truth.** Prompts tell the agent to verify claims in code, not trust docs or comments.
- **Findings, not essays.** Read-only prompts end with ranked findings (`file:line`, evidence, minimal fix) or an explicit "no findings". No invented issues to look thorough.
- **Gate.** Edit prompts end with `npm run verify:gate` (or the targeted `npx vitest run <file>` during work).
- **Ask-first areas** (`drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`) are never edited without approval — see `AGENTS.md`.
- Add a new prompt by copying an existing one; keep it under ~60 lines and register it in the table above.
