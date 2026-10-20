# packages/db — agent notes

Drizzle Postgres persistence. Schema source of truth: `src/schema.ts`.

- Concrete `repo/*` functions are the API — no abstract repositories, interfaces-per-table, or DI containers.
- Writes flow through `src/server/workspace/workspace-write.ts` (`withProjectTx` for project compliance rows, `withOrgWrite`/`withConnectWrite` for tenancy); actions never call `getDrizzle()`.
- Evidence is insert-only (no update/delete helper). Targeted writes read the rows they mutate inside the project lock, so the lock — not an `updatedAt` comparison — prevents split-brain. Assessment apply reconciles on rows loaded inside its own transaction.
- Migrations: raw SQL `drizzle/000N_<name>.sql` applied by `scripts/db-migrate.ts` (`npm run db:migrate`); verify with `npm run test:db`.
