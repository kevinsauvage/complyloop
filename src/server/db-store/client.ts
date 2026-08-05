import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import { createPostgresClient } from "./postgres-url";
import * as schema from "./schema";

export type DrizzleDb = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let db: DrizzleDb | null = null;
let init: Promise<DrizzleDb> | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function createDrizzleClient(
  connectionString: string,
): Promise<DrizzleDb> {
  const sql = await createPostgresClient(connectionString, { max: 10 });
  return drizzle(sql, { schema });
}

/** Lazy singleton for the app process. */
export async function getDrizzle(): Promise<DrizzleDb> {
  if (db) return db;
  if (!init) {
    init = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      if (!url) {
        throw new Error("DATABASE_URL is not set.");
      }
      client = await createPostgresClient(url, { max: 10 });
      db = drizzle(client, { schema });
      return db;
    })();
  }
  return init;
}

/** Test helper — closes the pool. */
export async function closeDrizzle(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
    init = null;
  }
}
