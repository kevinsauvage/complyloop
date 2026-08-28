---
name: db-migration
description: Generate and manage Drizzle ORM database migrations with validation
disable-model-invocation: true
---

# Database Migration Skill

This skill helps generate and manage Drizzle ORM database migrations for the Compliance Engineering Platform.

## Usage

Generate and manage database migrations:

```bash
# Generate a new migration
/db-migration generate --name add_user_preferences

# Apply pending migrations
/db-migration migrate

# Rollback the last migration
/db-migration rollback

# Show migration status
/db-migration status

# Validate migration scripts
/db-migration validate
```

## Implementation

This skill would typically:
1. Generate Drizzle ORM migration scripts based on schema changes
2. Validate migration syntax and safety
3. Apply migrations to the database
4. Provide rollback capabilities
5. Show migration history and status

## Example Usage

```
✅ Database Migration Helper
=========================
Generating migration: add_user_preferences
Created: drizzle/migrations/0003_add_user_preferences.ts
Review the migration before applying.

To apply: /db-migration migrate
```
