import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env.local or the environment.",
  );
}

export default defineConfig({
  schema: "./src/server/db-store/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
