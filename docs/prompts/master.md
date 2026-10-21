# Master prompt

**Mode:** router · **Task:** `{{TASK}}` · **Scope:** `{{SCOPE}}` (default: `git diff main...HEAD`)

You orchestrate the prompts in `docs/prompts/`. Pick the right ones for the task, run them in order, and report one consolidated result. Do not restate their checklists — open each file and follow it.

## 1. Classify the task

| Task type                            | Run, in order                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New feature / multi-file change      | `feature-plan` → (approval) → implement → `test-gaps` → `pr-review`                                                                                                                                                                                                    |
| Bug report / failing test            | `bug-fix` → `test-gaps` (on the touched files)                                                                                                                                                                                                                         |
| Review a branch or PR                | `pr-review` (it triggers the specialists)                                                                                                                                                                                                                              |
| "Is this safe?" / auth, webhook, URL | `security-review` + `domain-model-check`                                                                                                                                                                                                                               |
| Touches `src/ai/` or AI output       | `ai-boundary-review` + `security-review`                                                                                                                                                                                                                               |
| Touches `drizzle/` or `packages/db`  | `db-migration-review` + `domain-model-check`                                                                                                                                                                                                                           |
| UI change                            | `accessibility-review` + `code-quality`                                                                                                                                                                                                                                |
| Cleanup / tech debt                  | `duplication` → `dead-code` → `refactor`                                                                                                                                                                                                                               |
| Slow page / query / bundle           | `performance-review`                                                                                                                                                                                                                                                   |
| New or upgraded dependency           | `dependency-audit`                                                                                                                                                                                                                                                     |
| Structure / layering doubts          | `architecture-boundaries`                                                                                                                                                                                                                                              |
| Docs drifted                         | `docs-sync`                                                                                                                                                                                                                                                            |
| **Full audit** ("audit everything")  | `security-review` → `bug-hunt` → `domain-model-check` → `ai-boundary-review` → `architecture-boundaries` → `code-quality` → `duplication` → `dead-code` (report only) → `test-gaps` (report only) → `performance-review` → `accessibility-review` → `dependency-audit` |

If the task fits none, or several rows, say which you chose and why in one line. If scope is ambiguous, state your assumption and continue.

## 2. Ground rules (apply to every step)

- Read `AGENTS.md` and the rules in `.cursor/rules/` first. The code is the source of truth; verify claims there.
- Read-only prompts never edit. Edit prompts follow `AGENTS.md` boundaries: ask first for `drizzle/`, `src/core/`, `packages/analysis-core/src/contract/`; multi-file change (>2 files) means plan, then wait for approval.
- High-risk diffs (auth, evidence, status transitions, migrations) need an independent review in a fresh context. Say so instead of self-approving your own implementation.
- Run independent read-only prompts in parallel. When you spawn subagents, only for a full audit or when the user asked, give each one the prompt file path and the scope.
- Edit steps end with `npm run verify:gate`. Report real output on failure.

## 3. Consolidated report

```text
Task / scope / prompts run (and any skipped, with reason)
Verdict: SHIP | SHIP AFTER FIXES | BLOCK
Blocking (deduplicated across prompts, highest severity first):
  [SEVERITY] path:LINE — issue → fix  (source prompt)
Non-blocking: …
Needs a human decision: [ASSUMPTION]s, ask-first areas, ambiguous deletions
Gate: pass/fail
Suggested next prompt: …
```

A finding reported by two prompts appears once. Empty sections are omitted; "no findings" is a valid result.
