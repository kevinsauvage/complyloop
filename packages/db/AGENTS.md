# packages/db — agent notes

Drizzle Postgres persistence. Schema source of truth: `src/schema.ts`.

- Concrete `repo/*` functions are the API — no abstract repositories, interfaces-per-table, or DI containers.
- Writes flow through `src/server/workspace/workspace-write.ts` (`withProjectWrite`/`withOrgWrite`/`withConnectWrite`, `persistProjectRows`); actions never call `getDrizzle()`.
- Evidence is insert-only (no update/delete helper). Action writes use a single `loadedSlice` stale-write guard; never revert a newer DB `updatedAt`. Assessments don't use it — they reconcile on rows loaded inside the apply transaction.
- Migrations: raw SQL `drizzle/000N_<name>.sql` applied by `scripts/db-migrate.ts` (`npm run db:migrate`); verify with `npm run test:db`.
