# Documentation

| Doc                                                                                    | Audience              | What it covers                               |
| -------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------- |
| [../README.md](../README.md)                                                           | Everyone              | Quick start, core loop, commands             |
| [deploy.md](./deploy.md)                                                               | Operators             | Postgres, workers, auth, monitoring, backups |
| [ai/architecture.md](./ai/architecture.md)                                             | Engineers & agents    | Modules, data flow, analysis engines         |
| [ai/finding-flow.md](./ai/finding-flow.md)                                             | Engineers & designers | Finding page UX contract                     |
| [ai/analysis-strategy.md](./ai/analysis-strategy.md)                                   | Engineers & agents    | Analysis engines, what/when to add tooling   |
| [../compliance-engineering-product-spec.md](../compliance-engineering-product-spec.md) | Product               | Vision, principles, MVP scope                |
| [../AGENTS.md](../AGENTS.md)                                                           | AI agents             | Repo layout, commands, where rules live      |
| [../packages/check/README.md](../packages/check/README.md)                             | App developers        | CI gate (`npx complyloop-check`)             |

**Enforceable rules** for Cursor agents live in [`.cursor/rules/`](../.cursor/rules/) — not duplicated here.
