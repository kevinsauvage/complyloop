import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { createPostgresClient } from "./postgres-url";
import * as schema from "./schema";

export type DrizzleDb = PostgresJsDatabase<typeof schema>;

/**
 * Free-tier Postgres (Neon/Aiven) often allows ~20 connections with a few
 * reserved for superuser. Keep the pool small; concurrency is serialized by
 * the store write lock anyway.
 */
const POOL_MAX = 3;

type GlobalDb = {
  __complyloopSql?: ReturnType<typeof postgres> | null;
  __complyloopDb?: DrizzleDb | null;
  __complyloopInit?: Promise<DrizzleDb> | null;
};

/** Survive Turbopack/HMR so we do not leak a new pool on every reload. */
const globalForDb = globalThis as typeof globalThis & GlobalDb;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function createDrizzleClient(
  connectionString: string,
): Promise<DrizzleDb> {
  const sql = await createPostgresClient(connectionString, { max: POOL_MAX });
  return drizzle(sql, { schema });
}

/** Lazy singleton for the app process (and across HMR in dev). */
export async function getDrizzle(): Promise<DrizzleDb> {
  if (globalForDb.__complyloopDb) return globalForDb.__complyloopDb;
  if (!globalForDb.__complyloopInit) {
    globalForDb.__complyloopInit = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) {
        throw new Error("DATABASE_URL is not set.");
      }
      globalForDb.__complyloopSql = await createPostgresClient(url, {
        max: POOL_MAX,
      });
      globalForDb.__complyloopDb = drizzle(globalForDb.__complyloopSql, {
        schema,
      });
      return globalForDb.__complyloopDb;
    })().catch((error) => {
      // Allow a later request to retry after a transient pool/slot failure.
      globalForDb.__complyloopInit = null;
      throw error;
    });
  }
  return globalForDb.__complyloopInit;
}

/** Test helper — closes the pool. */
export async function closeDrizzle(): Promise<void> {
  if (globalForDb.__complyloopSql) {
    await globalForDb.__complyloopSql.end({ timeout: 5 });
  }
  globalForDb.__complyloopSql = null;
  globalForDb.__complyloopDb = null;
  globalForDb.__complyloopInit = null;
}
