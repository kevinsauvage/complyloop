# Documentation

Start with [`../README.md`](../README.md) (quick start, core loop), then go
deeper below.

| Doc                                                                                | Audience              | What it covers                                                                            |
| ---------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| [../README.md](../README.md)                                                       | Everyone              | Quick start, core loop, commands                                                          |
| [vercel.md](./vercel.md)                                                           | Operators             | Vercel deploy: GH Actions worker, env, checklists                                         |
| [ai/architecture.md](./ai/architecture.md)                                         | Engineers & agents    | Modules, persistence, analysis engines, key flows                                         |
| [ai/finding-flow.md](./ai/finding-flow.md)                                         | Engineers & designers | Finding page UX contract                                                                  |
| [compliance-engineering-product-spec.md](./compliance-engineering-product-spec.md) | Product               | Who it's for, scope, success                                                              |
| [ai/DESIGN.md](./ai/DESIGN.md)                                                     | Engineers & designers | Product UI/UX principles (advisory; enforceable UI patterns live in `ui-conventions.mdc`) |
| [ai/github-integration-audit.md](./ai/github-integration-audit.md)                 | Product & engineers   | GitHub integration research: capabilities, PR opportunities, Now/Next/Explore (internal)  |
| [../AGENTS.md](../AGENTS.md)                                                       | AI agents             | Repo layout, commands, where rules live                                                   |

Env reference: [../.env.example](../.env.example) (all vars, ordered by setup flow).

**Enforceable rules** for Cursor agents live in [`.cursor/rules/`](../.cursor/rules/) — not duplicated here.
