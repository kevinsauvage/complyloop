import { config as loadEnv } from "dotenv";
import path from "node:path";
import { getDrizzle } from "./db-store/client";
import { seedCatalog } from "./db-store/repo/catalog";

function loadLocalEnv(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  loadEnv({ path: path.join(process.cwd(), ".env.local") });
  if (!process.env.DATABASE_URL?.trim()) {
    loadEnv({ path: path.join(process.cwd(), ".env") });
  }
}

/** Seeds registered framework adapters — run via `npm run seed` or deploy hook. */
export async function seedDatabaseCatalog(): Promise<void> {
  loadLocalEnv();
  const changed = await seedCatalog(await getDrizzle());
  console.log(changed ? "Catalog seeded." : "Catalog already up to date.");
}

const isMain = process.argv[1]?.endsWith("seed.ts");
if (isMain) {
  seedDatabaseCatalog().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
