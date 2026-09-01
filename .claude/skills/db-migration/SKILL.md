---
name: db-migration
description: Generate and manage Drizzle ORM database migrations with validation
disable-model-invocation: true
---

# Database Migration Skill

Postgres schema for this repo. Pre-launch: one squashed init plus incremental SQL files.

## Layout

| Path | Role |
|------|------|
| `src/server/db-store/schema.ts` | Drizzle schema (source of truth for types) |
| `drizzle/0000_init.sql` | Full initial schema (tenancy, domain, evidence trigger, jobs) |
| `drizzle/0001_*.sql` | Incremental migrations after squash |
| `scripts/db-migrate.ts` | Applies `.sql` files in filename order |
| `scripts/db-reset.ts` | Wipe + re-apply (local/pre-launch only; requires `--confirm`) |

## Commands

```bash
npm run db:migrate          # Apply pending SQL migrations
npm run db:reset -- --confirm   # Drop all tables and re-run migrations
```

## Adding a migration

1. Edit `schema.ts` if Drizzle types change.
2. Add `drizzle/000N_<short_name>.sql` with the ALTER/CREATE statements.
3. Run `npm run db:migrate` locally (or `db:reset --confirm` if you prefer a clean slate).
4. Record any invariant changes in `docs/ai/architecture.md`.

Do **not** reference `drizzle/migrations/*.ts` — this project uses raw SQL files, not drizzle-kit migrate output.

## Example

```
✅ New migration
================
Created: drizzle/0001_add_foo_index.sql
Apply: npm run db:migrate
Local wipe: npm run db:reset -- --confirm
```
