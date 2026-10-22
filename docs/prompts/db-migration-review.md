# DB migration review

**Mode:** read-only · **Scope:** `{{SCOPE}}` (default: changes under `drizzle/` and `packages/db`)

`drizzle/` is an **ask-first** area. Review the migration and its schema/repo changes before they ship. Do not edit. To author one, use the `db-migration` skill (raw SQL in `packages/db`).

## Check

1. **Safety on a live DB** — no long table rewrite or `ACCESS EXCLUSIVE` lock on a hot table; `ADD COLUMN NOT NULL` has a default or a backfill plan; indexes on populated tables use `CONCURRENTLY` (and are outside a transaction as required); no destructive `DROP`/type change without an expand → migrate → contract sequence.
2. **Rollout order** — old code runs against the new schema (expand step) and new code against the old schema during deploy; migration runs before the code that needs it (`npm run db:migrate`, `npm run ops:check` pending-migration check).
3. **Evidence invariants** — evidence tables stay insert-only: no UPDATE/DELETE grants, triggers, or `ON DELETE CASCADE` reaching evidence; constraints in `packages/db` tests (`evidence-append-only`) still hold.
4. **Tenancy** — new tables carry the org/project key, FK to it, and queries filter by it; no cross-tenant unique constraint accidents.
5. **Integrity** — FKs, `NOT NULL`, `CHECK`s, and unique constraints encode the domain (status enums match `domain-model.mdc`); idempotent upserts have the right conflict target.
6. **Indexes** — one per real query pattern (check repo queries), none redundant; composite order matches filters then sort; partial indexes for status subsets.
7. **Drizzle sync** — schema TypeScript, SQL file, and journal/snapshot agree; migration is deterministic and re-runnable in CI from empty.
8. **Data** — backfills batched and resumable; no PII added without retention (`retention` repo); timestamps `timestamptz`.
9. **Tests** — covered by the `test:db` integration set; add cases for new constraints.

## Output

`SAFE` / `RISKY` / `BLOCK`, then:

```text
[SEVERITY] path:LINE — problem
  Failure: what breaks, when (deploy, backfill, runtime)
  Fix: minimal direction
```

Include the exact order to deploy (migrate → code → contract step) if it is non-trivial.
