<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes -- APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` -- verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Claude / agent guide

Pointers only — details live elsewhere.

| Doc | Role |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | Repo orientation, commands, layout |
| [`.cursor/rules/`](./.cursor/rules/) | Enforceable product, domain, quality rules |
| [`docs/ai/architecture.md`](./docs/ai/architecture.md) | System shape & persistence |
| [`compliance-engineering-product-spec.md`](./compliance-engineering-product-spec.md) | Product source of truth |
| [`docs/README.md`](./docs/README.md) | Full doc index |

Do not duplicate stack or principle lists here — update `AGENTS.md` or the relevant rule file.
