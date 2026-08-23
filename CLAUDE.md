<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` -- verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Claude / agent guide

Shared agent instructions: **[`AGENTS.md`](./AGENTS.md)**. Read that before making changes.

Enforceable product/domain/quality rules: **[`.cursor/rules/`](./.cursor/rules/)**. Architecture detail: **[`docs/ai/architecture.md`](./docs/ai/architecture.md)**. Product decisions: **[`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md)**.

Do not re-expand this file with duplicated stack, layout, or principle lists — update `AGENTS.md` or the relevant `.cursor/rules/*.mdc` instead.
