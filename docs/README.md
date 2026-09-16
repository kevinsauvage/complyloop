# Documentation

| Doc                                                                                | Audience              | What it covers                                    |
| ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------- |
| [../README.md](../README.md)                                                       | Everyone              | Quick start, core loop, commands                  |
| [vercel.md](./vercel.md)                                                           | Operators             | Vercel deploy: GH Actions worker, env, checklists |
| [ai/architecture.md](./ai/architecture.md)                                         | Engineers & agents    | Modules, persistence, analysis engines, key flows |
| [ai/finding-flow.md](./ai/finding-flow.md)                                         | Engineers & designers | Finding page UX contract                          |
| [compliance-engineering-product-spec.md](./compliance-engineering-product-spec.md) | Product               | Who it's for, scope, success                      |
| [../AGENTS.md](../AGENTS.md)                                                       | AI agents             | Repo layout, commands, where rules live           |

Env reference: [../.env.example](../.env.example) (all vars, ordered by setup flow).

**Enforceable rules** for Cursor agents live in [`.cursor/rules/`](../.cursor/rules/) — not duplicated here.

> Point-in-time audits (not living docs): [`ai/project-quality-audit-2026-09-15.md`](./ai/project-quality-audit-2026-09-15.md),
> [`superpowers/specs/2026-09-15-single-worker-route-design.md`](./superpowers/specs/2026-09-15-single-worker-route-design.md),
> and the root `TODO-*.md` files. They describe the repo as of Sep 2026 — the
> tables above win on any conflict.
