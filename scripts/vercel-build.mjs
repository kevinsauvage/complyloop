#!/usr/bin/env node
// Vercel build entry. Migrations are production-only: a preview deployment
// pointed at a shared/staging DATABASE_URL must not apply unreviewed SQL
// before review. VERCEL_ENV is always set on Vercel (production/preview/
// development); unset locally, where migrating is expected.
import { execSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;
const shouldMigrate = !vercelEnv || vercelEnv === "production";

if (shouldMigrate) execSync("npm run db:migrate", { stdio: "inherit" });
execSync("npm run build", { stdio: "inherit" });
