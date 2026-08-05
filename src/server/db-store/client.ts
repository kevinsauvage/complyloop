import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DrizzleDb = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | null = null;
let db: DrizzleDb | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function createDrizzleClient(connectionString: string): DrizzleDb {
  const sql = postgres(connectionString, {
    max: 10,
    prepare: false,
  });
  return drizzle(sql, { schema });
}

/** Lazy singleton for the app process. */
export function getDrizzle(): DrizzleDb {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!db) {
    client = postgres(url, { max: 10, prepare: false });
    db = drizzle(client, { schema });
  }
  return db;
}

/** Test helper — closes the pool. */
export async function closeDrizzle(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}
