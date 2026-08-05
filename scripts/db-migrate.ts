#!/usr/bin/env tsx
/**
 * Applies drizzle/0000_init.sql against DATABASE_URL.
 * Usage: DATABASE_URL=postgres://... npm run db:migrate
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const sqlPath = path.join(process.cwd(), "drizzle", "0000_init.sql");
  const body = fs.readFileSync(sqlPath, "utf8");
  const sql = postgres(url, { max: 1 });
  try {
    await sql.unsafe(body);
    console.log("Applied", sqlPath);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
