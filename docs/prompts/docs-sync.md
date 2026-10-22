# Docs sync

**Mode:** edits (docs only) · **Scope:** `{{SCOPE}}` (default: docs affected by `git diff main...HEAD`)

Bring documentation back in line with the code. The code is the source of truth; do not change code to match docs.

## Steps

1. **Map changes to docs.** For each changed module, find the docs that describe it: `docs/ai/architecture.md` (modules, persistence, analysis), `docs/ai/finding-flow.md` (finding UX), `README.md` and `docs/README.md` (commands, index), `AGENTS.md` (stack, commands, boundaries), `.env.example` (env vars, ordered by setup flow), `docs/vercel.md` (deploy/ops), `docs/compliance-engineering-product-spec.md` (scope).
2. **Verify each claim you touch** against the code: commands exist in `package.json`, env vars exist in `src/server/env.ts`, file paths and names resolve, statuses match `domain-model.mdc`.
3. **Fix drift** in the single place that owns the information. Others link to it — never copy rules or lists between docs (`CLAUDE.md` and `AGENTS.md` point, they don't duplicate).
4. **Keep planned vs shipped separate.** `docs/ai/platform-direction.md` describes planned work; never document it as shipped, and never remove it because it isn't built.
5. **Remove** stale sections instead of annotating them; fix broken links.
6. **Run** `npm run format:check` (Prettier) on changed docs.

## Style

Terse and imperative; tables for lookup, prose for rationale. Commands in fenced blocks. State the _why_ for non-obvious rules. No marketing tone, no changelog narration.

## Output

Docs changed (file → what/why) · claims verified against code · drift found but left (needs a decision) · format check result.
